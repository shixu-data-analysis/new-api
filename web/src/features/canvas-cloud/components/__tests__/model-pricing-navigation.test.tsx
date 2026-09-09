/*
Copyright (C) 2023-2026 QuantumNous
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AdminModelCatalog } from '../AdminModelCatalog'

const api = vi.hoisted(() => ({
  models: vi.fn(),
  workspace: vi.fn(),
  detail: vi.fn(),
  issuance: vi.fn(),
}))
vi.mock('../../api', async (original) => ({
  ...(await original<typeof import('../../api')>()),
  getCanvasAdminTestingModels: api.models,
  getCanvasModelPricingWorkspace: api.workspace,
  getCanvasModelPricingModel: api.detail,
  getCanvasPointIssuanceRates: api.issuance,
}))

describe('Model pricing route continuity', () => {
  it('retains list pagination across actual routes and guards the model-bound API Key link', async () => {
    const user = userEvent.setup()
    const model = {
      id: 'model-20',
      modelKey: 'model-20',
      name: 'Series 20',
      capability: 'image.generate',
      status: 'ACTIVE',
      billingUnit: 'REQUEST',
      allowedBillingUnits: ['REQUEST'],
      tokenCategories: [],
      hasPublishedPricing: false,
      hasScheduledPricing: false,
      combinations: [
        { id: 'scope-20', key: 'default', parameters: {}, enabled: true },
      ],
    }
    const group = { id: 'group-1', code: 'STANDARD', internalName: 'Standard' }
    api.models.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        ...model,
        id: `model-${index}`,
        modelKey: `model-${index}`,
        name: `Series ${String(index).padStart(2, '0')}`,
        description: '',
        version: 1,
        presentationVersion: null,
        enabled: true,
        resourceEnabled: true,
        customerVisible: false,
        pricedTargets: 0,
        totalTargets: 1,
        provider: { id: 'provider-1', code: 'provider', name: 'API provider' },
        binding: { status: 'UNBOUND' },
        billingUnits: ['REQUEST'],
        modelIds: [],
        channel: {
          code: 'channel',
          version: 1,
          status: 'ACTIVE',
          executionSnapshot: {},
        },
        publicCatalogSnapshot: { capability: 'image.generate' },
        parameterCombinations: [
          {
            id: `scope-${index}`,
            key: 'default',
            enabled: true,
            normalizedParameters: {},
          },
        ],
        pricingTargets: [],
      }))
    )
    api.workspace.mockResolvedValue({ models: [model], priceGroups: [group] })
    api.detail.mockResolvedValue({
      model,
      priceGroups: [group],
      pricingScopes: [
        {
          parameterCombinationId: 'scope-20',
          combinationKey: 'default',
          parameters: {},
          enabled: true,
          currentProviderRate: null,
          prices: [
            {
              priceGroupId: 'group-1',
              priceGroupCode: 'STANDARD',
              priceGroupName: 'Standard',
              current: null,
            },
          ],
        },
      ],
    })
    api.issuance.mockResolvedValue([
      { status: 'PUBLISHED', pointsPerRmb: '100' },
    ])

    const root = createRootRoute({ component: Outlet })
    const route = createRoute({
      getParentRoute: () => root,
      path: '/canvas-cloud/$section',
      validateSearch: (search: Record<string, unknown>) => ({
        modelId:
          typeof search.modelId === 'string' ? search.modelId : undefined,
      }),
      component: () => {
        const { section } = route.useParams()
        const { modelId } = route.useSearch()
        if (section === 'provider-configuration') {
          return <p>Bindings for {modelId}</p>
        }
        return <AdminModelCatalog initialPricingModelId={modelId} />
      },
    })
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({
        initialEntries: ['/canvas-cloud/catalog'],
      }),
      defaultPendingMinMs: 0,
    })
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const view = render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
    await screen.findByText('Series 00')
    await user.click(screen.getByRole('button', { name: /^Column filters/ }))
    fireEvent.change(screen.getByPlaceholderText('Model'), {
      target: { value: 'Series' },
    })
    await user.click(screen.getByRole('button', { name: /^Column filters/ }))
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    await screen.findByText('Series 20')
    await user.click(screen.getByRole('button', { name: 'Manage prices' }))
    const link = await screen.findByRole('link', {
      name: 'Manage API Key bindings',
    })
    expect(link).toHaveAttribute(
      'href',
      '/canvas-cloud/provider-configuration?modelId=model-20'
    )
    await user.click(screen.getByRole('button', { name: 'Back to model list' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/canvas-cloud/catalog')
    )
    expect(await screen.findByText('Series 20')).toBeVisible()
    expect(screen.queryByText('Series 00')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Column filters/ }))
    expect(screen.getByPlaceholderText('Model')).toHaveValue('Series')
    await user.click(screen.getByRole('button', { name: /^Column filters/ }))

    await user.click(screen.getByRole('button', { name: 'Manage prices' }))
    await user.click((await screen.findAllByTestId('adjust-pricing'))[0])
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.15' },
    })
    await user.click(
      screen.getByRole('link', { name: 'Manage API Key bindings' })
    )
    await user.click(await screen.findByRole('button', { name: 'Stay' }))
    expect(screen.getByLabelText('Service provider cost')).toHaveValue('0.15')
    expect(router.state.location.pathname).toBe('/canvas-cloud/pricing')
    await user.click(
      screen.getByRole('link', { name: 'Manage API Key bindings' })
    )
    await user.click(await screen.findByRole('button', { name: 'Leave' }))
    expect(await screen.findByText('Bindings for model-20')).toBeVisible()
    view.unmount()
    client.clear()
  })
})

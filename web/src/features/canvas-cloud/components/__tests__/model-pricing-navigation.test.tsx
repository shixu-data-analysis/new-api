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
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ModelManagementNavigationProvider } from '../../model-management-navigation'
import { AdminModelCatalog } from '../AdminModelCatalog'
import { UnifiedModelPricing } from '../UnifiedModelPricing'

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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Model pricing route continuity', () => {
  it('retains list pagination across model-management routes and opens its model-bound API Key action', async () => {
    vi.stubGlobal('scrollTo', vi.fn())
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
        executionTargets: [],
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
    const listRoute = createRoute({
      getParentRoute: () => root,
      path: '/canvas-cloud/model-management',
      component: ModelList,
    })
    const pricingRoute = createRoute({
      getParentRoute: () => root,
      path: '/canvas-cloud/model-management/$modelId/pricing',
      component: ModelPricing,
    })
    const bindingsRoute = createRoute({
      getParentRoute: () => root,
      path: '/canvas-cloud/provider-configuration',
      validateSearch: (search: Record<string, unknown>) => ({
        modelId:
          typeof search.modelId === 'string' ? search.modelId : undefined,
      }),
      component: BindingsRoute,
    })
    function BindingsRoute() {
      const modelId = useLocation({
        select: (location) =>
          new URLSearchParams(location.searchStr).get('modelId') ?? '',
      })
      return <p>Bindings for {modelId}</p>
    }
    function ModelList() {
      const navigate = useNavigate()
      return (
        <ModelManagementNavigationProvider>
          <AdminModelCatalog
            onManagePricing={(modelId) =>
              void navigate({
                to: '/canvas-cloud/model-management/$modelId/pricing',
                params: { modelId },
              })
            }
            onManageBindings={(modelId) =>
              void navigate({
                to: '/canvas-cloud/provider-configuration',
                search: { modelId },
              } as never)
            }
          />
        </ModelManagementNavigationProvider>
      )
    }
    function ModelPricing() {
      const navigate = useNavigate()
      const { modelId } = pricingRoute.useParams()
      return (
        <UnifiedModelPricing
          initialModelId={modelId}
          onBack={() => void navigate({ to: '/canvas-cloud/model-management' })}
        />
      )
    }
    const router = createRouter({
      routeTree: root.addChildren([listRoute, pricingRoute, bindingsRoute]),
      history: createMemoryHistory({
        initialEntries: ['/canvas-cloud/model-management'],
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
    await user.click(screen.getByRole('button', { name: 'View' }))
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'API provider' })
    )
    await user.click(screen.getByRole('button', { name: /^Column filters/ }))
    fireEvent.change(screen.getByPlaceholderText('Model'), {
      target: { value: 'Series' },
    })
    await user.click(screen.getByRole('button', { name: /^Column filters/ }))
    await user.click(screen.getByRole('button', { name: 'Go to next page' }))
    await screen.findByText('Series 20')
    await user.click(screen.getByRole('button', { name: 'Manage prices' }))
    await screen.findByText('Series 20')
    await user.click(screen.getByRole('button', { name: 'Back to model list' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/canvas-cloud/model-management'
      )
    )
    expect(await screen.findByText('Series 20')).toBeVisible()
    expect(screen.queryByText('Series 00')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'View' }))
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'API provider' })
    ).toHaveAttribute('aria-checked', 'false')
    await user.click(screen.getByRole('button', { name: 'View' }))
    await user.click(screen.getByRole('button', { name: /^Column filters/ }))
    expect(screen.getByPlaceholderText('Model')).toHaveValue('Series')
    await user.click(screen.getByRole('button', { name: /^Column filters/ }))
    await user.click(
      screen.getByRole('button', { name: 'Manage API Key bindings' })
    )
    expect(await screen.findByText('Bindings for model-20')).toBeVisible()
    view.unmount()
    client.clear()
  })
})

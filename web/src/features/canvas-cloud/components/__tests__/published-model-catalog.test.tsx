/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CanvasAdminTestingModel } from '../../types'
import { PublishedModelCatalog } from '../PublishedModelCatalog'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  publishPresentation: vi.fn(),
  publishTargetPresentation: vi.fn(),
}))

vi.mock('../../api', () => ({
  getCanvasAdminTestingModels: mocks.list,
  publishCanvasModelPresentation: mocks.publishPresentation,
  publishCanvasExecutionTargetPresentation: mocks.publishTargetPresentation,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function executionTarget(
  overrides: Partial<CanvasAdminTestingModel['executionTargets'][number]> = {}
): CanvasAdminTestingModel['executionTargets'][number] {
  return {
    id: '85000000-0000-7000-8000-000000000005',
    channelId: '85000000-0000-7000-8000-000000000010',
    upstreamModelId: 'provider-alpha',
    enabled: true,
    presentationVersion: 3,
    runtimeEnabled: true,
    providerEnabled: true,
    channelEnabled: true,
    effectiveEnabled: true,
    customerVisible: true,
    pricingComplete: true,
    pricingCoverage: [
      {
        priceGroupId: '85000000-0000-7000-8000-000000000006',
        priceGroupCode: 'STANDARD',
        complete: true,
        pricedCombinationIds: ['85000000-0000-7000-8000-000000000007'],
        missingCombinationIds: [],
      },
    ],
    parameterCombinations: [
      {
        id: '85000000-0000-7000-8000-000000000007',
        key: 'quality=1K',
        label: '1K',
        normalizedParameters: { quality: '1K' },
        enabled: true,
      },
    ],
    ...overrides,
  }
}

function model(
  overrides: Partial<CanvasAdminTestingModel> = {}
): CanvasAdminTestingModel {
  return {
    id: '85000000-0000-7000-8000-000000000004',
    modelKey: 'canvas.image.alpha',
    modelIds: [{ quality: null, modelId: 'provider-alpha' }],
    executionTargets: [executionTarget()],
    version: 2,
    name: 'Alpha model',
    description: 'Client description',
    enabled: true,
    resourceEnabled: true,
    presentationVersion: 0,
    status: 'ACTIVE',
    customerVisible: true,
    pricedTargets: 1,
    totalTargets: 1,
    provider: { id: 'provider-official', code: 'official', name: 'Official' },
    binding: {
      status: 'UNBOUND',
      credentialGroupId: null,
      credentialGroupName: null,
      credentialGroupVersionId: null,
      credentialGroupVersion: null,
    },
    billingUnit: null,
    billingUnits: [],
    channel: {
      code: 'official.primary',
      version: 1,
      status: 'ACTIVE',
      protocolAdapter: 'openai',
      upstreamModel: 'alpha',
      executionSnapshot: {},
    },
    publicCatalogSnapshot: { capability: 'image.generate' },
    parameterCombinations: [],
    pricingTargets: [],
    createdAt: '2026-08-27T00:00:00.000Z',
    effectiveAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  }
}

function renderCatalog(
  props: {
    onManageMonitoring?: (modelId: string, targetId: string) => void
  } = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <PublishedModelCatalog onManagePricing={vi.fn()} {...props} />
    </QueryClientProvider>
  )
  return { client, ...view }
}

describe('Published model catalog', () => {
  beforeEach(() => {
    mocks.list.mockReset()
    mocks.publishPresentation.mockReset()
    mocks.publishTargetPresentation.mockReset()
    mocks.list.mockResolvedValue([model()])
    mocks.publishPresentation.mockResolvedValue({ status: 'PUBLISHED' })
    mocks.publishTargetPresentation.mockResolvedValue({ status: 'PUBLISHED' })
  })

  it('keeps identical same-upstream targets separate by their channel IDs', async () => {
    mocks.list.mockResolvedValue([
      model({
        executionTargets: [
          executionTarget(),
          executionTarget({
            id: '85000000-0000-7000-8000-000000000008',
            channelId: '85000000-0000-7000-8000-000000000011',
          }),
        ],
      }),
    ])

    renderCatalog()

    await screen.findByText('Alpha model')
    expect(screen.getAllByText('1K')).toHaveLength(2)
    expect(
      screen.getByText('Channel ID: 85000000-0000-7000-8000-000000000010')
    ).toBeVisible()
    expect(
      screen.getByText('Channel ID: 85000000-0000-7000-8000-000000000011')
    ).toBeVisible()
    expect(screen.getAllByText(/Upstream model ID: provider-alpha/)).toHaveLength(2)
    expect(
      screen.getByRole('switch', {
        name: 'Customer display for Alpha model · 1K · 85000000-0000-7000-8000-000000000011',
      })
    ).toBeVisible()
  })

  it('keeps all parameter combinations of one target under one display switch', async () => {
    mocks.list.mockResolvedValue([
      model({
        executionTargets: [
          executionTarget({
            parameterCombinations: [
              {
                id: '85000000-0000-7000-8000-000000000007',
                key: 'quality=1K',
                label: '1K',
                normalizedParameters: { quality: '1K' },
                enabled: true,
              },
              {
                id: '85000000-0000-7000-8000-000000000009',
                key: 'quality=2K',
                label: '2K',
                normalizedParameters: { quality: '2K' },
                enabled: true,
              },
            ],
          }),
        ],
      }),
    ])

    renderCatalog()

    await screen.findByText('Alpha model')
    expect(screen.getByText('1K · 2K')).toBeVisible()
    expect(screen.getAllByRole('switch')).toHaveLength(1)
  })

  it('publishes only the selected target display switch after confirmation', async () => {
    const targetId = '85000000-0000-7000-8000-000000000005'
    const { client } = renderCatalog()
    const invalidateQueries = vi.spyOn(client, 'invalidateQueries')

    await screen.findByText('Alpha model')
    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Customer display for Alpha model · 1K · 85000000-0000-7000-8000-000000000010',
      })
    )
    const confirmation = screen.getByRole('alertdialog')
    expect(confirmation).toHaveTextContent('1K')
    expect(confirmation).toHaveTextContent('provider-alpha')
    fireEvent.click(
      within(confirmation).getByRole('button', {
        name: 'Turn off display switch',
      })
    )

    await waitFor(() =>
      expect(mocks.publishTargetPresentation).toHaveBeenCalledWith(
        {
          executionTargetId: targetId,
          enabled: false,
          expectedVersion: 3,
        },
        expect.any(Object)
      )
    )
    await waitFor(() =>
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['canvas-cloud', 'model-monitoring-targets', '85000000-0000-7000-8000-000000000004'],
      })
    )
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [
        'canvas-cloud',
        'model-monitoring',
        '85000000-0000-7000-8000-000000000004',
        targetId,
      ],
    })
    expect(mocks.publishPresentation).not.toHaveBeenCalled()
  })

  it('uses version zero when a target has no published presentation yet', async () => {
    mocks.list.mockResolvedValue([
      model({
        executionTargets: [executionTarget({ presentationVersion: null })],
      }),
    ])
    renderCatalog()

    await screen.findByText('Alpha model')
    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Customer display for Alpha model · 1K · 85000000-0000-7000-8000-000000000010',
      })
    )
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Turn off display switch',
      })
    )

    await waitFor(() =>
      expect(mocks.publishTargetPresentation).toHaveBeenCalledWith(
        expect.objectContaining({ expectedVersion: 0 }),
        expect.any(Object)
      )
    )
  })

  it('opens monitoring with both the customer model and execution target identity', async () => {
    const onManageMonitoring = vi.fn()
    renderCatalog({ onManageMonitoring })

    await screen.findByText('Alpha model')
    fireEvent.click(screen.getByRole('button', { name: 'Runtime monitoring' }))

    expect(onManageMonitoring).toHaveBeenCalledWith(
      '85000000-0000-7000-8000-000000000004',
      '85000000-0000-7000-8000-000000000005',
      undefined
    )
  })

  it('keeps shared display publication separate from target visibility', async () => {
    renderCatalog()

    await screen.findByText('Alpha model')
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit display information' })
    )
    fireEvent.change(screen.getByLabelText(/Client display name/), {
      target: { value: 'Renamed Alpha' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }))

    await waitFor(() =>
      expect(mocks.publishPresentation).toHaveBeenCalledWith(
        {
          modelKey: 'canvas.image.alpha',
          displayName: 'Renamed Alpha',
          description: 'Client description',
          expectedVersion: 0,
        },
        expect.any(Object)
      )
    )
  })
})

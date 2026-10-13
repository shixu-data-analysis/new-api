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
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CanvasAdminTestingModel } from '../../types'
import { executionTargetLabel } from '../execution-target-label'
import { PublishedModelCatalog } from '../PublishedModelCatalog'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  tags: vi.fn(),
  publishTargetPresentation: vi.fn(),
  publishParameterCombinationControl: vi.fn(),
}))

vi.mock('../../api', () => ({
  getCanvasAdminTestingModels: mocks.list,
  getCanvasAdminModelTags: mocks.tags,
  publishCanvasExecutionTargetPresentation: mocks.publishTargetPresentation,
  publishCanvasParameterCombinationControl:
    mocks.publishParameterCombinationControl,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function executionTarget(
  overrides: Partial<CanvasAdminTestingModel['executionTargets'][number]> = {}
): CanvasAdminTestingModel['executionTargets'][number] {
  return {
    id: '85000000-0000-7000-8000-000000000005',
    upstreamModelId: 'provider-alpha',
    enabled: true,
    presentationVersion: 3,
    effectiveEnabled: true,
    blockingReasons: [],
    customerVisible: false,
    pricingComplete: false,
    pricingCoverage: [
      {
        priceGroupId: '85000000-0000-7000-8000-000000000006',
        priceGroupCode: 'STANDARD',
        priceGroupName: 'Standard',
        requiredCount: 3,
        pricedCount: 1,
        complete: false,
        customerVisible: false,
        invisibleReasons: ['MISSING_PRICING'],
        pricedCombinationIds: ['85000000-0000-7000-8000-000000000007'],
        missingCombinationIds: [
          '85000000-0000-7000-8000-000000000009',
          '85000000-0000-7000-8000-000000000010',
        ],
      },
    ],
    parameterCombinations: [
      {
        id: '85000000-0000-7000-8000-000000000007',
        key: 'quality=1K',
        label: '1K',
        normalizedParameters: { quality: '1K' },
        enabled: true,
        controlEnabled: true,
      },
      {
        id: '85000000-0000-7000-8000-000000000009',
        key: 'quality=2K',
        label: '2K',
        normalizedParameters: { quality: '2K' },
        enabled: true,
        controlEnabled: true,
      },
      {
        id: '85000000-0000-7000-8000-000000000010',
        key: 'quality=4K',
        label: '4K',
        normalizedParameters: { quality: '4K' },
        enabled: true,
        controlEnabled: true,
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
    tags: [],
    executionTargets: [executionTarget()],
    version: 2,
    effectiveDisplayName: 'Alpha model',
    catalogDefaultName: 'Catalog Alpha model',
    description: 'Client description',
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
    publicCatalogSnapshot: { capability: 'image.generate' },
    parameterCombinations: [],
    pricingTargets: [],
    createdAt: '2026-08-27T00:00:00.000Z',
    effectiveAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  }
}

function renderCatalog(
  onManageBindings?: ComponentProps<
    typeof PublishedModelCatalog
  >['onManageBindings'],
  onEditPresentation = vi.fn()
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <PublishedModelCatalog
        onManagePricing={vi.fn()}
        onManageBindings={onManageBindings}
        onEditPresentation={onEditPresentation}
      />
    </QueryClientProvider>
  )
  return { client, ...view }
}

describe('Published model catalog', () => {
  beforeEach(() => {
    mocks.list.mockReset()
    mocks.tags.mockReset()
    mocks.publishTargetPresentation.mockReset()
    mocks.list.mockResolvedValue([model()])
    mocks.tags.mockResolvedValue([])
    mocks.publishTargetPresentation.mockResolvedValue({ status: 'PUBLISHED' })
    mocks.publishParameterCombinationControl.mockReset()
    mocks.publishParameterCombinationControl.mockResolvedValue({
      status: 'PUBLISHED',
    })
  })

  it('uses backend labels rather than internal parameter keys for target labels', () => {
    const t = (key: string) => ({ '1K': '一千', Default: '默认' })[key] ?? key

    expect(
      executionTargetLabel(
        {
          upstreamModelId: 'provider-alpha',
          parameterCombinations: [{ label: '1K' }, { label: 'Default' }],
        },
        t
      )
    ).toBe('一千 · 默认 · provider-alpha')
  })

  it('opens group management at the bound group or at provider selection for an unbound model', async () => {
    const onManageBindings = vi.fn()
    mocks.list.mockResolvedValue([
      model(),
      model({
        id: 'bound-model',
        modelKey: 'canvas.image.bound',
        effectiveDisplayName: 'Bound model',
        catalogDefaultName: 'Bound model',
        binding: {
          status: 'BOUND',
          credentialGroupId: 'credential-group-1',
          credentialGroupName: 'Primary',
          credentialGroupVersionId: 'credential-version-1',
          credentialGroupVersion: 1,
        },
      }),
    ])
    renderCatalog(onManageBindings)

    const unboundRow = (await screen.findByText('Alpha model')).closest('tr')
    const boundRow = screen
      .getAllByText('Bound model')
      .map((element) => element.closest('tr'))
      .find((row) => row?.dataset.modelGroupRow === 'main')
    if (!unboundRow || !boundRow) {
      throw new Error('Expected both model rows')
    }

    fireEvent.click(
      within(unboundRow).getByRole('button', {
        name: 'Manage API Key bindings',
      })
    )
    expect(onManageBindings).toHaveBeenLastCalledWith(
      { providerId: 'provider-official' },
      undefined
    )

    fireEvent.click(
      within(boundRow).getByRole('button', {
        name: 'Manage API Key bindings',
      })
    )
    expect(onManageBindings).toHaveBeenLastCalledWith(
      {
        providerId: 'provider-official',
        credentialGroupId: 'credential-group-1',
      },
      undefined
    )
  })

  it('keeps the column filter when a model tag changes', async () => {
    mocks.tags.mockResolvedValue([
      {
        id: 'photo',
        name: 'Photography',
        modelCount: 1,
        modelKeys: ['canvas.image.alpha'],
      },
    ])
    mocks.list.mockResolvedValue([
      model({ tags: [{ id: 'photo', name: 'Photography' }] }),
      model({
        id: 'second',
        modelKey: 'second',
        effectiveDisplayName: 'Second model',
        catalogDefaultName: 'Catalog Second model',
        tags: [],
        executionTargets: [
          executionTarget({
            id: 'second-target',
            upstreamModelId: 'provider-second',
          }),
        ],
      }),
    ])
    renderCatalog()
    await screen.findByText('Alpha model')
    expect(
      screen.getByRole('button', { name: 'All categories 2' })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    fireEvent.change(screen.getByPlaceholderText('Model'), {
      target: { value: 'Alpha' },
    })
    expect(
      screen.getByRole('button', { name: 'All categories 1' })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'No category 0' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Photography 1' }))
    expect(screen.getByText('Alpha model')).toBeVisible()
    expect(screen.queryByText('Second model')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'No category 0' }))
    expect(screen.queryByText('Second model')).not.toBeInTheDocument()
  })

  it('derives generation type and API provider groups from the current catalog and combines them with column filters', async () => {
    mocks.list.mockResolvedValue([
      model(),
      model({
        id: 'video-model',
        modelKey: 'canvas.video.beta',
        effectiveDisplayName: 'Beta video',
        catalogDefaultName: 'Catalog Beta video',
        publicCatalogSnapshot: { capability: 'video.generate' },
        provider: { id: 'partner', code: 'partner', name: 'Partner API' },
      }),
      model({
        id: 'image-model',
        modelKey: 'canvas.image.gamma',
        effectiveDisplayName: 'Gamma image',
        catalogDefaultName: 'Catalog Gamma image',
        provider: { id: 'partner', code: 'partner', name: 'Partner API' },
      }),
    ])
    renderCatalog()
    await screen.findByText('Gamma image')
    expect(
      screen.getByRole('columnheader', { name: 'Generation type' })
    ).toBeVisible()

    const types = within(screen.getByRole('group', { name: 'Generation type' }))
    const providers = within(
      screen.getByRole('group', { name: 'API provider' })
    )
    expect(types.getByRole('button', { name: 'video.generate' })).toBeVisible()
    expect(providers.getByRole('button', { name: 'Partner API' })).toBeVisible()
    fireEvent.click(types.getByRole('button', { name: 'image.generate' }))
    fireEvent.click(providers.getByRole('button', { name: 'Partner API' }))
    expect(screen.getByText('Gamma image')).toBeVisible()
    expect(screen.queryByText('Alpha model')).not.toBeInTheDocument()
    expect(screen.queryByText('Beta video')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    expect(screen.queryByPlaceholderText('Capability')).not.toBeInTheDocument()
    expect(
      screen.queryByPlaceholderText('API provider')
    ).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Model'), {
      target: { value: 'no match' },
    })
    expect(screen.queryByText('Gamma image')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('Gamma image')).toBeVisible()
    expect(
      providers.getByRole('button', { name: 'Partner API' })
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(
      providers.getByRole('button', { name: 'All API providers' })
    )
    expect(screen.getByText('Alpha model')).toBeVisible()
    expect(
      types.getByRole('button', { name: 'image.generate' })
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps identical upstream targets separate without exposing internal routing facts', async () => {
    mocks.list.mockResolvedValue([
      model({
        executionTargets: [
          executionTarget(),
          executionTarget({
            id: '85000000-0000-7000-8000-000000000008',
          }),
        ],
      }),
    ])

    renderCatalog()

    await screen.findByText('Alpha model')
    expect(screen.getAllByText('1K · 2K · 4K')).toHaveLength(2)
    expect(screen.getAllByText('provider-alpha').length).toBeGreaterThanOrEqual(
      2
    )
    expect(
      screen.getAllByRole('switch', {
        name: 'Customer display for Alpha model · 1K · 2K · 4K · provider-alpha',
      })
    ).toHaveLength(2)
    expect(
      screen.queryByText(/85000000-0000-7000-8000-000000000010/)
    ).toBeNull()
  })

  it('adds one specification switch per specification under the target display switch', async () => {
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
                controlEnabled: true,
              },
              {
                id: '85000000-0000-7000-8000-000000000009',
                key: 'quality=2K',
                label: '2K',
                normalizedParameters: { quality: '2K' },
                enabled: true,
                controlEnabled: true,
              },
            ],
          }),
        ],
      }),
    ])

    renderCatalog()

    await screen.findByText('Alpha model')
    expect(screen.getByText('1K · 2K')).toBeVisible()
    expect(
      screen.getByRole('switch', {
        name: 'Customer display for Alpha model · 1K · 2K · provider-alpha',
      })
    ).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Enable switch for specification 1K' })
    ).toBeChecked()
    expect(
      screen.getByRole('switch', { name: 'Enable switch for specification 2K' })
    ).toBeChecked()
  })

  it('shows no specification switch for a single-specification target', async () => {
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
                controlEnabled: true,
              },
            ],
          }),
        ],
      }),
    ])

    renderCatalog()

    await screen.findByText('Alpha model')
    expect(screen.getAllByRole('switch')).toHaveLength(1)
  })

  it('disables the specification switches while the target display switch is off', async () => {
    mocks.list.mockResolvedValue([
      model({ executionTargets: [executionTarget({ enabled: false })] }),
    ])

    renderCatalog()

    await screen.findByText('Alpha model')
    for (const specification of ['1K', '2K', '4K']) {
      expect(
        screen.getByRole('switch', {
          name: `Enable switch for specification ${specification}`,
        })
      ).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('disables one specification after confirmation without a reason', async () => {
    const { client } = renderCatalog()
    const invalidateQueries = vi.spyOn(client, 'invalidateQueries')

    await screen.findByText('Alpha model')
    fireEvent.click(
      screen.getByRole('switch', { name: 'Enable switch for specification 1K' })
    )
    const confirmation = screen.getByRole('alertdialog')
    expect(
      within(confirmation).getByText('Disable specification?')
    ).toBeVisible()
    expect(confirmation).toHaveTextContent('1K · 2K · 4K · provider-alpha')
    expect(confirmation).toHaveTextContent(
      'Specification enabled state → Specification disabled state'
    )
    expect(confirmation).not.toHaveTextContent(
      'This is the last enabled specification'
    )
    expect(
      within(confirmation).getByLabelText('Reason (optional)')
    ).toHaveValue('')
    fireEvent.click(
      within(confirmation).getByRole('button', {
        name: 'Disable specification',
      })
    )

    await waitFor(() =>
      expect(mocks.publishParameterCombinationControl).toHaveBeenCalledWith(
        {
          parameterCombinationId: '85000000-0000-7000-8000-000000000007',
          enabled: false,
          reason: '',
        },
        expect.any(Object)
      )
    )
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['canvas-cloud', 'admin-testing-models'],
    })
  })

  it('warns that disabling the last enabled specification hides the whole target', async () => {
    const combinations = executionTarget().parameterCombinations.map(
      (combination, index) => ({ ...combination, controlEnabled: index === 0 })
    )
    mocks.list.mockResolvedValue([
      model({
        executionTargets: [
          executionTarget({ parameterCombinations: combinations }),
        ],
      }),
    ])
    renderCatalog()

    await screen.findByText('Alpha model')
    fireEvent.click(
      screen.getByRole('switch', { name: 'Enable switch for specification 1K' })
    )

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'This is the last enabled specification of this target'
    )
  })

  it('restores a disabled unpriced specification with the reason and the pricing hint', async () => {
    const combinations = executionTarget().parameterCombinations.map(
      (combination) => ({
        ...combination,
        controlEnabled: combination.label !== '2K',
      })
    )
    mocks.list.mockResolvedValue([
      model({
        executionTargets: [
          executionTarget({ parameterCombinations: combinations }),
        ],
      }),
    ])
    renderCatalog()

    expect(await screen.findByText('Disabled specifications: 2K')).toBeVisible()
    fireEvent.click(
      screen.getByRole('switch', { name: 'Enable switch for specification 2K' })
    )
    const confirmation = screen.getByRole('alertdialog')
    expect(
      within(confirmation).getByText('Restore specification?')
    ).toBeVisible()
    expect(confirmation).toHaveTextContent(
      'Specification disabled state → Specification enabled state'
    )
    expect(confirmation).toHaveTextContent('It has no price yet')
    fireEvent.change(within(confirmation).getByLabelText('Reason (optional)'), {
      target: { value: 'Provider resumed 2K' },
    })
    fireEvent.click(
      within(confirmation).getByRole('button', {
        name: 'Restore specification',
      })
    )

    await waitFor(() =>
      expect(mocks.publishParameterCombinationControl).toHaveBeenCalledWith(
        {
          parameterCombinationId: '85000000-0000-7000-8000-000000000009',
          enabled: true,
          reason: 'Provider resumed 2K',
        },
        expect.any(Object)
      )
    )
  })

  it('lists disabled specifications even when no price plan is published', async () => {
    const combinations = executionTarget().parameterCombinations.map(
      (combination) => ({
        ...combination,
        controlEnabled: combination.label !== '4K',
      })
    )
    mocks.list.mockResolvedValue([
      model({
        executionTargets: [
          executionTarget({
            pricingCoverage: [],
            parameterCombinations: combinations,
          }),
        ],
      }),
    ])

    renderCatalog()

    expect(await screen.findByText('No published price plans')).toBeVisible()
    expect(screen.getByText('Disabled specifications: 4K')).toBeVisible()
  })

  it('keeps the dialog open with an error when the specification change fails', async () => {
    mocks.publishParameterCombinationControl.mockRejectedValue(
      new Error('conflict')
    )
    renderCatalog()

    await screen.findByText('Alpha model')
    fireEvent.click(
      screen.getByRole('switch', { name: 'Enable switch for specification 4K' })
    )
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Disable specification',
      })
    )

    expect(
      await within(screen.getByRole('alertdialog')).findByRole('alert')
    ).toHaveTextContent(
      'Specification change failed. Refresh the model list before retrying.'
    )
  })

  it('shows missing 2K and 4K specifications for a three-quality target with one priced combination', async () => {
    mocks.list.mockResolvedValue([
      model({
        executionTargets: [
          executionTarget({
            pricingCoverage: [
              {
                priceGroupId: '85000000-0000-7000-8000-000000000006',
                priceGroupCode: 'STANDARD',
                priceGroupName: 'Standard',
                requiredCount: 3,
                pricedCount: 1,
                complete: false,
                customerVisible: false,
                invisibleReasons: ['MISSING_PRICING'],
                pricedCombinationIds: ['85000000-0000-7000-8000-000000000007'],
                missingCombinationIds: [
                  '85000000-0000-7000-8000-000000000009',
                  '85000000-0000-7000-8000-000000000010',
                ],
              },
            ],
          }),
        ],
      }),
    ])

    renderCatalog()

    expect(
      await screen.findByText(
        'Price plan: Standard · 1/3 Not shown to customers'
      )
    ).toBeVisible()
    expect(screen.getByText('No price plans visible (0/1)')).toBeVisible()
    expect(screen.getByText('Reason: Missing pricing')).toBeVisible()
    expect(screen.getByText('Missing specifications: 2K · 4K')).toBeVisible()
  })

  it('keeps the raw catalog configuration in its own model-table column', async () => {
    renderCatalog()

    expect(
      await screen.findByText('Original catalog configuration')
    ).toBeVisible()
    expect(await screen.findByText('Alpha model')).toBeVisible()
    expect(screen.getByText('Alpha model').closest('td')).not.toHaveTextContent(
      'Original catalog configuration'
    )
  })

  it('publishes only the selected target display switch after confirmation', async () => {
    const targetId = '85000000-0000-7000-8000-000000000005'
    const { client } = renderCatalog()
    const invalidateQueries = vi.spyOn(client, 'invalidateQueries')

    await screen.findByText('Alpha model')
    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Customer display for Alpha model · 1K · 2K · 4K · provider-alpha',
      })
    )
    const confirmation = screen.getByRole('alertdialog')
    expect(confirmation).toHaveTextContent('1K · 2K · 4K')
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
        queryKey: [
          'canvas-cloud',
          'model-monitoring-targets',
          '85000000-0000-7000-8000-000000000004',
        ],
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
        name: 'Customer display for Alpha model · 1K · 2K · 4K · provider-alpha',
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

  it('keeps execution target rows focused on display controls after monitoring moves to its own tab', async () => {
    renderCatalog()
    await screen.findByText('Alpha model')
    expect(
      screen.queryByRole('button', { name: 'Runtime monitoring' })
    ).not.toBeInTheDocument()
  })

  it('opens the client presentation tab for the model when editing display information', async () => {
    const onEditPresentation = vi.fn()
    renderCatalog(undefined, onEditPresentation)

    await screen.findByText('Alpha model')
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit display information' })
    )

    expect(onEditPresentation).toHaveBeenCalledWith('canvas.image.alpha')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('searches current models by names, model key, and every upstream model ID', async () => {
    mocks.list.mockResolvedValue([
      model({
        executionTargets: [
          executionTarget(),
          executionTarget({
            id: '85000000-0000-7000-8000-000000000099',
            upstreamModelId: 'provider-alpha-alternate',
          }),
        ],
      }),
    ])
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    const search = screen.getByPlaceholderText('Model')

    fireEvent.change(search, { target: { value: 'Catalog Alpha' } })
    expect(screen.getByText('Alpha model')).toBeVisible()
    fireEvent.change(search, { target: { value: 'canvas.image.alpha' } })
    expect(screen.getByText('Alpha model')).toBeVisible()
    fireEvent.change(search, {
      target: { value: 'provider-alpha-alternate' },
    })
    expect(screen.getByText('Alpha model')).toBeVisible()
    fireEvent.change(search, { target: { value: '' } })
    fireEvent.change(screen.getByPlaceholderText('Upstream model ID'), {
      target: { value: 'provider-alpha-alternate' },
    })
    expect(screen.getByText('Alpha model')).toBeVisible()
  })

  it('keeps each model in one tbody with main, detail, and 11px spacer rows', async () => {
    const { container } = renderCatalog()
    await screen.findByText('Alpha model')

    const body = container.querySelector('tbody')
    expect(body).not.toBeNull()
    expect(
      container.querySelector('.model-management-group-table')
    ).not.toBeNull()
    const main = body?.querySelector('[data-model-group-row="main"]')
    const details = body?.querySelector('[data-model-group-row="details"]')
    const spacer = body?.querySelector('[data-model-group-row="spacer"]')
    expect(main?.nextElementSibling).toBe(details)
    expect(details?.nextElementSibling).toBe(spacer)
    expect(main).toHaveClass('!h-auto', 'border-b-0')
    expect(details).toHaveClass('!h-auto', 'border-b-0')
    expect(spacer).toHaveClass('!h-[11px]', 'border-0')
    expect(details?.querySelector('td')).toHaveClass(
      'before:right-4',
      'before:left-4'
    )
    expect(main).toHaveClass('model-management-group-main')
    expect(details).toHaveClass('model-management-group-details')
    const targetTable = details?.querySelector('.model-management-target-table')
    expect(targetTable).not.toBeNull()
    expect(targetTable?.querySelector('tbody > tr')).toHaveClass(
      'bg-card',
      'hover:!bg-card'
    )
  })
})

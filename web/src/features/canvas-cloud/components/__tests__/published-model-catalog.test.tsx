import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CanvasAdminTestingModel } from '../../types'
import { PublishedModelCatalog } from '../PublishedModelCatalog'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  publish: vi.fn(),
  groups: vi.fn(),
}))

vi.mock('../../api', () => ({
  getCanvasAdminTestingModels: mocks.list,
  publishCanvasModelPresentation: mocks.publish,
  getCanvasPriceGroups: mocks.groups,
}))

function model(
  overrides: Partial<CanvasAdminTestingModel>
): CanvasAdminTestingModel {
  return {
    id: '85000000-0000-7000-8000-000000000004',
    modelKey: 'canvas.image.alpha',
    modelIds: [{ quality: null, modelId: 'provider-alpha' }],
    version: 2,
    name: 'Alpha model',
    description: 'Client description',
    enabled: true,
    resourceEnabled: true,
    presentationVersion: null,
    status: 'ACTIVE',
    customerVisible: false,
    pricedTargets: 0,
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

function coverageModel(
  pricedByPlan: string[][],
  overrides: Partial<CanvasAdminTestingModel> = {}
) {
  const scopes = ['1K', '2K', '4K'].map((quality) => ({
    id: quality,
    key: quality,
    enabled: true,
    normalizedParameters: { quality },
    billingDimensionsSnapshot: {},
  }))
  const targets = pricedByPlan.flatMap((priced, plan) =>
    scopes.map((scope) => ({
      priceGroupId: `plan-${plan}`,
      priceGroupCode: `plan-${plan}`,
      priceGroupName: `Plan ${plan}`,
      priceGroupVersion: 1,
      parameterCombinationId: scope.id,
      combinationKey: scope.key,
      priced: priced.includes(scope.id),
      priceVersionId: priced.includes(scope.id)
        ? `price-${plan}-${scope.id}`
        : null,
      priceVersion: priced.includes(scope.id) ? 1 : null,
      points: priced.includes(scope.id) ? '60' : null,
    }))
  )
  return model({
    parameterCombinations: scopes,
    pricingTargets: targets,
    pricedTargets: targets.filter((target) => target.priced).length,
    totalTargets: targets.length,
    ...overrides,
  })
}

function renderCatalog(onManagePricing = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PublishedModelCatalog onManagePricing={onManagePricing} />
    </QueryClientProvider>
  )
}

function customerDisplaySwitch(modelName = 'Alpha model') {
  return screen.getByRole('switch', {
    name: `Customer display for ${modelName}`,
  })
}

function editDisplayButton() {
  return screen.getAllByRole('button', {
    name: 'Edit display information',
  })[0]
}

function modelRow(modelName = 'Alpha model') {
  const row = screen
    .getAllByText(modelName)
    .map((element) => element.closest('tr'))
    .find(Boolean)
  if (!row) throw new Error(`${modelName} row is missing`)
  return row
}

describe('Published model catalog', () => {
  it('shows visibility separately from known reasons without inferring a pricing failure', async () => {
    mocks.list.mockResolvedValue([
      model({ name: 'Visible model', customerVisible: true }),
      model({
        id: 'hidden',
        name: 'Hidden model',
        pricedTargets: 1,
        totalTargets: 1,
      }),
      model({ id: 'off', name: 'Off model', enabled: false }),
      model({
        id: 'technical',
        name: 'Technical model',
        resourceEnabled: false,
      }),
    ])
    renderCatalog()
    await screen.findByText('Visible model')
    expect(screen.getAllByText('Not displayed')).toHaveLength(2)
    expect(screen.getByText('Visible to customers')).toBeVisible()
    expect(screen.queryByText('Pricing incomplete')).not.toBeInTheDocument()
    const row = screen.getByText('Hidden model').closest('tr')
    if (!row) throw new Error('Hidden model row is missing')
    await userEvent
      .setup()
      .hover(within(row).getByRole('button', { name: 'Why not displayed' }))
    expect(
      await screen.findByText('No enabled parameter combinations')
    ).toBeVisible()
  })

  beforeEach(() => {
    mocks.groups.mockReset()
    mocks.groups.mockResolvedValue([])
    mocks.list.mockReset()
    mocks.publish.mockReset()
    mocks.publish.mockResolvedValue({ status: 'PUBLISHED' })
    mocks.list.mockResolvedValue([
      model({
        modelIds: [
          { quality: '1K', modelId: 'provider-alpha-1k' },
          { quality: '2K', modelId: 'provider-alpha-2k' },
        ],
      }),
      model({
        id: '85000000-0000-7000-8000-000000000005',
        modelKey: 'canvas.video.zeta',
        modelIds: [{ quality: null, modelId: 'provider-zeta' }],
        name: 'Zeta model',
        version: 1,
        publicCatalogSnapshot: { capability: 'video.generate' },
      }),
    ])
  })

  it('accepts one complete plan without requiring other plans to be priced', async () => {
    mocks.list.mockResolvedValue([
      coverageModel([['1K', '2K', '4K'], []], { customerVisible: true }),
      coverageModel([['1K', '2K', '4K'], []], {
        id: 'off',
        name: 'Display off model',
        enabled: false,
      }),
    ])
    renderCatalog()
    await screen.findByText('Alpha model')
    expect(screen.getByText('Visible to customers')).toBeVisible()
    expect(screen.getAllByText('Priced 3 / 6 targets')).toHaveLength(2)
    expect(
      screen.getByRole('switch', { name: 'Customer display for Display off model' })
    ).not.toBeChecked()
    expect(
      screen.queryByText(
        'No price plan covers all enabled parameter combinations'
      )
    ).not.toBeInTheDocument()
  })

  it('does not combine coverage across price plans', async () => {
    mocks.list.mockResolvedValue([coverageModel([['1K'], ['2K', '4K']])])
    renderCatalog()
    await screen.findByText('Alpha model')
    await userEvent
      .setup()
      .hover(screen.getByRole('button', { name: 'Why not displayed' }))
    expect(
      await screen.findByText(
        'No price plan covers all enabled parameter combinations'
      )
    ).toBeVisible()
    expect(screen.getByText('Not displayed')).toBeVisible()
  })

  it('does not infer missing price plans from an empty set of enabled combinations', async () => {
    mocks.groups.mockResolvedValue([
      {
        id: 'plan',
        status: 'PUBLISHED',
        effectiveAt: '2020-01-01T00:00:00.000Z',
      },
    ])
    mocks.list.mockResolvedValue([model({})])
    renderCatalog()
    await screen.findByText('Alpha model')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Why not displayed' }))
    expect(
      await screen.findByText('No enabled parameter combinations')
    ).toBeVisible()
    await waitFor(() => expect(mocks.groups).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('No published price plans', { selector: 'li' })
    ).not.toBeInTheDocument()
  })

  it('shows only the switch for a closed model and asks before enabling it', async () => {
    mocks.list.mockResolvedValue([
      model({ enabled: false, resourceEnabled: false }),
    ])
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(customerDisplaySwitch())
    expect(screen.queryByText('Not displayed')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Why not displayed' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Turn on display switch?'
    )
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Display switch off state → Display switch on state'
    )
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'When enabled, the model is shown to customers only when technical and pricing conditions are met.'
    )
  })

  it('sorts the whole result set by each selected column before pagination', async () => {
    renderCatalog()
    await screen.findByText('Alpha model')
    expect(screen.getAllByText('Technical information')).toHaveLength(2)
    expect(
      screen.queryByText('85000000-0000-7000-8000-000000000004')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('canvas.image.alpha')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Column filters' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'View' })).toBeVisible()
    expect(
      screen.getByRole('combobox', { name: 'Rows per page' })
    ).toBeVisible()
    const rows = screen
      .getByRole('columnheader', { name: 'Model', exact: true })
      .closest('table')?.rows
    if (!rows) throw new Error('Model list table is missing')
    expect(rows[1]).toHaveTextContent('Alpha model')
    expect(rows[2]).toHaveTextContent('Zeta model')

    expect(
      screen.getByRole('button', { name: 'Pricing coverage' })
    ).toBeVisible()
  })

  it('searches published models by provider model ID instead of internal identifiers', async () => {
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    const search = screen.getByPlaceholderText('Upstream model ID')

    fireEvent.change(search, { target: { value: 'provider-zeta' } })
    expect(screen.queryByText('Alpha model')).not.toBeInTheDocument()
    expect(screen.getByText('Zeta model')).toBeVisible()

    fireEvent.change(search, { target: { value: 'canvas.image.alpha' } })
    expect(screen.queryByText('Alpha model')).not.toBeInTheDocument()
    expect(screen.queryByText('Zeta model')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '000000000004' } })
    expect(screen.queryByText('Alpha model')).not.toBeInTheDocument()
    expect(screen.queryByText('Zeta model')).not.toBeInTheDocument()
  })

  it('filters the actual API provider and localized capability independently', async () => {
    mocks.list.mockResolvedValue([
      model({
        provider: { id: 'provider-direct', code: 'direct', name: 'Direct API' },
      }),
      model({
        id: 'another-model',
        name: 'Video model',
        provider: {
          id: 'provider-gateway',
          code: 'gateway',
          name: 'Gateway API',
        },
        publicCatalogSnapshot: { capability: 'video.generate' },
      }),
    ])
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    fireEvent.change(screen.getByPlaceholderText('API provider'), {
      target: { value: 'gateway' },
    })
    expect(screen.queryByText('Alpha model')).not.toBeInTheDocument()
    expect(screen.getByText('Video model')).toBeVisible()
    fireEvent.change(screen.getByPlaceholderText('Capability'), {
      target: { value: 'image' },
    })
    expect(screen.queryByText('Video model')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('API provider'), {
      target: { value: '' },
    })
    expect(screen.getByText('Alpha model')).toBeVisible()
  })

  it('shows billing units and minimal technical information without binding details', async () => {
    const selected = model({
      billingUnit: 'SECOND',
      billingUnits: ['SECOND'],
      binding: {
        status: 'BOUND',
        credentialGroupId: 'group-id',
        credentialGroupName: 'Video API group',
        credentialGroupVersionId: 'group-version-id',
        credentialGroupVersion: 3,
      },
      parameterCombinations: [
        {
          id: 'scope-id',
          key: 'duration-10',
          enabled: true,
          normalizedParameters: { duration: 10 },
          billingDimensionsSnapshot: {},
        },
      ],
    })
    mocks.list.mockResolvedValue([selected])
    renderCatalog()
    await screen.findByText('Alpha model')
    expect(screen.getByText('SECOND')).toBeVisible()
    fireEvent.click(screen.getByText('Technical information'))
    expect(screen.queryByText(/Video API group/)).not.toBeInTheDocument()
    expect(screen.queryByText(/duration: 10/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Manage API Key bindings' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Model developer')).not.toBeInTheDocument()
  })

  it('publishes client display edits without sending Bundle or pricing fields', async () => {
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(editDisplayButton())
    fireEvent.change(screen.getByLabelText(/Client display name/), {
      target: { value: '阿尔法模型' },
    })
    fireEvent.change(screen.getByLabelText(/Client description/), {
      target: { value: '面向客户端的新说明' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }))

    await waitFor(() =>
      expect(mocks.publish).toHaveBeenCalledWith(
        {
          modelKey: 'canvas.image.alpha',
          displayName: '阿尔法模型',
          description: '面向客户端的新说明',
          enabled: true,
          expectedVersion: 0,
        },
        expect.anything()
      )
    )
  })

  it('keeps an unchanged display draft disabled and shows field validation after blur', async () => {
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(editDisplayButton())
    const save = screen.getByRole('button', { name: 'Save and publish' })
    expect(save).toBeDisabled()
    const name = screen.getByLabelText(/Client display name/)
    fireEvent.change(name, { target: { value: ' ' } })
    fireEvent.blur(name)
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByRole('alert')).toHaveTextContent('Required')
  })

  it('requires confirmation and publishes a version-protected customer display change', async () => {
    mocks.list
      .mockResolvedValueOnce([coverageModel([['1K'], []])])
      .mockResolvedValue([
        coverageModel([['1K'], []], { enabled: false, presentationVersion: 1 }),
      ])
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(customerDisplaySwitch())
    expect(screen.getByText('Turn off display switch?')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Display switch on state → Display switch off state'
    )
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Turn off display switch',
      })
    )

    await waitFor(() =>
      expect(mocks.publish).toHaveBeenCalledWith(
        {
          modelKey: 'canvas.image.alpha',
          displayName: 'Alpha model',
          description: 'Client description',
          enabled: false,
          expectedVersion: 0,
        },
        expect.anything()
      )
    )
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )
    expect(mocks.list).toHaveBeenCalledTimes(2)
    expect(customerDisplaySwitch()).not.toBeChecked()
  })

  it('opens display confirmation from Space without changing the controlled switch early', async () => {
    renderCatalog()
    await screen.findByText('Alpha model')
    const toggle = customerDisplaySwitch()
    toggle.focus()
    await userEvent.setup().keyboard(' ')

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Turn off display switch?'
    )
    expect(toggle).toBeChecked()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it('asks before discarding an edited presentation draft', async () => {
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(editDisplayButton())
    fireEvent.change(screen.getByLabelText(/Client display name/), {
      target: { value: 'Changed Alpha' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    const discard = await screen.findByRole('alertdialog', {
      name: 'Discard changes?',
    })
    fireEvent.click(within(discard).getByRole('button', { name: 'Cancel' }))
    expect(
      screen.getByRole('dialog', { name: 'Edit model display information' })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(
      within(
        await screen.findByRole('alertdialog', { name: 'Discard changes?' })
      ).getByRole('button', {
        name: 'Discard changes',
      })
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Edit model display information' })
      ).not.toBeInTheDocument()
    )
  })

  it('locks presentation controls while publishing', async () => {
    let resolvePublish: (() => void) | undefined
    mocks.publish.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePublish = resolve
        })
    )
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(editDisplayButton())
    fireEvent.change(screen.getByLabelText(/Client display name/), {
      target: { value: 'Changed Alpha' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText(/Client display name/)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    resolvePublish?.()
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Edit model display information' })
      ).not.toBeInTheDocument()
    )
  })

  it('disables the switch and both row actions while a display publication is pending', async () => {
    let resolvePublish: (() => void) | undefined
    mocks.publish.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePublish = resolve
        })
    )
    const pricing = vi.fn()
    renderCatalog(pricing)
    await screen.findByText('Alpha model')
    const toggle = customerDisplaySwitch()
    fireEvent.click(toggle)
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Turn off display switch',
      })
    )
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))

    const pendingRow = modelRow()
    expect(
      within(pendingRow).getByRole('switch', {
        name: 'Customer display for Alpha model',
        hidden: true,
      })
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      within(pendingRow).getByRole('button', {
        name: 'Manage prices',
        hidden: true,
      })
    ).toBeDisabled()
    expect(
      within(pendingRow).getByRole('button', {
        name: 'Edit display information',
        hidden: true,
      })
    ).toBeDisabled()
    expect(pricing).not.toHaveBeenCalled()

    resolvePublish?.()
  })

  it.each([
    ['MODEL_PRESENTATION_UNCHANGED', 'No display changes to publish.'],
    [
      'MODEL_PRESENTATION_VERSION_CONFLICT',
      'This model was changed elsewhere. Reload and try again.',
    ],
  ])('shows the correct 409 feedback for %s', async (code, message) => {
    mocks.publish.mockRejectedValueOnce({
      response: { status: 409, data: { code } },
    })
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(editDisplayButton())
    fireEvent.change(screen.getByLabelText(/Client display name/), {
      target: { value: 'Changed Alpha' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('keeps server validation feedback generic when no field detail is provided', async () => {
    mocks.publish.mockRejectedValueOnce({
      response: { status: 400, data: { code: 'VALIDATION_ERROR' } },
    })
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(editDisplayButton())
    fireEvent.change(screen.getByLabelText(/Client display name/), {
      target: { value: 'Changed Alpha' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Model display settings publication failed'
    )
    expect(screen.getByLabelText(/Client display name/)).toHaveAttribute(
      'aria-invalid',
      'false'
    )
  })

  it('keeps coverage read-only and opens pricing only through its primary action', async () => {
    const pricing = vi.fn()
    mocks.list.mockResolvedValue([
      model({ pricedTargets: 0, totalTargets: 0, parameterCombinations: [] }),
      model({
        id: 'priced-model',
        name: 'Priced model',
        pricedTargets: 2,
        totalTargets: 3,
        parameterCombinations: [
          {
            id: 'scope',
            key: 'scope',
            enabled: true,
            normalizedParameters: {},
            billingDimensionsSnapshot: {},
          },
        ],
      }),
    ])
    renderCatalog(pricing)
    await screen.findByText('Alpha model')
    expect(screen.getByText('No pricing scopes')).toBeVisible()
    const coverage = screen.getByText('Priced 2 / 3 targets')
    const pricingRow = coverage.closest('tr')
    if (!pricingRow) throw new Error('Priced model row is missing')
    expect(coverage.closest('button, a')).toBeNull()
    fireEvent.click(coverage)
    expect(pricing).not.toHaveBeenCalled()
    expect(
      within(pricingRow).getByRole('button', { name: 'Manage prices' })
    ).toHaveClass('h-8', 'border-border')
    expect(
      within(pricingRow).getByRole('button', {
        name: 'Edit display information',
      })
    ).toHaveClass('h-8', 'border-border')
    fireEvent.click(
      within(pricingRow).getByRole('button', {
        name: 'Manage prices',
      })
    )
    expect(pricing).toHaveBeenCalledWith('priced-model')
    expect(
      screen.queryByRole('button', {
        name: 'Pricing coverage counts enabled scopes multiplied by published price plans.',
      })
    ).not.toBeInTheDocument()
    expect(
      within(pricingRow).getByRole('button', {
        name: 'Edit display information',
      })
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
  })

  it('marks conflicting published billing units instead of choosing one', async () => {
    mocks.list.mockResolvedValue([
      model({ billingUnits: ['SECOND', 'REQUEST'] }),
    ])
    renderCatalog()
    expect(
      await screen.findByText('Billing unit conflict: SECOND · REQUEST')
    ).toBeVisible()
  })

  it('treats surrounding whitespace as unchanged for saving and closing', async () => {
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(editDisplayButton())
    fireEvent.change(screen.getByLabelText(/Client display name/), {
      target: { value: '  Alpha model  ' },
    })
    expect(
      screen.getByRole('button', { name: 'Save and publish' })
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it('keeps a failed display toggle open with visible error feedback', async () => {
    mocks.publish.mockRejectedValueOnce(new Error('offline'))
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(customerDisplaySwitch())
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Turn off display switch',
      })
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Model display settings publication failed'
    )
    expect(screen.getByRole('alertdialog')).toBeVisible()
  })

  it('reloads the actual switch state after a toggle version conflict', async () => {
    mocks.list.mockResolvedValueOnce([model({ presentationVersion: 1 })])
    mocks.publish.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: 'MODEL_PRESENTATION_VERSION_CONFLICT' },
      },
    })
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(customerDisplaySwitch())
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Turn off display switch',
      })
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This model was changed elsewhere. Reload and try again.'
    )

    mocks.list.mockResolvedValue([
      model({ enabled: false, presentationVersion: 2 }),
    ])
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload model information' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Turn on display switch?')
    expect(dialog).toHaveTextContent(
      'Display switch off state → Display switch on state'
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(customerDisplaySwitch()).not.toBeChecked())
  })

  it('reloads a conflicting version while retaining edits and refreshing untouched fields', async () => {
    mocks.list.mockResolvedValueOnce([model({ presentationVersion: 1 })])
    mocks.publish.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: 'MODEL_PRESENTATION_VERSION_CONFLICT' },
      },
    })
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(editDisplayButton())
    fireEvent.change(screen.getByLabelText(/Client display name/), {
      target: { value: 'My new name' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This model was changed elsewhere.'
    )
    expect(
      screen.getByRole('button', { name: 'Save and publish' })
    ).toBeDisabled()
    mocks.list.mockResolvedValue([
      model({
        description: 'Concurrent description',
        enabled: false,
        presentationVersion: 2,
      }),
    ])
    fireEvent.click(
      screen.getByRole('button', { name: 'Reload model information' })
    )
    await waitFor(() =>
      expect(screen.getByLabelText(/Client description/)).toHaveValue(
        'Concurrent description'
      )
    )
    expect(screen.getByLabelText(/Client display name/)).toHaveValue(
      'My new name'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save and publish' }))
    await waitFor(() =>
      expect(mocks.publish).toHaveBeenLastCalledWith(
        expect.objectContaining({
          displayName: 'My new name',
          description: 'Concurrent description',
          enabled: false,
          expectedVersion: 2,
        }),
        expect.anything()
      )
    )
  })
})

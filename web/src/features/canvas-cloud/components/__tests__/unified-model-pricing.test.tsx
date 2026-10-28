/*
Copyright (C) 2023-2026 QuantumNous
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PageFooterProvider } from '@/components/layout/components/page-footer'

import { UnifiedModelPricing } from '../UnifiedModelPricing'

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  detail: vi.fn(),
  issuance: vi.fn(),
  calculate: vi.fn(),
  preview: vi.fn(),
  publish: vi.fn(),
  history: vi.fn(),
  cancel: vi.fn(),
  publication: vi.fn(),
  blocker: vi.fn(),
}))

vi.mock('../../api', () => ({
  getCanvasModelPricingWorkspace: mocks.workspace,
  getCanvasModelPricingModel: mocks.detail,
  getCanvasPointIssuanceRates: mocks.issuance,
  calculateCanvasModelPricingCny: mocks.calculate,
  previewCanvasModelPricing: mocks.preview,
  publishCanvasModelPricing: mocks.publish,
  getCanvasModelPricingHistory: mocks.history,
  cancelCanvasModelPricingSchedule: mocks.cancel,
  getCanvasModelPricingPublication: mocks.publication,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useBlocker: (...args: unknown[]) => mocks.blocker(...args),
}))

const model = {
  id: 'model-1',
  modelKey: 'video.alpha',
  effectiveDisplayName: 'Video Alpha',
  catalogDefaultName: 'Catalog Video Alpha',
  capability: 'video.generate',
  status: 'ACTIVE',
  billingUnit: 'REQUEST',
  billingUnitState: 'CONSISTENT',
  publishedBillingUnits: ['REQUEST'],
  allowedBillingUnits: ['REQUEST'],
  tokenCategories: [],
  combinations: [
    {
      id: 'scope-1',
      key: 'standard',
      parameters: { quality: 'HD' },
      enabled: true,
    },
  ],
  hasPublishedPricing: true,
}
const identity = {
  requestHash: 'hash-1',
  calculationVersion: '1',
  customerModelId: 'model-1',
  customerModelVersion: 1,
  pointIssuanceRateConfigVersionId: 'rate-1',
  pointIssuanceRateVersion: 1,
  scopes: [],
}
const original = {
  providerSuccessPriceCny: '0.5000',
  inviterDisplayPriceCny: '1.0000',
  customerPriceCny: '1.2345',
}
const current = {
  id: 'price-1',
  version: 1,
  status: 'PUBLISHED',
  inputMode: 'CNY',
  billingUnit: 'REQUEST',
  points: '124',
  tokenRates: null,
  questionnaire: {},
  originalCnyValues: original,
  originalInput: { inputMode: 'CNY', ...original },
  restorationError: null,
}
const detail = {
  model,
  priceGroups: [{ id: 'group-1', code: 'STANDARD', internalName: 'Standard' }],
  pricingScopes: [
    {
      parameterCombinationId: 'scope-1',
      combinationKey: 'standard',
      parameters: { quality: 'HD' },
      enabled: true,
      controlEnabled: true,
      currentProviderRate: {
        id: 'provider-1',
        billingUnit: 'REQUEST',
        nativeAmount: '0.5000',
        currency: 'CNY',
        normalizedAmountMinor: '0.5000',
        failureChargePolicy: { mode: 'NONE' },
      },
      originalProviderSuccessPriceCny: '0.5000',
      scheduledProviderRate: null,
      prices: [
        {
          priceGroupId: 'group-1',
          priceGroupCode: 'STANDARD',
          priceGroupName: 'Standard',
          current,
          scheduled: null,
        },
      ],
    },
  ],
}
const calculation = {
  customerModelId: 'model-1',
  billingUnit: 'REQUEST',
  inputMode: 'CNY',
  calculatedAt: '2026-09-16T00:00:00Z',
  inputIdentity: identity,
  effectiveMode: 'IMMEDIATE',
  effectiveAt: '2026-09-16T00:00:00Z',
  pointIssuanceRate: { id: 'rate-1', version: 1, pointsPerRmb: '100' },
  unitChange: { from: 'REQUEST', to: 'REQUEST', changed: false },
  scopes: [
    {
      parameterCombinationId: 'scope-1',
      providerRateVersionId: 'provider-1',
      providerRateVersion: 1,
      prices: [
        {
          priceGroupId: 'group-1',
          sourcePriceVersionId: 'price-1',
          sourcePriceVersion: 1,
          normalizedPoints: '124',
          normalizedTokenRates: null,
          inviterMinusProviderCny: '0.5000',
          customerMinusInviterCny: '0.2345',
          fullCostCny: '0.5000',
          actualMarginRate: '0.59',
          canPublish: true,
          fieldErrors: [],
        },
      ],
    },
  ],
  fieldErrors: [],
  conflicts: [],
  canPublish: true,
}
const preview = {
  id: 'preview-1',
  expiresAt: '2026-09-16T00:15:00Z',
  customerModelId: 'model-1',
  billingUnit: 'REQUEST',
  inputMode: 'CNY',
  effectiveMode: 'IMMEDIATE',
  effectiveAt: '2026-09-16T00:00:00Z',
  pointIssuanceRate: calculation.pointIssuanceRate,
  unitChange: calculation.unitChange,
  scopes: [
    {
      parameterCombinationId: 'scope-1',
      combinationKey: 'standard',
      parameters: { quality: 'HD' },
      currentProviderRate: detail.pricingScopes[0].currentProviderRate,
      proposedProviderRate: detail.pricingScopes[0].currentProviderRate,
      costChanged: false,
      prices: [
        {
          priceGroupId: 'group-1',
          action: 'SET',
          current,
          proposed: {
            ...current,
            cnyCalculation: {
              ...original,
              inviterMinusProviderCny: '0.5000',
              customerMinusInviterCny: '0.2345',
            },
          },
          calculation: null,
          changed: true,
        },
      ],
    },
  ],
  conflicts: [],
  canPublish: true,
}

// The publish bar renders into the page footer, as under SectionPageLayout.
function PageShell(props: { children: React.ReactNode }) {
  const [footer, setFooter] = useState<HTMLDivElement | null>(null)
  return (
    <PageFooterProvider container={footer}>
      {props.children}
      <div data-testid='page-footer' ref={setFooter} />
    </PageFooterProvider>
  )
}

function renderPricing(
  tab: 'current' | 'history' = 'current',
  onBack = vi.fn()
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const page = (next: 'current' | 'history') => (
    <QueryClientProvider client={client}>
      <PageShell>
        <UnifiedModelPricing
          initialModelId='model-1'
          tab={next}
          onBack={onBack}
        />
      </PageShell>
    </QueryClientProvider>
  )
  const view = render(page(tab))
  return {
    ...view,
    client,
    rerenderTab: (next: 'current' | 'history') => view.rerender(page(next)),
  }
}

const customerInput = () => screen.findByLabelText('HD Customer sale price')
const footer = () => within(screen.getByTestId('page-footer'))

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.blocker.mockReturnValue({
    status: 'idle',
    proceed: vi.fn(),
    reset: vi.fn(),
  })
  mocks.workspace.mockResolvedValue({
    models: [model],
    priceGroups: detail.priceGroups,
  })
  mocks.detail.mockResolvedValue(structuredClone(detail))
  mocks.issuance.mockResolvedValue([
    { status: 'PUBLISHED', pointsPerRmb: '100.00000000' },
  ])
  mocks.calculate.mockResolvedValue(structuredClone(calculation))
  mocks.preview.mockResolvedValue(structuredClone(preview))
  mocks.publish.mockResolvedValue({ id: 'publication-1', status: 'PUBLISHED' })
  mocks.history.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  })
})

describe('UnifiedModelPricing inline editing', () => {
  it('edits prices in the current table without a set-prices tab or adjust column', async () => {
    renderPricing()

    expect(await customerInput()).toHaveValue('1.2345')
    expect(screen.getByLabelText('HD Provider cost')).toHaveValue('0.5000')
    expect(
      screen.getByLabelText('HD Inviter (agent) display price')
    ).toHaveValue('1.0000')
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Current pricing',
      'History versions',
    ])
    expect(screen.queryByText('Adjust pricing')).not.toBeInTheDocument()
    expect(await screen.findByText('124 points per request')).toBeVisible()
    expect(screen.getByText('Above provider cost by 0.5000 yuan')).toBeVisible()
    expect(screen.getByText(/100\.0000 points per RMB/)).toBeVisible()
    expect(
      screen.getByText('Above inviter display price by 0.2345 yuan')
    ).toBeVisible()
    expect(footer().getByText('No unpublished changes')).toBeVisible()
    expect(footer().getByRole('button', { name: 'Publish' })).toBeDisabled()
    expect(
      footer().getByRole('button', { name: 'Discard changes' })
    ).toBeDisabled()
  })

  it('publishes a changed price after confirming old and new values', async () => {
    renderPricing()
    fireEvent.change(await customerInput(), { target: { value: '1.5' } })

    expect(footer().getByText('Changed 1 pricing scopes')).toBeVisible()
    fireEvent.click(footer().getByRole('button', { name: 'Publish' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        effectiveMode: 'IMMEDIATE',
        scopes: [
          {
            parameterCombinationId: 'scope-1',
            providerSuccessPriceCny: '0.5000',
            prices: [
              {
                priceGroupId: 'group-1',
                sourcePriceVersionId: 'price-1',
                inviterDisplayPriceCny: '1.0000',
                customerPriceCny: '1.5',
              },
            ],
          },
        ],
      })
    )
    expect(dialog).toHaveTextContent('Customer sale price 1.2345 → 1.5 yuan')
    expect(dialog).toHaveTextContent('Customer points 124 → 124 points')
    expect(dialog).toHaveTextContent('Immediately')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Confirm and publish' })
    )
    await waitFor(() =>
      expect(mocks.publish).toHaveBeenCalledWith(
        'preview-1',
        expect.any(String)
      )
    )
    // The refreshed prices equal the snapshot, and the table must still come back after publishing.
    expect(await customerInput()).toHaveValue('1.2345')
    expect(footer().getByText('No unpublished changes')).toBeVisible()
  })

  it('marks invalid prices instead of previewing', async () => {
    renderPricing()
    fireEvent.change(
      await screen.findByLabelText('HD Inviter (agent) display price'),
      {
        target: { value: '0.4' },
      }
    )
    fireEvent.click(footer().getByRole('button', { name: 'Publish' }))

    expect(
      await screen.findByText(
        'Inviter display price must be at least provider cost, with up to 4 decimals.'
      )
    ).toBeVisible()
    expect(
      footer().getByText('Fix the prices marked in red first')
    ).toBeVisible()
    expect(
      screen.getByLabelText('HD Inviter (agent) display price')
    ).toHaveAttribute('aria-invalid', 'true')
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it('allows three equal prices', async () => {
    renderPricing()
    fireEvent.change(
      await screen.findByLabelText('HD Inviter (agent) display price'),
      {
        target: { value: '0.5' },
      }
    )
    fireEvent.change(await customerInput(), { target: { value: '0.5' } })
    fireEvent.click(footer().getByRole('button', { name: 'Publish' }))

    expect(await screen.findByRole('alertdialog')).toBeVisible()
  })

  it('marks preview conflicts on the rows and does not open the confirmation', async () => {
    mocks.preview.mockResolvedValue({
      ...structuredClone(preview),
      canPublish: false,
      conflicts: [
        {
          code: 'LIMITED_PRICE_SPECIAL',
          parameterCombinationId: 'scope-1',
          message: 'Resolve limited price',
        },
      ],
    })
    renderPricing()
    fireEvent.change(await customerInput(), { target: { value: '1.5' } })
    fireEvent.click(footer().getByRole('button', { name: 'Publish' }))

    expect(
      await screen.findByText(
        'A limited-price special is in progress. Wait until it ends or cancel it before changing prices.'
      )
    ).toBeVisible()
    expect(footer().getByText('1 conflicts block publishing')).toBeVisible()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    fireEvent.change(await customerInput(), { target: { value: '1.6' } })
    expect(
      footer().queryByText('1 conflicts block publishing')
    ).not.toBeInTheDocument()
  })

  it('locks a scheduled row and cancels only its pricing scope from the table', async () => {
    const scheduledDetail = structuredClone(detail)
    ;(
      scheduledDetail.pricingScopes[0].prices[0] as Record<string, unknown>
    ).scheduled = {
      ...current,
      id: 'price-2',
      status: 'APPROVED',
      points: '150',
      effectiveAt: '2026-12-01T10:00:00Z',
      publicationId: 'publication-9',
      originalCnyValues: { ...original, customerPriceCny: '1.5000' },
    }
    mocks.detail.mockResolvedValue(scheduledDetail)
    mocks.publication.mockResolvedValue({
      id: 'publication-9',
      displayNameSnapshot: 'Video Alpha',
      effectiveAt: '2026-12-01T10:00:00Z',
      change: 'PRICE',
      scopeSummary: [
        {
          combinationId: 'scope-1',
          combinationKey: 'standard',
          parameters: { quality: 'HD' },
          priceGroupId: 'group-1',
          changeKind: 'PRICE',
          providerRateVersionId: 'provider-1',
          priceVersionId: 'price-2',
          rateCurrent: true,
          priceCurrent: false,
          status: 'SCHEDULED',
        },
        {
          combinationId: 'scope-2',
          combinationKey: 'premium',
          parameters: { quality: '4K' },
          priceGroupId: 'group-1',
          changeKind: 'PRICE',
          providerRateVersionId: 'provider-2',
          priceVersionId: 'price-3',
          rateCurrent: true,
          priceCurrent: false,
          status: 'SCHEDULED',
        },
      ],
    })
    mocks.cancel.mockResolvedValue({ id: 'publication-9', status: 'APPROVED' })
    renderPricing()

    expect(await customerInput()).toBeDisabled()
    expect(screen.getByText('1.5000 yuan · 150 points')).toBeVisible()
    expect(
      screen.getByText('A price is scheduled and cannot be changed')
    ).toBeVisible()
    fireEvent.change(
      footer().getByRole('textbox', { name: 'Change reason (optional)' }),
      { target: { value: 'kept after cancel' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel schedule' }))

    const dialog = await screen.findByRole('alertdialog')
    await waitFor(() =>
      expect(dialog).toHaveTextContent(
        'Only the prices below are cancelled; current prices stay in effect.'
      )
    )
    expect(dialog).toHaveTextContent(
      'Other pricing scopes of this schedule (4K) are not affected.'
    )
    expect(dialog).toHaveTextContent('To cancel:HD')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel schedule' })
    )
    mocks.detail.mockResolvedValue(structuredClone(detail))
    await waitFor(() =>
      expect(mocks.cancel).toHaveBeenCalledWith('publication-9', ['scope-1'])
    )
    // The current versions did not change, so the row unlocks in place and nothing is lost.
    await waitFor(async () => expect(await customerInput()).toBeEnabled())
    expect(
      footer().getByRole('textbox', { name: 'Change reason (optional)' })
    ).toHaveValue('kept after cancel')
    expect(
      screen.queryByText(
        'Prices changed after you started editing. These changes cannot be published; discard them to load the latest prices.'
      )
    ).not.toBeInTheDocument()
  })

  it('clears every price when the billing unit changes and restores them when it changes back', async () => {
    const videoModel = { ...model, allowedBillingUnits: ['REQUEST', 'SECOND'] }
    mocks.workspace.mockResolvedValue({
      models: [videoModel],
      priceGroups: detail.priceGroups,
    })
    mocks.detail.mockResolvedValue({
      ...structuredClone(detail),
      model: videoModel,
    })
    renderPricing()
    await customerInput()

    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Billing unit' }))
    await user.click(await screen.findByRole('option', { name: 'per second' }))

    expect(await customerInput()).toHaveValue('')
    expect(
      screen.getByText(
        'The billing unit was changed. Re-enter every pricing scope and price plan before publishing.'
      )
    ).toBeVisible()
    expect(
      footer().getByText(
        'Billing unit changed to per second; fill in all 1 prices'
      )
    ).toBeVisible()

    await user.click(screen.getByRole('combobox', { name: 'Billing unit' }))
    await user.click(await screen.findByRole('option', { name: 'per request' }))
    expect(await customerInput()).toHaveValue('1.2345')
  })

  it('keeps unpublished changes while history is open and hides the publish bar there', async () => {
    const view = renderPricing()
    fireEvent.change(await customerInput(), { target: { value: '1.5' } })

    view.rerenderTab('history')
    await waitFor(() =>
      expect(screen.getByTestId('page-footer')).toBeEmptyDOMElement()
    )
    view.rerenderTab('current')

    expect(await customerInput()).toHaveValue('1.5')
  })

  it('requires an effective time for a scheduled publication', async () => {
    renderPricing()
    fireEvent.change(await customerInput(), { target: { value: '1.5' } })
    fireEvent.click(footer().getByRole('radio', { name: 'Schedule for later' }))
    fireEvent.click(footer().getByRole('button', { name: 'Publish' }))

    expect(await footer().findByText('Choose an effective time')).toBeVisible()
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it('reports a failed price calculation and retries it', async () => {
    mocks.calculate.mockRejectedValueOnce(new Error('offline'))
    renderPricing()

    expect(
      await screen.findByText('Pricing preview could not be created')
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('124 points per request')).toBeVisible()
    expect(
      screen.queryByText('Pricing preview could not be created')
    ).not.toBeInTheDocument()
  })

  it('opens the page of an invalid price hidden by pagination and focuses it', async () => {
    const pagedDetail = structuredClone(detail)
    const [scope] = pagedDetail.pricingScopes
    pagedDetail.pricingScopes = Array.from({ length: 21 }, (_, index) => ({
      ...structuredClone(scope),
      parameterCombinationId: `scope-${index + 1}`,
      combinationKey: `q${index + 1}`,
      parameters: { quality: `Q${index + 1}` },
    }))
    mocks.detail.mockResolvedValue(pagedDetail)
    renderPricing()
    await screen.findByLabelText('Q1 Customer sale price')

    fireEvent.click(screen.getByRole('button', { name: /next page/i }))
    fireEvent.change(await screen.findByLabelText('Q21 Customer sale price'), {
      target: { value: '0.1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /previous page/i }))
    await screen.findByLabelText('Q1 Customer sale price')
    fireEvent.click(footer().getByRole('button', { name: 'Publish' }))

    const hidden = await screen.findByLabelText('Q21 Customer sale price')
    await waitFor(() => expect(hidden).toHaveFocus())
    expect(
      footer().getByText('Fix the prices marked in red first')
    ).toBeVisible()
  })

  it('keeps both actions disabled until a price changes', async () => {
    renderPricing()
    await customerInput()
    fireEvent.change(
      footer().getByRole('textbox', { name: 'Change reason (optional)' }),
      { target: { value: 'quarterly review' } }
    )

    expect(footer().getByText('No unpublished changes')).toBeVisible()
    expect(
      footer().getByRole('button', { name: 'Discard changes' })
    ).toBeDisabled()
    expect(footer().getByRole('button', { name: 'Publish' })).toBeDisabled()
  })

  it('leaves through the navigation guard alone, without a second confirmation', async () => {
    const onBack = vi.fn()
    renderPricing('current', onBack)
    fireEvent.change(await customerInput(), { target: { value: '1.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Back to model list' }))

    expect(onBack).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('keeps the same focused input while a price is typed', async () => {
    const user = userEvent.setup()
    renderPricing()
    const input = await customerInput()

    await user.clear(input)
    await user.type(input, '1.55')

    expect(input).toBeInTheDocument()
    expect(input).toHaveFocus()
    expect(input).toHaveValue('1.55')
  })

  it('follows a refresh of the current prices while nothing is edited', async () => {
    const { client } = renderPricing()
    expect(await customerInput()).toHaveValue('1.2345')

    mocks.detail.mockResolvedValue(republishedDetail())
    await act(() => client.invalidateQueries())

    await waitFor(async () =>
      expect(await customerInput()).toHaveValue('1.9000')
    )
    expect(footer().getByText('No unpublished changes')).toBeVisible()
    expect(footer().getByRole('button', { name: 'Publish' })).toBeDisabled()
  })

  it('keeps edits on their original versions and blocks publishing after another admin republishes', async () => {
    const { client } = renderPricing()
    fireEvent.change(await customerInput(), { target: { value: '1.5' } })

    mocks.detail.mockResolvedValue(republishedDetail())
    await act(() => client.invalidateQueries())

    expect(
      await screen.findByText(
        'Prices changed after you started editing. These changes cannot be published; discard them to load the latest prices.'
      )
    ).toBeVisible()
    expect(await customerInput()).toHaveValue('1.5')
    expect(footer().getByRole('button', { name: 'Publish' })).toBeDisabled()

    fireEvent.click(footer().getByRole('button', { name: 'Discard changes' }))
    expect(await customerInput()).toHaveValue('1.9000')
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it('keeps an edited time-of-day schedule and blocks publishing after another admin republishes', async () => {
    mocks.detail.mockResolvedValue(tokenDetail('price-1'))
    const { client } = renderPricing()
    fireEvent.click(await screen.findByRole('switch'))
    expect(await screen.findByLabelText('Start time of period 1')).toHaveValue(
      '09:00'
    )
    expect(footer().getByText('Time-of-day multipliers changed')).toBeVisible()

    mocks.detail.mockResolvedValue(tokenDetail('price-2'))
    await act(() => client.invalidateQueries())

    expect(
      await screen.findByText(
        'Prices changed after you started editing. These changes cannot be published; discard them to load the latest prices.'
      )
    ).toBeVisible()
    expect(screen.getByLabelText('Start time of period 1')).toHaveValue('09:00')
    expect(footer().getByRole('button', { name: 'Publish' })).toBeDisabled()
  })

  it('prices periods from the points Cloud calculated and pauses them for an invalid draft', async () => {
    const token = tokenDetail('price-1')
    const values = (
      token.pricingScopes[0].prices[0].current as never as {
        originalCnyValues: { customerPriceCny: Record<string, string> }
      }
    ).originalCnyValues
    values.customerPriceCny.input = '1.2345'
    mocks.detail.mockResolvedValue(token)
    const tokenCalculation = structuredClone(calculation)
    Object.assign(tokenCalculation, {
      billingUnit: 'MILLION_TOKENS',
      unitChange: {
        from: 'MILLION_TOKENS',
        to: 'MILLION_TOKENS',
        changed: false,
      },
    })
    Object.assign(tokenCalculation.scopes[0].prices[0], {
      normalizedPoints: '124',
      normalizedTokenRates: { input: '124', output: '240' },
    })
    mocks.calculate.mockResolvedValue(tokenCalculation)
    renderPricing()
    fireEvent.click(await screen.findByRole('switch'))
    fireEvent.click(screen.getByText('Prices by period'))
    // 1.2345 yuan at 100 points per yuan is a base rate of 124 points; the peak is 124 × 2, not ceil(2.469 × 100).
    expect(await screen.findByText('248 points · cost 0.96 yuan')).toBeVisible()
    expect(screen.getByText('2.469 yuan')).toBeVisible()

    const [inputPrice] = screen.getAllByLabelText(/Customer sale price/u)
    fireEvent.change(inputPrice as HTMLElement, { target: { value: '1,2' } })
    expect(inputPrice).toHaveValue('1,2')
    // The invalid draft keeps its field error in the table and is not priced at any period.
    expect(
      screen.getByText('Enter an amount above 0 with up to 4 decimals')
    ).toBeVisible()
    expect(screen.queryByText(/1,2 yuan/u)).toBeNull()
    expect(screen.queryByText('248 points · cost 0.96 yuan')).toBeNull()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('shows the pricing rate snapshot before a model has any price', async () => {
    const unpriced = structuredClone(detail)
    const [scope] = unpriced.pricingScopes
    scope.prices[0].current = null as never
    scope.originalProviderSuccessPriceCny = null as never
    mocks.detail.mockResolvedValue(unpriced)
    renderPricing()

    expect(await screen.findByText(/100\.0000 points per RMB/)).toBeVisible()
    expect(mocks.calculate).not.toHaveBeenCalled()
  })

  it('follows a background change of the billing unit while nothing is edited', async () => {
    const videoModel = { ...model, allowedBillingUnits: ['REQUEST', 'SECOND'] }
    mocks.workspace.mockResolvedValue({
      models: [videoModel],
      priceGroups: detail.priceGroups,
    })
    mocks.detail.mockResolvedValue({
      ...structuredClone(detail),
      model: videoModel,
    })
    const { client } = renderPricing()
    await customerInput()

    const perSecond = republishedDetail()
    perSecond.model = {
      ...videoModel,
      billingUnit: 'SECOND',
      publishedBillingUnits: ['SECOND'],
    } as never
    mocks.detail.mockResolvedValue(perSecond)
    await act(() => client.invalidateQueries())

    await waitFor(async () =>
      expect(await customerInput()).toHaveValue('1.9000')
    )
    expect(
      screen.getByRole('combobox', { name: 'Billing unit' })
    ).toHaveTextContent('per second')
    expect(footer().getByText('No unpublished changes')).toBeVisible()
    expect(footer().getByRole('button', { name: 'Publish' })).toBeDisabled()
  })
})

// A text model priced per million Tokens; the price version id marks another admin's republication.
function tokenDetail(priceId: string) {
  const rates = { input: '0.4800', output: '1.9200' }
  const next = structuredClone(detail)
  Object.assign(next.model, {
    capability: 'chat.generate',
    billingUnit: 'MILLION_TOKENS',
    publishedBillingUnits: ['MILLION_TOKENS'],
    allowedBillingUnits: ['MILLION_TOKENS'],
    tokenCategories: ['input', 'output'],
    combinations: [
      { id: 'scope-1', key: 'default', parameters: {}, enabled: true },
    ],
  })
  const [scope] = next.pricingScopes
  Object.assign(scope, {
    combinationKey: 'default',
    parameters: {},
    originalProviderSuccessPriceCny: rates,
    currentProviderRate: {
      ...scope.currentProviderRate,
      billingUnit: 'MILLION_TOKENS',
      tokenRates: rates,
      normalizedTokenRates: rates,
      timeOfDaySchedule: null,
    },
  })
  const values = {
    providerSuccessPriceCny: rates,
    inviterDisplayPriceCny: { input: '0.5000', output: '2.0000' },
    customerPriceCny: { input: '0.6000', output: '2.4000' },
  }
  scope.prices[0].current = {
    ...scope.prices[0].current,
    id: priceId,
    billingUnit: 'MILLION_TOKENS',
    tokenRates: { input: '60', output: '240' },
    originalCnyValues: values,
    originalInput: { inputMode: 'CNY', ...values },
  } as never
  return next
}

function republishedDetail() {
  const next = structuredClone(detail)
  const [price] = next.pricingScopes[0].prices
  price.current = {
    ...price.current,
    id: 'price-2',
    originalCnyValues: { ...original, customerPriceCny: '1.9000' },
  }
  return next
}

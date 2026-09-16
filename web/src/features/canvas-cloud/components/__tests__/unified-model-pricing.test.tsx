/*
Copyright (C) 2023-2026 QuantumNous
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  name: 'Video Alpha',
  capability: 'video.generate',
  status: 'ACTIVE',
  billingUnit: 'REQUEST',
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
      currentProviderRate: {
        id: 'provider-1',
        billingUnit: 'REQUEST',
        nativeAmount: '0.5000',
        currency: 'CNY',
        normalizedAmountMinor: '0.5000',
        failureChargePolicy: { mode: 'NONE' },
      },
      originalProviderSuccessPriceCny: '0.5000',
      prices: [
        {
          priceGroupId: 'group-1',
          priceGroupCode: 'STANDARD',
          priceGroupName: 'Standard',
          current,
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

function renderPricing(tab: 'set' | 'current' = 'set') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <UnifiedModelPricing
        initialModelId='model-1'
        tab={tab}
        onBack={vi.fn()}
      />
    </QueryClientProvider>
  )
}

async function fields() {
  return {
    provider: await screen.findByLabelText(/Provider cost/),
    inviter: screen.getByLabelText(/Inviter \(agent\) display price/),
    customer: screen.getByLabelText(/Customer sale price/),
  }
}

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
    { status: 'PUBLISHED', pointsPerRmb: '100' },
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

describe('UnifiedModelPricing UAT-028', () => {
  it('shows current CNY cost, inviter price, sale price and points without inventing legacy RMB originals', async () => {
    renderPricing('current')
    expect(
      await screen.findByRole('columnheader', { name: 'Provider cost' })
    ).toBeVisible()
    expect(
      screen.getByRole('columnheader', {
        name: 'Inviter (agent) display price',
      })
    ).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Customer sale price' })
    ).toBeVisible()
    expect(screen.getByText(/1.0000 RMB/)).toBeVisible()
    expect(screen.getByText(/1.2345 RMB/)).toBeVisible()
    expect(screen.getByText(/124 points/)).toBeVisible()
  })

  it('shows only CNY inputs and restores the three actual original values', async () => {
    renderPricing()
    const input = await fields()
    expect(
      screen.queryByRole('radio', { name: 'Points pricing' })
    ).not.toBeInTheDocument()
    expect(input.provider).toHaveValue('0.5000')
    expect(input.inviter).toHaveValue('1.0000')
    expect(input.customer).toHaveValue('1.2345')
    expect(await screen.findByText('124 points / per request')).toBeVisible()
  })

  it('leaves missing original RMB fields blank for a legacy POINTS version while showing old points read-only', async () => {
    const old = structuredClone(detail)
    old.pricingScopes[0].originalProviderSuccessPriceCny = null as never
    old.pricingScopes[0].prices[0].current = {
      ...old.pricingScopes[0].prices[0].current,
      inputMode: 'POINTS',
      originalCnyValues: {
        providerSuccessPriceCny: null,
        inviterDisplayPriceCny: null,
        customerPriceCny: null,
      },
    } as never
    mocks.detail.mockResolvedValue(old)
    renderPricing()
    const input = await fields()
    expect(input.provider).toHaveValue('')
    expect(input.inviter).toHaveValue('')
    expect(input.customer).toHaveValue('')
    expect(
      screen.getByText(/Current active version is legacy points pricing/)
    ).toBeVisible()
    expect(screen.getByText(/Original customer points/)).toBeVisible()
  })

  it('preserves recorded CNY cost and sale price but leaves a missing inviter original blank', async () => {
    const old = structuredClone(detail)
    old.pricingScopes[0].prices[0].current.originalCnyValues.inviterDisplayPriceCny =
      null as never
    const oldPreview = structuredClone(preview)
    oldPreview.scopes[0].prices[0].current.originalCnyValues.inviterDisplayPriceCny =
      null as never
    mocks.preview.mockResolvedValue(oldPreview)
    mocks.detail.mockResolvedValue(old)
    renderPricing()
    const input = await fields()
    expect(input.provider).toHaveValue('0.5000')
    expect(input.inviter).toHaveValue('')
    expect(input.customer).toHaveValue('1.2345')
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    expect(mocks.preview).not.toHaveBeenCalled()
    fireEvent.change(input.inviter, { target: { value: '1.0000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    expect(
      await screen.findByText(/Original RMB value not recorded → ¥1.0000/)
    ).toBeVisible()
  })

  it('labels missing originals as not set only for first pricing', async () => {
    const firstDetail = structuredClone(detail)
    firstDetail.pricingScopes[0].originalProviderSuccessPriceCny = null as never
    firstDetail.pricingScopes[0].prices[0].current = null as never
    const firstPreview = structuredClone(preview)
    firstPreview.scopes[0].prices[0].current = null as never
    mocks.detail.mockResolvedValue(firstDetail)
    mocks.preview.mockResolvedValue(firstPreview)
    renderPricing()
    const input = await fields()
    fireEvent.change(input.provider, { target: { value: '0.5000' } })
    fireEvent.change(input.inviter, { target: { value: '1.0000' } })
    fireEvent.change(input.customer, { target: { value: '1.2345' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    expect((await screen.findAllByText(/Not set → ¥/)).length).toBeGreaterThan(
      0
    )
    expect(
      screen.queryByText(/Original RMB value not recorded →/)
    ).not.toBeInTheDocument()
  })

  it('does not preview when amount precision exceeds four decimals or prices invert', async () => {
    renderPricing()
    const input = await fields()
    fireEvent.change(input.provider, { target: { value: '0.50001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    expect(
      (
        await screen.findAllByText(
          /Enter an amount above 0 with up to 4 decimals/
        )
      ).length
    ).toBeGreaterThan(0)
    expect(mocks.preview).not.toHaveBeenCalled()
    fireEvent.change(input.provider, { target: { value: '2.0000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    expect(
      await screen.findByText(
        /Inviter display price must be at least provider cost/
      )
    ).toBeVisible()
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it('sends one shared cost and the two plan prices, then confirms only server-derived points', async () => {
    const user = userEvent.setup()
    renderPricing()
    await fields()
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0]).toMatchObject({
      inputMode: 'CNY',
      calculationIdentity: identity,
      scopes: [
        {
          providerSuccessPriceCny: '0.5000',
          prices: [
            { inviterDisplayPriceCny: '1.0000', customerPriceCny: '1.2345' },
          ],
        },
      ],
    })
    expect(
      await screen.findByRole('button', { name: 'Confirm and publish' })
    ).toBeVisible()
    await user.click(
      screen.getByRole('button', { name: 'Confirm and publish' })
    )
    await waitFor(() =>
      expect(mocks.publish).toHaveBeenCalledWith(
        'preview-1',
        expect.any(String)
      )
    )
  })

  it('invalidates a prior preview and derived results when an input changes', async () => {
    renderPricing()
    const input = await fields()
    await screen.findByText('0.2345 RMB / per request')
    fireEvent.change(input.customer, { target: { value: '1.5000' } })
    expect(
      screen.queryByText('0.2345 RMB / per request')
    ).not.toBeInTheDocument()
  })

  it('keeps one cost shared while two plans submit independent inviter and customer prices', async () => {
    const nextDetail = structuredClone(detail)
    nextDetail.priceGroups.push({
      id: 'group-2',
      code: 'PREMIUM',
      internalName: 'Premium',
    })
    nextDetail.pricingScopes[0].prices.push({
      priceGroupId: 'group-2',
      priceGroupCode: 'PREMIUM',
      priceGroupName: 'Premium',
      current: {
        ...structuredClone(current),
        id: 'price-2',
        originalCnyValues: {
          providerSuccessPriceCny: '0.5000',
          inviterDisplayPriceCny: '2.0000',
          customerPriceCny: '3.0000',
        },
      },
    })
    mocks.workspace.mockResolvedValue({
      models: [model],
      priceGroups: nextDetail.priceGroups,
    })
    mocks.detail.mockResolvedValue(nextDetail)
    const user = userEvent.setup()
    renderPricing()
    const first = await fields()
    expect(first.provider).toHaveValue('0.5000')
    expect(first.inviter).toHaveValue('1.0000')
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(screen.getByRole('option', { name: 'Premium' }))
    expect(screen.getByLabelText(/Provider cost/)).toHaveValue('0.5000')
    expect(
      screen.getByLabelText(/Inviter \(agent\) display price/)
    ).toHaveValue('2.0000')
    expect(screen.getByLabelText(/Customer sale price/)).toHaveValue('3.0000')
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0].scopes[0]).toMatchObject({
      providerSuccessPriceCny: '0.5000',
      prices: [
        {
          priceGroupId: 'group-1',
          inviterDisplayPriceCny: '1.0000',
          customerPriceCny: '1.2345',
        },
        {
          priceGroupId: 'group-2',
          inviterDisplayPriceCny: '2.0000',
          customerPriceCny: '3.0000',
        },
      ],
    })
  })

  it('renders only supported Token categories with isolated inviter inputs', async () => {
    const tokenModel = {
      ...model,
      billingUnit: 'MILLION_TOKENS',
      allowedBillingUnits: ['MILLION_TOKENS'],
      tokenCategories: ['input', 'output'],
    }
    const tokenDetail = structuredClone(detail)
    tokenDetail.model = tokenModel as never
    tokenDetail.pricingScopes[0].originalProviderSuccessPriceCny = {
      input: '0.5000',
      output: '0.7500',
    } as never
    tokenDetail.pricingScopes[0].prices[0].current.originalCnyValues = {
      providerSuccessPriceCny: { input: '0.5000', output: '0.7500' },
      inviterDisplayPriceCny: { input: '1.0000', output: '1.2500' },
      customerPriceCny: { input: '1.5000', output: '2.0000' },
    } as never
    mocks.workspace.mockResolvedValue({
      models: [tokenModel],
      priceGroups: tokenDetail.priceGroups,
    })
    mocks.detail.mockResolvedValue(tokenDetail)
    renderPricing()
    const inviters = await screen.findAllByLabelText(
      /Inviter \(agent\) display price/
    )
    expect(inviters).toHaveLength(2)
    expect(inviters[0]).toHaveValue('1.0000')
    expect(inviters[1]).toHaveValue('1.2500')
    fireEvent.change(inviters[0], { target: { value: '1.1000' } })
    expect(inviters[1]).toHaveValue('1.2500')
    expect(screen.queryByText('cacheRead')).not.toBeInTheDocument()
  })

  it('shows only changed original values in compact confirmation and preserves edits on return', async () => {
    const user = userEvent.setup()
    renderPricing()
    const input = await fields()
    fireEvent.change(input.customer, { target: { value: '1.5000' } })
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    expect(await screen.findByText(/¥1.2345 → ¥1.5000/)).toBeVisible()
    expect(screen.queryByText(/¥0.5000 → ¥0.5000/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Return to editing' }))
    expect(input.customer).toHaveValue('1.5000')
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it('ignores a calculation response for an older input revision', async () => {
    let resolveCalculation: ((value: unknown) => void) | undefined
    mocks.calculate.mockReturnValue(
      new Promise((resolve) => {
        resolveCalculation = resolve
      })
    )
    renderPricing()
    const input = await fields()
    await waitFor(() => expect(mocks.calculate).toHaveBeenCalled())
    fireEvent.change(input.customer, { target: { value: '1.5000' } })
    await act(async () => {
      resolveCalculation?.(structuredClone(calculation))
    })
    expect(
      screen.queryByText('0.2345 RMB / per request')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Confirm and publish' })
    ).not.toBeInTheDocument()
  })

  it('does not open a stale preview after the price changes', async () => {
    let resolvePreview: ((value: unknown) => void) | undefined
    mocks.preview.mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve
      })
    )
    const user = userEvent.setup()
    renderPricing()
    const input = await fields()
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    fireEvent.change(input.customer, { target: { value: '1.5000' } })
    await act(async () => {
      resolvePreview?.(structuredClone(preview))
    })
    expect(
      screen.queryByRole('button', { name: 'Confirm and publish' })
    ).not.toBeInTheDocument()
  })
})

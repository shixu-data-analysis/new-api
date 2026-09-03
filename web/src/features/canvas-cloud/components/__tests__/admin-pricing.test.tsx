/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import type { CanvasAdminWorkspace } from '../../types'
import { AdminPricing } from '../AdminPricing'

const apiMocks = vi.hoisted(() => ({
  cancelCanvasLimitedPricePromotion: vi.fn(),
  cancelScheduledCanvasPrice: vi.fn(),
  createCanvasLimitedPricePromotion: vi.fn(),
  publishConfirmedCanvasPriceChange: vi.fn(),
  publishConfirmedCanvasInitialPrice: vi.fn(),
  getCanvasAdminTestingModels: vi.fn(),
  getCanvasPointIssuanceRates: vi.fn(),
  publishConfirmedCanvasPointIssuanceRate: vi.fn(),
  getCanvasTaskPolicySettings: vi.fn(),
  publishConfirmedCanvasTaskPolicySettings: vi.fn(),
  getCanvasPriceGroups: vi.fn(),
  publishConfirmedCanvasPriceGroup: vi.fn(),
  getCanvasProviderPricingMatrix: vi.fn(),
  publishCanvasProviderRate: vi.fn(),
  resolveCanvasProviderRateRisk: vi.fn(),
}))
const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../../api', () => apiMocks)
vi.mock('sonner', () => ({ toast: toastMocks }))

const prices: CanvasAdminWorkspace['prices'] = [
  {
    id: 'published-price',
    modelKey: 'canvas.image',
    modelName: 'Canvas Image',
    priceGroupCode: 'STANDARD',
    priceGroup: 'Standard',
    combinationKey: 'default',
    normalizedParameters: {},
    version: 1,
    status: 'PUBLISHED',
    points: '20',
    baseRatePointsPerRmb: '50.00000000',
    targetMarginRate: '0.400000',
    successProbability: '0.900000',
    kTheoryRmb: '0.18000000',
    kActualRmb: null,
    kPricingRmb: '0.20000000',
    riskBufferRmb: '0.02000000',
    breakEvenPoints: '10',
    targetMarginPoints: '17',
    pricingAssumptionsSnapshot: {
      successfulTaskCostRmb: '0.16000000',
      failedUnrecoverableCostRmb: '0.18000000',
      otherVariableCostRmb: '0.00000000',
      decisionSummary: 'Historical review context',
      evidenceRefs: ['pricing-review://historical'],
    },
    createdByPrincipalId: 'platform-admin',
    approvedByPrincipalId: 'platform-admin',
    createdAt: '2026-08-26T00:00:00.000Z',
    approvedAt: '2026-08-26T00:01:00.000Z',
    effectiveAt: '2026-08-26T00:02:00.000Z',
  },
]

function renderPricing(
  onChanged = vi.fn().mockResolvedValue(undefined),
  priceRows = prices
) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPricing prices={priceRows} onChanged={onChanged} />
    </QueryClientProvider>
  )
}

function openTab(
  name:
    | 'Model prices'
    | 'Price groups'
    | 'Point issuance rate'
    | 'Task and point policy settings'
) {
  fireEvent.click(screen.getByRole('tab', { name }))
}

function confirmChange() {
  fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
}

describe('Canvas administrator pricing', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.publishConfirmedCanvasPriceChange.mockResolvedValue({
      status: 'PUBLISHED',
    })
    apiMocks.publishConfirmedCanvasInitialPrice.mockResolvedValue({
      status: 'PUBLISHED',
    })
    apiMocks.cancelScheduledCanvasPrice.mockResolvedValue({
      status: 'RETIRED',
    })
    apiMocks.createCanvasLimitedPricePromotion.mockResolvedValue({
      status: 'APPROVED',
    })
    apiMocks.cancelCanvasLimitedPricePromotion.mockResolvedValue({
      status: 'STOPPED',
    })
    apiMocks.getCanvasAdminTestingModels.mockResolvedValue([])
    apiMocks.getCanvasProviderPricingMatrix.mockResolvedValue([])
    apiMocks.getCanvasPointIssuanceRates.mockResolvedValue([
      {
        id: 'rate-v1',
        version: 1,
        status: 'PUBLISHED',
        pointsPerRmb: '50.00000000',
        decisionSummary: 'FROZEN v1.0 baseline',
        evidenceRefs: ['baseline://v1'],
        createdByPrincipalId: 'platform-admin',
        approvedByPrincipalId: 'platform-admin',
        createdAt: '2026-08-26T00:00:00.000Z',
        approvedAt: '2026-08-26T00:01:00.000Z',
        effectiveAt: '2026-08-26T00:02:00.000Z',
      },
    ])
    apiMocks.getCanvasPriceGroups.mockResolvedValue([
      {
        id: 'group-v1',
        code: 'UAT-STANDARD',
        internalName: 'Manual UAT standard group',
        version: 1,
        status: 'PUBLISHED',
        createdAt: '2026-08-26T00:00:00.000Z',
        approvedAt: '2026-08-26T00:01:00.000Z',
        effectiveAt: '2026-08-26T00:02:00.000Z',
      },
    ])
    apiMocks.publishConfirmedCanvasPriceGroup.mockResolvedValue({
      status: 'PUBLISHED',
    })
    apiMocks.publishConfirmedCanvasPointIssuanceRate.mockResolvedValue({
      status: 'PUBLISHED',
    })
    apiMocks.getCanvasTaskPolicySettings.mockResolvedValue({
      quoteTtlSeconds: 300,
      quoteTtlVersion: null,
      quoteTtlEffectiveAt: null,
      bonusFailureGraceDays: 7,
      bonusFailureGraceVersion: null,
      bonusFailureGraceEffectiveAt: null,
      paidExpiryDays: 90,
      paidExpiryVersion: null,
      paidExpiryEffectiveAt: null,
    })
    apiMocks.publishConfirmedCanvasTaskPolicySettings.mockResolvedValue({
      quoteTtlSeconds: 600,
      quoteTtlVersion: 1,
      quoteTtlEffectiveAt: '2026-08-29T00:00:00.000Z',
      bonusFailureGraceDays: 14,
      bonusFailureGraceVersion: 1,
      bonusFailureGraceEffectiveAt: '2026-08-29T00:00:00.000Z',
      paidExpiryDays: 120,
      paidExpiryVersion: 1,
      paidExpiryEffectiveAt: '2026-08-29T00:00:00.000Z',
    })
  })

  it('shows every pricing category and keeps derived and audit values read-only', () => {
    renderPricing()

    expect(
      screen.queryByText(
        'K_theory = [q × success cost + (1−q) × unrecoverable failure cost + other variable cost] ÷ q'
      )
    ).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Open pricing calculator' })
    ).toHaveLength(1)
    expect(screen.getByText('How the pricing calculation works')).toBeVisible()
    expect(screen.getByLabelText(/Break-even\./)).toBeVisible()
    expect(screen.getByText('Show pricing assumptions')).toBeVisible()
    expect(screen.getByLabelText(/Created\./)).toBeVisible()
    expect(
      screen.queryByRole('textbox', { name: /Break-even/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: /K_pricing/ })
    ).not.toBeInTheDocument()
    expect(screen.getAllByText('50 points per RMB')).toHaveLength(2)
    expect(screen.getByText('Not eligible or unavailable')).toBeVisible()
    expect(screen.queryByText('FROZEN v1.0 baseline')).not.toBeInTheDocument()
    expect(screen.queryByText('baseline://v1')).not.toBeInTheDocument()
    expect(screen.queryByText('platform-admin')).not.toBeInTheDocument()
  })

  it('exposes the administrator task policy settings entry', async () => {
    renderPricing()
    openTab('Task and point policy settings')

    expect(await screen.findByLabelText('Quote validity')).toHaveValue('300')
    expect(screen.getByLabelText('Bonus failure grace')).toHaveValue('7')
    expect(screen.getByLabelText('Paid points validity')).toHaveValue('90')
  })

  it('shows pricing records in a table and keeps raw assumptions collapsed', () => {
    renderPricing()

    const table = screen.getByRole('table')
    expect(within(table).getByText('Canvas Image')).toBeVisible()
    expect(within(table).getByText('canvas.image')).toBeVisible()
    expect(within(table).getByText('Standard')).toBeVisible()
    expect(within(table).getByText('STANDARD')).toBeVisible()
    expect(within(table).getByText('20 points')).toBeVisible()
    expect(within(table).getByText('10 points')).toBeVisible()
    expect(within(table).getByText('17 points')).toBeVisible()
    expect(within(table).getByText('Published')).toBeVisible()
    expect(within(table).queryByText('PUBLISHED')).not.toBeInTheDocument()
    expect(screen.getByText(/successfulTaskCostRmb/)).not.toBeVisible()

    const assumptions = screen.getByText('Show pricing assumptions')
    expect(assumptions.closest('details')).not.toHaveAttribute('open')
    fireEvent.click(assumptions)
    expect(assumptions.closest('details')).toHaveAttribute('open')
    expect(screen.getByText(/successfulTaskCostRmb/)).toBeVisible()
  })

  it('submits required administrator inputs without optional metadata', async () => {
    renderPricing()

    const form = screen.getByRole('form', {
      name: 'Adjust model price',
    })

    fireEvent.submit(form)
    expect(apiMocks.publishConfirmedCanvasPriceChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeVisible()
    confirmChange()

    await waitFor(() => {
      expect(apiMocks.publishConfirmedCanvasPriceChange).toHaveBeenCalledWith({
        sourcePriceVersionId: 'published-price',
        points: '20',
        targetMarginRate: '0.4',
        successProbability: '0.9',
        successfulTaskCostRmb: '0.16',
        failedUnrecoverableCostRmb: '0.18',
        otherVariableCostRmb: '0',
        riskBufferRmb: '0.02',
      })
    })
    expect(
      within(form).getByText('Optional, up to 2000 characters')
    ).toBeVisible()
    expect(
      within(form).queryByRole('textbox', { name: /Evidence references/ })
    ).not.toBeInTheDocument()
  })

  it('schedules a future activation and explains that the current price stays active', async () => {
    apiMocks.publishConfirmedCanvasPriceChange.mockResolvedValue({
      status: 'APPROVED',
    })
    renderPricing()
    fireEvent.click(screen.getByRole('radio', { name: /Schedule for later/ }))
    const localValue = '2099-08-29T09:30'
    fireEvent.change(screen.getByLabelText('Activation time'), {
      target: { value: localValue },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Adjust model price' }))
    expect(
      screen.getByText(
        'The current price stays active until the selected time.'
      )
    ).toBeVisible()
    confirmChange()
    await waitFor(() => {
      expect(apiMocks.publishConfirmedCanvasPriceChange).toHaveBeenCalledWith(
        expect.objectContaining({
          effectiveAt: new Date(localValue).toISOString(),
        })
      )
    })
    expect(toastMocks.success).toHaveBeenCalledWith(
      'Price activation scheduled'
    )
  })

  it('publishes the first price for an internally tested model target', async () => {
    apiMocks.getCanvasAdminTestingModels.mockResolvedValue([
      {
        id: 'model-id',
        modelKey: 'canvas.testing',
        version: 1,
        name: 'Canvas Testing',
        status: 'ACTIVE',
        customerVisible: false,
        pricedTargets: 0,
        totalTargets: 1,
        provider: { code: 'provider', name: 'Provider' },
        channel: {
          code: 'primary',
          version: 1,
          status: 'PUBLISHED',
          protocolAdapter: 'mock',
          upstreamModel: 'testing-v1',
          executionSnapshot: {},
        },
        publicCatalogSnapshot: {},
        parameterCombinations: [],
        pricingTargets: [
          {
            priceGroupId: 'group-id',
            priceGroupCode: 'STANDARD',
            priceGroupName: 'Standard',
            priceGroupVersion: 1,
            parameterCombinationId: 'combination-id',
            combinationKey: 'default',
            priced: false,
            priceVersionId: null,
            priceVersion: null,
            points: null,
          },
        ],
        createdAt: '2026-08-27T00:00:00.000Z',
        effectiveAt: '2026-08-27T00:00:00.000Z',
      },
    ])
    renderPricing(vi.fn().mockResolvedValue(undefined), [])

    await screen.findByRole('option', {
      name: /Canvas Testing.*Standard.*default.*Not priced/,
    })
    await waitFor(() =>
      expect(screen.getByLabelText('Pricing target')).toHaveValue(
        'initial:model-id:group-id:combination-id'
      )
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Proposed price points' }),
      { target: { value: '20' } }
    )
    fireEvent.submit(screen.getByRole('form', { name: 'Adjust model price' }))
    confirmChange()

    await waitFor(() =>
      expect(apiMocks.publishConfirmedCanvasInitialPrice).toHaveBeenCalledWith({
        customerModelId: 'model-id',
        priceGroupId: 'group-id',
        parameterCombinationId: 'combination-id',
        points: '20',
        targetMarginRate: '0.4',
        successProbability: '0.9',
        successfulTaskCostRmb: '0',
        failedUnrecoverableCostRmb: '0',
        otherVariableCostRmb: '0',
        riskBufferRmb: '0',
      })
    )
  })

  it('creates a governed price group with a server-generated code and a multilingual name', async () => {
    renderPricing()
    expect(
      screen.queryByRole('form', { name: 'Create price group' })
    ).not.toBeInTheDocument()
    openTab('Price groups')
    const form = screen.getByRole('form', { name: 'Create price group' })
    fireEvent.submit(form)
    expect(apiMocks.publishConfirmedCanvasPriceGroup).not.toHaveBeenCalled()
    expect(within(form).getAllByText('This field is required')).toHaveLength(1)
    expect(
      within(form).queryByRole('textbox', { name: /Price group code/ })
    ).not.toBeInTheDocument()
    expect(
      within(form).getByText(
        'A unique immutable code is generated automatically.'
      )
    ).toBeVisible()
    expect(
      within(form).getByRole('textbox', { name: /Price group name/ })
    ).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(
      within(form).getByRole('textbox', { name: /Price group name/ }),
      { target: { value: '测试客户・VIP' } }
    )
    fireEvent.submit(form)
    expect(screen.getByText('Generated automatically')).toBeVisible()
    confirmChange()

    await waitFor(() => {
      expect(apiMocks.publishConfirmedCanvasPriceGroup).toHaveBeenCalledWith({
        internalName: '测试客户・VIP',
      })
    })
    expect(screen.getByText('UAT-STANDARD')).toBeVisible()
    expect(screen.getByText('Manual UAT standard group')).toBeVisible()
  })

  it('does not expose redundant self-approval actions for historical price groups', async () => {
    apiMocks.getCanvasPriceGroups.mockResolvedValue([
      {
        id: 'group-draft',
        code: 'VIP',
        internalName: 'VIP customers',
        version: 1,
        status: 'DRAFT',
        createdAt: '2026-08-26T00:00:00.000Z',
        approvedAt: null,
        effectiveAt: null,
      },
    ])
    renderPricing()
    openTab('Price groups')
    await screen.findByText('VIP customers')
    const card = screen.getByText('VIP customers').closest('[data-slot="card"]')
    expect(card).not.toBeNull()
    expect(
      within(card as HTMLElement).queryByRole('button', { name: 'Approve' })
    ).not.toBeInTheDocument()
    expect(
      within(card as HTMLElement).queryByRole('button', { name: 'Publish' })
    ).not.toBeInTheDocument()
  })

  it('includes an optional price decision summary when provided', async () => {
    renderPricing()
    const form = screen.getByRole('form', {
      name: 'Adjust model price',
    })
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Decision summary' }),
      { target: { value: 'Optional administrator context' } }
    )
    fireEvent.submit(form)
    confirmChange()

    await waitFor(() => {
      expect(apiMocks.publishConfirmedCanvasPriceChange).toHaveBeenCalledWith(
        expect.objectContaining({
          decisionSummary: 'Optional administrator context',
        })
      )
    })
  })

  it('validates every required price input below its own field', () => {
    renderPricing()
    const form = screen.getByRole('form', {
      name: 'Adjust model price',
    })
    const requiredFields = [
      'Proposed price points',
      'Target margin rate',
      'Expected success rate',
      'Service provider cost when successful',
      'Unrecoverable service provider cost when failed',
      'Other variable cost for every attempt',
      'Risk buffer',
    ]

    for (const name of requiredFields) {
      fireEvent.change(within(form).getByRole('textbox', { name }), {
        target: { value: '' },
      })
    }
    fireEvent.submit(form)

    expect(apiMocks.publishConfirmedCanvasPriceChange).not.toHaveBeenCalled()
    for (const name of requiredFields) {
      expect(within(form).getByRole('textbox', { name })).toHaveAttribute(
        'aria-invalid',
        'true'
      )
    }
    expect(within(form).getAllByText('This field is required')).toHaveLength(7)
    expect(
      within(form).getByRole('textbox', { name: 'Decision summary' })
    ).toHaveAttribute('aria-invalid', 'false')
    expect(toastMocks.error).not.toHaveBeenCalled()
  })

  it('rejects invalid percentages and cost precision beyond eight decimals', () => {
    renderPricing()
    const form = screen.getByRole('form', {
      name: 'Adjust model price',
    })
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Proposed price points' }),
      {
        target: { value: '1.5' },
      }
    )
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Target margin rate' }),
      { target: { value: '100' } }
    )
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Expected success rate' }),
      { target: { value: '100.001' } }
    )
    fireEvent.change(
      within(form).getByRole('textbox', {
        name: 'Service provider cost when successful',
      }),
      { target: { value: '0.123456789' } }
    )
    fireEvent.submit(form)

    expect(apiMocks.publishConfirmedCanvasPriceChange).not.toHaveBeenCalled()
    expect(within(form).getByText('Enter a positive integer')).toBeVisible()
    expect(
      within(form).getByText(
        'Enter a percentage from 0 to below 100, with up to 2 decimals'
      )
    ).toBeVisible()
    expect(
      within(form).getByText(
        'Enter a percentage above 0 and at most 100, with up to 2 decimals'
      )
    ).toBeVisible()
    expect(
      within(form).getByText('Enter a non-negative value with up to 8 decimals')
    ).toBeVisible()
  })

  it('publishes a confirmed rate change and keeps history read-only', async () => {
    renderPricing()
    expect(
      screen.queryByRole('form', { name: 'Adjust point issuance rate' })
    ).not.toBeInTheDocument()
    openTab('Point issuance rate')
    const form = screen.getByRole('form', {
      name: 'Adjust point issuance rate',
    })
    fireEvent.change(
      within(form).getByRole('textbox', { name: /Point issuance rate/ }),
      { target: { value: '60' } }
    )
    fireEvent.submit(form)
    expect(
      apiMocks.publishConfirmedCanvasPointIssuanceRate
    ).not.toHaveBeenCalled()
    confirmChange()
    await waitFor(() => {
      expect(
        apiMocks.publishConfirmedCanvasPointIssuanceRate
      ).toHaveBeenCalledWith({ pointsPerRmb: '60' })
    })
    expect(
      within(form).getByText('Optional, up to 2000 characters')
    ).toBeVisible()
    expect(
      within(form).queryByRole('textbox', { name: /Evidence references/ })
    ).not.toBeInTheDocument()
    expect(screen.getAllByText('50 points per RMB').length).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('textbox', { name: /Point issuance rate/ })
    ).toHaveLength(1)
  })

  it('includes the optional decision summary when the administrator provides it', async () => {
    renderPricing()
    openTab('Point issuance rate')
    const form = screen.getByRole('form', {
      name: 'Adjust point issuance rate',
    })
    await waitFor(() =>
      expect(
        within(form).getByRole('textbox', { name: /Point issuance rate/ })
      ).toHaveValue('50')
    )
    fireEvent.change(
      within(form).getByRole('textbox', { name: /Decision summary/ }),
      { target: { value: 'Optional administrator context' } }
    )
    fireEvent.submit(form)
    confirmChange()

    await waitFor(() => {
      expect(
        apiMocks.publishConfirmedCanvasPointIssuanceRate
      ).toHaveBeenCalledWith({
        pointsPerRmb: '50',
        decisionSummary: 'Optional administrator context',
      })
    })
  })

  it('keeps the calculator entry on model prices only', async () => {
    const focus = vi.fn()
    const popup = vi
      .spyOn(window, 'open')
      .mockReturnValue({ focus } as unknown as Window)
    renderPricing()

    const calculatorButtons = screen.getAllByRole('button', {
      name: 'Open pricing calculator',
    })
    expect(calculatorButtons).toHaveLength(1)

    fireEvent.click(calculatorButtons[0])
    expect(popup).toHaveBeenCalledWith(
      '/canvas-cloud/pricing-calculator',
      'canvas-pricing-calculator',
      'popup=yes,width=760,height=900,resizable=yes,scrollbars=yes'
    )
    expect(focus).toHaveBeenCalledOnce()

    openTab('Point issuance rate')
    expect(
      screen.queryByRole('button', { name: 'Open pricing calculator' })
    ).not.toBeInTheDocument()

    const form = screen.getByRole('form', {
      name: 'Adjust point issuance rate',
    })
    const rate = within(form).getByRole('textbox', {
      name: /Point issuance rate/,
    })
    await waitFor(() => expect(rate).toHaveValue('50'))
    fireEvent.change(rate, { target: { value: '60.123' } })
    fireEvent.blur(rate)
    expect(
      within(form).getByRole('button', { name: 'Review rate change' })
    ).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a positive value with up to 2 decimals'
    )
  })

  it('keeps the pricing tabs on one horizontally scrollable row', () => {
    renderPricing()

    expect(screen.getByRole('tablist')).toHaveClass(
      'w-full',
      'flex-nowrap',
      'overflow-x-auto',
      'overflow-y-hidden'
    )
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveClass('h-8', 'flex-none')
    }
  })

  it('shows the only required rate error below the rate field', async () => {
    renderPricing()
    openTab('Point issuance rate')
    const form = screen.getByRole('form', {
      name: 'Adjust point issuance rate',
    })
    await waitFor(() =>
      expect(
        within(form).getByRole('textbox', { name: /Point issuance rate/ })
      ).toHaveValue('50')
    )

    const rate = within(form).getByRole('textbox', {
      name: /Point issuance rate/,
    })
    fireEvent.change(rate, { target: { value: '' } })
    fireEvent.submit(form)

    expect(
      apiMocks.publishConfirmedCanvasPointIssuanceRate
    ).not.toHaveBeenCalled()
    expect(rate).toHaveAttribute('aria-invalid', 'true')
    expect(
      within(form).getByRole('textbox', { name: /Decision summary/ })
    ).toHaveAttribute('aria-invalid', 'false')
    expect(within(form).getByText('This field is required')).toBeVisible()
  })

  it('shows the localized server rejection reason with only the status icon', async () => {
    apiMocks.publishConfirmedCanvasPointIssuanceRate.mockRejectedValue({
      response: {
        data: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
        },
      },
    })
    renderPricing()
    openTab('Point issuance rate')
    const form = screen.getByRole('form', {
      name: 'Adjust point issuance rate',
    })
    await waitFor(() =>
      expect(
        within(form).getByRole('textbox', { name: /Point issuance rate/ })
      ).toHaveValue('50')
    )
    fireEvent.submit(form)
    confirmChange()

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        'Point issuance rate publication failed',
        {
          description:
            'The submitted rate change did not pass server validation. Check the field requirements and try again.',
          closeButton: false,
        }
      )
    })
  })

  it('contains wide records inside a dedicated horizontal table scroller', () => {
    const { container } = renderPricing()

    expect(container.querySelector('table')).toBeInTheDocument()
    expect(container.querySelector('.overflow-x-auto')).toBeInTheDocument()
    expect(container.querySelector('.min-w-max')).toBeInTheDocument()
    expect(container.querySelector('.sm\\:grid-cols-2')).toBeInTheDocument()
    expect(container.querySelector('.lg\\:grid-cols-4')).toBeInTheDocument()
  })

  it('mounts only the selected pricing tab and paginates published history', async () => {
    const queryClient = new QueryClient()
    const history = Array.from({ length: 21 }, (_, index) => ({
      ...prices[0],
      id: `published-price-${index + 1}`,
      modelName: `Canvas Model ${index + 1}`,
      version: index + 1,
    }))
    render(
      <QueryClientProvider client={queryClient}>
        <AdminPricing prices={history} onChanged={vi.fn()} />
      </QueryClientProvider>
    )

    expect(apiMocks.getCanvasPointIssuanceRates).toHaveBeenCalledTimes(1)
    expect(apiMocks.getCanvasPriceGroups).not.toHaveBeenCalled()
    expect(screen.getByText('Canvas Model 1')).toBeVisible()
    expect(screen.getByText('Canvas Model 20')).toBeVisible()
    expect(screen.queryByText('Canvas Model 21')).not.toBeInTheDocument()
    expect(screen.getByText('21')).toBeVisible()
    expect(screen.getByText('Page 1 of 2')).toBeVisible()
    expect(screen.getByRole('button', { name: /Go to page 2/ })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(screen.getByText('Canvas Model 21')).toBeVisible()
    expect(screen.queryByText('Canvas Model 1')).not.toBeInTheDocument()

    openTab('Point issuance rate')
    expect(
      screen.queryByRole('form', { name: 'Adjust model price' })
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(apiMocks.getCanvasPointIssuanceRates).toHaveBeenCalledOnce()
    )

    openTab('Price groups')
    expect(
      screen.queryByRole('form', { name: 'Adjust point issuance rate' })
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(apiMocks.getCanvasPriceGroups).toHaveBeenCalled()
    )
  })

  it('filters the full record set and exposes sorting for every column', async () => {
    const history = [
      prices[0],
      {
        ...prices[0],
        id: 'other-price',
        modelName: 'Canvas Text',
        points: '30',
      },
    ]
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <AdminPricing prices={history} onChanged={vi.fn()} />
      </QueryClientProvider>
    )

    const table = screen.getByRole('table')
    const columnFiltersButton = screen.getByRole('button', {
      name: 'Column filters',
    })
    const pointsSortButton = screen.getByRole('button', { name: 'Points' })
    expect(within(table).getByText('Canvas Image')).toBeVisible()
    expect(within(table).getByText('Canvas Text')).toBeVisible()
    fireEvent.click(pointsSortButton)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Desc' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('menuitem', { name: 'Desc' })
      ).not.toBeInTheDocument()
    )
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(
      'Canvas Text'
    )
    fireEvent.click(columnFiltersButton)
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'Canvas Text' },
    })
    expect(within(table).queryByText('Canvas Image')).not.toBeInTheDocument()
    expect(within(table).getByText('Canvas Text')).toBeVisible()
    expect(pointsSortButton).toBeVisible()
    expect(columnFiltersButton).toBeVisible()
  })

  it('renders every pricing record area as a sortable filterable table with visible pagination', async () => {
    renderPricing()

    expect(screen.getByRole('table')).toBeVisible()
    expect(
      screen.getByRole('combobox', { name: 'Rows per page' })
    ).toHaveTextContent('20')
    expect(screen.getByText('Page 1 of 1')).toBeVisible()

    openTab('Point issuance rate')
    await waitFor(() =>
      expect(apiMocks.getCanvasPointIssuanceRates).toHaveBeenCalledOnce()
    )
    expect(screen.getByRole('table')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Rate version' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    expect(screen.getByLabelText('Rate version')).toBeInTheDocument()

    openTab('Price groups')
    await waitFor(() =>
      expect(apiMocks.getCanvasPriceGroups).toHaveBeenCalledOnce()
    )
    expect(screen.getByRole('table')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Price group code' })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    expect(screen.getByLabelText('Price group code')).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Rows per page' })
    ).toHaveTextContent('20')
  })

  it('moves the draft source to the newly published version after publication', async () => {
    const queryClient = new QueryClient()
    const rendered = render(
      <QueryClientProvider client={queryClient}>
        <AdminPricing prices={prices} onChanged={vi.fn()} />
      </QueryClientProvider>
    )
    const nextPublished = {
      ...prices[0],
      id: 'published-price-v2',
      version: 2,
      points: '30',
      pricingAssumptionsSnapshot: {
        successfulTaskCostRmb: '0.30000000',
        failedUnrecoverableCostRmb: '0.00000000',
        otherVariableCostRmb: '0.00000000',
      },
    }

    rendered.rerender(
      <QueryClientProvider client={queryClient}>
        <AdminPricing
          prices={[{ ...prices[0], status: 'RETIRED' }, nextPublished]}
          onChanged={vi.fn()}
        />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Pricing target')).toHaveValue(
        'published-price-v2'
      )
      expect(
        screen.getByRole('textbox', { name: 'Proposed price points' })
      ).toHaveValue('30')
      expect(
        screen.getByRole('textbox', {
          name: 'Service provider cost when successful',
        })
      ).toHaveValue('0.3')
    })
  })

  it('schedules a limited-time special with an explicit local time range', async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined)
    renderPricing(onChanged)

    fireEvent.change(screen.getByLabelText('Special price'), {
      target: { value: '15' },
    })
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '2027-08-29T10:00' },
    })
    fireEvent.change(screen.getByLabelText('End time'), {
      target: { value: '2027-08-30T10:00' },
    })
    fireEvent.change(screen.getByLabelText('Approval reason'), {
      target: { value: 'Approved seasonal launch promotion' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review limited-time special' })
    )
    expect(
      screen.getByRole('heading', { name: 'Confirm limited-time special' })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Schedule special' }))

    await waitFor(() => {
      expect(apiMocks.createCanvasLimitedPricePromotion).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcePriceVersionId: 'published-price',
          specialPoints: '15',
          approvalReason: 'Approved seasonal launch promotion',
        })
      )
    })
    expect(onChanged).toHaveBeenCalled()
  })
})

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
  approveCanvasPriceDraft: vi.fn(),
  createCanvasPriceDraft: vi.fn(),
  publishCanvasPriceVersion: vi.fn(),
  getCanvasPointIssuanceRates: vi.fn(),
  createCanvasPointIssuanceRateDraft: vi.fn(),
  approveCanvasPointIssuanceRate: vi.fn(),
  publishCanvasPointIssuanceRate: vi.fn(),
  getCanvasPriceGroups: vi.fn(),
  createCanvasPriceGroupDraft: vi.fn(),
  approveCanvasPriceGroup: vi.fn(),
  publishCanvasPriceGroup: vi.fn(),
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

function renderPricing(onChanged = vi.fn().mockResolvedValue(undefined)) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPricing prices={prices} onChanged={onChanged} />
    </QueryClientProvider>
  )
}

describe('Canvas administrator pricing', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.createCanvasPriceDraft.mockResolvedValue({ status: 'DRAFT' })
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
    apiMocks.createCanvasPriceGroupDraft.mockResolvedValue({ status: 'DRAFT' })
  })

  it('shows every pricing category and keeps derived and audit values read-only', () => {
    renderPricing()

    expect(
      screen.queryByText(
        'K_theory = [q × success cost + (1−q) × unrecoverable failure cost + other variable cost] ÷ q'
      )
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open pricing calculator' })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /Break-even\./ })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Pricing assumptions\./ })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /Created\./ })).toBeVisible()
    expect(
      screen.queryByRole('textbox', { name: /Break-even/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: /K_pricing/ })
    ).not.toBeInTheDocument()
    expect(screen.getByText('50 points per RMB')).toBeVisible()
    expect(screen.getByText('Not eligible or unavailable')).toBeVisible()
    expect(screen.queryByText('FROZEN v1.0 baseline')).not.toBeInTheDocument()
    expect(screen.queryByText('baseline://v1')).not.toBeInTheDocument()
    expect(screen.queryByText('platform-admin')).not.toBeInTheDocument()
  })

  it('submits required administrator inputs without optional metadata', async () => {
    renderPricing()

    const form = screen.getByRole('form', {
      name: 'Create price version draft',
    })

    fireEvent.submit(form)

    await waitFor(() => {
      expect(apiMocks.createCanvasPriceDraft).toHaveBeenCalledWith({
        sourcePriceVersionId: 'published-price',
        points: '20',
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

  it('creates a governed price group draft and validates both required fields', async () => {
    renderPricing()
    const form = screen.getByRole('form', { name: 'Create price group draft' })
    fireEvent.submit(form)
    expect(apiMocks.createCanvasPriceGroupDraft).not.toHaveBeenCalled()
    expect(within(form).getAllByText('This field is required')).toHaveLength(2)
    expect(
      within(form).getByRole('textbox', { name: /Price group code/ })
    ).toHaveAttribute('aria-invalid', 'true')
    expect(
      within(form).getByRole('textbox', { name: /Price group name/ })
    ).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(
      within(form).getByRole('textbox', { name: /Price group code/ }),
      { target: { value: 'vip' } }
    )
    fireEvent.change(
      within(form).getByRole('textbox', { name: /Price group name/ }),
      { target: { value: 'VIP customers' } }
    )
    fireEvent.submit(form)

    await waitFor(() => {
      expect(apiMocks.createCanvasPriceGroupDraft).toHaveBeenCalledWith({
        code: 'VIP',
        internalName: 'VIP customers',
      })
    })
    expect(screen.getByText('UAT-STANDARD')).toBeVisible()
    expect(screen.getByText('Manual UAT standard group')).toBeVisible()
  })

  it('validates the required PriceGroup approval reason below its field', async () => {
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
    await screen.findByText('VIP customers')
    const card = screen.getByText('Price groups').closest('[data-slot="card"]')
    expect(card).not.toBeNull()
    const approval = within(card as HTMLElement).getByRole('textbox', {
      name: /Approval reason/,
    })
    fireEvent.input(approval, { target: { value: ' ' } })
    fireEvent.blur(approval)
    await waitFor(() => {
      expect(
        within(card as HTMLElement).getByRole('textbox', {
          name: /Approval reason/,
        })
      ).toHaveAttribute('aria-invalid', 'true')
      expect(
        within(card as HTMLElement).getByText('This field is required')
      ).toBeVisible()
    })
    expect(
      within(card as HTMLElement).getByRole('button', { name: 'Approve' })
    ).toBeDisabled()
  })

  it('includes an optional price decision summary when provided', async () => {
    renderPricing()
    const form = screen.getByRole('form', {
      name: 'Create price version draft',
    })
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Decision summary' }),
      { target: { value: 'Optional administrator context' } }
    )
    fireEvent.submit(form)

    await waitFor(() => {
      expect(apiMocks.createCanvasPriceDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          decisionSummary: 'Optional administrator context',
        })
      )
    })
  })

  it('validates every required price input below its own field', () => {
    renderPricing()
    const form = screen.getByRole('form', {
      name: 'Create price version draft',
    })
    const requiredFields = [
      'Points',
      'Success probability',
      'Successful task cost',
      'Failed unrecoverable cost',
      'Other variable cost',
      'Risk buffer',
    ]

    for (const name of requiredFields) {
      fireEvent.change(within(form).getByRole('textbox', { name }), {
        target: { value: '' },
      })
    }
    fireEvent.submit(form)

    expect(apiMocks.createCanvasPriceDraft).not.toHaveBeenCalled()
    for (const name of requiredFields) {
      expect(within(form).getByRole('textbox', { name })).toHaveAttribute(
        'aria-invalid',
        'true'
      )
    }
    expect(within(form).getAllByText('This field is required')).toHaveLength(6)
    expect(
      within(form).getByRole('textbox', { name: 'Decision summary' })
    ).toHaveAttribute('aria-invalid', 'false')
    expect(toastMocks.error).not.toHaveBeenCalled()
  })

  it('rejects price precision beyond two decimals before calling the API', () => {
    renderPricing()
    const form = screen.getByRole('form', {
      name: 'Create price version draft',
    })
    fireEvent.change(within(form).getByRole('textbox', { name: 'Points' }), {
      target: { value: '1.5' },
    })
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Success probability' }),
      { target: { value: '1.001' } }
    )
    fireEvent.change(
      within(form).getByRole('textbox', { name: 'Successful task cost' }),
      { target: { value: '0.123' } }
    )
    fireEvent.submit(form)

    expect(apiMocks.createCanvasPriceDraft).not.toHaveBeenCalled()
    expect(within(form).getByText('Enter a positive integer')).toBeVisible()
    expect(
      within(form).getByText(
        'Enter a value above 0 and at most 1, with up to 2 decimals'
      )
    ).toBeVisible()
    expect(
      within(form).getByText('Enter a non-negative value with up to 2 decimals')
    ).toBeVisible()
  })

  it('creates a governed rate draft and keeps the published version read-only', async () => {
    apiMocks.createCanvasPointIssuanceRateDraft.mockResolvedValue({
      status: 'DRAFT',
    })
    renderPricing()
    const form = screen.getByRole('form', {
      name: 'Create point issuance rate draft',
    })
    fireEvent.change(
      within(form).getByRole('textbox', { name: /Point issuance rate/ }),
      { target: { value: '60' } }
    )
    fireEvent.submit(form)
    await waitFor(() => {
      expect(apiMocks.createCanvasPointIssuanceRateDraft).toHaveBeenCalledWith({
        pointsPerRmb: '60',
      })
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
    apiMocks.createCanvasPointIssuanceRateDraft.mockResolvedValue({
      status: 'DRAFT',
    })
    renderPricing()
    const form = screen.getByRole('form', {
      name: 'Create point issuance rate draft',
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

    await waitFor(() => {
      expect(apiMocks.createCanvasPointIssuanceRateDraft).toHaveBeenCalledWith({
        pointsPerRmb: '50',
        decisionSummary: 'Optional administrator context',
      })
    })
  })

  it('limits direct rate input to two decimals and opens a focused calculator popup', async () => {
    const focus = vi.fn()
    const popup = vi
      .spyOn(window, 'open')
      .mockReturnValue({ focus } as unknown as Window)
    renderPricing()

    const form = screen.getByRole('form', {
      name: 'Create point issuance rate draft',
    })
    const rate = within(form).getByRole('textbox', {
      name: /Point issuance rate/,
    })
    await waitFor(() => expect(rate).toHaveValue('50'))
    fireEvent.change(rate, { target: { value: '60.123' } })
    fireEvent.blur(rate)
    expect(
      within(form).getByRole('button', { name: 'Create rate draft' })
    ).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a positive value with up to 2 decimals'
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Open pricing calculator' })
    )
    expect(popup).toHaveBeenCalledWith(
      '/canvas-cloud/pricing-calculator',
      'canvas-pricing-calculator',
      'popup=yes,width=760,height=900,resizable=yes,scrollbars=yes'
    )
    expect(focus).toHaveBeenCalledOnce()
  })

  it('shows the only required rate-draft error below the rate field', async () => {
    renderPricing()
    const form = screen.getByRole('form', {
      name: 'Create point issuance rate draft',
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

    expect(apiMocks.createCanvasPointIssuanceRateDraft).not.toHaveBeenCalled()
    expect(rate).toHaveAttribute('aria-invalid', 'true')
    expect(
      within(form).getByRole('textbox', { name: /Decision summary/ })
    ).toHaveAttribute('aria-invalid', 'false')
    expect(within(form).getByText('This field is required')).toBeVisible()
  })

  it('shows the localized server rejection reason with only the status icon', async () => {
    apiMocks.createCanvasPointIssuanceRateDraft.mockRejectedValue({
      response: {
        data: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
        },
      },
    })
    renderPricing()
    const form = screen.getByRole('form', {
      name: 'Create point issuance rate draft',
    })
    await waitFor(() =>
      expect(
        within(form).getByRole('textbox', { name: /Point issuance rate/ })
      ).toHaveValue('50')
    )
    fireEvent.submit(form)

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith(
        'Point issuance rate draft failed',
        {
          description:
            'The submitted rate draft did not pass server validation. Check the field requirements and try again.',
          closeButton: false,
        }
      )
    })
  })

  it('uses responsive grids and never renders a wide pricing table', () => {
    const { container } = renderPricing()

    expect(container.querySelector('table')).not.toBeInTheDocument()
    expect(container.querySelector('.sm\\:grid-cols-2')).toBeInTheDocument()
    expect(container.querySelector('.xl\\:grid-cols-5')).toBeInTheDocument()
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
      expect(screen.getByRole('combobox')).toHaveValue('published-price-v2')
      expect(screen.getByRole('textbox', { name: 'Points' })).toHaveValue('30')
      expect(
        screen.getByRole('textbox', { name: 'Successful task cost' })
      ).toHaveValue('0.3')
    })
  })
})

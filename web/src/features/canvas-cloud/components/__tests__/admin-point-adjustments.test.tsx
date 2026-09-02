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
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { AdminPointAdjustments } from '../AdminPointAdjustments'
import { AdminRefundRecovery } from '../AdminRefundRecovery'

const apiMocks = vi.hoisted(() => ({
  createCanvasRefund: vi.fn(),
  deductCanvasPointLot: vi.fn(),
  getCanvasAdminCustomerPointLots: vi.fn(),
  getCanvasAdminCustomerPointLedger: vi.fn(),
  getCanvasAdminCustomerTasks: vi.fn(),
  getCanvasAdminCustomers: vi.fn(),
  getCanvasAuditEvents: vi.fn(),
  getCanvasAdminRefunds: vi.fn(),
  getCanvasAdminRechargeOrders: vi.fn(),
  grantCanvasManualBonus: vi.fn(),
  grantCanvasPaidCorrection: vi.fn(),
}))

vi.mock('../../api', () => apiMocks)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  )
}

const customer = {
  customerId: '85000000-0000-7000-8000-000000000001',
  newApiUserId: '85',
  username: 'uatcustomer',
  emailMasked: null,
  status: 'ACTIVE' as const,
  availablePoints: '900',
  paidAvailablePoints: '500',
  bonusAvailablePoints: '400',
}
const order = {
  id: '85000000-0000-7000-8000-000000000002',
  orderNumber: 'CANVAS-20260901-001',
  customerId: customer.customerId,
  customerName: customer.username,
  customerEmailMasked: null,
  status: 'CODE_ACTIVATED',
  currency: 'CNY',
  listedAmountMinor: '2000',
  rechargeCodeMask: 'CANVAS-A••••1234',
  rechargeCodeStatus: 'REDEEMED',
  expectedPaidPoints: '1000',
  originalPaidPoints: '800',
  correctedPaidPoints: '100',
  issuedPaidPoints: '900',
  availablePaidPoints: '500',
  availableBonusPoints: '400',
  remainingCorrectionPoints: '100',
  eligibleForPaidCorrection: true,
  paidCorrectionIneligibleReason: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  redeemedAt: '2026-09-01T00:05:00.000Z',
}

describe('Canvas administrator point adjustments and refund recovery', () => {
  beforeAll(() =>
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  )

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasAdminRechargeOrders.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [order],
    })
    apiMocks.getCanvasAdminCustomers.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [customer],
    })
    apiMocks.getCanvasAdminRefunds.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    apiMocks.getCanvasAdminCustomerPointLedger.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: '85000000-0000-7000-8000-000000000005',
          pointLotId: '85000000-0000-7000-8000-000000000003',
          eventType: 'SETTLE',
          eventPoints: '30',
          remainingDelta: '-30',
          reservedDelta: '0',
          taskId: '85000000-0000-7000-8000-000000000006',
          refundLinkId: null,
          reason: 'Task settlement',
          occurredAt: '2026-09-01T01:00:00.000Z',
        },
      ],
    })
    apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: '85000000-0000-7000-8000-000000000006',
          modelName: 'Canvas Image',
          quotedPoints: '30',
          allocatedPoints: '30',
          settledPoints: '30',
          releasedPoints: '0',
          executionStatus: 'SUCCEEDED',
          customerBillingStatus: 'SETTLED',
          providerReconcileStatus: 'RECONCILED',
          upstreamTaskId: 'provider-task-1',
          acceptedAt: '2026-09-01T00:59:00.000Z',
          completedAt: '2026-09-01T01:00:00.000Z',
        },
      ],
    })
    apiMocks.getCanvasAuditEvents.mockResolvedValue({
      page: 1,
      pageSize: 50,
      total: 0,
      items: [],
    })
    apiMocks.getCanvasAdminCustomerPointLots.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 2,
      items: [
        {
          id: '85000000-0000-7000-8000-000000000003',
          type: 'BONUS',
          sourceType: 'MANUAL_GRANT',
          rechargeOrderId: null,
          rechargeOrderNumber: null,
          initialPoints: '500',
          remainingPoints: '500',
          reservedPoints: '100',
          availablePoints: '400',
          expiresAt: '2026-12-01T00:00:00.000Z',
          issuedAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: '85000000-0000-7000-8000-000000000004',
          type: 'PAID',
          sourceType: 'RECHARGE_CODE',
          rechargeOrderId: order.id,
          rechargeOrderNumber: order.orderNumber,
          initialPoints: '30',
          remainingPoints: '30',
          reservedPoints: '30',
          availablePoints: '0',
          expiresAt: '2026-12-01T00:00:00.000Z',
          issuedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    })
    apiMocks.grantCanvasManualBonus.mockResolvedValue({ pointLotId: 'lot' })
    apiMocks.createCanvasRefund.mockResolvedValue({ id: 'refund' })
  })

  it('uses a searchable customer table before exposing the adjustment forms', async () => {
    renderWithQuery(<AdminPointAdjustments />)
    expect(screen.getByPlaceholderText('Search customer name')).toBeVisible()
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(
      (await screen.findAllByText('Grant Bonus points')).length
    ).toBeGreaterThan(0)
    expect(
      screen.queryByText('Enter a positive whole number')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('This field is required')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Bonus points')).toBeVisible()
    expect(screen.getByText(/Uses your current time zone:/)).toBeVisible()
    fireEvent.blur(screen.getByLabelText('Bonus points'))
    expect(
      await screen.findByText('Enter a positive whole number')
    ).toBeVisible()
    expect(screen.getByLabelText('Reason')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Bonus points'), {
      target: { value: '25' },
    })
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'wrong customer draft' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to customer list' })
    )
    expect(screen.getByPlaceholderText('Search customer name')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Back to customer list' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getByLabelText('Bonus points')).toHaveValue('')
    expect(screen.getByLabelText('Reason')).toHaveValue('')
    expect(
      screen.queryByText('Enter a positive whole number')
    ).not.toBeInTheDocument()
  })

  it('selects a Canvas order and never offers an administrator-entered point amount for refund recovery', async () => {
    renderWithQuery(<AdminRefundRecovery />)
    expect(
      screen.getByPlaceholderText('Search by Canvas order number or customer')
    ).toBeVisible()
    expect(await screen.findByText('CANVAS-20260901-001')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(
      screen.queryByLabelText('Points to claw back')
    ).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('Externally confirmed refund amount (minor units)')
    ).toBeVisible()
  })

  it('opens refund recovery with the selected customer context', async () => {
    const onOpenRefundRecovery = vi.fn()
    renderWithQuery(
      <AdminPointAdjustments onOpenRefundRecovery={onOpenRefundRecovery} />
    )
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Open refund point recovery' })
    )
    expect(onOpenRefundRecovery).toHaveBeenCalledWith({
      customerId: customer.customerId,
      customerName: customer.username,
    })
  })

  it('shows each customer’s orders, point-to-task reference, tasks, and scoped audit', async () => {
    renderWithQuery(<AdminPointAdjustments />)
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))

    expect(screen.getByRole('tab', { name: 'Recharge orders' })).toBeVisible()
    expect(await screen.findByText(order.orderNumber)).toBeVisible()

    fireEvent.click(screen.getByRole('tab', { name: 'Point details' }))
    expect(await screen.findByText('Task settlement')).toBeVisible()
    expect(
      screen.getAllByText('85000000-0000-7000-8000-000000000006').length
    ).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('tab', { name: 'Tasks' }))
    expect(await screen.findByText('Canvas Image')).toBeVisible()
    expect(screen.getByText('Consumed points')).toBeVisible()

    fireEvent.click(screen.getByRole('tab', { name: 'Customer audit' }))
    await waitFor(() =>
      expect(apiMocks.getCanvasAuditEvents).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: customer.customerId }),
        expect.any(AbortSignal)
      )
    )
  })

  it('loads a prefilled refund order without validating untouched refund fields', async () => {
    renderWithQuery(
      <AdminRefundRecovery
        prefill={{
          customerId: customer.customerId,
          customerName: customer.username,
          orderId: order.id,
          orderNumber: order.orderNumber,
        }}
      />
    )

    await waitFor(() =>
      expect(apiMocks.getCanvasAdminRechargeOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({
          customerId: customer.customerId,
          search: order.orderNumber,
        }),
        expect.any(AbortSignal)
      )
    )
    expect(await screen.findByText(/Prefilled customer/)).toBeVisible()
    expect(
      screen.getByLabelText('Externally confirmed refund amount (minor units)')
    ).toBeVisible()
    expect(screen.queryByText('This field is required')).not.toBeInTheDocument()
  })

  it('restores a hidden column through the localized view menu', async () => {
    renderWithQuery(<AdminPointAdjustments />)
    expect(await screen.findByText('uatcustomer')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Customer name' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hide' }))
    expect(screen.queryByText('uatcustomer')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    const customerToggle = await screen.findByRole('menuitemcheckbox', {
      name: 'Customer name',
    })
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'Actions' })
    ).not.toBeInTheDocument()
    fireEvent.click(customerToggle)
    expect(await screen.findByText('uatcustomer')).toBeVisible()
  })

  it('disables a Point Lot whose available balance is zero', async () => {
    renderWithQuery(<AdminPointAdjustments />)
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(
      screen.getByRole('tab', { name: 'Deduct from a Point Lot' })
    )
    expect(screen.getByText('All types')).toBeVisible()
    expect(screen.queryByText('ALL')).not.toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Unavailable' })
    ).toBeDisabled()
    expect(screen.getByText('Task-reserved points')).toBeVisible()
    expect(
      screen.getByText(
        'Points currently held for running or unsettled tasks. Manual deductions do not change them.'
      )
    ).toBeVisible()
  })

  it('explains order matching and reveals the Paid correction form only after an explicit order selection', async () => {
    renderWithQuery(<AdminPointAdjustments />)
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Correct Paid points' }))

    const search = screen.getByPlaceholderText(
      'Enter a full order number or any consecutive fragment'
    )
    expect(search).toHaveAttribute(
      'placeholder',
      'Enter a full order number or any consecutive fragment'
    )
    expect(
      screen.getByText(/Matches only Canvas recharge order numbers/)
    ).toBeVisible()
    expect(
      screen.getByText(/Only orders with verified missing Paid issuance/)
    ).toBeVisible()
    const correctionCard = search.closest<HTMLElement>('[data-slot="card"]')
    if (!correctionCard) throw new Error('Paid correction card was not found')
    expect(
      within(correctionCard).queryByText('All statuses')
    ).not.toBeInTheDocument()
    expect(screen.getAllByText('Expected Paid points').length).toBeGreaterThan(
      0
    )
    expect(screen.getAllByText('Issued Paid points').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Available Paid points for this order').length
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Remaining correctable points').length
    ).toBeGreaterThan(0)
    expect(screen.getAllByText('Order created at').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Recharge code redeemed at').length
    ).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Paid points')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '3F52CD' } })
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminRechargeOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: '3F52CD' }),
        expect.any(AbortSignal)
      )
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Select' }))
    expect(screen.getByText('Selected order')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Selected' })).toBeVisible()
    expect(screen.getByLabelText('Paid points')).toHaveFocus()
    expect(screen.getByLabelText('Paid points')).toHaveAttribute('max', '100')
    expect(
      screen.getByRole('button', { name: 'Choose another order' })
    ).toBeVisible()
  })

  it('rejects a Paid correction above the verified missing issuance', async () => {
    renderWithQuery(<AdminPointAdjustments />)
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Correct Paid points' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Select' }))
    fireEvent.change(screen.getByLabelText('Paid points'), {
      target: { value: '101' },
    })
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'verified historical under-issuance' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review Paid correction' })
    )
    expect(
      await screen.findByText(
        'Points cannot exceed the remaining correction amount'
      )
    ).toBeVisible()
  })
})

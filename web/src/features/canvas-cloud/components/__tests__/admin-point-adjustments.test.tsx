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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('../../api', () => apiMocks)
vi.mock('sonner', () => ({ toast: toastMocks }))

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
    apiMocks.grantCanvasPaidCorrection.mockResolvedValue({ pointLotId: 'lot' })
    apiMocks.deductCanvasPointLot.mockResolvedValue({ pointLotId: 'lot' })
    apiMocks.createCanvasRefund.mockResolvedValue({ id: 'refund' })
  })

  it('keeps adjustments in a customer-scoped side drawer', async () => {
    renderWithQuery(<AdminPointAdjustments />)
    expect(screen.getByPlaceholderText('Search customer name')).toBeVisible()
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.queryByLabelText('Bonus points')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Grant Bonus points' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
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
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to customer list' })
    )
    expect(screen.getByPlaceholderText('Search customer name')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Back to customer list' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.queryByLabelText('Bonus points')).not.toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('tab', { name: 'Point Lots' }))
    expect(screen.getByPlaceholderText('Search Point Lots')).toBeVisible()
    expect(
      screen.queryByPlaceholderText('Search point events')
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Point ledger' }))
    expect(screen.getByPlaceholderText('Search point events')).toBeVisible()
    expect(
      screen.queryByPlaceholderText('Search Point Lots')
    ).not.toBeInTheDocument()
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

  it('renders known administrator, resource, and reason audit values', async () => {
    apiMocks.getCanvasAuditEvents.mockResolvedValue({
      page: 1,
      pageSize: 50,
      total: 1,
      items: [
        {
          id: '85000000-0000-7000-8000-000000000020',
          occurredAt: '2026-09-01T01:00:00.000Z',
          actorType: 'PLATFORM_ADMIN',
          actorExternalSystem: 'new-api',
          actorExternalId: '1',
          resourceType: 'POINT_LEDGER',
          resourceId: '85000000-0000-7000-8000-000000000005',
          reasonCode: 'SELECTED_LOT_DEDUCTION',
          category: 'POINTS',
          action: 'points.manual_deduction.posted',
          outcome: 'SUCCESS',
        },
      ],
    })
    renderWithQuery(<AdminPointAdjustments />)
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Customer audit' }))
    expect(
      await screen.findByRole('cell', { name: /Platform administrator/ })
    ).toBeVisible()
    expect(screen.getByRole('cell', { name: /Point ledger/ })).toBeVisible()
    expect(screen.getByText('Selected Point Lot deduction')).toBeVisible()
    expect(screen.queryByText('Unknown actor')).not.toBeInTheDocument()
    expect(screen.queryByText('Unknown resource')).not.toBeInTheDocument()
    expect(screen.queryByText('Unknown reason')).not.toBeInTheDocument()
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

  it('offers deduction only on an eligible Point Lot row', async () => {
    renderWithQuery(<AdminPointAdjustments />)
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Point Lots' }))
    expect(screen.getByText('All types')).toBeVisible()
    expect(screen.queryByText('ALL')).not.toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Deduct points' })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Unavailable' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('Task-reserved points')).toBeVisible()
  })

  it('opens a Paid correction drawer from the eligible recharge-order row', async () => {
    renderWithQuery(<AdminPointAdjustments />)
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(await screen.findByText(order.orderNumber)).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Correct Paid points' })
    ).toBeVisible()
    expect(screen.queryByLabelText('Paid points')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Correct Paid points' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(screen.getByLabelText('Paid points')).toHaveAttribute('max', '100')
  })

  it('rejects a Paid correction above the verified missing issuance', async () => {
    renderWithQuery(<AdminPointAdjustments />)
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Correct Paid points' })
    )
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

  it('refreshes the selected customer summary after a successful adjustment', async () => {
    renderWithQuery(<AdminPointAdjustments />)
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Correct Paid points' })
    )
    fireEvent.change(screen.getByLabelText('Paid points'), {
      target: { value: '50' },
    })
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'verified historical under-issuance' },
    })
    apiMocks.getCanvasAdminCustomers.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        { ...customer, availablePoints: '950', paidAvailablePoints: '550' },
      ],
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review Paid correction' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm adjustment' })
    )
    await waitFor(() =>
      expect(apiMocks.grantCanvasPaidCorrection).toHaveBeenCalled()
    )
    expect(await screen.findByText('Available points: 950')).toBeVisible()
    expect(screen.getByText('Paid points: 550')).toBeVisible()
  })

  it('shows one actionable toast and reloads the Lot after a concurrent deduction rejection', async () => {
    renderWithQuery(<AdminPointAdjustments />)
    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Point Lots' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Deduct points' })
    )
    fireEvent.change(screen.getByLabelText('Points to deduct'), {
      target: { value: '400' },
    })
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'confirmed customer support deduction' },
    })
    apiMocks.getCanvasAdminCustomerPointLots.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: '85000000-0000-7000-8000-000000000003',
          type: 'BONUS',
          sourceType: 'MANUAL_GRANT',
          rechargeOrderId: null,
          rechargeOrderNumber: null,
          initialPoints: '500',
          remainingPoints: '300',
          reservedPoints: '100',
          availablePoints: '200',
          expiresAt: '2026-12-01T00:00:00.000Z',
          issuedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
    })
    apiMocks.deductCanvasPointLot.mockRejectedValue({
      response: { data: { code: 'INSUFFICIENT_AVAILABLE_POINTS' } },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Review deduction' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm adjustment' })
    )
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        'Deduction cannot exceed current available points 200. Please enter a new amount.'
      )
    )
    expect(toastMocks.error).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Points to deduct')).toHaveValue('')
    expect(screen.getByLabelText('Reason')).toHaveValue(
      'confirmed customer support deduction'
    )
  })
})

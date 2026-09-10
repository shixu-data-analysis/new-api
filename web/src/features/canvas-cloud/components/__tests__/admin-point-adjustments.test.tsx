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

const apiMocks = vi.hoisted(() => ({
  createCanvasOrderPointReturn: vi.fn(),
  deductCanvasPointLot: vi.fn(),
  getCanvasAdminCustomer: vi.fn(),
  getCanvasAdminCustomerPointLots: vi.fn(),
  getCanvasAdminCustomerPointLedger: vi.fn(),
  getCanvasAdminCustomerTasks: vi.fn(),
  getCanvasAdminCustomers: vi.fn(),
  getCanvasAdminRechargeOrders: vi.fn(),
  getCanvasCustomerPriceAssignments: vi.fn(),
  getCanvasOrderPointReturns: vi.fn(),
  getCanvasPriceGroups: vi.fn(),
  grantCanvasManualBonus: vi.fn(),
  grantCanvasPaidCorrection: vi.fn(),
  previewCanvasOrderPointReturn: vi.fn(),
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
  username: 'uatcustomer',
  emailMasked: null,
  status: 'ACTIVE' as const,
  availablePoints: '900',
  paidAvailablePoints: '500',
  bonusAvailablePoints: '400',
  debtPoints: '20',
  netAvailablePoints: '880',
}
const order = {
  id: '85000000-0000-7000-8000-000000000002',
  orderNumber: 'CANVAS-20260901-001',
  customerId: customer.customerId,
  customerName: customer.username,
  customerEmailMasked: null,
  status: 'CODE_ACTIVATED',
  currency: 'CNY',
  listedAmountMinor: '100',
  rechargeCodeMask: 'CANVAS-A••••1234',
  rechargeCodeStatus: 'REDEEMED',
  expectedPaidPoints: '3',
  purchasedPoints: '3',
  originalPaidPoints: '3',
  correctedPaidPoints: '0',
  issuedPaidPoints: '3',
  issuedBonusPoints: '1',
  availablePaidPoints: '3',
  availableBonusPoints: '1',
  pointReturnCount: 0,
  returnedPoints: '0',
  returnedReferenceAmountMinor: '0',
  remainingCorrectionPoints: '0',
  eligibleForPaidCorrection: false,
  paidCorrectionIneligibleReason: 'NO_CORRECTION_GAP',
  createdAt: '2026-09-01T00:00:00.000Z',
  redeemedAt: '2026-09-01T00:05:00.000Z',
}

describe('ADMIN-REWORK-004 customer management', () => {
  beforeAll(() =>
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  )

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasAdminCustomers.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [customer],
    })
    apiMocks.getCanvasAdminCustomer.mockResolvedValue(customer)
    apiMocks.getCanvasAdminRechargeOrders.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [order],
    })
    apiMocks.getCanvasAdminCustomerPointLots.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: '85000000-0000-7000-8000-000000000003',
          type: 'PAID',
          sourceType: 'RECHARGE_CODE',
          rechargeOrderId: order.id,
          rechargeOrderNumber: order.orderNumber,
          initialPoints: '3',
          remainingPoints: '3',
          reservedPoints: '0',
          availablePoints: '3',
          expiresAt: '2026-12-01T00:00:00.000Z',
          issuedAt: '2026-09-01T00:05:00.000Z',
        },
      ],
    })
    apiMocks.getCanvasAdminCustomerPointLedger.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    apiMocks.getCanvasCustomerPriceAssignments.mockResolvedValue({
      customerId: customer.customerId,
      customerName: customer.username,
      currentGroup: {
        id: '85000000-0000-7000-8000-000000000010',
        internalName: 'Standard',
        version: 1,
        status: 'PUBLISHED',
      },
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    apiMocks.getCanvasPriceGroups.mockResolvedValue([])
    apiMocks.getCanvasOrderPointReturns.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    apiMocks.previewCanvasOrderPointReturn.mockResolvedValue({
      rechargeOrderId: order.id,
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      currency: 'CNY',
      originalOrderAmountMinor: '100',
      originalPurchasedPoints: '3',
      availablePaidPoints: '3',
      cumulativeReturnedPoints: '0',
      cumulativeReferenceAmountMinor: '0',
      returnPoints: '1',
      referenceAmountMinor: '33',
      remainingAvailablePaidPoints: '2',
    })
    apiMocks.createCanvasOrderPointReturn.mockResolvedValue({ id: 'return-1' })
    apiMocks.deductCanvasPointLot.mockResolvedValue({ id: 'ledger-1' })
    apiMocks.grantCanvasManualBonus.mockResolvedValue({ id: 'bonus-lot-1' })
  })

  it('uses the username as a real details link with a separate copy control', async () => {
    const onCustomerChange = vi.fn()
    renderWithQuery(
      <AdminPointAdjustments onCustomerChange={onCustomerChange} />
    )
    const link = await screen.findByRole('link', { name: 'uatcustomer' })
    expect(link).toHaveAttribute(
      'href',
      expect.stringContaining(`customerId=${customer.customerId}`)
    )
    expect(
      screen.getByRole('button', { name: 'Copy uatcustomer' })
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Select' })
    ).not.toBeInTheDocument()
    fireEvent.click(link)
    expect(onCustomerChange).toHaveBeenCalledWith(customer.customerId)
    expect(await screen.findByText(/Outstanding debt/)).toBeVisible()
    expect(screen.queryByText('Customer management')).not.toBeInTheDocument()
    expect(screen.queryByText('Customer details')).not.toBeInTheDocument()
  })

  it('loads an exact customer directly and shows only the three confirmed primary tabs', async () => {
    renderWithQuery(<AdminPointAdjustments customerId={customer.customerId} />)
    expect(
      await screen.findByRole('tab', { name: 'Recharge records' })
    ).toBeVisible()
    expect(apiMocks.getCanvasAdminCustomer).toHaveBeenCalledWith(
      customer.customerId,
      expect.any(AbortSignal)
    )
    expect(screen.queryByText('Customer details')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Point details' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Consumption tasks' })).toBeVisible()
    expect(
      screen.queryByRole('tab', { name: 'Customer audit' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: 'Business facts' })
    ).not.toBeInTheDocument()
  })

  it('restores the customer-list search and scroll position after returning from details', async () => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 280,
    })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderWithQuery(<AdminPointAdjustments />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Column filters' })
    )
    fireEvent.change(screen.getByPlaceholderText('Username'), {
      target: { value: 'uat' },
    })
    fireEvent.click(screen.getByRole('link', { name: 'uatcustomer' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Back to customer list' })
    )

    expect(
      await screen.findByRole('link', { name: 'uatcustomer' })
    ).toBeVisible()
    expect(screen.queryByText('Customer management')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Column filters/ }))
    expect(screen.getByPlaceholderText('Username')).toHaveValue('uat')
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 280 }))
    scrollTo.mockRestore()
  })

  it('reviews and confirms a gift in one drawer while preserving edits on back', async () => {
    renderWithQuery(<AdminPointAdjustments customerId={customer.customerId} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Gift points' }))
    const drawer = await screen.findByRole('dialog')
    fireEvent.change(within(drawer).getByLabelText('Gift points *'), {
      target: { value: '25' },
    })
    fireEvent.change(within(drawer).getByLabelText('Reason *'), {
      target: { value: 'customer service gesture' },
    })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Select date' }))
    const today = new Date()
    const todayButton = document.querySelector<HTMLButtonElement>(
      `button[data-day="${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}"]`
    )
    expect(todayButton).not.toBeNull()
    if (!todayButton) throw new Error("Expected today's calendar button")
    fireEvent.click(todayButton)
    fireEvent.click(within(drawer).getByRole('button', { name: 'Next' }))

    expect(
      await within(drawer).findByRole('heading', {
        name: 'Confirm gift · uatcustomer',
      })
    ).toBeVisible()
    fireEvent.click(
      within(drawer).getByRole('button', { name: 'Back to edit' })
    )
    expect(within(drawer).getByLabelText('Gift points *')).toHaveValue('25')
    expect(within(drawer).getByLabelText('Reason *')).toHaveValue(
      'customer service gesture'
    )
    fireEvent.click(within(drawer).getByRole('button', { name: 'Next' }))
    const confirm = await within(drawer).findByRole('button', {
      name: 'Confirm gift',
    })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(apiMocks.grantCanvasManualBonus).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: customer.customerId,
          points: '25',
          reason: 'customer service gesture',
        })
      )
    )
    expect(apiMocks.grantCanvasManualBonus).toHaveBeenCalledTimes(1)
  })

  it('reviews and confirms an order-scoped point return in the same drawer', async () => {
    renderWithQuery(<AdminPointAdjustments customerId={customer.customerId} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Return points' })
    )
    const drawer = await screen.findByRole('dialog')
    fireEvent.change(within(drawer).getByLabelText('Points to return *'), {
      target: { value: '1' },
    })
    fireEvent.change(within(drawer).getByLabelText('Reason *'), {
      target: { value: 'offline refund agreed' },
    })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(apiMocks.previewCanvasOrderPointReturn).toHaveBeenCalledWith({
        rechargeOrderId: order.id,
        points: '1',
      })
    )
    expect(within(drawer).getByText(/Refund reference amount/)).toBeVisible()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    const confirm = within(drawer).getByRole('button', {
      name: 'Confirm return points',
    })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(apiMocks.createCanvasOrderPointReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          rechargeOrderId: order.id,
          points: '1',
          expectedAvailablePaidPoints: '3',
          expectedReferenceAmountMinor: '33',
        })
      )
    )
    expect(apiMocks.createCanvasOrderPointReturn).toHaveBeenCalledTimes(1)
  })

  it("closes an old customer's adjustment draft when the routed customer changes", async () => {
    const nextCustomerId = '85000000-0000-7000-8000-000000000099'
    apiMocks.getCanvasAdminCustomer.mockImplementation(async (customerId) => ({
      ...customer,
      customerId,
      username: customerId === nextCustomerId ? 'next-customer' : 'uatcustomer',
    }))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const view = (customerId: string) => (
      <QueryClientProvider client={client}>
        <AdminPointAdjustments customerId={customerId} />
      </QueryClientProvider>
    )
    const rendered = render(view(customer.customerId))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Return points' })
    )
    const drawer = await screen.findByRole('dialog')
    fireEvent.change(within(drawer).getByLabelText('Reason *'), {
      target: { value: 'old customer draft' },
    })

    rendered.rerender(view(nextCustomerId))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await screen.findByText('next-customer')).toBeVisible()
  })

  it('expands the selected order return history with server-side filters', async () => {
    apiMocks.getCanvasAdminRechargeOrders.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [{ ...order, pointReturnCount: 1 }],
    })
    apiMocks.getCanvasOrderPointReturns.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: '85000000-0000-7000-8000-000000000020',
          rechargeOrderId: order.id,
          customerId: customer.customerId,
          points: '1',
          referenceAmountMinor: '33',
          currency: 'CNY',
          actorName: 'Canvas Admin',
          reason: 'service adjustment',
          createdAt: '2026-09-01T01:00:00.000Z',
        },
      ],
    })
    renderWithQuery(<AdminPointAdjustments customerId={customer.customerId} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Return history' })
    )
    const heading = await screen.findByText(
      `Return history · ${order.orderNumber}`
    )
    const history = heading.parentElement
    if (!history) throw new Error('Expected return history container')
    expect(await within(history).findByText('Canvas Admin')).toBeVisible()
    expect(within(history).getByText('service adjustment')).toBeVisible()
    fireEvent.click(
      within(history).getByRole('button', { name: 'Column filters' })
    )
    fireEvent.change(await screen.findByPlaceholderText('Reason'), {
      target: { value: 'service' },
    })
    fireEvent.change(screen.getByPlaceholderText('Operator'), {
      target: { value: 'admin' },
    })
    await waitFor(() =>
      expect(apiMocks.getCanvasOrderPointReturns).toHaveBeenLastCalledWith(
        customer.customerId,
        order.id,
        expect.objectContaining({ reason: 'service', operator: 'admin' }),
        expect.any(AbortSignal)
      )
    )
  })

  it('keeps point lots and change ledger as nested point-detail tabs', async () => {
    renderWithQuery(<AdminPointAdjustments customerId={customer.customerId} />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Point details' }))
    expect(screen.getByRole('tab', { name: 'Point lots' })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Change ledger' })).toBeVisible()
    expect(
      await screen.findByRole('button', { name: order.orderNumber })
    ).toBeVisible()
  })

  it('refreshes the exact Point Lot before deduction review and rejects a stale amount', async () => {
    renderWithQuery(<AdminPointAdjustments customerId={customer.customerId} />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Point details' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Deduct points' })
    )
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText(/Customer: uatcustomer/)).toBeVisible()
    fireEvent.change(within(drawer).getByLabelText('Points to deduct *'), {
      target: { value: '3' },
    })
    fireEvent.change(within(drawer).getByLabelText('Reason *'), {
      target: { value: 'manual correction' },
    })
    const latestLot = {
      ...(await apiMocks.getCanvasAdminCustomerPointLots.mock.results[0].value)
        .items[0],
      remainingPoints: '2',
      availablePoints: '2',
    }
    apiMocks.getCanvasAdminCustomerPointLots.mockResolvedValueOnce({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [latestLot],
    })

    fireEvent.click(within(drawer).getByRole('button', { name: 'Next' }))

    await waitFor(() =>
      expect(apiMocks.getCanvasAdminCustomerPointLots).toHaveBeenLastCalledWith(
        customer.customerId,
        expect.objectContaining({
          lotId: latestLot.id,
          page: 1,
          pageSize: 20,
        })
      )
    )
    expect(within(drawer).getByLabelText('Points to deduct *')).toHaveValue('')
    expect(within(drawer).getByLabelText('Reason *')).toHaveValue(
      'manual correction'
    )
    expect(toastMocks.error).toHaveBeenCalledWith(
      'Deduction cannot exceed current available points 2. Please enter a new amount.'
    )
    expect(
      within(drawer).queryByRole('button', { name: 'Confirm deduction' })
    ).not.toBeInTheDocument()
  })

  it('confirms a refreshed Point Lot deduction once from the shared drawer', async () => {
    renderWithQuery(<AdminPointAdjustments customerId={customer.customerId} />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Point details' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Deduct points' })
    )
    const drawer = await screen.findByRole('dialog')
    fireEvent.change(within(drawer).getByLabelText('Points to deduct *'), {
      target: { value: '1' },
    })
    fireEvent.change(within(drawer).getByLabelText('Reason *'), {
      target: { value: 'manual correction' },
    })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Next' }))

    const confirm = await within(drawer).findByRole('button', {
      name: 'Confirm deduction',
    })
    expect(within(drawer).getByText(customer.username)).toBeVisible()
    expect(
      within(drawer).getByText('85000000-0000-7000-8000-000000000003')
    ).toBeVisible()
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(apiMocks.deductCanvasPointLot).toHaveBeenCalledWith({
        pointLotId: '85000000-0000-7000-8000-000000000003',
        points: '1',
        reason: 'manual correction',
      })
    )
    expect(apiMocks.deductCanvasPointLot).toHaveBeenCalledTimes(1)
  })

  it('opens an exact source order and returns to the originating point tab', async () => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 420,
    })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderWithQuery(<AdminPointAdjustments customerId={customer.customerId} />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Point details' }))
    fireEvent.click(
      await screen.findByRole('button', { name: order.orderNumber })
    )

    await waitFor(() =>
      expect(apiMocks.getCanvasAdminRechargeOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({
          customerId: customer.customerId,
          orderId: order.id,
        }),
        expect.any(AbortSignal)
      )
    )
    const exactQuery = apiMocks.getCanvasAdminRechargeOrders.mock.lastCall?.[0]
    expect(exactQuery).not.toHaveProperty('orderNumber')
    expect(exactQuery).not.toHaveProperty('status')
    const exactRow = await waitFor(() => {
      const row = document.querySelector<HTMLElement>(
        `#recharge-order-${order.id}`
      )
      expect(row).not.toBeNull()
      if (!row) throw new Error('Expected exact recharge-order row')
      return row
    })
    expect(within(exactRow).getByText(order.orderNumber)).toBeVisible()
    expect(
      within(exactRow).queryByRole('button', { name: order.orderNumber })
    ).not.toBeInTheDocument()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Back to point details' })
    )
    expect(screen.getByRole('tab', { name: 'Point details' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tab', { name: 'Point lots' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 420 }))
    scrollTo.mockRestore()
  })

  it('explains when an exact linked order no longer exists', async () => {
    apiMocks.getCanvasAdminRechargeOrders.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    renderWithQuery(
      <AdminPointAdjustments
        customerId={customer.customerId}
        orderId={order.id}
      />
    )
    expect(
      await screen.findByText('The linked recharge order is unavailable')
    ).toBeVisible()
  })
})

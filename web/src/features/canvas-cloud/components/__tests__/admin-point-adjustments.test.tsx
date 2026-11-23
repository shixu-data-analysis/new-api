import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  getCanvasAgents: vi.fn(),
  getCanvasAdminAgentStatistics: vi.fn(),
  getCanvasAdminAgentModelPrices: vi.fn(),
  getCanvasAdminAgentCustomers: vi.fn(),
  getCanvasAdminInviteCodes: vi.fn(),
  revealCanvasCode: vi.fn(),
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
// The shared task details have their own tests; here only which task opens matters.
// The agent link is a router Link; here it renders the address it would open.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: (props: {
    to: string
    params: { section: string }
    search: Record<string, string>
    className?: string
    children: ReactNode
  }) => (
    <a
      className={props.className}
      href={`${props.to.replace('$section', props.params.section)}?${new URLSearchParams(props.search)}`}
    >
      {props.children}
    </a>
  ),
}))
vi.mock('../AdminTaskRecordDetails', () => ({
  AdminTaskRecordDetails: (props: { taskId: string }) => (
    <p>Shared task record {props.taskId}</p>
  ),
}))

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
  isAgent: false,
  agentStatus: null,
  availablePoints: '900',
  paidAvailablePoints: '500',
  bonusAvailablePoints: '400',
  debtPoints: '20',
  netAvailablePoints: '880',
}
// The list row adds the referring agent and the recharge and Bonus totals.
const customerListItem = {
  ...customer,
  referralAgent: null,
  rechargedPoints: '500',
  grantedBonusPoints: '400',
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
      items: [customerListItem],
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

  it('opens a consumption task in the same details as Task Records', async () => {
    const taskId = '85000000-0000-7000-8000-000000000077'
    apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: taskId,
          displayNameSnapshot: 'Canvas Image',
          quotedPoints: '20',
          allocatedPoints: '20',
          settledPoints: '12',
          releasedPoints: '8',
          executionStatus: 'SUCCEEDED',
          customerBillingStatus: 'SETTLED',
          providerReconcileStatus: 'RECONCILED',
          upstreamTaskId: null,
          acceptedAt: '2026-09-03T00:00:00.000Z',
          completedAt: '2026-09-03T00:02:00.000Z',
        },
      ],
    })
    renderWithQuery(<AdminPointAdjustments customerId={customer.customerId} />)
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('tab', { name: 'Consumption tasks' })
    )
    await user.click(await screen.findByRole('button', { name: taskId }))

    const sheet = await screen.findByRole('dialog', { name: 'Task details' })
    expect(
      within(sheet).getByText(`Shared task record ${taskId}`)
    ).toBeVisible()
  })

  it('filters agent identity while retaining disabled agents as agents', async () => {
    const user = userEvent.setup()
    apiMocks.getCanvasAdminCustomers.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [{ ...customerListItem, isAgent: true, agentStatus: 'DISABLED' }],
    })
    renderWithQuery(<AdminPointAdjustments />)
    expect(await screen.findByText('Agent')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(screen.getByRole('combobox', { name: 'Agent identity' }))
    await user.click(await screen.findByRole('option', { name: 'Agent' }))
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminCustomers).toHaveBeenCalledWith(
        expect.objectContaining({ agentIdentity: 'AGENT' }),
        expect.anything()
      )
    )
  })

  it('opens agent statistics only for an agent identity', async () => {
    const user = userEvent.setup()
    apiMocks.getCanvasAdminCustomer.mockResolvedValue({
      ...customer,
      isAgent: true,
      agentStatus: 'DISABLED',
    })
    apiMocks.getCanvasAdminAgentStatistics.mockResolvedValue({
      profile: {
        principalId: 'agent-v1',
        username: 'uatcustomer',
        status: 'DISABLED',
        createdAt: '2026-01-01T00:00:00Z',
      },
      summary: {
        activatedCustomers: 0,
        customersWithConsumption: 0,
        rechargedPoints: '0',
        consumedPoints: '0',
      },
      priceGroups: [],
    })
    apiMocks.getCanvasAdminAgentModelPrices.mockResolvedValue({
      page: 1,
      pageSize: 10,
      total: 1,
      filters: { capabilities: ['IMAGE'], tags: [] },
      iconVisibility: { categories: true, models: true },
      items: [
        {
          customerModelId: 'model-v3',
          modelKey: 'image.model',
          effectiveDisplayName: 'Latest Image Model',
          catalogDefaultName: 'Catalog Image Model',
          description: null,
          capability: 'IMAGE',
          tags: [],
          priceGroups: [
            {
              priceGroupId: 'group-v1',
              priceGroupName: 'Standard',
              prices: [
                {
                  combinationKey: 'default',
                  parameters: {},
                  billingUnit: 'REQUEST',
                  customerPoints: '5',
                  customerTokenRates: null,
                  modelPriceCny: '0.25',
                },
              ],
            },
          ],
        },
      ],
    })
    apiMocks.getCanvasAdminAgentCustomers.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
      recentDays: [],
    })
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'invite-v1',
          maskedCode: 'CANVAS-••••',
          status: 'ACTIVE',
          priceGroupName: 'Standard',
          consumedCount: '1',
          maxRegistrations: '10',
          activatedCustomers: '1',
          expiresAt: '2027-01-01T00:00:00Z',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      exactFilter: null,
    })
    apiMocks.revealCanvasCode.mockResolvedValue({ code: 'CANVAS-SECRET' })
    renderWithQuery(<AdminPointAdjustments customerId={customer.customerId} />)
    expect(await screen.findByText('Agent: Disabled')).toBeVisible()
    // Current model prices load with the agent statistics tab, not with the customer detail.
    expect(apiMocks.getCanvasAdminAgentModelPrices).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'Agent statistics' }))
    // The agent's own overview, plus the earnings and the link to statements; no task totals, price group summary or
    // list amount.
    expect(await screen.findByText('Summary')).toBeVisible()
    expect(screen.getByText('Customers with consumption')).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: 'View statements and withdrawal requests',
      })
    ).toBeVisible()
    expect(
      screen.queryByText('Customers with successful tasks')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Price group summary')).not.toBeInTheDocument()
    expect(screen.queryByText('List amount')).not.toBeInTheDocument()

    // Customers first, filtered like the agent's own list.
    expect(screen.getByRole('tab', { name: 'Customer' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await user.click(
      within(screen.getByRole('tabpanel', { name: 'Customer' })).getByRole(
        'button',
        { name: /^Filters/u }
      )
    )
    await user.click(screen.getByRole('combobox', { name: 'Status' }))
    await user.click(await screen.findByRole('option', { name: 'Valid' }))
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminAgentCustomers).toHaveBeenCalledWith(
        customer.customerId,
        expect.objectContaining({ status: 'ACTIVE', page: 1 }),
        expect.anything()
      )
    )

    // Invite codes keep their reveal action in their own tab.
    await user.keyboard('{Escape}')
    fireEvent.click(screen.getByRole('tab', { name: 'Invite codes' }))
    expect(apiMocks.getCanvasAdminInviteCodes).toHaveBeenCalledWith(
      expect.objectContaining({ inviterPrincipalId: 'agent-v1' }),
      expect.anything()
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show invite code' })
    )
    await waitFor(() =>
      expect(apiMocks.revealCanvasCode).toHaveBeenCalledWith(
        'admin-invite',
        'invite-v1',
        'DISPLAY'
      )
    )

    // Current model prices load once their tab is opened, laid out like the model center without a collapse control.
    expect(apiMocks.getCanvasAdminAgentModelPrices).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'Current model prices' }))
    expect(await screen.findByText('Latest Image Model')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /^(Expand|Collapse)$/u })
    ).not.toBeInTheDocument()
    expect(apiMocks.getCanvasAdminAgentModelPrices).toHaveBeenCalledWith(
      customer.customerId,
      expect.objectContaining({ page: 1, pageSize: 20 }),
      expect.anything()
    )
  })

  it('restores the customer-list search and scroll position after returning from details', async () => {
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 280,
    })
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    renderWithQuery(<AdminPointAdjustments />)
    fireEvent.click(await screen.findByRole('button', { name: 'Filters' }))
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
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
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
    fireEvent.click(within(history).getByRole('button', { name: 'Filters' }))
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
    const pointLotsTab = screen.getByRole('tab', { name: 'Point lots' })
    expect(pointLotsTab).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Change ledger' })).toBeVisible()
    expect(pointLotsTab.closest('[role="tablist"]')).toHaveClass(
      'w-full',
      'max-w-full',
      'justify-start',
      'overflow-x-auto'
    )
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

describe('CUSTOMER-AGENT-RECHARGE-001 referring agent and recharge', () => {
  const agentCustomerId = '85000000-0000-7000-8000-0000000000a1'
  const referred = {
    ...customer,
    referralAgent: {
      principalId: '85000000-0000-7000-8000-0000000000b1',
      customerId: agentCustomerId,
      username: 'linxiao',
    },
    rechargedPoints: '50000',
    grantedBonusPoints: '3300',
  }
  const direct = {
    ...customer,
    customerId: '85000000-0000-7000-8000-0000000000c1',
    username: 'kite',
    referralAgent: null,
    rechargedPoints: '0',
    grantedBonusPoints: '300',
  }

  beforeAll(() =>
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  )

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasAdminCustomers.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 2,
      items: [referred, direct],
    })
    apiMocks.getCanvasAgents.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          principalId: referred.referralAgent.principalId,
          username: 'linxiao',
          status: 'ACTIVE',
        },
      ],
    })
  })

  it("links the referring agent to the agent's statistics tab and names customers without one", async () => {
    renderWithQuery(<AdminPointAdjustments />)

    expect(
      await screen.findByRole('link', { name: 'linxiao' })
    ).toHaveAttribute(
      'href',
      `/canvas-cloud/customers?customerId=${agentCustomerId}&tab=agent-statistics`
    )
    const directRow = screen.getByRole('link', { name: 'kite' }).closest('tr')!
    expect(within(directRow).getByText('No agent')).toBeVisible()
  })

  it('shows recharge points and Not recharged at zero', async () => {
    renderWithQuery(<AdminPointAdjustments />)

    const referredRow = (
      await screen.findByRole('link', { name: 'uatcustomer' })
    ).closest('tr')!
    expect(within(referredRow).getByText('50,000')).toBeVisible()
    const directRow = screen.getByRole('link', { name: 'kite' }).closest('tr')!
    expect(within(directRow).getByText('Not recharged')).toBeVisible()
  })

  it('hides granted Bonus points until shown from View, and never offers to hide the username', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AdminPointAdjustments />)
    await screen.findByRole('link', { name: 'linxiao' })
    expect(
      screen.queryByRole('columnheader', { name: 'Total granted bonus points' })
    ).toBeNull()

    await user.click(screen.getByRole('button', { name: 'View' }))
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'Username' })
    ).toBeNull()
    await user.click(
      screen.getByRole('menuitemcheckbox', {
        name: 'Total granted bonus points',
      })
    )

    expect(
      await screen.findByRole('columnheader', {
        name: 'Total granted bonus points',
      })
    ).toBeVisible()
    expect(screen.getByText('3,300')).toBeVisible()
  })

  it('sends the recharge and no-agent filters and counts both on the Filters button', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AdminPointAdjustments />)
    await screen.findByRole('link', { name: 'linxiao' })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))

    await user.click(screen.getByRole('combobox', { name: 'Recharge status' }))
    await user.click(
      await screen.findByRole('option', { name: 'Not recharged' })
    )
    await user.click(screen.getByRole('combobox', { name: 'Referring agent' }))
    await user.click(await screen.findByRole('option', { name: 'No agent' }))

    await waitFor(() =>
      expect(apiMocks.getCanvasAdminCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({
          recharge: 'NOT_RECHARGED',
          noAgent: true,
          page: 1,
        }),
        expect.anything()
      )
    )
    expect(apiMocks.getCanvasAdminCustomers).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ agentPrincipalId: expect.anything() }),
      expect.anything()
    )
    expect(
      within(screen.getByRole('button', { name: /^Filters/ })).getByText('2')
    ).toBeVisible()
  })

  it('sends the chosen agent as the referring agent filter', async () => {
    const user = userEvent.setup()
    renderWithQuery(<AdminPointAdjustments />)
    await screen.findByRole('link', { name: 'linxiao' })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))

    await user.click(screen.getByRole('combobox', { name: 'Referring agent' }))
    await user.click(await screen.findByRole('option', { name: 'linxiao' }))

    await waitFor(() =>
      expect(apiMocks.getCanvasAdminCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({
          agentPrincipalId: referred.referralAgent.principalId,
        }),
        expect.anything()
      )
    )
  })

  it("opens an agent's customer details on the agent statistics tab when the link asks for it", async () => {
    apiMocks.getCanvasAdminCustomer.mockResolvedValue({
      ...customer,
      customerId: agentCustomerId,
      username: 'linxiao',
      isAgent: true,
      agentStatus: 'ACTIVE',
    })
    apiMocks.getCanvasAdminAgentStatistics.mockReturnValue(
      new Promise(() => {})
    )
    renderWithQuery(
      <AdminPointAdjustments
        customerId={agentCustomerId}
        customerDetailTab='agent-statistics'
      />
    )

    expect(
      await screen.findByRole('tab', { name: 'Agent statistics' })
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps a regular customer on recharge records when the link asks for agent statistics', async () => {
    apiMocks.getCanvasAdminCustomer.mockResolvedValue(customer)
    apiMocks.getCanvasAdminRechargeOrders.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    renderWithQuery(
      <AdminPointAdjustments
        customerId={customer.customerId}
        customerDetailTab='agent-statistics'
      />
    )

    expect(
      await screen.findByRole('tab', { name: 'Recharge records' })
    ).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: 'Agent statistics' })).toBeNull()
  })
})

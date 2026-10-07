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
import zh from '@/i18n/locales/zh.json'

import type { DashboardSummary } from '../../operating-dashboard-types'
import { PointsContributionPanel } from '../PointsContributionPanel'
import { ProviderBalancesPanel } from '../ProviderBalancesPanel'

const dashboardApi = vi.hoisted(() => ({
  getOperatingDashboard: vi.fn(),
  getOperatingDashboardBalances: vi.fn(),
  getOperatingDashboardFlows: vi.fn(),
  getOperatingDashboardCosts: vi.fn(),
  getOperatingDashboardModelOptions: vi.fn().mockResolvedValue({ items: [] }),
  getProviderBalances: vi.fn(),
  getProviderBalanceRecords: vi.fn(),
  addProviderBalanceRecord: vi.fn(),
  setProviderWebsite: vi.fn(),
  setProviderAlertThreshold: vi.fn(),
  setProviderDefaultAlertThreshold: vi.fn(),
  getProviderBalanceAlerts: vi.fn(),
  providerBalanceAlertsQueryKey: ['canvas-cloud', 'provider-balance-alerts'],
}))
const api = vi.hoisted(() => ({
  getCanvasAgents: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    exactFilter: null,
  }),
  getCanvasAdminCustomers: vi
    .fn()
    .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
  getCanvasCustomerBusinessFacts: vi.fn(),
}))
vi.mock('../../operating-dashboard-api', () => dashboardApi)
vi.mock('../../api', () => api)

const summary: DashboardSummary = {
  asOf: '2026-09-26T01:20:00.000Z',
  period: {
    from: '2026-08-31T15:00:00.000Z',
    to: '2026-09-26T01:20:00.000Z',
    timeZone: 'Asia/Tokyo',
    periodType: 'MONTH',
  },
  scope: { agentPrincipalId: null, noAgent: false, customerId: null },
  points: {
    opening: '10000',
    issued: '5000',
    consumed: '5500',
    expired: '1000',
    otherDecrease: '500',
    closing: '8000',
    available: '6500',
    expiringWithin7Days: '400',
    reservedValid: '1300',
    reservedExpired: '200',
    outstandingTaskDebt: '120',
  },
  cashSupportRmb: {
    opening: '224',
    issued: '100',
    consumed: '110',
    expired: '20',
    otherDecrease: '10',
    closing: '184',
  },
  cashSupportPerPoint: { closing: '0.023', consumed: '0.02' },
  reconciliation: {
    status: 'BALANCED',
    differencePoints: '0',
    differenceCashSupportRmb: '0',
    locatedImpactPoints: '0',
    unlocatedDifferencePoints: '0',
    issues: { items: [], total: 0, page: 1, pageSize: 20 },
  },
  consumption: {
    consumedPoints: '5500',
    listAmountRmb: '137.495',
    cashSupportRmb: '110.004',
    recordedCostRmb: '70',
    contributionRmb: '40.004',
    contributionRate: '0.3636',
    giftShare: '0.2',
    incompleteCostTaskCount: 3,
    unknownResultTaskCount: 1,
    provisional: true,
  },
  sources: {
    items: [
      { category: 'PURCHASED', points: '3500', cashSupportRmb: '90' },
      { category: 'RECHARGE_BONUS', points: '1000', cashSupportRmb: '20' },
      { category: 'INDEPENDENT_BONUS', points: '1000', cashSupportRmb: '0' },
    ],
    graceConvertedPoints: '300',
  },
  groups: {
    groupBy: 'MODEL',
    items: [
      {
        key: 'image.a',
        name: 'Image model A',
        modelStatus: 'ACTIVE',
        consumedPoints: '3000',
        listAmountRmb: '75',
        cashSupportRmb: '70',
        recordedCostRmb: '40',
        incompleteCostTaskCount: 2,
        modelCount: 1,
      },
      {
        key: 'text.c',
        name: 'Text model C',
        modelStatus: 'ACTIVE',
        consumedPoints: '500',
        listAmountRmb: '12.5',
        cashSupportRmb: '4',
        recordedCostRmb: '8',
        incompleteCostTaskCount: 0,
        modelCount: 1,
      },
    ],
    total: 2,
    page: 1,
    pageSize: 20,
    sortBy: 'consumedPoints',
    sortOrder: 'desc',
  },
  previous: {
    from: '2026-07-31T15:00:00.000Z',
    to: '2026-08-26T01:20:00.000Z',
    issuedPoints: '4630',
    consumedPoints: '5682',
    expiredPoints: '800',
    otherDecreasePoints: '500',
    listAmountRmb: '130',
    cashSupportRmb: '106',
    recordedCostRmb: '73.7',
    contributionRmb: '32.3',
    contributionRate: '0.3',
  },
}

function mount(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {node}
    </QueryClientProvider>
  )
}

describe('ADMIN-REWORK-008 operating dashboard', () => {
  beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: { en, zhCN: zh } })
  })
  beforeEach(async () => {
    await i18next.changeLanguage('en')
    vi.clearAllMocks()
    dashboardApi.getOperatingDashboard.mockResolvedValue(summary)
    dashboardApi.getProviderBalances.mockResolvedValue({
      asOf: summary.asOf,
      defaultAlertThresholdRmb: null,
      alertCount: 0,
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    })
    dashboardApi.getOperatingDashboardCosts.mockResolvedValue({
      asOf: summary.asOf,
      summary: {
        recordedCostRmb: '0',
        incompleteCostTaskCount: 3,
        unknownResultTaskCount: 1,
      },
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })
  })

  it('shows the consumption equation exact to 0.0001 RMB with provisional contribution and no profit wording', async () => {
    mount(<PointsContributionPanel />)
    expect(await screen.findByText('¥137.495')).toBeInTheDocument()
    expect(screen.getByText('¥27.491')).toBeInTheDocument()
    expect(screen.getAllByText('¥110.004').length).toBeGreaterThan(0)
    expect(screen.getAllByText('¥70.00').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/¥40\.004/u).length).toBeGreaterThan(0)
    expect(screen.getAllByText('(provisional)').length).toBeGreaterThan(0)
    expect(screen.queryByText(/profit/iu)).not.toBeInTheDocument()
    expect(screen.getByText('Reconciled')).toBeInTheDocument()
    const [query] = dashboardApi.getOperatingDashboard.mock.calls[0] ?? []
    expect(query).toMatchObject({
      periodType: 'MONTH',
      groupBy: 'MODEL',
      groupPage: 1,
      groupSortBy: 'consumedPoints',
      groupSortOrder: 'desc',
    })
    expect(query.to).toBeUndefined()
    expect(screen.getByText('vs previous period ↑ 8.0%')).toBeInTheDocument()
    expect(screen.getAllByText(/^[-−]¥4\.00$/u)[0]).toHaveClass(
      'text-destructive'
    )
  })

  it('opens the cost drawer preset to incomplete tasks with the page asOf as its end', async () => {
    mount(<PointsContributionPanel />)
    fireEvent.click(
      await screen.findByRole('button', {
        name: '3 tasks with incomplete cost data',
      })
    )
    await waitFor(() =>
      expect(dashboardApi.getOperatingDashboardCosts).toHaveBeenCalled()
    )
    expect(
      dashboardApi.getOperatingDashboardCosts.mock.calls[0]?.[0]
    ).toMatchObject({
      costState: 'INCOMPLETE',
      from: summary.period.from,
      to: summary.period.to,
    })
    expect(
      await screen.findByText(
        /Incomplete cost data 3 tasks \(of which 1 with unknown call result\)/u
      )
    ).toBeInTheDocument()
  })

  it('opens a flow row lot in the drawer with its source and returns to the list', async () => {
    dashboardApi.getOperatingDashboardFlows.mockResolvedValue({
      asOf: summary.asOf,
      summary: { flowType: 'CONSUMED', points: '14', cashSupportRmb: '0' },
      items: [
        {
          id: 'ledger-1',
          occurredAt: '2026-09-10T03:20:00.000Z',
          customerId: 'customer-a',
          customerName: 'Customer A',
          flowType: 'CONSUMED',
          subType: 'TASK_SETTLE',
          points: '14',
          cashSupportRmb: '0',
          sourceCategory: 'INDEPENDENT_BONUS',
          graceConverted: false,
          lotId: 'lot-invite',
          taskId: null,
          modelName: null,
          modelKey: null,
          modelVersion: null,
          rechargeOrderNumber: null,
          pointReturnId: null,
          refundReferenceAmountMinor: null,
          reason: null,
          operatorName: null,
          lotExpiresAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    api.getCanvasCustomerBusinessFacts.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
      fact: {
        id: 'lot-invite',
        kind: 'lot',
        name: '',
        status: 'BONUS',
        at: '2026-09-19T17:36:48.721Z',
        fields: {
          lotType: 'BONUS',
          sourceType: 'INVITE_BONUS',
          initialPoints: '500',
          availablePoints: '165',
          reservedPoints: '0',
          expiresAt: null,
          inviteCode: 'CANVAS-••••••••',
          inviteRegisteredAt: '2026-09-19T17:36:48.721Z',
          activityName: null,
        },
      },
    })
    mount(<PointsContributionPanel />)
    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: '5,500 points' })
      )[0] as HTMLElement
    )
    fireEvent.click(await screen.findByRole('button', { name: 'lot-invite' }))
    expect(await screen.findByText('CANVAS-••••••••')).toBeInTheDocument()
    expect(api.getCanvasCustomerBusinessFacts.mock.calls[0]?.[0]).toBe(
      'customer-a'
    )
    expect(screen.getByText('Point lot details')).toBeInTheDocument()
    expect(screen.queryByText('Activity name')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back to details/u }))
    expect(
      await screen.findByRole('button', { name: 'lot-invite' })
    ).toBeVisible()
  })

  it('keeps the recorded cost in the drawer summary when the drawer is preset to recorded costs', async () => {
    mount(<PointsContributionPanel />)
    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: '¥70.00' })
      )[0] as HTMLElement
    )
    await waitFor(() =>
      expect(dashboardApi.getOperatingDashboardCosts).toHaveBeenCalled()
    )
    expect(
      dashboardApi.getOperatingDashboardCosts.mock.calls[0]?.[0]
    ).toMatchObject({ costState: 'RECORDED' })
    expect(await screen.findByText('Recorded cost ¥0.00')).toBeInTheDocument()
    expect(screen.queryByText(/Incomplete cost data 3 tasks/u)).toBeNull()
  })

  it('carries the grouped model row into the cost drawer as its model filter', async () => {
    mount(<PointsContributionPanel />)
    fireEvent.click(
      await screen.findByRole('button', {
        name: '2 tasks with incomplete cost data',
      })
    )
    await waitFor(() =>
      expect(dashboardApi.getOperatingDashboardCosts).toHaveBeenCalled()
    )
    expect(
      dashboardApi.getOperatingDashboardCosts.mock.calls[0]?.[0]
    ).toMatchObject({ costState: 'INCOMPLETE', modelKey: 'image.a' })
    expect(
      await screen.findByRole('button', { name: /Column filters/u })
    ).toBeInTheDocument()
  })

  it('lists the grouped view columns under View and shows no empty column filter', async () => {
    mount(<PointsContributionPanel />)
    const card = (await screen.findByText('Grouped view')).closest(
      '[data-slot="card"]'
    ) as HTMLElement
    expect(
      within(card).queryByRole('button', { name: /Column filters/u })
    ).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'View' }))
    expect(
      await screen.findByRole('menuitemcheckbox', { name: 'Contribution' })
    ).toHaveAttribute('aria-checked', 'true')
    for (const hidden of ['List amount', 'Gift portion', 'List contribution']) {
      expect(
        screen.getByRole('menuitemcheckbox', { name: hidden })
      ).toHaveAttribute('aria-checked', 'false')
    }
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Model count' })
    )
    expect(
      await within(card).findByRole('columnheader', { name: 'Model count' })
    ).toBeInTheDocument()
  })

  it('distinguishes a query timeout from a general failure', async () => {
    dashboardApi.getOperatingDashboard.mockRejectedValueOnce({
      response: { status: 503, data: { code: 'QUERY_TIMEOUT' } },
    })
    mount(<PointsContributionPanel />)
    expect(await screen.findByText('Query timed out')).toBeInTheDocument()
    expect(
      screen.getByText(
        'The selected range has too much data. Narrow the statistics period and try again.'
      )
    ).toBeInTheDocument()
  })

  it('renders the confirmed Chinese wording', async () => {
    await i18next.changeLanguage('zhCN')
    mount(<PointsContributionPanel />)
    expect(await screen.findByText('积分核对')).toBeInTheDocument()
    expect(screen.getByText('消费与调用成本')).toBeInTheDocument()
    expect(screen.getAllByText('贡献额').length).toBeGreaterThan(0)
    expect(screen.getByText('3 个任务资料不完整')).toBeInTheDocument()
    expect(screen.getByText('按 API 服务商')).toBeInTheDocument()
  })
})

describe('ADMIN-REWORK-008 API provider balances', () => {
  beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: { en, zhCN: zh } })
  })
  beforeEach(async () => {
    await i18next.changeLanguage('en')
    vi.clearAllMocks()
    dashboardApi.getProviderBalances.mockResolvedValue({
      asOf: '2026-09-26T01:20:00.000Z',
      items: [
        {
          providerId: 'provider-y',
          code: 'y',
          name: 'Provider Y',
          websiteUrl: 'https://y.example',
          lastBalanceRmb: '300',
          lastBalanceAt: '2026-09-10T00:00:00.000Z',
          topUpsAfterRmb: '500',
          costAfterRmb: '380',
          estimatedBalanceRmb: '-10.125',
          alertThresholdRmb: null,
          effectiveAlertThresholdRmb: '500.0000',
          belowAlertThreshold: true,
          incompleteCostTaskCount: 2,
          balanceAgeDays: 16,
          balanceStale: true,
        },
        {
          providerId: 'provider-x',
          code: 'x',
          name: 'Provider X',
          websiteUrl: null,
          lastBalanceRmb: '1000',
          lastBalanceAt: '2026-09-25T00:00:00.000Z',
          topUpsAfterRmb: '0',
          costAfterRmb: '120',
          estimatedBalanceRmb: '880',
          alertThresholdRmb: '1000.0000',
          effectiveAlertThresholdRmb: '1000.0000',
          belowAlertThreshold: true,
          incompleteCostTaskCount: 0,
          balanceAgeDays: 1,
          balanceStale: false,
        },
        {
          providerId: 'provider-z',
          code: 'z',
          name: 'Provider Z',
          websiteUrl: null,
          lastBalanceRmb: null,
          lastBalanceAt: null,
          topUpsAfterRmb: null,
          costAfterRmb: null,
          estimatedBalanceRmb: null,
          alertThresholdRmb: null,
          effectiveAlertThresholdRmb: '500.0000',
          belowAlertThreshold: false,
          incompleteCostTaskCount: 0,
          balanceAgeDays: null,
          balanceStale: false,
        },
      ],
      defaultAlertThresholdRmb: '500.0000',
      alertCount: 2,
      total: 3,
      page: 1,
      pageSize: 20,
    })
    dashboardApi.addProviderBalanceRecord.mockResolvedValue({})
    dashboardApi.setProviderAlertThreshold.mockResolvedValue({})
    dashboardApi.setProviderDefaultAlertThreshold.mockResolvedValue({
      defaultAlertThresholdRmb: null,
      alertCount: 1,
    })
    dashboardApi.getOperatingDashboardCosts.mockResolvedValue({
      asOf: '2026-09-26T01:20:00.000Z',
      summary: {
        recordedCostRmb: '0',
        incompleteCostTaskCount: 2,
        unknownResultTaskCount: 0,
      },
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })
    dashboardApi.getProviderBalanceAlerts.mockResolvedValue({
      asOf: '2026-09-26T01:20:00.000Z',
      alertCount: 2,
    })
  })

  it('marks providers below their threshold and opens the drawer or dialog each hint leads to', async () => {
    mount(<ProviderBalancesPanel />)
    expect(await screen.findByText('Negative balance')).toHaveClass(
      'text-destructive'
    )
    expect(screen.getByText('Below alert ¥1,000.00')).toBeInTheDocument()
    expect(screen.getByText('¥880.00')).toHaveClass('text-destructive')
    expect(screen.getAllByText('¥500.00 (default)').length).toBe(2)
    fireEvent.click(
      screen.getByRole('button', { name: '2 tasks without recorded cost' })
    )
    await waitFor(() =>
      expect(dashboardApi.getOperatingDashboardCosts).toHaveBeenCalled()
    )
    expect(
      dashboardApi.getOperatingDashboardCosts.mock.calls[0]?.[0]
    ).toMatchObject({
      costState: 'INCOMPLETE',
      providerId: 'provider-y',
      from: '2026-09-10T00:00:00.000Z',
      to: '2026-09-26T01:20:00.000Z',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Balance not updated for 16 days',
      })
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Add record · Provider Y')).toBeVisible()
    expect(
      within(dialog).getByRole('link', { name: /Open website/u })
    ).toHaveAttribute('href', 'https://y.example')
  })

  it('sets a provider threshold, restores the default and sets the default threshold', async () => {
    mount(<ProviderBalancesPanel />)
    const [setAlert] = await screen.findAllByRole('button', {
      name: 'Set alert',
    })
    fireEvent.click(setAlert as HTMLElement)
    let dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText('Alert threshold (RMB)')
    expect(input).toHaveAttribute('placeholder', 'Default ¥500.00')
    expect(
      within(dialog).getByText('Uses the default threshold ¥500.00')
    ).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '1.23456' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText(
        'Enter an amount of at least 0 with at most 4 decimal places.'
      )
    ).toBeInTheDocument()
    fireEvent.change(input, { target: { value: '1000' } })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Restore default' })
    )
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { value: '1000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(dashboardApi.setProviderAlertThreshold).toHaveBeenCalledWith(
        'provider-y',
        '1000'
      )
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Default alert threshold: ¥500.00',
      })
    )
    dialog = await screen.findByRole('dialog')
    const defaultInput = within(dialog).getByLabelText(
      'Default alert threshold (RMB)'
    )
    expect(defaultInput).toHaveValue('500')
    fireEvent.change(defaultInput, { target: { value: '' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(
        dashboardApi.setProviderDefaultAlertThreshold
      ).toHaveBeenCalledWith(null)
    )
  })

  it('shows the estimate, a negative warning and the not-recorded state', async () => {
    mount(<ProviderBalancesPanel />)
    expect(await screen.findByText('-¥10.125')).toHaveClass('text-destructive')
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThan(0)
    const [link] = screen.getAllByRole('link', { name: /Open website/u })
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getAllByRole('button', { name: 'Set website' })).toHaveLength(
      2
    )
  })

  it('requires the first record to be a balance and validates the amount before saving', async () => {
    mount(<ProviderBalancesPanel />)
    const rows = await screen.findAllByRole('button', { name: 'Add record' })
    fireEvent.click(rows[2] as HTMLElement)
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(
        'The first record must be a back-office balance.'
      )
    ).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Amount (RMB)'), {
      target: { value: '1.23456' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText(
        'Enter a valid amount with at most 4 decimal places; a top-up must be greater than 0.'
      )
    ).toBeInTheDocument()
    expect(dashboardApi.addProviderBalanceRecord).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText('Amount (RMB)'), {
      target: { value: '53.315' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(dashboardApi.addProviderBalanceRecord).toHaveBeenCalledWith(
        'provider-z',
        expect.objectContaining({ recordType: 'BALANCE', amountRmb: '53.315' })
      )
    )
  })

  it('accepts only https websites', async () => {
    mount(<ProviderBalancesPanel />)
    fireEvent.click(
      (
        await screen.findAllByRole('button', { name: 'Set website' })
      )[0] as HTMLElement
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Website'), {
      target: { value: 'http://z.example' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText('Enter a URL that starts with https://.')
    ).toBeInTheDocument()
    expect(dashboardApi.setProviderWebsite).not.toHaveBeenCalled()
  })
})

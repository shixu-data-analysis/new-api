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
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import {
  DataTableColumnFilterField,
  DataTableColumnFilterPanel,
} from '@/components/data-table/toolbar/column-filter-panel'
import { ErrorState } from '@/components/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { getCanvasBusinessTerm } from '../business-terms'
import { getOperatingDashboard } from '../operating-dashboard-api'
import {
  consumptionEquation,
  customPeriodError,
  previousChange,
  presetPeriod,
  toMinute,
} from '../operating-dashboard-format'
import type {
  DashboardGroupBy,
  DashboardGroupRow,
  DashboardGroupRowFilter,
  DashboardGroupSort,
  DashboardPeriodType,
  DashboardScopeQuery,
  DashboardSummary,
} from '../operating-dashboard-types'
import { useDashboardFormatters } from '../use-dashboard-formatters'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTerm } from './BusinessTerm'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import {
  ALL_OPTION_VALUE,
  DashboardAgentSelect,
  DashboardCustomerSelect,
  NO_AGENT_OPTION_VALUE,
  type DashboardSelectOption,
} from './DashboardSearchSelect'
import {
  OperatingDashboardDrawers,
  type DashboardDrawerPreset,
  type DashboardDrawerRequest,
} from './OperatingDashboardDrawers'
import { OperatingDashboardWaterfall } from './OperatingDashboardWaterfall'

type View = 'numbers' | 'chart'

const groupByLabels: Record<DashboardGroupBy, string> = {
  MODEL: 'By model',
  PROVIDER: 'By API provider',
  TAG: 'By model tag',
  CAPABILITY: 'By generation type',
  AGENT: 'By agent',
  CUSTOMER: 'By customer',
}

const groupColumnLabels: Record<DashboardGroupBy, string> = {
  MODEL: 'Model',
  PROVIDER: 'API provider',
  TAG: 'Model tag',
  CAPABILITY: 'Generation type',
  AGENT: 'Agent',
  CUSTOMER: 'Customer',
}

const issueLabels: Record<string, string> = {
  STATE_UNRECONSTRUCTABLE: 'Ledger state cannot be rebuilt',
  SOURCE_UNRESOLVED: 'Source cannot be classified',
  FLOW_UNCLASSIFIED: 'Point change cannot be classified',
  TRANSFER_UNPAIRED: 'Grace transfer is unpaired',
  DEBT_REPAYMENT_UNLINKED: 'Debt repayment cannot be linked',
  POINT_RETURN_UNLINKED: 'Point return cannot be linked',
}

const capabilityLabels: Record<string, string> = {
  'image.generate': 'Image',
  'image.edit': 'Image',
  'video.generate': 'Video',
  'chat.generate': 'Text',
  'text.generate': 'Text',
  'audio.generate': 'Audio',
}

/** Errors of the summary query that need their own page state. */
function failureKind(error: unknown): 'timeout' | 'denied' | 'failed' {
  const response = (
    error as { response?: { status?: number; data?: { code?: string } } }
  ).response
  if (response?.data?.code === 'QUERY_TIMEOUT') return 'timeout'
  if (response?.status === 401 || response?.status === 403) return 'denied'
  return 'failed'
}

const cashSupportHelp =
  'The amount under each number is its corresponding recharge amount: the recharge money these points carried when they were credited. It is not a cash balance, a refundable amount or profit.'

const modelStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  PAUSED: 'Paused',
  RETIRED: 'Retired',
}

/** Inline text that is itself a tooltip trigger, drawn like a business term. */
function HelpText(props: { help: string; children: ReactNode }) {
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type='button'
              className='focus-visible:ring-ring/50 cursor-help border-b border-dotted border-current text-start focus-visible:rounded-sm focus-visible:ring-2 focus-visible:outline-none'
            >
              {props.children}
            </button>
          }
        />
        <TooltipContent className='max-w-72 leading-relaxed'>
          {props.help}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const isNegative = (value: string) =>
  value.startsWith('-') && Number(value) !== 0

function LinkValue(props: {
  onClick?: () => void
  children: ReactNode
  label?: string
}) {
  if (!props.onClick) return props.children
  return (
    <button
      type='button'
      aria-label={props.label}
      className='text-primary focus-visible:ring-ring/50 rounded-sm text-start underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

/** "Compared with the previous period" line; plain text whose tooltip shows the previous period and value. */
function PreviousLine(props: {
  current: string
  previous: string
  previousLabel: string
  range: string
  extra?: string
}) {
  const { t } = useTranslation()
  const change = previousChange(props.current, props.previous)
  let text = t('vs previous period —')
  if (change.kind === 'flat') text = t('vs previous period flat')
  if (change.kind === 'up') {
    text = t('vs previous period ↑ {{percent}}%', { percent: change.percent })
  }
  if (change.kind === 'down') {
    text = t('vs previous period ↓ {{percent}}%', { percent: change.percent })
  }
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type='button'
              className='text-muted-foreground focus-visible:ring-ring/50 cursor-help rounded-sm text-xs focus-visible:ring-2 focus-visible:outline-none'
            >
              {text}
            </button>
          }
        />
        <TooltipContent className='max-w-72 leading-relaxed'>
          {t('Previous period {{range}}: {{value}}', {
            range: props.range,
            value: props.previousLabel,
          })}
          {props.extra ? <span className='block'>{props.extra}</span> : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** One block of an equation: name (tooltip trigger), value and the small line under it. */
function MetricBlock(props: {
  operator?: string
  term: string
  value: ReactNode
  sub?: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className='flex min-w-0 items-start gap-2'>
      {props.operator ? (
        <span
          className='text-muted-foreground pt-6 text-xl tabular-nums'
          aria-hidden='true'
        >
          {props.operator}
        </span>
      ) : null}
      <div className='min-w-0 space-y-1'>
        <div className='text-muted-foreground text-sm'>
          <BusinessTerm kind='dashboardMetric' value={props.term} />
        </div>
        <div className='text-2xl font-semibold tabular-nums'>{props.value}</div>
        {props.sub ? (
          <div className='text-muted-foreground text-xs tabular-nums'>
            {props.sub}
          </div>
        ) : null}
        {props.footer}
      </div>
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className='space-y-4' role='status' aria-live='polite'>
      {[0, 1, 2].map((index) => (
        <Card key={index}>
          <CardContent className='space-y-3 pt-6'>
            <Skeleton className='h-5 w-40' />
            <Skeleton className='h-16 w-full' />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function PointsContributionPanel() {
  const { t } = useTranslation()
  const format = useDashboardFormatters()
  const filterId = useId()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const allAgents: DashboardSelectOption = {
    value: ALL_OPTION_VALUE,
    label: t('All agents'),
  }
  const allCustomers: DashboardSelectOption = {
    value: ALL_OPTION_VALUE,
    label: t('All customers'),
  }
  const [periodType, setPeriodType] = useState<DashboardPeriodType>('MONTH')
  const [customFrom, setCustomFrom] = useState<Date>()
  const [customTo, setCustomTo] = useState<Date>()
  const [agent, setAgent] = useState<DashboardSelectOption>(allAgents)
  const [customer, setCustomer] = useState<DashboardSelectOption>(allCustomers)
  const [view, setView] = useState<View>('numbers')
  const [groupBy, setGroupBy] = useState<DashboardGroupBy>('MODEL')
  const [issuePage, setIssuePage] = useState(1)
  const [drawer, setDrawer] = useState<DashboardDrawerRequest>()
  const groupState = useServerTableState<DashboardGroupSort>('consumedPoints')
  const customError =
    periodType === 'CUSTOM'
      ? customPeriodError(customFrom, customTo, new Date())
      : undefined
  const scope = {
    periodType,
    customFrom: customFrom?.toISOString(),
    customTo: customTo?.toISOString(),
    agent: agent.value,
    customer: customer.value,
  }
  const scopeKey = JSON.stringify(scope)
  const { setPagination } = groupState
  useEffect(() => {
    setPagination((value) => ({ ...value, pageIndex: 0 }))
    setIssuePage(1)
  }, [scopeKey, groupBy, setPagination])

  const scopeQuery = (from: Date): DashboardScopeQuery => ({
    from: from.toISOString(),
    timeZone,
    ...(agent.value === NO_AGENT_OPTION_VALUE ? { noAgent: true } : {}),
    ...(agent.value !== ALL_OPTION_VALUE &&
    agent.value !== NO_AGENT_OPTION_VALUE
      ? { agentPrincipalId: agent.value }
      : {}),
    ...(customer.value !== ALL_OPTION_VALUE
      ? { customerId: customer.value }
      : {}),
  })
  const summary = useQuery({
    queryKey: [
      'canvas-cloud',
      'operating-dashboard',
      'summary',
      scopeKey,
      groupBy,
      groupState.query,
      issuePage,
    ],
    // Presets are resolved when the request is sent, so a refresh moves "now" and "last 30 days" forward.
    queryFn: ({ signal }) => {
      // The query only runs for a custom period once both ends are valid (see `enabled`).
      const bounds =
        periodType === 'CUSTOM' && customFrom && customTo
          ? { from: toMinute(customFrom), to: toMinute(customTo) }
          : presetPeriod(
              periodType === 'CUSTOM' ? 'MONTH' : periodType,
              new Date()
            )
      return getOperatingDashboard(
        {
          ...scopeQuery(bounds.from),
          ...(bounds.to ? { to: bounds.to.toISOString() } : {}),
          periodType,
          groupBy,
          groupPage: groupState.query.page,
          groupPageSize: groupState.query.pageSize,
          groupSortBy: groupState.query.sortBy,
          groupSortOrder: groupState.query.sortOrder,
          issuePage,
        },
        signal
      )
    },
    enabled: !customError,
    retry: false,
    // Paging the grouped table or the issue list keeps the cards; any scope change shows the loading state instead.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[3] === scopeKey ? previous : undefined,
  })

  const activeFilterCount =
    (periodType !== 'MONTH' ? 1 : 0) +
    (agent.value !== ALL_OPTION_VALUE ? 1 : 0) +
    (customer.value !== ALL_OPTION_VALUE ? 1 : 0)
  const clearFilters = () => {
    setPeriodType('MONTH')
    setCustomFrom(undefined)
    setCustomTo(undefined)
    setAgent(allAgents)
    setCustomer(allCustomers)
  }
  const data = summary.data
  const drawerScope = data
    ? {
        ...scopeQuery(new Date(data.period.from)),
        to: data.period.to,
        asOf: data.asOf,
        periodLabel: `${format.dateTime(data.period.from)} — ${format.dateTime(data.period.to)}`,
      }
    : undefined
  const open = (
    request: DashboardDrawerPreset,
    override?: Partial<DashboardScopeQuery>
  ) => {
    if (!drawerScope) return
    setDrawer({
      ...request,
      scope: { ...drawerScope, ...override },
    } as DashboardDrawerRequest)
  }

  const filters = (
    <DataTableColumnFilterPanel
      activeCount={activeFilterCount}
      onClear={clearFilters}
    >
      <DataTableColumnFilterField
        label={t('Statistics period')}
        htmlFor={`${filterId}-period`}
      >
        <Select
          value={periodType}
          onValueChange={(value) => setPeriodType(value as DashboardPeriodType)}
        >
          <SelectTrigger id={`${filterId}-period`}>
            <SelectValue>
              {(value: string) =>
                t(
                  {
                    MONTH: 'Current month',
                    LAST_MONTH: 'Last month',
                    LAST_30_DAYS: 'Last 30 days',
                    CUSTOM: 'Custom',
                  }[value as DashboardPeriodType]
                )
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='MONTH'>{t('Current month')}</SelectItem>
            <SelectItem value='LAST_MONTH'>{t('Last month')}</SelectItem>
            <SelectItem value='LAST_30_DAYS'>{t('Last 30 days')}</SelectItem>
            <SelectItem value='CUSTOM'>{t('Custom')}</SelectItem>
          </SelectContent>
        </Select>
      </DataTableColumnFilterField>
      <DataTableColumnFilterField
        label={t('Agent')}
        htmlFor={`${filterId}-agent`}
      >
        <DashboardAgentSelect
          id={`${filterId}-agent`}
          value={agent}
          onChange={setAgent}
        />
      </DataTableColumnFilterField>
      <DataTableColumnFilterField
        label={t('Customer')}
        htmlFor={`${filterId}-customer`}
      >
        <DashboardCustomerSelect
          id={`${filterId}-customer`}
          value={customer}
          onChange={setCustomer}
        />
      </DataTableColumnFilterField>
      {periodType === 'CUSTOM' ? (
        <div className='col-span-full space-y-1'>
          <CanvasDateRangeFilter
            from={customFrom}
            to={customTo}
            onFromChange={setCustomFrom}
            onToChange={setCustomTo}
          />
          {customError && customError !== 'incomplete' ? (
            <p className='text-destructive text-sm' role='alert'>
              {t(
                {
                  order: 'Start time must be before end time',
                  future: 'End time must not be later than now',
                  span: 'The period must not exceed 366 days',
                }[customError]
              )}
            </p>
          ) : null}
        </div>
      ) : null}
      <DataTableColumnFilterField label={t('Time zone')}>
        <p className='text-muted-foreground flex h-8 items-center text-sm'>
          {timeZone}
        </p>
      </DataTableColumnFilterField>
    </DataTableColumnFilterPanel>
  )

  let body: ReactNode
  if (customError === 'incomplete') {
    body = (
      <p className='text-muted-foreground text-sm'>
        {t('Choose the start and end time.')}
      </p>
    )
  } else if (customError) {
    body = null
  } else if (summary.isError) {
    const kind = failureKind(summary.error)
    body =
      kind === 'denied' ? (
        <ErrorState
          title={t('Access denied')}
          description={t('You do not have access to this Canvas section.')}
        />
      ) : (
        <ErrorState
          title={t(
            kind === 'timeout'
              ? 'Query timed out'
              : 'Operating dashboard failed to load'
          )}
          description={t(
            kind === 'timeout'
              ? 'The selected range has too much data. Narrow the statistics period and try again.'
              : 'Please try again later.'
          )}
          onRetry={() => void summary.refetch()}
        />
      )
  } else if (!data || summary.isPending) {
    body = <SummarySkeleton />
  } else {
    body = (
      <SummaryContent
        data={data}
        view={view}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        groupState={groupState}
        groupLoading={summary.isFetching}
        issuePage={issuePage}
        onIssuePageChange={setIssuePage}
        open={open}
      />
    )
  }

  const scopeSummary = data
    ? [
        `${format.dateTime(data.period.from)} — ${format.dateTime(data.period.to)}`,
        timeZone,
        agent.label,
        customer.label,
        ...(new Date(data.period.to).getTime() < new Date(data.asOf).getTime()
          ? [t('Data as of {{time}}', { time: format.dateTime(data.asOf) })]
          : []),
      ].join(' · ')
    : null
  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        {filters}
        <Tabs value={view} onValueChange={(value) => setView(value as View)}>
          <TabsList>
            <TabsTrigger value='numbers'>{t('Numbers')}</TabsTrigger>
            <TabsTrigger value='chart'>{t('Chart')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {scopeSummary ? (
        <p className='text-muted-foreground text-sm'>
          {t('Statistics scope')} {scopeSummary}
        </p>
      ) : null}
      {body}
      <OperatingDashboardDrawers
        request={drawer}
        onClose={() => setDrawer(undefined)}
      />
    </div>
  )
}

function SummaryContent(props: {
  data: DashboardSummary
  view: View
  groupBy: DashboardGroupBy
  onGroupByChange: (value: DashboardGroupBy) => void
  groupState: ReturnType<typeof useServerTableState<DashboardGroupSort>>
  groupLoading: boolean
  issuePage: number
  onIssuePageChange: (page: number) => void
  open: (
    request: DashboardDrawerPreset,
    override?: Partial<DashboardScopeQuery>
  ) => void
}) {
  const { t } = useTranslation()
  const format = useDashboardFormatters()
  const { data, open } = props
  const points = data.points
  const cash = data.cashSupportRmb
  const previous = data.previous
  const range = `${format.dateTime(previous.from)} — ${format.dateTime(previous.to)}`
  const equation = consumptionEquation(data.consumption)
  const previousEquation = consumptionEquation(previous)
  const provisional = data.consumption.provisional
  const empty =
    [
      points.opening,
      points.issued,
      points.consumed,
      points.expired,
      points.otherDecrease,
      points.closing,
    ].every((value) => value === '0') &&
    Number(data.consumption.recordedCostRmb) === 0
  const reconciliationBadge = {
    BALANCED: <Badge variant='secondary'>{t('Reconciled')}</Badge>,
    UNBALANCED: (
      <Badge variant='destructive'>{t('Reconciliation exception')}</Badge>
    ),
    DATA_INCOMPLETE: <Badge variant='warning'>{t('Data incomplete')}</Badge>,
  }[data.reconciliation.status]
  const pointFlow =
    (flowType: 'ISSUED' | 'CONSUMED' | 'EXPIRED' | 'OTHER_DECREASE') => () =>
      open({ kind: 'flow', flowType })
  const balanceAt =
    (
      at: 'OPENING' | 'CLOSING',
      extra: Partial<Extract<DashboardDrawerRequest, { kind: 'balance' }>> = {}
    ) =>
    () =>
      open({ kind: 'balance', at, ...extra })
  const pointsCard = (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between gap-2'>
        <CardTitle>{t('Point reconciliation')}</CardTitle>
        {reconciliationBadge}
      </CardHeader>
      <CardContent className='space-y-4'>
        {props.view === 'chart' ? (
          <OperatingDashboardWaterfall
            kind='points'
            rows={[
              {
                term: 'OPENING',
                role: 'total',
                amount: points.opening,
                value: format.points(points.opening),
                sub: format.rmb(cash.opening),
                onOpen: balanceAt('OPENING'),
              },
              {
                term: 'ISSUED',
                role: 'increase',
                amount: points.issued,
                value: `+${format.points(points.issued)}`,
                sub: format.rmb(cash.issued),
                onOpen: pointFlow('ISSUED'),
                previous: (
                  <PreviousLine
                    current={points.issued}
                    previous={previous.issuedPoints}
                    previousLabel={format.points(previous.issuedPoints)}
                    range={range}
                  />
                ),
              },
              {
                term: 'CONSUMED',
                role: 'decrease',
                amount: points.consumed,
                value: `−${format.points(points.consumed)}`,
                sub: format.rmb(cash.consumed),
                onOpen: pointFlow('CONSUMED'),
                previous: (
                  <PreviousLine
                    current={points.consumed}
                    previous={previous.consumedPoints}
                    previousLabel={format.points(previous.consumedPoints)}
                    range={range}
                  />
                ),
              },
              {
                term: 'EXPIRED',
                role: 'decrease',
                amount: points.expired,
                value: `−${format.points(points.expired)}`,
                sub: format.rmb(cash.expired),
                onOpen: pointFlow('EXPIRED'),
                previous: (
                  <PreviousLine
                    current={points.expired}
                    previous={previous.expiredPoints}
                    previousLabel={format.points(previous.expiredPoints)}
                    range={range}
                  />
                ),
              },
              {
                term: 'OTHER_DECREASE',
                role: 'decrease',
                amount: points.otherDecrease,
                value: `−${format.points(points.otherDecrease)}`,
                sub: format.rmb(cash.otherDecrease),
                onOpen: pointFlow('OTHER_DECREASE'),
                previous: (
                  <PreviousLine
                    current={points.otherDecrease}
                    previous={previous.otherDecreasePoints}
                    previousLabel={format.points(previous.otherDecreasePoints)}
                    range={range}
                  />
                ),
              },
              {
                term: 'CLOSING',
                role: 'total',
                amount: points.closing,
                value: format.points(points.closing),
                sub: format.rmb(cash.closing),
                onOpen: balanceAt('CLOSING'),
              },
            ]}
          />
        ) : (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-6'>
            <MetricBlock
              term='OPENING'
              value={
                <LinkValue onClick={balanceAt('OPENING')}>
                  {format.points(points.opening)}
                </LinkValue>
              }
              sub={
                <HelpText help={t(cashSupportHelp)}>
                  {format.rmb(cash.opening)}
                </HelpText>
              }
            />
            <MetricBlock
              operator='+'
              term='ISSUED'
              value={
                <LinkValue onClick={pointFlow('ISSUED')}>
                  {format.points(points.issued)}
                </LinkValue>
              }
              sub={format.rmb(cash.issued)}
              footer={
                <PreviousLine
                  current={points.issued}
                  previous={previous.issuedPoints}
                  previousLabel={format.points(previous.issuedPoints)}
                  range={range}
                />
              }
            />
            <MetricBlock
              operator='−'
              term='CONSUMED'
              value={
                <LinkValue onClick={pointFlow('CONSUMED')}>
                  {format.points(points.consumed)}
                </LinkValue>
              }
              sub={format.rmb(cash.consumed)}
              footer={
                <PreviousLine
                  current={points.consumed}
                  previous={previous.consumedPoints}
                  previousLabel={format.points(previous.consumedPoints)}
                  range={range}
                />
              }
            />
            <MetricBlock
              operator='−'
              term='EXPIRED'
              value={
                <LinkValue onClick={pointFlow('EXPIRED')}>
                  {format.points(points.expired)}
                </LinkValue>
              }
              sub={format.rmb(cash.expired)}
              footer={
                <PreviousLine
                  current={points.expired}
                  previous={previous.expiredPoints}
                  previousLabel={format.points(previous.expiredPoints)}
                  range={range}
                />
              }
            />
            <MetricBlock
              operator='−'
              term='OTHER_DECREASE'
              value={
                <LinkValue onClick={pointFlow('OTHER_DECREASE')}>
                  {format.points(points.otherDecrease)}
                </LinkValue>
              }
              sub={format.rmb(cash.otherDecrease)}
              footer={
                <PreviousLine
                  current={points.otherDecrease}
                  previous={previous.otherDecreasePoints}
                  previousLabel={format.points(previous.otherDecreasePoints)}
                  range={range}
                />
              }
            />
            <MetricBlock
              operator='='
              term='CLOSING'
              value={
                <LinkValue onClick={balanceAt('CLOSING')}>
                  {format.points(points.closing)}
                </LinkValue>
              }
              sub={format.rmb(cash.closing)}
            />
          </div>
        )}
        <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm'>
          <BusinessTerm kind='dashboardMetric' value='CLOSING_BREAKDOWN' />
          <LinkValue onClick={balanceAt('CLOSING', { state: 'AVAILABLE' })}>
            {t('Available for new tasks {{points}}', {
              points: format.points(points.available),
            })}
          </LinkValue>
          <span>
            （
            <LinkValue
              onClick={balanceAt('CLOSING', {
                state: 'AVAILABLE',
                expiringWithinDays: 7,
              })}
            >
              {t('Expiring within 7 days {{points}}', {
                points: format.points(points.expiringWithin7Days),
              })}
            </LinkValue>
            ）
          </span>
          <span aria-hidden='true'>·</span>
          <LinkValue
            onClick={balanceAt('CLOSING', { state: 'RESERVED_VALID' })}
          >
            {t('Reserved by tasks {{points}}', {
              points: format.points(points.reservedValid),
            })}
          </LinkValue>
          <span aria-hidden='true'>·</span>
          <LinkValue
            onClick={balanceAt('CLOSING', { state: 'RESERVED_EXPIRED' })}
          >
            {t('Expired awaiting settlement {{points}}', {
              points: format.points(points.reservedExpired),
            })}
          </LinkValue>
        </div>
        <div className='flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm'>
          <span>
            <BusinessTerm kind='dashboardMetric' value='OUTSTANDING_DEBT' />{' '}
            <span className='tabular-nums'>
              {format.points(points.outstandingTaskDebt)}
            </span>
          </span>
          <span>
            <BusinessTerm kind='dashboardMetric' value='PER_POINT' />{' '}
            <span className='tabular-nums'>
              {t('Closing {{value}}', {
                value:
                  data.cashSupportPerPoint.closing === null
                    ? t('Not applicable')
                    : format.perPoint(data.cashSupportPerPoint.closing),
              })}{' '}
              ·{' '}
              {t('Consumed in period {{value}}', {
                value:
                  data.cashSupportPerPoint.consumed === null
                    ? t('Not applicable')
                    : format.perPoint(data.cashSupportPerPoint.consumed),
              })}
            </span>
          </span>
        </div>
        {data.reconciliation.status !== 'BALANCED' ? (
          <ReconciliationIssues
            data={data}
            page={props.issuePage}
            onPageChange={props.onIssuePageChange}
          />
        ) : null}
        {empty ? (
          <p className='text-muted-foreground text-sm'>
            {t('No point or cost records in the selected range')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
  const incomplete = data.consumption.incompleteCostTaskCount
  const incompleteLink =
    incomplete > 0 ? (
      <LinkValue
        onClick={() => open({ kind: 'cost', costState: 'INCOMPLETE' })}
      >
        {t('{{count}} tasks with incomplete cost data', { count: incomplete })}
      </LinkValue>
    ) : null
  const provisionalMark = provisional ? (
    <span className='text-muted-foreground text-sm font-normal'>
      {t('(provisional)')}
    </span>
  ) : null
  const contributionRateLabel =
    data.consumption.contributionRate === null
      ? t('Not applicable')
      : format.percent(data.consumption.contributionRate)
  const consumptionCard = (
    <Card>
      <CardHeader>
        <CardTitle>{t('Consumption and call cost')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {props.view === 'chart' ? (
          <OperatingDashboardWaterfall
            kind='consumption'
            rows={[
              {
                term: 'LIST_AMOUNT',
                role: 'total',
                amount: equation.listAmount,
                value: format.rmb(equation.listAmount),
                sub: (
                  <LinkValue
                    onClick={() => open({ kind: 'flow', flowType: 'CONSUMED' })}
                  >
                    {t('{{points}} points', {
                      points: format.points(data.consumption.consumedPoints),
                    })}
                  </LinkValue>
                ),
                previous: (
                  <PreviousLine
                    current={equation.listAmount}
                    previous={previousEquation.listAmount}
                    previousLabel={format.rmb(previousEquation.listAmount)}
                    range={range}
                  />
                ),
              },
              {
                term: 'GIFT',
                role: isNegative(equation.gift) ? 'increase' : 'decrease',
                amount: equation.gift,
                value: isNegative(equation.gift)
                  ? `+${format.rmb(equation.gift.slice(1))}`
                  : `−${format.rmb(equation.gift)}`,
                sub:
                  data.consumption.giftShare === null
                    ? t('Not applicable')
                    : t('{{percent}} of list amount', {
                        percent: format.percent(data.consumption.giftShare),
                      }),
                previous: (
                  <PreviousLine
                    current={equation.gift}
                    previous={previousEquation.gift}
                    previousLabel={format.rmb(previousEquation.gift)}
                    range={range}
                  />
                ),
              },
              {
                term: 'CONSUMED_CASH',
                role: 'total',
                amount: equation.cashSupport,
                value: format.rmb(equation.cashSupport),
                onOpen: () => open({ kind: 'flow', flowType: 'CONSUMED' }),
                previous: (
                  <PreviousLine
                    current={equation.cashSupport}
                    previous={previousEquation.cashSupport}
                    previousLabel={format.rmb(previousEquation.cashSupport)}
                    range={range}
                  />
                ),
              },
              {
                term: 'RECORDED_COST',
                role: 'decrease',
                amount: equation.recordedCost,
                value: `−${format.rmb(equation.recordedCost)}`,
                onOpen: () => open({ kind: 'cost', costState: 'RECORDED' }),
                sub: incompleteLink,
                previous: (
                  <PreviousLine
                    current={equation.recordedCost}
                    previous={previousEquation.recordedCost}
                    previousLabel={format.rmb(previousEquation.recordedCost)}
                    range={range}
                  />
                ),
              },
              {
                term: 'CONTRIBUTION',
                role: 'total',
                amount: equation.contribution,
                value: (
                  <>
                    {format.rmb(equation.contribution)} {provisionalMark}
                  </>
                ),
                sub: t('Contribution rate {{rate}}', {
                  rate: contributionRateLabel,
                }),
                previous: (
                  <PreviousLine
                    current={equation.contribution}
                    previous={previousEquation.contribution}
                    previousLabel={format.rmb(previousEquation.contribution)}
                    range={range}
                    extra={t('Previous contribution rate {{rate}}', {
                      rate:
                        previous.contributionRate === null
                          ? t('Not applicable')
                          : format.percent(previous.contributionRate),
                    })}
                  />
                ),
              },
            ]}
          />
        ) : (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-5'>
            <MetricBlock
              term='LIST_AMOUNT'
              value={format.rmb(equation.listAmount)}
              sub={
                <LinkValue
                  onClick={() => open({ kind: 'flow', flowType: 'CONSUMED' })}
                >
                  {t('{{points}} points', {
                    points: format.points(data.consumption.consumedPoints),
                  })}
                </LinkValue>
              }
              footer={
                <PreviousLine
                  current={equation.listAmount}
                  previous={previousEquation.listAmount}
                  previousLabel={format.rmb(previousEquation.listAmount)}
                  range={range}
                />
              }
            />
            <MetricBlock
              operator='−'
              term='GIFT'
              value={
                <span
                  className={
                    isNegative(equation.gift) ? 'text-destructive' : undefined
                  }
                >
                  {format.rmb(equation.gift)}
                </span>
              }
              sub={
                data.consumption.giftShare === null
                  ? t('Not applicable')
                  : t('{{percent}} of list amount', {
                      percent: format.percent(data.consumption.giftShare),
                    })
              }
              footer={
                <PreviousLine
                  current={equation.gift}
                  previous={previousEquation.gift}
                  previousLabel={format.rmb(previousEquation.gift)}
                  range={range}
                />
              }
            />
            <MetricBlock
              operator='='
              term='CONSUMED_CASH'
              value={
                <LinkValue
                  onClick={() => open({ kind: 'flow', flowType: 'CONSUMED' })}
                >
                  {format.rmb(equation.cashSupport)}
                </LinkValue>
              }
              footer={
                <PreviousLine
                  current={equation.cashSupport}
                  previous={previousEquation.cashSupport}
                  previousLabel={format.rmb(previousEquation.cashSupport)}
                  range={range}
                />
              }
            />
            <MetricBlock
              operator='−'
              term='RECORDED_COST'
              value={
                <LinkValue
                  onClick={() => open({ kind: 'cost', costState: 'RECORDED' })}
                >
                  {format.rmb(equation.recordedCost)}
                </LinkValue>
              }
              sub={incompleteLink}
              footer={
                <PreviousLine
                  current={equation.recordedCost}
                  previous={previousEquation.recordedCost}
                  previousLabel={format.rmb(previousEquation.recordedCost)}
                  range={range}
                />
              }
            />
            <MetricBlock
              operator='='
              term='CONTRIBUTION'
              value={
                <span
                  className={
                    isNegative(equation.contribution)
                      ? 'text-destructive'
                      : undefined
                  }
                >
                  {format.rmb(equation.contribution)} {provisionalMark}
                </span>
              }
              sub={t('Contribution rate {{rate}}', {
                rate: contributionRateLabel,
              })}
              footer={
                <PreviousLine
                  current={equation.contribution}
                  previous={previousEquation.contribution}
                  previousLabel={format.rmb(previousEquation.contribution)}
                  range={range}
                  extra={t('Previous contribution rate {{rate}}', {
                    rate:
                      previous.contributionRate === null
                        ? t('Not applicable')
                        : format.percent(previous.contributionRate),
                  })}
                />
              }
            />
          </div>
        )}
        <div className='flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm'>
          <span className='text-muted-foreground'>
            {t('Sources of consumed points')}
          </span>
          {data.sources.items.map((source, index) => (
            <span key={source.category} className='tabular-nums'>
              {index > 0 ? <span aria-hidden='true'>· </span> : null}
              <BusinessTerm
                kind='dashboardMetric'
                value={source.category}
              />{' '}
              <LinkValue
                onClick={() =>
                  open({
                    kind: 'flow',
                    flowType: 'CONSUMED',
                    sourceCategory: source.category,
                  })
                }
              >
                {format.points(source.points)}
              </LinkValue>{' '}
              {format.rmb(source.cashSupportRmb)}
            </span>
          ))}
          <span className='tabular-nums'>
            <span aria-hidden='true'>· </span>
            <BusinessTerm kind='dashboardMetric' value='GRACE' />{' '}
            <LinkValue
              onClick={() =>
                open({ kind: 'flow', flowType: 'CONSUMED', graceOnly: true })
              }
            >
              {format.points(data.sources.graceConvertedPoints)}
            </LinkValue>
          </span>
        </div>
        <div className='text-sm'>
          <BusinessTerm kind='dashboardMetric' value='LIST_CONTRIBUTION' />{' '}
          <span
            className={`tabular-nums ${isNegative(equation.listContribution) ? 'text-destructive' : ''}`}
          >
            {format.rmb(equation.listContribution)}
          </span>{' '}
          {provisionalMark}
        </div>
      </CardContent>
    </Card>
  )
  return (
    <div className='space-y-4'>
      {pointsCard}
      {consumptionCard}
      <GroupTable
        data={data}
        groupBy={props.groupBy}
        onGroupByChange={props.onGroupByChange}
        state={props.groupState}
        loading={props.groupLoading}
        open={open}
      />
    </div>
  )
}

function ReconciliationIssues(props: {
  data: DashboardSummary
  page: number
  onPageChange: (page: number) => void
}) {
  const { t } = useTranslation()
  const format = useDashboardFormatters()
  const { reconciliation } = props.data
  const pages = Math.max(
    1,
    Math.ceil(reconciliation.issues.total / reconciliation.issues.pageSize)
  )
  const signed = (value: string) =>
    value.startsWith('-') ? value : `+${value}`
  return (
    <div className='space-y-2 rounded-md border p-3'>
      <p className='text-sm font-medium tabular-nums'>
        {t(
          'Difference {{points}} points · recharge amount difference {{amount}}',
          {
            points: signed(reconciliation.differencePoints),
            amount: signed(format.rmb(reconciliation.differenceCashSupportRmb)),
          }
        )}
      </p>
      <ul className='divide-y text-sm'>
        {reconciliation.issues.items.map((issue) => (
          <li
            key={`${issue.type}:${issue.relatedId}`}
            className='grid gap-1 py-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,8rem)_minmax(0,1fr)_6rem]'
          >
            <span>{t(issueLabels[issue.type] ?? 'Unknown issue')}</span>
            <span className='truncate'>
              {issue.customerName ?? t('Unknown customer')}
            </span>
            <span className='font-mono'>
              <CopyableText value={issue.relatedId} />
            </span>
            <span className='tabular-nums'>
              {issue.impactPoints === null
                ? '—'
                : format.points(issue.impactPoints)}
            </span>
          </li>
        ))}
      </ul>
      <div className='text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs'>
        <span className='tabular-nums'>
          {t(
            'Located impact {{located}} · unlocated difference {{unlocated}}',
            {
              located: format.points(reconciliation.locatedImpactPoints),
              unlocated: format.points(
                reconciliation.unlocatedDifferencePoints
              ),
            }
          )}
        </span>
        {pages > 1 ? (
          <span className='flex items-center gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={props.page <= 1}
              onClick={() => props.onPageChange(props.page - 1)}
            >
              {t('Go to previous page')}
            </Button>
            <span className='tabular-nums'>
              {t('Page {{current}} of {{total}}', {
                current: props.page,
                total: pages,
              })}
            </span>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={props.page >= pages}
              onClick={() => props.onPageChange(props.page + 1)}
            >
              {t('Go to next page')}
            </Button>
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** Drawer filters and scope overrides that select one row of the grouped table. */
function rowSelection(
  groupBy: DashboardGroupBy,
  row: DashboardGroupRow
): { filter: DashboardGroupRowFilter; override: Partial<DashboardScopeQuery> } {
  const key = row.key
  switch (groupBy) {
    case 'MODEL':
      return { filter: key ? { modelKey: key } : {}, override: {} }
    case 'PROVIDER':
      return { filter: key ? { providerId: key } : {}, override: {} }
    case 'TAG':
      return { filter: key ? { tagId: key } : { untagged: true }, override: {} }
    case 'CAPABILITY':
      return {
        filter: key ? { capability: key } : { untypedCapability: true },
        override: {},
      }
    case 'AGENT':
      return {
        filter: {},
        override: key
          ? { agentPrincipalId: key, noAgent: undefined }
          : { noAgent: true, agentPrincipalId: undefined },
      }
    case 'CUSTOMER':
      return { filter: {}, override: key ? { customerId: key } : {} }
  }
}

function GroupTable(props: {
  data: DashboardSummary
  groupBy: DashboardGroupBy
  onGroupByChange: (value: DashboardGroupBy) => void
  state: ReturnType<typeof useServerTableState<DashboardGroupSort>>
  loading: boolean
  open: (
    request: DashboardDrawerPreset,
    override?: Partial<DashboardScopeQuery>
  ) => void
}) {
  const { t } = useTranslation()
  const format = useDashboardFormatters()
  const provisional = (row: DashboardGroupRow) =>
    row.incompleteCostTaskCount > 0 ? (
      <span className='text-muted-foreground text-xs'>
        {t('(provisional)')}
      </span>
    ) : null
  const groupName = (row: DashboardGroupRow) => {
    if (row.key === null) {
      return t(
        {
          MODEL: 'Unknown',
          PROVIDER: 'Unknown',
          TAG: 'Untagged',
          CAPABILITY: 'Unknown generation type',
          AGENT: 'No agent',
          CUSTOMER: 'Unknown customer',
        }[props.groupBy]
      )
    }
    if (props.groupBy === 'CAPABILITY') {
      return t(capabilityLabels[row.key] ?? row.key)
    }
    return row.name ?? row.key
  }
  const amount = (value: string) => (
    <span
      className={`tabular-nums ${isNegative(value) ? 'text-destructive' : ''}`}
    >
      {format.rmb(value)}
    </span>
  )
  const metricHelp = (term: string) => {
    const definition = getCanvasBusinessTerm('dashboardMetric', term)
    return definition ? t(definition.helpKey) : undefined
  }
  const columns: ColumnDef<DashboardGroupRow, unknown>[] = [
    {
      id: 'name',
      header: t(groupColumnLabels[props.groupBy]),
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => (
        <div className='min-w-0'>
          <div className='truncate'>{groupName(row.original)}</div>
          {props.groupBy === 'MODEL' && row.original.key ? (
            <div className='text-muted-foreground truncate font-mono text-xs'>
              {row.original.key}
              {row.original.modelStatus ? ` · ` : ''}
              {row.original.modelStatus
                ? t(modelStatusLabels[row.original.modelStatus] ?? 'Unknown')
                : null}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: 'consumedPoints',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Points consumed')} />
      ),
      enableHiding: false,
      cell: ({ row }) => {
        const selection = rowSelection(props.groupBy, row.original)
        return (
          <LinkValue
            onClick={() =>
              props.open(
                { kind: 'flow', flowType: 'CONSUMED', ...selection.filter },
                selection.override
              )
            }
          >
            {format.points(row.original.consumedPoints)}
          </LinkValue>
        )
      },
    },
    {
      id: 'listAmount',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('List amount')}
          description={metricHelp('LIST_AMOUNT')}
        />
      ),
      cell: ({ row }) => amount(consumptionEquation(row.original).listAmount),
    },
    {
      id: 'giftAmount',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Gift portion')}
          description={metricHelp('GIFT')}
        />
      ),
      cell: ({ row }) => amount(consumptionEquation(row.original).gift),
    },
    {
      id: 'cashSupport',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Recharge amount of consumption')}
          description={metricHelp('CONSUMED_CASH')}
        />
      ),
      cell: ({ row }) => amount(consumptionEquation(row.original).cashSupport),
    },
    {
      id: 'recordedCost',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Recorded call cost')}
          description={metricHelp('RECORDED_COST')}
        />
      ),
      cell: ({ row }) => {
        const selection = rowSelection(props.groupBy, row.original)
        return (
          <div className='space-y-0.5'>
            <LinkValue
              onClick={() =>
                props.open(
                  { kind: 'cost', costState: 'RECORDED', ...selection.filter },
                  selection.override
                )
              }
            >
              {format.rmb(consumptionEquation(row.original).recordedCost)}
            </LinkValue>
            {row.original.incompleteCostTaskCount > 0 ? (
              <div className='text-xs'>
                <LinkValue
                  onClick={() =>
                    props.open(
                      {
                        kind: 'cost',
                        costState: 'INCOMPLETE',
                        ...selection.filter,
                      },
                      selection.override
                    )
                  }
                >
                  {t('{{count}} tasks with incomplete cost data', {
                    count: row.original.incompleteCostTaskCount,
                  })}
                </LinkValue>
              </div>
            ) : null}
          </div>
        )
      },
    },
    {
      id: 'contribution',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Contribution')}
          description={metricHelp('CONTRIBUTION')}
        />
      ),
      cell: ({ row }) => (
        <span>
          {amount(consumptionEquation(row.original).contribution)}{' '}
          {provisional(row.original)}
        </span>
      ),
    },
    {
      id: 'listContribution',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('List contribution')}
          description={metricHelp('LIST_CONTRIBUTION')}
        />
      ),
      cell: ({ row }) => (
        <span>
          {amount(consumptionEquation(row.original).listContribution)}{' '}
          {provisional(row.original)}
        </span>
      ),
    },
    {
      id: 'modelCount',
      header: t('Model count'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='tabular-nums'>{row.original.modelCount}</span>
      ),
    },
  ]
  return (
    <Card>
      <CardHeader className='space-y-3'>
        <CardTitle>{t('Grouped view')}</CardTitle>
        <Tabs
          value={props.groupBy}
          onValueChange={(value) =>
            props.onGroupByChange(value as DashboardGroupBy)
          }
        >
          <TabsList className='flex-wrap'>
            {(Object.keys(groupByLabels) as DashboardGroupBy[]).map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(groupByLabels[value])}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className='space-y-2'>
        <CanvasServerTable
          data={props.data.groups.items}
          columns={columns}
          total={props.data.groups.total}
          state={props.state}
          loading={props.loading}
          emptyTitle={t('No point or cost records in the selected range')}
          getRowId={(row) => row.key ?? '__none__'}
          initialColumnVisibility={{ modelCount: false }}
        />
        <p className='text-muted-foreground text-xs tabular-nums'>
          {t('Total consumed points {{points}} · recorded call cost {{cost}}', {
            points: format.points(props.data.consumption.consumedPoints),
            cost: format.rmb(
              consumptionEquation(props.data.consumption).recordedCost
            ),
          })}
        </p>
      </CardContent>
    </Card>
  )
}

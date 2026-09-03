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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { Column } from '@tanstack/react-table'
import { RefreshCw } from 'lucide-react'
import { isValidElement, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import {
  isCanvasSectionAllowed,
  type canvasAdminSections as adminSections,
  type canvasAgentSections as agentSections,
  type canvasCustomerSections as customerSections,
} from './access'
import {
  getCanvasAdminWorkspace,
  getCanvasCatalog,
  getCanvasContributionReport,
  getCanvasCustomerWorkspace,
  getCanvasSession,
  redeemCanvasRechargeCode,
} from './api'
import { AdminAuditLog } from './components/AdminAuditLog'
import { AdminModelCatalog } from './components/AdminModelCatalog'
import {
  AdminPointAdjustments,
  type RefundRecoveryPrefill,
} from './components/AdminPointAdjustments'
import { AdminPricing } from './components/AdminPricing'
import {
  AdminRefundRecovery,
  type AdminRefundRecoveryPrefill,
} from './components/AdminRefundRecovery'
import { AdminTaskLogs } from './components/AdminTaskLogs'
import { AgentCenter } from './components/AgentCenter'
import { AgentManagement } from './components/AgentManagement'
import { BusinessTerm } from './components/BusinessTerm'
import { CustomerPointHistory } from './components/CustomerPointHistory'
import { CustomerRechargeCodeCard } from './components/CustomerRechargeCodeCard'
import { InviteActivation } from './components/InviteActivation'
import { InviteCodeManagement } from './components/InviteCodeManagement'
import { PricingCalculator } from './components/PricingCalculator'
import { PricingRecordsTable } from './components/PricingRecordsTable'
import { formatMoneyMinor } from './formatters'
import { CanvasRechargeCodes } from './RechargeCodes'

const route = getRouteApi('/_authenticated/canvas-cloud/$section')
type CustomerSection = (typeof customerSections)[number]
type AdminSection = (typeof adminSections)[number]
type AgentSection = (typeof agentSections)[number]
type CanvasSection = CustomerSection | AdminSection | AgentSection

const sectionTitles: Record<CanvasSection, string> = {
  dashboard: 'Canvas Dashboard',
  'usage-logs': 'Canvas Usage Logs',
  'task-logs': 'Canvas Task Logs',
  customers: 'Canvas Customers & Points',
  agents: 'Inviter management',
  'recharge-codes': 'Canvas Recharge Codes',
  'invite-codes': 'Canvas Invite Codes',
  catalog: 'Canvas Model Catalog',
  overview: 'Canvas Usage Overview',
  recharge: 'Redeem Points',
  models: 'Available Models',
  tasks: 'My Tasks',
  consumption: 'Point History',
  pricing: 'Canvas Pricing',
  'pricing-calculator': 'Canvas Pricing Calculator',
  channels: 'Canvas Channels',
  refunds: 'Refund point recovery',
  audit: 'Canvas Audit Log',
  'agent-center': 'Inviter center',
}

function sumPoints(values: string[]): string {
  return values.reduce((total, value) => total + BigInt(value), 0n).toString()
}

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'
}

function formatCnyMinor(value: string): string {
  const minor = BigInt(value)
  const absolute = minor < 0n ? -minor : minor
  const grouped = (absolute / 100n)
    .toString()
    .replaceAll(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${minor < 0n ? '-' : ''}¥${grouped}.${(absolute % 100n).toString().padStart(2, '0')}`
}

function DataTable(props: {
  headers: string[]
  rows: Array<{ key: string; cells: ReactNode[] }>
  empty: string
  filterableColumnIndexes: number[]
}) {
  type LocalTableRow = (typeof props.rows)[number]
  const dataColumnIndexes = new Set(
    props.headers.flatMap((_, index) =>
      props.rows.some((row) => {
        const cell = row.cells[index]
        return (
          typeof cell === 'string' ||
          typeof cell === 'number' ||
          (isValidElement<{ value?: string }>(cell) &&
            Boolean(cell.props.value))
        )
      })
        ? [index]
        : []
    )
  )
  const filterableColumnIndexes = new Set(props.filterableColumnIndexes)
  const columns = props.headers.map((header, index) => ({
    id: `${index}:${header}`,
    accessorFn: (row: LocalTableRow) => {
      const cell = row.cells[index]
      if (typeof cell === 'string' || typeof cell === 'number') {
        return String(cell)
      }
      if (isValidElement<{ value?: string }>(cell)) {
        return cell.props.value ?? ''
      }
      return ''
    },
    enableSorting: dataColumnIndexes.has(index),
    enableColumnFilter: filterableColumnIndexes.has(index),
    header: ({ column }: { column: Column<LocalTableRow, unknown> }) =>
      dataColumnIndexes.has(index) ? (
        <DataTableColumnHeader column={column} title={header} />
      ) : (
        header
      ),
    cell: ({ row }: { row: { original: LocalTableRow } }) =>
      row.original.cells[index],
  }))
  const filters = props.headers.flatMap((header, index) =>
    filterableColumnIndexes.has(index)
      ? [{ columnId: `${index}:${header}`, label: header }]
      : []
  )
  return (
    <PricingRecordsTable
      columns={columns}
      data={props.rows}
      filters={filters}
      getRowId={(row) => row.key}
      emptyTitle={props.empty}
    />
  )
}

function MetricCard(props: {
  title: string
  value: string
  description?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{props.title}</CardDescription>
        <CardTitle className='text-2xl tabular-nums'>{props.value}</CardTitle>
      </CardHeader>
      {props.description && (
        <CardContent className='text-muted-foreground'>
          {props.description}
        </CardContent>
      )}
    </Card>
  )
}

function CustomerContent(props: { section: CustomerSection }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'customer'],
    queryFn: getCanvasCustomerWorkspace,
  })
  const catalog = useQuery({
    queryKey: ['canvas-cloud', 'catalog'],
    queryFn: getCanvasCatalog,
    enabled: props.section === 'models',
  })
  const redeem = useMutation({
    mutationFn: redeemCanvasRechargeCode,
    onSuccess: async () => {
      setCode('')
      toast.success(t('Recharge code redeemed'))
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'customer'],
      })
    },
  })
  if (workspace.isPending) return <LoadingState />
  if (workspace.isError) {
    return <ErrorState onRetry={() => void workspace.refetch()} />
  }
  const data = workspace.data
  if (props.section === 'overview') {
    const completedTasks = data.tasks.filter(
      (task) => task.executionStatus === 'SUCCEEDED'
    ).length
    const consumedPoints = sumPoints(
      data.tasks
        .filter((task) => task.customerBillingStatus === 'SETTLED')
        .map((task) => task.quotedPoints)
    )
    const usageByModel = Object.entries(
      data.tasks.reduce<Record<string, { count: number; points: bigint }>>(
        (result, task) => {
          const key = task.modelName || t('Unknown model')
          const current = result[key] ?? { count: 0, points: 0n }
          current.count += 1
          if (task.customerBillingStatus === 'SETTLED') {
            current.points += BigInt(task.quotedPoints)
          }
          result[key] = current
          return result
        },
        {}
      )
    ).sort(([, left], [, right]) => right.count - left.count)
    return (
      <div className='space-y-4'>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          <MetricCard
            title={t('Available points')}
            value={data.wallet.availablePoints}
          />
          <MetricCard
            title={t('Points used')}
            value={consumedPoints}
            description={t('Latest 100 Canvas tasks')}
          />
          <MetricCard
            title={t('Tasks')}
            value={String(data.tasks.length)}
            description={t('Latest 100 Canvas tasks')}
          />
          <MetricCard
            title={t('Successful tasks')}
            value={String(completedTasks)}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('Model usage')}</CardTitle>
            <CardDescription>
              {t('Your own latest Canvas usage by model')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              empty={t('No Canvas tasks')}
              headers={[t('Model'), t('Tasks'), t('Points used')]}
              filterableColumnIndexes={[0]}
              rows={usageByModel.map(([model, usage]) => ({
                key: model,
                cells: [model, String(usage.count), usage.points.toString()],
              }))}
            />
          </CardContent>
        </Card>
      </div>
    )
  }
  if (props.section === 'recharge') {
    return (
      <div className='space-y-4'>
        <CustomerRechargeCodeCard
          code={code}
          redeeming={redeem.isPending}
          onCodeChange={setCode}
          onRedeem={() => redeem.mutate(code.trim())}
        />
        <DataTable
          empty={t('No recharge orders')}
          headers={[t('Order'), t('Status'), t('Amount'), t('Created')]}
          filterableColumnIndexes={[0]}
          rows={data.rechargeOrders.map((item) => ({
            key: item.id,
            cells: [
              item.orderNumber,
              <BusinessTerm
                key='s'
                kind='rechargeOrderStatus'
                value={item.status}
              />,
              formatMoneyMinor(item.listedAmountMinor, item.currency),
              formatDate(item.createdAt),
            ],
          }))}
        />
      </div>
    )
  }
  if (props.section === 'models') {
    if (catalog.isPending) return <LoadingState />
    if (catalog.isError) {
      return <ErrorState onRetry={() => void catalog.refetch()} />
    }
    return (
      <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
        {catalog.data.map((model) => (
          <Card key={model.id}>
            <CardHeader>
              <CardTitle>{model.name}</CardTitle>
              <CardDescription>
                {model.catalog.capability
                  ? t(String(model.catalog.capability))
                  : t('Canvas model')}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {model.parameterCombinations.map((combination) => (
                <div
                  key={combination.id}
                  className='bg-muted/50 flex items-center justify-between rounded-lg px-3 py-2'
                >
                  <span className='truncate'>
                    {Object.values(combination.parameters).join(' · ') ||
                      t('Default')}
                  </span>
                  <span className='font-medium tabular-nums'>
                    {combination.points} {t('points')}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }
  if (props.section === 'tasks') {
    return (
      <DataTable
        empty={t('No Canvas tasks')}
        headers={[
          t('Model'),
          t('Execution'),
          t('Billing'),
          t('Points'),
          t('Accepted'),
        ]}
        filterableColumnIndexes={[0]}
        rows={data.tasks.map((item) => ({
          key: item.id,
          cells: [
            item.modelName,
            <BusinessTerm
              key='e'
              kind='taskExecutionStatus'
              value={item.executionStatus}
            />,
            <BusinessTerm
              key='b'
              kind='billingStatus'
              value={item.customerBillingStatus}
            />,
            item.quotedPoints,
            formatDate(item.acceptedAt),
          ],
        }))}
      />
    )
  }
  if (props.section === 'consumption') return <CustomerPointHistory />
  return null
}

function AdminContent(props: {
  section: AdminSection
  refundPrefill: AdminRefundRecoveryPrefill
  onOpenRefundRecovery: (prefill: RefundRecoveryPrefill) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'admin'],
    queryFn: getCanvasAdminWorkspace,
    enabled: ![
      'customers',
      'refunds',
      'audit',
      'usage-logs',
      'task-logs',
    ].includes(props.section),
  })
  const dates = useMemo(
    () => ({
      from: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      to: new Date().toISOString(),
    }),
    []
  )
  const report = useQuery({
    queryKey: ['canvas-cloud', 'report', dates],
    queryFn: () => getCanvasContributionReport(dates.from, dates.to),
    enabled: props.section === 'dashboard',
  })
  if (props.section === 'customers') {
    return (
      <AdminPointAdjustments
        onOpenRefundRecovery={props.onOpenRefundRecovery}
      />
    )
  }
  if (props.section === 'refunds') {
    return <AdminRefundRecovery prefill={props.refundPrefill} />
  }
  if (props.section === 'audit') return <AdminAuditLog />
  if (props.section === 'usage-logs') return <AdminTaskLogs kind='usage' />
  if (props.section === 'task-logs') return <AdminTaskLogs kind='task' />
  if (workspace.isPending) return <LoadingState />
  if (workspace.isError) {
    return <ErrorState onRetry={() => void workspace.refetch()} />
  }
  const data = workspace.data
  if (props.section === 'dashboard') {
    const totalAvailablePoints = sumPoints(
      data.customers.map((customer) => customer.availablePoints)
    )
    const settledPoints = sumPoints(
      data.recentTasks
        .filter((task) => task.customerBillingStatus === 'SETTLED')
        .map((task) => task.quotedPoints)
    )
    const successfulTasks = data.recentTasks.filter(
      (task) => task.executionStatus === 'SUCCEEDED'
    ).length
    const activeWorkers = data.executorWorkers.filter(
      (worker) => worker.status === 'RUNNING'
    ).length
    return (
      <div className='space-y-4'>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          <MetricCard
            title={t('Active customers')}
            value={String(
              data.customers.filter((customer) => customer.status === 'ACTIVE')
                .length
            )}
          />
          <MetricCard
            title={t('Customer available points')}
            value={totalAvailablePoints}
          />
          <MetricCard
            title={t('Points used')}
            value={settledPoints}
            description={t('Latest 100 platform Canvas tasks')}
          />
          <MetricCard
            title={t('Executor health')}
            value={`${activeWorkers}/${data.executorWorkers.length}`}
            description={t('Running workers')}
          />
        </div>
        <div className='grid gap-4 lg:grid-cols-2'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Task health')}</CardTitle>
              <CardDescription>
                {t('Latest 100 platform Canvas tasks')}
              </CardDescription>
            </CardHeader>
            <CardContent className='grid grid-cols-2 gap-3'>
              <MetricCard
                title={t('Tasks')}
                value={String(data.recentTasks.length)}
              />
              <MetricCard
                title={t('Successful tasks')}
                value={String(successfulTasks)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('Attention required')}</CardTitle>
              <CardDescription>
                {t('Operational items that need administrator review')}
              </CardDescription>
            </CardHeader>
            <CardContent className='grid grid-cols-2 gap-3'>
              <MetricCard
                title={t('Reconciliation tasks')}
                value={String(data.reconciliationTasks.length)}
              />
              <MetricCard
                title={t('Refunds')}
                value={String(
                  data.refunds.filter((item) => item.status !== 'COMPLETED')
                    .length
                )}
              />
            </CardContent>
          </Card>
        </div>
        {report.isSuccess && (
          <Card>
            <CardHeader>
              <CardTitle>{t('Contribution overview')}</CardTitle>
              <CardDescription>{t(report.data.disclaimer)}</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
              <MetricCard
                title={t('Original contribution')}
                value={formatCnyMinor(
                  report.data.originalBatchContributionMinor
                )}
              />
              <MetricCard
                title={t('Refund adjustments')}
                value={formatCnyMinor(
                  report.data.refundAndChargebackAdjustmentsMinor
                )}
              />
              <MetricCard
                title={t('Adjusted contribution')}
                value={formatCnyMinor(report.data.adjustedContributionMinor)}
              />
              <MetricCard
                title={t('Reconciliation timeout loss')}
                value={formatCnyMinor(
                  report.data.reconciliationTimeoutLossMinor
                )}
              />
            </CardContent>
          </Card>
        )}
      </div>
    )
  }
  if (props.section === 'agents') return <AgentManagement />
  if (props.section === 'recharge-codes') {
    return <CanvasRechargeCodes embedded />
  }
  if (props.section === 'invite-codes') return <InviteCodeManagement />
  if (props.section === 'catalog') return <AdminModelCatalog />
  if (props.section === 'pricing') {
    return (
      <AdminPricing
        prices={data.prices}
        pricePromotions={data.pricePromotions ?? []}
        onChanged={() =>
          queryClient.invalidateQueries({ queryKey: ['canvas-cloud', 'admin'] })
        }
      />
    )
  }
  if (props.section === 'pricing-calculator') {
    return <PricingCalculator />
  }
  if (props.section === 'channels') {
    return (
      <div className='space-y-4'>
        <DataTable
          empty={t('No data')}
          headers={[
            t('ID'),
            t('Mode'),
            t('Status'),
            t('Credentials'),
            t('Updated'),
          ]}
          filterableColumnIndexes={[0, 1]}
          rows={data.executorWorkers.map((item) => ({
            key: `${item.queueName}:${item.workerId}`,
            cells: [
              `${item.queueName} · ${item.workerId}`,
              item.mode,
              <BusinessTerm
                key='status'
                kind='executorStatus'
                value={item.status}
              />,
              item.credentialsConfigured
                ? t('Configured')
                : t('Not configured'),
              formatDate(item.heartbeatAt),
            ],
          }))}
        />
        <DataTable
          empty={t('No provider channels')}
          headers={[
            t('Provider'),
            t('Channel'),
            t('Status'),
            t('Adapter'),
            t('Upstream model'),
          ]}
          filterableColumnIndexes={[0, 1, 3, 4]}
          rows={data.channels.map((item) => ({
            key: item.id,
            cells: [
              item.providerName,
              `${item.code} v${item.version}`,
              <BusinessTerm key='s' kind='configStatus' value={item.status} />,
              item.protocolAdapter,
              item.upstreamModel,
            ],
          }))}
        />
      </div>
    )
  }
  return null
}

export function CanvasCloud() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const params = route.useParams()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const session = useQuery({
    queryKey: ['canvas-cloud', 'session'],
    queryFn: getCanvasSession,
    retry: false,
  })
  if (session.isPending) {
    return (
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Canvas Cloud')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <LoadingState />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    )
  }
  if (session.isError) {
    return (
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Canvas Cloud')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <div className='space-y-4'>
            <ErrorState
              title={t('Canvas access unavailable')}
              description={t(
                'Complete Canvas invite registration or contact an administrator.'
              )}
              onRetry={() => void session.refetch()}
            />
            <InviteActivation />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>
    )
  }
  if (
    !isCanvasSectionAllowed(
      session.data.principalType,
      params.section,
      session.data.inviterEnabled
    )
  ) {
    return (
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Canvas Cloud')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <ErrorState
            title={t('Access denied')}
            description={t('You do not have access to this Canvas section.')}
          />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    )
  }
  const section = params.section as CanvasSection
  let content: ReactNode
  if (section === 'agent-center') {
    content = <AgentCenter />
  } else if (session.data.principalType === 'CUSTOMER') {
    content = <CustomerContent section={section as CustomerSection} />
  } else if (session.data.principalType === 'PLATFORM_ADMIN') {
    content = (
      <AdminContent
        section={section as AdminSection}
        refundPrefill={search}
        onOpenRefundRecovery={(prefill) =>
          void navigate({
            to: '/canvas-cloud/$section',
            params: { section: 'refunds' },
            search: prefill,
          })
        }
      />
    )
  } else content = <AgentCenter />
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t(sectionTitles[section])}
      </SectionPageLayout.Title>
      {section !== 'pricing-calculator' && (
        <SectionPageLayout.Actions>
          <Button
            variant='outline'
            size='sm'
            onClick={() =>
              void queryClient
                .invalidateQueries({ queryKey: ['canvas-cloud'] })
                .then(() => toast.success(t('Canvas data refreshed')))
            }
          >
            <RefreshCw />
            {t('Refresh')}
          </Button>
        </SectionPageLayout.Actions>
      )}
      <SectionPageLayout.Content>
        <div className='min-w-0'>{content}</div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

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
import { RefreshCw } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  isCanvasSectionAllowed,
  type canvasAdminSections as adminSections,
  type canvasCustomerSections as customerSections,
} from './access'
import {
  createCanvasRefund,
  getCanvasAdminWorkspace,
  getCanvasAuditEvents,
  getCanvasCatalog,
  getCanvasContributionReport,
  getCanvasCustomerWorkspace,
  getCanvasSession,
  reconcileCanvasTask,
  redeemCanvasRechargeCode,
} from './api'
import { AdminModelCatalog } from './components/AdminModelCatalog'
import { AdminPricing } from './components/AdminPricing'
import { BusinessTerm } from './components/BusinessTerm'
import { PricingCalculator } from './components/PricingCalculator'
import { RechargeCodeCard } from './components/RechargeCodeCard'
import { formatMoneyMinor } from './formatters'
import { CanvasRechargeCodes } from './RechargeCodes'

const route = getRouteApi('/_authenticated/canvas-cloud/$section')
type CustomerSection = (typeof customerSections)[number]
type AdminSection = (typeof adminSections)[number]
type CanvasSection = CustomerSection | AdminSection

const sectionTitles: Record<CanvasSection, string> = {
  dashboard: 'Canvas Dashboard',
  'usage-logs': 'Canvas Usage Logs',
  'task-logs': 'Canvas Task Logs',
  customers: 'Canvas Customers & Points',
  'recharge-codes': 'Canvas Recharge Codes',
  catalog: 'Canvas Model Catalog',
  overview: 'Canvas Usage Overview',
  recharge: 'Redeem Points',
  models: 'Available Models',
  tasks: 'My Tasks',
  consumption: 'Point History',
  pricing: 'Canvas Pricing',
  'pricing-calculator': 'Canvas Pricing Calculator',
  channels: 'Canvas Channels',
  refunds: 'Canvas Refunds',
  audit: 'Canvas Audit Log',
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
}) {
  if (props.rows.length === 0) {
    return <EmptyState title={props.empty} bordered />
  }
  return (
    <div className='overflow-x-auto rounded-xl border'>
      <table className='w-full min-w-[720px] text-left text-sm'>
        <thead className='bg-muted/60 text-muted-foreground'>
          <tr>
            {props.headers.map((header) => (
              <th key={header} scope='col' className='px-3 py-2 font-medium'>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className='divide-y'>
          {props.rows.map((row) => (
            <tr key={row.key} className='hover:bg-muted/30'>
              {row.cells.map((cell, cellIndex) => (
                <td
                  key={props.headers[cellIndex]}
                  className='px-3 py-2 align-middle'
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
        <RechargeCodeCard
          code={code}
          purchaseUrl={null}
          redeeming={redeem.isPending}
          onCodeChange={setCode}
          onRedeem={() => redeem.mutate(code.trim())}
        />
        <DataTable
          empty={t('No recharge orders')}
          headers={[t('Order'), t('Status'), t('Amount'), t('Created')]}
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
                {String(model.catalog.capability ?? t('Canvas model'))}
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
  return (
    <div className='space-y-4'>
      <DataTable
        empty={t('No point lots')}
        headers={[t('Type'), t('Available'), t('Reserved'), t('Expires')]}
        rows={data.wallet.lots.map((item) => ({
          key: item.id,
          cells: [
            <BusinessTerm key='type' kind='pointLotType' value={item.type} />,
            item.availablePoints,
            item.reservedPoints,
            formatDate(item.expiresAt),
          ],
        }))}
      />
      <DataTable
        empty={t('No consumption records')}
        headers={[
          t('Event'),
          t('Points'),
          t('Remaining delta'),
          t('Reason'),
          t('Time'),
        ]}
        rows={data.ledger.map((item) => ({
          key: item.id,
          cells: [
            <BusinessTerm
              key='event'
              kind='ledgerEvent'
              value={item.eventType}
            />,
            item.eventPoints,
            item.remainingDelta,
            item.reason ? (
              <BusinessTerm
                key='reason'
                kind='ledgerReason'
                value={item.reason}
              />
            ) : (
              '—'
            ),
            formatDate(item.occurredAt),
          ],
        }))}
      />
    </div>
  )
}

function AdminContent(props: { section: AdminSection }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [refund, setRefund] = useState({
    rechargeOrderId: '',
    cashAmountMinor: '0',
    pointsRequested: '0',
    reason: '',
  })
  const [auditFilters, setAuditFilters] = useState({
    action: '',
    outcome: '',
    resourceId: '',
  })
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'admin'],
    queryFn: getCanvasAdminWorkspace,
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
  const audit = useQuery({
    queryKey: ['canvas-cloud', 'audit', auditFilters],
    queryFn: () =>
      getCanvasAuditEvents({
        page: 1,
        pageSize: 50,
        ...(auditFilters.action.trim()
          ? { action: auditFilters.action.trim() }
          : {}),
        ...(auditFilters.outcome
          ? {
              outcome: auditFilters.outcome as
                | 'SUCCESS'
                | 'FAILURE'
                | 'DEFERRED',
            }
          : {}),
        ...(auditFilters.resourceId.trim()
          ? { resourceId: auditFilters.resourceId.trim() }
          : {}),
      }),
    enabled: props.section === 'audit',
  })
  const reconcile = useMutation({
    mutationFn: (taskId: string) =>
      reconcileCanvasTask(taskId, 'RECONCILED', 'Reviewed in Canvas Cloud Web'),
    onSuccess: async () => {
      toast.success(t('Task reconciled'))
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin'],
      })
    },
  })
  const createRefund = useMutation({
    mutationFn: createCanvasRefund,
    onSuccess: async () => {
      toast.success(t('Refund workflow created'))
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin'],
      })
    },
  })
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
  if (props.section === 'usage-logs') {
    return (
      <DataTable
        empty={t('No consumption records')}
        headers={[
          t('Customer'),
          t('Model'),
          t('Points used'),
          t('Billing'),
          t('Time'),
        ]}
        rows={data.recentTasks.map((item) => ({
          key: item.id,
          cells: [
            item.customerName,
            item.modelName,
            item.quotedPoints,
            <BusinessTerm
              key='billing'
              kind='billingStatus'
              value={item.customerBillingStatus}
            />,
            formatDate(item.acceptedAt),
          ],
        }))}
      />
    )
  }
  if (props.section === 'task-logs') {
    return (
      <DataTable
        empty={t('No Canvas tasks')}
        headers={[
          t('Customer'),
          t('Model'),
          t('Execution'),
          t('Billing'),
          t('Reconciliation'),
          t('Source'),
          t('Accepted'),
        ]}
        rows={data.recentTasks.map((item) => ({
          key: item.id,
          cells: [
            item.customerName,
            item.modelName,
            <BusinessTerm
              key='execution'
              kind='taskExecutionStatus'
              value={item.executionStatus}
            />,
            <BusinessTerm
              key='billing'
              kind='billingStatus'
              value={item.customerBillingStatus}
            />,
            <BusinessTerm
              key='reconciliation'
              kind='reconciliationStatus'
              value={item.providerReconcileStatus}
            />,
            item.executionOrigin ?? '—',
            formatDate(item.acceptedAt),
          ],
        }))}
      />
    )
  }
  if (props.section === 'customers') {
    return (
      <DataTable
        empty={t('No customers')}
        headers={[
          t('Customer'),
          t('Status'),
          t('Available points'),
          t('Paid points'),
          t('Bonus points'),
        ]}
        rows={data.customers.map((item) => ({
          key: item.customerId,
          cells: [
            item.username,
            item.status,
            item.availablePoints,
            item.paidAvailablePoints,
            item.bonusAvailablePoints,
          ],
        }))}
      />
    )
  }
  if (props.section === 'recharge-codes') {
    return <CanvasRechargeCodes embedded />
  }
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
  if (props.section === 'audit') {
    if (audit.isPending) return <LoadingState />
    if (audit.isError) {
      return <ErrorState onRetry={() => void audit.refetch()} />
    }
    return (
      <div className='space-y-4'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Cloud audit filters')}</CardTitle>
            <CardDescription>
              {t('Read-only persistent Cloud security and task facts')}
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-3'>
            <div className='space-y-2'>
              <Label htmlFor='canvas-audit-action'>{t('Action')}</Label>
              <Input
                id='canvas-audit-action'
                value={auditFilters.action}
                onChange={(event) =>
                  setAuditFilters((current) => ({
                    ...current,
                    action: event.target.value,
                  }))
                }
                placeholder='task.execution.succeeded'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='canvas-audit-outcome'>{t('Outcome')}</Label>
              <select
                id='canvas-audit-outcome'
                className='border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none'
                value={auditFilters.outcome}
                onChange={(event) =>
                  setAuditFilters((current) => ({
                    ...current,
                    outcome: event.target.value,
                  }))
                }
              >
                <option value=''>{t('All outcomes')}</option>
                <option value='SUCCESS'>{t('Success')}</option>
                <option value='FAILURE'>{t('Failure')}</option>
                <option value='DEFERRED'>{t('Deferred')}</option>
              </select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='canvas-audit-resource'>{t('Resource ID')}</Label>
              <Input
                id='canvas-audit-resource'
                value={auditFilters.resourceId}
                onChange={(event) =>
                  setAuditFilters((current) => ({
                    ...current,
                    resourceId: event.target.value,
                  }))
                }
              />
            </div>
          </CardContent>
        </Card>
        <DataTable
          empty={t('No audit events')}
          headers={[
            t('Time'),
            t('Outcome'),
            t('Action'),
            t('Actor'),
            t('Resource'),
            t('Reason'),
          ]}
          rows={audit.data.items.map((item) => ({
            key: item.id,
            cells: [
              formatDate(item.occurredAt),
              item.outcome,
              item.action,
              item.actorPrincipalId
                ? `${item.actorType} · ${item.actorPrincipalId}`
                : item.actorType,
              item.resourceId
                ? `${item.resourceType} · ${item.resourceId}`
                : (item.resourceKey ?? item.resourceType),
              item.reasonCode ?? '—',
            ],
          }))}
        />
      </div>
    )
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
          rows={data.executorWorkers.map((item) => ({
            key: `${item.queueName}:${item.workerId}`,
            cells: [
              `${item.queueName} · ${item.workerId}`,
              item.mode,
              item.status,
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
        <DataTable
          empty={t('No reconciliation tasks')}
          headers={[
            t('Model'),
            t('Execution'),
            t('Source'),
            t('Reconciliation'),
            t('Accepted'),
            t('Action'),
          ]}
          rows={data.reconciliationTasks.map((item) => ({
            key: item.id,
            cells: [
              item.modelName,
              <BusinessTerm
                key='execution'
                kind='taskExecutionStatus'
                value={item.executionStatus}
              />,
              item.executionOrigin ?? '—',
              <BusinessTerm
                key='s'
                kind='reconciliationStatus'
                value={item.providerReconcileStatus}
              />,
              formatDate(item.acceptedAt),
              item.providerReconcileStatus === 'COST_CONFIRMED' ? (
                <Button
                  key='a'
                  size='sm'
                  disabled={reconcile.isPending}
                  onClick={() => reconcile.mutate(item.id)}
                >
                  {t('Reconcile')}
                </Button>
              ) : (
                '—'
              ),
            ],
          }))}
        />
      </div>
    )
  }
  if (props.section === 'refunds') {
    return (
      <div className='space-y-4'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Create approved refund workflow')}</CardTitle>
            <CardDescription>
              {t(
                'Cash adjustment and point clawback remain linked and auditable.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className='grid gap-3 md:grid-cols-2'
              onSubmit={(event) => {
                event.preventDefault()
                createRefund.mutate(refund)
              }}
            >
              <div className='space-y-1'>
                <Label htmlFor='refund-order'>{t('Recharge order ID')}</Label>
                <Input
                  id='refund-order'
                  required
                  value={refund.rechargeOrderId}
                  onChange={(event) =>
                    setRefund({
                      ...refund,
                      rechargeOrderId: event.target.value,
                    })
                  }
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='refund-cash'>
                  {t('Cash amount (minor units)')}
                </Label>
                <Input
                  id='refund-cash'
                  inputMode='numeric'
                  required
                  value={refund.cashAmountMinor}
                  onChange={(event) =>
                    setRefund({
                      ...refund,
                      cashAmountMinor: event.target.value,
                    })
                  }
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='refund-points'>
                  {t('Points to claw back')}
                </Label>
                <Input
                  id='refund-points'
                  inputMode='numeric'
                  required
                  value={refund.pointsRequested}
                  onChange={(event) =>
                    setRefund({
                      ...refund,
                      pointsRequested: event.target.value,
                    })
                  }
                />
              </div>
              <div className='space-y-1'>
                <Label htmlFor='refund-reason'>{t('Reason')}</Label>
                <Input
                  id='refund-reason'
                  required
                  value={refund.reason}
                  onChange={(event) =>
                    setRefund({ ...refund, reason: event.target.value })
                  }
                />
              </div>
              <Button
                className='md:col-span-2 md:justify-self-start'
                type='submit'
                disabled={createRefund.isPending}
              >
                {t('Create refund workflow')}
              </Button>
            </form>
          </CardContent>
        </Card>
        <DataTable
          empty={t('No refunds')}
          headers={[
            t('Reference'),
            t('Order'),
            t('Status'),
            t('Cash'),
            t('Clawed back'),
            t('Outstanding'),
          ]}
          rows={data.refunds.map((item) => ({
            key: item.id,
            cells: [
              item.refundReference,
              item.orderNumber,
              <BusinessTerm key='s' kind='refundStatus' value={item.status} />,
              formatCnyMinor(item.cashAmountMinor),
              item.pointsClawedBack,
              item.pointsOutstanding,
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
          <ErrorState
            title={t('Canvas access unavailable')}
            description={t(
              'Complete Canvas invite registration or contact an administrator.'
            )}
            onRetry={() => void session.refetch()}
          />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    )
  }
  const admin = session.data.principalType === 'PLATFORM_ADMIN'
  if (!isCanvasSectionAllowed(session.data.principalType, params.section)) {
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
  if (!admin) {
    content = <CustomerContent section={section as CustomerSection} />
  } else {
    content = <AdminContent section={section as AdminSection} />
  }
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

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
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { StatusBadge } from '@/components/status-badge'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  createCanvasRechargeOrder,
  createCanvasRefund,
  getCanvasAdminWorkspace,
  getCanvasCatalog,
  getCanvasContributionReport,
  getCanvasCustomerWorkspace,
  getCanvasRechargeOffers,
  getCanvasSession,
  publishCanvasPriceVersion,
  reconcileCanvasTask,
  redeemCanvasRechargeCode,
} from './api'
import { formatMoneyMinor } from './formatters'

const route = getRouteApi('/_authenticated/canvas-cloud/$section')
const customerSections = [
  'overview',
  'recharge',
  'models',
  'tasks',
  'consumption',
] as const
const adminSections = ['pricing', 'channels', 'refunds', 'reports'] as const
type CustomerSection = (typeof customerSections)[number]
type AdminSection = (typeof adminSections)[number]
type CanvasSection = CustomerSection | AdminSection

const sectionTitles: Record<CanvasSection, string> = {
  overview: 'Canvas Overview',
  recharge: 'Canvas Recharge',
  models: 'Canvas Models',
  tasks: 'Canvas Tasks',
  consumption: 'Canvas Consumption',
  pricing: 'Canvas Pricing',
  channels: 'Canvas Channels',
  refunds: 'Canvas Refunds',
  reports: 'Canvas Reports',
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
  rows: ReactNode[][]
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
          {props.rows.map((cells) => (
            <tr
              key={typeof cells[0] === 'string' ? cells[0] : String(cells[0])}
              className='hover:bg-muted/30'
            >
              {cells.map((cell, cellIndex) => (
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
  const offers = useQuery({
    queryKey: ['canvas-cloud', 'offers'],
    queryFn: getCanvasRechargeOffers,
    enabled: props.section === 'recharge',
  })
  const order = useMutation({
    mutationFn: createCanvasRechargeOrder,
    onSuccess: async () => {
      toast.success(t('Recharge order created'))
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'customer'],
      })
    },
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
    return (
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          title={t('Available points')}
          value={data.wallet.availablePoints}
        />
        <MetricCard
          title={t('Paid points')}
          value={data.wallet.paidAvailablePoints}
        />
        <MetricCard
          title={t('Bonus points')}
          value={data.wallet.bonusAvailablePoints}
        />
        <MetricCard
          title={t('Recent tasks')}
          value={String(data.tasks.length)}
          description={t('Latest 100 Canvas tasks')}
        />
      </div>
    )
  }
  if (props.section === 'recharge') {
    return (
      <div className='space-y-4'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Redeem recharge code')}</CardTitle>
            <CardDescription>
              {t('Points are issued only after a valid code is redeemed.')}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-2 sm:flex-row'>
            <Input
              aria-label={t('Recharge code')}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button
              disabled={code.trim().length < 8 || redeem.isPending}
              onClick={() => redeem.mutate(code.trim())}
            >
              {t('Redeem')}
            </Button>
          </CardContent>
        </Card>
        <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
          {offers.data?.map((offer) => (
            <Card key={offer.offerVersionId}>
              <CardHeader>
                <CardTitle>
                  {formatMoneyMinor(offer.listedAmountMinor, offer.currency)}
                </CardTitle>
                <CardDescription>
                  {t('{{points}} paid points', { points: offer.paidPoints })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className='w-full'
                  disabled={order.isPending}
                  onClick={() => order.mutate(offer.offerVersionId)}
                >
                  {t('Create recharge order')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <DataTable
          empty={t('No recharge orders')}
          headers={[t('Order'), t('Status'), t('Amount'), t('Created')]}
          rows={data.rechargeOrders.map((item) => [
            item.orderNumber,
            <StatusBadge key='s' label={item.status} copyable={false} />,
            formatMoneyMinor(item.listedAmountMinor, item.currency),
            formatDate(item.createdAt),
          ])}
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
        rows={data.tasks.map((item) => [
          item.modelName,
          <StatusBadge key='e' label={item.executionStatus} copyable={false} />,
          <StatusBadge
            key='b'
            label={item.customerBillingStatus}
            copyable={false}
          />,
          item.quotedPoints,
          formatDate(item.acceptedAt),
        ])}
      />
    )
  }
  return (
    <div className='space-y-4'>
      <DataTable
        empty={t('No point lots')}
        headers={[t('Type'), t('Available'), t('Reserved'), t('Expires')]}
        rows={data.wallet.lots.map((item) => [
          item.type,
          item.availablePoints,
          item.reservedPoints,
          formatDate(item.expiresAt),
        ])}
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
        rows={data.ledger.map((item) => [
          item.eventType,
          item.eventPoints,
          item.remainingDelta,
          item.reason ?? '—',
          formatDate(item.occurredAt),
        ])}
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
    enabled: props.section === 'reports',
  })
  const publish = useMutation({
    mutationFn: publishCanvasPriceVersion,
    onSuccess: async () => {
      toast.success(t('Price published'))
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin'],
      })
    },
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
  if (props.section === 'pricing') {
    return (
      <DataTable
        empty={t('No price versions')}
        headers={[
          t('Model'),
          t('Price group'),
          t('Status'),
          t('Points'),
          t('Break-even'),
          t('Action'),
        ]}
        rows={data.prices.map((item) => [
          item.modelName,
          item.priceGroup,
          <StatusBadge key='s' label={item.status} copyable={false} />,
          item.points,
          item.breakEvenPoints,
          item.status === 'APPROVED' ? (
            <Button
              key='a'
              size='sm'
              disabled={publish.isPending}
              onClick={() => publish.mutate(item.id)}
            >
              {t('Publish')}
            </Button>
          ) : (
            '—'
          ),
        ])}
      />
    )
  }
  if (props.section === 'channels') {
    return (
      <div className='space-y-4'>
        <DataTable
          empty={t('No provider channels')}
          headers={[
            t('Provider'),
            t('Channel'),
            t('Status'),
            t('Adapter'),
            t('Upstream model'),
          ]}
          rows={data.channels.map((item) => [
            item.providerName,
            `${item.code} v${item.version}`,
            <StatusBadge key='s' label={item.status} copyable={false} />,
            item.protocolAdapter,
            item.upstreamModel,
          ])}
        />
        <DataTable
          empty={t('No reconciliation tasks')}
          headers={[
            t('Model'),
            t('Execution'),
            t('Reconciliation'),
            t('Accepted'),
            t('Action'),
          ]}
          rows={data.reconciliationTasks.map((item) => [
            item.modelName,
            item.executionStatus,
            <StatusBadge
              key='s'
              label={item.providerReconcileStatus}
              copyable={false}
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
          ])}
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
          rows={data.refunds.map((item) => [
            item.refundReference,
            item.orderNumber,
            <StatusBadge key='s' label={item.status} copyable={false} />,
            formatCnyMinor(item.cashAmountMinor),
            item.pointsClawedBack,
            item.pointsOutstanding,
          ])}
        />
      </div>
    )
  }
  if (report.isPending) return <LoadingState />
  if (report.isError) {
    return <ErrorState onRetry={() => void report.refetch()} />
  }
  return (
    <div className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          title={t('Original contribution')}
          value={formatCnyMinor(report.data.originalBatchContributionMinor)}
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
          value={formatCnyMinor(report.data.reconciliationTimeoutLossMinor)}
        />
      </div>
      <Card>
        <CardContent className='text-muted-foreground pt-1'>
          {report.data.disclaimer}
        </CardContent>
      </Card>
    </div>
  )
}

export function CanvasCloud() {
  const { t } = useTranslation()
  const navigate = useNavigate()
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
  const admin =
    session.data.principalType === 'PLATFORM_ADMIN' ||
    session.data.principalType === 'BOSS'
  const allowed = admin ? adminSections : customerSections
  const section = (allowed as readonly string[]).includes(params.section)
    ? (params.section as CanvasSection)
    : allowed[0]
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t(sectionTitles[section])}
      </SectionPageLayout.Title>
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
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          <Tabs
            value={section}
            onValueChange={(value) =>
              void navigate({
                to: '/canvas-cloud/$section',
                params: { section: value },
              })
            }
          >
            <TabsList className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'>
              {allowed.map((item) => (
                <TabsTrigger key={item} value={item}>
                  {t(sectionTitles[item])}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {admin ? (
            <AdminContent section={section as AdminSection} />
          ) : (
            <CustomerContent section={section as CustomerSection} />
          )}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

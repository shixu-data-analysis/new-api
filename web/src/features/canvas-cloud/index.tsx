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
import { Textarea } from '@/components/ui/textarea'

import {
  approveCanvasModelRelease,
  createCanvasModelReleaseDraft,
  createCanvasRefund,
  getCanvasAdminWorkspace,
  getCanvasAdminTestingModels,
  getCanvasCatalog,
  getCanvasContributionReport,
  getCanvasCustomerWorkspace,
  getCanvasModelReleases,
  getCanvasRechargePurchaseLink,
  getCanvasSession,
  planCanvasModelRelease,
  publishCanvasModelRelease,
  reconcileCanvasTask,
  redeemCanvasRechargeCode,
} from './api'
import { AdminPricing } from './components/AdminPricing'
import { BusinessTerm } from './components/BusinessTerm'
import { PricingCalculator } from './components/PricingCalculator'
import { RechargeCodeCard } from './components/RechargeCodeCard'
import { formatMoneyMinor } from './formatters'
import type {
  CanvasModelReleaseManifest,
  CanvasModelReleasePlan,
} from './types'

const route = getRouteApi('/_authenticated/canvas-cloud/$section')
const customerSections = [
  'overview',
  'recharge',
  'models',
  'tasks',
  'consumption',
] as const
const adminSections = [
  'pricing',
  'pricing-calculator',
  'channels',
  'refunds',
  'reports',
  'model-releases',
] as const
const adminNavigationSections = adminSections.filter(
  (section) => section !== 'pricing-calculator'
)
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
  'pricing-calculator': 'Canvas Pricing Calculator',
  channels: 'Canvas Channels',
  refunds: 'Canvas Refunds',
  reports: 'Canvas Reports',
  'model-releases': 'Canvas Model Releases',
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

function parseManifestText(value: string): CanvasModelReleaseManifest {
  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || !('changeId' in parsed)) {
    throw new Error('Invalid model release manifest')
  }
  return parsed as CanvasModelReleaseManifest
}

function JsonSnapshot(props: { value: Record<string, unknown> | null }) {
  return (
    <pre className='max-w-[28rem] overflow-x-auto text-xs break-words whitespace-pre-wrap'>
      {props.value === null ? '—' : JSON.stringify(props.value, null, 2)}
    </pre>
  )
}

function AdminModelReleases() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [manifestText, setManifestText] = useState('')
  const [plan, setPlan] = useState<CanvasModelReleasePlan | null>(null)
  const [plannedText, setPlannedText] = useState<string | null>(null)
  const releases = useQuery({
    queryKey: ['canvas-cloud', 'model-releases'],
    queryFn: getCanvasModelReleases,
  })
  const testingModels = useQuery({
    queryKey: ['canvas-cloud', 'admin-testing-models'],
    queryFn: getCanvasAdminTestingModels,
  })
  const preview = useMutation({
    mutationFn: async (text: string) =>
      planCanvasModelRelease(parseManifestText(text)),
    onSuccess: (nextPlan, text) => {
      setPlan(nextPlan)
      setPlannedText(text)
      toast.success(t('Model release diff ready'))
    },
    onError: () => toast.error(t('Model release manifest is invalid')),
  })
  const refreshReleases = async () => {
    setPlan(null)
    setPlannedText(null)
    await queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'model-releases'],
    })
  }
  const draft = useMutation({
    mutationFn: async () =>
      createCanvasModelReleaseDraft(parseManifestText(manifestText)),
    onSuccess: async () => {
      toast.success(t('Model release draft created'))
      await refreshReleases()
    },
    onError: () => toast.error(t('Model release draft failed')),
  })
  const approve = useMutation({
    mutationFn: approveCanvasModelRelease,
    onSuccess: async () => {
      toast.success(t('Model release approved'))
      await refreshReleases()
    },
    onError: () => toast.error(t('Model release approval failed')),
  })
  const publishRelease = useMutation({
    mutationFn: publishCanvasModelRelease,
    onSuccess: async () => {
      toast.success(t('Model release published'))
      await refreshReleases()
    },
    onError: () => toast.error(t('Model release publication failed')),
  })

  if (releases.isPending) return <LoadingState />
  if (releases.isError) {
    return <ErrorState onRetry={() => void releases.refetch()} />
  }

  const planIsCurrent = plan !== null && plannedText === manifestText
  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Model pricing readiness')}</CardTitle>
          <CardDescription>
            {t(
              'Published models remain available for internal management testing before every customer pricing target is ready.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            empty={t('No internally testable models')}
            headers={[
              t('Model'),
              t('Provider'),
              t('Status'),
              t('Pricing readiness'),
              t('Customer visibility'),
            ]}
            rows={(testingModels.data ?? []).map((model) => [
              `${model.name} · ${model.modelKey} · v${model.version}`,
              `${model.provider.name} · ${model.channel.upstreamModel}`,
              t(model.status),
              `${model.pricedTargets}/${model.totalTargets}`,
              model.customerVisible
                ? t('Visible to priced customers')
                : t('Management testing only'),
            ])}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('Import reviewed model release')}</CardTitle>
          <CardDescription>
            {t(
              'Import a secret-free reviewed JSON package, preview every database change, then create a draft.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <div className='space-y-1'>
            <Label htmlFor='model-release-file'>
              {t('Review package file')}
            </Label>
            <Input
              id='model-release-file'
              type='file'
              accept='application/json,.json'
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                void file.text().then((value) => {
                  setManifestText(value)
                  setPlan(null)
                  setPlannedText(null)
                })
              }}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='model-release-json'>
              {t('Review package JSON')}
            </Label>
            <Textarea
              id='model-release-json'
              className='min-h-64 font-mono text-xs'
              value={manifestText}
              onChange={(event) => {
                setManifestText(event.target.value)
                setPlan(null)
                setPlannedText(null)
              }}
              placeholder='{ "schemaVersion": 1, "changeId": "..." }'
            />
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              disabled={!manifestText.trim() || preview.isPending}
              onClick={() => preview.mutate(manifestText)}
            >
              {t('Preview database changes')}
            </Button>
            <Button
              disabled={
                !planIsCurrent ||
                plan.action !== 'CREATE_DRAFT' ||
                draft.isPending
              }
              onClick={() => draft.mutate()}
            >
              {t('Create reviewed draft')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader>
            <CardTitle>{t('Database change preview')}</CardTitle>
            <CardDescription>
              {plan.changeId} · SHA-256 {plan.manifestSha256} · {plan.target}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='text-muted-foreground text-sm'>
              {t('Publication order')}: {plan.publicationOrder.join(' → ')}
            </div>
            <DataTable
              empty={t('No database changes')}
              headers={[
                t('Resource'),
                t('Key'),
                t('Action'),
                t('Current'),
                t('Proposed'),
              ]}
              rows={plan.changes.map((change) => [
                <BusinessTerm
                  key='resource'
                  kind='releaseResource'
                  value={change.resourceType}
                />,
                change.key,
                <BusinessTerm
                  key='action'
                  kind='releaseAction'
                  value={change.action}
                />,
                <JsonSnapshot key='current' value={change.current} />,
                <JsonSnapshot key='proposed' value={change.proposed} />,
              ])}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('Controlled release queue')}</CardTitle>
          <CardDescription>
            {t('Approval and publication are separate audited transitions.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            empty={t('No model releases')}
            headers={[
              t('Change ID'),
              t('Review source'),
              t('Target'),
              t('Status'),
              t('Created'),
              t('Action'),
            ]}
            rows={releases.data.map((release) => [
              release.changeId,
              release.sourceRef,
              <BusinessTerm
                key='target'
                kind='releaseTarget'
                value={release.target}
              />,
              <BusinessTerm
                key='status'
                kind='configStatus'
                value={release.status}
              />,
              formatDate(release.createdAt),
              release.status === 'PUBLISHED' ? (
                '—'
              ) : (
                <div key='actions' className='flex gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={preview.isPending}
                    onClick={() => {
                      const text = JSON.stringify(release.manifest, null, 2)
                      setManifestText(text)
                      setPlan(null)
                      setPlannedText(null)
                      preview.mutate(text)
                    }}
                  >
                    {t('Preview')}
                  </Button>
                  {release.status === 'DRAFT' ? (
                    <Button
                      size='sm'
                      disabled={
                        approve.isPending ||
                        !planIsCurrent ||
                        plan.manifestSha256 !== release.manifestSha256
                      }
                      onClick={() => approve.mutate(release.manifest)}
                    >
                      {t('Approve')}
                    </Button>
                  ) : (
                    <Button
                      size='sm'
                      disabled={
                        publishRelease.isPending ||
                        !planIsCurrent ||
                        plan.manifestSha256 !== release.manifestSha256
                      }
                      onClick={() => publishRelease.mutate(release.manifest)}
                    >
                      {t('Publish in dependency order')}
                    </Button>
                  )}
                </div>
              ),
            ])}
          />
        </CardContent>
      </Card>
    </div>
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
  const purchaseLink = useQuery({
    queryKey: ['canvas-cloud', 'recharge-purchase-link'],
    queryFn: getCanvasRechargePurchaseLink,
    enabled: props.section === 'recharge',
    retry: false,
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
        <RechargeCodeCard
          code={code}
          purchaseUrl={purchaseLink.data ?? null}
          redeeming={redeem.isPending}
          onCodeChange={setCode}
          onRedeem={() => redeem.mutate(code.trim())}
        />
        <DataTable
          empty={t('No recharge orders')}
          headers={[t('Order'), t('Status'), t('Amount'), t('Created')]}
          rows={data.rechargeOrders.map((item) => [
            item.orderNumber,
            <BusinessTerm
              key='s'
              kind='rechargeOrderStatus'
              value={item.status}
            />,
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
          <BusinessTerm key='type' kind='pointLotType' value={item.type} />,
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
      <AdminPricing
        prices={data.prices}
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
            <BusinessTerm key='s' kind='configStatus' value={item.status} />,
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
            <BusinessTerm
              key='execution'
              kind='taskExecutionStatus'
              value={item.executionStatus}
            />,
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
            <BusinessTerm key='s' kind='refundStatus' value={item.status} />,
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
          {t(report.data.disclaimer)}
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
  let content: ReactNode
  if (!admin) {
    content = <CustomerContent section={section as CustomerSection} />
  } else if (section === 'model-releases') {
    content = <AdminModelReleases />
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
        <div className='space-y-4'>
          {section !== 'pricing-calculator' && (
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
                {(admin ? adminNavigationSections : allowed).map((item) => (
                  <TabsTrigger key={item} value={item}>
                    {t(sectionTitles[item])}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          {content}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

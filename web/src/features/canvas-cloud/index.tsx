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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, useLocation } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
  isCanvasAdministrator,
  isCanvasSectionAllowed,
  type canvasAdminSections as adminSections,
  type canvasCustomerSections as customerSections,
} from './access'
import {
  getCanvasAdminWorkspace,
  getCanvasCatalog,
  getCanvasContributionReport,
  getCanvasSession,
} from './api'
import { ActivityManagement } from './components/ActivityManagement'
import { AdminAuditLog } from './components/AdminAuditLog'
import { AdminModelCatalog } from './components/AdminModelCatalog'
import { AdminPointAdjustments } from './components/AdminPointAdjustments'
import { AdminTaskLogs } from './components/AdminTaskLogs'
import { AgentCenter } from './components/AgentCenter'
import { CustomerModelCenter } from './components/CustomerModelCenter'
import {
  CustomerPointsCenter,
  type CustomerPointsView,
} from './components/CustomerPointsCenter'
import { CustomerTasks } from './components/CustomerTasks'
import { InviteActivation } from './components/InviteActivation'
import { PricingCalculator } from './components/PricingCalculator'
import { PricingPointRules } from './components/PricingPointRules'
import type { CanvasProviderNavigationTarget } from './components/RuntimeConfiguration'
import {
  RuntimeManagement,
  type RuntimeManagementView,
} from './components/RuntimeManagement'
import { customerRedeemOrderSearch } from './customer-points-navigation'
import {
  getModelManagementReturnContext,
  modelManagementReturnStateKey,
} from './model-management-navigation-state'
import { CanvasRechargeCodes } from './RechargeCodes'

const route = getRouteApi('/_authenticated/canvas-cloud/$section')
type CustomerSection = (typeof customerSections)[number]
type AdminSection = (typeof adminSections)[number]
type CanvasSection = CustomerSection | AdminSection | 'agent-center'

const sectionTitles: Record<CanvasSection, string> = {
  dashboard: 'Canvas Dashboard',
  'task-logs': 'Task Records',
  customers: 'Customer management',
  'point-campaigns': 'Activity management',
  agents: 'Invitation management',
  'recharge-codes': 'Recharge codes',
  'invite-codes': 'Invitation management',
  invitations: 'Invitation management',
  catalog: 'Model management',
  points: 'Point center',
  models: 'Model center',
  tasks: 'My Tasks',
  pricing: 'Model management',
  'pricing-point-rules': 'Pricing and point rules',
  'pricing-calculator': 'Canvas Pricing Calculator',
  runtime: 'Runtime management',
  execution: 'Runtime management',
  'provider-configuration': 'Provider configuration',
  audit: 'Canvas Audit Log',
  'agent-center': 'My customers',
}

const invalidCanvasCloudRuntimeView = '__invalid_canvas_cloud_runtime_view__'

function sumPoints(values: string[]): string {
  return values.reduce((total, value) => total + BigInt(value), 0n).toString()
}

function formatCnyMinor(value: string): string {
  const minor = BigInt(value)
  const absolute = minor < 0n ? -minor : minor
  const grouped = (absolute / 100n)
    .toString()
    .replaceAll(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${minor < 0n ? '-' : ''}¥${grouped}.${(absolute % 100n).toString().padStart(2, '0')}`
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

function CustomerContent(props: {
  section: CustomerSection
  pointsView: CustomerPointsView
  onPointsViewChange: (view: CustomerPointsView) => void
  initialOrderNumber?: string
  onPointsOrderNumberChange: (orderNumber?: string) => void
  onRedeemOrderNavigate: (orderNumber: string) => void
}) {
  const catalog = useQuery({
    queryKey: ['canvas-cloud', 'catalog'],
    queryFn: getCanvasCatalog,
    enabled: props.section === 'models',
  })
  if (props.section === 'points') {
    return (
      <CustomerPointsCenter
        view={props.pointsView}
        onViewChange={props.onPointsViewChange}
        initialOrderNumber={props.initialOrderNumber}
        onOrderNumberChange={props.onPointsOrderNumberChange}
        onRedeemOrderNavigate={props.onRedeemOrderNavigate}
      />
    )
  }
  if (props.section === 'models') {
    if (catalog.isPending) return <LoadingState />
    if (catalog.isError) {
      return <ErrorState onRetry={() => void catalog.refetch()} />
    }
    return <CustomerModelCenter models={catalog.data} />
  }
  if (props.section === 'tasks') return <CustomerTasks />
  return null
}

export function AdminContent(props: {
  section: AdminSection
  providerTarget: CanvasProviderNavigationTarget
  initialPricingModelId?: string
  initialPricingPublicationId?: string
  initialCustomerId?: string
  initialOrderId?: string
  initialPointLotId?: string
  onCustomerChange?: (customerId?: string) => void
  onReturnToModelList?: () => void
  runtimeView?: RuntimeManagementView
  onRuntimeViewChange?: (view: RuntimeManagementView) => void
}) {
  const { t } = useTranslation()
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'admin'],
    queryFn: getCanvasAdminWorkspace,
    enabled: ![
      'customers',
      'audit',
      'task-logs',
      'runtime',
      'execution',
      'provider-configuration',
      'pricing-point-rules',
      'catalog',
      'pricing',
      'point-campaigns',
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
        customerId={props.initialCustomerId}
        onCustomerChange={props.onCustomerChange}
        orderId={props.initialOrderId}
        pointLotId={props.initialPointLotId}
      />
    )
  }
  if (props.section === 'audit') return <AdminAuditLog />
  if (props.section === 'task-logs') return <AdminTaskLogs />
  if (props.section === 'runtime') {
    return (
      <RuntimeManagement
        initialView={props.runtimeView ?? 'execution'}
        onViewChange={props.onRuntimeViewChange}
      />
    )
  }
  if (props.section === 'execution') {
    return <RuntimeManagement initialView='execution' />
  }
  if (props.section === 'provider-configuration') {
    return (
      <RuntimeManagement
        initialView='provider'
        providerTarget={props.providerTarget}
        onReturnToModelList={props.onReturnToModelList}
      />
    )
  }
  if (props.section === 'pricing-point-rules') return <PricingPointRules />
  if (props.section === 'catalog' || props.section === 'pricing') {
    return (
      <AdminModelCatalog
        initialPricingModelId={props.initialPricingModelId}
        initialPricingPublicationId={props.initialPricingPublicationId}
      />
    )
  }
  if (props.section === 'point-campaigns') return <ActivityManagement />
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
        .map((task) => task.settledPoints ?? task.quotedPoints)
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
  if (props.section === 'recharge-codes') {
    return <CanvasRechargeCodes embedded />
  }
  if (props.section === 'pricing-calculator') {
    return <PricingCalculator />
  }
  return null
}

export function CanvasCloud() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const params = route.useParams()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const locationState = useLocation({ select: (location) => location.state })
  const modelManagementReturn = getModelManagementReturnContext(locationState)
  const session = useQuery({
    queryKey: ['canvas-cloud', 'session'],
    queryFn: getCanvasSession,
    retry: false,
  })
  if (session.isPending) {
    return (
      <SectionPageLayout fluid={false}>
        <SectionPageLayout.Title>{t('Canvas Cloud')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <LoadingState />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    )
  }
  if (session.isError) {
    return (
      <SectionPageLayout fluid={false}>
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
      <SectionPageLayout fluid={false}>
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
  if (
    params.section === 'runtime' &&
    search.view === invalidCanvasCloudRuntimeView
  ) {
    return (
      <SectionPageLayout fluid={false}>
        <SectionPageLayout.Title>
          {t('Runtime management')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <ErrorState
            title={t('Invalid runtime view')}
            description={t(
              'Choose execution, provider configuration, or storage and backups.'
            )}
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
    const pointsView =
      search.view === 'lots' || search.view === 'ledger'
        ? search.view
        : 'redeem'
    content = (
      <CustomerContent
        section={section as CustomerSection}
        pointsView={pointsView}
        onPointsViewChange={(view) =>
          void navigate({
            to: '/canvas-cloud/$section',
            params: { section: 'points' },
            search: { view },
          })
        }
        initialOrderNumber={search.orderNumber}
        onPointsOrderNumberChange={(orderNumber) =>
          void navigate({
            to: '/canvas-cloud/$section',
            params: { section: 'points' },
            search: (previous) => ({
              ...previous,
              view: 'redeem',
              orderNumber,
            }),
          })
        }
        onRedeemOrderNavigate={(orderNumber) =>
          void navigate({
            to: '/canvas-cloud/$section',
            params: { section: 'points' },
            search: (previous) =>
              customerRedeemOrderSearch(previous, orderNumber),
          })
        }
      />
    )
  } else if (isCanvasAdministrator(session.data.principalType)) {
    content = (
      <AdminContent
        section={section as AdminSection}
        providerTarget={search}
        initialPricingModelId={search.modelId}
        initialPricingPublicationId={search.publicationId}
        initialCustomerId={search.customerId}
        initialOrderId={search.orderId}
        initialPointLotId={search.pointLotId}
        onCustomerChange={(customerId) =>
          void navigate({
            to: '/canvas-cloud/$section',
            params: { section: 'customers' },
            search: (previous) => ({
              ...previous,
              customerId,
              orderId: undefined,
              pointLotId: undefined,
              orderNumber: undefined,
            }),
            replace: true,
          })
        }
        onReturnToModelList={
          modelManagementReturn
            ? () =>
                void navigate({
                  to: '/canvas-cloud/model-management',
                  search: {},
                  state: (previous) => ({
                    ...previous,
                    [modelManagementReturnStateKey]: modelManagementReturn,
                  }),
                })
            : undefined
        }
        runtimeView={
          search.view === 'execution' ||
          search.view === 'provider' ||
          search.view === 'storage'
            ? search.view
            : undefined
        }
        onRuntimeViewChange={(view) =>
          void navigate({
            to: '/canvas-cloud/$section',
            params: { section: 'runtime' },
            search: { view },
          })
        }
      />
    )
  } else content = <AgentCenter />
  const refreshCurrentSection = async () => {
    if (session.data.principalType === 'CUSTOMER') {
      let queryKey: readonly unknown[] = ['canvas-cloud', 'catalog']
      if (section === 'tasks') {
        queryKey = ['canvas-cloud', 'customer', 'tasks']
      } else if (section === 'points') {
        await queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'customer', 'point-summary'],
        })
        const view =
          search.view === 'lots' || search.view === 'ledger'
            ? `point-${search.view}`
            : 'recharge-redemptions'
        queryKey = ['canvas-cloud', 'customer', view]
      }
      await queryClient.invalidateQueries({ queryKey })
      toast.success(t('Canvas data refreshed'))
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['canvas-cloud'] })
    toast.success(t('Canvas data refreshed'))
  }
  return (
    <SectionPageLayout fluid={false}>
      <SectionPageLayout.Title>
        {t(
          section === 'customers' && search.customerId
            ? 'Customer details'
            : sectionTitles[section]
        )}
      </SectionPageLayout.Title>
      {section !== 'pricing-calculator' &&
        !(
          session.data.principalType === 'CUSTOMER' &&
          (section === 'points' || section === 'tasks')
        ) && (
          <SectionPageLayout.Actions>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void refreshCurrentSection()}
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

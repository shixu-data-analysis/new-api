/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, HeaderContext } from '@tanstack/react-table'
import {
  createContext,
  useEffect,
  useContext,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { DateTimePicker } from '@/components/datetime-picker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent as BaseSelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import {
  createCanvasBonusActivity,
  createCanvasManualBonusMemberSelection,
  createCanvasLimitedPriceActivity,
  createCanvasManualBonusActivity,
  cancelCanvasManualBonusActivity,
  getCanvasActivity,
  getCanvasActivities,
  getCanvasEligibleActivityCustomers,
  getCanvasCurrentManualGrantEligibilityBasis,
  getCanvasInviteBonusGrants,
  getCanvasLimitedPriceParticipationTasks,
  getCanvasManualGrantEligibilityBasis,
  getCanvasManualGrantMembers,
  getCanvasRechargeBonusBindings,
  retryCanvasManualGrantFailures,
  resolveCanvasEligibleActivityCustomers,
  stopCanvasBonusActivity,
  updateCanvasManualBonusActivity,
} from '../activity-api'
import type {
  CanvasActivity,
  CanvasActivityDetail,
  CanvasActivityEligibleCustomer,
  CanvasActivityStatus,
  CanvasActivityType,
  CanvasBonusActivity,
  CanvasEligibilityBasis,
  CanvasManualGrantMember,
  CanvasManualGrantPlan,
  CanvasManualGrantScope,
  CanvasManualGrantUpdateScope,
  CanvasInviteBonusGrantRecord,
  CanvasLimitedPriceParticipationTaskRecord,
  CanvasRechargeBonusBindingRecord,
  CanvasTokenCategoryCostReference,
} from '../activity-types'
import {
  cancelCanvasLimitedPricePromotion,
  getCanvasModelPricingModel,
  getCanvasModelPricingWorkspace,
} from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import { pricingScopeLabel } from '../pricing-scope-label'
import type {
  CanvasModelPricingPriceSnapshot,
  CanvasTokenCategoryRisk,
} from '../types'
import {
  type CanvasServerTableState,
  useServerTableState,
} from '../use-server-table-state'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CustomerRecordDetails } from './CustomerRecordDetails'
import { TaskRecordDetailsSheet } from './TaskRecordDetailsSheet'

type CreateType =
  | 'MANUAL_BONUS'
  | 'RECHARGE_BONUS'
  | 'INVITE_BONUS'
  | 'TASK_PRICE_SPECIAL'
type View =
  | { kind: 'list' }
  | { kind: 'create'; type: CreateType }
  | {
      kind: 'detail'
      activityId: string
      initialDetail?: CanvasActivityDetail
    }
  | { kind: 'edit'; plan: CanvasManualGrantPlan }

type ActivityReturnContext = {
  search: string
  pageIndex: number
  pageSize: number
  sortId: string
  sortDesc: boolean
  type: CanvasActivityType | ''
  status: CanvasActivityStatus | ''
  createdFrom?: string
  createdTo?: string
  view: View
  scrollY: number
  focusId: string
  recordState?: unknown
}

type ActivityRecordNavigation = {
  capture: (focusId: string) => void
  restoreFocusId?: string
  restoreScrollY?: number
  recordState?: unknown
  updateRecordState: (state: unknown) => void
}

const ActivityRecordNavigationContext =
  createContext<ActivityRecordNavigation | null>(null)

function SelectContent(props: { children: ReactNode }) {
  return (
    <BaseSelectContent
      align='start'
      alignItemWithTrigger={false}
      className='w-max max-w-[calc(100vw-2rem)] min-w-(--anchor-width) **:data-[slot=select-item-text]:min-w-0 **:data-[slot=select-item-text]:break-words **:data-[slot=select-item-text]:whitespace-normal'
    >
      {props.children}
    </BaseSelectContent>
  )
}

function readActivityReturnContext(): ActivityReturnContext | undefined {
  const value = (window.history.state as Record<string, unknown> | null)
    ?.canvasActivityReturn
  if (!value || typeof value !== 'object') return undefined
  const context = value as Partial<ActivityReturnContext>
  if (
    typeof context.search !== 'string' ||
    typeof context.pageIndex !== 'number' ||
    typeof context.pageSize !== 'number' ||
    typeof context.sortId !== 'string' ||
    typeof context.sortDesc !== 'boolean' ||
    !context.view ||
    typeof context.view !== 'object' ||
    typeof context.scrollY !== 'number' ||
    typeof context.focusId !== 'string'
  ) {
    return undefined
  }
  return context as ActivityReturnContext
}

function activityCustomerHref(customerId: string, pointLotId?: string): string {
  const query = new URLSearchParams({ customerId })
  if (pointLotId) query.set('pointLotId', pointLotId)
  return `/canvas-cloud/customers?${query.toString()}`
}

function activityOrderHref(customerId: string, orderId: string): string {
  return `/canvas-cloud/customers?${new URLSearchParams({
    customerId,
    orderId,
  }).toString()}`
}

function activityDetailHref(activityId: string): string {
  return `/canvas-cloud/point-campaigns?${new URLSearchParams({
    activityId,
  }).toString()}`
}

function activityRecordState<T extends object>(
  value: unknown,
  kind: string
): T | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    value.kind !== kind
  ) {
    return undefined
  }
  return value as T
}

function ActivityRecordLink(props: {
  href: string
  focusId: string
  children: ReactNode
  className?: string
}) {
  const navigation = useContext(ActivityRecordNavigationContext)
  const ref = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (navigation?.restoreFocusId !== props.focusId) return
    window.scrollTo({ top: navigation.restoreScrollY ?? 0 })
    ref.current?.focus()
  }, [navigation?.restoreFocusId, navigation?.restoreScrollY, props.focusId])
  return (
    <a
      ref={ref}
      href={props.href}
      className={props.className ?? 'text-primary hover:underline'}
      onClick={() => navigation?.capture(props.focusId)}
    >
      {props.children}
    </a>
  )
}

const activityTypes: CanvasActivityType[] = [
  'MANUAL_BONUS',
  'RECHARGE_BONUS',
  'INVITE_BONUS',
  'TASK_PRICE_SPECIAL',
]
const allStatuses: CanvasActivityStatus[] = [
  'WAITING',
  'RUNNING',
  'COMPLETED',
  'PARTIAL_FAILED',
  'FAILED',
  'CANCELLED',
  'NOT_STARTED',
  'ACTIVE',
  'ENDED',
  'STOPPED',
]

const statusesByType: Record<CanvasActivityType, CanvasActivityStatus[]> = {
  MANUAL_BONUS: [
    'WAITING',
    'RUNNING',
    'COMPLETED',
    'PARTIAL_FAILED',
    'FAILED',
    'CANCELLED',
  ],
  RECHARGE_BONUS: ['ACTIVE', 'STOPPED'],
  INVITE_BONUS: ['ACTIVE', 'STOPPED'],
  TASK_PRICE_SPECIAL: ['NOT_STARTED', 'ACTIVE', 'ENDED', 'STOPPED'],
}
const EMPTY_CUSTOMER_IDS: string[] = []

function activityStatusKey(value: CanvasActivityStatus): string {
  return `Activity status ${value}`
}

function redemptionStatusKey(value: string): string {
  return `Redemption status ${value}`
}

function executionStatusKey(value: string): string {
  return `Execution status ${value}`
}

function settlementProgressKey(value: string): string {
  return `Settlement progress ${value}`
}

function activityToListItem(
  activity: CanvasManualGrantPlan | CanvasBonusActivity
): CanvasActivity {
  if ('activityId' in activity) {
    return {
      id: activity.activityId,
      promotionId: activity.activityId,
      version: activity.version,
      name: activity.name,
      type: activity.type,
      status: activity.status,
      createdAt: activity.createdAt,
      startsAt:
        activity.schedule.mode === 'SCHEDULED'
          ? activity.schedule.scheduledAt
          : null,
      endsAt: null,
    }
  }
  if ('ttlDays' in activity) {
    return {
      id: activity.id,
      promotionId: activity.promotionId,
      version: activity.version,
      name: activity.name,
      type: activity.type,
      status: activity.status,
      createdAt: activity.createdAt,
      startsAt: null,
      endsAt: null,
    }
  }
  throw new Error('Unsupported activity detail')
}

export function ActivityManagement() {
  const { t } = useTranslation()
  const [returnContext] = useState(readActivityReturnContext)
  const [requestedActivityId] = useState(
    () => new URLSearchParams(window.location.search).get('activityId') ?? ''
  )
  const table = useServerTableState<'createdAt'>(
    'createdAt',
    returnContext?.search ?? ''
  )
  const [view, setView] = useState<View>(
    returnContext?.view ??
      (requestedActivityId
        ? { kind: 'detail', activityId: requestedActivityId }
        : { kind: 'list' })
  )
  const [type, setType] = useState<CanvasActivityType | ''>(
    returnContext?.type ?? ''
  )
  const [status, setStatus] = useState<CanvasActivityStatus | ''>(
    returnContext?.status ?? ''
  )
  const [createdFrom, setCreatedFrom] = useState<Date | undefined>(
    returnContext?.createdFrom ? new Date(returnContext.createdFrom) : undefined
  )
  const [createdTo, setCreatedTo] = useState<Date | undefined>(
    returnContext?.createdTo ? new Date(returnContext.createdTo) : undefined
  )
  const resetPage = () =>
    table.setPagination((current) => ({ ...current, pageIndex: 0 }))
  const restoredTable = useRef(false)
  const listReturn = useRef<{ scrollY: number; focusId: string } | undefined>(
    undefined
  )
  const listFocusElements = useRef<Record<string, HTMLElement | null>>({})
  const recordReturnState = useRef<unknown>(returnContext?.recordState)
  const rememberListPosition = (focusId: string) => {
    listReturn.current = {
      scrollY: window.scrollY,
      focusId,
    }
  }
  const returnToList = () => {
    setView({ kind: 'list' })
  }
  useEffect(() => {
    if (view.kind !== 'list' || !listReturn.current) return
    const listState = listReturn.current
    requestAnimationFrame(() => {
      window.scrollTo({ top: listState.scrollY })
      listFocusElements.current[listState.focusId]?.focus()
    })
  }, [view])
  useEffect(() => {
    if (!returnContext || restoredTable.current) return
    restoredTable.current = true
    table.setPagination({
      pageIndex: returnContext.pageIndex,
      pageSize: returnContext.pageSize,
    })
    table.setSorting([
      { id: returnContext.sortId, desc: returnContext.sortDesc },
    ])
  }, [returnContext, table])
  const captureRecordNavigation = (focusId: string) => {
    const context: ActivityReturnContext = {
      search: table.search,
      pageIndex: table.pagination.pageIndex,
      pageSize: table.pagination.pageSize,
      sortId: table.sorting[0]?.id ?? 'createdAt',
      sortDesc: table.sorting[0]?.desc ?? true,
      type,
      status,
      ...(createdFrom ? { createdFrom: createdFrom.toISOString() } : {}),
      ...(createdTo ? { createdTo: createdTo.toISOString() } : {}),
      view,
      scrollY: window.scrollY,
      focusId,
      recordState: recordReturnState.current,
    }
    window.history.replaceState(
      { ...window.history.state, canvasActivityReturn: context },
      ''
    )
  }
  const activities = useQuery({
    queryKey: [
      'canvas-cloud',
      'activities',
      table.query.page,
      table.query.pageSize,
      table.query.search,
      table.query.sortBy,
      table.query.sortOrder,
      type,
      status,
      createdFrom?.toISOString(),
      createdTo?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasActivities(
        {
          page: table.query.page,
          pageSize: table.query.pageSize,
          sortBy: table.query.sortBy,
          sortOrder: table.query.sortOrder,
          ...(table.query.search ? { name: table.query.search } : {}),
          ...(type ? { type } : {}),
          ...(status ? { status } : {}),
          ...(createdFrom ? { createdFrom: createdFrom.toISOString() } : {}),
          ...(createdTo ? { createdTo: createdTo.toISOString() } : {}),
        },
        signal
      ),
    enabled: isCanvasDateRangeValid(createdFrom, createdTo),
    placeholderData: (previous) => previous,
  })
  const columns = useMemo<ColumnDef<CanvasActivity, unknown>[]>(
    () => [
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        meta: { label: t('Created') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Created')} />
        ),
        cell: ({ row }) => formatCanvasDateTime(row.original.createdAt),
      },
      {
        id: 'name',
        accessorKey: 'name',
        meta: { label: t('Activity name') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Activity name')} />
        ),
        cell: ({ row }) => (
          <button
            className='text-primary text-left hover:underline'
            type='button'
            ref={(element) => {
              listFocusElements.current[`activity-${row.original.id}`] = element
            }}
            onClick={() => {
              rememberListPosition(`activity-${row.original.id}`)
              setView({ kind: 'detail', activityId: row.original.id })
            }}
          >
            {row.original.name}
          </button>
        ),
      },
      {
        id: 'type',
        accessorKey: 'type',
        meta: { label: t('Activity type') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Activity type')} />
        ),
        cell: ({ row }) => t(row.original.type),
      },
      {
        id: 'status',
        accessorKey: 'status',
        meta: { label: t('Status') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        cell: ({ row }) => t(activityStatusKey(row.original.status)),
      },
    ],
    [t]
  )

  if (view.kind === 'create') {
    return (
      <ActivityForm
        type={view.type}
        onBack={returnToList}
        onSaved={(activity) =>
          setView({
            kind: 'detail',
            activityId: activityToListItem(activity).id,
            initialDetail: activity,
          })
        }
        onSpecialSaved={async (activityId) => {
          const detail = await getCanvasActivity(activityId)
          setView({ kind: 'detail', activityId, initialDetail: detail })
        }}
      />
    )
  }
  if (view.kind === 'detail') {
    return (
      <ActivityRecordNavigationContext.Provider
        value={{
          capture: captureRecordNavigation,
          restoreFocusId: returnContext?.focusId,
          restoreScrollY: returnContext?.scrollY,
          recordState: returnContext?.recordState,
          updateRecordState: (recordState) => {
            recordReturnState.current = recordState
          },
        }}
      >
        <ActivityDetail
          activityId={view.activityId}
          initialDetail={view.initialDetail}
          onBack={returnToList}
          onEdit={(plan) => setView({ kind: 'edit', plan })}
        />
      </ActivityRecordNavigationContext.Provider>
    )
  }
  if (view.kind === 'edit') {
    return (
      <ActivityForm
        type='MANUAL_BONUS'
        initialPlan={view.plan}
        onBack={() =>
          setView({
            kind: 'detail',
            activityId: view.plan.activityId,
            initialDetail: view.plan,
          })
        }
        onSaved={(activity) =>
          setView({
            kind: 'detail',
            activityId: activityToListItem(activity).id,
            initialDetail: activity,
          })
        }
      />
    )
  }
  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Select
          onValueChange={(value) => {
            rememberListPosition('create-activity')
            setView({ kind: 'create', type: value as CreateType })
          }}
        >
          <SelectTrigger
            aria-label={t('Create activity')}
            icon='chevron-down'
            ref={(element) => {
              listFocusElements.current['create-activity'] = element
            }}
          >
            {t('Create activity')}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='MANUAL_BONUS'>{t('MANUAL_BONUS')}</SelectItem>
            <SelectItem value='RECHARGE_BONUS'>
              {t('RECHARGE_BONUS')}
            </SelectItem>
            <SelectItem value='INVITE_BONUS'>{t('INVITE_BONUS')}</SelectItem>
            <SelectItem value='TASK_PRICE_SPECIAL'>
              {t('TASK_PRICE_SPECIAL')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <CanvasServerTable
        data={activities.data?.items ?? []}
        columns={columns}
        total={activities.data?.total ?? 0}
        state={table}
        searchLabel={t('Activity name')}
        loading={activities.isPending || activities.isFetching}
        error={activities.isError}
        onRetry={() => void activities.refetch()}
        emptyTitle={t('No activities')}
        filteredEmptyTitle={t('No activities match the current filters')}
        getRowId={(item) => item.id}
        additionalFilters={
          <>
            <DataTableColumnFilterField label={t('Activity type')}>
              <Select
                value={type || 'ALL'}
                onValueChange={(value) => {
                  setType(value === 'ALL' ? '' : (value as CanvasActivityType))
                  setStatus('')
                  resetPage()
                }}
              >
                <SelectTrigger
                  className='w-full min-w-0'
                  aria-label={t('Activity type')}
                >
                  <CanvasLocalizedSelectValue
                    value={type}
                    emptyLabelKey='All activity types'
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All activity types')}</SelectItem>
                  {activityTypes.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DataTableColumnFilterField>
            <DataTableColumnFilterField label={t('Activity status')}>
              <Select
                value={status || 'ALL'}
                onValueChange={(value) => {
                  setStatus(
                    value === 'ALL' ? '' : (value as CanvasActivityStatus)
                  )
                  resetPage()
                }}
              >
                <SelectTrigger
                  className='w-full min-w-0'
                  aria-label={t('Activity status')}
                >
                  <CanvasLocalizedSelectValue
                    value={status}
                    emptyLabelKey='All activity statuses'
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>
                    {t('All activity statuses')}
                  </SelectItem>
                  {(type ? statusesByType[type] : allStatuses).map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(activityStatusKey(value))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DataTableColumnFilterField>
            <DataTableColumnFilterField
              label={t('Created')}
              className='sm:col-span-2'
            >
              <CanvasDateRangeFilter
                from={createdFrom}
                to={createdTo}
                onFromChange={(value) => {
                  setCreatedFrom(value)
                  resetPage()
                }}
                onToChange={(value) => {
                  setCreatedTo(value)
                  resetPage()
                }}
              />
            </DataTableColumnFilterField>
          </>
        }
        hasActiveFilters={Boolean(type || status || createdFrom || createdTo)}
        activeFilterCount={
          [table.search, type, status, createdFrom, createdTo].filter(Boolean)
            .length
        }
        onResetFilters={() => {
          setType('')
          setStatus('')
          setCreatedFrom(undefined)
          setCreatedTo(undefined)
          resetPage()
        }}
      />
    </div>
  )
}

const baseSchema = z.object({
  name: z.string().trim().min(1).max(128),
  points: z.string().regex(/^[1-9]\d{0,18}$/u),
  ttlDays: z.coerce.number().int().min(1).max(3650),
  reason: z.string().trim().min(1).max(255),
})
const manualSchema = baseSchema
  .extend({
    scope: z.enum(['SELECTED', 'RECHARGE_THRESHOLD']),
    schedule: z.enum(['IMMEDIATE', 'SCHEDULED']),
    scheduledAt: z.string(),
    minimumRechargeRmb: z.string(),
    redeemedFrom: z.string(),
    redeemedTo: z.string(),
    customerIds: z.array(z.string()),
    selectionToken: z.string(),
    selectedCustomerCount: z.number().int().nonnegative(),
    editingExistingMembers: z.boolean(),
    addedCustomerIds: z.array(z.string()),
    removedCustomerIds: z.array(z.string()),
    clearBaseline: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      value.schedule === 'SCHEDULED' &&
      new Date(value.scheduledAt) <= new Date()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['scheduledAt'],
        message: 'Scheduled time must be in the future',
      })
    }
    if (
      value.scope === 'RECHARGE_THRESHOLD' &&
      !value.editingExistingMembers &&
      value.customerIds.length === 0 &&
      !value.selectionToken
    ) {
      context.addIssue({
        code: 'custom',
        path: ['customerIds'],
        message: 'Select at least one eligible customer',
      })
    }
    if (
      value.scope === 'SELECTED' &&
      !value.editingExistingMembers &&
      value.customerIds.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['customerIds'],
        message: 'Select at least one eligible customer',
      })
    }
    if (
      value.scope === 'RECHARGE_THRESHOLD' &&
      cnyThresholdToMinor(value.minimumRechargeRmb) === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['minimumRechargeRmb'],
        message: 'Enter a valid recharge amount',
      })
    }
    if (
      value.scope === 'RECHARGE_THRESHOLD' &&
      value.redeemedFrom &&
      value.redeemedTo &&
      new Date(value.redeemedFrom) > new Date(value.redeemedTo)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['redeemedTo'],
        message: 'End time must not be earlier than start time',
      })
    }
  })
type BaseValues = z.infer<typeof baseSchema>
type ManualValues = z.infer<typeof manualSchema>

type ActivityConflict = {
  reason?: string
  affectedCustomerTotal: number
  affectedCustomers: Array<{
    customerId?: string
    customer?: string
    reason?: string
  }>
}

function activityConflictFromError(
  error: unknown
): ActivityConflict | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined
  }
  const response = error.response as {
    status?: unknown
    data?: {
      reason?: unknown
      message?: unknown
      affectedCustomers?: unknown
      affectedCustomerTotal?: unknown
    }
  }
  if (
    response.status !== 409 ||
    !Array.isArray(response.data?.affectedCustomers)
  ) {
    return undefined
  }
  const affectedCustomers = response.data.affectedCustomers.filter(
    (customer): customer is ActivityConflict['affectedCustomers'][number] =>
      typeof customer === 'object' && customer !== null
  )
  const affectedCustomerTotal =
    typeof response.data.affectedCustomerTotal === 'number' &&
    Number.isSafeInteger(response.data.affectedCustomerTotal) &&
    response.data.affectedCustomerTotal >= affectedCustomers.length
      ? response.data.affectedCustomerTotal
      : affectedCustomers.length
  let reason: string | undefined
  if (typeof response.data.message === 'string') {
    reason = response.data.message
  } else if (typeof response.data.reason === 'string') {
    reason = response.data.reason
  }
  return {
    ...(reason ? { reason } : {}),
    affectedCustomerTotal,
    affectedCustomers,
  }
}

type LimitedPriceConflict = {
  id: string
  name: string
  startsAt: string
  endsAt: string
}

function limitedPriceConflictFromError(
  error: unknown
): LimitedPriceConflict | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined
  }
  const response = error.response as {
    status?: unknown
    data?: { conflictActivity?: unknown }
  }
  const conflictActivity = response.data?.conflictActivity
  if (
    response.status !== 409 ||
    typeof conflictActivity !== 'object' ||
    conflictActivity === null
  ) {
    return undefined
  }
  const activity = conflictActivity as Record<string, unknown>
  if (
    typeof activity.id !== 'string' ||
    typeof activity.name !== 'string' ||
    typeof activity.startsAt !== 'string' ||
    typeof activity.endsAt !== 'string'
  ) {
    return undefined
  }
  return {
    id: activity.id,
    name: activity.name,
    startsAt: activity.startsAt,
    endsAt: activity.endsAt,
  }
}

function ActivityForm(props: {
  type: CreateType
  initialPlan?: CanvasManualGrantPlan
  onBack: () => void
  onSaved: (activity: CanvasManualGrantPlan | CanvasBonusActivity) => void
  onSpecialSaved?: (activityId: string) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const manual = props.type === 'MANUAL_BONUS'
  const limitedPrice = props.type === 'TASK_PRICE_SPECIAL'
  const form = useForm<ManualValues | BaseValues>({
    resolver: zodResolver(manual ? manualSchema : baseSchema) as never,
    mode: 'onBlur',
    defaultValues: manual
      ? {
          name: props.initialPlan?.name ?? '',
          points: props.initialPlan?.points ?? '',
          ttlDays: props.initialPlan?.ttlDays ?? 30,
          reason: props.initialPlan?.reason ?? '',
          scope: props.initialPlan?.scope.type ?? 'SELECTED',
          schedule: props.initialPlan?.schedule.mode ?? 'IMMEDIATE',
          scheduledAt:
            props.initialPlan?.schedule.mode === 'SCHEDULED'
              ? toDateTimeLocal(props.initialPlan.schedule.scheduledAt)
              : '',
          minimumRechargeRmb:
            props.initialPlan?.scope.type === 'RECHARGE_THRESHOLD'
              ? minorToCny(props.initialPlan.scope.minimumRechargeAmountMinor)
              : '',
          redeemedFrom:
            props.initialPlan?.scope.type === 'RECHARGE_THRESHOLD' &&
            props.initialPlan.scope.redeemedFrom
              ? toDateTimeLocal(props.initialPlan.scope.redeemedFrom)
              : '',
          redeemedTo:
            props.initialPlan?.scope.type === 'RECHARGE_THRESHOLD' &&
            props.initialPlan.scope.redeemedTo
              ? toDateTimeLocal(props.initialPlan.scope.redeemedTo)
              : '',
          customerIds: [],
          selectionToken: '',
          selectedCustomerCount: props.initialPlan?.memberCount ?? 0,
          editingExistingMembers: Boolean(props.initialPlan),
          addedCustomerIds: [],
          removedCustomerIds: [],
          clearBaseline: false,
        }
      : {
          name: '',
          points: '',
          ttlDays: 30,
          reason: '',
          editingExistingMembers: false,
          addedCustomerIds: [],
          removedCustomerIds: [],
          clearBaseline: false,
        },
  })
  const manualValues = useWatch({
    control: form.control,
  }) as Partial<ManualValues>
  const [conflict, setConflict] = useState<ActivityConflict>()
  const baselineSelection = useMutation({
    mutationFn: () =>
      createCanvasManualBonusMemberSelection(
        props.initialPlan?.activityId ?? ''
      ),
  })
  const baselineRequested = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!props.initialPlan) return
    const key = `${props.initialPlan.activityId}:${props.initialPlan.version}`
    if (baselineRequested.current === key) return
    baselineRequested.current = key
    baselineSelection.mutate()
  }, [baselineSelection, props.initialPlan])
  const save = useMutation({
    mutationFn: async (values: ManualValues | BaseValues) => {
      if (!manual) {
        if (limitedPrice) {
          throw new Error('Limited-price form requires published pricing data')
        }
        return createCanvasBonusActivity(
          props.type as 'RECHARGE_BONUS' | 'INVITE_BONUS',
          values
        )
      }
      const manualFormValues = values as ManualValues
      const scope: CanvasManualGrantScope =
        manualFormValues.scope === 'SELECTED'
          ? { type: 'SELECTED', customerIds: manualFormValues.customerIds }
          : {
              type: 'RECHARGE_THRESHOLD',
              minimumRechargeAmountMinor: cnyThresholdToMinor(
                manualFormValues.minimumRechargeRmb
              ) as string,
              currency: 'CNY',
              ...(manualFormValues.selectionToken
                ? { selectionToken: manualFormValues.selectionToken }
                : { customerIds: manualFormValues.customerIds }),
              ...(manualFormValues.redeemedFrom
                ? {
                    redeemedFrom: new Date(
                      manualFormValues.redeemedFrom
                    ).toISOString(),
                  }
                : {}),
              ...(manualFormValues.redeemedTo
                ? {
                    redeemedTo: new Date(
                      manualFormValues.redeemedTo
                    ).toISOString(),
                  }
                : {}),
            }
      if (props.initialPlan) {
        const memberSelection = baselineSelection.data
        if (!memberSelection) throw new Error('Member selection is loading')
        const updateScope: CanvasManualGrantUpdateScope =
          scope.type === 'SELECTED'
            ? {
                type: 'SELECTED',
                selectionToken: memberSelection.selectionToken,
                ...(manualFormValues.addedCustomerIds.length
                  ? { addedCustomerIds: manualFormValues.addedCustomerIds }
                  : {}),
                ...(manualFormValues.removedCustomerIds.length
                  ? { removedCustomerIds: manualFormValues.removedCustomerIds }
                  : {}),
                ...(manualFormValues.clearBaseline
                  ? { clearBaseline: true }
                  : {}),
              }
            : {
                type: 'RECHARGE_THRESHOLD',
                minimumRechargeAmountMinor: scope.minimumRechargeAmountMinor,
                currency: 'CNY',
                selectionToken: memberSelection.selectionToken,
                ...(scope.redeemedFrom
                  ? { redeemedFrom: scope.redeemedFrom }
                  : {}),
                ...(scope.redeemedTo ? { redeemedTo: scope.redeemedTo } : {}),
                ...(manualFormValues.addedCustomerIds.length
                  ? { addedCustomerIds: manualFormValues.addedCustomerIds }
                  : {}),
                ...(manualFormValues.removedCustomerIds.length
                  ? { removedCustomerIds: manualFormValues.removedCustomerIds }
                  : {}),
                ...(manualFormValues.clearBaseline
                  ? { clearBaseline: true }
                  : {}),
              }
        return updateCanvasManualBonusActivity(props.initialPlan.activityId, {
          expectedVersion: props.initialPlan.version,
          points: manualFormValues.points,
          ttlDays: manualFormValues.ttlDays,
          reason: manualFormValues.reason,
          scope: updateScope,
          schedule:
            manualFormValues.schedule === 'SCHEDULED'
              ? {
                  mode: 'SCHEDULED',
                  scheduledAt: new Date(
                    manualFormValues.scheduledAt
                  ).toISOString(),
                }
              : { mode: 'IMMEDIATE' },
        })
      }
      return createCanvasManualBonusActivity({
        name: manualFormValues.name,
        points: manualFormValues.points,
        ttlDays: manualFormValues.ttlDays,
        reason: manualFormValues.reason,
        scope,
        schedule:
          manualFormValues.schedule === 'SCHEDULED'
            ? {
                mode: 'SCHEDULED',
                scheduledAt: new Date(
                  manualFormValues.scheduledAt
                ).toISOString(),
              }
            : { mode: 'IMMEDIATE' },
      })
    },
    onSuccess: (activity) => {
      toast.success(
        t(props.initialPlan ? 'Activity updated' : 'Activity created')
      )
      void queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'activities'],
      })
      props.onSaved(activity)
    },
    onError: (error) => {
      const nextConflict = activityConflictFromError(error)
      setConflict(nextConflict)
      if (!nextConflict) toast.error(t('Unable to create activity'))
    },
  })
  const submit = form.handleSubmit((values) => {
    setConflict(undefined)
    save.mutate(values)
  })
  let submitLabel = props.initialPlan ? 'Confirm update' : 'Confirm publish'
  if (!props.initialPlan && manualValues.schedule === 'SCHEDULED') {
    submitLabel = 'Confirm scheduled grant'
  } else if (!props.initialPlan && manual) {
    submitLabel = 'Confirm grant'
  }
  if (limitedPrice) {
    return (
      <LimitedPriceActivityForm
        onBack={props.onBack}
        onSaved={props.onSpecialSaved ?? props.onBack}
      />
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(props.initialPlan ? 'Edit manual grant' : props.type)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className='grid gap-4 lg:grid-cols-2' onSubmit={submit}>
          <FormInput
            form={form}
            name='name'
            label={t('Activity name')}
            className='lg:col-span-2'
            disabled={Boolean(props.initialPlan)}
          />
          <FormInput
            form={form}
            name='points'
            label={t(manual ? 'Points per customer' : 'Bonus points')}
            inputMode='numeric'
          />
          <FormInput
            form={form}
            name='ttlDays'
            label={t('Bonus validity (days)')}
            type='number'
            min={1}
            max={3650}
          />
          {manual ? (
            <>
              {props.initialPlan ? (
                <p className='text-muted-foreground lg:col-span-2'>
                  {t(
                    'The original plan remains effective until this update is confirmed.'
                  )}
                </p>
              ) : (
                <div>
                  <Label>{t('Grant timing')}</Label>
                  <Select
                    value={manualValues.schedule ?? 'IMMEDIATE'}
                    onValueChange={(value) =>
                      form.setValue(
                        'schedule',
                        value as ManualValues['schedule'],
                        { shouldValidate: true }
                      )
                    }
                  >
                    <SelectTrigger
                      className='w-full min-w-0'
                      aria-label={t('Grant timing')}
                    >
                      <CanvasLocalizedSelectValue
                        value={manualValues.schedule}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='IMMEDIATE'>
                        {t('Immediate grant')}
                      </SelectItem>
                      <SelectItem value='SCHEDULED'>
                        {t('Scheduled grant')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {manualValues.schedule === 'SCHEDULED' ? (
                <FormInput
                  form={form}
                  name='scheduledAt'
                  label={t('Scheduled time')}
                  type='datetime-local'
                />
              ) : null}
              <RecipientSelector
                form={form}
                values={manualValues}
                baselineSelection={baselineSelection.data}
                baselineLoading={baselineSelection.isPending}
              />
            </>
          ) : null}
          <FormInput
            form={form}
            name='reason'
            label={t('Reason')}
            className='lg:col-span-2'
          />
          {props.initialPlan ? (
            <ManualGrantChangeSummary
              plan={props.initialPlan}
              values={manualValues}
            />
          ) : null}
          {conflict ? <ActivityConflictNotice conflict={conflict} /> : null}
          <div className='flex justify-end gap-2 lg:col-span-2'>
            <Button type='button' variant='outline' onClick={props.onBack}>
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={save.isPending}>
              {t(submitLabel)}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function ActivityConflictNotice(props: { conflict: ActivityConflict }) {
  const { t } = useTranslation()
  const displayedCustomers = props.conflict.affectedCustomers.slice(0, 100)
  const hiddenCustomerCount = Math.max(
    0,
    props.conflict.affectedCustomerTotal - displayedCustomers.length
  )
  return (
    <div
      className='border-destructive text-destructive rounded-md border p-3 text-sm lg:col-span-2'
      role='alert'
    >
      <p>
        {props.conflict.reason
          ? t(props.conflict.reason)
          : t('Activity update conflict')}
      </p>
      {displayedCustomers.length ? (
        <>
          <p className='mt-2 font-medium'>{t('Affected customers')}</p>
          <ul className='mt-1 list-disc pl-5'>
            {displayedCustomers.map((customer) => (
              <li
                key={`${customer.customerId ?? customer.customer ?? 'customer'}-${customer.reason ?? ''}`}
              >
                {customer.customer ?? customer.customerId ?? t('Customer')}
                {customer.reason ? ` · ${t(customer.reason)}` : ''}
              </li>
            ))}
          </ul>
          {hiddenCustomerCount ? (
            <p className='mt-2'>
              {t('{{count}} more affected customers are not shown.', {
                count: hiddenCustomerCount,
              })}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function ManualGrantChangeSummary(props: {
  plan: CanvasManualGrantPlan
  values: Partial<ManualValues>
}) {
  const { t } = useTranslation()
  const changes: string[] = []
  if (props.values.points && props.values.points !== props.plan.points) {
    changes.push(
      t('Points per customer: {{before}} → {{after}}', {
        before: props.plan.points,
        after: props.values.points,
      })
    )
  }
  if (props.values.ttlDays && props.values.ttlDays !== props.plan.ttlDays) {
    changes.push(
      t('Bonus validity: {{before}} → {{after}} days', {
        before: props.plan.ttlDays,
        after: props.values.ttlDays,
      })
    )
  }
  if (props.values.reason && props.values.reason !== props.plan.reason) {
    changes.push(t('Reason changed'))
  }
  const previousTime =
    props.plan.schedule.mode === 'SCHEDULED'
      ? toDateTimeLocal(props.plan.schedule.scheduledAt)
      : ''
  if (props.values.scheduledAt && props.values.scheduledAt !== previousTime) {
    changes.push(t('Scheduled time changed'))
  }
  if (!changes.length) return null
  return (
    <div className='rounded-md border p-3 text-sm lg:col-span-2'>
      <p className='font-medium'>{t('This update changes')}</p>
      <ul className='mt-1 list-disc pl-5'>
        {changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
    </div>
  )
}

type PublishedPriceSource = {
  id: string
  label: string
  billingUnit: CanvasModelPricingPriceSnapshot['billingUnit']
  points: string
  tokenRates: CanvasModelPricingPriceSnapshot['tokenRates']
  calculation: CanvasModelPricingPriceSnapshot['calculation']
  tokenCategoryRisks: CanvasTokenCategoryRisk[]
}

type TokenRateKey = 'input' | 'output' | 'cacheRead' | 'cacheWrite'

type TokenCategoryCostReferenceDisplay = Omit<
  CanvasTokenCategoryCostReference,
  'basePoints' | 'specialPoints'
> & {
  basePoints: string | null
  specialPoints: string | null
}

const tokenRateKeys: TokenRateKey[] = [
  'input',
  'output',
  'cacheRead',
  'cacheWrite',
]

function fixedDecimal(value: string): bigint | undefined {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8}))?$/u.exec(value)
  if (!match) return undefined
  return (
    BigInt(match[1]) * 100_000_000n + BigInt((match[2] ?? '').padEnd(8, '0'))
  )
}

function fixedDecimalText(value: bigint): string {
  const sign = value < 0n ? '-' : ''
  const magnitude = value < 0n ? -value : value
  const fraction = (magnitude % 100_000_000n)
    .toString()
    .padStart(8, '0')
    .replace(/0+$/u, '')
  return `${sign}${magnitude / 100_000_000n}${fraction ? `.${fraction}` : ''}`
}

function specialRevenueFromPoints(
  points: string,
  baseRatePointsPerRmb: string
): bigint | undefined {
  if (!/^[1-9]\d*$/u.test(points)) return undefined
  const baseRate = fixedDecimal(baseRatePointsPerRmb)
  if (!baseRate || baseRate <= 0n) return undefined
  return (BigInt(points) * 100_000_000n * 100_000_000n) / baseRate
}

function specialPricePreview(
  revenue: bigint | undefined,
  cost: string | undefined
) {
  const costReference = cost === undefined ? undefined : fixedDecimal(cost)
  if (revenue === undefined || costReference === undefined) return undefined
  const difference = revenue - costReference
  return { revenue, cost: costReference, difference, below: difference < 0n }
}

function tokenSpecialPriceRmb(
  specialPoints: string,
  baseRatePointsPerRmb: string
): bigint | undefined {
  const special = fixedDecimal(specialPoints)
  const baseRate = fixedDecimal(baseRatePointsPerRmb)
  if (special === undefined || baseRate === undefined || baseRate <= 0n) {
    return undefined
  }
  return (special * 100_000_000n) / baseRate
}

function tokenCategoryCostReference(
  category: TokenRateKey,
  risk: CanvasTokenCategoryRisk | undefined,
  baseRatePointsPerRmb: string | undefined,
  specialPoints: string
): TokenCategoryCostReferenceDisplay {
  if (!risk) {
    return {
      category,
      basePoints: null,
      specialPoints: null,
      baseRatePointsPerRmb: null,
      kPricingRmb: null,
      specialPriceRmb: null,
      differenceRmb: null,
      belowCostReference: null,
    }
  }
  const normalizedSpecial = fixedDecimal(specialPoints)
  const normalizedBaseRate =
    baseRatePointsPerRmb === undefined
      ? undefined
      : fixedDecimal(baseRatePointsPerRmb)
  const normalizedCost =
    risk.kPricingRmb === undefined ? undefined : fixedDecimal(risk.kPricingRmb)
  const convertedSpecial =
    normalizedSpecial === undefined || normalizedBaseRate === undefined
      ? undefined
      : tokenSpecialPriceRmb(specialPoints, baseRatePointsPerRmb ?? '')
  const difference =
    convertedSpecial === undefined || normalizedCost === undefined
      ? undefined
      : convertedSpecial - normalizedCost
  return {
    category,
    basePoints: risk.customerRatePoints,
    specialPoints:
      normalizedSpecial === undefined
        ? null
        : fixedDecimalText(normalizedSpecial),
    baseRatePointsPerRmb:
      normalizedBaseRate === undefined ? null : (baseRatePointsPerRmb ?? null),
    kPricingRmb:
      normalizedCost === undefined ? null : (risk.kPricingRmb ?? null),
    specialPriceRmb:
      convertedSpecial === undefined
        ? null
        : fixedDecimalText(convertedSpecial),
    differenceRmb:
      difference === undefined ? null : fixedDecimalText(difference),
    belowCostReference: difference === undefined ? null : difference < 0n,
  }
}

function LimitedPriceActivityForm(props: {
  onBack: () => void
  onSaved: (activityId: string) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [modelId, setModelId] = useState('')
  const [sourcePriceVersionId, setSourcePriceVersionId] = useState('')
  const [specialPoints, setSpecialPoints] = useState('')
  const [specialTokenRates, setSpecialTokenRates] = useState({
    input: '',
    output: '',
    cacheRead: '',
    cacheWrite: '',
  })
  const [startsAt, setStartsAt] = useState<Date>()
  const [endsAt, setEndsAt] = useState<Date>()
  const [approvalReason, setApprovalReason] = useState('')
  const [error, setError] = useState<string>()
  const [conflictActivity, setConflictActivity] =
    useState<LimitedPriceConflict>()
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'model-pricing-workspace'],
    queryFn: getCanvasModelPricingWorkspace,
  })
  const model = useQuery({
    queryKey: ['canvas-cloud', 'model-pricing-model', modelId],
    queryFn: () => getCanvasModelPricingModel(modelId),
    enabled: Boolean(modelId),
  })
  const sources = useMemo<PublishedPriceSource[]>(() => {
    if (!model.data) return []
    return model.data.pricingScopes.flatMap((scope) =>
      scope.prices.flatMap((price) => {
        const current = price.current
        if (!current?.id || current.status !== 'PUBLISHED') return []
        return [
          {
            id: current.id,
            label: `${price.priceGroupName} · ${pricingScopeLabel(
              { key: scope.combinationKey, parameters: scope.parameters },
              t
            )}`,
            billingUnit: current.billingUnit,
            points: current.points,
            tokenRates: current.tokenRates,
            calculation: current.calculation,
            tokenCategoryRisks: current.assumptions?.tokenCategoryRisks ?? [],
          },
        ]
      })
    )
  }, [model.data, t])
  const source = sources.find((item) => item.id === sourcePriceVersionId)
  const tokenPriced = source?.billingUnit === 'MILLION_TOKENS'
  const requiredTokenCategories = tokenRateKeys.filter(
    (category) => source?.tokenRates?.[category] !== undefined
  )
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !source || !startsAt) {
        throw new Error('Complete all required fields')
      }
      if (startsAt <= new Date() || !endsAt || endsAt <= startsAt) {
        throw new Error(
          'Limited-price Promotion requires a future start and a later end'
        )
      }
      if (approvalReason.trim().length < 8) {
        throw new Error(
          'Promotion approval reason must contain 8 to 2000 characters'
        )
      }
      if (tokenPriced) {
        if (
          !requiredTokenCategories.every(
            (category) =>
              fixedDecimal(specialTokenRates[category].trim()) !== undefined
          )
        ) {
          throw new Error('Enter special token rates')
        }
        if (
          !requiredTokenCategories.every((category) => {
            const special = fixedDecimal(specialTokenRates[category].trim())
            const base = fixedDecimal(source.tokenRates?.[category] ?? '')
            return (
              special !== undefined && base !== undefined && special <= base
            )
          })
        ) {
          throw new Error('Special token rates cannot exceed the base rates')
        }
        if (
          !requiredTokenCategories.some((category) => {
            const special = fixedDecimal(specialTokenRates[category].trim())
            const base = fixedDecimal(source.tokenRates?.[category] ?? '')
            return special !== undefined && base !== undefined && special < base
          })
        ) {
          throw new Error('Reduce at least one token rate')
        }
        return createCanvasLimitedPriceActivity({
          name: name.trim(),
          sourcePriceVersionId: source.id,
          specialTokenRates: {
            input: specialTokenRates.input.trim(),
            output: specialTokenRates.output.trim(),
            ...(specialTokenRates.cacheRead.trim()
              ? { cacheRead: specialTokenRates.cacheRead.trim() }
              : {}),
            ...(specialTokenRates.cacheWrite.trim()
              ? { cacheWrite: specialTokenRates.cacheWrite.trim() }
              : {}),
          },
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          approvalReason: approvalReason.trim(),
        })
      }
      if (!/^\d+$/u.test(specialPoints.trim())) {
        throw new Error('Enter a valid special price')
      }
      return createCanvasLimitedPriceActivity({
        name: name.trim(),
        sourcePriceVersionId: source.id,
        specialPoints: specialPoints.trim(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        approvalReason: approvalReason.trim(),
      })
    },
    onSuccess: (activity) => {
      toast.success(t('Limited-time special scheduled'))
      void queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'activities'],
      })
      void props.onSaved(activity.id)
    },
    onError: (reason) => {
      const conflict = limitedPriceConflictFromError(reason)
      setConflictActivity(conflict)
      if (conflict) return
      const message = reason instanceof Error ? reason.message : undefined
      setError(
        message ? t(message) : t('Unable to schedule limited-time special')
      )
    },
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(undefined)
    setConflictActivity(undefined)
    save.mutate()
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('TASK_PRICE_SPECIAL')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className='grid gap-4 lg:grid-cols-2' onSubmit={submit}>
          <div className='lg:col-span-2'>
            <Label htmlFor='limited-price-name'>{t('Activity name')}</Label>
            <Input
              id='limited-price-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div>
            <Label>{t('Source model')}</Label>
            <Select
              value={modelId}
              onValueChange={(value) => {
                setModelId(value ?? '')
                setSourcePriceVersionId('')
              }}
            >
              <SelectTrigger
                className='h-auto min-h-8 w-full min-w-0 py-1.5 *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:break-words *:data-[slot=select-value]:whitespace-normal'
                aria-label={t('Source model')}
              >
                <CanvasLocalizedSelectValue
                  value={modelId}
                  displayValue={(() => {
                    const selected = workspace.data?.models.find(
                      (item) => item.id === modelId
                    )
                    return selected
                      ? `${selected.name} · ${selected.modelKey}`
                      : undefined
                  })()}
                />
              </SelectTrigger>
              <SelectContent>
                {workspace.data?.models
                  .filter((item) => item.hasPublishedPricing)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} · {item.modelKey}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('Source price version')}</Label>
            <Select
              value={sourcePriceVersionId}
              onValueChange={(value) => {
                setSourcePriceVersionId(value ?? '')
              }}
              disabled={!modelId || model.isPending}
            >
              <SelectTrigger
                className='h-auto min-h-8 w-full min-w-0 py-1.5 *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:break-words *:data-[slot=select-value]:whitespace-normal'
                aria-label={t('Source price version')}
              >
                <CanvasLocalizedSelectValue
                  value={source?.label ?? (model.isPending ? t('Loading') : '')}
                />
              </SelectTrigger>
              <SelectContent>
                {sources.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {source ? (
            <p className='text-muted-foreground text-sm lg:col-span-2'>
              {t('Published base price')}: {source.points} {t('points')} ·{' '}
              {t('Billing unit')}: {t(source.billingUnit)}
            </p>
          ) : null}
          {source ? (
            <LimitedPriceCostReference
              source={source}
              specialPoints={specialPoints}
              specialTokenRates={specialTokenRates}
            />
          ) : null}
          {tokenPriced ? (
            <>
              <LimitedPriceRateInput
                label={t('Special input token rate')}
                value={specialTokenRates.input}
                onChange={(value) => {
                  setSpecialTokenRates((current) => ({
                    ...current,
                    input: value,
                  }))
                }}
              />
              <LimitedPriceRateInput
                label={t('Special output token rate')}
                value={specialTokenRates.output}
                onChange={(value) => {
                  setSpecialTokenRates((current) => ({
                    ...current,
                    output: value,
                  }))
                }}
              />
              {source?.tokenRates?.cacheRead !== undefined ? (
                <LimitedPriceRateInput
                  label={t('Special cache-read token rate')}
                  value={specialTokenRates.cacheRead}
                  onChange={(value) => {
                    setSpecialTokenRates((current) => ({
                      ...current,
                      cacheRead: value,
                    }))
                  }}
                />
              ) : null}
              {source?.tokenRates?.cacheWrite !== undefined ? (
                <LimitedPriceRateInput
                  label={t('Special cache-write token rate')}
                  value={specialTokenRates.cacheWrite}
                  onChange={(value) => {
                    setSpecialTokenRates((current) => ({
                      ...current,
                      cacheWrite: value,
                    }))
                  }}
                />
              ) : null}
            </>
          ) : (
            <div>
              <Label htmlFor='limited-price-special-points'>
                {t('Special price')} ({t('points')})
              </Label>
              <Input
                id='limited-price-special-points'
                value={specialPoints}
                inputMode='numeric'
                onChange={(event) => setSpecialPoints(event.target.value)}
              />
            </div>
          )}
          <div>
            <Label>{t('Start time')}</Label>
            <DateTimePicker
              value={startsAt}
              onChange={(value) => {
                setStartsAt(value)
              }}
              futureOnly
              placeholder={t('Start time')}
            />
          </div>
          <div>
            <Label>{t('End time')}</Label>
            <DateTimePicker
              value={endsAt}
              onChange={(value) => {
                setEndsAt(value)
              }}
              futureOnly
              placeholder={t('End time')}
            />
          </div>
          <div className='lg:col-span-2'>
            <Label htmlFor='limited-price-reason'>{t('Approval reason')}</Label>
            <Input
              id='limited-price-reason'
              value={approvalReason}
              minLength={8}
              onChange={(event) => setApprovalReason(event.target.value)}
              required
            />
          </div>
          {error ? (
            <p className='text-destructive text-sm lg:col-span-2' role='alert'>
              {error}
            </p>
          ) : null}
          {conflictActivity ? (
            <div
              className='border-destructive text-destructive rounded-md border p-3 text-sm lg:col-span-2'
              role='alert'
            >
              <p>
                {t(
                  'An overlapping activity already applies to this source and period.'
                )}
              </p>
              <p className='mt-1'>
                {conflictActivity.name} ·{' '}
                {formatCanvasDateTime(conflictActivity.startsAt)} —{' '}
                {formatCanvasDateTime(conflictActivity.endsAt)}
              </p>
              <a
                className='mt-2 inline-block font-medium underline'
                href={activityDetailHref(conflictActivity.id)}
                target='_blank'
                rel='noreferrer'
              >
                {t('View conflicting activity')}
              </a>
            </div>
          ) : null}
          <p className='text-muted-foreground text-sm lg:col-span-2'>
            {t('Uses your current time zone')}:{' '}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </p>
          <div className='flex justify-end gap-2 lg:col-span-2'>
            <Button type='button' variant='outline' onClick={props.onBack}>
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={save.isPending}>
              {t('Confirm publish')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function LimitedPriceRateInput(props: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const id = `limited-price-${props.label}`
  return (
    <div>
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        value={props.value}
        inputMode='decimal'
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  )
}

function LimitedPriceCostReference(props: {
  source: PublishedPriceSource
  specialPoints: string
  specialTokenRates: Record<TokenRateKey, string>
}) {
  const { t } = useTranslation()
  if (props.source.billingUnit === 'MILLION_TOKENS') {
    const references = tokenRateKeys
      .filter((category) => props.source.tokenRates?.[category] !== undefined)
      .map((category) =>
        tokenCategoryCostReference(
          category,
          props.source.tokenCategoryRisks.find(
            (risk) => risk.category === category
          ),
          props.source.calculation?.baseRatePointsPerRmb,
          props.specialTokenRates[category].trim()
        )
      )
    return <TokenCategoryCostReferences references={references} />
  }
  if (!props.source.calculation) {
    return (
      <p className='text-muted-foreground text-sm lg:col-span-2'>
        {t('Pricing reference is temporarily unavailable.')}
      </p>
    )
  }
  const preview = specialPricePreview(
    specialRevenueFromPoints(
      props.specialPoints.trim(),
      props.source.calculation.baseRatePointsPerRmb
    ),
    props.source.calculation.kPricingRmb
  )
  return <SpecialPriceReference preview={preview} />
}

function SpecialPriceReference(props: {
  preview: ReturnType<typeof specialPricePreview> | undefined
}) {
  const { t } = useTranslation()
  if (!props.preview) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('Pricing reference is temporarily unavailable.')}
      </p>
    )
  }
  return (
    <div className='rounded-md border p-3 text-sm lg:col-span-2'>
      <p className='font-medium'>{t('Pricing cost reference')}</p>
      <p>
        {t('Converted CNY')}: ¥{fixedDecimalText(props.preview.revenue)} ·{' '}
        {t('Cost reference')}: ¥{fixedDecimalText(props.preview.cost)} ·{' '}
        {t('Difference')}: ¥{fixedDecimalText(props.preview.difference)}
      </p>
      {props.preview.below ? (
        <p className='text-destructive mt-1 font-medium'>
          {t('Special price is below the pricing cost reference.')}
        </p>
      ) : null}
    </div>
  )
}

function TokenCategoryCostReferences(props: {
  references: TokenCategoryCostReferenceDisplay[] | null
  historical?: boolean
}) {
  const { t } = useTranslation()
  if (!props.references?.length) return null
  return (
    <div className='space-y-3 rounded-md border p-3 text-sm lg:col-span-2'>
      <p className='font-medium'>{t('Token category pricing reference')}</p>
      {props.references.map((reference) => {
        const cannotEvaluate =
          reference.specialPriceRmb === null ||
          reference.differenceRmb === null ||
          reference.belowCostReference === null
        let belowCostReference = '—'
        if (reference.belowCostReference !== null) {
          belowCostReference = reference.belowCostReference ? t('Yes') : t('No')
        }
        return (
          <div
            className='space-y-2 border-t pt-3 first:border-t-0 first:pt-0'
            key={reference.category}
          >
            <p className='font-medium'>
              {t(`Token category ${reference.category}`)}
            </p>
            <dl className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              <TokenCategoryCostFact
                label={t('Base → special')}
                value={`${reference.basePoints ?? '—'} → ${reference.specialPoints ?? '—'}`}
              />
              <TokenCategoryCostFact
                label={t('Points per RMB')}
                value={reference.baseRatePointsPerRmb ?? '—'}
              />
              <TokenCategoryCostFact
                label={t('Pricing cost reference')}
                value={reference.kPricingRmb ?? '—'}
                rmb
              />
              <TokenCategoryCostFact
                label={t('Special price (RMB)')}
                value={reference.specialPriceRmb ?? '—'}
                rmb
              />
              <TokenCategoryCostFact
                label={t('Difference (RMB)')}
                value={reference.differenceRmb ?? '—'}
                rmb
              />
              <TokenCategoryCostFact
                label={t('Below cost reference')}
                value={belowCostReference}
              />
            </dl>
            {cannotEvaluate ? (
              <p className='text-muted-foreground'>
                {t('This category cannot be evaluated yet.')}
              </p>
            ) : null}
          </div>
        )
      })}
      {props.historical ? (
        <p className='text-muted-foreground'>
          {t(
            'Historical pricing facts are frozen at publication and may differ from current pricing.'
          )}
        </p>
      ) : null}
    </div>
  )
}

function TokenCategoryCostFact(props: {
  label: string
  value: string
  rmb?: boolean
}) {
  return (
    <div>
      <dt className='text-muted-foreground'>{props.label}</dt>
      <dd className='tabular-nums'>
        {props.rmb && props.value !== '—' ? `¥${props.value}` : props.value}
      </dd>
    </div>
  )
}

function FormInput(props: {
  form: ReturnType<typeof useForm<ManualValues | BaseValues>>
  name: keyof ManualValues
  label: string
  className?: string
  type?: string
  disabled?: boolean
  min?: number
  max?: number
  inputMode?: 'numeric' | 'decimal'
}) {
  const { t } = useTranslation()
  const id = `activity-${props.name}`
  const error = props.form.getFieldState(props.name as never).error?.message
  return (
    <div className={props.className}>
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        type={props.type}
        min={props.min}
        max={props.max}
        inputMode={props.inputMode}
        disabled={props.disabled}
        {...props.form.register(props.name)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p
          id={`${id}-error`}
          role='alert'
          className='text-destructive mt-1 text-sm'
        >
          {t(String(error))}
        </p>
      ) : null}
    </div>
  )
}

function RecipientSelector(props: {
  form: ReturnType<typeof useForm<ManualValues | BaseValues>>
  values: Partial<ManualValues>
  baselineSelection?: {
    selectionToken: string
    count: number
    expiresAt: string
  }
  baselineLoading: boolean
}) {
  const { t } = useTranslation()
  const table = useServerTableState<'customer'>('customer')
  const resetPage = () =>
    table.setPagination((current) => ({ ...current, pageIndex: 0 }))
  const [basisCustomer, setBasisCustomer] = useState<{
    customerId: string
    customer: string
  }>()
  const [changedNames, setChangedNames] = useState<Record<string, string>>({})
  const editing = Boolean(props.values.editingExistingMembers)
  const addedCustomerIds = props.values.addedCustomerIds ?? EMPTY_CUSTOMER_IDS
  const removedCustomerIds =
    props.values.removedCustomerIds ?? EMPTY_CUSTOMER_IDS
  const clearBaseline = Boolean(props.values.clearBaseline)
  const threshold =
    props.values.scope === 'RECHARGE_THRESHOLD'
      ? cnyThresholdToMinor(props.values.minimumRechargeRmb ?? '')
      : null
  const selectAllMatching = useMutation({
    mutationFn: () =>
      resolveCanvasEligibleActivityCustomers({
        ...(table.query.search ? { username: table.query.search } : {}),
        minimumRechargeAmountMinor: threshold ?? undefined,
        currency: 'CNY',
        ...(props.values.redeemedFrom
          ? { redeemedFrom: new Date(props.values.redeemedFrom).toISOString() }
          : {}),
        ...(props.values.redeemedTo
          ? { redeemedTo: new Date(props.values.redeemedTo).toISOString() }
          : {}),
      }),
    onSuccess: (selection) => {
      props.form.setValue('selectionToken', selection.selectionToken, {
        shouldValidate: true,
      })
      props.form.setValue('selectedCustomerCount', selection.count)
      props.form.setValue('customerIds', [])
    },
    onError: () => toast.error(t('Unable to select matching customers')),
  })
  const clearSelection = () => {
    if (editing) {
      props.form.setValue('addedCustomerIds', [], { shouldValidate: true })
      props.form.setValue('removedCustomerIds', [], { shouldValidate: true })
      props.form.setValue('clearBaseline', true, { shouldValidate: true })
      return
    }
    props.form.setValue('customerIds', [], { shouldValidate: true })
    props.form.setValue('selectionToken', '', { shouldValidate: true })
    props.form.setValue('selectedCustomerCount', 0)
  }
  const selectionFilterKey = [
    props.values.scope,
    threshold,
    props.values.redeemedFrom,
    props.values.redeemedTo,
    table.query.search,
  ].join('|')
  const previousSelectionFilterKey = useRef(selectionFilterKey)
  useEffect(() => {
    if (previousSelectionFilterKey.current === selectionFilterKey) return
    previousSelectionFilterKey.current = selectionFilterKey
    if (editing) return
    props.form.setValue('customerIds', [], { shouldValidate: true })
    props.form.setValue('selectionToken', '', { shouldValidate: true })
    props.form.setValue('selectedCustomerCount', 0)
  }, [editing, props.form, selectionFilterKey])
  const customers = useQuery({
    queryKey: [
      'canvas-cloud',
      'activity-eligible-customers',
      table.query.page,
      table.query.pageSize,
      table.query.search,
      props.values.scope,
      threshold,
      props.values.redeemedFrom,
      props.values.redeemedTo,
      props.baselineSelection?.selectionToken,
    ],
    queryFn: ({ signal }) =>
      getCanvasEligibleActivityCustomers(
        {
          page: table.query.page,
          pageSize: table.query.pageSize,
          ...(table.query.search ? { username: table.query.search } : {}),
          ...(props.values.scope === 'RECHARGE_THRESHOLD' && threshold
            ? { minimumRechargeAmountMinor: threshold, currency: 'CNY' }
            : {}),
          ...(props.values.scope === 'RECHARGE_THRESHOLD' &&
          props.values.redeemedFrom
            ? {
                redeemedFrom: new Date(props.values.redeemedFrom).toISOString(),
              }
            : {}),
          ...(props.values.scope === 'RECHARGE_THRESHOLD' &&
          props.values.redeemedTo
            ? {
                redeemedTo: new Date(props.values.redeemedTo).toISOString(),
              }
            : {}),
          ...(props.baselineSelection
            ? { selectionToken: props.baselineSelection.selectionToken }
            : {}),
        },
        signal
      ),
    enabled:
      (!editing || Boolean(props.baselineSelection)) &&
      isCanvasDateRangeValid(
        props.values.redeemedFrom
          ? new Date(props.values.redeemedFrom)
          : undefined,
        props.values.redeemedTo ? new Date(props.values.redeemedTo) : undefined
      ),
    placeholderData: (previous) => previous,
  })
  const selected = props.values.customerIds ?? EMPTY_CUSTOMER_IDS
  let selectedCount = selected.length
  if (editing) {
    const baselineCount = clearBaseline
      ? 0
      : (props.baselineSelection?.count ??
        props.values.selectedCustomerCount ??
        0)
    selectedCount = Math.max(
      0,
      baselineCount - removedCustomerIds.length + addedCustomerIds.length
    )
  } else if (props.values.selectionToken) {
    selectedCount = props.values.selectedCustomerCount ?? 0
  }
  const visibleCustomers = useMemo(
    () => customers.data?.items ?? [],
    [customers.data?.items]
  )
  const isSelected = (customer: CanvasActivityEligibleCustomer) => {
    if (!editing) return selected.includes(customer.customerId)
    if (clearBaseline) return addedCustomerIds.includes(customer.customerId)
    if (customer.selected) {
      return !removedCustomerIds.includes(customer.customerId)
    }
    return addedCustomerIds.includes(customer.customerId)
  }
  const setMembership = (
    nextCustomers: CanvasActivityEligibleCustomer[],
    checked: boolean
  ) => {
    const currentValues = props.form.getValues() as ManualValues
    if (!editing) {
      const nextIds = nextCustomers.map((customer) => customer.customerId)
      const currentSelected = currentValues.customerIds ?? EMPTY_CUSTOMER_IDS
      props.form.setValue(
        'customerIds',
        checked
          ? [...new Set([...currentSelected, ...nextIds])]
          : currentSelected.filter((id) => !nextIds.includes(id)),
        { shouldValidate: true }
      )
      props.form.setValue('selectionToken', '')
      props.form.setValue('selectedCustomerCount', 0)
      return
    }
    const added = new Set(currentValues.addedCustomerIds ?? EMPTY_CUSTOMER_IDS)
    const removed = new Set(
      currentValues.removedCustomerIds ?? EMPTY_CUSTOMER_IDS
    )
    const names: Record<string, string> = {}
    for (const customer of nextCustomers) {
      names[customer.customerId] = customer.customer
      const isBaselineMember = customer.selected && !currentValues.clearBaseline
      if (isBaselineMember) {
        if (checked) removed.delete(customer.customerId)
        else removed.add(customer.customerId)
        added.delete(customer.customerId)
      } else if (checked) {
        added.add(customer.customerId)
      } else {
        added.delete(customer.customerId)
      }
    }
    setChangedNames((current) => ({ ...current, ...names }))
    props.form.setValue('addedCustomerIds', [...added], {
      shouldValidate: true,
    })
    props.form.setValue('removedCustomerIds', [...removed], {
      shouldValidate: true,
    })
  }
  const columns: ColumnDef<
    NonNullable<typeof customers.data>['items'][number],
    unknown
  >[] = [
    {
      id: 'select',
      enableSorting: false,
      header: () => {
        const visible = visibleCustomers
        const allVisibleSelected =
          visible.length > 0 &&
          visible.every((customer) => isSelected(customer))
        return (
          <Checkbox
            aria-label={t('Select current page')}
            checked={allVisibleSelected}
            onCheckedChange={(checked) => setMembership(visible, checked)}
          />
        )
      },
      cell: ({ row }) => (
        <Checkbox
          aria-label={t('Select customer {{customer}}', {
            customer: row.original.customer,
          })}
          checked={isSelected(row.original)}
          onCheckedChange={(checked) => setMembership([row.original], checked)}
        />
      ),
    },
    {
      id: 'customer',
      accessorKey: 'customer',
      meta: { label: t('Customer') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Customer')} />
      ),
    },
    ...(props.values.scope === 'RECHARGE_THRESHOLD'
      ? [
          {
            id: 'qualifyingAmountMinor',
            accessorKey: 'qualifyingAmountMinor',
            meta: { label: t('Qualifying recharge amount') },
            header: ({
              column,
            }: HeaderContext<CanvasActivityEligibleCustomer, unknown>) => (
              <DataTableColumnHeader
                column={column}
                title={t('Qualifying recharge amount')}
              />
            ),
            cell: ({
              row,
            }: {
              row: {
                original: NonNullable<typeof customers.data>['items'][number]
              }
            }) => (
              <Button
                type='button'
                variant='link'
                className='h-auto p-0'
                onClick={() => setBasisCustomer(row.original)}
              >
                ¥{minorToCny(row.original.qualifyingAmountMinor)}
              </Button>
            ),
          },
        ]
      : []),
  ]
  return (
    <div className='space-y-3 lg:col-span-2'>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div>
          <Label>{t('Customer scope')}</Label>
          <Select
            value={props.values.scope ?? 'SELECTED'}
            onValueChange={(value) => {
              props.form.setValue('scope', value as ManualValues['scope'], {
                shouldValidate: true,
              })
              clearSelection()
              resetPage()
            }}
          >
            <SelectTrigger
              className='w-full min-w-0'
              aria-label={t('Customer scope')}
            >
              <CanvasLocalizedSelectValue
                value={props.values.scope}
                valueLabelKey={
                  props.values.scope === 'RECHARGE_THRESHOLD'
                    ? 'Recharge threshold'
                    : 'Selected customers'
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='SELECTED'>
                {t('Selected customers')}
              </SelectItem>
              <SelectItem value='RECHARGE_THRESHOLD'>
                {t('Recharge threshold')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {props.values.scope === 'RECHARGE_THRESHOLD' ? (
          <>
            <FormInput
              form={props.form}
              name='minimumRechargeRmb'
              label={t('Minimum recharge amount (CNY)')}
              inputMode='decimal'
            />
            <div className='sm:col-span-2'>
              <p className='mb-2 text-sm font-medium'>{t('Redeemed time')}</p>
              <CanvasDateRangeFilter
                from={
                  props.values.redeemedFrom
                    ? new Date(props.values.redeemedFrom)
                    : undefined
                }
                to={
                  props.values.redeemedTo
                    ? new Date(props.values.redeemedTo)
                    : undefined
                }
                onFromChange={(value) => {
                  props.form.setValue(
                    'redeemedFrom',
                    value ? toDateTimeLocal(value.toISOString()) : '',
                    { shouldValidate: true }
                  )
                  resetPage()
                }}
                onToChange={(value) => {
                  props.form.setValue(
                    'redeemedTo',
                    value ? toDateTimeLocal(value.toISOString()) : '',
                    { shouldValidate: true }
                  )
                  resetPage()
                }}
              />
            </div>
          </>
        ) : null}
      </div>
      <CanvasServerTable
        data={customers.data?.items ?? []}
        columns={columns}
        total={customers.data?.total ?? 0}
        state={table}
        searchLabel={t('Customer')}
        loading={customers.isPending || customers.isFetching}
        error={customers.isError}
        onRetry={() => void customers.refetch()}
        emptyTitle={t('No eligible customers')}
        filteredEmptyTitle={t('No customers match the current filters')}
        getRowId={(item) => item.customerId}
      />
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-sm'>
          {t('Selected {{count}} customers · Planned total {{points}} points', {
            count: selectedCount,
            points:
              selectedCount &&
              props.values.points &&
              /^\d+$/u.test(props.values.points)
                ? (
                    BigInt(selectedCount) * BigInt(props.values.points)
                  ).toString()
                : '0',
          })}
        </p>
        {!editing &&
        props.values.scope === 'RECHARGE_THRESHOLD' &&
        !props.values.selectionToken &&
        visibleCustomers.length > 0 &&
        visibleCustomers.every((customer) => isSelected(customer)) &&
        customers.data?.total ? (
          <Button
            type='button'
            variant='outline'
            disabled={selectAllMatching.isPending}
            onClick={() => selectAllMatching.mutate()}
          >
            {t('Select all {{count}} matching customers', {
              count: customers.data.total,
            })}
          </Button>
        ) : null}
        {selectedCount > 0 ? (
          <Button type='button' variant='outline' onClick={clearSelection}>
            {t('Clear selection')}
          </Button>
        ) : null}
      </div>
      {editing ? (
        <p className='text-muted-foreground text-sm'>
          {t(
            'Membership before {{before}} · Added {{added}} · Removed {{removed}} · After {{after}}',
            {
              before: props.baselineSelection?.count ?? 0,
              added: addedCustomerIds.length,
              removed: clearBaseline
                ? (props.baselineSelection?.count ?? 0)
                : removedCustomerIds.length,
              after: selectedCount,
            }
          )}{' '}
          {addedCustomerIds.length
            ? `${t('Added')}: ${addedCustomerIds.map((id) => changedNames[id] ?? id).join(', ')}`
            : null}{' '}
          {removedCustomerIds.length
            ? `${t('Removed')}: ${removedCustomerIds.map((id) => changedNames[id] ?? id).join(', ')}`
            : null}
        </p>
      ) : null}
      <CurrentEligibilityBasisSheet
        customer={basisCustomer}
        minimumRechargeAmountMinor={threshold}
        redeemedFrom={props.values.redeemedFrom}
        redeemedTo={props.values.redeemedTo}
        onClose={() => setBasisCustomer(undefined)}
      />
    </div>
  )
}

function CurrentEligibilityBasisSheet(props: {
  customer?: { customerId: string; customer: string }
  minimumRechargeAmountMinor: string | null
  redeemedFrom?: string
  redeemedTo?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const basis = useQuery({
    queryKey: [
      'canvas-cloud',
      'current-activity-eligibility-basis',
      props.customer?.customerId,
      props.minimumRechargeAmountMinor,
      props.redeemedFrom,
      props.redeemedTo,
    ],
    enabled:
      Boolean(props.customer && props.minimumRechargeAmountMinor) &&
      isCanvasDateRangeValid(
        props.redeemedFrom ? new Date(props.redeemedFrom) : undefined,
        props.redeemedTo ? new Date(props.redeemedTo) : undefined
      ),
    queryFn: ({ signal }) =>
      getCanvasCurrentManualGrantEligibilityBasis(
        props.customer?.customerId ?? '',
        {
          minimumRechargeAmountMinor: props.minimumRechargeAmountMinor ?? '1',
          currency: 'CNY',
          ...(props.redeemedFrom
            ? { redeemedFrom: new Date(props.redeemedFrom).toISOString() }
            : {}),
          ...(props.redeemedTo
            ? { redeemedTo: new Date(props.redeemedTo).toISOString() }
            : {}),
        },
        signal
      ),
  })
  return (
    <Sheet
      open={Boolean(props.customer)}
      onOpenChange={(open) => !open && props.onClose()}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {t('Eligibility basis')} · {props.customer?.customer}
          </SheetTitle>
        </SheetHeader>
        <div className='space-y-3 p-4 text-sm'>
          {basis.isPending ? <p>{t('Loading')}</p> : null}
          {basis.isError ? (
            <p role='alert'>{t('Unable to load eligibility basis')}</p>
          ) : null}
          {basis.data ? <EligibilityBasisContent basis={basis.data} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ActivityDetail(props: {
  activityId: string
  initialDetail?: CanvasActivityDetail
  onBack: () => void
  onEdit: (plan: CanvasManualGrantPlan) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [stopOpen, setStopOpen] = useState(false)
  const [basisTarget, setBasisTarget] = useState<CanvasManualGrantMember>()
  const detail = useQuery({
    queryKey: ['canvas-cloud', 'activity', props.activityId],
    queryFn: ({ signal }) => getCanvasActivity(props.activityId, signal),
    initialData: props.initialDetail,
  })
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'activity', props.activityId],
    })
    void queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'activities'],
    })
    void queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'activity-members', props.activityId],
    })
  }
  const cancel = useMutation({
    mutationFn: (plan: CanvasManualGrantPlan) =>
      cancelCanvasManualBonusActivity(plan.activityId, plan.version),
    onSuccess: () => {
      setCancelOpen(false)
      toast.success(t('Activity cancelled'))
      refresh()
    },
    onError: () => toast.error(t('Unable to cancel activity')),
  })
  const retry = useMutation({
    mutationFn: () => retryCanvasManualGrantFailures(props.activityId),
    onSuccess: () => {
      toast.success(t('Failed customers are being retried'))
      refresh()
    },
    onError: () => toast.error(t('Unable to retry failed customers')),
  })
  const stop = useMutation({
    mutationFn: () =>
      stopCanvasBonusActivity(props.activityId, 'Stopped by administrator'),
    onSuccess: () => {
      setStopOpen(false)
      toast.success(t('Activity stopped'))
      refresh()
    },
    onError: () => toast.error(t('Unable to stop activity')),
  })

  if (detail.isPending) {
    return (
      <Card>
        <CardContent className='py-6'>{t('Loading')}</CardContent>
      </Card>
    )
  }
  if (detail.isError || !detail.data) {
    return (
      <Card>
        <CardContent className='space-y-3 py-6'>
          <p role='alert'>{t('Unable to load activity details')}</p>
          <Button
            type='button'
            variant='outline'
            onClick={() => void detail.refetch()}
          >
            {t('Retry')}
          </Button>
        </CardContent>
      </Card>
    )
  }
  const activity = detail.data
  if ('activityId' in activity) {
    return (
      <ManualActivityDetail
        plan={activity}
        onBack={props.onBack}
        onCancel={() => setCancelOpen(true)}
        onEdit={() => props.onEdit(activity)}
        onRetry={() => retry.mutate()}
        retryPending={retry.isPending}
        onBasis={setBasisTarget}
      >
        <CancelActivityDialog
          open={cancelOpen}
          plan={activity}
          pending={cancel.isPending}
          onOpenChange={setCancelOpen}
          onConfirm={() => cancel.mutate(activity)}
        />
        <EligibilityBasisSheet
          activityId={activity.activityId}
          member={basisTarget}
          onClose={() => setBasisTarget(undefined)}
        />
      </ManualActivityDetail>
    )
  }
  if ('ttlDays' in activity) {
    return (
      <BonusActivityDetail
        activity={activity}
        onBack={props.onBack}
        onStop={() => setStopOpen(true)}
      >
        <StopActivityDialog
          open={stopOpen}
          activity={activity}
          pending={stop.isPending}
          onOpenChange={setStopOpen}
          onConfirm={() => stop.mutate()}
        />
        <BonusActivityRecords activity={activity} />
      </BonusActivityDetail>
    )
  }
  return (
    <LimitedPriceActivityDetail activity={activity} onBack={props.onBack} />
  )
}

function ManualActivityDetail(props: {
  plan: CanvasManualGrantPlan
  onBack: () => void
  onCancel: () => void
  onEdit: () => void
  onRetry: () => void
  retryPending: boolean
  onBasis: (member: CanvasManualGrantMember) => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const navigation = useContext(ActivityRecordNavigationContext)
  const restored = activityRecordState<{
    search?: string
    pageIndex?: number
    pageSize?: number
    result?: string
    creditedFrom?: string
    creditedTo?: string
    sortId?: 'customer' | 'status' | 'creditedAt'
    sortDesc?: boolean
  }>(navigation?.recordState, 'manual')
  const table = useServerTableState<'customer'>('customer', restored?.search)
  const [result, setResult] = useState<string>(restored?.result ?? '')
  const [creditedFrom, setCreditedFrom] = useState<Date | undefined>(
    restored?.creditedFrom ? new Date(restored.creditedFrom) : undefined
  )
  const [creditedTo, setCreditedTo] = useState<Date | undefined>(
    restored?.creditedTo ? new Date(restored.creditedTo) : undefined
  )
  const restoredPage = useRef(false)
  useEffect(() => {
    if (!restored || restoredPage.current) return
    restoredPage.current = true
    table.setPagination({
      pageIndex: restored.pageIndex ?? 0,
      pageSize: restored.pageSize ?? 20,
    })
    if (restored.sortId) {
      table.setSorting([
        { id: restored.sortId, desc: restored.sortDesc ?? true },
      ])
    }
  }, [restored, table])
  useEffect(() => {
    navigation?.updateRecordState({
      kind: 'manual',
      search: table.search,
      pageIndex: table.pagination.pageIndex,
      pageSize: table.pagination.pageSize,
      sortId: table.query.sortBy,
      sortDesc: table.query.sortOrder === 'desc',
      result,
      ...(creditedFrom ? { creditedFrom: creditedFrom.toISOString() } : {}),
      ...(creditedTo ? { creditedTo: creditedTo.toISOString() } : {}),
    })
  }, [
    creditedFrom,
    creditedTo,
    navigation,
    result,
    table.pagination.pageIndex,
    table.pagination.pageSize,
    table.search,
    table.query.sortBy,
    table.query.sortOrder,
  ])
  const canCancel = props.plan.status === 'WAITING'
  const canRetry =
    props.plan.status === 'PARTIAL_FAILED' || props.plan.status === 'FAILED'
  const thresholdScope =
    props.plan.scope.type === 'RECHARGE_THRESHOLD' ? props.plan.scope : null
  const isMembershipSnapshot =
    props.plan.status === 'WAITING' || props.plan.status === 'CANCELLED'
  const showEligibilitySnapshot =
    Boolean(thresholdScope) && isMembershipSnapshot
  const showExecutionRecords = !isMembershipSnapshot
  const members = useQuery({
    queryKey: [
      'canvas-cloud',
      'activity-members',
      props.plan.activityId,
      table.query.page,
      table.query.pageSize,
      table.query.search,
      table.query.sortBy,
      table.query.sortOrder,
      showExecutionRecords ? result : undefined,
      showExecutionRecords ? creditedFrom?.toISOString() : undefined,
      showExecutionRecords ? creditedTo?.toISOString() : undefined,
    ],
    queryFn: ({ signal }) =>
      getCanvasManualGrantMembers(
        props.plan.activityId,
        {
          page: table.query.page,
          pageSize: table.query.pageSize,
          sortBy: table.query.sortBy,
          sortOrder: table.query.sortOrder,
          ...(table.query.search ? { customer: table.query.search } : {}),
          ...(showExecutionRecords && result ? { result } : {}),
          ...(showExecutionRecords && creditedFrom
            ? { creditedFrom: creditedFrom.toISOString() }
            : {}),
          ...(showExecutionRecords && creditedTo
            ? { creditedTo: creditedTo.toISOString() }
            : {}),
        },
        signal
      ),
    enabled:
      !showExecutionRecords || isCanvasDateRangeValid(creditedFrom, creditedTo),
    placeholderData: (previous) => previous,
  })
  const columns = useMemo<ColumnDef<CanvasManualGrantMember, unknown>[]>(() => {
    const customerColumn: ColumnDef<CanvasManualGrantMember, unknown> = {
      id: 'customer',
      accessorKey: 'customer',
      meta: { label: t('Customer') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Customer')} />
      ),
      cell: ({ row }) => row.original.customer,
    }
    if (isMembershipSnapshot) {
      return [
        customerColumn,
        ...(showEligibilitySnapshot
          ? [
              {
                id: 'qualifyingAmountMinor',
                meta: { label: t('Qualifying recharge amount') },
                header: t('Qualifying recharge amount'),
                cell: ({
                  row,
                }: {
                  row: { original: CanvasManualGrantMember }
                }) => (
                  <Button
                    type='button'
                    variant='link'
                    className='h-auto p-0'
                    onClick={() => props.onBasis(row.original)}
                  >
                    ¥{minorToCny(row.original.qualifyingAmountMinor ?? '0')}
                  </Button>
                ),
              },
            ]
          : []),
      ]
    }
    return [
      customerColumn,
      {
        id: 'status',
        accessorKey: 'status',
        meta: { label: t('Result') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Result')} />
        ),
        cell: ({ row }) => t(`Manual grant result ${row.original.status}`),
      },
      {
        id: 'creditedAt',
        accessorKey: 'creditedAt',
        meta: { label: t('Credited at') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Credited at')} />
        ),
        cell: ({ row }) =>
          row.original.creditedAt
            ? formatCanvasDateTime(row.original.creditedAt)
            : '—',
      },
      {
        id: 'resultDetail',
        meta: { label: t('Record or reason') },
        header: t('Record or reason'),
        cell: ({ row }) => {
          if (row.original.failureReason) return row.original.failureReason
          if (row.original.status !== 'SUCCEEDED' || !row.original.pointLotId) {
            return '—'
          }
          return (
            <ActivityRecordLink
              href={activityCustomerHref(
                row.original.customerId,
                row.original.pointLotId
              )}
              focusId={`manual-lot-${row.original.customerId}-${row.original.pointLotId}`}
              className='text-primary font-mono hover:underline'
            >
              {row.original.pointLotId}
            </ActivityRecordLink>
          )
        },
      },
    ]
  }, [isMembershipSnapshot, props, showEligibilitySnapshot, t])
  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle>
            {props.plan.name} · {t(activityStatusKey(props.plan.status))}
          </CardTitle>
          <Button type='button' variant='outline' onClick={props.onBack}>
            {t('Back to activity management')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-4 text-sm'>
        <div className='space-y-1'>
          <p>
            {t('Points per customer')}: {props.plan.points} ·{' '}
            {t('Bonus validity (days)')}: {props.plan.ttlDays}
          </p>
          <p>
            {props.plan.schedule.mode === 'SCHEDULED'
              ? `${t('Scheduled time')}: ${formatCanvasDateTime(props.plan.schedule.scheduledAt)}`
              : t('Immediate grant')}
          </p>
          <p>
            {t('Actual start')}:{' '}
            {props.plan.actualStartedAt
              ? formatCanvasDateTime(props.plan.actualStartedAt)
              : '—'}
          </p>
          <p>
            {t('Reason')}: {props.plan.reason}
          </p>
          <p>
            {t('Published at')}:{' '}
            {props.plan.publishedAt
              ? formatCanvasDateTime(props.plan.publishedAt)
              : '—'}
          </p>
          {props.plan.publisher ? (
            <p>
              {t('Published by')}:{' '}
              {props.plan.publisher.displayName ??
                props.plan.publisher.principalId}
            </p>
          ) : null}
          {props.plan.cancelledAt ? (
            <p>
              {t('Cancelled at')}:{' '}
              {formatCanvasDateTime(props.plan.cancelledAt)}
            </p>
          ) : null}
          {props.plan.cancelledBy ? (
            <p>
              {t('Cancelled by')}:{' '}
              {props.plan.cancelledBy.displayName ??
                props.plan.cancelledBy.principalId}
            </p>
          ) : null}
          {thresholdScope ? (
            <p>
              {t('Minimum recharge amount (CNY)')}: ¥
              {minorToCny(thresholdScope.minimumRechargeAmountMinor)}
            </p>
          ) : null}
        </div>
        <CanvasServerTable
          data={members.data?.items ?? []}
          columns={columns}
          total={members.data?.total ?? props.plan.memberCount}
          state={table}
          searchLabel={t('Customer')}
          loading={members.isPending || members.isFetching}
          error={members.isError}
          onRetry={() => void members.refetch()}
          emptyTitle={t('No grant members')}
          filteredEmptyTitle={t('No grant members match the current filters')}
          getRowId={(item) => item.customerId}
          additionalFilters={
            showExecutionRecords ? (
              <>
                <DataTableColumnFilterField label={t('Result')}>
                  <Select
                    value={result || 'ALL'}
                    onValueChange={(value) => {
                      setResult(value === 'ALL' ? '' : (value ?? ''))
                      table.setPagination((current) => ({
                        ...current,
                        pageIndex: 0,
                      }))
                    }}
                  >
                    <SelectTrigger
                      className='w-full min-w-0'
                      aria-label={t('Result')}
                    >
                      <CanvasLocalizedSelectValue
                        value={result}
                        emptyLabelKey='All results'
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ALL'>{t('All results')}</SelectItem>
                      {['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED'].map(
                        (value) => (
                          <SelectItem key={value} value={value}>
                            {t(`Manual grant result ${value}`)}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </DataTableColumnFilterField>
                <DataTableColumnFilterField
                  label={t('Credited at')}
                  className='sm:col-span-2'
                >
                  <CanvasDateRangeFilter
                    from={creditedFrom}
                    to={creditedTo}
                    onFromChange={(value) => {
                      setCreditedFrom(value)
                      table.setPagination((current) => ({
                        ...current,
                        pageIndex: 0,
                      }))
                    }}
                    onToChange={(value) => {
                      setCreditedTo(value)
                      table.setPagination((current) => ({
                        ...current,
                        pageIndex: 0,
                      }))
                    }}
                  />
                </DataTableColumnFilterField>
              </>
            ) : null
          }
          hasActiveFilters={Boolean(
            showExecutionRecords && (result || creditedFrom || creditedTo)
          )}
          onResetFilters={() => {
            setResult('')
            setCreditedFrom(undefined)
            setCreditedTo(undefined)
            table.setPagination((current) => ({
              ...current,
              pageIndex: 0,
            }))
          }}
        />
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <ManualGrantSummary
            plan={props.plan}
            isMembershipSnapshot={isMembershipSnapshot}
          />
          <div className='flex gap-2'>
            {canCancel ? (
              <Button
                type='button'
                variant='destructive'
                onClick={props.onCancel}
              >
                {t('Cancel plan')}
              </Button>
            ) : null}
            {canCancel ? (
              <Button type='button' variant='outline' onClick={props.onEdit}>
                {t('Edit')}
              </Button>
            ) : null}
            {canRetry ? (
              <Button
                type='button'
                disabled={props.retryPending}
                onClick={props.onRetry}
              >
                {t('Retry failed customers')}
              </Button>
            ) : null}
          </div>
        </div>
        {props.children}
      </CardContent>
    </Card>
  )
}

function ManualGrantSummary(props: {
  plan: CanvasManualGrantPlan
  isMembershipSnapshot: boolean
}) {
  const { t } = useTranslation()
  if (props.isMembershipSnapshot) {
    return (
      <p>
        {t(
          'Fixed membership {{count}} customers · Planned total {{points}} points',
          {
            count: props.plan.memberCount,
            points: plannedTotalPoints(
              props.plan.memberCount,
              props.plan.points
            ),
          }
        )}
      </p>
    )
  }
  if (props.plan.status === 'RUNNING') {
    const counts = manualGrantRunningCounts(props.plan)
    if (!counts) return <p role='alert'>{t('Results are incomplete')}</p>
    const entries = [
      { status: 'PENDING', count: counts.pendingCount },
      { status: 'PROCESSING', count: counts.processingCount },
      { status: 'SUCCEEDED', count: counts.successCount },
      { status: 'FAILED', count: counts.failureCount },
    ]
    return (
      <p>
        {entries
          .filter(({ count }) => count > 0)
          .map(
            ({ status, count }) =>
              `${t(`Manual grant result ${status}`)} ${count}`
          )
          .join(' · ')}
      </p>
    )
  }
  return (
    <p>
      {t(
        'Successful {{success}} · Failed {{failure}} · Issued {{points}} points',
        {
          success: props.plan.successCount,
          failure: props.plan.failureCount,
          points: props.plan.issuedPoints,
        }
      )}
    </p>
  )
}

function manualGrantRunningCounts(plan: CanvasManualGrantPlan) {
  const counts = [
    plan.pendingCount,
    plan.processingCount,
    plan.successCount,
    plan.failureCount,
  ]
  if (
    counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
    counts.reduce((total, count) => total + count, 0) !== plan.memberCount
  ) {
    return undefined
  }
  return {
    pendingCount: plan.pendingCount,
    processingCount: plan.processingCount,
    successCount: plan.successCount,
    failureCount: plan.failureCount,
  }
}

function BonusActivityDetail(props: {
  activity: Extract<CanvasActivityDetail, { ttlDays: number }>
  onBack: () => void
  onStop: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle>
            {props.activity.name} ·{' '}
            {t(activityStatusKey(props.activity.status))}
          </CardTitle>
          <Button type='button' variant='outline' onClick={props.onBack}>
            {t('Back to activity management')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>
        <p>
          {props.activity.type === 'RECHARGE_BONUS'
            ? t('Bonus per recharge code')
            : t('Bonus per new customer')}
          : {props.activity.points} {t('points')}
        </p>
        <p>
          {t('Bonus validity')}:{' '}
          {t('Valid for {{days}} days after credit', {
            days: props.activity.ttlDays,
          })}
        </p>
        <p>
          {t('Reason')}: {props.activity.reason}
        </p>
        <p>
          {t('Published at')}:{' '}
          {props.activity.publishedAt
            ? formatCanvasDateTime(props.activity.publishedAt)
            : '—'}
        </p>
        {props.activity.publisher ? (
          <p>
            {t('Published by')}:{' '}
            {props.activity.publisher.displayName ??
              props.activity.publisher.principalId}
          </p>
        ) : null}
        {props.activity.stoppedAt ? (
          <p>
            {t('Stopped at')}: {formatCanvasDateTime(props.activity.stoppedAt)}
          </p>
        ) : null}
        {props.activity.stoppedBy ? (
          <p>
            {t('Stopped by')}:{' '}
            {props.activity.stoppedBy.displayName ??
              props.activity.stoppedBy.principalId}
          </p>
        ) : null}
        {props.children}
        {props.activity.status === 'ACTIVE' ? (
          <div className='flex justify-end'>
            <Button type='button' variant='destructive' onClick={props.onStop}>
              {t('Disable activity')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function BonusActivityRecords(props: { activity: CanvasBonusActivity }) {
  return props.activity.type === 'RECHARGE_BONUS' ? (
    <RechargeBonusBindingRecords activityId={props.activity.id} />
  ) : (
    <InviteBonusGrantRecords activityId={props.activity.id} />
  )
}

function RechargeBonusBindingRecords(props: { activityId: string }) {
  const { t } = useTranslation()
  const navigation = useContext(ActivityRecordNavigationContext)
  const restored = activityRecordState<{
    search?: string
    pageIndex?: number
    pageSize?: number
    order?: string
    customer?: string
    redemptionStatus?: '' | 'UNREDEEMED' | 'REDEEMED'
    redeemedFrom?: string
    redeemedTo?: string
    sortId?:
      | 'rechargeOrderNumber'
      | 'amountMinor'
      | 'redemptionStatus'
      | 'bonusPoints'
      | 'customer'
      | 'redeemedAt'
    sortDesc?: boolean
  }>(navigation?.recordState, 'recharge')
  const table = useServerTableState<'rechargeOrderNumber'>(
    'rechargeOrderNumber',
    restored?.search
  )
  const [order, setOrder] = useState(restored?.order ?? '')
  const [customer, setCustomer] = useState(restored?.customer ?? '')
  const [redemptionStatus, setRedemptionStatus] = useState<
    '' | 'UNREDEEMED' | 'REDEEMED'
  >(restored?.redemptionStatus ?? '')
  const [redeemedFrom, setRedeemedFrom] = useState<Date | undefined>(
    restored?.redeemedFrom ? new Date(restored.redeemedFrom) : undefined
  )
  const [redeemedTo, setRedeemedTo] = useState<Date | undefined>(
    restored?.redeemedTo ? new Date(restored.redeemedTo) : undefined
  )
  const resetPage = () =>
    table.setPagination((current) => ({ ...current, pageIndex: 0 }))
  const restoredPage = useRef(false)
  useEffect(() => {
    if (!restored || restoredPage.current) return
    restoredPage.current = true
    table.setPagination({
      pageIndex: restored.pageIndex ?? 0,
      pageSize: restored.pageSize ?? 20,
    })
    if (restored.sortId) {
      table.setSorting([
        { id: restored.sortId, desc: restored.sortDesc ?? true },
      ])
    }
  }, [restored, table])
  useEffect(() => {
    navigation?.updateRecordState({
      kind: 'recharge',
      search: table.search,
      pageIndex: table.pagination.pageIndex,
      pageSize: table.pagination.pageSize,
      sortId: table.query.sortBy,
      sortDesc: table.query.sortOrder === 'desc',
      order,
      customer,
      redemptionStatus,
      ...(redeemedFrom ? { redeemedFrom: redeemedFrom.toISOString() } : {}),
      ...(redeemedTo ? { redeemedTo: redeemedTo.toISOString() } : {}),
    })
  }, [
    customer,
    navigation,
    order,
    redeemedFrom,
    redeemedTo,
    redemptionStatus,
    table.pagination.pageIndex,
    table.pagination.pageSize,
    table.search,
    table.query.sortBy,
    table.query.sortOrder,
  ])
  const records = useQuery({
    queryKey: [
      'canvas-cloud',
      'activity-recharge-bindings',
      props.activityId,
      table.query.page,
      table.query.pageSize,
      table.query.sortBy,
      table.query.sortOrder,
      order,
      customer,
      redemptionStatus,
      redeemedFrom?.toISOString(),
      redeemedTo?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasRechargeBonusBindings(
        props.activityId,
        {
          page: table.query.page,
          pageSize: table.query.pageSize,
          sortBy: table.query.sortBy,
          sortOrder: table.query.sortOrder,
          ...(order.trim() ? { order: order.trim() } : {}),
          ...(customer.trim() ? { customer: customer.trim() } : {}),
          ...(redemptionStatus ? { redemptionStatus } : {}),
          ...(redeemedFrom ? { redeemedFrom: redeemedFrom.toISOString() } : {}),
          ...(redeemedTo ? { redeemedTo: redeemedTo.toISOString() } : {}),
        },
        signal
      ),
    enabled: isCanvasDateRangeValid(redeemedFrom, redeemedTo),
    placeholderData: (previous) => previous,
  })
  const columns = useMemo<
    ColumnDef<CanvasRechargeBonusBindingRecord, unknown>[]
  >(
    () => [
      {
        id: 'rechargeOrderNumber',
        accessorKey: 'rechargeOrderNumber',
        meta: { label: t('Recharge order') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Recharge order')} />
        ),
        cell: ({ row }) =>
          row.original.redemptionStatus === 'REDEEMED' &&
          row.original.customerId ? (
            <ActivityRecordLink
              href={activityOrderHref(
                row.original.customerId,
                row.original.rechargeOrderId
              )}
              focusId={`recharge-order-${row.original.rechargeOrderId}`}
              className='text-primary font-mono hover:underline'
            >
              {row.original.rechargeOrderNumber}
            </ActivityRecordLink>
          ) : (
            row.original.rechargeOrderNumber
          ),
      },
      {
        id: 'amountMinor',
        accessorKey: 'amountMinor',
        meta: { label: t('Recharge amount') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Recharge amount')} />
        ),
        cell: ({ row }) => `¥${minorToCny(row.original.amountMinor)}`,
      },
      {
        id: 'redemptionStatus',
        accessorKey: 'redemptionStatus',
        meta: { label: t('Status') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        cell: ({ row }) =>
          row.original.redemptionStatus === 'REDEEMED'
            ? t('Redeemed')
            : t('Not redeemed'),
      },
      {
        id: 'bonusPoints',
        accessorKey: 'bonusPoints',
        meta: { label: t('Bonus points') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Bonus points')} />
        ),
        cell: ({ row }) => row.original.bonusPoints,
      },
      {
        id: 'customer',
        accessorKey: 'customer',
        meta: { label: t('Customer') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Customer')} />
        ),
        cell: ({ row }) => row.original.customer ?? '—',
      },
      {
        id: 'redeemedAt',
        accessorKey: 'redeemedAt',
        meta: { label: t('Redeemed at') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Redeemed at')} />
        ),
        cell: ({ row }) =>
          row.original.redeemedAt
            ? formatCanvasDateTime(row.original.redeemedAt)
            : '—',
      },
    ],
    [t]
  )
  return (
    <ActivityRecordTable
      title={t('Binding records')}
      table={table}
      data={records.data?.items ?? []}
      total={records.data?.total ?? 0}
      columns={columns}
      loading={records.isPending || records.isFetching}
      error={records.isError}
      onRetry={() => void records.refetch()}
      emptyTitle={t('No binding records')}
      filteredEmptyTitle={t('No binding records match the current filters')}
      getRowId={(item) => item.participationId}
      filters={
        <>
          <DataTableColumnFilterField label={t('Recharge order')}>
            <Input
              value={order}
              onChange={(event) => {
                setOrder(event.target.value)
                resetPage()
              }}
            />
          </DataTableColumnFilterField>
          <DataTableColumnFilterField label={t('Customer')}>
            <Input
              value={customer}
              onChange={(event) => {
                setCustomer(event.target.value)
                resetPage()
              }}
            />
          </DataTableColumnFilterField>
          <DataTableColumnFilterField label={t('Redemption status')}>
            <Select
              value={redemptionStatus || 'ALL'}
              onValueChange={(value) => {
                setRedemptionStatus(
                  value === 'ALL' ? '' : (value as 'UNREDEEMED' | 'REDEEMED')
                )
                resetPage()
              }}
            >
              <SelectTrigger
                className='w-full min-w-0'
                aria-label={t('Redemption status')}
              >
                <CanvasLocalizedSelectValue
                  value={redemptionStatus}
                  valueLabelKey={
                    redemptionStatus
                      ? redemptionStatusKey(redemptionStatus)
                      : undefined
                  }
                  emptyLabelKey='All statuses'
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                <SelectItem value='UNREDEEMED'>
                  {t(redemptionStatusKey('UNREDEEMED'))}
                </SelectItem>
                <SelectItem value='REDEEMED'>
                  {t(redemptionStatusKey('REDEEMED'))}
                </SelectItem>
              </SelectContent>
            </Select>
          </DataTableColumnFilterField>
          <DataTableColumnFilterField
            label={t('Redeemed at')}
            className='sm:col-span-2'
          >
            <CanvasDateRangeFilter
              from={redeemedFrom}
              to={redeemedTo}
              onFromChange={(value) => {
                setRedeemedFrom(value)
                resetPage()
              }}
              onToChange={(value) => {
                setRedeemedTo(value)
                resetPage()
              }}
            />
          </DataTableColumnFilterField>
        </>
      }
      hasActiveFilters={Boolean(
        order || customer || redemptionStatus || redeemedFrom || redeemedTo
      )}
      onReset={() => {
        setOrder('')
        setCustomer('')
        setRedemptionStatus('')
        setRedeemedFrom(undefined)
        setRedeemedTo(undefined)
        resetPage()
      }}
    />
  )
}

function InviteBonusGrantRecords(props: { activityId: string }) {
  const { t } = useTranslation()
  const navigation = useContext(ActivityRecordNavigationContext)
  const restored = activityRecordState<{
    search?: string
    pageIndex?: number
    pageSize?: number
    customer?: string
    issuedFrom?: string
    issuedTo?: string
    sortId?: 'customer' | 'inviteCodePrefix' | 'bonusPoints' | 'issuedAt'
    sortDesc?: boolean
  }>(navigation?.recordState, 'invite')
  const table = useServerTableState<'issuedAt'>('issuedAt', restored?.search)
  const [customer, setCustomer] = useState(restored?.customer ?? '')
  const [issuedFrom, setIssuedFrom] = useState<Date | undefined>(
    restored?.issuedFrom ? new Date(restored.issuedFrom) : undefined
  )
  const [issuedTo, setIssuedTo] = useState<Date | undefined>(
    restored?.issuedTo ? new Date(restored.issuedTo) : undefined
  )
  const [lotTarget, setLotTarget] = useState<{
    customerId: string
    pointLotId: string
  }>()
  const lotReturn = useRef<
    { scrollY: number; focus: HTMLButtonElement | null } | undefined
  >(undefined)
  const resetPage = () =>
    table.setPagination((current) => ({ ...current, pageIndex: 0 }))
  const restoredPage = useRef(false)
  useEffect(() => {
    if (!restored || restoredPage.current) return
    restoredPage.current = true
    table.setPagination({
      pageIndex: restored.pageIndex ?? 0,
      pageSize: restored.pageSize ?? 20,
    })
    if (restored.sortId) {
      table.setSorting([
        { id: restored.sortId, desc: restored.sortDesc ?? true },
      ])
    }
  }, [restored, table])
  useEffect(() => {
    navigation?.updateRecordState({
      kind: 'invite',
      search: table.search,
      pageIndex: table.pagination.pageIndex,
      pageSize: table.pagination.pageSize,
      sortId: table.query.sortBy,
      sortDesc: table.query.sortOrder === 'desc',
      customer,
      ...(issuedFrom ? { issuedFrom: issuedFrom.toISOString() } : {}),
      ...(issuedTo ? { issuedTo: issuedTo.toISOString() } : {}),
    })
  }, [
    customer,
    issuedFrom,
    issuedTo,
    navigation,
    table.pagination.pageIndex,
    table.pagination.pageSize,
    table.search,
    table.query.sortBy,
    table.query.sortOrder,
  ])
  const records = useQuery({
    queryKey: [
      'canvas-cloud',
      'activity-invite-grants',
      props.activityId,
      table.query.page,
      table.query.pageSize,
      table.query.sortBy,
      table.query.sortOrder,
      customer,
      issuedFrom?.toISOString(),
      issuedTo?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasInviteBonusGrants(
        props.activityId,
        {
          page: table.query.page,
          pageSize: table.query.pageSize,
          sortBy: table.query.sortBy,
          sortOrder: table.query.sortOrder,
          ...(customer.trim() ? { customer: customer.trim() } : {}),
          ...(issuedFrom ? { issuedFrom: issuedFrom.toISOString() } : {}),
          ...(issuedTo ? { issuedTo: issuedTo.toISOString() } : {}),
        },
        signal
      ),
    enabled: isCanvasDateRangeValid(issuedFrom, issuedTo),
    placeholderData: (previous) => previous,
  })
  const columns = useMemo<ColumnDef<CanvasInviteBonusGrantRecord, unknown>[]>(
    () => [
      {
        id: 'customer',
        accessorKey: 'customer',
        meta: { label: t('Customer') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Customer')} />
        ),
        cell: ({ row }) =>
          row.original.customerId ? (
            <ActivityRecordLink
              href={activityCustomerHref(
                row.original.customerId,
                row.original.pointLotId
              )}
              focusId={`invite-lot-${row.original.customerId}-${row.original.pointLotId}`}
            >
              {row.original.customer ?? row.original.customerId}
            </ActivityRecordLink>
          ) : (
            (row.original.customer ?? '—')
          ),
      },
      {
        id: 'inviteCodePrefix',
        accessorKey: 'inviteCodePrefix',
        meta: { label: t('Invite code') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Invite code')} />
        ),
      },
      {
        id: 'bonusPoints',
        accessorKey: 'bonusPoints',
        meta: { label: t('Bonus points') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Bonus points')} />
        ),
        cell: ({ row }) => row.original.bonusPoints,
      },
      {
        id: 'issuedAt',
        accessorKey: 'issuedAt',
        meta: { label: t('Credited at') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Credited at')} />
        ),
        cell: ({ row }) =>
          row.original.customerId && row.original.pointLotId ? (
            <Button
              type='button'
              variant='link'
              className='h-auto p-0'
              onClick={(event) => {
                lotReturn.current = {
                  scrollY: window.scrollY,
                  focus: event.currentTarget,
                }
                setLotTarget({
                  customerId: row.original.customerId as string,
                  pointLotId: row.original.pointLotId,
                })
              }}
            >
              {formatCanvasDateTime(row.original.issuedAt)}
            </Button>
          ) : (
            formatCanvasDateTime(row.original.issuedAt)
          ),
      },
    ],
    [t]
  )
  const closeLotDetails = () => {
    setLotTarget(undefined)
    requestAnimationFrame(() => {
      window.scrollTo({ top: lotReturn.current?.scrollY ?? 0 })
      lotReturn.current?.focus?.focus()
    })
  }
  return (
    <>
      <ActivityRecordTable
        title={t('Grant records')}
        table={table}
        data={records.data?.items ?? []}
        total={records.data?.total ?? 0}
        columns={columns}
        loading={records.isPending || records.isFetching}
        error={records.isError}
        onRetry={() => void records.refetch()}
        emptyTitle={t('No grant records')}
        filteredEmptyTitle={t('No grant records match the current filters')}
        getRowId={(item) => item.participationId}
        filters={
          <>
            <DataTableColumnFilterField label={t('Customer')}>
              <Input
                value={customer}
                onChange={(event) => {
                  setCustomer(event.target.value)
                  resetPage()
                }}
              />
            </DataTableColumnFilterField>
            <DataTableColumnFilterField
              label={t('Credited at')}
              className='sm:col-span-2'
            >
              <CanvasDateRangeFilter
                from={issuedFrom}
                to={issuedTo}
                onFromChange={(value) => {
                  setIssuedFrom(value)
                  resetPage()
                }}
                onToChange={(value) => {
                  setIssuedTo(value)
                  resetPage()
                }}
              />
            </DataTableColumnFilterField>
          </>
        }
        hasActiveFilters={Boolean(customer || issuedFrom || issuedTo)}
        onReset={() => {
          setCustomer('')
          setIssuedFrom(undefined)
          setIssuedTo(undefined)
          resetPage()
        }}
      />
      <Sheet
        open={Boolean(lotTarget)}
        onOpenChange={(open) => !open && closeLotDetails()}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('Point lot details')}</SheetTitle>
          </SheetHeader>
          {lotTarget ? (
            <div className='p-4'>
              <CustomerRecordDetails
                customerId={lotTarget.customerId}
                target={{ kind: 'lot', id: lotTarget.pointLotId }}
                onOpenOrder={(orderId) => {
                  window.location.assign(
                    activityOrderHref(lotTarget.customerId, orderId)
                  )
                }}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

function ActivityRecordTable<TData extends { participationId: string }>(props: {
  title: string
  table: CanvasServerTableState
  data: TData[]
  total: number
  columns: ColumnDef<TData, unknown>[]
  loading: boolean
  error: boolean
  onRetry: () => void
  emptyTitle: string
  filteredEmptyTitle: string
  getRowId: (item: TData) => string
  filters: ReactNode
  hasActiveFilters: boolean
  onReset: () => void
}) {
  return (
    <div className='space-y-3 border-t pt-4'>
      <h3 className='font-medium'>{props.title}</h3>
      <CanvasServerTable
        data={props.data}
        columns={props.columns}
        total={props.total}
        state={props.table}
        loading={props.loading}
        error={props.error}
        onRetry={props.onRetry}
        emptyTitle={props.emptyTitle}
        filteredEmptyTitle={props.filteredEmptyTitle}
        getRowId={props.getRowId}
        additionalFilters={props.filters}
        hasActiveFilters={props.hasActiveFilters}
        onResetFilters={props.onReset}
      />
    </div>
  )
}

function LimitedPriceActivityDetail(props: {
  activity: Extract<CanvasActivityDetail, { billingUnit: string }>
  onBack: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [stopOpen, setStopOpen] = useState(false)
  const stop = useMutation({
    mutationFn: () => cancelCanvasLimitedPricePromotion(props.activity.id),
    onSuccess: () => {
      setStopOpen(false)
      toast.success(t('Activity stopped'))
      void queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'activity', props.activity.id],
      })
      void queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'activities'],
      })
    },
    onError: () => toast.error(t('Unable to stop activity')),
  })
  const active =
    props.activity.status === 'NOT_STARTED' ||
    props.activity.status === 'ACTIVE'
  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle>
            {props.activity.name} ·{' '}
            {t(activityStatusKey(props.activity.status))}
          </CardTitle>
          <Button type='button' variant='outline' onClick={props.onBack}>
            {t('Back to activity management')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-4 text-sm'>
        <LimitedPriceSnapshot activity={props.activity} />
        <LimitedPriceTaskRecords activityId={props.activity.id} />
        {active ? (
          <div className='flex justify-end'>
            <Button
              type='button'
              variant='destructive'
              onClick={() => setStopOpen(true)}
            >
              {t('Stop activity')}
            </Button>
          </div>
        ) : null}
        <LimitedPriceStopDialog
          open={stopOpen}
          activity={props.activity}
          pending={stop.isPending}
          onOpenChange={setStopOpen}
          onConfirm={() => stop.mutate()}
        />
      </CardContent>
    </Card>
  )
}

function LimitedPriceStopDialog(props: {
  open: boolean
  activity: Extract<CanvasActivityDetail, { billingUnit: string }>
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const target = props.activity.target
  const specialPrice =
    props.activity.billingUnit === 'MILLION_TOKENS'
      ? Object.entries(props.activity.specialTokenRates ?? {})
          .map(
            ([category, value]) =>
              `${t(`Token category ${category}`)}: ${value}`
          )
          .join(' · ')
      : (props.activity.specialPoints ?? '—')
  const description =
    props.activity.status === 'NOT_STARTED'
      ? t('This activity will no longer take effect.')
      : t(
          'New quotes will use the applicable normal price. Accepted tasks retain their frozen special price.'
        )
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Stop activity')}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className='space-y-2 text-sm'>
          <p>
            {t('Activity name')}: {props.activity.name}
          </p>
          <p>
            {t('Applicable price')}:{' '}
            {target.customerModel.label ?? target.customerModel.id} ·{' '}
            {target.parameterCombination.label ??
              target.parameterCombination.id}{' '}
            · {target.priceGroup.label ?? target.priceGroup.id}
          </p>
          <p>
            {t('Special price')}: {specialPrice}
          </p>
        </div>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Back')}
          </Button>
          <Button
            type='button'
            variant='destructive'
            disabled={props.pending}
            onClick={props.onConfirm}
          >
            {t('Confirm stop')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LimitedPriceSnapshot(props: {
  activity: Extract<CanvasActivityDetail, { billingUnit: string }>
}) {
  const { t } = useTranslation()
  const target = props.activity.target
  const facts = (
    <>
      <p>
        {t('Applicable price')}:{' '}
        {target.customerModel.label ?? target.customerModel.id} ·{' '}
        {target.priceGroup.label ?? target.priceGroup.id} ·{' '}
        {target.parameterCombination.label ?? target.parameterCombination.id}
      </p>
      <p>
        {t('Reason')}: {props.activity.reason}
      </p>
      <p>
        {t('Published at')}:{' '}
        {props.activity.publishedAt
          ? formatCanvasDateTime(props.activity.publishedAt)
          : '—'}
      </p>
      {props.activity.publisher ? (
        <p>
          {t('Published by')}:{' '}
          {props.activity.publisher.displayName ??
            props.activity.publisher.principalId}
        </p>
      ) : null}
      {props.activity.stoppedAt ? (
        <p>
          {t('Stopped at')}: {formatCanvasDateTime(props.activity.stoppedAt)}
        </p>
      ) : null}
      {props.activity.stoppedBy ? (
        <p>
          {t('Stopped by')}:{' '}
          {props.activity.stoppedBy.displayName ??
            props.activity.stoppedBy.principalId}
        </p>
      ) : null}
    </>
  )
  if (props.activity.billingUnit !== 'MILLION_TOKENS') {
    return (
      <div className='space-y-1'>
        <p>
          {t('Billing unit')}: {t(props.activity.billingUnit)}
        </p>
        {facts}
        <p>
          {t('Original price')}: {props.activity.basePoints ?? '—'}{' '}
          {t('points')}
        </p>
        <p>
          {t('Special price')}: {props.activity.specialPoints ?? '—'}{' '}
          {t('points')}
        </p>
        <p>
          {t('Activity period')}:{' '}
          {formatCanvasDateTime(props.activity.startsAt)} —{' '}
          {formatCanvasDateTime(props.activity.endsAt)}
        </p>
      </div>
    )
  }
  return (
    <div className='space-y-2'>
      <p>{t('Points per million tokens')}</p>
      <TokenCategoryCostReferences
        references={props.activity.tokenCategoryCostReferences}
        historical
      />
      <p>
        {t('Activity period')}: {formatCanvasDateTime(props.activity.startsAt)}{' '}
        — {formatCanvasDateTime(props.activity.endsAt)}
      </p>
      {facts}
    </div>
  )
}

function LimitedPriceTaskRecords(props: { activityId: string }) {
  const { t } = useTranslation()
  const navigation = useContext(ActivityRecordNavigationContext)
  const restored = activityRecordState<{
    search?: string
    pageIndex?: number
    pageSize?: number
    task?: string
    customer?: string
    executionStatus?: string
    settlementProgress?: string
    acceptedFrom?: string
    acceptedTo?: string
    sortId?: 'customer' | 'taskId' | 'executionStatus' | 'settledPoints'
    sortDesc?: boolean
  }>(navigation?.recordState, 'limited-price')
  const table = useServerTableState<'customer'>('customer', restored?.search)
  const [task, setTask] = useState(restored?.task ?? '')
  const [customer, setCustomer] = useState(restored?.customer ?? '')
  const [executionStatus, setExecutionStatus] = useState(
    restored?.executionStatus ?? ''
  )
  const [settlementProgress, setSettlementProgress] = useState(
    restored?.settlementProgress ?? ''
  )
  const [acceptedFrom, setAcceptedFrom] = useState<Date | undefined>(
    restored?.acceptedFrom ? new Date(restored.acceptedFrom) : undefined
  )
  const [acceptedTo, setAcceptedTo] = useState<Date | undefined>(
    restored?.acceptedTo ? new Date(restored.acceptedTo) : undefined
  )
  const resetPage = () =>
    table.setPagination((current) => ({ ...current, pageIndex: 0 }))
  const restoredPage = useRef(false)
  useEffect(() => {
    if (!restored || restoredPage.current) return
    restoredPage.current = true
    table.setPagination({
      pageIndex: restored.pageIndex ?? 0,
      pageSize: restored.pageSize ?? 20,
    })
    if (restored.sortId) {
      table.setSorting([
        { id: restored.sortId, desc: restored.sortDesc ?? true },
      ])
    }
  }, [restored, table])
  useEffect(() => {
    navigation?.updateRecordState({
      kind: 'limited-price',
      search: table.search,
      pageIndex: table.pagination.pageIndex,
      pageSize: table.pagination.pageSize,
      sortId: table.query.sortBy,
      sortDesc: table.query.sortOrder === 'desc',
      task,
      customer,
      executionStatus,
      settlementProgress,
      ...(acceptedFrom ? { acceptedFrom: acceptedFrom.toISOString() } : {}),
      ...(acceptedTo ? { acceptedTo: acceptedTo.toISOString() } : {}),
    })
  }, [
    acceptedFrom,
    acceptedTo,
    customer,
    executionStatus,
    navigation,
    settlementProgress,
    table.pagination.pageIndex,
    table.pagination.pageSize,
    table.search,
    task,
    table.query.sortBy,
    table.query.sortOrder,
  ])
  const [target, setTarget] =
    useState<CanvasLimitedPriceParticipationTaskRecord>()
  const records = useQuery({
    queryKey: [
      'canvas-cloud',
      'activity-limited-price-tasks',
      props.activityId,
      table.query.page,
      table.query.pageSize,
      table.query.sortBy,
      table.query.sortOrder,
      task,
      customer,
      executionStatus,
      settlementProgress,
      acceptedFrom?.toISOString(),
      acceptedTo?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasLimitedPriceParticipationTasks(
        props.activityId,
        {
          page: table.query.page,
          pageSize: table.query.pageSize,
          sortBy: table.query.sortBy,
          sortOrder: table.query.sortOrder,
          ...(task.trim() ? { task: task.trim() } : {}),
          ...(customer.trim() ? { customer: customer.trim() } : {}),
          ...(executionStatus ? { executionStatus } : {}),
          ...(settlementProgress ? { settlementProgress } : {}),
          ...(acceptedFrom ? { acceptedFrom: acceptedFrom.toISOString() } : {}),
          ...(acceptedTo ? { acceptedTo: acceptedTo.toISOString() } : {}),
        },
        signal
      ),
    enabled: isCanvasDateRangeValid(acceptedFrom, acceptedTo),
    placeholderData: (previous) => previous,
  })
  const columns = useMemo<
    ColumnDef<CanvasLimitedPriceParticipationTaskRecord, unknown>[]
  >(
    () => [
      {
        id: 'customer',
        accessorKey: 'customer',
        meta: { label: t('Customer') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Customer')} />
        ),
        cell: ({ row }) => row.original.customer ?? row.original.customerId,
      },
      {
        id: 'taskId',
        accessorKey: 'taskId',
        meta: { label: t('Task') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Task')} />
        ),
        cell: ({ row }) =>
          row.original.taskId ? (
            <Button
              type='button'
              variant='link'
              className='h-auto p-0 font-mono'
              onClick={() => setTarget(row.original)}
            >
              {row.original.taskId}
            </Button>
          ) : (
            '—'
          ),
      },
      {
        id: 'executionStatus',
        accessorKey: 'executionStatus',
        meta: { label: t('Execution status') },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Execution status')}
          />
        ),
        cell: ({ row }) =>
          row.original.executionStatus
            ? t(executionStatusKey(row.original.executionStatus))
            : '—',
      },
      {
        id: 'settledPoints',
        accessorKey: 'settledPoints',
        meta: { label: t('Settled points') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Settled points')} />
        ),
        cell: ({ row }) => row.original.settledPoints ?? '—',
      },
    ],
    [t]
  )
  return (
    <>
      <div className='space-y-3 border-t pt-4'>
        <h3 className='font-medium'>{t('Participation tasks')}</h3>
        <CanvasServerTable
          data={records.data?.items ?? []}
          columns={columns}
          total={records.data?.total ?? 0}
          state={table}
          loading={records.isPending || records.isFetching}
          error={records.isError}
          onRetry={() => void records.refetch()}
          emptyTitle={t('No participation tasks')}
          filteredEmptyTitle={t(
            'No participation tasks match the current filters'
          )}
          getRowId={(item) => item.participationId}
          additionalFilters={
            <>
              <DataTableColumnFilterField label={t('Task')}>
                <Input
                  value={task}
                  onChange={(event) => {
                    setTask(event.target.value)
                    resetPage()
                  }}
                />
              </DataTableColumnFilterField>
              <DataTableColumnFilterField label={t('Customer')}>
                <Input
                  value={customer}
                  onChange={(event) => {
                    setCustomer(event.target.value)
                    resetPage()
                  }}
                />
              </DataTableColumnFilterField>
              <DataTableColumnFilterField label={t('Execution status')}>
                <Select
                  value={executionStatus || 'ALL'}
                  onValueChange={(value) => {
                    setExecutionStatus(value === 'ALL' ? '' : (value ?? ''))
                    resetPage()
                  }}
                >
                  <SelectTrigger
                    className='w-full min-w-0'
                    aria-label={t('Execution status')}
                  >
                    <CanvasLocalizedSelectValue
                      value={executionStatus}
                      valueLabelKey={
                        executionStatus
                          ? executionStatusKey(executionStatus)
                          : undefined
                      }
                      emptyLabelKey='All statuses'
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                    {[
                      'ACCEPTED',
                      'PROCESSING',
                      'SUCCEEDED',
                      'CONFIRMED_FAILED',
                      'UNKNOWN',
                    ].map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(executionStatusKey(value))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DataTableColumnFilterField>
              <DataTableColumnFilterField label={t('Settlement progress')}>
                <Select
                  value={settlementProgress || 'ALL'}
                  onValueChange={(value) => {
                    setSettlementProgress(value === 'ALL' ? '' : (value ?? ''))
                    resetPage()
                  }}
                >
                  <SelectTrigger
                    className='w-full min-w-0'
                    aria-label={t('Settlement progress')}
                  >
                    <CanvasLocalizedSelectValue
                      value={settlementProgress}
                      valueLabelKey={
                        settlementProgress
                          ? settlementProgressKey(settlementProgress)
                          : undefined
                      }
                      emptyLabelKey='All statuses'
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                    {[
                      'FROZEN',
                      'SETTLED',
                      'RELEASED_FAILED',
                      'RELEASED_TIMEOUT',
                    ].map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(settlementProgressKey(value))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DataTableColumnFilterField>
              <DataTableColumnFilterField
                label={t('Accepted at')}
                className='sm:col-span-2'
              >
                <CanvasDateRangeFilter
                  from={acceptedFrom}
                  to={acceptedTo}
                  onFromChange={(value) => {
                    setAcceptedFrom(value)
                    resetPage()
                  }}
                  onToChange={(value) => {
                    setAcceptedTo(value)
                    resetPage()
                  }}
                />
              </DataTableColumnFilterField>
            </>
          }
          hasActiveFilters={Boolean(
            task ||
            customer ||
            executionStatus ||
            settlementProgress ||
            acceptedFrom ||
            acceptedTo
          )}
          onResetFilters={() => {
            setTask('')
            setCustomer('')
            setExecutionStatus('')
            setSettlementProgress('')
            setAcceptedFrom(undefined)
            setAcceptedTo(undefined)
            resetPage()
          }}
        />
      </div>
      <TaskRecordDetailsSheet
        taskId={target?.taskId ?? undefined}
        onClose={() => setTarget(undefined)}
      />
    </>
  )
}

function CancelActivityDialog(props: {
  open: boolean
  plan: CanvasManualGrantPlan
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Cancel plan')}</DialogTitle>
          <DialogDescription>
            {t(
              'Cancellation prevents this scheduled grant from executing. Issued points are never reversed.'
            )}
          </DialogDescription>
        </DialogHeader>
        <p>
          {t('Activity name')}: {props.plan.name}
        </p>
        <p>
          {props.plan.schedule.mode === 'SCHEDULED'
            ? `${t('Scheduled time')}: ${formatCanvasDateTime(props.plan.schedule.scheduledAt)}`
            : t('Immediate grant')}
        </p>
        <p>
          {t('Uses your current time zone')}:{' '}
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </p>
        <p>
          {t(
            'Fixed membership {{count}} customers · Planned total {{points}} points',
            {
              count: props.plan.memberCount,
              points: plannedTotalPoints(
                props.plan.memberCount,
                props.plan.points
              ),
            }
          )}
        </p>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Back')}
          </Button>
          <Button
            type='button'
            variant='destructive'
            disabled={props.pending}
            onClick={props.onConfirm}
          >
            {t('Confirm cancellation')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StopActivityDialog(props: {
  open: boolean
  activity: Extract<CanvasActivityDetail, { ttlDays: number }>
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const binding =
    props.activity.type === 'RECHARGE_BONUS'
      ? t('recharge codes')
      : t('invite codes')
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Disable activity')}</DialogTitle>
          <DialogDescription>
            {t(
              'New {{binding}} cannot bind this activity. Existing bindings retain their saved entitlement.',
              { binding }
            )}
          </DialogDescription>
        </DialogHeader>
        <p>
          {t('Activity name')}: {props.activity.name}
        </p>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Back')}
          </Button>
          <Button
            type='button'
            variant='destructive'
            disabled={props.pending}
            onClick={props.onConfirm}
          >
            {t('Confirm disable')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EligibilityBasisSheet(props: {
  activityId: string
  member?: CanvasManualGrantMember
  onClose: () => void
}) {
  const { t } = useTranslation()
  const basis = useQuery({
    queryKey: [
      'canvas-cloud',
      'activity-eligibility-basis',
      props.activityId,
      props.member?.customerId,
    ],
    enabled: Boolean(props.member),
    queryFn: ({ signal }) =>
      getCanvasManualGrantEligibilityBasis(
        props.activityId,
        props.member?.customerId ?? '',
        signal
      ),
  })
  return (
    <Sheet
      open={Boolean(props.member)}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {t('Eligibility basis')}{' '}
            {props.member ? `· ${props.member.customer}` : ''}
          </SheetTitle>
        </SheetHeader>
        <div className='space-y-3 p-4 text-sm'>
          {basis.isPending ? <p>{t('Loading')}</p> : null}
          {basis.isError ? (
            <p role='alert'>{t('Unable to load eligibility basis')}</p>
          ) : null}
          {basis.data ? <EligibilityBasisContent basis={basis.data} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function EligibilityBasisContent(props: { basis: CanvasEligibilityBasis }) {
  const { t } = useTranslation()
  return (
    <>
      <p>
        {t('Checked at')}: {formatCanvasDateTime(props.basis.checkedAt)}
      </p>
      <p>
        {t('Qualifying recharge amount')}: ¥
        {minorToCny(props.basis.qualifyingAmountMinor)}
      </p>
      <div className='space-y-2'>
        {props.basis.orders.map((order) => (
          <div className='border-b pb-2' key={order.rechargeOrderId}>
            <p>{order.orderNumber}</p>
            <p className='text-muted-foreground'>
              {t('Original amount')}: ¥{minorToCny(order.originalAmountMinor)} ·{' '}
              {t('Returned reference')}: ¥
              {minorToCny(order.returnedReferenceAmountMinor)}
            </p>
            <p>
              {t('Qualifying amount')}: ¥
              {minorToCny(order.qualifyingAmountMinor)}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}

function minorToCny(value: string): string {
  const minor = BigInt(value)
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`
}

function plannedTotalPoints(memberCount: number, points: string): string {
  if (!/^\d+$/u.test(points) || memberCount < 0) return '—'
  return (BigInt(memberCount) * BigInt(points)).toString()
}

function cnyThresholdToMinor(value: string): string | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/u.exec(value.trim())
  if (!match?.[1]) return null
  const minor =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')
  return minor > 0n && minor <= 999_999_999_999_999_999n
    ? minor.toString()
    : null
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

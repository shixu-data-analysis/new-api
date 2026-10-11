/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { Select, SelectItem, SelectTrigger } from '@/components/ui/select'

import { getCanvasActivity, getCanvasActivities } from '../activity-api'
import {
  ActivityRecordNavigationContext,
  activityStatusKey,
} from '../activity-shared'
import type {
  CanvasActivity,
  CanvasActivityDetail,
  CanvasActivityStatus,
  CanvasActivityType,
  CanvasBonusActivity,
  CanvasManualGrantPlan,
} from '../activity-types'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import { useServerTableState } from '../use-server-table-state'
import { ActivityDetail } from './ActivityDetail'
import { ActivityForm, type CreateType } from './ActivityForm'
import { SelectContent } from './ActivityShared'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'

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

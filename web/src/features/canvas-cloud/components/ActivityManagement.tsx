/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ChevronDown, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectItem, SelectTrigger } from '@/components/ui/select'

import { getCanvasActivity, getCanvasActivities } from '../activity-api'
import {
  ActivityRecordNavigationContext,
  activityStatusKey,
} from '../activity-shared'
import type {
  CanvasActivity,
  CanvasActivityDetail,
  CanvasActivityPhase,
  CanvasActivityType,
  CanvasManualGrantPlan,
} from '../activity-types'
import { isCanvasDateRangeValid } from '../date-range'
import {
  formatCanvasDateTime,
  formatCanvasDateTimeMinutes,
} from '../formatters'
import { useServerTableState } from '../use-server-table-state'
import { ActivityDetail } from './ActivityDetail'
import { ActivityForm, type CreateType } from './ActivityForm'
import { SelectContent } from './ActivityShared'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { RegistrationRankActivityForm } from './RegistrationRankActivityForm'

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
  phase: CanvasActivityPhase | ''
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
  'REGISTRATION_RANK_BONUS',
  'TASK_PRICE_SPECIAL',
]

const activityPhases: CanvasActivityPhase[] = [
  'UPCOMING',
  'RUNNING',
  'ENDED',
  'CANCELLED',
]

const pointGrantTypes: CreateType[] = [
  'MANUAL_BONUS',
  'RECHARGE_BONUS',
  'INVITE_BONUS',
  'REGISTRATION_RANK_BONUS',
]

function activityPhaseKey(value: CanvasActivityPhase): string {
  return `Activity phase ${value}`
}

function activityDetailId(activity: CanvasActivityDetail): string {
  return 'activityId' in activity ? activity.activityId : activity.id
}

// The list groups every type into four phases; the type's own state follows in grey where it adds information.
function ActivityStatusCell(props: { activity: CanvasActivity }) {
  const { t } = useTranslation()
  const { activity } = props
  let note: string | null = null
  if (activity.status === 'WAITING' && activity.scheduledAt) {
    note = t('Scheduled {{time}}', {
      time: formatCanvasDateTimeMinutes(activity.scheduledAt),
    })
  } else if (
    activity.type === 'REGISTRATION_RANK_BONUS' &&
    activity.status === 'ACTIVE'
  ) {
    note = t('{{issued}} / {{total}} recipients', {
      issued: activity.recipientCount ?? '0',
      total: activity.recipientLimit ?? '0',
    })
  } else if (
    [
      'RUNNING',
      'COMPLETED',
      'PARTIAL_FAILED',
      'FAILED',
      'STOPPED',
      'FILLED',
      'EXPIRED',
    ].includes(activity.status)
  ) {
    note = t(activityStatusKey(activity.status))
  }
  return (
    <span>
      {t(activityPhaseKey(activity.phase))}
      {note ? <span className='text-muted-foreground'> · {note}</span> : null}
    </span>
  )
}

function CreateActivityMenu(props: {
  runningRankName?: string
  triggerRef: (element: HTMLElement | null) => void
  onCreate: (type: CreateType) => void
}) {
  const { t } = useTranslation()
  const item = (type: CreateType) => {
    const blocked =
      type === 'REGISTRATION_RANK_BONUS' && Boolean(props.runningRankName)
    return (
      <DropdownMenuItem
        key={type}
        disabled={blocked}
        className='flex-col items-start gap-0.5 py-1.5'
        onClick={() => props.onCreate(type)}
      >
        <span>{t(type)}</span>
        <span className='text-muted-foreground text-xs'>
          {blocked
            ? t('"{{name}}" is running; create a new one after it ends', {
                name: props.runningRankName,
              })
            : t(`Activity type description ${type}`)}
        </span>
      </DropdownMenuItem>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size='sm' ref={props.triggerRef} />}>
        <Plus aria-hidden='true' />
        {t('Create activity')}
        <ChevronDown aria-hidden='true' />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-72'>
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {t('Activity group point grants')}
          </DropdownMenuLabel>
          {pointGrantTypes.map(item)}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {t('Activity group price discounts')}
          </DropdownMenuLabel>
          {item('TASK_PRICE_SPECIAL')}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ActivityManagement(props: {
  titleActionSlot?: HTMLElement | null
}) {
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
  const [phase, setPhase] = useState<CanvasActivityPhase | ''>(
    returnContext?.phase ?? ''
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
      phase,
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
      phase,
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
          ...(phase ? { phase } : {}),
          ...(createdFrom ? { createdFrom: createdFrom.toISOString() } : {}),
          ...(createdTo ? { createdTo: createdTo.toISOString() } : {}),
        },
        signal
      ),
    enabled: isCanvasDateRangeValid(createdFrom, createdTo),
    placeholderData: (previous) => previous,
  })
  // Only one registration rank bonus may run; the create menu names it instead of offering a publish that would fail.
  const runningRank = useQuery({
    queryKey: ['canvas-cloud', 'activities', 'running-registration-rank'],
    queryFn: ({ signal }) =>
      getCanvasActivities(
        {
          page: 1,
          pageSize: 10,
          type: 'REGISTRATION_RANK_BONUS',
          phase: 'RUNNING',
          sortBy: 'createdAt',
          sortOrder: 'desc',
        },
        signal
      ),
    enabled: view.kind === 'list',
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
        cell: ({ row }) => <ActivityStatusCell activity={row.original} />,
      },
    ],
    [t]
  )

  if (view.kind === 'create' && view.type === 'REGISTRATION_RANK_BONUS') {
    return (
      <RegistrationRankActivityForm
        onBack={returnToList}
        onSaved={(activity) =>
          setView({
            kind: 'detail',
            activityId: activity.id,
            initialDetail: activity,
          })
        }
      />
    )
  }
  if (view.kind === 'create') {
    return (
      <ActivityForm
        type={view.type}
        onBack={returnToList}
        onSaved={(activity) =>
          setView({
            kind: 'detail',
            activityId: activityDetailId(activity),
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
            activityId: activityDetailId(activity),
            initialDetail: activity,
          })
        }
      />
    )
  }
  return (
    <div className='space-y-4'>
      {props.titleActionSlot
        ? createPortal(
            <CreateActivityMenu
              runningRankName={runningRank.data?.items[0]?.name}
              triggerRef={(element) => {
                listFocusElements.current['create-activity'] = element
              }}
              onCreate={(createType) => {
                rememberListPosition('create-activity')
                setView({ kind: 'create', type: createType })
              }}
            />,
            props.titleActionSlot
          )
        : null}
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
                value={phase || 'ALL'}
                onValueChange={(value) => {
                  setPhase(
                    value === 'ALL' ? '' : (value as CanvasActivityPhase)
                  )
                  resetPage()
                }}
              >
                <SelectTrigger
                  className='w-full min-w-0'
                  aria-label={t('Activity status')}
                >
                  <CanvasLocalizedSelectValue
                    value={phase}
                    valueLabelKey={phase ? activityPhaseKey(phase) : undefined}
                    emptyLabelKey='All activity statuses'
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>
                    {t('All activity statuses')}
                  </SelectItem>
                  {activityPhases.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(activityPhaseKey(value))}
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
        hasActiveFilters={Boolean(type || phase || createdFrom || createdTo)}
        activeFilterCount={
          [table.search, type, phase, createdFrom, createdTo].filter(Boolean)
            .length
        }
        onResetFilters={() => {
          setType('')
          setPhase('')
          setCreatedFrom(undefined)
          setCreatedTo(undefined)
          resetPage()
        }}
      />
    </div>
  )
}

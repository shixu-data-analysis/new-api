/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { DataTableRow } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { MultiSelect } from '@/components/multi-select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { TableCell, TableRow } from '@/components/ui/table'

import {
  getCanvasExecutionCapacity,
  getCanvasExecutionWaitDetail,
  getCanvasExecutionWaits,
} from '../execution-api'
import type {
  ExecutionCapacityItem,
  ExecutionCapacityFilterStatus,
  ExecutionCapacityStatus,
  ExecutionResultPositionState,
  ExecutionWaitItem,
  ExecutionWaitRequestState,
} from '../execution-types'
import type { CanvasAdminTaskLogQuery } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'
import { ModelIdentityTooltip } from './ModelIdentityTooltip'

const refreshIntervalMs = 10_000
const filterStatuses: ExecutionCapacityFilterStatus[] = [
  'AVAILABLE',
  'INSTANCE_CONCURRENCY_FULL',
  'GROUP_REQUEST_CONCURRENCY_FULL',
  'ASYNC_IN_FLIGHT_FULL',
  'QUERY_CAPACITY_RESERVED',
  'REQUEST_RATE_LIMITED',
  'TOKEN_RATE_LIMITED',
  'DATA_INVARIANT',
  'EXECUTOR_UNAVAILABLE',
]
const statusKeys: Record<ExecutionCapacityStatus, string> = {
  AVAILABLE: 'Available capacity',
  REQUEST_CONCURRENCY_FULL: 'Request concurrency full',
  INSTANCE_CONCURRENCY_FULL: 'Executor instance concurrency full',
  GROUP_REQUEST_CONCURRENCY_FULL: 'API Key group request concurrency full',
  ASYNC_IN_FLIGHT_FULL: 'Upstream unfinished asynchronous tasks full',
  QUERY_CAPACITY_RESERVED: 'Reserving capacity for result queries',
  REQUEST_RATE_LIMITED: 'Request rate limited',
  TOKEN_RATE_LIMITED: 'Token quota limited',
  DATA_INVARIANT: 'Capacity data anomaly',
  MULTIPLE_LIMITS: 'Multiple capacity limits reached',
  EXECUTOR_UNAVAILABLE: 'Executor unavailable',
}
const requestKeys: Record<ExecutionWaitRequestState, string> = {
  NOT_SENT: 'Not sent',
  MAY_HAVE_BEEN_SENT: 'May have been sent',
  ACCEPTED_BY_PROVIDER: 'Accepted by provider',
}
const positionKeys: Record<ExecutionResultPositionState, string> = {
  WAITING: 'Result position waiting',
  RUNNING: 'Result position generating',
  SUCCEEDED: 'Result position completed',
  FAILED: 'Result position failed',
}
const positionVariants: Record<
  ExecutionResultPositionState,
  'outline' | 'secondary' | 'destructive'
> = {
  WAITING: 'outline',
  RUNNING: 'secondary',
  SUCCEEDED: 'secondary',
  FAILED: 'destructive',
}
type Translate = (key: string, options?: Record<string, unknown>) => string
const statusLabel = (value: string, t: Translate) =>
  t(
    value === 'MULTIPLE_LIMITS'
      ? 'Unknown capacity status'
      : (statusKeys[value as ExecutionCapacityStatus] ??
          'Unknown capacity status')
  )
const requestLabel = (value: string, t: Translate) =>
  t(requestKeys[value as ExecutionWaitRequestState] ?? 'Unknown request status')

/**
 * Task-log filters of the unconfirmed-result links; a group narrows the "cannot be queried" link to that API Key group.
 * Tasks whose points were already released are left out by the billing status filter, shown as a removable chip.
 */
// oxlint-disable-next-line react/only-export-components -- shared with the link tests
export function unconfirmedTaskLogSearch(
  upstreamTask: NonNullable<CanvasAdminTaskLogQuery['upstreamTask']>,
  credentialGroupId?: string
) {
  return {
    derivedExecutionStatus: 'UNKNOWN' as const,
    billingStatus: 'FROZEN' as const,
    upstreamTask,
    ...(credentialGroupId ? { credentialGroupId } : {}),
  }
}

/** A number that opens the task log with the filters that produced it; zero is shown without a link. */
export function TaskLogCountLink(props: {
  count: number
  search: Pick<
    CanvasAdminTaskLogQuery,
    | 'derivedExecutionStatus'
    | 'upstreamTask'
    | 'credentialGroupId'
    | 'failureReason'
    | 'from'
  >
  label?: string
  children?: ReactNode
}) {
  if (props.count === 0) {
    return <span className='tabular-nums'>{props.children ?? 0}</span>
  }
  return (
    <Link
      to='/canvas-cloud/$section'
      params={{ section: 'task-logs' }}
      search={props.search as never}
      className='text-primary tabular-nums underline underline-offset-4'
      aria-label={props.label}
      title={props.label}
    >
      {props.children ?? props.count}
    </Link>
  )
}

function errorKey(error: unknown, fallback: string) {
  const status =
    typeof error === 'object' && error !== null && 'response' in error
      ? (error.response as { status?: number } | undefined)?.status
      : undefined
  if (status === 401) return 'Your session has expired. Sign in again.'
  if (status === 403) {
    return 'You do not have permission to view execution capacity.'
  }
  return fallback
}

function LocalizedTime({ value, now }: { value: string; now: Date }) {
  const { i18n } = useTranslation()
  const date = new Date(value)
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  return (
    <time dateTime={value}>
      {new Intl.DateTimeFormat(i18n.language, {
        ...(sameDay ? {} : { year: 'numeric', month: 'short', day: 'numeric' }),
        hour: '2-digit',
        minute: '2-digit',
      }).format(date)}
    </time>
  )
}

function WaitingDuration({ startedAt, now }: { startedAt: string; now: Date }) {
  const { t } = useTranslation()
  const { hours, minutes } = executionWaitDurationParts(startedAt, now)
  if (hours === 0) {
    return (
      <span className='tabular-nums'>
        {t('{{value}} min', { value: minutes })}
      </span>
    )
  }
  return (
    <span className='tabular-nums'>
      {t('{{hours}} hr {{minutes}} min', { hours, minutes })}
    </span>
  )
}

// oxlint-disable-next-line react/only-export-components -- exported for deterministic duration boundary tests
export function executionWaitDurationParts(startedAt: string, now: Date) {
  const totalMinutes = Math.max(
    0,
    Math.floor((now.getTime() - new Date(startedAt).getTime()) / 60_000)
  )
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return { hours, minutes }
}

export function ExecutionCapacityOverview() {
  const { t } = useTranslation()
  const capacityTable = useServerTableState<'provider' | 'credentialGroup'>(
    'provider',
    '',
    false
  )
  const [providerId, setProviderId] = useState('')
  const [statuses, setStatuses] = useState<ExecutionCapacityFilterStatus[]>([])
  const [waiting, setWaiting] = useState<
    '' | 'WITH_WAITING' | 'WITHOUT_WAITING'
  >('')
  const [drawerGroup, setDrawerGroup] = useState<ExecutionCapacityItem>()
  const drawerTrigger = useRef<HTMLButtonElement | null>(null)
  const capacity = useQuery({
    queryKey: [
      'canvas-cloud',
      'execution',
      'capacity',
      capacityTable.query,
      providerId,
      statuses,
      waiting,
    ],
    queryFn: ({ signal }) =>
      getCanvasExecutionCapacity(
        {
          page: capacityTable.query.page,
          pageSize: capacityTable.query.pageSize,
          sortBy: capacityTable.query.sortBy,
          sortOrder: capacityTable.query.sortOrder,
          ...(providerId ? { providerId } : {}),
          ...(capacityTable.query.search
            ? { credentialGroup: capacityTable.query.search }
            : {}),
          ...(statuses.length ? { status: statuses } : {}),
          ...(waiting ? { waiting } : {}),
        },
        signal
      ),
    placeholderData: keepPreviousData,
    refetchInterval: refreshIntervalMs,
  })
  useEffect(() => {
    if (!capacity.data || capacity.isPlaceholderData) return
    const finalPage = Math.max(
      1,
      Math.ceil(capacity.data.total / capacity.data.pageSize)
    )
    if (capacityTable.query.page > finalPage) {
      capacityTable.setPagination((value) => ({
        ...value,
        pageIndex: finalPage - 1,
      }))
    }
  }, [capacity.data, capacity.isPlaceholderData, capacityTable])
  // The drawer heading follows the row's latest counts while the drawer is open.
  const liveDrawerGroup = drawerGroup
    ? (capacity.data?.items.find(
        (item) => item.credentialGroupId === drawerGroup.credentialGroupId
      ) ?? drawerGroup)
    : undefined
  const capacityColumns: ColumnDef<ExecutionCapacityItem, unknown>[] = [
    {
      id: 'provider',
      accessorKey: 'providerName',
      header: t('Service provider'),
      enableHiding: false,
      cell: ({ row }) => (
        <span className='break-words'>{row.original.providerName}</span>
      ),
    },
    {
      id: 'credentialGroup',
      accessorKey: 'credentialGroupName',
      header: t('API Key group'),
      enableHiding: false,
      cell: ({ row }) => (
        <span className='break-words'>{row.original.credentialGroupName}</span>
      ),
    },
    {
      id: 'requests',
      accessorFn: (item) => item.requestConcurrency.used,
      header: t('Group request concurrency'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {row.original.requestConcurrency.used} /{' '}
          {row.original.requestConcurrency.limit}
        </span>
      ),
    },
    {
      id: 'async',
      accessorFn: (item) => item.asyncInFlight.used,
      header: t('Upstream unfinished asynchronous tasks'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {row.original.asyncInFlight.used} / {row.original.asyncInFlight.limit}
        </span>
      ),
    },
    {
      id: 'waiting',
      accessorKey: 'waitingTasks',
      header: t('Waiting tasks'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='tabular-nums'>{row.original.waitingTasks}</span>
      ),
    },
    {
      id: 'unqueryableUnconfirmed',
      accessorKey: 'unqueryableUnconfirmedTasks',
      header: t('Unconfirmed, cannot be queried'),
      enableSorting: false,
      cell: ({ row }) => (
        <TaskLogCountLink
          count={row.original.unqueryableUnconfirmedTasks}
          search={unconfirmedTaskLogSearch(
            'absent',
            row.original.credentialGroupId
          )}
          label={t(
            '{{group}}: {{count}} unconfirmed tasks that cannot be queried',
            {
              group: row.original.credentialGroupName,
              count: row.original.unqueryableUnconfirmedTasks,
            }
          )}
        />
      ),
    },
    {
      id: 'status',
      header: t('Status'),
      size: 256,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const item = row.original
        let reasons: string[]
        if (item.reasons) {
          reasons = item.reasons.length > 0 ? item.reasons : ['AVAILABLE']
        } else if (item.status === 'MULTIPLE_LIMITS') {
          reasons = []
        } else {
          reasons = [item.status]
        }
        if (reasons.length === 0 && item.status === 'MULTIPLE_LIMITS') {
          return <Badge variant='outline'>{t('Unknown capacity status')}</Badge>
        }
        return (
          <div className='flex flex-wrap gap-1'>
            {reasons.map((reason) => (
              <Badge key={reason} variant='outline'>
                {statusLabel(reason, t)}
              </Badge>
            ))}
          </div>
        )
      },
    },
    {
      id: 'actions',
      header: t('Actions'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) =>
        row.original.waitingTasks > 0 ? (
          <Button
            variant='link'
            onClick={(event) => {
              drawerTrigger.current = event.currentTarget
              setDrawerGroup(row.original)
            }}
          >
            {t('View waiting tasks')}
          </Button>
        ) : (
          '—'
        ),
    },
  ]
  const unconfirmed = capacity.data?.unconfirmed

  return (
    <section className='space-y-4' aria-labelledby='execution-capacity-title'>
      <Card>
        <CardHeader>
          <CardTitle id='execution-capacity-title'>
            {t('API Key group live capacity')}
          </CardTitle>
          <CardDescription>
            {t(
              'The table shows API Key group usage, not executor instance usage. Each request needs both an instance slot and a group slot; even when the group has free capacity, a task may wait because instance concurrency is full.'
            )}
          </CardDescription>
          {unconfirmed ? (
            <p className='text-sm' data-testid='unconfirmed-summary'>
              <Trans
                i18nKey='Results pending confirmation: <queryable>{{queryable}}</queryable> still being queried at the provider, <unqueryable>{{unqueryable}}</unqueryable> cannot be queried and are refunded at expiry'
                values={{
                  queryable: unconfirmed.queryableTasks,
                  unqueryable: unconfirmed.unqueryableTasks,
                }}
                components={{
                  queryable: (
                    <TaskLogCountLink
                      count={unconfirmed.queryableTasks}
                      search={unconfirmedTaskLogSearch('present')}
                    />
                  ),
                  unqueryable: (
                    <TaskLogCountLink
                      count={unconfirmed.unqueryableTasks}
                      search={unconfirmedTaskLogSearch('absent')}
                    />
                  ),
                }}
              />
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          <CanvasServerTable
            data={capacity.data?.items ?? []}
            columns={capacityColumns}
            total={capacity.data?.total ?? 0}
            state={capacityTable}
            loading={capacity.isPending && !capacity.data}
            error={capacity.isError}
            errorTitle={t(
              errorKey(capacity.error, 'Unable to load execution capacity')
            )}
            onRetry={() => void capacity.refetch()}
            emptyTitle={t('No execution capacity records')}
            filteredEmptyTitle={t('No matching results')}
            searchLabel={t('API Key group')}
            hasActiveFilters={Boolean(providerId || statuses.length || waiting)}
            activeFilterCount={
              Number(Boolean(providerId)) +
              Number(Boolean(statuses.length)) +
              Number(Boolean(waiting))
            }
            onResetFilters={() => {
              setProviderId('')
              setStatuses([])
              setWaiting('')
              capacityTable.setPagination((value) => ({
                ...value,
                pageIndex: 0,
              }))
            }}
            additionalFilters={
              <>
                <DataTableColumnFilterField label={t('Service provider')}>
                  <NativeSelect
                    aria-label={t('Service provider')}
                    value={providerId}
                    onChange={(event) => {
                      setProviderId(event.target.value)
                      capacityTable.setPagination((value) => ({
                        ...value,
                        pageIndex: 0,
                      }))
                    }}
                  >
                    <NativeSelectOption value=''>
                      {t('All service providers')}
                    </NativeSelectOption>
                    {(capacity.data?.providers ?? []).map((provider) => (
                      <NativeSelectOption key={provider.id} value={provider.id}>
                        {provider.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </DataTableColumnFilterField>
                <DataTableColumnFilterField label={t('Status')}>
                  <MultiSelect
                    options={filterStatuses.map((value) => ({
                      value,
                      label: statusLabel(value, t),
                    }))}
                    selected={statuses}
                    onChange={(values) => {
                      setStatuses(values as ExecutionCapacityFilterStatus[])
                      capacityTable.setPagination((value) => ({
                        ...value,
                        pageIndex: 0,
                      }))
                    }}
                    placeholder={t('All capacity statuses')}
                    maxVisibleChips={2}
                    renderSelectedSummary={(values) =>
                      t('Selected statuses ({{count}})', {
                        count: values.length,
                      })
                    }
                  />
                </DataTableColumnFilterField>
                <DataTableColumnFilterField label={t('Waiting tasks')}>
                  <NativeSelect
                    aria-label={t('Waiting tasks')}
                    value={waiting}
                    onChange={(event) => {
                      setWaiting(event.target.value as typeof waiting)
                      capacityTable.setPagination((value) => ({
                        ...value,
                        pageIndex: 0,
                      }))
                    }}
                  >
                    <NativeSelectOption value=''>
                      {t('All waiting tasks')}
                    </NativeSelectOption>
                    <NativeSelectOption value='WITH_WAITING'>
                      {t('With waiting tasks')}
                    </NativeSelectOption>
                    <NativeSelectOption value='WITHOUT_WAITING'>
                      {t('Without waiting tasks')}
                    </NativeSelectOption>
                  </NativeSelect>
                </DataTableColumnFilterField>
              </>
            }
            getRowId={(item) => item.credentialGroupId}
            hideMobile
          />
        </CardContent>
      </Card>
      <WaitingTasksDrawer
        key={liveDrawerGroup?.credentialGroupId ?? 'closed'}
        group={liveDrawerGroup}
        finalFocus={drawerTrigger}
        onClose={() => setDrawerGroup(undefined)}
      />
    </section>
  )
}

/**
 * The waiting tasks of one API Key group, in a drawer as wide as the task-record details. A row expands in place to show
 * each result of the task and its request state; one row is expanded at a time.
 */
function WaitingTasksDrawer(props: {
  group?: ExecutionCapacityItem
  finalFocus: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const table = useServerTableState<'startedAt'>('startedAt')
  const [expandedTaskId, setExpandedTaskId] = useState<string>()
  const now = new Date()
  const groupId = props.group?.credentialGroupId
  const waits = useQuery({
    queryKey: [
      'canvas-cloud',
      'execution',
      'waits',
      groupId,
      table.query.page,
      table.query.pageSize,
    ],
    queryFn: ({ signal }) =>
      getCanvasExecutionWaits(
        {
          credentialGroupId: groupId,
          page: table.query.page,
          pageSize: table.query.pageSize,
        },
        signal
      ),
    enabled: Boolean(groupId),
    refetchInterval: refreshIntervalMs,
  })
  const detail = useQuery({
    queryKey: ['canvas-cloud', 'execution', 'wait', expandedTaskId],
    queryFn: ({ signal }) =>
      getCanvasExecutionWaitDetail(expandedTaskId ?? '', signal),
    enabled: Boolean(expandedTaskId),
    refetchInterval: refreshIntervalMs,
  })
  useEffect(() => {
    if (!waits.data || waits.data.total === 0) return
    const finalPage = Math.ceil(waits.data.total / waits.data.pageSize)
    if (table.query.page > finalPage) {
      table.setPagination((value) => ({ ...value, pageIndex: finalPage - 1 }))
    }
  }, [table, waits.data])
  const toggle = (taskId: string) =>
    setExpandedTaskId((current) => (current === taskId ? undefined : taskId))
  const columns: ColumnDef<ExecutionWaitItem, unknown>[] = [
    {
      id: 'task',
      accessorKey: 'effectiveDisplayName',
      header: t('Task'),
      enableSorting: false,
      cell: ({ row }) => (
        <div className='min-w-0 space-y-1'>
          <div className='break-words'>
            {row.original.effectiveDisplayName}
            <ModelIdentityTooltip
              effectiveDisplayName={row.original.effectiveDisplayName}
              catalogDefaultName={row.original.catalogDefaultName}
              modelKey={row.original.modelKey}
              upstreamModelId={row.original.upstreamModelId}
            />
          </div>
          <div className='text-muted-foreground font-mono text-xs break-all'>
            {row.original.taskId}
          </div>
        </div>
      ),
    },
    {
      id: 'waitingOutputs',
      header: t('Waiting results'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {row.original.waitingOutputs} / {row.original.totalOutputs}
        </span>
      ),
    },
    {
      id: 'blocking',
      header: t('Blocking reason'),
      enableSorting: false,
      cell: ({ row }) =>
        t('{{reason}} ({{observed}} / {{limit}})', {
          reason: statusLabel(row.original.blockingStatus, t),
          observed: row.original.observedValue,
          limit: row.original.limitValue,
        }),
    },
    {
      id: 'timing',
      header: t('Wait and next attempt'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='space-x-2'>
          <WaitingDuration startedAt={row.original.startedAt} now={now} />
          <span>·</span>
          <LocalizedTime value={row.original.nextAttemptAt} now={now} />
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('Actions'),
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant='outline'
          aria-expanded={expandedTaskId === row.original.taskId}
          onClick={(event) => {
            event.stopPropagation()
            toggle(row.original.taskId)
          }}
        >
          {expandedTaskId === row.original.taskId
            ? t('Collapse')
            : t('Details')}
        </Button>
      ),
    },
  ]
  const group = props.group
  return (
    <Sheet
      open={Boolean(group)}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <SheetContent
        className={sideDrawerContentClassName('max-w-none sm:!max-w-[720px]')}
        finalFocus={props.finalFocus}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>
            {t('Waiting tasks · {{group}}', {
              group: group?.credentialGroupName ?? '',
            })}
          </SheetTitle>
          {group ? (
            <SheetDescription className='tabular-nums'>
              {t(
                'Simultaneous requests {{requestsUsed}}/{{requestsLimit}} · In progress at the provider {{asyncUsed}}/{{asyncLimit}} · Waiting tasks {{waiting}}',
                {
                  requestsUsed: group.requestConcurrency.used,
                  requestsLimit: group.requestConcurrency.limit,
                  asyncUsed: group.asyncInFlight.used,
                  asyncLimit: group.asyncInFlight.limit,
                  waiting: group.waitingTasks,
                }
              )}
            </SheetDescription>
          ) : null}
        </SheetHeader>
        <div className={sideDrawerFormClassName()}>
          <CanvasServerTable
            data={waits.data?.items ?? []}
            columns={columns}
            total={waits.data?.total ?? 0}
            state={table}
            loading={waits.isPending}
            error={waits.isError}
            errorTitle={t(
              errorKey(waits.error, 'Unable to load waiting tasks')
            )}
            onRetry={() => void waits.refetch()}
            emptyTitle={t('No waiting tasks')}
            getRowId={(item) => item.taskId}
            hideMobile
            renderRow={(row) => (
              <Fragment key={row.id}>
                <DataTableRow
                  row={row}
                  cellRenderColumns={columns}
                  aria-expanded={expandedTaskId === row.original.taskId}
                  className='cursor-pointer'
                  onClick={() => toggle(row.original.taskId)}
                />
                {expandedTaskId === row.original.taskId ? (
                  <TableRow>
                    <TableCell
                      colSpan={row.getVisibleCells().length}
                      className='bg-muted/20 p-4'
                    >
                      <WaitDetails
                        loading={detail.isPending}
                        failed={detail.isError}
                        error={detail.error}
                        onRetry={() => void detail.refetch()}
                        positions={detail.data?.positions}
                        item={detail.data ?? row.original}
                        now={now}
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            )}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function WaitDetails(props: {
  loading: boolean
  failed: boolean
  error: unknown
  onRetry: () => void
  positions?: Array<{
    outputIndex: number
    state: ExecutionResultPositionState
  }>
  item: ExecutionWaitItem
  now: Date
}) {
  const { t } = useTranslation()
  if (props.failed) {
    return (
      <div role='alert' className='space-y-2 text-sm'>
        <p>{t(errorKey(props.error, 'Unable to load waiting task details'))}</p>
        <Button variant='outline' onClick={props.onRetry}>
          {t('Retry')}
        </Button>
      </div>
    )
  }
  return (
    <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm'>
      <dt className='text-muted-foreground'>{t('Each result')}</dt>
      <dd>
        {props.positions ? (
          <ul className='flex flex-wrap gap-1' aria-label={t('Each result')}>
            {props.positions.map((position) => (
              <li key={position.outputIndex}>
                <Badge
                  variant={positionVariants[position.state] ?? 'outline'}
                  aria-label={t('Result {{position}}: {{state}}', {
                    position: position.outputIndex + 1,
                    state: t(
                      positionKeys[position.state] ?? 'Unknown result state'
                    ),
                  })}
                >
                  {t(positionKeys[position.state] ?? 'Unknown result state')}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <span className='text-muted-foreground'>
            {props.loading ? t('Loading') : '—'}
          </span>
        )}
      </dd>
      <dt className='text-muted-foreground'>{t('Request status')}</dt>
      <dd>{requestLabel(props.item.requestState, t)}</dd>
      <dt className='text-muted-foreground'>{t('Time waiting')}</dt>
      <dd>
        <WaitingDuration startedAt={props.item.startedAt} now={props.now} />
      </dd>
      <dt className='text-muted-foreground'>{t('Next attempt')}</dt>
      <dd>
        <LocalizedTime value={props.item.nextAttemptAt} now={props.now} />
      </dd>
    </dl>
  )
}

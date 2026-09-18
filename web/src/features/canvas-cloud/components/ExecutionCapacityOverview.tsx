/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import {
  getCanvasExecutionCapacity,
  getCanvasExecutionWaitDetail,
  getCanvasExecutionWaits,
} from '../execution-api'
import type {
  ExecutionCapacityItem,
  ExecutionCapacityFilterStatus,
  ExecutionCapacityStatus,
  ExecutionWaitItem,
  ExecutionWaitRequestState,
} from '../execution-types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'

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
const stageLabel = (value: string, t: Translate) => {
  if (value === 'SUBMIT') return t('Submit')
  if (value === 'QUERY') return t('Query stage')
  return t('Unknown waiting stage')
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
  const table = useServerTableState<'startedAt'>('startedAt')
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
  const [groupId, setGroupId] = useState<string>()
  const [taskId, setTaskId] = useState<string>()
  const detailTrigger = useRef<HTMLButtonElement | null>(null)
  const now = new Date()
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
    queryKey: ['canvas-cloud', 'execution', 'wait', taskId],
    queryFn: ({ signal }) => getCanvasExecutionWaitDetail(taskId ?? '', signal),
    enabled: Boolean(taskId),
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
  useEffect(() => {
    if (!waits.data || waits.data.total === 0) return
    const finalPage = Math.ceil(waits.data.total / waits.data.pageSize)
    if (table.query.page > finalPage) {
      table.setPagination((value) => ({ ...value, pageIndex: finalPage - 1 }))
    }
  }, [table, waits.data])
  const selectGroup = (id: string) => {
    setGroupId(id)
    setTaskId(undefined)
    detailTrigger.current = null
    table.setPagination((value) => ({ ...value, pageIndex: 0 }))
  }
  const openDetail = (item: ExecutionWaitItem, trigger: HTMLButtonElement) => {
    detailTrigger.current = trigger
    setTaskId(item.taskId)
  }
  const closeDetail = () => {
    setTaskId(undefined)
  }
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
            onClick={() => selectGroup(row.original.credentialGroupId)}
          >
            {t('View waiting tasks')}
          </Button>
        ) : (
          '—'
        ),
    },
  ]
  const waitColumns: ColumnDef<ExecutionWaitItem, unknown>[] = [
    {
      id: 'task',
      accessorKey: 'modelName',
      header: t('Task'),
      enableSorting: false,
    },
    {
      id: 'stage',
      header: t('Waiting stage'),
      enableSorting: false,
      cell: ({ row }) => stageLabel(row.original.stage, t),
    },
    {
      id: 'blocking',
      header: t('Blocking reason'),
      enableSorting: false,
      cell: ({ row }) => (
        <span>
          {statusLabel(row.original.blockingStatus, t)}{' '}
          <span className='tabular-nums'>
            ({row.original.observedValue} / {row.original.limitValue})
          </span>
        </span>
      ),
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
          onClick={(event) => openDetail(row.original, event.currentTarget)}
        >
          {t('Details')}
        </Button>
      ),
    },
  ]

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
      {groupId ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('Waiting tasks')}</CardTitle>
          </CardHeader>
          <CardContent>
            <CanvasServerTable
              data={waits.data?.items ?? []}
              columns={waitColumns}
              total={waits.data?.total ?? 0}
              state={table}
              loading={waits.isPending || waits.isFetching}
              error={waits.isError}
              errorTitle={t(
                errorKey(waits.error, 'Unable to load waiting tasks')
              )}
              onRetry={() => void waits.refetch()}
              emptyTitle={t('No waiting tasks')}
              getRowId={(item) => item.taskId}
            />
          </CardContent>
        </Card>
      ) : null}
      <Sheet
        open={Boolean(taskId)}
        onOpenChange={(open) => {
          if (!open) closeDetail()
        }}
      >
        <SheetContent
          className={sideDrawerContentClassName()}
          finalFocus={detailTrigger}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>{t('Waiting task details')}</SheetTitle>
          </SheetHeader>
          <div className={sideDrawerFormClassName()}>
            {detail.isPending ? <p>{t('Loading')}</p> : null}
            {detail.isError ? (
              <div role='alert' className='space-y-2'>
                <p>
                  {t(
                    errorKey(
                      detail.error,
                      'Unable to load waiting task details'
                    )
                  )}
                </p>
                <Button variant='outline' onClick={() => void detail.refetch()}>
                  {t('Retry')}
                </Button>
              </div>
            ) : null}
            {detail.data ? (
              <dl className='grid grid-cols-[auto_1fr] gap-3 text-sm'>
                <dt>{t('Task')}</dt>
                <dd>{detail.data.modelName}</dd>
                <dt>{t('Waiting stage')}</dt>
                <dd>{stageLabel(detail.data.stage, t)}</dd>
                <dt>{t('Blocking reason')}</dt>
                <dd>
                  {statusLabel(detail.data.blockingStatus, t)}{' '}
                  <span className='tabular-nums'>
                    ({detail.data.observedValue} / {detail.data.limitValue})
                  </span>
                </dd>
                <dt>{t('Request status')}</dt>
                <dd>{requestLabel(detail.data.requestState, t)}</dd>
                <dt>{t('Time waiting')}</dt>
                <dd>
                  <WaitingDuration
                    startedAt={detail.data.startedAt}
                    now={now}
                  />
                </dd>
                <dt>{t('Next attempt')}</dt>
                <dd>
                  <LocalizedTime value={detail.data.nextAttemptAt} now={now} />
                </dd>
                <dt>{t('Last scheduled')}</dt>
                <dd>
                  <LocalizedTime value={detail.data.updatedAt} now={now} />
                </dd>
              </dl>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}

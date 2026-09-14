/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  ExecutionCapacityStatus,
  ExecutionWaitItem,
  ExecutionWaitRequestState,
} from '../execution-types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'

const refreshIntervalMs = 10_000
const statusKeys: Record<ExecutionCapacityStatus, string> = {
  AVAILABLE: 'Available capacity',
  REQUEST_CONCURRENCY_FULL: 'Request concurrency full',
  ASYNC_IN_FLIGHT_FULL: 'Asynchronous in-flight full',
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
  t(statusKeys[value as ExecutionCapacityStatus] ?? 'Unknown capacity status')
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
  const [groupId, setGroupId] = useState<string>()
  const [taskId, setTaskId] = useState<string>()
  const detailTrigger = useRef<HTMLButtonElement | null>(null)
  const now = new Date()
  const capacity = useQuery({
    queryKey: ['canvas-cloud', 'execution', 'capacity'],
    queryFn: ({ signal }) => getCanvasExecutionCapacity(signal),
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
  const capacityColumns: StaticDataTableColumn<ExecutionCapacityItem>[] = [
    {
      id: 'provider',
      header: t('Provider'),
      cell: (item) => item.providerName,
    },
    {
      id: 'group',
      header: t('API Key group'),
      cell: (item) => item.credentialGroupName,
    },
    {
      id: 'requests',
      header: t('Request concurrency'),
      cellClassName: 'tabular-nums',
      cell: (item) =>
        `${item.requestConcurrency.used} / ${item.requestConcurrency.limit}`,
    },
    {
      id: 'async',
      header: t('Asynchronous in-flight'),
      cellClassName: 'tabular-nums',
      cell: (item) =>
        `${item.asyncInFlight.used} / ${item.asyncInFlight.limit}`,
    },
    {
      id: 'waiting',
      header: t('Waiting tasks'),
      cellClassName: 'tabular-nums',
      cell: (item) => item.waitingTasks,
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (item) => (
        <Badge variant='outline'>{statusLabel(item.status, t)}</Badge>
      ),
    },
    {
      id: 'actions',
      header: t('Actions'),
      cell: (item) =>
        item.waitingTasks > 0 ? (
          <Button
            variant='link'
            onClick={() => selectGroup(item.credentialGroupId)}
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
            {t('Execution capacity')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {capacity.isPending ? <p>{t('Loading')}</p> : null}
          {capacity.isError ? (
            <div role='alert' className='space-y-2'>
              <p>
                {t(
                  errorKey(capacity.error, 'Unable to load execution capacity')
                )}
              </p>
              <Button variant='outline' onClick={() => void capacity.refetch()}>
                {t('Retry')}
              </Button>
            </div>
          ) : null}
          {capacity.data ? (
            <StaticDataTable
              columns={capacityColumns}
              data={capacity.data.items}
              getRowKey={(item) => item.credentialGroupId}
              emptyContent={t('No execution capacity records')}
              tableClassName='min-w-[920px]'
              containerProps={{
                tabIndex: 0,
                role: 'region',
                'aria-label': t('Execution capacity'),
              }}
            />
          ) : null}
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

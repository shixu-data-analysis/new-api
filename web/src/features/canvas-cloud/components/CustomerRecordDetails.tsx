/* Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later. */
import { useQueries, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { normalizeInterfaceLanguage, toIntlLocale } from '@/i18n/languages'

import {
  getCanvasAdminCustomerTasks,
  getCanvasCustomerBusinessFacts,
} from '../api'
import { factValueLabels } from '../business-facts'
import { formatCanvasDateTime } from '../formatters'
import type { CanvasAdminCustomerTask } from '../types'
import { BusinessTermText } from './BusinessTerm'
import { CopyableText } from './CopyableText'

type RecordTarget = { kind: 'task'; id: string } | { kind: 'lot'; id: string }

function FactValue(props: { label: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground text-sm'>{t(props.label)}</dt>
      <dd className='mt-1 min-h-5 text-sm [overflow-wrap:anywhere] break-words'>
        {props.children}
      </dd>
    </div>
  )
}

function FactRow(props: { label: string; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className='grid min-w-0 grid-cols-[minmax(5rem,6rem)_minmax(0,1fr)] items-start gap-x-4'>
      <dt className='text-muted-foreground text-sm'>{t(props.label)}</dt>
      <dd className='min-w-0 text-sm [overflow-wrap:anywhere] break-words'>
        {props.children}
      </dd>
    </div>
  )
}

function Points(props: { value: string }) {
  const { i18n } = useTranslation()
  return (
    <span className='tabular-nums'>
      {new Intl.NumberFormat(toIntlLocale(i18n.language)).format(
        BigInt(props.value)
      )}
    </span>
  )
}

function localizedErrorMessage(
  messages: Record<string, string> | null | undefined,
  language: string
) {
  if (!messages) return null
  const message = messages[normalizeInterfaceLanguage(language)]
  if (typeof message === 'string' && message.trim()) return message.trim()
  if (typeof messages.en === 'string' && messages.en.trim()) {
    return messages.en.trim()
  }
  const fallback = Object.values(messages).find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.trim().length > 0
  )
  return fallback?.trim() ?? null
}

type TaskDetailState = {
  execution: string | null
  billing: string | null
  settledPoints: string | null
}

function taskDetailState(task: CanvasAdminCustomerTask): TaskDetailState {
  const outputs = task.outputSummaries ?? []
  if (outputs.length === 0) {
    let settledPoints: string | null = null
    if (task.customerBillingStatus === 'SETTLED') {
      settledPoints = task.settledPoints
    } else if (
      ['RELEASED_FAILED', 'RELEASED_TIMEOUT'].includes(
        task.customerBillingStatus
      )
    ) {
      settledPoints = '0'
    }
    return {
      execution: null,
      billing: null,
      settledPoints,
    }
  }

  const executionStatuses = outputs.map((output) => output.executionStatus)
  const knownExecutionStatuses = new Set([
    'UNKNOWN',
    'PROCESSING',
    'ACCEPTED',
    'SUCCEEDED',
    'CONFIRMED_FAILED',
  ])
  const hasUnknownExecution = executionStatuses.some(
    (status) => status === 'UNKNOWN' || !knownExecutionStatuses.has(status)
  )
  const hasProcessing = executionStatuses.some(
    (status) => status === 'PROCESSING' || status === 'ACCEPTED'
  )
  const hasSucceeded = executionStatuses.includes('SUCCEEDED')
  const hasFailed = executionStatuses.includes('CONFIRMED_FAILED')
  let execution = 'Unknown'
  if (!hasUnknownExecution) {
    if (hasProcessing) {
      execution = executionStatuses.every((status) => status === 'ACCEPTED')
        ? 'Accepted'
        : 'Processing'
    } else if (hasSucceeded && hasFailed) {
      execution = 'Partial success'
    } else if (hasSucceeded) {
      execution = 'Succeeded'
    } else if (hasFailed) {
      execution = 'Confirmed failed'
    }
  }

  const knownBillingStatuses = new Set([
    'SETTLED',
    'FROZEN',
    'RELEASED_FAILED',
    'RELEASED_TIMEOUT',
  ])
  const hasDataReview = outputs.some(
    (output) =>
      (output.billingStatus === 'SETTLED' && output.settledPoints === null) ||
      !knownBillingStatuses.has(output.billingStatus)
  )
  const billingStatuses = outputs.map((output) => output.billingStatus)
  const hasFrozen = billingStatuses.includes('FROZEN')
  const hasResolved = billingStatuses.some((status) => status !== 'FROZEN')
  let billing = 'Settlement complete'
  if (hasDataReview) {
    billing = 'Data needs review'
  } else if (hasFrozen && hasResolved) {
    billing = 'Settlement in progress'
  } else if (hasFrozen) {
    billing = 'FROZEN'
  }

  const settled = outputs.filter(
    (output) =>
      output.billingStatus === 'SETTLED' && output.settledPoints !== null
  )
  let settledPoints: string | null = null
  if (!hasDataReview && settled.length > 0) {
    settledPoints = settled
      .reduce(
        (total, output) => total + BigInt(output.settledPoints ?? '0'),
        0n
      )
      .toString()
  } else if (
    !hasDataReview &&
    outputs.every((output) =>
      ['RELEASED_FAILED', 'RELEASED_TIMEOUT'].includes(output.billingStatus)
    )
  ) {
    settledPoints = '0'
  }
  return { execution, billing, settledPoints }
}

function TaskExecutionStatus(props: {
  task: CanvasAdminCustomerTask
  state: TaskDetailState
}) {
  const { t } = useTranslation()
  if (props.state.execution) return <>{t(props.state.execution)}</>
  return (
    <BusinessTermText
      kind='taskExecutionStatus'
      value={props.task.executionStatus}
    />
  )
}

function TaskBillingStatus(props: {
  task: CanvasAdminCustomerTask
  state: TaskDetailState
}) {
  const { t } = useTranslation()
  if (props.state.billing && props.state.billing !== 'FROZEN') {
    return <>{t(props.state.billing)}</>
  }
  return (
    <BusinessTermText
      kind='billingStatus'
      value={props.state.billing ?? props.task.customerBillingStatus}
    />
  )
}

function TaskOutputList(props: { task: CanvasAdminCustomerTask }) {
  const { t, i18n } = useTranslation()
  const outputs = props.task.outputSummaries ?? []
  if (outputs.length === 0) return null
  return (
    <section className='space-y-3 border-t pt-5'>
      <h3 className='font-medium'>{t('Task result')}</h3>
      <div className='space-y-3'>
        {outputs.map((output) => {
          let failure: ReactNode = null
          const message = localizedErrorMessage(
            output.error?.messages,
            i18n.resolvedLanguage ?? i18n.language
          )
          if (output.error) {
            failure = (
              <div>
                <p className='text-muted-foreground'>{t('Failure reasons')}</p>
                <p className='mt-1 break-words'>{message ?? t('Failed')}</p>
              </div>
            )
          }
          return (
            <div
              key={output.id ?? output.outputIndex}
              className='space-y-2 rounded-md border p-3 text-sm'
            >
              <div className='flex flex-wrap items-center gap-2'>
                <span>
                  {t('Result')} {output.outputIndex + 1}
                </span>
                <span>
                  <BusinessTermText
                    kind='taskExecutionStatus'
                    value={output.executionStatus}
                  />
                </span>
                <span>
                  <BusinessTermText
                    kind='billingStatus'
                    value={output.billingStatus}
                  />
                </span>
              </div>
              <dl className='grid gap-3 sm:grid-cols-2'>
                <FactValue label='Quoted points'>
                  <Points value={output.quotedPoints} />
                </FactValue>
                {output.settledPoints !== null ? (
                  <FactValue label='Settled points'>
                    <Points value={output.settledPoints} />
                  </FactValue>
                ) : null}
                {output.completedAt ? (
                  <FactValue label='Completed at'>
                    {formatCanvasDateTime(output.completedAt)}
                  </FactValue>
                ) : null}
              </dl>
              {failure}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TaskDetails(props: { customerId: string; taskId: string }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-customer',
      props.customerId,
      'task',
      props.taskId,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminCustomerTasks(
        props.customerId,
        {
          taskId: props.taskId,
          page: 1,
          pageSize: 20,
          sortBy: 'taskId',
          sortOrder: 'asc',
        },
        signal
      ),
  })
  if (query.isLoading) return <p role='status'>{t('Loading')}</p>
  if (query.isError) {
    return (
      <div className='space-y-2' role='alert'>
        <p>{t('Unable to load customer details')}</p>
        <Button
          type='button'
          variant='outline'
          onClick={() => void query.refetch()}
        >
          {t('Retry')}
        </Button>
      </div>
    )
  }
  const task = query.data?.items.find((item) => item.id === props.taskId)
  if (!task) return <p>{t('Not recorded')}</p>
  const state = taskDetailState(task)
  return (
    <div className='space-y-5'>
      <dl className='space-y-4'>
        <FactRow label='Task number'>
          <CopyableText value={task.id} />
        </FactRow>
        <FactRow label='Model'>{task.modelName}</FactRow>
        <FactRow label='Task accepted at'>
          {formatCanvasDateTime(task.acceptedAt)}
        </FactRow>
        {task.completedAt ? (
          <FactRow label='Completed at'>
            {formatCanvasDateTime(task.completedAt)}
          </FactRow>
        ) : null}
      </dl>
      <dl className='space-y-4'>
        <FactRow label='Execution status'>
          <TaskExecutionStatus task={task} state={state} />
        </FactRow>
        <FactRow label='Settlement status'>
          <TaskBillingStatus task={task} state={state} />
        </FactRow>
      </dl>
      <dl className='grid gap-4 sm:grid-cols-2'>
        <FactValue label='Quoted points'>
          <Points value={task.quotedPoints} />
        </FactValue>
        <FactValue label='Settled points'>
          {state.settledPoints === null ? (
            '—'
          ) : (
            <Points value={state.settledPoints} />
          )}
        </FactValue>
      </dl>
      <TaskOutputList task={task} />
    </div>
  )
}

function LotDetails(props: {
  customerId: string
  lotId: string
  onOpenOrder: (id: string) => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-customer',
      props.customerId,
      'point-lot',
      props.lotId,
      page,
    ],
    queryFn: ({ signal }) =>
      getCanvasCustomerBusinessFacts(
        props.customerId,
        { page, pageSize: 20, sortOrder: 'desc', kind: 'ledger' },
        { kind: 'lot', id: props.lotId },
        signal
      ),
  })
  const ledgerDetails = useQueries({
    queries: (query.data?.items ?? []).map((ledger) => ({
      queryKey: [
        'canvas-cloud',
        'admin-customer',
        props.customerId,
        'point-ledger',
        ledger.id,
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getCanvasCustomerBusinessFacts(
          props.customerId,
          { page: 1, pageSize: 20, sortOrder: 'desc' },
          { kind: 'ledger', id: ledger.id },
          signal
        ),
    })),
  })
  if (query.isLoading) return <p role='status'>{t('Loading')}</p>
  if (query.isError) {
    return (
      <div className='space-y-2' role='alert'>
        <p>{t('Unable to load customer details')}</p>
        <Button
          type='button'
          variant='outline'
          onClick={() => void query.refetch()}
        >
          {t('Retry')}
        </Button>
      </div>
    )
  }
  const fact = query.data?.fact
  if (!fact) return <p>{t('Not recorded')}</p>
  const field = (key: string) => {
    const value = fact.fields[key]
    return typeof value === 'string' ? value : null
  }
  const ledgerRows = (query.data?.items ?? []).map((ledger, index) => ({
    ledger,
    fact: ledgerDetails[index]?.data?.fact,
    query: ledgerDetails[index],
  }))
  const columns: StaticDataTableColumn<(typeof ledgerRows)[number]>[] = [
    {
      id: 'at',
      header: t('Time'),
      cell: (row) => formatCanvasDateTime(row.ledger.at),
    },
    {
      id: 'event',
      header: t('Event'),
      cell: (row) => (
        <BusinessTermText kind='ledgerEvent' value={row.ledger.status} />
      ),
    },
    {
      id: 'points',
      header: t('Change amount'),
      cellClassName: 'text-right',
      cell: (row) => {
        if (row.query?.isError) {
          return (
            <div className='flex flex-col items-end gap-1' role='alert'>
              <span>{t('Unable to load customer details')}</span>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => void row.query.refetch()}
              >
                {t('Retry')}
              </Button>
            </div>
          )
        }
        const points = row.fact?.fields.eventPoints
        if (typeof points === 'string') return <Points value={points} />
        if (row.query?.isLoading) {
          return <span role='status'>{t('Loading')}</span>
        }
        return t('Not recorded')
      },
    },
  ]
  const sourceOrderId = field('rechargeOrderId')
  const sourceOrderNumber = field('rechargeOrderNumber')
  const sourceType = field('sourceType')
  const initialPoints = field('initialPoints')
  const availablePoints = field('availablePoints')
  const reservedPoints = field('reservedPoints')
  return (
    <div className='space-y-5'>
      <dl className='space-y-4'>
        <FactRow label='Type'>
          <BusinessTermText
            kind='pointLotType'
            value={field('lotType') ?? fact.status}
          />
        </FactRow>
        <FactRow label='Source'>
          {sourceOrderId && sourceOrderNumber ? (
            <Button
              type='button'
              variant='link'
              className='h-auto p-0'
              onClick={() => props.onOpenOrder(sourceOrderId)}
            >
              {sourceOrderNumber}
            </Button>
          ) : (
            t(
              sourceType === 'MANUAL_GRANT'
                ? 'Manual gift'
                : (factValueLabels[sourceType ?? ''] ?? 'Unknown')
            )
          )}
        </FactRow>
        <FactRow label='Point lot number'>
          <CopyableText value={fact.id} />
        </FactRow>
        <FactRow label='Issued at'>{formatCanvasDateTime(fact.at)}</FactRow>
        <FactRow label='Expires at'>
          {formatCanvasDateTime(field('expiresAt'), t('No expiry'))}
        </FactRow>
        {field('originalExpiresAt') ? (
          <FactRow label='Original expiry'>
            {formatCanvasDateTime(field('originalExpiresAt'))}
          </FactRow>
        ) : null}
        {field('closedAt') ? (
          <FactRow label='Closed at'>
            {formatCanvasDateTime(field('closedAt'))}
          </FactRow>
        ) : null}
      </dl>
      <dl className='grid gap-4 border-y py-5 sm:grid-cols-3'>
        {initialPoints ? (
          <FactValue label='Original issued points'>
            <Points value={initialPoints} />
          </FactValue>
        ) : null}
        {availablePoints ? (
          <FactValue label='Available points'>
            <Points value={availablePoints} />
          </FactValue>
        ) : null}
        {reservedPoints ? (
          <FactValue label='Frozen points'>
            <Points value={reservedPoints} />
          </FactValue>
        ) : null}
      </dl>
      <section className='space-y-3'>
        <h3 className='font-medium'>{t('Point changes')}</h3>
        <StaticDataTable
          data={ledgerRows}
          columns={columns}
          getRowKey={(row) => row.ledger.id}
          emptyContent={t('No consumption records')}
        />
        {query.data && query.data.total > 20 ? (
          <div className='flex items-center justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              {t('Previous')}
            </Button>
            <span className='text-muted-foreground text-sm'>
              {t('Page')} {page}
            </span>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={page * 20 >= query.data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  )
}

export function CustomerRecordDetails(props: {
  customerId: string
  target: RecordTarget
  onOpenOrder: (id: string) => void
}) {
  return props.target.kind === 'task' ? (
    <TaskDetails customerId={props.customerId} taskId={props.target.id} />
  ) : (
    <LotDetails
      customerId={props.customerId}
      lotId={props.target.id}
      onOpenOrder={props.onOpenOrder}
    />
  )
}

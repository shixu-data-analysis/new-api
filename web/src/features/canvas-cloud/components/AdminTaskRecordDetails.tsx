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
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { toIntlLocale } from '@/i18n/languages'

import {
  getCanvasAdminTaskRecord,
  getCanvasTaskPointLedger,
  getCanvasTaskPointLedgerDetail,
} from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import { getLocalizedErrorMessage } from '../localized-error-message'
import type {
  CanvasAdminTaskRecordDetail,
  CanvasTaskPointLedgerDetail,
  CanvasTaskPointLedgerItem,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import { TaskCallHistory } from './TaskCallHistory'

const executionLabels: Record<string, string> = {
  ACCEPTED: 'Accepted',
  PROCESSING: 'Processing',
  SUCCEEDED: 'Succeeded',
  CONFIRMED_FAILED: 'Confirmed failed',
  PARTIAL_SUCCESS: 'Partial success',
  UNKNOWN: 'Unknown',
}
const settlementLabels: Record<string, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Settlement in progress',
  COMPLETED: 'Settlement complete',
}
const billingLabels: Record<string, string> = {
  FROZEN: 'Frozen',
  SETTLED: 'Settled',
  RELEASED_FAILED: 'Released after failure',
  RELEASED_TIMEOUT: 'Released after timeout',
}
const ledgerEventLabels: Record<string, string> = {
  SETTLE: 'Task deduction',
  DEBT_REPAYMENT: 'Debt repayment',
}
const lotTypeLabels: Record<string, string> = {
  PAID: 'Paid points',
  BONUS: 'Bonus points',
  GRACE_BONUS: 'Grace bonus points',
}
const taskParameterLabels: Record<string, string> = {
  quality: 'Quality',
  size: 'Size',
  resolution: 'Resolution',
  aspectRatio: 'Output aspect ratio',
  batchSize: 'Quantity',
  durationSeconds: 'Duration',
  maxTokens: 'Max Tokens',
  seed: 'Seed',
  generateAudio: 'Generate audio',
}
const billingUnitLabels: Record<string, string> = {
  REQUEST: 'REQUEST',
  SECOND: 'SECOND',
  MILLION_TOKENS: 'MILLION_TOKENS',
}

function Points({ value }: { value: string | null }) {
  const { i18n } = useTranslation()
  if (value === null) return <>—</>
  return (
    <span className='tabular-nums'>
      {new Intl.NumberFormat(toIntlLocale(i18n.language)).format(BigInt(value))}
    </span>
  )
}

function formatDateTime(locale: string | undefined, value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function taskCompletionTime(
  task: CanvasAdminTaskRecordDetail,
  locale: string | undefined,
  t: (key: string) => string
) {
  if (task.completedAt) return formatDateTime(locale, task.completedAt)
  if (
    task.executionStatus === 'ACCEPTED' ||
    task.executionStatus === 'PROCESSING'
  ) {
    return t('Not completed')
  }
  return t('Not recorded')
}

function executionSummary(
  summary: CanvasAdminTaskRecordDetail['executionSummary'],
  t: (key: string, values?: Record<string, number>) => string
) {
  const parts = [
    summary.acceptedResults
      ? t('Accepted count', { count: summary.acceptedResults })
      : null,
    summary.processingResults
      ? t('Processing count', { count: summary.processingResults })
      : null,
    summary.succeededResults
      ? t('Succeeded count', { count: summary.succeededResults })
      : null,
    summary.failedResults
      ? t('Failed count', { count: summary.failedResults })
      : null,
    summary.unknownResults
      ? t('Unknown count', { count: summary.unknownResults })
      : null,
  ].filter((part): part is string => Boolean(part))
  return parts.join(' · ')
}

function formatReadOnlyValue(
  value: unknown,
  t: (key: string) => string
): string {
  if (typeof value === 'boolean') return t(value ? 'Yes' : 'No')
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  return '—'
}

function isSafeTaskParameterValue(
  value: unknown
): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
}

function taskParameterLabel(name: string, t: (key: string) => string) {
  return t(taskParameterLabels[name])
}

const ledgerChangeLabels: Record<string, string> = {
  SETTLE_PAID: 'Task deduction from paid points',
  SETTLE_BONUS: 'Task deduction from bonus points',
  SETTLE_GRACE_BONUS: 'Task deduction from grace bonus points',
  DEBT_REPAYMENT_PAID: 'Paid points debt repayment',
  DEBT_REPAYMENT_BONUS: 'Bonus points debt repayment',
  DEBT_REPAYMENT_GRACE_BONUS: 'Grace bonus points debt repayment',
}

function ledgerChangeLabel(
  eventType: string,
  lotType: string | null,
  t: (key: string) => string
) {
  const combined = lotType
    ? ledgerChangeLabels[`${eventType}_${lotType}`]
    : undefined
  if (combined) return t(combined)
  const event = t(ledgerEventLabels[eventType] ?? 'Other')
  return lotType ? `${event} · ${t(lotTypeLabels[lotType] ?? 'Other')}` : event
}

function ledgerViewButtonId(ledgerId: string) {
  return `canvas-task-ledger-${ledgerId}`
}

function DetailValue({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground text-sm'>{t(label)}</dt>
      <dd className='mt-1 min-h-5 text-sm [overflow-wrap:anywhere] break-words'>
        {children}
      </dd>
    </div>
  )
}

function statusLabel(
  t: (key: string) => string,
  value: string,
  labels: Record<string, string>
) {
  return t(labels[value] ?? 'Unknown')
}

function ExecutionDetails({ task }: { task: CanvasAdminTaskRecordDetail }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const outputs = task.outputs
  const parameters = Object.entries(task.parameters ?? {}).filter(
    ([name, value]) =>
      taskParameterLabels[name] && isSafeTaskParameterValue(value)
  )
  const outputColumns = useMemo<
    StaticDataTableColumn<CanvasAdminTaskRecordDetail['outputs'][number]>[]
  >(
    () => [
      {
        id: 'result',
        header: t('Result'),
        cell: (output) => `${t('Result')} ${output.outputIndex + 1}`,
      },
      {
        id: 'executionStatus',
        header: t('Execution status'),
        cell: (output) => (
          <div className='space-y-1'>
            <div>{statusLabel(t, output.executionStatus, executionLabels)}</div>
            {getLocalizedErrorMessage(
              output.error,
              i18n.resolvedLanguage || i18n.language
            ) ? (
              <div className='text-destructive text-xs [overflow-wrap:anywhere]'>
                {getLocalizedErrorMessage(
                  output.error,
                  i18n.resolvedLanguage || i18n.language
                )}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'billingStatus',
        header: t('Settlement status'),
        cell: (output) => statusLabel(t, output.billingStatus, billingLabels),
      },
      {
        id: 'settledPoints',
        header: t('Settled points'),
        className: 'text-right',
        cellClassName: 'text-right',
        cell: (output) => <Points value={output.settledPoints} />,
      },
    ],
    [i18n.language, i18n.resolvedLanguage, t]
  )
  return (
    <div className='space-y-5'>
      <dl className='grid gap-4 sm:grid-cols-2'>
        <DetailValue label='Completed at'>
          {taskCompletionTime(task, locale, t)}
        </DetailValue>
        <DetailValue label='Task execution status'>
          {statusLabel(t, task.executionStatus, executionLabels)}
        </DetailValue>
        {task.upstreamTaskId ? (
          <DetailValue label='Upstream task ID'>
            <CopyableText value={task.upstreamTaskId} />
          </DetailValue>
        ) : null}
      </dl>
      {parameters.length > 0 ? (
        <section className='space-y-3'>
          <h3 className='text-sm font-medium'>{t('Task parameters')}</h3>
          <dl className='grid gap-4 sm:grid-cols-2'>
            {parameters.map(([name, value]) => (
              <div key={name} className='min-w-0'>
                <dt className='text-muted-foreground text-sm'>
                  {taskParameterLabel(name, t)}
                </dt>
                <dd className='mt-1 min-h-5 text-sm [overflow-wrap:anywhere] break-words'>
                  {formatReadOnlyValue(value, t)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {outputs.length > 1 ? (
        <StaticDataTable
          data={outputs}
          columns={outputColumns}
          getRowKey={(output) => output.id ?? output.outputIndex}
          tableClassName='min-w-[640px]'
        />
      ) : null}
      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>{t('Call records')}</h3>
        <TaskCallHistory taskId={task.id} />
      </section>
    </div>
  )
}

function TaskLedgerDetail({
  taskId,
  ledgerId,
  onBack,
}: {
  taskId: string
  ledgerId: string
  onBack: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: ['canvas-cloud', 'task-record', taskId, 'point-ledger', ledgerId],
    queryFn: ({ signal }) =>
      getCanvasTaskPointLedgerDetail(taskId, ledgerId, signal),
    retry: false,
  })
  if (query.isPending) {
    return (
      <div className='space-y-3'>
        <Button type='button' variant='outline' size='sm' onClick={onBack}>
          {t('Back to task details')}
        </Button>
        <p role='status'>{t('Loading')}</p>
      </div>
    )
  }
  if (query.isError || !query.data) {
    return (
      <div className='space-y-3' role='alert'>
        <Button type='button' variant='outline' size='sm' onClick={onBack}>
          {t('Back to task details')}
        </Button>
        <p>{t('Unable to load point ledger details')}</p>
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
  const detail: CanvasTaskPointLedgerDetail = query.data
  return (
    <div className='space-y-5'>
      <Button type='button' variant='outline' size='sm' onClick={onBack}>
        {t('Back to task details')}
      </Button>
      <dl className='grid gap-4 sm:grid-cols-2'>
        <DetailValue label='Ledger ID'>
          <CopyableText value={detail.id} />
        </DetailValue>
        <DetailValue label='Occurred at'>
          {formatDateTime(locale, detail.occurredAt)}
        </DetailValue>
        <DetailValue label='Change'>
          {ledgerChangeLabel(detail.eventType, detail.lotType, t)}
        </DetailValue>
        <DetailValue label='Points'>
          <Points value={detail.eventPoints} />
        </DetailValue>
        <DetailValue label='Source lot'>{detail.pointLotId ?? '—'}</DetailValue>
        <DetailValue label='Lot type'>
          {detail.lotType ? t(lotTypeLabels[detail.lotType] ?? 'Other') : '—'}
        </DetailValue>
        <DetailValue label='Related results'>
          {detail.outputIndex === null
            ? '—'
            : `${t('Result')} ${detail.outputIndex + 1}`}
        </DetailValue>
        <DetailValue label='Debt'>{detail.debtId ?? '—'}</DetailValue>
        {detail.reason ? (
          <DetailValue label='Reason'>{detail.reason}</DetailValue>
        ) : null}
        <DetailValue label='Lot remaining points'>
          {detail.remainingBefore === null || detail.remainingAfter === null ? (
            '—'
          ) : (
            <>
              <Points value={detail.remainingBefore} /> →{' '}
              <Points value={detail.remainingAfter} />
            </>
          )}
        </DetailValue>
        <DetailValue label='Lot frozen points'>
          {detail.reservedBefore === null || detail.reservedAfter === null ? (
            '—'
          ) : (
            <>
              <Points value={detail.reservedBefore} /> →{' '}
              <Points value={detail.reservedAfter} />
            </>
          )}
        </DetailValue>
      </dl>
    </div>
  )
}

function TaskPointRecords({
  task,
  scrollContainerRef,
  onViewLedger,
}: {
  task: CanvasAdminTaskRecordDetail
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>
  onViewLedger: (
    ledgerId: string,
    trigger: HTMLButtonElement,
    scrollTop: number
  ) => void
}) {
  const { t, i18n } = useTranslation()
  const state = useServerTableState('occurredAt')
  const setPagination = state.setPagination
  const [changeType, setChangeType] = useState('')
  const [lotType, setLotType] = useState('')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const valid = isCanvasDateRangeValid(from, to)
  useEffect(() => {
    setPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [changeType, from, lotType, setPagination, to])
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'task-record',
      task.id,
      'point-ledger',
      state.query.page,
      state.query.pageSize,
      changeType,
      lotType,
      from?.toISOString(),
      to?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasTaskPointLedger(
        task.id,
        {
          page: state.query.page,
          pageSize: state.query.pageSize,
          ...(changeType ? { changeType } : {}),
          ...(lotType ? { lotType } : {}),
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        },
        signal
      ),
    enabled: valid,
    retry: false,
  })
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const columns = useMemo<ColumnDef<CanvasTaskPointLedgerItem, unknown>[]>(
    () => [
      {
        id: 'occurredAt',
        accessorKey: 'occurredAt',
        header: t('Occurred at'),
        cell: ({ row }) => formatDateTime(locale, row.original.occurredAt),
      },
      {
        id: 'change',
        accessorKey: 'eventType',
        header: t('Change'),
        cell: ({ row }) => (
          <div className='space-y-1'>
            <div>
              {ledgerChangeLabel(
                row.original.eventType,
                row.original.lotType,
                t
              )}
            </div>
            {row.original.outputIndex !== null ? (
              <div className='text-muted-foreground text-xs'>
                {t('Result')} {row.original.outputIndex + 1}
              </div>
            ) : null}
            {row.original.debtId ? (
              <div className='text-muted-foreground text-xs'>
                {t('Debt')}: {row.original.debtId}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'eventPoints',
        accessorKey: 'eventPoints',
        enableSorting: false,
        header: () => <div className='text-right'>{t('Point quantity')}</div>,
        cell: ({ row }) => (
          <div className='text-right'>
            <Points value={row.original.eventPoints} />
          </div>
        ),
      },
      {
        id: 'pointLotId',
        accessorKey: 'pointLotId',
        header: t('Source lot'),
        cell: ({ row }) => row.original.pointLotId ?? '—',
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        header: t('Actions'),
        cell: ({ row }) => (
          <Button
            id={ledgerViewButtonId(row.original.id)}
            type='button'
            variant='link'
            className='h-auto p-0'
            onClick={(event) =>
              onViewLedger(
                row.original.id,
                event.currentTarget,
                scrollContainerRef.current?.scrollTop ?? 0
              )
            }
          >
            {t('View ledger')}
          </Button>
        ),
      },
    ],
    [locale, onViewLedger, scrollContainerRef, t]
  )
  return (
    <div className='space-y-5'>
      <dl className='grid gap-4 sm:grid-cols-2'>
        <DetailValue label='Pre-authorized points'>
          <Points value={task.quotedPoints} />
        </DetailValue>
        <DetailValue label='Task released points'>
          <Points value={task.releasedPoints} />
        </DetailValue>
        <DetailValue label='Billing unit'>
          {task.billingUnit
            ? t(billingUnitLabels[task.billingUnit] ?? 'Unknown')
            : '—'}
        </DetailValue>
        <DetailValue label='Billing completion time'>
          {formatDateTime(locale, task.billingFinalizedAt)}
        </DetailValue>
        <DetailValue label='Raw billing status'>
          {statusLabel(t, task.customerBillingStatus, billingLabels)}
        </DetailValue>
      </dl>
      {query.isError ? (
        <div className='space-y-2' role='alert'>
          <p>{t('Unable to load point records')}</p>
          <Button
            type='button'
            variant='outline'
            onClick={() => void query.refetch()}
          >
            {t('Retry')}
          </Button>
        </div>
      ) : (
        <CanvasServerTable
          data={query.data?.items ?? []}
          columns={columns}
          total={query.data?.total ?? 0}
          state={state}
          loading={query.isPending || query.isFetching}
          emptyTitle={t('No point records')}
          filteredEmptyTitle={t('No matching results')}
          hasActiveFilters={Boolean(changeType || lotType || from || to)}
          onResetFilters={() => {
            setChangeType('')
            setLotType('')
            setFrom(undefined)
            setTo(undefined)
          }}
          additionalFilters={
            <>
              <DataTableColumnFilterField label={t('Change')}>
                <Select
                  value={changeType || 'ALL'}
                  onValueChange={(value) =>
                    setChangeType(value === 'ALL' ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger className='w-full' aria-label={t('Change')}>
                    <CanvasLocalizedSelectValue
                      value={changeType}
                      emptyLabelKey='All changes'
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All changes')}</SelectItem>
                    {Object.entries(ledgerEventLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {t(label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DataTableColumnFilterField>
              <DataTableColumnFilterField label={t('Lot type')}>
                <Select
                  value={lotType || 'ALL'}
                  onValueChange={(value) =>
                    setLotType(value === 'ALL' ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger className='w-full' aria-label={t('Lot type')}>
                    <CanvasLocalizedSelectValue
                      value={lotType}
                      emptyLabelKey='All lot types'
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All lot types')}</SelectItem>
                    <SelectItem value='PAID'>{t('Paid points')}</SelectItem>
                    <SelectItem value='BONUS'>{t('Bonus points')}</SelectItem>
                    <SelectItem value='GRACE_BONUS'>
                      {t('Grace bonus points')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </DataTableColumnFilterField>
              <div className='sm:col-span-2'>
                <CanvasDateRangeFilter
                  from={from}
                  to={to}
                  onFromChange={setFrom}
                  onToChange={setTo}
                />
              </div>
            </>
          }
          getRowId={(row) => row.id}
        />
      )}
    </div>
  )
}

export function AdminTaskRecordDetails({
  taskId,
  scrollContainerRef,
  onLedgerDetailsChange,
}: {
  taskId: string
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>
  onLedgerDetailsChange?: (ledgerId?: string) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>()
  const [restorePointRecords, setRestorePointRecords] = useState(false)
  const ledgerScrollTop = useRef(0)
  const query = useQuery({
    queryKey: ['canvas-cloud', 'task-record', taskId],
    queryFn: ({ signal }) => getCanvasAdminTaskRecord(taskId, signal),
    retry: false,
  })
  if (query.isPending) {
    return (
      <div className='space-y-4' role='status'>
        <div className='bg-muted h-5 w-1/2 animate-pulse rounded' />
        <div className='bg-muted h-24 animate-pulse rounded' />
      </div>
    )
  }
  if (query.isError || !query.data) {
    return (
      <div className='space-y-3' role='alert'>
        <p>{t('Task details failed to load')}</p>
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
  const task = query.data
  const taskErrorMessage = getLocalizedErrorMessage(
    task.taskError,
    i18n.resolvedLanguage || i18n.language
  )
  const singleOutputErrorMessage =
    task.outputs.length === 1
      ? getLocalizedErrorMessage(
          task.outputs[0].error,
          i18n.resolvedLanguage || i18n.language
        )
      : null
  const openLedger = (
    ledgerId: string,
    _trigger: HTMLButtonElement,
    scrollTop: number
  ) => {
    ledgerScrollTop.current = scrollTop
    setRestorePointRecords(true)
    setSelectedLedgerId(ledgerId)
    onLedgerDetailsChange?.(ledgerId)
  }
  const returnToPointRecords = () => {
    const ledgerId = selectedLedgerId
    setSelectedLedgerId(undefined)
    onLedgerDetailsChange?.()
    const restoreFocus = (remainingFrames: number) => {
      const trigger = ledgerId
        ? document.getElementById(ledgerViewButtonId(ledgerId))
        : null
      if (trigger instanceof HTMLButtonElement) {
        trigger.focus({ preventScroll: true })
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = ledgerScrollTop.current
        }
      } else if (remainingFrames > 0) {
        requestAnimationFrame(() => restoreFocus(remainingFrames - 1))
      }
    }
    requestAnimationFrame(() => restoreFocus(2))
  }
  if (selectedLedgerId) {
    return (
      <TaskLedgerDetail
        taskId={task.id}
        ledgerId={selectedLedgerId}
        onBack={returnToPointRecords}
      />
    )
  }
  return (
    <div className='space-y-6'>
      <dl className='grid gap-4 sm:grid-cols-2'>
        <DetailValue label='Customer'>
          {task.customerName ? (
            <a
              href={`/canvas-cloud/customers?customerId=${encodeURIComponent(task.customerId)}`}
              className='text-primary underline underline-offset-4'
            >
              {task.customerName}
            </a>
          ) : (
            t('Unknown customer')
          )}
        </DetailValue>
        <DetailValue label='Model'>
          {task.modelName ?? t('Unknown model')}
        </DetailValue>
        <DetailValue label='Task accepted at'>
          {formatDateTime(locale, task.acceptedAt)}
        </DetailValue>
      </dl>
      <div className='space-y-2'>
        <p className='text-sm font-medium'>
          {statusLabel(t, task.derivedExecutionStatus, executionLabels)}
        </p>
        <p className='text-muted-foreground text-sm'>
          {statusLabel(t, task.settlementProgress, settlementLabels)}
        </p>
        {executionSummary(task.executionSummary, t) ? (
          <p className='text-muted-foreground text-sm'>
            {executionSummary(task.executionSummary, t)}
          </p>
        ) : null}
        {task.executionSummary.resultsIncomplete ? (
          <p className='text-muted-foreground text-sm'>
            {t('Results are incomplete')}
          </p>
        ) : null}
        {taskErrorMessage ? (
          <p className='text-destructive text-sm [overflow-wrap:anywhere]'>
            {taskErrorMessage}
          </p>
        ) : null}
        {singleOutputErrorMessage ? (
          <p className='text-destructive text-sm [overflow-wrap:anywhere]'>
            {singleOutputErrorMessage}
          </p>
        ) : null}
      </div>
      <dl className='grid gap-4 sm:grid-cols-2'>
        <DetailValue label='Settled points'>
          <Points value={task.settledPoints} />
        </DetailValue>
        <DetailValue label='Deducted points'>
          <Points value={task.deductedPoints} />
        </DetailValue>
        <DetailValue label='Outstanding debt'>
          <Points value={task.outstandingDebtPoints} />
        </DetailValue>
      </dl>
      <Accordion defaultValue={restorePointRecords ? ['point-records'] : []}>
        <AccordionItem value='execution-details'>
          <AccordionTrigger>{t('Execution details')}</AccordionTrigger>
          <AccordionContent>
            <ExecutionDetails task={task} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value='point-records'>
          <AccordionTrigger>{t('Point records')}</AccordionTrigger>
          <AccordionContent>
            <TaskPointRecords
              task={task}
              scrollContainerRef={scrollContainerRef}
              onViewLedger={openLedger}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

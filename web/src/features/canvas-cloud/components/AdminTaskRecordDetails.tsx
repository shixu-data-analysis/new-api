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
import { flexRender, type ColumnDef, type Row } from '@tanstack/react-table'
import {
  Fragment,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasAdminTaskRecord, getCanvasTaskPointLedger } from '../api'
import type {
  CanvasAdminTaskPointRecord,
  CanvasAdminTaskRecordDetail,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
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
const failureLocations: Record<string, string> = {
  EXECUTOR_PREFLIGHT: 'Executor preflight',
  PROVIDER_NETWORK: 'Provider network',
  PROVIDER_RESPONSE: 'Provider response',
  RESPONSE_PROCESSING: 'Response processing',
  STORAGE: 'Storage',
}
const errorCategories: Record<string, string> = {
  EXECUTOR_RESOURCE_CONFIRMED_NOT_SENT: 'Executor request confirmed not sent',
  PROVIDER_PREFLIGHT: 'Generation request preparation failed',
  PROVIDER_AUTH_FAILED: 'Provider authentication failed',
  PROVIDER_BALANCE_INSUFFICIENT: 'Provider balance insufficient',
  PROVIDER_ACCESS_DENIED: 'Provider access denied',
  PROVIDER_ENDPOINT_NOT_FOUND: 'Provider endpoint not found',
  PROVIDER_REQUEST_TIMEOUT: 'Provider request timed out',
  PROVIDER_RATE_LIMITED: 'Provider rate limited',
  PROVIDER_INTERNAL_ERROR: 'Provider internal error',
  PROVIDER_BAD_GATEWAY: 'Provider bad gateway',
  PROVIDER_UNAVAILABLE: 'Provider unavailable',
  PROVIDER_GATEWAY_TIMEOUT: 'Provider gateway timed out',
  PROVIDER_UNKNOWN_ERROR: 'Unknown provider error',
}
const parameterLabels: Record<string, string> = {
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
const pointActions: Record<string, string> = {
  FREEZE: 'Freeze',
  SETTLE: 'Deduct',
  RELEASE: 'Release',
  GRACE_TRANSFER: 'Convert to grace bonus points',
  DEBT_CREATED: 'Debt created',
  DEBT_REPAYMENT: 'Debt repayment',
}
const lotTypes: Record<string, string> = {
  PAID: 'Paid points',
  BONUS: 'Bonus points',
  GRACE_BONUS: 'Grace bonus points',
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
function Points({ value }: { value: string | null | undefined }) {
  const { i18n } = useTranslation()
  return value === null || value === undefined ? (
    <>—</>
  ) : (
    <span className='tabular-nums'>
      {new Intl.NumberFormat(toIntlLocale(i18n.language)).format(BigInt(value))}
    </span>
  )
}
function formatTime(locale: string | undefined, value: string | null) {
  return value
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'medium',
      }).format(new Date(value))
    : '—'
}
function outputSummary(
  task: CanvasAdminTaskRecordDetail,
  t: (key: string, values?: Record<string, number>) => string
) {
  const summary = task.executionSummary
  return (
    [
      summary.succeededResults
        ? t('Succeeded count', { count: summary.succeededResults })
        : null,
      summary.failedResults
        ? t('Failed count', { count: summary.failedResults })
        : null,
      summary.unknownResults
        ? t('Unknown count', { count: summary.unknownResults })
        : null,
      summary.processingResults
        ? t('Processing count', { count: summary.processingResults })
        : null,
      summary.acceptedResults
        ? t('Accepted count', { count: summary.acceptedResults })
        : null,
    ]
      .filter(Boolean)
      .join(' · ') || '—'
  )
}
function settlementSummary(
  task: CanvasAdminTaskRecordDetail,
  t: (key: string) => string
) {
  if (task.settlementProgress === 'PENDING') return t('Pending')
  if (task.settlementProgress === 'PROCESSING') {
    return t('Settlement in progress')
  }
  if (
    task.outstandingDebtPoints !== null &&
    BigInt(task.outstandingDebtPoints) > 0n
  ) {
    return `${t('Outstanding debt')} · ${task.outstandingDebtPoints}`
  }
  const deducted =
    task.deductedPoints !== null && BigInt(task.deductedPoints) > 0n
  const released =
    task.releasedPoints !== null && BigInt(task.releasedPoints) > 0n
  if (deducted && released) {
    return t('Partially deducted and partially released')
  }
  if (deducted) return t('Deducted')
  if (released) return t('Points released')
  return t('Settlement complete')
}
function ExecutionDetails({ task }: { task: CanvasAdminTaskRecordDetail }) {
  const { t } = useTranslation()
  const showPreflightDiagnosis =
    task.failureLocation === 'EXECUTOR_PREFLIGHT' &&
    (task.derivedExecutionStatus === 'CONFIRMED_FAILED' ||
      task.derivedExecutionStatus === 'PARTIAL_SUCCESS')
  const parameters = Object.entries(task.parameters ?? {}).filter(
    ([key, value]) =>
      parameterLabels[key] &&
      (typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)))
  )
  return (
    <div className='space-y-5'>
      {showPreflightDiagnosis ? (
        <section className='space-y-3'>
          <h3 className='text-sm font-medium'>{t('Failure diagnosis')}</h3>
          {task.preflightDiagnostic ? (
            <dl className='grid gap-4 sm:grid-cols-2'>
              <DetailValue label='Failure stage'>
                <span className='font-mono select-text'>
                  {task.preflightDiagnostic.stage}
                </span>
              </DetailValue>
              <DetailValue label='Specific reason'>
                {task.preflightDiagnostic.reason === 'BODY_TEMPLATE_INVALID'
                  ? `${t('Request template invalid')} · `
                  : null}
                <span className='font-mono select-text'>
                  {task.preflightDiagnostic.reason}
                </span>
              </DetailValue>
              {task.preflightDiagnostic.detail ? (
                <DetailValue label='Template error'>
                  {task.preflightDiagnostic.detail ===
                  'INTEGER_CONVERSION_FAILED'
                    ? `${t('Integer conversion failed')} · `
                    : null}
                  <span className='font-mono select-text'>
                    {task.preflightDiagnostic.detail}
                  </span>
                </DetailValue>
              ) : null}
              {task.preflightDiagnostic.field ? (
                <DetailValue label='Field path'>
                  <span className='font-mono select-text'>
                    {task.preflightDiagnostic.field}
                  </span>
                </DetailValue>
              ) : null}
              {task.preflightDiagnostic.rule ? (
                <DetailValue label='Validation rule'>
                  <span className='font-mono select-text'>
                    {task.preflightDiagnostic.rule}
                  </span>
                </DetailValue>
              ) : null}
            </dl>
          ) : (
            <p className='text-muted-foreground text-sm'>
              {t('No more specific error was recorded for this task')}
            </p>
          )}
        </section>
      ) : null}
      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>{t('Actual task parameters')}</h3>
        <dl className='grid gap-4 sm:grid-cols-2'>
          <DetailValue label='Call mode'>
            {t(
              task.multiResultMode === 'FANOUT'
                ? 'Fanout mode'
                : 'Native batch mode'
            )}
          </DetailValue>
          {parameters.map(([key, value]) => (
            <DetailValue key={key} label={parameterLabels[key]}>
              {typeof value === 'boolean'
                ? t(value ? 'Yes' : 'No')
                : String(value)}
            </DetailValue>
          ))}
        </dl>
      </section>
      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>{t('Provider calls')}</h3>
        <TaskCallHistory taskId={task.id} inputAssets={task.inputAssets} />
      </section>
    </div>
  )
}
function lotLabel(
  record: CanvasAdminTaskPointRecord,
  t: (key: string) => string
) {
  if (record.eventType === 'DEBT_CREATED') {
    return t('Not applicable')
  }
  if (record.eventType === 'GRACE_TRANSFER') {
    return `${t(lotTypes[record.sourceLotType ?? ''] ?? 'Unknown')} → ${t(lotTypes[record.targetLotType ?? ''] ?? 'Unknown')}`
  }
  return record.lotType ? t(lotTypes[record.lotType] ?? 'Unknown') : '—'
}
function PointDetails({ record }: { record: CanvasAdminTaskPointRecord }) {
  const pair = (before: string | null, after: string | null) =>
    before === null || after === null ? (
      '—'
    ) : (
      <>
        <Points value={before} /> → <Points value={after} />
      </>
    )
  const fields: Array<[string, ReactNode]> =
    record.eventType === 'GRACE_TRANSFER'
      ? [
          [
            'Source ledger ID',
            record.sourceLedgerId ? (
              <CopyableText
                key='source-ledger'
                value={record.sourceLedgerId}
                noTruncate
              />
            ) : (
              '—'
            ),
          ],
          [
            'Target ledger ID',
            record.targetLedgerId ? (
              <CopyableText
                key='target-ledger'
                value={record.targetLedgerId}
                noTruncate
              />
            ) : (
              '—'
            ),
          ],
          [
            'Source point lot ID',
            record.sourceLotId ? (
              <CopyableText
                key='source-lot'
                value={record.sourceLotId}
                noTruncate
              />
            ) : (
              '—'
            ),
          ],
          [
            'Target point lot ID',
            record.targetLotId ? (
              <CopyableText
                key='target-lot'
                value={record.targetLotId}
                noTruncate
              />
            ) : (
              '—'
            ),
          ],
          [
            'Source point lot available points',
            pair(record.sourceRemainingBefore, record.sourceRemainingAfter),
          ],
          [
            'Source point lot frozen points',
            pair(record.sourceReservedBefore, record.sourceReservedAfter),
          ],
          [
            'Target point lot available points',
            pair(record.targetRemainingBefore, record.targetRemainingAfter),
          ],
          [
            'Target point lot frozen points',
            pair(record.targetReservedBefore, record.targetReservedAfter),
          ],
        ]
      : [
          [
            'Ledger ID',
            record.ledgerId ? (
              <CopyableText key='ledger' value={record.ledgerId} noTruncate />
            ) : (
              '—'
            ),
          ],
          [
            'Point lot ID',
            record.pointLotId ? (
              <CopyableText
                key='point-lot'
                value={record.pointLotId}
                noTruncate
              />
            ) : (
              '—'
            ),
          ],
        ]
  fields.push(
    [
      'Task point allocation ID',
      record.allocationId ? (
        <CopyableText key='allocation' value={record.allocationId} noTruncate />
      ) : (
        '—'
      ),
    ],
    [
      'Debt ID',
      record.debtId ? (
        <CopyableText key='debt' value={record.debtId} noTruncate />
      ) : (
        '—'
      ),
    ],
    ...(record.eventType === 'GRACE_TRANSFER'
      ? []
      : [
          [
            'Point lot available points',
            pair(record.remainingBefore, record.remainingAfter),
          ] as [string, ReactNode],
          [
            'Point lot frozen points',
            pair(record.reservedBefore, record.reservedAfter),
          ] as [string, ReactNode],
        ])
  )
  return (
    <dl className='grid gap-4 py-2 sm:grid-cols-2'>
      {fields.map(([label, content]) => (
        <DetailValue key={label} label={label}>
          {content}
        </DetailValue>
      ))}
    </dl>
  )
}
function TaskPointRecords({ taskId }: { taskId: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const state = useServerTableState('occurredAt')
  const [expanded, setExpanded] = useState<string>()
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'task-record',
      taskId,
      'point-ledger',
      state.query.page,
      state.query.pageSize,
    ],
    queryFn: ({ signal }) =>
      getCanvasTaskPointLedger(
        taskId,
        { page: state.query.page, pageSize: state.query.pageSize },
        signal
      ),
    retry: false,
  })
  const columns = useMemo<ColumnDef<CanvasAdminTaskPointRecord, unknown>[]>(
    () => [
      {
        id: 'occurredAt',
        header: t('Occurred at'),
        cell: ({ row }) => formatTime(locale, row.original.occurredAt),
      },
      {
        id: 'eventType',
        header: t('Point action'),
        cell: ({ row }) => t(pointActions[row.original.eventType] ?? 'Unknown'),
      },
      {
        id: 'result',
        header: t('Related results'),
        cell: ({ row }) =>
          row.original.outputIndex === null
            ? '—'
            : `${t('Result')} ${row.original.outputIndex + 1}`,
      },
      {
        id: 'lotType',
        header: t('Point type'),
        cell: ({ row }) => lotLabel(row.original, t),
      },
      {
        id: 'points',
        header: t('Point quantity'),
        cell: ({ row }) => <Points value={row.original.points} />,
      },
      {
        id: 'actions',
        header: t('Actions'),
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            type='button'
            variant='link'
            className='h-auto p-0'
            aria-expanded={expanded === row.original.id}
            onClick={() =>
              setExpanded((current) =>
                current === row.original.id ? undefined : row.original.id
              )
            }
          >
            {t(expanded === row.original.id ? 'Hide details' : 'Details')}
          </Button>
        ),
      },
    ],
    [expanded, locale, t]
  )
  const rowRenderer = (row: Row<CanvasAdminTaskPointRecord>) => (
    <Fragment key={row.id}>
      <TableRow>
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
      {expanded === row.original.id ? (
        <TableRow>
          <TableCell colSpan={row.getVisibleCells().length}>
            <PointDetails record={row.original} />
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  )
  return (
    <CanvasServerTable
      data={query.data?.items ?? []}
      columns={columns}
      total={query.data?.total ?? 0}
      state={state}
      loading={query.isPending || query.isFetching}
      error={query.isError}
      errorTitle={t('Unable to load point records')}
      onRetry={() => void query.refetch()}
      emptyTitle={t('No point records')}
      getRowId={(row) => row.id}
      renderRow={rowRenderer}
      renderExpandedContent={(row) =>
        expanded === row.original.id ? (
          <PointDetails record={row.original} />
        ) : null
      }
    />
  )
}

export function AdminTaskRecordDetails({
  taskId,
  scrollContainerRef: _scrollContainerRef,
  onLedgerDetailsChange: _onLedgerDetailsChange,
}: {
  taskId: string
  scrollContainerRef: MutableRefObject<HTMLDivElement | null>
  onLedgerDetailsChange?: (ledgerId?: string) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
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
  const failure =
    task.failureLocation && task.taskError?.code
      ? `${t(failureLocations[task.failureLocation] ?? 'Unknown')} · ${t(errorCategories[task.taskError.code] ?? 'Unknown error category')}`
      : null
  const failed =
    task.derivedExecutionStatus === 'CONFIRMED_FAILED' ||
    task.derivedExecutionStatus === 'PARTIAL_SUCCESS'
  return (
    <div className='space-y-6'>
      <dl className='grid gap-4 sm:grid-cols-2'>
        <div className='sm:col-span-2'>
          <DetailValue label='Task ID'>
            <span className='font-mono select-text'>
              <CopyableText value={task.id} noTruncate />
            </span>
          </DetailValue>
        </div>
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
        <DetailValue label='Model'>{task.displayNameSnapshot}</DetailValue>
        <DetailValue label='Task accepted at'>
          {formatTime(locale, task.acceptedAt)}
        </DetailValue>
        <DetailValue label='Completed at'>
          {task.completedAt
            ? formatTime(locale, task.completedAt)
            : t('Not completed')}
        </DetailValue>
        <DetailValue label='Execution result'>
          {t(executionLabels[task.derivedExecutionStatus] ?? 'Unknown')}
        </DetailValue>
        <DetailValue label='Output results'>
          {outputSummary(task, t)}
        </DetailValue>
        <DetailValue label='Point status'>
          {settlementSummary(task, t)}
        </DetailValue>
        {failure ? (
          <div className='sm:col-span-2'>
            <DetailValue label='Failure summary'>{failure}</DetailValue>
          </div>
        ) : null}
      </dl>
      <Accordion defaultValue={failed ? ['execution-details'] : []}>
        <AccordionItem value='execution-details'>
          <AccordionTrigger>{t('Execution details')}</AccordionTrigger>
          <AccordionContent>
            <ExecutionDetails task={task} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value='point-records'>
          <AccordionTrigger>{t('Point records')}</AccordionTrigger>
          <AccordionContent>
            <TaskPointRecords taskId={task.id} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}

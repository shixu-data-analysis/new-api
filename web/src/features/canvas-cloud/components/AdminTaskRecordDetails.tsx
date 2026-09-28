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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { flexRender, type ColumnDef, type Row } from '@tanstack/react-table'
import {
  Fragment,
  useMemo,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TableCell, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'

import {
  getCanvasAdminTaskRecord,
  getCanvasTaskPointLedger,
  releaseCanvasTaskFrozenPoints,
} from '../api'
import {
  ADMIN_CONFIRMED_UPSTREAM_FAILURE_CODE,
  customerDeadline,
  customerErrorMessage,
  customerNodeStatus,
  customerOutputLabelKey,
  customerPoints,
} from '../customer-task-view'
import type {
  CanvasAdminTaskPointRecord,
  CanvasAdminTaskRecordDetail,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import { JsonSnapshot, TaskCallHistory } from './TaskCallHistory'

const executionLabels: Record<string, string> = {
  ACCEPTED: 'Accepted',
  PROCESSING: 'Processing',
  SUCCEEDED: 'Succeeded',
  CONFIRMED_FAILED: 'Confirmed failed',
  PARTIAL_SUCCESS: 'Partial success',
  UNKNOWN: 'Result pending confirmation',
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
// Mirrors Cloud SAFE_TASK_PARAMETER_KEYS; the prompt and input media are never shown.
const taskParameterKeys = new Set([
  'quality',
  'size',
  'resolution',
  'aspectRatio',
  'batchSize',
  'durationSeconds',
  'maxTokens',
  'seed',
  'generateAudio',
])
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
const earlyReleaseBlockedReasons: Record<string, string> = {
  TASK_NOT_ELIGIBLE: 'This task is not eligible for early point release.',
  ACTIVE_EXECUTOR_CLAIM:
    'An executor is still handling this task. Try again after its claim ends.',
  ACTIVE_REQUEST_LEASE:
    'A provider request is still active. Try again after the request lease ends.',
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
        ? t('Pending confirmation count', { count: summary.unknownResults })
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
      taskParameterKeys.has(key) &&
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
        <JsonSnapshot
          value={{
            multiResultMode: task.multiResultMode.toLowerCase(),
            ...Object.fromEntries(parameters),
          }}
          description={t(
            'Parameters frozen when the task was accepted; the prompt and input media are not included.'
          )}
        />
      </section>
      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>{t('Provider calls')}</h3>
        <TaskCallHistory
          taskId={task.id}
          inputAssets={task.inputAssets}
          outputs={task.outputs}
          taskSucceeded={task.derivedExecutionStatus === 'SUCCEEDED'}
        />
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
  const queryClient = useQueryClient()
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [upstreamFailureConfirmed, setUpstreamFailureConfirmed] =
    useState(false)
  const [releaseReason, setReleaseReason] = useState('')
  const [impactConfirmed, setImpactConfirmed] = useState(false)
  const [releaseError, setReleaseError] = useState('')
  const [releaseConflict, setReleaseConflict] = useState(false)
  const [reasonTried, setReasonTried] = useState(false)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: ['canvas-cloud', 'task-record', taskId],
    queryFn: ({ signal }) => getCanvasAdminTaskRecord(taskId, signal),
    retry: false,
  })
  const release = useMutation({
    mutationFn: () =>
      releaseCanvasTaskFrozenPoints(taskId, {
        upstreamFailureConfirmed,
        reason: releaseReason.trim(),
      }),
    onSuccess: async () => {
      setReleaseOpen(false)
      setReleaseReason('')
      setImpactConfirmed(false)
      setUpstreamFailureConfirmed(false)
      setReleaseError('')
      setReleaseConflict(false)
      setReasonTried(false)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'task-record', taskId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'admin-task-logs'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'customer', 'point-summary'],
        }),
      ])
      toast.success(t('Frozen points released'))
    },
    onError: async (error) => {
      const status = (error as { response?: { status?: number } }).response
        ?.status
      if (status === 409) {
        setReleaseError('')
        setReleaseConflict(true)
        await query.refetch()
        return
      }
      setReleaseError(t('Unable to release frozen points'))
    },
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
  let failure: string | null = null
  if (task.taskError?.code === ADMIN_CONFIRMED_UPSTREAM_FAILURE_CODE) {
    failure = t('Administrator confirmed the upstream failure')
  } else if (task.failureLocation && task.taskError?.code) {
    failure = `${t(failureLocations[task.failureLocation] ?? 'Unknown')} · ${t(errorCategories[task.taskError.code] ?? 'Unknown error category')}`
  }
  const pendingFrozenOutputs = task.outputs.filter(
    (output) =>
      output.executionStatus === 'UNKNOWN' && output.billingStatus === 'FROZEN'
  )
  // Legacy request-billed tasks have no output rows; the task itself is the frozen result.
  const legacyPendingTask =
    task.outputs.length === 0 &&
    task.executionStatus === 'UNKNOWN' &&
    task.customerBillingStatus === 'FROZEN'
  const hasPendingFrozenOutput =
    pendingFrozenOutputs.length > 0 || legacyPendingTask
  const releasableResultCount = legacyPendingTask
    ? 1
    : pendingFrozenOutputs.length
  const releasablePoints = legacyPendingTask
    ? task.quotedPoints
    : pendingFrozenOutputs
        .reduce((sum, output) => sum + BigInt(output.quotedPoints), 0n)
        .toString()
  const nodeStatus = customerNodeStatus(task)
  const deadline = customerDeadline(task)
  const points = customerPoints(task)
  const errorMessage = customerErrorMessage(
    task,
    i18n.resolvedLanguage || i18n.language
  )
  const showCustomerError = nodeStatus.failed
  const separateSubmissions =
    task.multiResultMode === 'FANOUT' && task.outputs.length > 1
  let upstreamTaskHelp: string | null = null
  if (hasPendingFrozenOutput) {
    upstreamTaskHelp = task.upstreamTaskId
      ? t('The system will continue querying the provider.')
      : t('The system will not query again; points can be released early.')
  }
  return (
    <div className='space-y-6'>
      <dl className='grid grid-cols-2 gap-4 lg:grid-cols-3'>
        <div className='col-span-full'>
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
        {hasPendingFrozenOutput ? (
          <DetailValue label='Latest point release time'>
            {formatTime(locale, task.unknownDeadlineAt)}
          </DetailValue>
        ) : null}
        <DetailValue label='Upstream task ID'>
          {separateSubmissions ? (
            <span className='text-muted-foreground'>
              {t(
                'Each result was submitted separately; see each provider call.'
              )}
            </span>
          ) : (
            <>
              <div className='font-mono'>{task.upstreamTaskId ?? '—'}</div>
              {upstreamTaskHelp ? (
                <p className='text-muted-foreground mt-1 text-xs'>
                  {upstreamTaskHelp}
                </p>
              ) : null}
            </>
          )}
        </DetailValue>
        {failure ? (
          <div className='col-span-full'>
            <DetailValue label='Failure summary'>{failure}</DetailValue>
          </div>
        ) : null}
      </dl>
      <Accordion
        defaultValue={
          task.derivedExecutionStatus === 'SUCCEEDED'
            ? []
            : ['customer-view', 'execution-details']
        }
      >
        {task.derivedExecutionStatus !== 'SUCCEEDED' ? (
          <AccordionItem value='customer-view'>
            <AccordionTrigger>{t('Customer sees')}</AccordionTrigger>
            <AccordionContent>
              <div className='space-y-4 rounded-lg border p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <span
                    className={
                      nodeStatus.failed
                        ? 'text-destructive text-sm font-medium'
                        : 'text-sm font-medium'
                    }
                  >
                    {t(nodeStatus.key)}
                  </span>
                  <span className='text-muted-foreground rounded-md border px-2 py-0.5 text-xs'>
                    {t('Customer task view task information')}
                  </span>
                </div>
                {task.outputs.length > 1 ? (
                  <ul className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                    {task.outputs.map((output) => (
                      <li
                        key={output.outputIndex}
                        className='bg-muted/40 rounded-md border p-2 text-xs'
                      >
                        {t('Customer task view result')}{' '}
                        {output.outputIndex + 1} ·{' '}
                        {t(customerOutputLabelKey(output))}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <section className='space-y-3 rounded-md border p-3 shadow-sm'>
                  <h4 className='text-sm font-medium'>
                    {t('Customer task view task information')}
                  </h4>
                  <dl className='space-y-3'>
                    <DetailValue label='Customer task view task ID'>
                      <CopyableText value={task.id} noTruncate />
                    </DetailValue>
                    {deadline.kind === 'hidden' ? null : (
                      <DetailValue label='Customer task view deadline'>
                        {deadline.kind === 'releasing'
                          ? t('Customer task view deadline releasing')
                          : formatTime(
                              locale,
                              deadline.kind === 'scheduled' ? deadline.at : null
                            )}
                        {deadline.kind === 'releasing' ? null : (
                          <p className='text-muted-foreground mt-1 text-xs'>
                            {t('Customer task view release notice')}
                          </p>
                        )}
                      </DetailValue>
                    )}
                    <DetailValue label='Customer task view points'>
                      {t(points.key, { points: points.points })}
                      {points.finalizedAt
                        ? `（${formatTime(locale, points.finalizedAt)}）`
                        : null}
                    </DetailValue>
                    {showCustomerError ? (
                      <DetailValue label='Customer task view error'>
                        {errorMessage.kind === 'key'
                          ? t(errorMessage.key)
                          : errorMessage.text}
                      </DetailValue>
                    ) : null}
                  </dl>
                </section>
              </div>
            </AccordionContent>
          </AccordionItem>
        ) : null}
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
      {hasPendingFrozenOutput ? (
        <div className='bg-background/95 sticky bottom-0 flex flex-col items-end gap-2 border-t py-4 backdrop-blur'>
          {!task.earlyReleaseAllowed && task.earlyReleaseBlockedReason ? (
            <p className='text-muted-foreground text-sm'>
              {t(
                earlyReleaseBlockedReasons[task.earlyReleaseBlockedReason] ??
                  'This task is not eligible for early point release.'
              )}
            </p>
          ) : null}
          <Button
            type='button'
            variant='destructive'
            disabled={!task.earlyReleaseAllowed}
            onClick={() => setReleaseOpen(true)}
          >
            {t('Release frozen points early')}
          </Button>
        </div>
      ) : null}
      <AlertDialog open={releaseOpen} onOpenChange={setReleaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Release frozen points early')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {task.outputs.length > 1
                ? t(
                    'Release {{points}} frozen points for {{count}} pending results. This does not send a cancellation request to the provider.',
                    { points: releasablePoints, count: releasableResultCount }
                  )
                : t(
                    'Release {{points}} frozen points for this task. This does not send a cancellation request to the provider.',
                    { points: releasablePoints }
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='space-y-4'>
            {releaseConflict ? (
              <p
                className='border-destructive/35 text-destructive rounded-md border p-3 text-sm'
                role='alert'
              >
                {t(
                  'Task status changed and details were refreshed. Your input was kept and the request was not retried.'
                )}
              </p>
            ) : null}
            <label className='flex items-start gap-2 text-sm'>
              <Checkbox
                checked={upstreamFailureConfirmed}
                onCheckedChange={(checked) =>
                  setUpstreamFailureConfirmed(checked === true)
                }
              />
              <span>{t('Provider failure was confirmed')}</span>
            </label>
            <p className='text-muted-foreground text-sm'>
              {t(
                upstreamFailureConfirmed
                  ? 'The result will be marked failed and asynchronous capacity will be returned immediately.'
                  : 'The system stops querying and later provider results will not be delivered to the customer. If the provider already charged, the platform bears the cost. Asynchronous capacity remains occupied until the execution deadline.'
              )}
            </p>
            <div className='space-y-1'>
              <label htmlFor='release-reason' className='text-sm font-medium'>
                {t('Administrator reason')}
              </label>
              <Textarea
                id='release-reason'
                value={releaseReason}
                maxLength={1000}
                aria-invalid={reasonTried && releaseReason.trim() === ''}
                aria-describedby='release-reason-help'
                placeholder={t(
                  'Describe the verification channel and conclusion. Do not include secrets or unsanitized responses.'
                )}
                onChange={(event) => setReleaseReason(event.target.value)}
              />
              <div
                id='release-reason-help'
                className='text-muted-foreground flex justify-between text-xs'
              >
                <span>{t('Recorded only in the audit log')}</span>
                <span className='tabular-nums'>
                  {releaseReason.trim().length} / 1000
                </span>
              </div>
              {reasonTried && releaseReason.trim() === '' ? (
                <p className='text-destructive text-xs' role='alert'>
                  {t('Enter a reason.')}
                </p>
              ) : null}
            </div>
            <label className='flex items-start gap-2 text-sm'>
              <Checkbox
                checked={impactConfirmed}
                onCheckedChange={(checked) =>
                  setImpactConfirmed(checked === true)
                }
              />
              <span>{t('I understand the impact of this operation')}</span>
            </label>
            {releaseError ? (
              <p className='text-destructive text-sm' role='alert'>
                {releaseError}
              </p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={release.isPending || !impactConfirmed}
              onClick={(event) => {
                event.preventDefault()
                setReasonTried(true)
                if (releaseReason.trim() === '') {
                  document.getElementById('release-reason')?.focus()
                  return
                }
                release.mutate()
              }}
            >
              {t(
                release.isPending
                  ? 'Submitting…'
                  : 'Release frozen points early'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

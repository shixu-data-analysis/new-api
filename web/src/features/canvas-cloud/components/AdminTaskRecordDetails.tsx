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
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
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

import { endableResults } from '../admin-task-end'
import { getCanvasAdminTaskRecord, getCanvasTaskPointLedger } from '../api'
import {
  ADMIN_CONFIRMED_UPSTREAM_FAILURE_CODE,
  customerDeadline,
  customerErrorMessage,
  customerUpstreamReason,
  customerNodeStatus,
  customerOutputLabelKey,
  customerPoints,
} from '../customer-task-view'
import {
  tokenCategoryLabel,
  tokenCategoryLabelKey,
} from '../lib/token-rate-summary'
import { formatExactRmbReference } from '../number-format'
import type {
  CanvasAdminTaskPointRecord,
  CanvasAdminTaskRecordDetail,
  CanvasAdminTokenBilling,
  CanvasTaskPlatformIssue,
  CanvasTokenCategory,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import { DetailValue } from './DetailValue'
import { EndTaskDialog } from './EndTaskDialog'
import { ManualResultDialog } from './ManualResultDialog'
import { PreflightDiagnosticDetails } from './PreflightDiagnosticDetails'
import {
  ProviderCostRevocationDialog,
  ProviderCostSettlementDialog,
} from './ProviderCostSettlementDialogs'
import { TableRowPanel } from './TableRowPanel'
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
  OUTPUT_DOWNLOAD: 'Output download',
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
  PROVIDER_MODEL_UNAVAILABLE: 'Provider model unavailable',
  PROVIDER_REQUEST_TIMEOUT: 'Provider request timed out',
  PROVIDER_RATE_LIMITED: 'Provider rate limited',
  PROVIDER_INTERNAL_ERROR: 'Provider internal error',
  PROVIDER_BAD_GATEWAY: 'Provider bad gateway',
  PROVIDER_UNAVAILABLE: 'Provider unavailable',
  PROVIDER_GATEWAY_TIMEOUT: 'Provider gateway timed out',
  PROVIDER_UNKNOWN_ERROR: 'Unknown provider error',
  PROVIDER_OUTPUT_TOO_LARGE: 'Result file too large',
  PROVIDER_OUTPUT_LOCATION_REJECTED: 'Result address rejected',
  PROVIDER_OUTPUT_DOWNLOAD_FAILED: 'Result download failed',
  PROVIDER_OUTPUT_UNSUPPORTED_MEDIA: 'Result is not usable media',
  PROVIDER_OUTPUT_INVALID: 'Result file invalid',
  OUTPUT_STORAGE_FAILED: 'Result storage failed',
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
const manualResultStatuses: Record<string, string> = {
  PENDING: 'Waiting for the executor',
  APPLIED: 'Manual result applied',
  FAILED: 'Manual result not applied',
}
// A manual result fails for an output retrieval reason (errorCategories) or because its result stopped waiting.
const manualResultFailureReasons: Record<string, string> = {
  OUTPUT_NOT_AWAITING_RESULT:
    'The result no longer waited: the provider answered first or the points were released',
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
/** A time of day, as Canvas Web shows the retry time to the customer (`formatTaskTime()`). */
function formatClock(
  locale: string | undefined,
  value: string,
  timeStyle: 'short' | 'medium'
) {
  return new Intl.DateTimeFormat(locale, { timeStyle }).format(new Date(value))
}
function platformIssueFacts(issue: CanvasTaskPlatformIssue) {
  return [issue.errorName, issue.errorCode, issue.location]
    .filter((fact) => fact !== null)
    .join(' · ')
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
/**
 * What a Token task's points were worked out from, as its Quote froze it: rates, multiplier and the hold, from a text
 * task's input estimate and output limit or from an image task's estimated Tokens of all its pictures.
 */
function TokenBillingSnapshot(props: {
  billing: CanvasAdminTokenBilling
  heldPoints: string
  locale: string | undefined
}) {
  const { t } = useTranslation()
  const { billing } = props
  const count = (value: number | string) =>
    new Intl.NumberFormat(props.locale).format(Number(value))
  const priced = Object.keys(billing.tokenRates)
  // Each category with a value, in the display order and by its name.
  const byCategory = (values: Partial<Record<CanvasTokenCategory, string>>) =>
    (Object.keys(tokenCategoryLabel) as CanvasTokenCategory[])
      .filter((category) => typeof values[category] === 'string')
      .map(
        (category) =>
          `${t(tokenCategoryLabelKey(category, priced))} ${values[category]}`
      )
      .join(' · ')
  const rates = byCategory(billing.tokenRates)
  // Image and video tasks: the estimate of all results the hold was worked out from (VIDEO-TOKEN-BILLING-001).
  const estimate = billing.resultEstimate
  const estimatedUsage = estimate
    ? byCategory(
        Object.fromEntries(
          Object.entries(estimate.tokens).map(([category, tokens]) => [
            category,
            count(tokens ?? '0'),
          ])
        )
      )
    : ''
  let multiplier = t('Not set')
  if (billing.timeOfDay?.ruleIndex === null) {
    multiplier = t('×1, outside every period')
  } else if (billing.timeOfDay) {
    multiplier = t('×{{multiplier}}, period {{period}}', {
      multiplier: billing.timeOfDay.multiplier,
      period: billing.timeOfDay.ruleIndex + 1,
    })
  }
  let outputLimit = t('Output limit: not limited')
  if (billing.maxTokens !== null && billing.requestedMaxTokens === null) {
    outputLimit = t('Output limit: {{tokens}} Tokens (automatic)', {
      tokens: count(billing.maxTokens),
    })
  } else if (
    billing.maxTokens !== null &&
    billing.requestedMaxTokens !== null
  ) {
    outputLimit =
      billing.requestedMaxTokens === billing.maxTokens
        ? t('Output limit: {{tokens}} Tokens (set by the customer)', {
            tokens: count(billing.maxTokens),
          })
        : t(
            'Output limit: {{tokens}} Tokens (customer set {{requested}}, reduced to the context left)',
            {
              tokens: count(billing.maxTokens),
              requested: count(billing.requestedMaxTokens),
            }
          )
  }
  return (
    <ul className='space-y-1'>
      <li>{t('Rates: {{rates}} points per million Tokens', { rates })}</li>
      <li>{t('Time-of-day multiplier: {{value}}', { value: multiplier })}</li>
      {billing.inputTokensEstimate === null ? null : (
        <li>
          {t('Input estimate: {{tokens}} Tokens, held {{points}} points', {
            tokens: count(billing.inputTokensEstimate),
            points: props.heldPoints,
          })}
        </li>
      )}
      {estimate ? (
        <li>
          {estimate.resultKind === 'VIDEO'
            ? t(
                'Estimated usage: {{usage}} Tokens for {{results}} videos, held {{points}} points',
                {
                  usage: estimatedUsage,
                  results: estimate.results,
                  points: props.heldPoints,
                }
              )
            : t(
                'Estimated usage: {{usage}} Tokens for {{pictures}} pictures, held {{points}} points',
                {
                  usage: estimatedUsage,
                  pictures: estimate.results,
                  points: props.heldPoints,
                }
              )}
        </li>
      ) : (
        // An image or video has no output limit.
        <li>{outputLimit}</li>
      )}
    </ul>
  )
}

const incompleteCostReasons: Record<string, string> = {
  MISSING_USAGE: 'Missing complete usage',
  MISSING_RATE: 'Missing purchase rate',
  UNKNOWN_RESULT: 'Call result unknown',
  UNCLASSIFIED: 'Unclassified',
}

/**
 * Cost line of one submit call (or of a legacy Task whose cost is recorded at Task level when callId is null): incomplete
 * cost can be settled, an active manual settlement can be revoked. Nothing is shown when the cost is system-recorded.
 */
/** The cost entries one submit call shows: incomplete cost to settle, or a confirmed manual settlement. */
function providerCallCostEntries(
  task: CanvasAdminTaskRecordDetail,
  callId: string | null
) {
  const cost = task.providerCost
  if (!cost) return null
  const incomplete = cost.incompleteCalls.find(
    (entry) => entry.callId === callId
  )
  const settlement = cost.manualSettlements.find(
    (entry) => entry.callId === callId && entry.status === 'CONFIRMED'
  )
  return incomplete || settlement ? { incomplete, settlement } : null
}

function ProviderCallCost(props: {
  task: CanvasAdminTaskRecordDetail
  callId: string | null
  upstreamTaskId?: string | null
  upstreamRequestId?: string | null
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [settleOpen, setSettleOpen] = useState(false)
  const [revokeId, setRevokeId] = useState<string>()
  const entries = providerCallCostEntries(props.task, props.callId)
  if (!entries) return null
  const { incomplete, settlement } = entries
  let status: ReactNode = null
  if (incomplete) {
    status = (
      <span>
        {t('{{label}}: ', { label: t('Provider cost') })}
        {t('Incomplete cost data')} ·{' '}
        {t(incompleteCostReasons[incomplete.reason] ?? 'Unclassified')}
      </span>
    )
  } else if (settlement) {
    const charged =
      Number(settlement.amountRmb) === 0
        ? t('API provider did not charge')
        : t('Manually recorded {{amount}}', {
            amount: `¥${formatExactRmbReference(settlement.amountRmb, locale, 2)}`,
          })
    status = (
      <span>
        {t('{{label}}: ', { label: t('Provider cost') })}
        {t('Settled manually')} · {charged}
        {settlement.settledBy ? ` · ${settlement.settledBy}` : ''} ·{' '}
        {formatTime(locale, settlement.settledAt)}
      </span>
    )
  }
  return (
    <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
      {status}
      {incomplete?.canSettle ? (
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => setSettleOpen(true)}
        >
          {t('Settle cost')}
        </Button>
      ) : null}
      {settlement?.canRevoke ? (
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() => setRevokeId(settlement.providerCostId)}
        >
          {t('Revoke settlement')}
        </Button>
      ) : null}
      <ProviderCostSettlementDialog
        open={settleOpen}
        onOpenChange={setSettleOpen}
        taskId={props.task.id}
        callId={props.callId}
        upstreamTaskId={
          props.upstreamTaskId ??
          (props.callId === null ? props.task.upstreamTaskId : null)
        }
        upstreamRequestId={props.upstreamRequestId}
      />
      {revokeId ? (
        <ProviderCostRevocationDialog
          open
          onOpenChange={(open) => {
            if (!open) setRevokeId(undefined)
          }}
          taskId={props.task.id}
          providerCostId={revokeId}
        />
      ) : null}
    </div>
  )
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
            <PreflightDiagnosticDetails diagnostic={task.preflightDiagnostic} />
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
            ...(task.multiResultMode
              ? { multiResultMode: task.multiResultMode.toLowerCase() }
              : {}),
            ...Object.fromEntries(parameters),
          }}
          description={t(
            'Parameters frozen when the task was accepted; the prompt and input media are not included.'
          )}
        />
      </section>
      <section className='space-y-3'>
        <h3 className='text-sm font-medium'>{t('Provider calls')}</h3>
        <ProviderCallCost task={task} callId={null} />
        <TaskCallHistory
          taskId={task.id}
          inputAssets={task.inputAssets}
          outputs={task.outputs}
          taskSucceeded={task.derivedExecutionStatus === 'SUCCEEDED'}
          renderCallCost={(call) =>
            // No row at all when the call has nothing to show; an empty cost row is a blank strip.
            call.callType === 'SUBMIT' &&
            providerCallCostEntries(task, call.localCallId) ? (
              <ProviderCallCost
                task={task}
                callId={call.localCallId}
                upstreamTaskId={call.upstreamTaskId}
                upstreamRequestId={call.upstreamRequestId}
              />
            ) : null
          }
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
            'Source point lot remaining points',
            pair(record.sourceRemainingBefore, record.sourceRemainingAfter),
          ],
          [
            'Source point lot frozen points',
            pair(record.sourceReservedBefore, record.sourceReservedAfter),
          ],
          [
            'Target point lot remaining points',
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
            'Point lot remaining points',
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
            <TableRowPanel>
              <PointDetails record={row.original} />
            </TableRowPanel>
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

export function AdminTaskRecordDetails({ taskId }: { taskId: string }) {
  const { t, i18n } = useTranslation()
  const [endTaskOpen, setEndTaskOpen] = useState(false)
  const [manualResultOpen, setManualResultOpen] = useState(false)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const query = useQuery({
    queryKey: ['canvas-cloud', 'task-record', taskId],
    queryFn: ({ signal }) => getCanvasAdminTaskRecord(taskId, signal),
    retry: false,
    // The executor applies a manual result after it is submitted; refresh until it is applied or not applied.
    refetchInterval: (current) =>
      current.state.data?.manualResults.some(
        (manual) => manual.status === 'PENDING'
      )
        ? 5_000
        : false,
  })
  // While the drawer stays open, the customer view counts down to the point release; the clock stops once the deadline
  // has passed, and whether the points were released still comes from the API.
  const releaseDeadlineAt =
    query.data?.executionStatus === 'UNKNOWN' &&
    query.data.customerBillingStatus === 'FROZEN'
      ? query.data.unknownDeadlineAt
      : null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const deadline = releaseDeadlineAt
      ? Date.parse(releaseDeadlineAt)
      : Number.NaN
    if (!Number.isFinite(deadline)) return
    const tick = () => {
      const current = Date.now()
      setNow(current)
      if (current >= deadline) window.clearInterval(timer)
    }
    const timer = window.setInterval(tick, 10_000)
    tick()
    return () => window.clearInterval(timer)
  }, [releaseDeadlineAt])
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
  const endable = endableResults(task)
  const nodeStatus = customerNodeStatus(task, now)
  const deadline = customerDeadline(task, now)
  const points = customerPoints(task)
  const errorMessage = customerErrorMessage(
    task,
    i18n.resolvedLanguage || i18n.language
  )
  const upstreamReason = customerUpstreamReason(task)
  const showCustomerError = nodeStatus.failed
  const platformIssue = task.platformIssue
  let latestReleaseAt: string | null | undefined
  if (platformIssue) latestReleaseAt = platformIssue.releaseAt ?? undefined
  else if (hasPendingFrozenOutput) latestReleaseAt = task.unknownDeadlineAt
  let nodeStatusClassName = 'text-sm font-medium'
  if (nodeStatus.failed) {
    nodeStatusClassName = 'text-destructive text-sm font-medium'
  } else if (nodeStatus.attention) {
    nodeStatusClassName =
      'text-sm font-medium text-amber-700 dark:text-amber-400'
  }
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
        {task.tokenBilling ? (
          <DetailValue label='Billing snapshot'>
            <TokenBillingSnapshot
              billing={task.tokenBilling}
              heldPoints={task.quotedPoints}
              locale={locale}
            />
          </DetailValue>
        ) : null}
        {latestReleaseAt !== undefined ? (
          <DetailValue label='Latest point release time'>
            {formatTime(locale, latestReleaseAt)}
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
        {platformIssue ? (
          <div className='col-span-full rounded-lg border border-amber-500/40 bg-amber-500/5 p-3'>
            <DetailValue label='Platform error'>
              {t(
                'Error at {{occurredAt}}, retried automatically at {{retryAt}}, and at once after the fix is released.',
                {
                  occurredAt: formatClock(
                    locale,
                    platformIssue.occurredAt,
                    'medium'
                  ),
                  retryAt: formatClock(locale, platformIssue.retryAt, 'medium'),
                }
              )}
              {platformIssueFacts(platformIssue) ? (
                <p className='text-muted-foreground mt-1 font-mono text-xs [overflow-wrap:anywhere]'>
                  {platformIssueFacts(platformIssue)}
                </p>
              ) : null}
            </DetailValue>
          </div>
        ) : null}
        {failure ? (
          <div className='col-span-full'>
            <DetailValue label='Failure summary'>{failure}</DetailValue>
          </div>
        ) : null}
      </dl>
      <Accordion
        defaultValue={[
          ...(task.derivedExecutionStatus === 'SUCCEEDED'
            ? []
            : ['customer-view', 'execution-details']),
          ...(task.manualResults.length > 0 ? ['manual-results'] : []),
        ]}
      >
        {task.derivedExecutionStatus !== 'SUCCEEDED' ? (
          <AccordionItem value='customer-view'>
            <AccordionTrigger>{t('Customer sees')}</AccordionTrigger>
            <AccordionContent>
              <div className='space-y-4 rounded-lg border p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <span className='grid gap-0.5'>
                    <span className={nodeStatusClassName}>
                      {t(nodeStatus.key)}
                    </span>
                    {platformIssue ? (
                      <span className='text-muted-foreground text-xs'>
                        {t('Customer task view retry at', {
                          time: formatClock(
                            locale,
                            platformIssue.retryAt,
                            'short'
                          ),
                        })}
                      </span>
                    ) : null}
                    {!platformIssue &&
                    deadline.kind === 'scheduled' &&
                    !deadline.countdown.expired ? (
                      <span className='text-muted-foreground text-xs'>
                        {t('Customer task view release in', {
                          relative: t(
                            deadline.countdown.key,
                            deadline.countdown.values
                          ),
                        })}
                      </span>
                    ) : null}
                  </span>
                  <span className='text-muted-foreground rounded-md border px-2 py-0.5 text-xs'>
                    {t(
                      platformIssue
                        ? 'Customer task view contact us'
                        : 'Customer task view task information'
                    )}
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
                    {platformIssue ? (
                      <DetailValue label='Customer task view platform note'>
                        {t('Customer task view platform note text', {
                          time: formatClock(
                            locale,
                            platformIssue.retryAt,
                            'short'
                          ),
                        })}
                        <p className='text-muted-foreground mt-1 text-xs'>
                          {t('Customer task view platform contact')}
                        </p>
                      </DetailValue>
                    ) : null}
                    {deadline.kind === 'hidden' ? null : (
                      <DetailValue label='Customer task view deadline'>
                        {deadline.kind === 'scheduled'
                          ? t('Customer task view deadline value', {
                              date: formatTime(locale, deadline.at),
                              relative: t(
                                deadline.countdown.key,
                                deadline.countdown.values
                              ),
                            })
                          : formatTime(locale, null)}
                        <p className='text-muted-foreground mt-1 text-xs'>
                          {t(
                            deadline.kind === 'scheduled' &&
                              deadline.countdown.expired
                              ? 'Customer task view releasing notice'
                              : 'Customer task view release notice'
                          )}
                        </p>
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
                        {upstreamReason ? (
                          <span className='text-muted-foreground block text-xs [overflow-wrap:anywhere]'>
                            {t('Customer task view upstream reason', {
                              reason: upstreamReason,
                            })}
                          </span>
                        ) : null}
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
        {task.manualResults.length > 0 ? (
          <AccordionItem value='manual-results'>
            <AccordionTrigger>{t('Manual result records')}</AccordionTrigger>
            <AccordionContent>
              <ul className='divide-y text-sm'>
                {task.manualResults.map((manual) => (
                  <li key={manual.id} className='space-y-1 py-3 first:pt-0'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='font-medium'>
                        {t('Result {{position}}', {
                          position: manual.outputIndex + 1,
                        })}
                      </span>
                      <span
                        className={
                          manual.status === 'FAILED'
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                        }
                      >
                        {t(manualResultStatuses[manual.status] ?? 'Unknown')}
                      </span>
                    </div>
                    {manual.status === 'FAILED' && manual.failureReasonCode ? (
                      <p className='text-destructive'>
                        {t(
                          manualResultFailureReasons[
                            manual.failureReasonCode
                          ] ??
                            errorCategories[manual.failureReasonCode] ??
                            'Unknown error category'
                        )}
                      </p>
                    ) : null}
                    {manual.upstreamTaskId ? (
                      <p className='text-muted-foreground text-xs'>
                        {t('Upstream task ID')}{' '}
                        <span className='font-mono [overflow-wrap:anywhere]'>
                          {manual.upstreamTaskId}
                        </span>
                      </p>
                    ) : null}
                    <p className='font-mono text-xs [overflow-wrap:anywhere]'>
                      {manual.resultUrl}
                    </p>
                    {manual.reason ? (
                      <p className='[overflow-wrap:anywhere]'>
                        {manual.reason}
                      </p>
                    ) : null}
                    <p className='text-muted-foreground text-xs'>
                      {t('Submitted by {{name}} at {{time}}', {
                        name:
                          manual.requestedBy.displayName ??
                          t('Unknown administrator'),
                        time: formatTime(locale, manual.createdAt),
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ) : null}
        <AccordionItem value='point-records'>
          <AccordionTrigger>{t('Point records')}</AccordionTrigger>
          <AccordionContent>
            <TaskPointRecords taskId={task.id} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      {endable.count > 0 ? (
        <div className='bg-background/95 sticky bottom-0 flex justify-end border-t py-4 backdrop-blur'>
          <Button
            type='button'
            variant='destructive'
            onClick={() => setEndTaskOpen(true)}
          >
            {t('End task')}
          </Button>
        </div>
      ) : null}
      <EndTaskDialog
        task={task}
        open={endTaskOpen}
        onOpenChange={setEndTaskOpen}
        onEnterManualResult={() => setManualResultOpen(true)}
      />
      <ManualResultDialog
        task={task}
        open={manualResultOpen}
        onOpenChange={setManualResultOpen}
      />
    </div>
  )
}

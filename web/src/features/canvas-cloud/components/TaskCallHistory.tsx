/* Copyright (C) 2023-2026 QuantumNous; licensed under GNU AGPL v3 or later. */
import { useQuery } from '@tanstack/react-query'
import { flexRender, type ColumnDef, type Row } from '@tanstack/react-table'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasTaskCalls, type CanvasTaskCall } from '../task-call-api'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'

const callTypes: Record<string, string> = {
  SUBMIT: 'Submit task',
  PREPARE_ASSET: 'Prepare media',
}
const chainStates: Record<string, string> = {
  NOT_SENT: 'Not sent',
  AWAITING_RESPONSE: 'Awaiting response',
  RESPONDED: 'Responded',
  OUTCOME_UNKNOWN: 'Outcome pending confirmation',
}
const present = (input: string | number | null | undefined) =>
  input === null || input === undefined || input === '' ? '—' : input

function callResponse(call: CanvasTaskCall) {
  if (call.initialHttpStatus === null) return '—'
  return call.finalHttpStatus !== null &&
    call.finalHttpStatus !== call.initialHttpStatus
    ? `${call.initialHttpStatus} → ${call.finalHttpStatus}`
    : String(call.initialHttpStatus)
}

function CallDetails({ call }: { call: CanvasTaskCall }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const time = (input: string | null) =>
    input
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'medium',
        }).format(new Date(input))
      : '—'
  const request =
    call.sanitizedRequest === null
      ? null
      : JSON.stringify(call.sanitizedRequest, null, 2)
  const fields: Array<[string, ReactNode]> = [
    ['Upstream model', present(call.upstreamModelId)],
    [
      'API key group',
      call.credentialGroupName
        ? `${call.credentialGroupName}${call.credentialGroupVersion === null ? '' : ` · ${t('Version')} ${call.credentialGroupVersion}`}`
        : '—',
    ],
    [
      'Call ID',
      <CopyableText key='call' value={call.localCallId} noTruncate />,
    ],
    ['Executor', present(call.workerId)],
    [
      'Upstream request ID',
      call.upstreamRequestId ? (
        <CopyableText key='request' value={call.upstreamRequestId} noTruncate />
      ) : (
        '—'
      ),
    ],
    [
      'Upstream task ID',
      call.upstreamTaskId ? (
        <CopyableText key='task' value={call.upstreamTaskId} noTruncate />
      ) : (
        '—'
      ),
    ],
    ['Request sent at', time(call.sentAt)],
    ['Final provider response at', time(call.finalRespondedAt)],
    ['Provider error code', present(call.errorCode)],
    [
      'Error mapping rule',
      call.errorRuleId
        ? `${call.errorRuleId}${call.errorRuleVersion === null ? '' : ` · ${t('Version')} ${call.errorRuleVersion}`}`
        : '—',
    ],
    ['Safe error details', present(call.sanitizedError)],
  ]
  return (
    <div className='space-y-4 py-2'>
      <dl className='grid gap-4 sm:grid-cols-2'>
        {fields.map(([label, content]) => (
          <div className='min-w-0' key={label}>
            <dt className='text-muted-foreground text-sm'>{t(label)}</dt>
            <dd className='mt-1 text-sm [overflow-wrap:anywhere] break-words'>
              {content}
            </dd>
          </div>
        ))}
      </dl>
      {request ? (
        <details>
          <summary className='cursor-pointer text-sm font-medium'>
            {t(
              call.sentAt
                ? 'Sent upstream request (sanitized)'
                : 'Prepared upstream request (sanitized)'
            )}
          </summary>
          <pre className='bg-muted mt-2 max-h-80 overflow-auto rounded-md p-3 text-xs [overflow-wrap:anywhere] whitespace-pre-wrap'>
            {request}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

export function TaskCallHistory({ taskId }: { taskId: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const state = useServerTableState('startedAt')
  const [expanded, setExpanded] = useState<string>()
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'task-calls',
      taskId,
      state.query.page,
      state.query.pageSize,
    ],
    queryFn: ({ signal }) =>
      getCanvasTaskCalls(
        taskId,
        { page: state.query.page, pageSize: state.query.pageSize },
        signal
      ),
    retry: false,
  })
  const columns = useMemo<ColumnDef<CanvasTaskCall, unknown>[]>(
    () => [
      {
        id: 'startedAt',
        header: t('Call started at'),
        cell: ({ row }) =>
          row.original.startedAt
            ? new Intl.DateTimeFormat(locale, {
                dateStyle: 'short',
                timeStyle: 'medium',
              }).format(new Date(row.original.startedAt))
            : '—',
      },
      {
        id: 'callType',
        header: t('Type'),
        cell: ({ row }) => (
          <>
            {t(callTypes[row.original.callType] ?? 'Unknown call type')}
            {row.original.attemptCount > 1
              ? ` · ${t('Attempt count', { count: row.original.attemptCount })}`
              : ''}
          </>
        ),
      },
      {
        id: 'related',
        header: t('Related object'),
        cell: ({ row }) =>
          row.original.outputIndices.length
            ? row.original.outputIndices
                .map(
                  (index) =>
                    `${t(row.original.callType === 'PREPARE_ASSET' ? 'Input asset' : 'Result')} ${index + 1}`
                )
                .join(' · ')
            : '—',
      },
      {
        id: 'provider',
        header: t('Provider / channel'),
        cell: ({ row }) =>
          [
            row.original.providerName,
            row.original.channelCode,
            row.original.channelVersion === null
              ? null
              : `${t('Version')} ${row.original.channelVersion}`,
          ]
            .filter(Boolean)
            .join(' / ') || '—',
      },
      {
        id: 'state',
        header: t('Call status'),
        cell: ({ row }) =>
          t(chainStates[row.original.chainState] ?? 'Unknown call state'),
      },
      {
        id: 'response',
        header: t('Response'),
        cell: ({ row }) => callResponse(row.original),
      },
      {
        id: 'duration',
        header: t('Duration'),
        cell: ({ row }) =>
          row.original.durationMs === null
            ? '—'
            : t('Duration seconds', { count: row.original.durationMs / 1000 }),
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
            aria-expanded={expanded === row.original.localCallId}
            onClick={() =>
              setExpanded((current) =>
                current === row.original.localCallId
                  ? undefined
                  : row.original.localCallId
              )
            }
          >
            {t(
              expanded === row.original.localCallId ? 'Hide details' : 'Details'
            )}
          </Button>
        ),
      },
    ],
    [expanded, locale, t]
  )
  const rowRenderer = (row: Row<CanvasTaskCall>) => (
    <Fragment key={row.id}>
      <TableRow>
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
      {expanded === row.original.localCallId ? (
        <TableRow>
          <TableCell colSpan={row.getVisibleCells().length}>
            <CallDetails call={row.original} />
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
      errorTitle={t('Unable to load provider calls')}
      onRetry={() => void query.refetch()}
      emptyTitle={t('No provider calls')}
      getRowId={(row) => row.localCallId}
      renderRow={rowRenderer}
      renderExpandedContent={(row) =>
        expanded === row.original.localCallId ? (
          <CallDetails call={row.original} />
        ) : null
      }
    />
  )
}

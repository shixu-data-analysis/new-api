/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/

import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasTaskCalls, type CanvasTaskCall } from '../task-call-api'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'

const text = (value: unknown) =>
  value == null || value === '' ? '—' : String(value)
const ids = (call: CanvasTaskCall) =>
  [
    call.localCallId,
    call.submissionId,
    call.upstreamRequestId,
    call.upstreamTaskId,
  ]
    .filter(Boolean)
    .join(' · ')
const callLabels: Record<string, string> = {
  SUBMIT: 'Provider submission',
  QUERY: 'Provider query',
}
const originLabels: Record<string, string> = {
  MOCK: 'Test',
  REAL: 'Production',
}
const stateLabels: Record<string, string> = {
  PREPARED: 'Prepared',
  SENT: 'Sent',
  RESPONDED: 'Responded',
  UNKNOWN: 'Unknown call state',
}
const categoryLabels: Record<string, string> = {
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

export function TaskCallHistory({ taskId }: { taskId: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const state = useServerTableState('startedAt')
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
        {
          page: state.query.page,
          pageSize: state.query.pageSize as 10 | 20 | 50 | 100,
        },
        signal
      ),
    retry: false,
  })
  const columns = useMemo<ColumnDef<CanvasTaskCall, unknown>[]>(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const formatTime = (value: string | null) =>
      value ? formatter.format(new Date(value)) : '—'
    return [
      {
        id: 'call',
        accessorKey: 'localCallId',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Call')} />
        ),
        cell: ({ row }) => (
          <div className='space-y-1'>
            <div>
              {t(callLabels[row.original.callType] ?? 'Unknown call type')} ·{' '}
              {t(stateLabels[row.original.state] ?? 'Unknown call state')}
            </div>
            <code className='text-xs'>{ids(row.original)}</code>
          </div>
        ),
      },
      {
        id: 'source',
        accessorKey: 'executionOrigin',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Source')} />
        ),
        cell: ({ row }) => (
          <div>
            {t(originLabels[row.original.executionOrigin ?? ''] ?? 'Unknown')} ·{' '}
            {t('Attempt')} {row.original.attemptCount}
            <br />
            {text(row.original.workerId)}
          </div>
        ),
      },
      {
        id: 'outputs',
        accessorKey: 'outputIndices',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Output positions')}
          />
        ),
        cell: ({ row }) => row.original.outputIndices.join(', ') || '—',
      },
      {
        id: 'timing',
        accessorKey: 'startedAt',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Timing')} />
        ),
        cell: ({ row }) => (
          <div>
            {formatTime(row.original.startedAt)}
            <br />
            {formatTime(row.original.completedAt)}
          </div>
        ),
      },
      {
        id: 'http',
        accessorKey: 'httpStatus',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('HTTP status')} />
        ),
        cell: ({ row }) => text(row.original.httpStatus),
      },
      {
        id: 'error',
        accessorKey: 'errorCategory',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Error details')} />
        ),
        cell: ({ row }) => (
          <div>
            {row.original.errorCategory
              ? t(
                  categoryLabels[row.original.errorCategory] ??
                    'Unknown error category'
                )
              : '—'}{' '}
            · {text(row.original.errorCode)}
            <br />
            {text(row.original.errorRuleId)} v
            {text(row.original.errorRuleVersion)}
            <br />
            {text(row.original.sanitizedError)}
          </div>
        ),
      },
    ]
  }, [locale, t])

  return (
    <div className='space-y-3'>
      {query.isError ? (
        <div className='border-destructive/30 text-destructive flex items-center justify-between rounded-md border p-3 text-sm'>
          <span>{t('Unable to load task call history.')}</span>
          <Button
            variant='outline'
            size='sm'
            onClick={() => void query.refetch()}
          >
            {t('Retry')}
          </Button>
        </div>
      ) : null}
      <CanvasServerTable
        data={query.data?.items ?? []}
        columns={columns}
        total={query.data?.total ?? 0}
        state={state}
        loading={query.isPending || query.isFetching}
        emptyTitle={t('No task call history')}
        getRowId={(row) => row.localCallId}
      />
    </div>
  )
}

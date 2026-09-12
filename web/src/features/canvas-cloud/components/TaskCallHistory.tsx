/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'

import { isCanvasDateRangeValid } from '../date-range'
import { getCanvasTaskCalls, type CanvasTaskCall } from '../task-call-api'
import { useServerTableState } from '../use-server-table-state'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'

const callStates = ['PREPARED', 'SENT', 'RESPONDED', 'UNKNOWN'] as const
const callLabels: Record<string, string> = {
  SUBMIT: 'Provider submission',
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

function callDuration(call: CanvasTaskCall, t: (key: string) => string) {
  if (!call.completedAt) return t('In progress')
  if (!call.startedAt) return '—'
  const seconds = Math.max(
    0,
    Math.round(
      (new Date(call.completedAt).getTime() -
        new Date(call.startedAt).getTime()) /
        1000
    )
  )
  return `${seconds} ${t('seconds')}`
}

function CallIdentifiers({ call }: { call: CanvasTaskCall }) {
  const { t } = useTranslation()
  return (
    <div className='space-y-1 text-xs [overflow-wrap:anywhere]'>
      <div className='flex flex-wrap items-center gap-1'>
        <span className='text-muted-foreground'>{t('Call ID')}:</span>
        <CopyableText value={call.localCallId} />
      </div>
      {call.upstreamRequestId ? (
        <div className='flex flex-wrap items-center gap-1'>
          <span className='text-muted-foreground'>
            {t('Upstream request ID')}:
          </span>
          <CopyableText value={call.upstreamRequestId} />
        </div>
      ) : null}
      {call.upstreamTaskId ? (
        <div className='flex flex-wrap items-center gap-1'>
          <span className='text-muted-foreground'>
            {t('Upstream task ID')}:
          </span>
          <CopyableText value={call.upstreamTaskId} />
        </div>
      ) : null}
      {call.workerId ? (
        <div>
          <span className='text-muted-foreground'>{t('Executor')}:</span>{' '}
          {call.workerId}
        </div>
      ) : null}
      {call.errorCategory || call.sanitizedError ? (
        <div className='text-destructive [overflow-wrap:anywhere]'>
          {call.errorCategory
            ? t(categoryLabels[call.errorCategory] ?? 'Unknown error category')
            : null}
          {call.errorCategory && call.sanitizedError ? ' · ' : null}
          {call.sanitizedError}
        </div>
      ) : null}
    </div>
  )
}

export function TaskCallHistory({ taskId }: { taskId: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const state = useServerTableState('startedAt')
  const setPagination = state.setPagination
  const [callState, setCallState] = useState('')
  const [outputIndexText, setOutputIndexText] = useState('')
  const [httpStatusText, setHttpStatusText] = useState('')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const debouncedOutputIndexText = useDebounce(outputIndexText.trim(), 300)
  const debouncedHttpStatusText = useDebounce(httpStatusText.trim(), 300)
  const dateRangeValid = isCanvasDateRangeValid(from, to)
  const outputIndex = /^\d+$/.test(debouncedOutputIndexText)
    ? Number(debouncedOutputIndexText)
    : undefined
  const parsedHttpStatus = /^\d{3}$/.test(debouncedHttpStatusText)
    ? Number(debouncedHttpStatusText)
    : undefined
  const httpStatus =
    parsedHttpStatus !== undefined &&
    parsedHttpStatus >= 100 &&
    parsedHttpStatus <= 599
      ? parsedHttpStatus
      : undefined

  useEffect(() => {
    setPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [
    callState,
    debouncedHttpStatusText,
    debouncedOutputIndexText,
    from,
    setPagination,
    to,
  ])

  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'task-calls',
      taskId,
      state.query.page,
      state.query.pageSize,
      'SUBMIT',
      callState,
      outputIndex,
      httpStatus,
      from?.toISOString(),
      to?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasTaskCalls(
        taskId,
        {
          page: state.query.page,
          pageSize: state.query.pageSize,
          callType: 'SUBMIT',
          ...(callState ? { state: callState } : {}),
          ...(outputIndex !== undefined ? { outputIndex } : {}),
          ...(httpStatus !== undefined ? { httpStatus } : {}),
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        },
        signal
      ),
    retry: false,
    enabled: dateRangeValid,
  })
  const columns = useMemo<ColumnDef<CanvasTaskCall, unknown>[]>(() => {
    const formatter = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    })
    const formatTime = (value: string | null) =>
      value ? formatter.format(new Date(value)) : '—'
    return [
      {
        id: 'startedAt',
        accessorKey: 'startedAt',
        enableSorting: false,
        header: t('Call time'),
        cell: ({ row }) => formatTime(row.original.startedAt),
      },
      {
        id: 'callType',
        accessorKey: 'callType',
        enableSorting: false,
        header: t('Call'),
        cell: ({ row }) => (
          <div className='space-y-2'>
            <div>
              {t(callLabels[row.original.callType] ?? 'Unknown call type')}
            </div>
            <CallIdentifiers call={row.original} />
          </div>
        ),
      },
      {
        id: 'outputIndex',
        accessorKey: 'outputIndices',
        enableSorting: false,
        header: t('Related results'),
        cell: ({ row }) =>
          row.original.outputIndices.length === 0
            ? t('Whole task')
            : row.original.outputIndices
                .map((index) => `${t('Result')} ${index + 1}`)
                .join(' · '),
      },
      {
        id: 'response',
        accessorKey: 'httpStatus',
        enableSorting: false,
        header: t('Response'),
        cell: ({ row }) => (
          <div className='space-y-1'>
            <div>
              {t(stateLabels[row.original.state] ?? 'Unknown call state')}
            </div>
            <div className='tabular-nums'>{row.original.httpStatus ?? '—'}</div>
          </div>
        ),
      },
      {
        id: 'duration',
        accessorKey: 'completedAt',
        enableSorting: false,
        header: t('Duration'),
        cell: ({ row }) => callDuration(row.original, t),
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
      ) : (
        <CanvasServerTable
          data={query.data?.items ?? []}
          columns={columns}
          total={query.data?.total ?? 0}
          state={state}
          loading={query.isPending || query.isFetching}
          emptyTitle={t('No task call history')}
          filteredEmptyTitle={t('No matching results')}
          hasActiveFilters={Boolean(
            callState || outputIndexText || httpStatusText || from || to
          )}
          onResetFilters={() => {
            setCallState('')
            setOutputIndexText('')
            setHttpStatusText('')
            setFrom(undefined)
            setTo(undefined)
          }}
          additionalFilters={
            <>
              <DataTableColumnFilterField label={t('Call state')}>
                <Select
                  value={callState || 'ALL'}
                  onValueChange={(value) =>
                    setCallState(value === 'ALL' ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger
                    className='w-full'
                    aria-label={t('Call state')}
                  >
                    <CanvasLocalizedSelectValue
                      value={callState}
                      emptyLabelKey='All call states'
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All call states')}</SelectItem>
                    {callStates.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(stateLabels[value])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DataTableColumnFilterField>
              <DataTableColumnFilterField label={t('Output index')}>
                <Input
                  aria-label={t('Output index')}
                  type='number'
                  min='0'
                  value={outputIndexText}
                  placeholder={t('Output index')}
                  onChange={(event) => setOutputIndexText(event.target.value)}
                />
              </DataTableColumnFilterField>
              <DataTableColumnFilterField label={t('HTTP status')}>
                <Input
                  aria-label={t('HTTP status')}
                  inputMode='numeric'
                  value={httpStatusText}
                  placeholder={t('HTTP status')}
                  onChange={(event) => setHttpStatusText(event.target.value)}
                />
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
          getRowId={(row) => row.localCallId}
        />
      )}
    </div>
  )
}

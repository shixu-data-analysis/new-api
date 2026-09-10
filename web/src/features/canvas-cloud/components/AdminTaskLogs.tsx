/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasAdminTaskLogs, getCanvasTaskLogOptions } from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import type { CanvasAdminTaskLog, CanvasAdminTaskLogQuery } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import { TaskRecordDetailsSheet } from './TaskRecordDetailsSheet'

const executionStatuses = [
  'ACCEPTED',
  'PROCESSING',
  'SUCCEEDED',
  'PARTIAL_SUCCESS',
  'CONFIRMED_FAILED',
  'UNKNOWN',
] as const
const settlementProgresses = ['PENDING', 'PROCESSING', 'COMPLETED'] as const
const billingStatuses = [
  'FROZEN',
  'SETTLED',
  'RELEASED_FAILED',
  'RELEASED_TIMEOUT',
] as const
const executionLabels: Record<string, string> = {
  ACCEPTED: 'Accepted',
  PROCESSING: 'Processing',
  SUCCEEDED: 'Succeeded',
  PARTIAL_SUCCESS: 'Partial success',
  CONFIRMED_FAILED: 'Confirmed failed',
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

function executionSummary(
  summary: CanvasAdminTaskLog['executionSummary'],
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
  if (summary.resultsIncomplete) parts.push(t('Results are incomplete'))
  return parts.join(' · ')
}

function settlementSummary(
  row: CanvasAdminTaskLog,
  t: (key: string) => string
) {
  const progress = t(settlementLabels[row.settlementProgress] ?? 'Pending')
  if (row.customerBillingStatus === 'SETTLED') {
    if (
      row.settlementProgress === 'COMPLETED' &&
      (row.executionSummary.expectedResults ??
        row.executionSummary.recordedResults) <= 1
    ) {
      return null
    }
    return progress
  }
  const billing = t(billingLabels[row.customerBillingStatus] ?? 'Unknown')
  if (
    row.customerBillingStatus === 'FROZEN' &&
    row.settlementProgress === 'PROCESSING'
  ) {
    return `${billing} · ${progress}`
  }
  return billing
}

export function AdminTaskLogs() {
  const { t, i18n } = useTranslation()
  const state =
    useServerTableState<CanvasAdminTaskLogQuery['sortBy']>('acceptedAt')
  const setPagination = state.setPagination
  const listScrollY = useRef(0)
  const taskTrigger = useRef<HTMLButtonElement | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string>()
  const [taskId, setTaskId] = useState('')
  const [customer, setCustomer] = useState('')
  const [model, setModel] = useState('')
  const [derivedExecutionStatus, setDerivedExecutionStatus] = useState('')
  const [settlementProgress, setSettlementProgress] = useState('')
  const [upstreamTaskId, setUpstreamTaskId] = useState('')
  const [billingStatus, setBillingStatus] = useState('')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const debouncedTaskId = useDebounce(taskId.trim(), 300)
  const debouncedCustomer = useDebounce(customer.trim(), 300)
  const debouncedUpstreamTaskId = useDebounce(upstreamTaskId.trim(), 300)
  const valid = isCanvasDateRangeValid(from, to)
  const options = useQuery({
    queryKey: ['canvas-cloud', 'task-log-options'],
    queryFn: ({ signal }) => getCanvasTaskLogOptions(signal),
  })

  useEffect(() => {
    setPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [
    billingStatus,
    debouncedCustomer,
    debouncedTaskId,
    debouncedUpstreamTaskId,
    derivedExecutionStatus,
    from,
    model,
    settlementProgress,
    setPagination,
    to,
  ])

  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-task-logs',
      state.query,
      debouncedTaskId,
      debouncedCustomer,
      model,
      derivedExecutionStatus,
      settlementProgress,
      debouncedUpstreamTaskId,
      billingStatus,
      from?.toISOString(),
      to?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminTaskLogs(
        {
          page: state.query.page,
          pageSize: state.query.pageSize,
          sortBy: state.query.sortBy,
          sortOrder: state.query.sortOrder,
          ...(debouncedTaskId ? { taskId: debouncedTaskId } : {}),
          ...(debouncedCustomer ? { customer: debouncedCustomer } : {}),
          ...(model ? { modelId: model } : {}),
          ...(derivedExecutionStatus ? { derivedExecutionStatus } : {}),
          ...(settlementProgress ? { settlementProgress } : {}),
          ...(debouncedUpstreamTaskId
            ? { upstreamTaskId: debouncedUpstreamTaskId }
            : {}),
          ...(billingStatus ? { billingStatus } : {}),
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        },
        signal
      ),
    placeholderData: (previous) => previous,
    enabled: valid,
  })
  const closeTaskDetails = () => {
    setSelectedTaskId(undefined)
    requestAnimationFrame(() => {
      window.scrollTo({ top: listScrollY.current })
      taskTrigger.current?.focus()
    })
  }
  const columns = useMemo<ColumnDef<CanvasAdminTaskLog, unknown>[]>(
    () => [
      {
        id: 'customer',
        accessorKey: 'customerName',
        header: t('Customer'),
        cell: ({ row }) =>
          row.original.customerName ? (
            <a
              href={`/canvas-cloud/customers?customerId=${encodeURIComponent(row.original.customerId)}`}
              className='text-primary min-w-0 break-words underline underline-offset-4'
            >
              {row.original.customerName}
            </a>
          ) : (
            t('Unknown customer')
          ),
      },
      {
        id: 'taskId',
        accessorKey: 'id',
        enableHiding: false,
        header: t('Task'),
        cell: ({ row }) => (
          <div className='min-w-0 space-y-1'>
            <div className='flex min-w-0 items-center gap-1'>
              <button
                ref={(node) => {
                  if (node && row.original.id === selectedTaskId) {
                    taskTrigger.current = node
                  }
                }}
                type='button'
                className='text-primary min-w-0 text-start break-all underline underline-offset-4 focus-visible:ring-2'
                onClick={(event) => {
                  taskTrigger.current = event.currentTarget
                  listScrollY.current = window.scrollY
                  setSelectedTaskId(row.original.id)
                }}
              >
                {row.original.id}
              </button>
              <CopyableText value={row.original.id} hideValue />
            </div>
            <div className='text-muted-foreground text-sm break-words'>
              {row.original.modelName ?? t('Unknown model')}
            </div>
          </div>
        ),
      },
      {
        id: 'derivedExecutionStatus',
        accessorKey: 'derivedExecutionStatus',
        header: t('Execution status'),
        cell: ({ row }) => (
          <div className='space-y-1'>
            <div>
              {t(
                executionLabels[row.original.derivedExecutionStatus] ??
                  'Unknown'
              )}
            </div>
            {executionSummary(row.original.executionSummary, t) ? (
              <div className='text-muted-foreground text-xs'>
                {executionSummary(row.original.executionSummary, t)}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'settledPoints',
        accessorKey: 'settledPoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Settled points')}
            className='justify-end [&>button]:justify-end'
          />
        ),
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {row.original.settledPoints === null
              ? '—'
              : new Intl.NumberFormat(
                  toIntlLocale(i18n.resolvedLanguage || i18n.language)
                ).format(BigInt(row.original.settledPoints))}
            {settlementSummary(row.original, t) ? (
              <div className='text-muted-foreground text-xs'>
                {settlementSummary(row.original, t)}
              </div>
            ) : null}
            {row.original.outstandingDebtPoints &&
            BigInt(row.original.outstandingDebtPoints) > 0n ? (
              <div className='text-destructive text-xs'>
                {t('Outstanding debt')}:{' '}
                {new Intl.NumberFormat(
                  toIntlLocale(i18n.resolvedLanguage || i18n.language)
                ).format(BigInt(row.original.outstandingDebtPoints))}
              </div>
            ) : null}
          </div>
        ),
      },
    ],
    [i18n.language, i18n.resolvedLanguage, selectedTaskId, t]
  )
  const filters = (
    <>
      <DataTableColumnFilterField label={t('Task number')}>
        <Input
          aria-label={t('Task number')}
          value={taskId}
          placeholder={t('Task number')}
          onChange={(event) => setTaskId(event.target.value)}
        />
      </DataTableColumnFilterField>
      <DataTableColumnFilterField label={t('Customer')}>
        <Input
          aria-label={t('Customer')}
          value={customer}
          placeholder={t('Customer')}
          onChange={(event) => setCustomer(event.target.value)}
        />
      </DataTableColumnFilterField>
      <DataTableColumnFilterField label={t('Model')}>
        <Select
          value={model || 'ALL'}
          onValueChange={(value) =>
            setModel(value === 'ALL' ? '' : (value ?? ''))
          }
        >
          <SelectTrigger className='w-full' aria-label={t('Model')}>
            <CanvasLocalizedSelectValue
              value={model}
              displayValue={
                options.data?.models.find((option) => option.id === model)?.name
              }
              emptyLabelKey='All'
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>{t('All')}</SelectItem>
            {(options.data?.models ?? []).map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataTableColumnFilterField>
      <DataTableColumnFilterField label={t('Execution status')}>
        <Select
          value={derivedExecutionStatus || 'ALL'}
          onValueChange={(value) =>
            setDerivedExecutionStatus(value === 'ALL' ? '' : (value ?? ''))
          }
        >
          <SelectTrigger className='w-full' aria-label={t('Execution status')}>
            <CanvasLocalizedSelectValue
              value={derivedExecutionStatus}
              emptyLabelKey='All'
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>{t('All')}</SelectItem>
            {executionStatuses.map((value) => (
              <SelectItem key={value} value={value}>
                {t(executionLabels[value])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </DataTableColumnFilterField>
      <DataTableColumnFilterField label={t('Settlement progress')}>
        <Select
          value={settlementProgress || 'ALL'}
          onValueChange={(value) =>
            setSettlementProgress(value === 'ALL' ? '' : (value ?? ''))
          }
        >
          <SelectTrigger
            className='w-full'
            aria-label={t('Settlement progress')}
          >
            <CanvasLocalizedSelectValue
              value={settlementProgress}
              emptyLabelKey='All'
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>{t('All')}</SelectItem>
            {settlementProgresses.map((value) => (
              <SelectItem key={value} value={value}>
                {t(settlementLabels[value])}
              </SelectItem>
            ))}
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
      <div className='sm:col-span-3'>
        <Collapsible>
          <CollapsibleTrigger className='text-primary text-sm underline underline-offset-4'>
            {t('More conditions')}
          </CollapsibleTrigger>
          <CollapsibleContent className='grid gap-3 pt-3 sm:grid-cols-2'>
            <DataTableColumnFilterField label={t('Upstream task ID')}>
              <Input
                aria-label={t('Upstream task ID')}
                value={upstreamTaskId}
                placeholder={t('Upstream task ID')}
                onChange={(event) => setUpstreamTaskId(event.target.value)}
              />
            </DataTableColumnFilterField>
            <DataTableColumnFilterField label={t('Raw billing status')}>
              <Select
                value={billingStatus || 'ALL'}
                onValueChange={(value) =>
                  setBillingStatus(value === 'ALL' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger
                  className='w-full'
                  aria-label={t('Raw billing status')}
                >
                  <CanvasLocalizedSelectValue
                    value={billingStatus}
                    emptyLabelKey='All'
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All')}</SelectItem>
                  {billingStatuses.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(billingLabels[value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DataTableColumnFilterField>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </>
  )
  return (
    <>
      <CanvasServerTable
        data={query.data?.items ?? []}
        columns={columns}
        total={query.data?.total ?? 0}
        state={state}
        loading={query.isPending || query.isFetching}
        error={query.isError}
        errorTitle={t('Unable to load task records')}
        onRetry={() => void query.refetch()}
        emptyTitle={t('No task records')}
        filteredEmptyTitle={t('No matching results')}
        additionalFilters={filters}
        hasActiveFilters={Boolean(
          taskId ||
          customer ||
          model ||
          derivedExecutionStatus ||
          settlementProgress ||
          upstreamTaskId ||
          billingStatus ||
          from ||
          to
        )}
        onResetFilters={() => {
          setTaskId('')
          setCustomer('')
          setModel('')
          setDerivedExecutionStatus('')
          setSettlementProgress('')
          setUpstreamTaskId('')
          setBillingStatus('')
          setFrom(undefined)
          setTo(undefined)
        }}
        getRowId={(row) => row.id}
        getColumnClassName={(columnId) =>
          columnId === 'settledPoints' ? 'text-right' : undefined
        }
      />
      <TaskRecordDetailsSheet
        taskId={selectedTaskId}
        onClose={closeTaskDetails}
      />
    </>
  )
}

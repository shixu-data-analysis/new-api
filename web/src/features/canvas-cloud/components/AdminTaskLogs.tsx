/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'

import { getCanvasAdminTaskLogs, getCanvasTaskLogOptions } from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import type {
  CanvasAdminTaskFailureReason,
  CanvasAdminTaskLog,
  CanvasAdminTaskLogQuery,
  CanvasAdminTaskUpstreamFilter,
} from '../types'
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
const route = getRouteApi('/_authenticated/canvas-cloud/$section')
const failureReasons: CanvasAdminTaskFailureReason[] = [
  'PROVIDER_OUTPUT_TOO_LARGE',
  'RETRY_EXHAUSTED',
]
const failureReasonLabels: Record<CanvasAdminTaskFailureReason, string> = {
  PROVIDER_OUTPUT_TOO_LARGE: 'Result file too large',
  RETRY_EXHAUSTED: 'Failed after repeated result fetches',
}
const upstreamTaskLabels: Record<
  CanvasAdminTaskUpstreamFilter | 'specific',
  string
> = {
  present: 'Present (can be queried)',
  absent: 'Absent (cannot be queried)',
  specific: 'Specific ID',
}
// A filter control that holds a value stands out, so a filter carried in from another page is easy to see.
const activeControl = (active: boolean) =>
  cn('w-full', active && 'border-primary ring-primary/30 ring-1')
const executionLabels: Record<string, string> = {
  ACCEPTED: 'Accepted',
  PROCESSING: 'Processing',
  SUCCEEDED: 'Succeeded',
  PARTIAL_SUCCESS: 'Partial success',
  CONFIRMED_FAILED: 'Confirmed failed',
  UNKNOWN: 'Result pending confirmation',
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
      ? t('Pending confirmation count', { count: summary.unknownResults })
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
  const [settlementProgress, setSettlementProgress] = useState('')
  const [specificUpstreamTask, setSpecificUpstreamTask] = useState(false)
  const [upstreamTaskId, setUpstreamTaskId] = useState('')
  const [to, setTo] = useState<Date>()
  // Filters other pages carry in live in the address; editing them keeps the address in step.
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const derivedExecutionStatus = search.derivedExecutionStatus ?? ''
  const upstreamTask = search.upstreamTask
  const billingStatus = search.billingStatus ?? ''
  const credentialGroupId = search.credentialGroupId ?? ''
  const failureReason = search.failureReason
  const from = useMemo(
    () => (search.from ? new Date(search.from) : undefined),
    [search.from]
  )
  const setSearch = (values: Partial<typeof search>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...values }),
      replace: true,
    })
  const setDerivedExecutionStatus = (value: string) =>
    setSearch({
      derivedExecutionStatus: (value ||
        undefined) as typeof search.derivedExecutionStatus,
    })
  const setBillingStatus = (value: string) =>
    setSearch({
      billingStatus: (value || undefined) as typeof search.billingStatus,
    })
  const setFrom = (value: Date | undefined) =>
    setSearch({ from: value?.toISOString() })
  const upstreamMode = upstreamTask ?? (specificUpstreamTask ? 'specific' : '')
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
    credentialGroupId,
    debouncedCustomer,
    debouncedTaskId,
    debouncedUpstreamTaskId,
    derivedExecutionStatus,
    failureReason,
    from,
    model,
    settlementProgress,
    setPagination,
    to,
    upstreamTask,
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
      upstreamTask,
      specificUpstreamTask ? debouncedUpstreamTaskId : '',
      credentialGroupId,
      failureReason,
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
          ...(upstreamTask ? { upstreamTask } : {}),
          ...(specificUpstreamTask && debouncedUpstreamTaskId
            ? { upstreamTaskId: debouncedUpstreamTaskId }
            : {}),
          ...(credentialGroupId ? { credentialGroupId } : {}),
          ...(failureReason ? { failureReason } : {}),
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
              {row.original.displayNameSnapshot}
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
        meta: { label: t('Settled points'), align: 'end' },
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
      {
        id: 'acceptedAt',
        accessorKey: 'acceptedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Accepted at')} />
        ),
        meta: { label: t('Accepted at') },
        cell: ({ row }) => formatCanvasDateTime(row.original.acceptedAt),
      },
      {
        id: 'completedAt',
        accessorKey: 'completedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Completed at')} />
        ),
        meta: { label: t('Completed at') },
        cell: ({ row }) => formatCanvasDateTime(row.original.completedAt),
      },
    ],
    [i18n.language, i18n.resolvedLanguage, selectedTaskId, t]
  )
  const groupOptionLabel = (group: { name: string; providerName: string }) =>
    t('{{provider}} · {{group}}', {
      provider: group.providerName,
      group: group.name,
    })
  const selectedGroup = options.data?.credentialGroups.find(
    (group) => group.id === credentialGroupId
  )
  // A group carried in by ID shows its name once the options have loaded, never the bare ID.
  let credentialGroupLabel: string | undefined
  if (credentialGroupId) {
    if (selectedGroup) credentialGroupLabel = groupOptionLabel(selectedGroup)
    else if (options.isPending) credentialGroupLabel = t('Loading')
    else credentialGroupLabel = t('Unknown API Key group')
  }
  const modelLabel = options.data?.models.find(
    (option) => option.customerModelId === model
  )?.displayNameSnapshot
  const tag = (field: string, value: string) =>
    t('{{field}}: {{value}}', { field, value })
  const tags = [
    taskId && {
      key: 'taskId',
      label: tag(t('Task number'), taskId),
      remove: () => setTaskId(''),
    },
    customer && {
      key: 'customer',
      label: tag(t('Customer'), customer),
      remove: () => setCustomer(''),
    },
    model && {
      key: 'model',
      label: tag(t('Model'), modelLabel ?? t('Loading')),
      remove: () => setModel(''),
    },
    derivedExecutionStatus && {
      key: 'derivedExecutionStatus',
      label: tag(
        t('Execution status'),
        t(executionLabels[derivedExecutionStatus] ?? 'Unknown')
      ),
      remove: () => setDerivedExecutionStatus(''),
    },
    settlementProgress && {
      key: 'settlementProgress',
      label: tag(
        t('Settlement progress'),
        t(settlementLabels[settlementProgress] ?? 'Unknown')
      ),
      remove: () => setSettlementProgress(''),
    },
    from && {
      key: 'from',
      label: tag(t('Start time'), formatCanvasDateTime(from.toISOString())),
      remove: () => setFrom(undefined),
    },
    to && {
      key: 'to',
      label: tag(t('End time'), formatCanvasDateTime(to.toISOString())),
      remove: () => setTo(undefined),
    },
    upstreamMode && {
      key: 'upstreamTask',
      label: tag(
        t('Upstream task ID'),
        upstreamMode === 'specific' && upstreamTaskId
          ? upstreamTaskId
          : t(upstreamTaskLabels[upstreamMode])
      ),
      remove: () => {
        setSpecificUpstreamTask(false)
        setUpstreamTaskId('')
        setSearch({ upstreamTask: undefined })
      },
    },
    billingStatus && {
      key: 'billingStatus',
      label: tag(
        t('Raw billing status'),
        t(billingLabels[billingStatus] ?? 'Unknown')
      ),
      remove: () => setBillingStatus(''),
    },
    credentialGroupId && {
      key: 'credentialGroupId',
      label: tag(t('API Key group'), credentialGroupLabel ?? ''),
      remove: () => setSearch({ credentialGroupId: undefined }),
    },
    failureReason && {
      key: 'failureReason',
      label: tag(t('Failure reason'), t(failureReasonLabels[failureReason])),
      remove: () => setSearch({ failureReason: undefined }),
    },
  ].filter((item): item is { key: string; label: string; remove: () => void } =>
    Boolean(item)
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
          <SelectTrigger
            className={activeControl(Boolean(model))}
            aria-label={t('Model')}
          >
            <CanvasLocalizedSelectValue
              value={model}
              displayValue={
                options.data?.models.find(
                  (option) => option.customerModelId === model
                )?.displayNameSnapshot
              }
              emptyLabelKey='All models'
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>{t('All models')}</SelectItem>
            {(options.data?.models ?? []).map((option) => (
              <SelectItem
                key={option.customerModelId}
                value={option.customerModelId}
              >
                {option.displayNameSnapshot}
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
          <SelectTrigger
            className={activeControl(Boolean(derivedExecutionStatus))}
            aria-label={t('Execution status')}
          >
            <CanvasLocalizedSelectValue
              value={derivedExecutionStatus}
              emptyLabelKey='All execution statuses'
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>{t('All execution statuses')}</SelectItem>
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
            className={activeControl(Boolean(settlementProgress))}
            aria-label={t('Settlement progress')}
          >
            <CanvasLocalizedSelectValue
              value={settlementProgress}
              emptyLabelKey='All settlement progresses'
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>
              {t('All settlement progresses')}
            </SelectItem>
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
        <Collapsible
          defaultOpen={Boolean(
            upstreamMode || credentialGroupId || failureReason || billingStatus
          )}
        >
          <CollapsibleTrigger className='text-primary text-sm underline underline-offset-4'>
            {t('More conditions')}
          </CollapsibleTrigger>
          <CollapsibleContent className='grid gap-3 pt-3 sm:grid-cols-2'>
            <DataTableColumnFilterField label={t('Upstream task ID')}>
              <div className='space-y-2'>
                <Select
                  value={upstreamMode || 'ALL'}
                  onValueChange={(value) => {
                    const next = value === 'ALL' ? '' : (value ?? '')
                    setSpecificUpstreamTask(next === 'specific')
                    if (next !== 'specific') setUpstreamTaskId('')
                    setSearch({
                      upstreamTask:
                        next === 'present' || next === 'absent'
                          ? next
                          : undefined,
                    })
                  }}
                >
                  <SelectTrigger
                    className={activeControl(Boolean(upstreamMode))}
                    aria-label={t('Upstream task ID')}
                  >
                    <CanvasLocalizedSelectValue
                      value={upstreamMode}
                      displayValue={
                        upstreamMode
                          ? t(upstreamTaskLabels[upstreamMode])
                          : undefined
                      }
                      emptyLabelKey='All'
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All')}</SelectItem>
                    {(['present', 'absent', 'specific'] as const).map(
                      (value) => (
                        <SelectItem key={value} value={value}>
                          {t(upstreamTaskLabels[value])}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                {specificUpstreamTask ? (
                  <Input
                    aria-label={t('Specific ID')}
                    value={upstreamTaskId}
                    placeholder={t('Upstream task ID')}
                    onChange={(event) => setUpstreamTaskId(event.target.value)}
                  />
                ) : null}
              </div>
            </DataTableColumnFilterField>
            <DataTableColumnFilterField label={t('Raw billing status')}>
              <Select
                value={billingStatus || 'ALL'}
                onValueChange={(value) =>
                  setBillingStatus(value === 'ALL' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger
                  className={activeControl(Boolean(billingStatus))}
                  aria-label={t('Raw billing status')}
                >
                  <CanvasLocalizedSelectValue
                    value={billingStatus}
                    emptyLabelKey='All billing statuses'
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>
                    {t('All billing statuses')}
                  </SelectItem>
                  {billingStatuses.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(billingLabels[value])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DataTableColumnFilterField>
            <DataTableColumnFilterField label={t('API Key group')}>
              <Select
                value={credentialGroupId || 'ALL'}
                onValueChange={(value) =>
                  setSearch({
                    credentialGroupId:
                      value === 'ALL' ? undefined : (value ?? undefined),
                  })
                }
              >
                <SelectTrigger
                  className={activeControl(Boolean(credentialGroupId))}
                  aria-label={t('API Key group')}
                >
                  <CanvasLocalizedSelectValue
                    value={credentialGroupId}
                    displayValue={credentialGroupLabel}
                    emptyLabelKey='All API Key groups'
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All API Key groups')}</SelectItem>
                  {(options.data?.credentialGroups ?? []).map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {groupOptionLabel(group)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DataTableColumnFilterField>
            <DataTableColumnFilterField label={t('Failure reason')}>
              <Select
                value={failureReason ?? 'ALL'}
                onValueChange={(value) =>
                  setSearch({
                    failureReason:
                      value === 'ALL'
                        ? undefined
                        : (value as CanvasAdminTaskFailureReason),
                  })
                }
              >
                <SelectTrigger
                  className={activeControl(Boolean(failureReason))}
                  aria-label={t('Failure reason')}
                >
                  <CanvasLocalizedSelectValue
                    value={failureReason}
                    displayValue={
                      failureReason
                        ? t(failureReasonLabels[failureReason])
                        : undefined
                    }
                    emptyLabelKey='All failure reasons'
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>
                    {t('All failure reasons')}
                  </SelectItem>
                  {failureReasons.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(failureReasonLabels[value])}
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
        filterTags={
          tags.length > 0 ? (
            <ul
              className='flex flex-wrap items-center gap-1'
              aria-label={t('Active filters')}
            >
              {tags.map((tag) => (
                <li key={tag.key}>
                  <span className='bg-muted inline-flex items-center gap-1 rounded-md py-0.5 ps-2 pe-0.5 text-xs'>
                    {tag.label}
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-xs'
                      aria-label={t('Remove filter {{filter}}', {
                        filter: tag.label,
                      })}
                      onClick={tag.remove}
                    >
                      <X aria-hidden='true' />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null
        }
        hasActiveFilters={tags.length > 0}
        activeFilterCount={tags.length}
        onResetFilters={() => {
          setTaskId('')
          setCustomer('')
          setModel('')
          setSettlementProgress('')
          setSpecificUpstreamTask(false)
          setUpstreamTaskId('')
          setTo(undefined)
          setSearch({
            derivedExecutionStatus: undefined,
            upstreamTask: undefined,
            billingStatus: undefined,
            credentialGroupId: undefined,
            failureReason: undefined,
            from: undefined,
          })
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

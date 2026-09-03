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

import { DataTableColumnHeader } from '@/components/data-table'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks'

import { getCanvasAdminTaskLogs } from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import type { CanvasAdminTaskLog, CanvasAdminTaskLogQuery } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTerm, BusinessTermText } from './BusinessTerm'
import { CanvasColumnFilterField } from './CanvasColumnFilterPanel'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasServerTable } from './CanvasServerTable'

const executionStatuses = [
  'ACCEPTED',
  'PROCESSING',
  'SUCCEEDED',
  'CONFIRMED_FAILED',
  'UNKNOWN',
] as const
const billingStatuses = [
  'FROZEN',
  'SETTLED',
  'RELEASED_FAILED',
  'RELEASED_TIMEOUT',
] as const
const reconciliationStatuses = [
  'PENDING',
  'COST_CONFIRMED',
  'RECONCILED',
  'DISPUTED',
] as const

type StatusTermKind =
  | 'taskExecutionStatus'
  | 'billingStatus'
  | 'reconciliationStatus'

export function AdminTaskLogs(props: { kind: 'usage' | 'task' }) {
  const { t } = useTranslation()
  const state =
    useServerTableState<CanvasAdminTaskLogQuery['sortBy']>('acceptedAt')
  const setPagination = state.setPagination
  const [executionStatus, setExecutionStatus] = useState('')
  const [billingStatus, setBillingStatus] = useState('')
  const [reconciliationStatus, setReconciliationStatus] = useState('')
  const [model, setModel] = useState('')
  const [executionOrigin, setExecutionOrigin] = useState('')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const debouncedModel = useDebounce(model.trim(), 300)
  const dateRangeValid = isCanvasDateRangeValid(from, to)

  useEffect(() => {
    setPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [
    billingStatus,
    debouncedModel,
    executionOrigin,
    executionStatus,
    from,
    reconciliationStatus,
    setPagination,
    to,
  ])
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      `${props.kind}-logs`,
      state.query,
      debouncedModel,
      executionStatus,
      billingStatus,
      reconciliationStatus,
      executionOrigin,
      from?.toISOString(),
      to?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminTaskLogs(
        props.kind,
        {
          page: state.query.page,
          pageSize: state.query.pageSize,
          sortBy: state.query.sortBy,
          sortOrder: state.query.sortOrder,
          ...(state.query.search ? { customer: state.query.search } : {}),
          ...(debouncedModel ? { model: debouncedModel } : {}),
          ...(props.kind === 'task' && executionStatus
            ? { executionStatus }
            : {}),
          ...(billingStatus ? { billingStatus } : {}),
          ...(props.kind === 'task' && reconciliationStatus
            ? { reconciliationStatus }
            : {}),
          ...(props.kind === 'task' && executionOrigin
            ? { executionOrigin: executionOrigin as 'MOCK' | 'REAL' }
            : {}),
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        },
        signal
      ),
    placeholderData: (previous) => previous,
    enabled: dateRangeValid,
  })

  const columns = useMemo<ColumnDef<CanvasAdminTaskLog, unknown>[]>(() => {
    const shared: ColumnDef<CanvasAdminTaskLog, unknown>[] = [
      {
        id: 'customer',
        accessorKey: 'customerName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Customer')} />
        ),
      },
      {
        id: 'model',
        accessorKey: 'modelName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Model')} />
        ),
      },
    ]
    if (props.kind === 'usage') {
      return [
        ...shared,
        {
          id: 'quotedPoints',
          accessorKey: 'quotedPoints',
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title={t('Points used')} />
          ),
        },
        {
          id: 'billingStatus',
          accessorKey: 'customerBillingStatus',
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title={t('Billing')} />
          ),
          cell: ({ row }) => (
            <BusinessTerm
              kind='billingStatus'
              value={row.original.customerBillingStatus}
            />
          ),
        },
        {
          id: 'acceptedAt',
          accessorKey: 'acceptedAt',
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title={t('Time')} />
          ),
          cell: ({ row }) => formatCanvasDateTime(row.original.acceptedAt),
        },
      ]
    }
    return [
      ...shared,
      {
        id: 'executionStatus',
        accessorKey: 'executionStatus',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Execution')} />
        ),
        cell: ({ row }) => (
          <BusinessTerm
            kind='taskExecutionStatus'
            value={row.original.executionStatus}
          />
        ),
      },
      {
        id: 'billingStatus',
        accessorKey: 'customerBillingStatus',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Billing')} />
        ),
        cell: ({ row }) => (
          <BusinessTerm
            kind='billingStatus'
            value={row.original.customerBillingStatus}
          />
        ),
      },
      {
        id: 'reconciliationStatus',
        accessorKey: 'providerReconcileStatus',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Reconciliation')} />
        ),
        cell: ({ row }) => (
          <BusinessTerm
            kind='reconciliationStatus'
            value={row.original.providerReconcileStatus}
          />
        ),
      },
      {
        id: 'source',
        accessorKey: 'executionOrigin',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Source')} />
        ),
        cell: ({ row }) => {
          if (row.original.executionOrigin === 'MOCK') return t('Test')
          if (row.original.executionOrigin === 'REAL') return t('Production')
          return '—'
        },
      },
      {
        id: 'acceptedAt',
        accessorKey: 'acceptedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Accepted')} />
        ),
        cell: ({ row }) => formatCanvasDateTime(row.original.acceptedAt),
      },
    ]
  }, [props.kind, t])

  const statusSelect = (
    value: string,
    setValue: (value: string) => void,
    label: string,
    values: readonly string[],
    termKind: StatusTermKind
  ) => (
    <CanvasColumnFilterField label={label}>
      <Select
        value={value || 'ALL'}
        onValueChange={(next) => setValue(next === 'ALL' ? '' : (next ?? ''))}
      >
        <SelectTrigger className='w-full' aria-label={label}>
          <SelectValue>
            {value ? (
              <BusinessTermText kind={termKind} value={value} />
            ) : (
              t('All')
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='ALL'>{t('All')}</SelectItem>
          {values.map((status) => (
            <SelectItem key={status} value={status}>
              <BusinessTerm kind={termKind} value={status} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </CanvasColumnFilterField>
  )

  return (
    <CanvasServerTable
      data={query.data?.items ?? []}
      columns={columns}
      total={query.data?.total ?? 0}
      state={state}
      searchLabel={t('Customer')}
      loading={query.isPending || query.isFetching}
      emptyTitle={
        props.kind === 'usage'
          ? t('No consumption records')
          : t('No Canvas tasks')
      }
      additionalFilters={
        <>
          <CanvasColumnFilterField label={t('Model')}>
            <Input
              className='w-full'
              value={model}
              aria-label={t('Model')}
              placeholder={t('Model')}
              onChange={(event) => setModel(event.target.value)}
            />
          </CanvasColumnFilterField>
          {props.kind === 'task'
            ? statusSelect(
                executionStatus,
                setExecutionStatus,
                t('Execution status'),
                executionStatuses,
                'taskExecutionStatus'
              )
            : null}
          {statusSelect(
            billingStatus,
            setBillingStatus,
            t('Billing status'),
            billingStatuses,
            'billingStatus'
          )}
          {props.kind === 'task'
            ? statusSelect(
                reconciliationStatus,
                setReconciliationStatus,
                t('Reconciliation'),
                reconciliationStatuses,
                'reconciliationStatus'
              )
            : null}
          {props.kind === 'task' ? (
            <CanvasColumnFilterField label={t('Source')}>
              <Select
                value={executionOrigin || 'ALL'}
                onValueChange={(value) =>
                  setExecutionOrigin(value === 'ALL' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger className='w-full' aria-label={t('Source')}>
                  <SelectValue>
                    {(() => {
                      if (executionOrigin === 'MOCK') return t('Test')
                      if (executionOrigin === 'REAL') return t('Production')
                      return t('All')
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All')}</SelectItem>
                  <SelectItem value='MOCK'>{t('Test')}</SelectItem>
                  <SelectItem value='REAL'>{t('Production')}</SelectItem>
                </SelectContent>
              </Select>
            </CanvasColumnFilterField>
          ) : null}
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
      hasActiveFilters={Boolean(
        model ||
        executionStatus ||
        billingStatus ||
        reconciliationStatus ||
        executionOrigin ||
        from ||
        to
      )}
      activeFilterCount={
        [
          state.search,
          model,
          props.kind === 'task' ? executionStatus : '',
          billingStatus,
          props.kind === 'task' ? reconciliationStatus : '',
          props.kind === 'task' ? executionOrigin : '',
          from,
          to,
        ].filter(Boolean).length
      }
      onResetFilters={() => {
        setModel('')
        setExecutionStatus('')
        setBillingStatus('')
        setReconciliationStatus('')
        setExecutionOrigin('')
        setFrom(undefined)
        setTo(undefined)
      }}
      getRowId={(row) => row.id}
    />
  )
}

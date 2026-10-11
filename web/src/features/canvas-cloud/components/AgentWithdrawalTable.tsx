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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { toIntlLocale } from '@/i18n/languages'

import {
  agentEarningsQueryKeys,
  getAdminAgentWithdrawals,
  getAgentWithdrawals,
} from '../agent-earnings-api'
import {
  formatBeijingDateTime,
  formatRmbMinor,
  withdrawalStatusLabelKey,
} from '../agent-earnings-format'
import type {
  AdminAgentWithdrawal,
  AgentPageSize,
  AgentWithdrawal,
  AgentWithdrawalStatus,
} from '../agent-earnings-types'
import { isCanvasDateRangeValid } from '../date-range'
import { useServerTableState } from '../use-server-table-state'
import { WithdrawalStatus } from './AgentWithdrawalParts'
import {
  AdminWithdrawalProcessSheet,
  AgentWithdrawalViewSheet,
} from './AgentWithdrawalSheets'
import { CANVAS_COLUMN_SIZES } from './canvas-table-layout'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CanvasStatusBadge } from './CanvasStatusBadge'

const statuses: AgentWithdrawalStatus[] = ['REQUESTED', 'PAID', 'REJECTED']

/** The picker returns the chosen wall-clock minute; the filter is labelled Beijing time, so it is sent as +08:00. */
function beijingMinute(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:00+08:00`
}

type Row = AgentWithdrawal | AdminAgentWithdrawal

export function AgentWithdrawalTable(
  props: { mode: 'agent' } | { mode: 'admin'; agentPrincipalId?: string }
) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const admin = props.mode === 'admin'
  const agentPrincipalId =
    props.mode === 'admin' ? props.agentPrincipalId : undefined
  const state = useServerTableState<'requestedAt'>('requestedAt')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const [viewId, setViewId] = useState<string>()
  const [processId, setProcessId] = useState<string>()
  const rangeValid = isCanvasDateRangeValid(from, to)
  const pageQuery = {
    page: state.query.page,
    pageSize: state.query.pageSize as AgentPageSize,
  }
  const adminQuery = {
    ...pageQuery,
    ...(agentPrincipalId ? { agentPrincipalId } : {}),
    ...(state.query.search ? { agentUsername: state.query.search } : {}),
    ...(status ? { status: status as AgentWithdrawalStatus } : {}),
    ...(from && rangeValid ? { requestedFrom: beijingMinute(from) } : {}),
    ...(to && rangeValid ? { requestedTo: beijingMinute(to) } : {}),
  }
  const withdrawals = useQuery({
    queryKey: admin
      ? [...agentEarningsQueryKeys.admin, 'list', adminQuery]
      : [...agentEarningsQueryKeys.all, 'withdrawals', pageQuery],
    queryFn: ({ signal }) =>
      admin
        ? getAdminAgentWithdrawals(adminQuery, signal)
        : getAgentWithdrawals(pageQuery, signal),
    placeholderData: (previous) => previous,
  })
  const resetPage = () =>
    state.setPagination((page) => ({ ...page, pageIndex: 0 }))
  const columns: ColumnDef<Row, unknown>[] = [
    {
      id: 'requestedAt',
      accessorKey: 'requestedAt',
      enableSorting: false,
      header: t('Requested at (Beijing time)'),
      size: CANVAS_COLUMN_SIZES.wide,
      cell: ({ row }) =>
        formatBeijingDateTime(row.original.requestedAt, locale),
    },
    ...(admin
      ? [
          {
            id: 'agentUsername',
            enableSorting: false,
            header: t('Agent'),
            size: CANVAS_COLUMN_SIZES.wide,
            cell: ({ row }: { row: { original: Row } }) =>
              (row.original as AdminAgentWithdrawal).agentUsername ?? '—',
          } satisfies ColumnDef<Row, unknown>,
        ]
      : []),
    {
      id: 'amountMinor',
      accessorKey: 'amountMinor',
      enableSorting: false,
      header: t('Withdrawal amount'),
      size: 128,
      meta: { align: 'end' },
      cell: ({ row }) => (
        <strong>{formatRmbMinor(row.original.amountMinor, locale)}</strong>
      ),
    },
    {
      id: 'netMinor',
      accessorKey: 'netMinor',
      enableSorting: false,
      header: t('Net payment'),
      size: 128,
      meta: { align: 'end' },
      cell: ({ row }) => formatRmbMinor(row.original.netMinor, locale),
    },
    {
      id: 'status',
      accessorKey: 'status',
      enableSorting: false,
      header: t('Status'),
      size: 160,
      cell: ({ row }) => (
        <WithdrawalStatus
          status={row.original.status}
          overdue={admin && (row.original as AdminAgentWithdrawal).overdue}
        />
      ),
    },
    {
      // "actions" sizes the column to its button, as in the other shared tables.
      id: 'actions',
      enableSorting: false,
      header: t('Action'),
      cell: ({ row }) =>
        admin && row.original.status === 'REQUESTED' ? (
          <Button size='sm' onClick={() => setProcessId(row.original.id)}>
            {t('Process')}
          </Button>
        ) : (
          <Button
            size='sm'
            variant='outline'
            onClick={() => setViewId(row.original.id)}
          >
            {t('Withdrawal action view')}
          </Button>
        ),
    },
  ]
  return (
    <>
      <CanvasServerTable
        data={withdrawals.data?.items ?? []}
        columns={columns}
        total={withdrawals.data?.total ?? 0}
        state={state}
        {...(admin ? { searchLabel: t('Agent username') } : {})}
        loading={withdrawals.isPending || withdrawals.isFetching}
        error={withdrawals.isError}
        onRetry={() => void withdrawals.refetch()}
        emptyTitle={t('No withdrawal requests')}
        filteredEmptyTitle={t('No withdrawal requests match the filters')}
        {...(admin
          ? {
              additionalFilters: (
                <>
                  <DataTableColumnFilterField label={t('Status')}>
                    <Select
                      value={status || 'ALL'}
                      onValueChange={(value) => {
                        setStatus(value === 'ALL' ? '' : (value ?? ''))
                        resetPage()
                      }}
                    >
                      <SelectTrigger
                        className='w-full'
                        aria-label={t('Status')}
                      >
                        <CanvasLocalizedSelectValue
                          value={status}
                          emptyLabelKey='All statuses'
                          displayValue={
                            status ? (
                              <CanvasStatusBadge
                                status={status}
                                label={t(
                                  withdrawalStatusLabelKey(
                                    status as AgentWithdrawalStatus
                                  )
                                )}
                              />
                            ) : undefined
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                        {statuses.map((value) => (
                          <SelectItem key={value} value={value}>
                            <CanvasStatusBadge
                              status={value}
                              label={t(withdrawalStatusLabelKey(value))}
                            />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </DataTableColumnFilterField>
                  <DataTableColumnFilterField
                    label={t('Requested at (Beijing time)')}
                    className='sm:col-span-2'
                  >
                    <CanvasDateRangeFilter
                      from={from}
                      to={to}
                      onFromChange={(value) => {
                        setFrom(value)
                        resetPage()
                      }}
                      onToChange={(value) => {
                        setTo(value)
                        resetPage()
                      }}
                    />
                  </DataTableColumnFilterField>
                </>
              ),
              hasActiveFilters: Boolean(status || from || to),
              activeFilterCount: [
                state.query.search,
                status,
                from || to,
              ].filter(Boolean).length,
              onResetFilters: () => {
                setStatus('')
                setFrom(undefined)
                setTo(undefined)
              },
            }
          : {})}
        getRowId={(row) => row.id}
      />
      <AgentWithdrawalViewSheet
        withdrawalId={viewId}
        admin={admin}
        onOpenChange={(open) => (open ? undefined : setViewId(undefined))}
      />
      {admin ? (
        <AdminWithdrawalProcessSheet
          withdrawalId={processId}
          onOpenChange={(open) => (open ? undefined : setProcessId(undefined))}
        />
      ) : null}
    </>
  )
}

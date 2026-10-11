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
import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableRow } from '@/components/data-table'
import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'

import {
  agentEarningsQueryKeys,
  getAdminAgentStatementCustomers,
  getAdminAgentStatements,
  getAgentStatementCustomers,
  getAgentStatements,
} from '../agent-earnings-api'
import {
  formatBeijingDateTime,
  formatRmbMinor,
  formatRmbYuan,
} from '../agent-earnings-format'
import type {
  AgentMonthlyStatement,
  AgentPageSize,
} from '../agent-earnings-types'
import { formatExactPointQuantity } from '../number-format'
import { useServerTableState } from '../use-server-table-state'
import { AgentMonthPicker } from './AgentMonthPicker'
import { CANVAS_COLUMN_SIZES } from './canvas-table-layout'
import { CanvasServerTable } from './CanvasServerTable'

type StatementTableProps =
  | { mode: 'agent' }
  | { mode: 'admin'; agentPrincipalId?: string; initialMonth?: string }

function StatementCustomers(props: {
  mode: 'agent' | 'admin'
  statement: AgentMonthlyStatement
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const detail = useQuery({
    queryKey: [
      ...agentEarningsQueryKeys.all,
      'statement-customers',
      props.mode,
      props.statement.id,
    ],
    queryFn: ({ signal }) =>
      props.mode === 'agent'
        ? getAgentStatementCustomers(props.statement.periodMonth, signal)
        : getAdminAgentStatementCustomers(props.statement.id, signal),
  })
  if (detail.isPending) return <LoadingState />
  if (detail.isError) {
    return <ErrorState onRetry={() => void detail.refetch()} />
  }
  const points = (value: string) => formatExactPointQuantity(value, locale)
  const rmb = (value: string) => formatRmbYuan(value, locale)
  // The agent reads "Model fee"; administrators read the pricing term for the same amount.
  const feeLabel =
    props.mode === 'agent'
      ? t('Model fee')
      : t('Agent display amount (paid portion)')
  return (
    <StaticDataTable
      className='max-w-full overflow-x-auto'
      containerProps={{
        role: 'region',
        'aria-label': t('Statement details by customer'),
        tabIndex: 0,
      }}
      tableClassName='w-full min-w-[1208px] table-fixed'
      emptyContent={t('No statement details')}
      data={detail.data.items}
      getRowKey={(row) => row.customerId}
      columns={[
        {
          id: 'username',
          className: 'w-52',
          header: t('Username'),
          cell: (row) => row.username ?? '—',
        },
        {
          id: 'settledPoints',
          className: 'w-32',
          cellClassName: 'tabular-nums',
          header: t('Consumed points'),
          cell: (row) => points(row.settledPoints),
        },
        {
          id: 'paidPoints',
          className: 'w-32',
          cellClassName: 'tabular-nums',
          header: t('Paid points'),
          cell: (row) => points(row.paidPoints),
        },
        {
          id: 'customerPaidAmount',
          className: 'w-32',
          cellClassName: 'tabular-nums',
          header: t('Customer paid amount'),
          cell: (row) => rmb(row.customerPaidAmount),
        },
        {
          id: 'modelFeeAmount',
          className: 'w-40',
          cellClassName: 'tabular-nums',
          header: feeLabel,
          cell: (row) => rmb(row.modelFeeAmount),
        },
        {
          id: 'consumptionEarning',
          className: 'w-32',
          cellClassName: 'tabular-nums',
          header: t('Consumption earnings'),
          cell: (row) => rmb(row.consumptionEarning),
        },
        {
          id: 'expiredPoints',
          className: 'w-32',
          cellClassName: 'tabular-nums',
          header: t('Expired points'),
          cell: (row) => points(row.expiredPoints),
        },
        {
          id: 'expiryShare',
          className: 'w-32',
          cellClassName: 'tabular-nums',
          header: t('Expiry share'),
          cell: (row) => rmb(row.expiryShare),
        },
        {
          id: 'total',
          className: 'w-32',
          cellClassName: 'tabular-nums font-medium',
          header: t('Total earnings'),
          cell: (row) => rmb(row.total),
        },
      ]}
    />
  )
}

export function AgentStatementTable(props: StatementTableProps) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const admin = props.mode === 'admin'
  const agentPrincipalId =
    props.mode === 'admin' ? props.agentPrincipalId : undefined
  const state = useServerTableState<'periodMonth'>('periodMonth')
  const [month, setMonth] = useState<string | undefined>(
    props.mode === 'admin' ? props.initialMonth : undefined
  )
  const [expandedId, setExpandedId] = useState<string>()
  const pageQuery = {
    page: state.query.page,
    pageSize: state.query.pageSize as AgentPageSize,
    ...(month ? { month } : {}),
  }
  const statements = useQuery({
    queryKey: [
      ...agentEarningsQueryKeys.all,
      'statements',
      props.mode,
      pageQuery,
      agentPrincipalId,
      state.query.search,
    ],
    queryFn: ({ signal }) =>
      admin
        ? getAdminAgentStatements(
            {
              ...pageQuery,
              ...(agentPrincipalId ? { agentPrincipalId } : {}),
              ...(state.query.search
                ? { agentUsername: state.query.search }
                : {}),
            },
            signal
          )
        : getAgentStatements(pageQuery, signal),
    placeholderData: (previous) => previous,
  })
  const columns: ColumnDef<AgentMonthlyStatement, unknown>[] = [
    {
      id: 'periodMonth',
      accessorKey: 'periodMonth',
      enableSorting: false,
      header: t('Statement month'),
      size: 128,
      cell: ({ row }) => (
        <span className='tabular-nums'>{row.original.periodMonth}</span>
      ),
    },
    ...(admin
      ? [
          {
            id: 'agentUsername',
            accessorKey: 'agentUsername',
            enableSorting: false,
            header: t('Agent'),
            size: CANVAS_COLUMN_SIZES.wide,
            cell: ({ row }: { row: { original: AgentMonthlyStatement } }) =>
              row.original.agentUsername ?? '—',
          } satisfies ColumnDef<AgentMonthlyStatement, unknown>,
        ]
      : []),
    {
      id: 'consumptionMinor',
      accessorKey: 'consumptionMinor',
      enableSorting: false,
      header: t('Consumption earnings'),
      size: 128,
      meta: { align: 'end' },
      cell: ({ row }) => formatRmbMinor(row.original.consumptionMinor, locale),
    },
    {
      id: 'expiryShareMinor',
      accessorKey: 'expiryShareMinor',
      enableSorting: false,
      header: t('Expiry share'),
      size: 128,
      meta: { align: 'end' },
      cell: ({ row }) => formatRmbMinor(row.original.expiryShareMinor, locale),
    },
    {
      id: 'totalMinor',
      accessorKey: 'totalMinor',
      enableSorting: false,
      header: t('Total earnings'),
      size: 128,
      meta: { align: 'end' },
      cell: ({ row }) => (
        <strong>{formatRmbMinor(row.original.totalMinor, locale)}</strong>
      ),
    },
    {
      id: 'settledAt',
      accessorKey: 'settledAt',
      enableSorting: false,
      header: t('Settled at (Beijing time)'),
      size: CANVAS_COLUMN_SIZES.wide,
      cell: ({ row }) => formatBeijingDateTime(row.original.settledAt, locale),
    },
    {
      // "actions" sizes the column to its button, as in the other shared tables.
      id: 'actions',
      enableSorting: false,
      header: t('Action'),
      cell: ({ row }) => (
        <Button
          size='sm'
          variant='outline'
          aria-expanded={expandedId === row.original.id}
          onClick={() =>
            setExpandedId(
              expandedId === row.original.id ? undefined : row.original.id
            )
          }
        >
          {t('Statement action details')}
        </Button>
      ),
    },
  ]
  return (
    <CanvasServerTable
      data={statements.data?.items ?? []}
      columns={columns}
      total={statements.data?.total ?? 0}
      state={state}
      {...(admin ? { searchLabel: t('Agent username') } : {})}
      loading={statements.isPending || statements.isFetching}
      error={statements.isError}
      onRetry={() => void statements.refetch()}
      emptyTitle={t('No monthly statements')}
      filteredEmptyTitle={t('No statements match the filters')}
      additionalFilters={
        <DataTableColumnFilterField label={t('Statement month')}>
          <AgentMonthPicker
            label={t('Statement month')}
            value={month}
            availableMonths={statements.data?.months ?? []}
            onChange={(value) => {
              setMonth(value)
              state.setPagination((page) => ({ ...page, pageIndex: 0 }))
            }}
          />
        </DataTableColumnFilterField>
      }
      hasActiveFilters={Boolean(month)}
      onResetFilters={() => setMonth(undefined)}
      getRowId={(row) => row.id}
      renderRow={(row, getColumnClassName) => (
        <Fragment key={row.id}>
          <DataTableRow
            getColumnClassName={getColumnClassName}
            row={row}
            cellRenderColumns={columns}
            aria-expanded={expandedId === row.original.id}
          />
          {expandedId === row.original.id ? (
            <TableRow>
              <TableCell
                colSpan={row.getVisibleCells().length}
                className='bg-muted/20 p-4'
              >
                <StatementCustomers
                  mode={props.mode}
                  statement={row.original}
                />
              </TableCell>
            </TableRow>
          ) : null}
        </Fragment>
      )}
      renderExpandedContent={(row) =>
        expandedId === row.original.id ? (
          <StatementCustomers mode={props.mode} statement={row.original} />
        ) : null
      }
    />
  )
}

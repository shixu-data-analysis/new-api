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
import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader, DataTableRow } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { TableCell, TableRow } from '@/components/ui/table'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'

import {
  formatAgentTaskTimePrice,
  formatAgentUsage,
} from '../agent-usage-format'
import {
  getCanvasAdminAgentCustomerModelUsage,
  getCanvasAdminAgentCustomers,
  getCanvasAgentCustomerModelUsage,
  getCanvasAgentCustomers,
} from '../api'
import {
  formatExactPointQuantity,
  formatExactRmbReference,
} from '../number-format'
import { pricingScopeLabel } from '../pricing-scope-label'
import type {
  CanvasAdminAgentCustomer,
  CanvasAdminAgentModelUsageRow,
  CanvasAgentCustomer,
  CanvasAgentCustomerQuery,
  CanvasAgentModelUsageRow,
  CanvasAgentPriceGroupSummary,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTerm } from './BusinessTerm'
import { CANVAS_COLUMN_SIZES } from './canvas-table-layout'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'

/**
 * Whose customers the list shows: the signed-in agent's own, or one agent's as the administrator sees them, with the
 * masked email, the agent display amount and the email and price group filters.
 */
export type AgentCustomerSource =
  | { kind: 'agent' }
  | {
      kind: 'admin'
      agentCustomerId: string
      priceGroups: CanvasAgentPriceGroupSummary[]
    }

type CustomerRow = CanvasAgentCustomer & Partial<CanvasAdminAgentCustomer>
type UsageRow = CanvasAgentModelUsageRow &
  Partial<CanvasAdminAgentModelUsageRow>

/** The agent display amount; the hint follows the incomplete flag, not the amount. */
function DisplayAmount(props: { value: string | null; incomplete: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  return (
    <span>
      {props.value === null
        ? '—'
        : `¥${formatExactRmbReference(props.value, locale)}`}
      {props.incomplete
        ? t('{{label}} ({{detail}})', {
            label: '',
            detail: t('Amount incomplete'),
          })
        : ''}
    </span>
  )
}

function ModelUsage(props: {
  customerId: string
  source: AgentCustomerSource
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const { source } = props
  const admin = source.kind === 'admin'
  const state = useServerTableState<'priceGroupName'>('priceGroupName')
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      admin ? 'admin-agent-model-usage' : 'agent-customer-model-usage',
      admin ? source.agentCustomerId : null,
      props.customerId,
      state.query.page,
      state.query.pageSize,
    ],
    queryFn: ({ signal }): Promise<{ items: UsageRow[]; total: number }> => {
      const page = { page: state.query.page, pageSize: state.query.pageSize }
      return admin
        ? getCanvasAdminAgentCustomerModelUsage(
            source.agentCustomerId,
            props.customerId,
            page,
            signal
          )
        : getCanvasAgentCustomerModelUsage(props.customerId, page, signal)
    },
  })
  const columns: ColumnDef<UsageRow, unknown>[] = [
    {
      id: 'priceGroupName',
      accessorKey: 'priceGroupName',
      header: t('Task-time price group'),
    },
    {
      id: 'effectiveDisplayName',
      accessorKey: 'effectiveDisplayName',
      header: t('Model / specification'),
      cell: ({ row }) => (
        <span>
          {row.original.effectiveDisplayName} /{' '}
          {pricingScopeLabel(
            {
              key: row.original.combinationKey,
              parameters: row.original.parameters,
            },
            t
          )}
        </span>
      ),
    },
    {
      id: 'usage',
      header: t('Usage'),
      cell: ({ row }) =>
        formatAgentUsage(
          row.original,
          row.original.agentPriceSnapshot,
          t,
          locale
        ),
    },
    {
      id: 'successfulTasks',
      accessorKey: 'successfulTasks',
      header: t('Successful tasks'),
      cell: ({ row }) =>
        formatExactPointQuantity(String(row.original.successfulTasks), locale),
    },
    {
      id: 'settledPoints',
      accessorKey: 'settledPoints',
      header: t('Consumed points'),
      cell: ({ row }) =>
        formatExactPointQuantity(row.original.settledPoints, locale),
    },
    {
      id: 'agentPriceSnapshot',
      header: admin
        ? t('Task-time agent display price')
        : t('Task-time model price'),
      cell: ({ row }) =>
        formatAgentTaskTimePrice(
          row.original,
          row.original.agentPriceSnapshot,
          row.original.agentPriceSnapshotStatus,
          t,
          locale
        ),
    },
    ...(admin
      ? [
          {
            id: 'modelUsageAmount',
            meta: { label: t('Agent display amount'), align: 'end' as const },
            header: () => (
              <BusinessTerm
                kind='dashboardMetric'
                value='AGENT_DISPLAY_AMOUNT'
              />
            ),
            cell: ({ row }: { row: { original: UsageRow } }) => (
              <DisplayAmount
                value={row.original.modelUsageAmount ?? null}
                incomplete={row.original.amountIncomplete ?? false}
              />
            ),
          } satisfies ColumnDef<UsageRow, unknown>,
        ]
      : []),
  ]
  return (
    <CanvasServerTable
      data={query.data?.items ?? []}
      columns={columns}
      total={query.data?.total ?? 0}
      state={state}
      loading={query.isPending || query.isFetching}
      error={query.isError}
      onRetry={() => void query.refetch()}
      emptyTitle={t('No model usage')}
      getRowId={(row) =>
        `${row.priceGroupId}:${row.modelKey}:${row.combinationKey}:${row.billingUnit}`
      }
    />
  )
}

/** Seven dots for `recentDays`, oldest on the left and today on the right; a day with a submitted task is lit. */
function RecentActivity(props: { recentDays: string[]; activeDays: string[] }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const active = new Set(props.activeDays)
  const format = new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  })
  const days = props.recentDays.map((day, index) => {
    const date = format.format(new Date(`${day}T00:00:00Z`))
    return {
      day,
      label:
        index === props.recentDays.length - 1
          ? t('{{date}} (today)', { date })
          : date,
      lit: active.has(day),
    }
  })
  const litLabels = days
    .filter((entry) => entry.lit)
    .map((entry) => entry.label)
  // Hover shows each day; the accessible name lists the active days for keyboard, touch and screen reader users.
  return (
    <span
      role='img'
      aria-label={
        litLabels.length === 0
          ? t('Active on {{count}} of the last 7 days', { count: 0 })
          : t('Active on {{count}} of the last 7 days: {{dates}}', {
              count: litLabels.length,
              dates: new Intl.ListFormat(locale, {
                style: 'narrow',
                type: 'unit',
              }).format(litLabels),
            })
      }
      className='inline-flex gap-1 align-middle'
    >
      {days.map((entry) => (
        <span
          key={entry.day}
          title={
            entry.lit
              ? t('{{day}}: active', { day: entry.label })
              : t('{{day}}: inactive', { day: entry.label })
          }
          data-active={entry.lit}
          className={
            entry.lit
              ? 'bg-primary size-2 rounded-full'
              : 'bg-border size-2 rounded-full'
          }
        />
      ))}
    </span>
  )
}

/**
 * Customers attributed to an agent, with their recharge, consumption and last-7-day activity. Shared by the agent's
 * 我的客户 and the administrator's agent statistics; see `AgentCustomerSource`.
 */
export function AgentCustomerList(props: { source: AgentCustomerSource }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const { source } = props
  const admin = source.kind === 'admin'
  const [expandedCustomerId, setExpandedCustomerId] = useState<string>()
  const customersState =
    useServerTableState<CanvasAgentCustomerQuery['sortBy']>('activatedAt')
  const setCustomersPagination = customersState.setPagination
  const [customerStatus, setCustomerStatus] = useState('')
  const [priceGroupId, setPriceGroupId] = useState('')
  const [email, setEmail] = useState('')
  const debouncedEmail = useDebounce(email.trim(), 300)
  useEffect(() => {
    setCustomersPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [customerStatus, priceGroupId, debouncedEmail, setCustomersPagination])
  const customers = useQuery({
    queryKey: [
      'canvas-cloud',
      admin ? 'admin-agent-customers' : 'agent-customers',
      admin ? source.agentCustomerId : null,
      customersState.query,
      customerStatus,
      priceGroupId,
      debouncedEmail,
    ],
    queryFn: ({
      signal,
    }): Promise<{
      items: CustomerRow[]
      total: number
      recentDays: string[]
    }> => {
      const query = {
        page: customersState.query.page,
        pageSize: customersState.query.pageSize,
        sortBy: customersState.query.sortBy,
        sortOrder: customersState.query.sortOrder,
        ...(customersState.query.search
          ? { username: customersState.query.search }
          : {}),
        ...(customerStatus
          ? { status: customerStatus as CanvasAgentCustomer['status'] }
          : {}),
      }
      return admin
        ? getCanvasAdminAgentCustomers(
            source.agentCustomerId,
            {
              ...query,
              ...(priceGroupId ? { priceGroupId } : {}),
              ...(debouncedEmail ? { email: debouncedEmail } : {}),
            },
            signal
          )
        : getCanvasAgentCustomers(query, signal)
    },
  })
  const recentDays = customers.data?.recentDays ?? []
  const customerColumns: ColumnDef<CustomerRow, unknown>[] = [
    {
      id: 'customer',
      accessorKey: 'username',
      enableHiding: false,
      meta: { label: t('Customer') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Customer')} />
      ),
      // The administrator also sees the masked email, under the username.
      cell: ({ row }) => (
        <div className='min-w-0'>
          <div className='font-medium'>{row.original.username ?? '—'}</div>
          {admin && row.original.emailMasked ? (
            <div className='text-muted-foreground text-xs'>
              {row.original.emailMasked}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: 'status',
      accessorKey: 'status',
      meta: { label: t('Status') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Status')} />
      ),
      cell: ({ row }) => (
        <BusinessTerm kind='customerStatus' value={row.original.status} />
      ),
    },
    {
      id: 'rechargedPoints',
      accessorKey: 'rechargedPoints',
      size: CANVAS_COLUMN_SIZES.compact,
      meta: { label: t('Total recharged points'), align: 'end' },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Total recharged points')}
        />
      ),
      cell: ({ row }) =>
        formatExactPointQuantity(row.original.rechargedPoints, locale),
    },
    {
      id: 'consumedPoints',
      accessorKey: 'consumedPoints',
      size: CANVAS_COLUMN_SIZES.compact,
      meta: { label: t('Total consumed points'), align: 'end' },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Total consumed points')}
        />
      ),
      cell: ({ row }) =>
        formatExactPointQuantity(row.original.consumedPoints, locale),
    },
    {
      id: 'activeDays',
      accessorKey: 'activeDays',
      size: CANVAS_COLUMN_SIZES.compact,
      meta: { label: t('Active in the last 7 days') },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Active in the last 7 days')}
        />
      ),
      cell: ({ row }) => (
        <RecentActivity
          recentDays={recentDays}
          activeDays={row.original.activeDays}
        />
      ),
    },
    {
      id: 'activatedAt',
      accessorKey: 'activatedAt',
      size: CANVAS_COLUMN_SIZES.compact,
      meta: { label: t('Registered at') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Registered at')} />
      ),
      cell: ({ row }) =>
        row.original.activatedAt
          ? new Date(row.original.activatedAt).toLocaleDateString()
          : '—',
    },
    ...(admin
      ? [
          {
            id: 'modelUsageAmount',
            accessorKey: 'modelUsageAmount',
            size: CANVAS_COLUMN_SIZES.compact,
            enableSorting: false,
            meta: { label: t('Agent display amount'), align: 'end' as const },
            header: () => (
              <BusinessTerm
                kind='dashboardMetric'
                value='AGENT_DISPLAY_AMOUNT'
              />
            ),
            cell: ({ row }: { row: { original: CustomerRow } }) => (
              <DisplayAmount
                value={row.original.modelUsageAmount ?? null}
                incomplete={row.original.amountIncomplete ?? false}
              />
            ),
          } satisfies ColumnDef<CustomerRow, unknown>,
        ]
      : []),
    {
      id: 'currentPriceGroup',
      accessorFn: (row) => row.currentPriceGroup.name,
      meta: { label: t('Current price group') },
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Current price group')}
        />
      ),
    },
    {
      id: 'successfulTasks',
      accessorKey: 'successfulTasks',
      size: CANVAS_COLUMN_SIZES.compact,
      // Counted for the current page only, so it cannot be sorted.
      enableSorting: false,
      meta: { label: t('Successful tasks'), align: 'end' },
      header: t('Successful tasks'),
      cell: ({ row }) =>
        formatExactPointQuantity(String(row.original.successfulTasks), locale),
    },
    {
      id: 'usageAction',
      header: t('Action'),
      cell: ({ row }) => (
        <Button
          size='sm'
          variant='outline'
          aria-expanded={expandedCustomerId === row.original.id}
          onClick={() =>
            setExpandedCustomerId(
              expandedCustomerId === row.original.id
                ? undefined
                : row.original.id
            )
          }
        >
          {t('Model usage')}
        </Button>
      ),
    },
  ]
  const priceGroupName = (id: string) =>
    admin
      ? (source.priceGroups.find((group) => group.priceGroupId === id)
          ?.priceGroupName ?? id)
      : id
  return (
    <CanvasServerTable
      data={customers.data?.items ?? []}
      columns={customerColumns}
      total={customers.data?.total ?? 0}
      state={customersState}
      searchLabel={t('Username')}
      loading={customers.isPending || customers.isFetching}
      error={customers.isError}
      onRetry={() => void customers.refetch()}
      emptyTitle={t('No customers')}
      initialColumnVisibility={{
        currentPriceGroup: false,
        successfulTasks: false,
      }}
      additionalFilters={
        <>
          {admin ? (
            <DataTableColumnFilterField label={t('Email')}>
              <Input
                value={email}
                placeholder={t('Email')}
                aria-label={t('Email')}
                onChange={(event) => setEmail(event.target.value)}
              />
            </DataTableColumnFilterField>
          ) : null}
          <DataTableColumnFilterField label={t('Status')}>
            <Select
              value={customerStatus || 'ALL'}
              onValueChange={(value) =>
                setCustomerStatus(value === 'ALL' ? '' : (value ?? ''))
              }
            >
              <SelectTrigger className='w-full' aria-label={t('Status')}>
                <CanvasLocalizedSelectValue
                  value={customerStatus}
                  emptyLabelKey='All statuses'
                  termKind='customerStatus'
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                {['ACTIVE', 'SUSPENDED', 'CLOSED'].map((value) => (
                  <SelectItem key={value} value={value}>
                    <BusinessTerm kind='customerStatus' value={value} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DataTableColumnFilterField>
          {admin ? (
            <DataTableColumnFilterField label={t('Current price group')}>
              <Select
                value={priceGroupId || 'ALL'}
                onValueChange={(value) =>
                  setPriceGroupId(value === 'ALL' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger
                  className='w-full'
                  aria-label={t('Current price group')}
                >
                  <CanvasLocalizedSelectValue
                    value={priceGroupId}
                    emptyLabelKey='All price groups'
                    displayValue={priceGroupName(priceGroupId)}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All price groups')}</SelectItem>
                  {source.priceGroups.map((group) => (
                    <SelectItem
                      key={group.priceGroupId}
                      value={group.priceGroupId}
                    >
                      {group.priceGroupName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DataTableColumnFilterField>
          ) : null}
        </>
      }
      hasActiveFilters={Boolean(customerStatus || priceGroupId || email)}
      onResetFilters={() => {
        setCustomerStatus('')
        setPriceGroupId('')
        setEmail('')
      }}
      getRowId={(row) => row.id}
      renderRow={(row, getColumnClassName) => (
        <Fragment key={row.id}>
          <DataTableRow
            getColumnClassName={getColumnClassName}
            row={row}
            cellRenderColumns={customerColumns}
            aria-expanded={expandedCustomerId === row.original.id}
          />
          {expandedCustomerId === row.original.id ? (
            <TableRow>
              <TableCell
                colSpan={row.getVisibleCells().length}
                className='bg-muted/20 p-4'
              >
                <ModelUsage customerId={row.original.id} source={source} />
              </TableCell>
            </TableRow>
          ) : null}
        </Fragment>
      )}
      renderExpandedContent={(row) =>
        expandedCustomerId === row.original.id ? (
          <ModelUsage customerId={row.original.id} source={source} />
        ) : null
      }
    />
  )
}

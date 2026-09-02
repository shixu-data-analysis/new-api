/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  getCanvasAdminCustomerTasks,
  getCanvasAdminRechargeOrders,
} from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import type {
  CanvasAdminCustomerTask,
  CanvasAdminRechargeOrder,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { AdminAuditLog } from './AdminAuditLog'
import { BusinessTerm } from './BusinessTerm'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { useCanvasRechargeOrderColumns } from './CanvasRechargeOrder'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import { CustomerPointHistory } from './CustomerPointHistory'

const orderStatuses = [
  'CREATED',
  'PAYMENT_PENDING',
  'PAID',
  'CODE_ACTIVATED',
  'REFUND_REVIEW',
  'REFUNDED',
  'CANCELLED',
] as const
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

function CustomerOrders({
  customerId,
  selectedOrderId,
  onCorrectOrder,
}: {
  customerId: string
  selectedOrderId?: string
  onCorrectOrder?: (order: CanvasAdminRechargeOrder) => void
}) {
  const { t } = useTranslation()
  const state = useServerTableState('createdAt')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const rangeValid = isCanvasDateRangeValid(from, to)
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-customer',
      customerId,
      'recharge-orders',
      state.query,
      status,
      from?.toISOString(),
      to?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminRechargeOrders(
        {
          ...state.query,
          customerId,
          ...(status
            ? { status: status as (typeof orderStatuses)[number] }
            : {}),
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        },
        signal
      ),
    enabled: rangeValid,
  })
  const columns = useCanvasRechargeOrderColumns({
    showCorrectionDetails: Boolean(onCorrectOrder),
    selectedOrderId,
    isSelectable: (order) =>
      order.eligibleForPaidCorrection &&
      BigInt(order.remainingCorrectionPoints) > 0n,
    onSelect: onCorrectOrder,
    actionLabel: t('Correct Paid points'),
    hideUnavailableAction: true,
  })
  return (
    <CanvasServerTable<CanvasAdminRechargeOrder>
      data={query.data?.items ?? []}
      columns={columns}
      total={query.data?.total ?? 0}
      state={state}
      searchLabel={t('Canvas recharge order number')}
      searchPlaceholder={t('Search Canvas recharge order number')}
      searchDescription={t(
        'Fuzzy matches any consecutive part of the Canvas recharge order number for this customer.'
      )}
      loading={query.isLoading || query.isFetching}
      emptyTitle={t('No recharge orders')}
      additionalFilters={
        <div className='flex flex-wrap gap-2'>
          <Select
            value={status || 'ALL'}
            onValueChange={(value) =>
              setStatus(value === 'ALL' ? '' : (value ?? ''))
            }
          >
            <SelectTrigger className='w-48'>
              <SelectValue placeholder={t('Status')}>
                {status ? (
                  <BusinessTerm kind='rechargeOrderStatus' value={status} />
                ) : (
                  t('All statuses')
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
              {orderStatuses.map((value) => (
                <SelectItem key={value} value={value}>
                  <BusinessTerm kind='rechargeOrderStatus' value={value} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CanvasDateRangeFilter
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
          />
        </div>
      }
      hasActiveFilters={Boolean(status || from || to)}
      onResetFilters={() => {
        setStatus('')
        setFrom(undefined)
        setTo(undefined)
      }}
      getRowId={(row) => row.id}
    />
  )
}

function CustomerTasks({ customerId }: { customerId: string }) {
  const { t } = useTranslation()
  const state = useServerTableState('acceptedAt')
  const [executionStatus, setExecutionStatus] = useState('')
  const [billingStatus, setBillingStatus] = useState('')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const rangeValid = isCanvasDateRangeValid(from, to)
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-customer',
      customerId,
      'tasks',
      state.query,
      executionStatus,
      billingStatus,
      from?.toISOString(),
      to?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminCustomerTasks(
        customerId,
        {
          ...state.query,
          ...(executionStatus ? { executionStatus } : {}),
          ...(billingStatus ? { billingStatus } : {}),
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        },
        signal
      ),
    enabled: rangeValid,
  })
  const columns = useMemo<ColumnDef<CanvasAdminCustomerTask, unknown>[]>(
    () => [
      {
        id: 'taskId',
        accessorKey: 'id',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Task ID')} />
        ),
        meta: { label: t('Task ID') },
        cell: ({ row }) => <CopyableText value={row.original.id} />,
      },
      {
        id: 'model',
        accessorKey: 'modelName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Model')} />
        ),
        meta: { label: t('Model') },
      },
      {
        id: 'quotedPoints',
        accessorKey: 'quotedPoints',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Quoted points')} />
        ),
        meta: { label: t('Quoted points') },
      },
      {
        id: 'settledPoints',
        accessorKey: 'settledPoints',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Consumed points')} />
        ),
        meta: { label: t('Consumed points') },
      },
      {
        id: 'executionStatus',
        accessorKey: 'executionStatus',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Execution status')}
          />
        ),
        meta: { label: t('Execution status') },
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
          <DataTableColumnHeader column={column} title={t('Billing status')} />
        ),
        meta: { label: t('Billing status') },
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
        cell: ({ row }) => formatCanvasDateTime(row.original.completedAt, '—'),
      },
    ],
    [t]
  )
  const filters = (
    <div className='flex flex-wrap gap-2'>
      <Select
        value={executionStatus || 'ALL'}
        onValueChange={(value) =>
          setExecutionStatus(value === 'ALL' ? '' : (value ?? ''))
        }
      >
        <SelectTrigger className='w-48'>
          <SelectValue placeholder={t('Execution status')}>
            {executionStatus ? (
              <BusinessTerm
                kind='taskExecutionStatus'
                value={executionStatus}
              />
            ) : (
              t('All execution statuses')
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='ALL'>{t('All execution statuses')}</SelectItem>
          {executionStatuses.map((value) => (
            <SelectItem key={value} value={value}>
              <BusinessTerm kind='taskExecutionStatus' value={value} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={billingStatus || 'ALL'}
        onValueChange={(value) =>
          setBillingStatus(value === 'ALL' ? '' : (value ?? ''))
        }
      >
        <SelectTrigger className='w-48'>
          <SelectValue placeholder={t('Billing status')}>
            {billingStatus ? (
              <BusinessTerm kind='billingStatus' value={billingStatus} />
            ) : (
              t('All billing statuses')
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='ALL'>{t('All billing statuses')}</SelectItem>
          {billingStatuses.map((value) => (
            <SelectItem key={value} value={value}>
              <BusinessTerm kind='billingStatus' value={value} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <CanvasDateRangeFilter
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
      />
    </div>
  )
  return (
    <CanvasServerTable
      data={query.data?.items ?? []}
      columns={columns}
      total={query.data?.total ?? 0}
      state={state}
      searchLabel={t('Task ID, model, or upstream task ID')}
      searchPlaceholder={t('Search tasks')}
      searchDescription={t(
        'Fuzzy matches the Canvas task ID, model name, or upstream task ID for this customer.'
      )}
      loading={query.isLoading || query.isFetching}
      emptyTitle={t('No Canvas tasks')}
      additionalFilters={filters}
      hasActiveFilters={Boolean(executionStatus || billingStatus || from || to)}
      onResetFilters={() => {
        setExecutionStatus('')
        setBillingStatus('')
        setFrom(undefined)
        setTo(undefined)
      }}
      getRowId={(row) => row.id}
    />
  )
}

export function AdminCustomerOperations({
  customerId,
  selectedOrderId,
  selectedLotId,
  onCorrectOrder,
  onDeductLot,
}: {
  customerId: string
  selectedOrderId?: string
  selectedLotId?: string
  onCorrectOrder?: (order: CanvasAdminRechargeOrder) => void
  onDeductLot?: (lot: import('../types').CanvasAdminPointLot) => void
}) {
  const { t } = useTranslation()
  return (
    <Tabs defaultValue='orders'>
      <TabsList className='max-w-full justify-start overflow-x-auto'>
        <TabsTrigger value='orders'>{t('Recharge orders')}</TabsTrigger>
        <TabsTrigger value='lots'>{t('Point Lots')}</TabsTrigger>
        <TabsTrigger value='ledger'>{t('Point ledger')}</TabsTrigger>
        <TabsTrigger value='tasks'>{t('Tasks')}</TabsTrigger>
        <TabsTrigger value='audit'>{t('Customer audit')}</TabsTrigger>
      </TabsList>
      <TabsContent value='orders'>
        <CustomerOrders
          customerId={customerId}
          selectedOrderId={selectedOrderId}
          onCorrectOrder={onCorrectOrder}
        />
      </TabsContent>
      <TabsContent value='lots'>
        <CustomerPointHistory
          customerId={customerId}
          view='lots'
          selectedLotId={selectedLotId}
          onDeductLot={onDeductLot}
        />
      </TabsContent>
      <TabsContent value='ledger'>
        <CustomerPointHistory customerId={customerId} view='ledger' />
      </TabsContent>
      <TabsContent value='tasks'>
        <CustomerTasks customerId={customerId} />
      </TabsContent>
      <TabsContent value='audit'>
        <AdminAuditLog customerId={customerId} />
      </TabsContent>
    </Tabs>
  )
}

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
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader, DataTableRow } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { TableCell, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'

import {
  getCanvasAdminCustomerTasks,
  getCanvasOrderPointReturns,
  getCanvasAdminRechargeOrders,
} from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime, formatMoneyMinor } from '../formatters'
import type {
  CanvasAdminCustomerTask,
  CanvasAdminRechargeOrder,
  CanvasOrderPointReturnRecord,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTerm } from './BusinessTerm'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import {
  CustomerBusinessFacts,
  type CustomerFactTarget,
} from './CustomerBusinessFacts'
import { CustomerPointHistory } from './CustomerPointHistory'
import { CustomerRecordDetails } from './CustomerRecordDetails'

const orderStatuses = [
  'CREATED',
  'PAYMENT_PENDING',
  'PAID',
  'CODE_ACTIVATED',
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
  targetOrderId,
  selectedOrderId,
  onCorrectOrder,
  onReturnOrder,
  onInspect,
  onReturnFromOrderTarget,
}: {
  customerId: string
  targetOrderId?: string
  selectedOrderId?: string
  onCorrectOrder?: (order: CanvasAdminRechargeOrder) => void
  onReturnOrder?: (order: CanvasAdminRechargeOrder) => void
  onInspect: (target: CustomerFactTarget) => void
  onReturnFromOrderTarget?: () => void
}) {
  const { t, i18n } = useTranslation()
  const browseState = useServerTableState('createdAt')
  const targetState = useServerTableState('createdAt')
  const state = targetOrderId ? targetState : browseState
  const setBrowsePagination = browseState.setPagination
  const [status, setStatus] = useState('')
  const [createdFrom, setCreatedFrom] = useState<Date>()
  const [createdTo, setCreatedTo] = useState<Date>()
  const [redeemedFrom, setRedeemedFrom] = useState<Date>()
  const [redeemedTo, setRedeemedTo] = useState<Date>()
  const [expandedOrderId, setExpandedOrderId] = useState<string>()
  const lastScrolledOrderId = useRef<string | undefined>(undefined)
  const rangeValid =
    isCanvasDateRangeValid(createdFrom, createdTo) &&
    isCanvasDateRangeValid(redeemedFrom, redeemedTo)
  useEffect(() => {
    setBrowsePagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [
    createdFrom,
    createdTo,
    redeemedFrom,
    redeemedTo,
    setBrowsePagination,
    status,
  ])
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-customer',
      customerId,
      'recharge-orders',
      state.query,
      status,
      createdFrom?.toISOString(),
      createdTo?.toISOString(),
      redeemedFrom?.toISOString(),
      redeemedTo?.toISOString(),
      targetOrderId,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminRechargeOrders(
        targetOrderId
          ? {
              page: targetState.query.page,
              pageSize: targetState.query.pageSize,
              sortBy: targetState.query.sortBy,
              sortOrder: targetState.query.sortOrder,
              customerId,
              orderId: targetOrderId,
            }
          : {
              page: browseState.query.page,
              pageSize: browseState.query.pageSize,
              sortBy: browseState.query.sortBy,
              sortOrder: browseState.query.sortOrder,
              ...(browseState.query.search
                ? { orderNumber: browseState.query.search }
                : {}),
              customerId,
              ...(status
                ? { status: status as (typeof orderStatuses)[number] }
                : {}),
              ...(createdFrom
                ? { createdFrom: createdFrom.toISOString() }
                : {}),
              ...(createdTo ? { createdTo: createdTo.toISOString() } : {}),
              ...(redeemedFrom
                ? { redeemedFrom: redeemedFrom.toISOString() }
                : {}),
              ...(redeemedTo ? { redeemedTo: redeemedTo.toISOString() } : {}),
            },
        signal
      ),
    enabled: rangeValid,
  })
  useEffect(() => {
    if (
      !targetOrderId ||
      !query.data?.items.some((item) => item.id === targetOrderId) ||
      lastScrolledOrderId.current === targetOrderId
    ) {
      return
    }
    lastScrolledOrderId.current = targetOrderId
    requestAnimationFrame(() =>
      document
        .querySelector(`#recharge-order-${targetOrderId}`)
        ?.scrollIntoView({ block: 'center' })
    )
  }, [query.data, targetOrderId])
  const number = useCallback(
    (value: string) =>
      new Intl.NumberFormat(toIntlLocale(i18n.language)).format(BigInt(value)),
    [i18n.language]
  )
  const columns = useMemo<ColumnDef<CanvasAdminRechargeOrder, unknown>[]>(
    () => [
      {
        id: 'orderNumber',
        accessorKey: 'orderNumber',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Recharge order number')}
          />
        ),
        meta: { label: t('Recharge order number') },
        cell: ({ row }) => <CopyableText value={row.original.orderNumber} />,
      },
      {
        id: 'amount',
        accessorKey: 'listedAmountMinor',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Recharge amount')} />
        ),
        meta: { label: t('Recharge amount') },
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {formatMoneyMinor(
              row.original.listedAmountMinor,
              row.original.currency
            )}
          </div>
        ),
      },
      {
        id: 'purchasedPoints',
        accessorKey: 'purchasedPoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Purchased points')}
          />
        ),
        meta: { label: t('Purchased points') },
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {number(
              row.original.purchasedPoints ?? row.original.expectedPaidPoints
            )}
          </div>
        ),
      },
      {
        id: 'issuedBonusPoints',
        accessorKey: 'issuedBonusPoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Recharge bonus points')}
          />
        ),
        meta: { label: t('Recharge bonus points') },
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {number(row.original.issuedBonusPoints ?? '0')}
          </div>
        ),
      },
      {
        id: 'availablePaidPoints',
        accessorKey: 'availablePaidPoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Available recharge points')}
          />
        ),
        meta: { label: t('Available recharge points') },
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {number(row.original.availablePaidPoints)}
          </div>
        ),
      },
      {
        id: 'availableBonusPoints',
        accessorKey: 'availableBonusPoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Available bonus points')}
          />
        ),
        meta: { label: t('Available bonus points') },
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {number(row.original.availableBonusPoints)}
          </div>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        meta: { label: t('Status') },
        cell: ({ row }) => (
          <BusinessTerm
            kind='rechargeOrderStatus'
            value={row.original.status}
          />
        ),
      },
      {
        id: 'redeemedAt',
        accessorKey: 'redeemedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Redeemed at')} />
        ),
        meta: { label: t('Redeemed at') },
        cell: ({ row }) =>
          formatCanvasDateTime(row.original.redeemedAt, t('Not redeemed')),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        header: t('Actions'),
        cell: ({ row }) => (
          <div className='flex flex-wrap gap-1'>
            {onReturnOrder && BigInt(row.original.availablePaidPoints) > 0n ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => onReturnOrder(row.original)}
              >
                {t('Return points')}
              </Button>
            ) : null}
            {onCorrectOrder &&
            row.original.eligibleForPaidCorrection &&
            BigInt(row.original.remainingCorrectionPoints) > 0n ? (
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => onCorrectOrder(row.original)}
              >
                {t('Correct Paid points')}
              </Button>
            ) : null}
            {row.original.pointReturnCount > 0 ? (
              <Button
                type='button'
                size='sm'
                variant='ghost'
                aria-expanded={expandedOrderId === row.original.id}
                onClick={() =>
                  setExpandedOrderId((value) =>
                    value === row.original.id ? undefined : row.original.id
                  )
                }
              >
                {t('Return history')}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [expandedOrderId, number, onCorrectOrder, onReturnOrder, t]
  )
  return (
    <div className='space-y-4'>
      {targetOrderId && onReturnFromOrderTarget ? (
        <Button
          type='button'
          variant='outline'
          onClick={onReturnFromOrderTarget}
        >
          {t('Back to point details')}
        </Button>
      ) : null}
      <CanvasServerTable<CanvasAdminRechargeOrder>
        data={query.data?.items ?? []}
        columns={columns}
        total={query.data?.total ?? 0}
        state={state}
        searchLabel={targetOrderId ? undefined : t('Recharge order number')}
        loading={query.isLoading || query.isFetching}
        error={query.isError}
        errorTitle={
          targetOrderId
            ? t('Unable to load the linked recharge order')
            : undefined
        }
        onRetry={() => void query.refetch()}
        emptyTitle={
          targetOrderId
            ? t('The linked recharge order is unavailable')
            : t('No recharge orders')
        }
        filteredEmptyTitle={t('No matching results')}
        additionalFilters={
          targetOrderId ? undefined : (
            <>
              <DataTableColumnFilterField label={t('Status')}>
                <Select
                  value={status || 'ALL'}
                  onValueChange={(value) =>
                    setStatus(value === 'ALL' ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger className='w-full' aria-label={t('Status')}>
                    <CanvasLocalizedSelectValue
                      value={status}
                      emptyLabelKey='All statuses'
                      termKind='rechargeOrderStatus'
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                    {orderStatuses.map((value) => (
                      <SelectItem key={value} value={value}>
                        <BusinessTerm
                          kind='rechargeOrderStatus'
                          value={value}
                        />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DataTableColumnFilterField>
              <div className='sm:col-span-2'>
                <p className='mb-2 text-sm font-medium'>{t('Created time')}</p>
                <CanvasDateRangeFilter
                  from={createdFrom}
                  to={createdTo}
                  onFromChange={setCreatedFrom}
                  onToChange={setCreatedTo}
                />
              </div>
              <div className='sm:col-span-2'>
                <p className='mb-2 text-sm font-medium'>{t('Redeemed time')}</p>
                <CanvasDateRangeFilter
                  from={redeemedFrom}
                  to={redeemedTo}
                  onFromChange={setRedeemedFrom}
                  onToChange={setRedeemedTo}
                />
              </div>
            </>
          )
        }
        hasActiveFilters={Boolean(
          !targetOrderId &&
          (status || createdFrom || createdTo || redeemedFrom || redeemedTo)
        )}
        onResetFilters={() => {
          setStatus('')
          setCreatedFrom(undefined)
          setCreatedTo(undefined)
          setRedeemedFrom(undefined)
          setRedeemedTo(undefined)
        }}
        getRowId={(row) => row.id}
        getRowClassName={(row) =>
          (targetOrderId ?? selectedOrderId) === row.original.id
            ? 'bg-primary/5'
            : undefined
        }
        renderRow={(row) => (
          <Fragment key={row.id}>
            <DataTableRow
              id={`recharge-order-${row.original.id}`}
              row={row}
              cellRenderColumns={columns}
              aria-expanded={expandedOrderId === row.original.id}
            />
            {expandedOrderId === row.original.id ? (
              <TableRow>
                <TableCell
                  colSpan={row.getVisibleCells().length}
                  className='bg-muted/20 p-4'
                >
                  <OrderPointReturnHistory
                    customerId={customerId}
                    order={row.original}
                    onInspect={onInspect}
                  />
                </TableCell>
              </TableRow>
            ) : null}
          </Fragment>
        )}
        renderExpandedContent={(row) =>
          expandedOrderId === row.original.id ? (
            <OrderPointReturnHistory
              customerId={customerId}
              order={row.original}
              onInspect={onInspect}
            />
          ) : null
        }
      />
    </div>
  )
}

function OrderPointReturnHistory({
  customerId,
  order,
  onInspect,
}: {
  customerId: string
  order: CanvasAdminRechargeOrder
  onInspect: (target: CustomerFactTarget) => void
}) {
  const { t, i18n } = useTranslation()
  const state = useServerTableState('createdAt')
  const setPagination = state.setPagination
  const [operator, setOperator] = useState('')
  const debouncedOperator = useDebounce(operator.trim(), 300)
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const rangeValid = isCanvasDateRangeValid(from, to)
  useEffect(() => {
    setPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [debouncedOperator, from, setPagination, to])
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-customer',
      customerId,
      'order',
      order.id,
      'point-returns',
      state.query,
      debouncedOperator,
      from?.toISOString(),
      to?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasOrderPointReturns(
        customerId,
        order.id,
        {
          page: state.query.page,
          pageSize: state.query.pageSize,
          sortOrder: state.query.sortOrder,
          ...(state.query.search ? { reason: state.query.search } : {}),
          ...(debouncedOperator ? { operator: debouncedOperator } : {}),
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        },
        signal
      ),
    enabled: rangeValid,
  })
  const number = useCallback(
    (value: string) =>
      new Intl.NumberFormat(toIntlLocale(i18n.language)).format(BigInt(value)),
    [i18n.language]
  )
  const columns = useMemo<ColumnDef<CanvasOrderPointReturnRecord, unknown>[]>(
    () => [
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Time')} />
        ),
        meta: { label: t('Time') },
        cell: ({ row }) => (
          <Button
            type='button'
            variant='link'
            className='h-auto p-0 font-normal'
            onClick={() =>
              onInspect({ kind: 'pointReturn', id: row.original.id })
            }
          >
            {formatCanvasDateTime(row.original.createdAt)}
          </Button>
        ),
      },
      {
        id: 'points',
        accessorKey: 'points',
        enableSorting: false,
        header: t('Returned points'),
        meta: { label: t('Returned points') },
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {number(row.original.points)}
          </div>
        ),
      },
      {
        id: 'referenceAmountMinor',
        accessorKey: 'referenceAmountMinor',
        enableSorting: false,
        header: t('Refund reference amount'),
        meta: { label: t('Refund reference amount') },
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {formatMoneyMinor(
              row.original.referenceAmountMinor,
              row.original.currency
            )}
          </div>
        ),
      },
      {
        id: 'actorName',
        accessorKey: 'actorName',
        enableSorting: false,
        header: t('Operator'),
        meta: { label: t('Operator') },
        cell: ({ row }) => row.original.actorName ?? t('Unknown'),
      },
      {
        id: 'reason',
        accessorKey: 'reason',
        enableSorting: false,
        header: t('Reason'),
        meta: { label: t('Reason') },
      },
    ],
    [number, onInspect, t]
  )
  return (
    <div className='space-y-3 rounded-md border p-4'>
      <h3 className='font-medium'>
        {t('Return history')} · {order.orderNumber}
      </h3>
      <CanvasServerTable
        data={query.data?.items ?? []}
        columns={columns}
        total={query.data?.total ?? 0}
        state={state}
        searchLabel={t('Reason')}
        loading={query.isLoading || query.isFetching}
        error={query.isError}
        errorTitle={t('Unable to load return history')}
        onRetry={() => void query.refetch()}
        emptyTitle={t('No return records')}
        filteredEmptyTitle={t('No matching results')}
        additionalFilters={
          <>
            <DataTableColumnFilterField label={t('Operator')}>
              <Input
                value={operator}
                placeholder={t('Operator')}
                onChange={(event) => setOperator(event.target.value)}
              />
            </DataTableColumnFilterField>
            <div className='sm:col-span-2'>
              <p className='mb-2 text-sm font-medium'>{t('Time')}</p>
              <CanvasDateRangeFilter
                from={from}
                to={to}
                onFromChange={setFrom}
                onToChange={setTo}
              />
            </div>
          </>
        }
        hasActiveFilters={Boolean(operator || from || to)}
        activeFilterCount={
          [state.search, operator, from || to].filter(Boolean).length
        }
        onResetFilters={() => {
          setOperator('')
          setFrom(undefined)
          setTo(undefined)
        }}
        getRowId={(row) => row.id}
      />
    </div>
  )
}

function CustomerTasks({
  customerId,
  onInspect,
}: {
  customerId: string
  onInspect: (target: CustomerFactTarget) => void
}) {
  const { t, i18n } = useTranslation()
  const state = useServerTableState('acceptedAt')
  const setPagination = state.setPagination
  const [executionStatus, setExecutionStatus] = useState('')
  const [billingStatus, setBillingStatus] = useState('')
  const [model, setModel] = useState('')
  const [upstreamTaskId, setUpstreamTaskId] = useState('')
  const debouncedModel = useDebounce(model.trim(), 300)
  const debouncedUpstreamTaskId = useDebounce(upstreamTaskId.trim(), 300)
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const rangeValid = isCanvasDateRangeValid(from, to)
  useEffect(() => {
    setPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [
    billingStatus,
    debouncedModel,
    debouncedUpstreamTaskId,
    executionStatus,
    from,
    setPagination,
    to,
  ])
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-customer',
      customerId,
      'tasks',
      state.query,
      debouncedModel,
      debouncedUpstreamTaskId,
      executionStatus,
      billingStatus,
      from?.toISOString(),
      to?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminCustomerTasks(
        customerId,
        {
          page: state.query.page,
          pageSize: state.query.pageSize,
          sortBy: state.query.sortBy,
          sortOrder: state.query.sortOrder,
          ...(state.query.search ? { taskId: state.query.search } : {}),
          ...(debouncedModel ? { model: debouncedModel } : {}),
          ...(debouncedUpstreamTaskId
            ? { upstreamTaskId: debouncedUpstreamTaskId }
            : {}),
          ...(executionStatus ? { executionStatus } : {}),
          ...(billingStatus ? { billingStatus } : {}),
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        },
        signal
      ),
    enabled: rangeValid,
  })
  const number = useCallback(
    (value: string) =>
      new Intl.NumberFormat(toIntlLocale(i18n.language)).format(BigInt(value)),
    [i18n.language]
  )
  const columns = useMemo<ColumnDef<CanvasAdminCustomerTask, unknown>[]>(
    () => [
      {
        id: 'taskId',
        accessorKey: 'id',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Task number')} />
        ),
        meta: { label: t('Task number') },
        cell: ({ row }) => (
          <span className='inline-flex min-w-0 items-center gap-1'>
            <button
              type='button'
              className='text-primary min-w-0 truncate text-start underline underline-offset-4 focus-visible:ring-2'
              onClick={() => onInspect({ kind: 'task', id: row.original.id })}
            >
              {row.original.id}
            </button>
            <CopyableText value={row.original.id} hideValue />
          </span>
        ),
      },
      {
        id: 'model',
        accessorKey: 'modelName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Model')} />
        ),
        meta: { label: t('Model') },
        cell: ({ row }) => row.original.modelName,
      },
      {
        id: 'quotedPoints',
        accessorKey: 'quotedPoints',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Quoted points')} />
        ),
        meta: { label: t('Quoted points') },
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {number(row.original.quotedPoints)}
          </div>
        ),
      },
      {
        id: 'settledPoints',
        accessorKey: 'settledPoints',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Settled points')} />
        ),
        meta: { label: t('Settled points') },
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {number(row.original.settledPoints)}
          </div>
        ),
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
    [number, onInspect, t]
  )
  const filters = (
    <>
      <DataTableColumnFilterField label={t('Model')}>
        <Input
          value={model}
          placeholder={t('Model')}
          onChange={(event) => setModel(event.target.value)}
        />
      </DataTableColumnFilterField>
      <DataTableColumnFilterField label={t('Upstream task ID')}>
        <Input
          value={upstreamTaskId}
          placeholder={t('Upstream task ID')}
          onChange={(event) => setUpstreamTaskId(event.target.value)}
        />
      </DataTableColumnFilterField>
      <DataTableColumnFilterField label={t('Execution status')}>
        <Select
          value={executionStatus || 'ALL'}
          onValueChange={(value) =>
            setExecutionStatus(value === 'ALL' ? '' : (value ?? ''))
          }
        >
          <SelectTrigger className='w-full'>
            <CanvasLocalizedSelectValue
              value={executionStatus}
              emptyLabelKey='All execution statuses'
              placeholderKey='Execution status'
              termKind='taskExecutionStatus'
            />
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
      </DataTableColumnFilterField>
      <DataTableColumnFilterField label={t('Billing status')}>
        <Select
          value={billingStatus || 'ALL'}
          onValueChange={(value) =>
            setBillingStatus(value === 'ALL' ? '' : (value ?? ''))
          }
        >
          <SelectTrigger className='w-full'>
            <CanvasLocalizedSelectValue
              value={billingStatus}
              emptyLabelKey='All billing statuses'
              placeholderKey='Billing status'
              termKind='billingStatus'
            />
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
  )
  return (
    <CanvasServerTable
      data={query.data?.items ?? []}
      columns={columns}
      total={query.data?.total ?? 0}
      state={state}
      searchLabel={t('Task number')}
      loading={query.isLoading || query.isFetching}
      error={query.isError}
      onRetry={() => void query.refetch()}
      emptyTitle={t('No Canvas tasks')}
      filteredEmptyTitle={t('No matching results')}
      additionalFilters={filters}
      hasActiveFilters={Boolean(
        model ||
        upstreamTaskId ||
        executionStatus ||
        billingStatus ||
        from ||
        to
      )}
      onResetFilters={() => {
        setExecutionStatus('')
        setBillingStatus('')
        setModel('')
        setUpstreamTaskId('')
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
  initialOrderId,
  selectedLotId,
  onCorrectOrder,
  onReturnOrder,
  onDeductLot,
}: {
  customerId: string
  selectedOrderId?: string
  initialOrderId?: string
  selectedLotId?: string
  onCorrectOrder?: (order: CanvasAdminRechargeOrder) => void
  onReturnOrder?: (order: CanvasAdminRechargeOrder) => void
  onDeductLot?: (lot: import('../types').CanvasAdminPointLot) => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('orders')
  const [pointTab, setPointTab] = useState('lots')
  const [targetOrderId, setTargetOrderId] = useState(initialOrderId)
  const [orderSourcePointTab, setOrderSourcePointTab] = useState<
    'lots' | 'ledger'
  >()
  const pointSourceScrollY = useRef<number | undefined>(undefined)
  const [selection, setSelection] = useState<
    CustomerFactTarget & { customerId: string }
  >()
  const target =
    selection?.customerId === customerId
      ? { kind: selection.kind, id: selection.id }
      : undefined
  let detailTitle = t('Record details')
  if (target?.kind === 'task') detailTitle = t('Task details')
  if (target?.kind === 'lot') detailTitle = t('Point lot details')
  const inspect = (value: CustomerFactTarget) => {
    setSelection({ ...value, customerId })
  }
  const openOrder = (orderId: string) => {
    const sourcePointTab =
      tab === 'points' ? (pointTab as 'lots' | 'ledger') : undefined
    setOrderSourcePointTab(sourcePointTab)
    pointSourceScrollY.current =
      sourcePointTab === undefined ? undefined : window.scrollY
    setSelection(undefined)
    setTargetOrderId(orderId)
    setTab('orders')
  }
  const returnFromOrderTarget = () => {
    const scrollY = pointSourceScrollY.current
    setTargetOrderId(undefined)
    setTab('points')
    if (orderSourcePointTab) setPointTab(orderSourcePointTab)
    setOrderSourcePointTab(undefined)
    pointSourceScrollY.current = undefined
    if (scrollY !== undefined) {
      requestAnimationFrame(() => window.scrollTo({ top: scrollY }))
    }
  }
  useEffect(() => {
    setSelection(undefined)
    setTargetOrderId(initialOrderId)
    setOrderSourcePointTab(undefined)
    pointSourceScrollY.current = undefined
    setTab('orders')
    setPointTab('lots')
  }, [customerId, initialOrderId])
  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value)
        }}
      >
        <TabsList className='h-10 w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden p-1'>
          <TabsTrigger className='h-8 min-h-8 flex-none px-3' value='orders'>
            {t('Recharge records')}
          </TabsTrigger>
          <TabsTrigger className='h-8 min-h-8 flex-none px-3' value='points'>
            {t('Point details')}
          </TabsTrigger>
          <TabsTrigger className='h-8 min-h-8 flex-none px-3' value='tasks'>
            {t('Consumption tasks')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='orders' keepMounted>
          <CustomerOrders
            customerId={customerId}
            targetOrderId={targetOrderId}
            selectedOrderId={selectedOrderId}
            onCorrectOrder={onCorrectOrder}
            onReturnOrder={onReturnOrder}
            onInspect={inspect}
            onReturnFromOrderTarget={
              orderSourcePointTab ? returnFromOrderTarget : undefined
            }
          />
        </TabsContent>
        <TabsContent value='points' keepMounted>
          <Tabs value={pointTab} onValueChange={setPointTab}>
            <TabsList>
              <TabsTrigger value='lots'>{t('Point lots')}</TabsTrigger>
              <TabsTrigger value='ledger'>{t('Change ledger')}</TabsTrigger>
            </TabsList>
            <TabsContent value='lots' keepMounted>
              <CustomerPointHistory
                customerId={customerId}
                view='lots'
                selectedLotId={selectedLotId}
                onDeductLot={onDeductLot}
                onInspect={inspect}
                onOpenOrder={openOrder}
              />
            </TabsContent>
            <TabsContent value='ledger' keepMounted>
              <CustomerPointHistory
                customerId={customerId}
                view='ledger'
                onInspect={inspect}
                onOpenOrder={openOrder}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value='tasks' keepMounted>
          <CustomerTasks customerId={customerId} onInspect={inspect} />
        </TabsContent>
      </Tabs>
      <Sheet
        open={Boolean(target)}
        onOpenChange={(open) => !open && setSelection(undefined)}
      >
        <SheetContent
          className={sideDrawerContentClassName('sm:max-w-[640px]')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>{detailTitle}</SheetTitle>
          </SheetHeader>
          {target ? (
            <div className={sideDrawerFormClassName()}>
              {target.kind === 'task' || target.kind === 'lot' ? (
                <CustomerRecordDetails
                  customerId={customerId}
                  target={
                    target.kind === 'task'
                      ? { kind: 'task', id: target.id }
                      : { kind: 'lot', id: target.id }
                  }
                  onOpenOrder={openOrder}
                />
              ) : (
                <CustomerBusinessFacts
                  key={`${customerId}:${target.kind}:${target.id}`}
                  customerId={customerId}
                  initial={target}
                  onDeductLot={
                    onDeductLot
                      ? (lot) => {
                          setSelection(undefined)
                          onDeductLot(lot)
                        }
                      : undefined
                  }
                  onOpenOrder={openOrder}
                />
              )}
            </div>
          ) : null}
          <SheetFooter className={sideDrawerFooterClassName('grid-cols-1')}>
            <Button
              type='button'
              variant='outline'
              onClick={() => setSelection(undefined)}
            >
              {t('Close')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

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
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy } from 'lucide-react'
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader, DataTableRow } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
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
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'

import {
  getCanvasAdminCustomerTasks,
  getCanvasAdminAgentStatistics,
  getCanvasAdminAgentModelPrices,
  getCanvasAdminAgentCustomers,
  getCanvasAdminAgentCustomerModelUsage,
  getCanvasAdminInviteCodes,
  searchCanvasAdminInviteCodes,
  revealCanvasCode,
  getCanvasOrderPointReturns,
  getCanvasAdminRechargeOrders,
} from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime, formatMoneyMinor } from '../formatters'
import { formatExactRmbReference } from '../point-conversion-types'
import { pricingScopeLabel } from '../pricing-scope-label'
import type {
  CanvasAdminAgentCustomer,
  CanvasAdminAgentModelUsageRow,
  CanvasBillingUnit,
  CanvasAdminInviteCode,
  CanvasAdminInviteCodeQuery,
  CanvasAdminCustomerTask,
  CanvasAdminRechargeOrder,
  CanvasOrderPointReturnRecord,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { AgentModelPriceList } from './AgentModelPriceList'
import { BusinessTerm } from './BusinessTerm'
import { CanvasCodeRevealButton } from './CanvasCodeRevealButton'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'
import {
  CustomerBusinessFacts,
  type CustomerFactTarget,
} from './CustomerBusinessFacts'
import { CustomerPointHistory } from './CustomerPointHistory'
import { CustomerRecordDetails } from './CustomerRecordDetails'

const agentBillingUnitKeys: Record<CanvasBillingUnit, string> = {
  REQUEST: 'Per request',
  SECOND: 'Per second',
  MILLION_TOKENS: 'Per million tokens',
}

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
        accessorKey: 'displayNameSnapshot',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Model')} />
        ),
        meta: { label: t('Model') },
        cell: ({ row }) => row.original.displayNameSnapshot,
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

function AgentStatistics({ customerId }: { customerId: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const statistics = useQuery({
    queryKey: ['canvas-cloud', 'admin-agent-statistics', customerId],
    queryFn: ({ signal }) => getCanvasAdminAgentStatistics(customerId, signal),
  })
  const [priceCapability, setPriceCapability] = useState('')
  const [priceTag, setPriceTag] = useState('')
  const [priceSearch, setPriceSearch] = useState('')
  const [pricePage, setPricePage] = useState(1)
  const debouncedPriceSearch = useDebounce(priceSearch.trim(), 300)
  useEffect(
    () => setPricePage(1),
    [priceCapability, priceTag, debouncedPriceSearch, customerId]
  )
  const prices = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-agent-model-prices',
      customerId,
      priceCapability,
      priceTag,
      debouncedPriceSearch,
      pricePage,
    ],
    enabled: Boolean(statistics.data),
    queryFn: ({ signal }) =>
      getCanvasAdminAgentModelPrices(
        customerId,
        {
          page: pricePage,
          pageSize: 10,
          ...(priceCapability ? { capability: priceCapability } : {}),
          ...(priceTag ? { tagId: priceTag } : {}),
          ...(debouncedPriceSearch ? { search: debouncedPriceSearch } : {}),
        },
        signal
      ),
  })
  const inviteState =
    useServerTableState<CanvasAdminInviteCodeQuery['sortBy']>('createdAt')
  const customerState = useServerTableState<'activatedAt'>('activatedAt')
  const setCustomerPagination = customerState.setPagination
  const customerSearch = customerState.query.search
  const customerPage = customerState.query.page
  const customerPageSize = customerState.query.pageSize
  const usageState = useServerTableState<'priceGroupName'>('priceGroupName')
  const [exactCodeInput, setExactCodeInput] = useState('')
  const [inviteStatus, setInviteStatus] = useState('')
  const exactCodeRef = useRef('')
  const [searchVersion, setSearchVersion] = useState(0)
  const [expandedCustomerId, setExpandedCustomerId] = useState<string>()
  const [agentCustomerStatus, setAgentCustomerStatus] = useState('')
  useEffect(() => {
    setExpandedCustomerId(undefined)
    setCustomerPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [agentCustomerStatus, customerSearch, customerId, setCustomerPagination])
  useEffect(
    () => setExpandedCustomerId(undefined),
    [customerPage, customerPageSize]
  )
  const [revealedCodes, setRevealedCodes] = useState<Record<string, string>>({})
  const revealInvite = useMutation({
    mutationFn: (input: { id: string; action: 'DISPLAY' | 'COPY' }) =>
      revealCanvasCode('admin-invite', input.id, input.action).then(
        (result) => ({ ...result, ...input })
      ),
    onSuccess: async (result) => {
      if (result.action === 'COPY') {
        await navigator.clipboard.writeText(result.code)
        toast.success(t('Invite code copied'))
      } else {
        setRevealedCodes((current) => ({
          ...current,
          [result.id]: result.code,
        }))
      }
    },
    onError: () => toast.error(t('Invite code could not be revealed')),
  })
  const invites = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-agent-invites',
      customerId,
      statistics.data?.profile.principalId,
      inviteState.query,
      searchVersion,
      inviteStatus,
    ],
    enabled:
      Boolean(statistics.data?.profile.principalId) &&
      (exactCodeRef.current.length === 0 || exactCodeRef.current.length >= 4),
    queryFn: ({ signal }) => {
      if (!statistics.data?.profile.principalId) {
        throw new Error('Agent profile unavailable')
      }
      const query = {
        page: inviteState.query.page,
        pageSize: inviteState.query.pageSize,
        sortBy: inviteState.query.sortBy,
        sortOrder: inviteState.query.sortOrder,
        inviterPrincipalId: statistics.data.profile.principalId,
        ...(inviteStatus
          ? { status: inviteStatus as CanvasAdminInviteCodeQuery['status'] }
          : {}),
      }
      return exactCodeRef.current
        ? searchCanvasAdminInviteCodes(
            { ...query, code: exactCodeRef.current },
            signal
          )
        : getCanvasAdminInviteCodes(query, signal)
    },
  })
  const customers = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-agent-customers',
      customerId,
      customerState.query,
      agentCustomerStatus,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminAgentCustomers(
        customerId,
        {
          page: customerState.query.page,
          pageSize: customerState.query.pageSize,
          sortBy: 'activatedAt',
          sortOrder: customerState.query.sortOrder,
          ...(customerState.query.search
            ? { username: customerState.query.search }
            : {}),
          ...(agentCustomerStatus
            ? {
                status:
                  agentCustomerStatus as CanvasAdminAgentCustomer['status'],
              }
            : {}),
        },
        signal
      ),
  })
  const usage = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-agent-model-usage',
      customerId,
      expandedCustomerId,
      usageState.query.page,
      usageState.query.pageSize,
    ],
    enabled: Boolean(expandedCustomerId),
    queryFn: ({ signal }) => {
      if (!expandedCustomerId) throw new Error('Customer unavailable')
      return getCanvasAdminAgentCustomerModelUsage(
        customerId,
        expandedCustomerId,
        { page: usageState.query.page, pageSize: usageState.query.pageSize },
        signal
      )
    },
  })
  const amount = (value: string | null, incomplete: boolean) => (
    <span>
      {value === null ? '—' : `¥${formatExactRmbReference(value, locale)}`}
      {incomplete ? ` (${t('Amount incomplete')})` : ''}
    </span>
  )
  const snapshot = (
    value: CanvasAdminAgentModelUsageRow['agentPriceSnapshot'],
    status: CanvasAdminAgentModelUsageRow['agentPriceSnapshotStatus']
  ) => {
    if (status === 'VARIES') {
      return t('Multiple historical prices')
    }
    if (value === null) {
      return '—'
    }
    if (typeof value === 'string') {
      return `¥${formatExactRmbReference(value, locale)}`
    }
    const labels = {
      input: 'Input',
      output: 'Output',
      cacheRead: 'Cache read',
      cacheWrite: 'Cache write',
    } as const
    return Object.entries(value)
      .map(
        ([category, price]) =>
          `${t(labels[category as keyof typeof labels])}: ¥${formatExactRmbReference(price, locale)}`
      )
      .join(' · ')
  }
  const inviteColumns: ColumnDef<CanvasAdminInviteCode, unknown>[] = [
    {
      id: 'maskedCode',
      accessorKey: 'maskedCode',
      header: t('Invite code'),
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className='flex items-center gap-1'>
            <span className='font-mono'>
              {revealedCodes[item.id] ?? item.maskedCode}
            </span>
            <CanvasCodeRevealButton
              label={t(
                revealedCodes[item.id] ? 'Hide invite code' : 'Show invite code'
              )}
              revealed={Boolean(revealedCodes[item.id])}
              disabled={revealInvite.isPending}
              onClick={() => {
                if (revealedCodes[item.id]) {
                  setRevealedCodes((current) => {
                    const next = { ...current }
                    delete next[item.id]
                    return next
                  })
                } else {
                  revealInvite.mutate({ id: item.id, action: 'DISPLAY' })
                }
              }}
            />
            <Button
              size='icon'
              variant='ghost'
              aria-label={t('Copy invite code')}
              disabled={revealInvite.isPending}
              onClick={() =>
                revealInvite.mutate({ id: item.id, action: 'COPY' })
              }
            >
              <Copy className='size-4' />
            </Button>
          </div>
        )
      },
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: t('Status'),
      cell: ({ row }) => t(`Invite status ${row.original.status}`),
    },
    {
      id: 'priceGroupName',
      accessorKey: 'priceGroupName',
      header: t('Price group'),
    },
    {
      id: 'capacity',
      header: t('Used / Capacity'),
      cell: ({ row }) =>
        `${row.original.consumedCount} / ${row.original.maxRegistrations}`,
    },
    {
      id: 'activatedCustomers',
      accessorKey: 'activatedCustomers',
      header: t('Activated customers'),
    },
    {
      id: 'expiresAt',
      accessorKey: 'expiresAt',
      header: t('Expires'),
      cell: ({ row }) => formatCanvasDateTime(row.original.expiresAt),
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: t('Created At'),
      cell: ({ row }) => formatCanvasDateTime(row.original.createdAt),
    },
  ]
  const customerColumns: ColumnDef<CanvasAdminAgentCustomer, unknown>[] = [
    { id: 'username', accessorKey: 'username', header: t('Username') },
    {
      id: 'status',
      accessorKey: 'status',
      header: t('Status'),
      cell: ({ row }) => (
        <BusinessTerm kind='customerStatus' value={row.original.status} />
      ),
    },
    {
      id: 'activatedAt',
      accessorKey: 'activatedAt',
      header: t('Activated at'),
      cell: ({ row }) => formatCanvasDateTime(row.original.activatedAt),
    },
    {
      id: 'currentPriceGroup',
      header: t('Current price group'),
      cell: ({ row }) => row.original.currentPriceGroup?.name ?? '—',
    },
    {
      id: 'successfulTasks',
      accessorKey: 'successfulTasks',
      header: t('Successful tasks'),
    },
    {
      id: 'settledPoints',
      accessorKey: 'settledPoints',
      header: t('Consumed points'),
    },
    {
      id: 'modelUsageAmount',
      header: t('Agent display amount'),
      cell: ({ row }) =>
        amount(row.original.modelUsageAmount, row.original.amountIncomplete),
    },
    {
      id: 'customerPriceAmount',
      header: t('Customer price amount'),
      cell: ({ row }) =>
        amount(
          row.original.customerPriceAmount,
          row.original.customerAmountIncomplete
        ),
    },
    {
      id: 'action',
      header: t('Action'),
      cell: ({ row }) => (
        <Button
          size='sm'
          variant='outline'
          aria-expanded={expandedCustomerId === row.original.id}
          onClick={() => {
            setExpandedCustomerId(
              expandedCustomerId === row.original.id
                ? undefined
                : row.original.id
            )
            usageState.setPagination((value) => ({ ...value, pageIndex: 0 }))
          }}
        >
          {t('Model usage')}
        </Button>
      ),
    },
  ]
  const usageColumns: ColumnDef<CanvasAdminAgentModelUsageRow, unknown>[] = [
    {
      id: 'priceGroupName',
      accessorKey: 'priceGroupName',
      header: t('Task-time price group'),
    },
    {
      id: 'effectiveDisplayName',
      accessorKey: 'effectiveDisplayName',
      header: t('Model / specification'),
      cell: ({ row }) =>
        `${row.original.effectiveDisplayName} / ${pricingScopeLabel({ key: row.original.combinationKey, parameters: row.original.parameters }, t)}`,
    },
    {
      id: 'billingUnit',
      accessorKey: 'billingUnit',
      header: t('Billing unit'),
      cell: ({ row }) => t(agentBillingUnitKeys[row.original.billingUnit]),
    },
    {
      id: 'usage',
      header: t('Usage'),
      cell: ({ row }) => {
        const u = row.original.usage
        if (row.original.billingUnit === 'MILLION_TOKENS') {
          return `${t('Input')}: ${u.inputTokens ?? '—'}; ${t('Output')}: ${u.outputTokens ?? '—'}; ${t('Cache read')}: ${u.cacheReadTokens ?? '—'}; ${t('Cache write')}: ${u.cacheWriteTokens ?? '—'}`
        }
        if (row.original.billingUnit === 'SECOND') {
          return u.seconds
        }
        return u.requests
      },
    },
    {
      id: 'successfulTasks',
      accessorKey: 'successfulTasks',
      header: t('Successful tasks'),
    },
    {
      id: 'settledPoints',
      accessorKey: 'settledPoints',
      header: t('Consumed points'),
    },
    {
      id: 'agentPriceSnapshot',
      header: t('Agent display price snapshot'),
      cell: ({ row }) =>
        snapshot(
          row.original.agentPriceSnapshot,
          row.original.agentPriceSnapshotStatus
        ),
    },
    {
      id: 'customerPriceSnapshot',
      header: t('Customer price snapshot'),
      cell: ({ row }) =>
        snapshot(
          row.original.customerPriceSnapshot,
          row.original.customerPriceSnapshotStatus
        ),
    },
    {
      id: 'modelUsageAmount',
      header: t('Agent display amount'),
      cell: ({ row }) =>
        amount(row.original.modelUsageAmount, row.original.amountIncomplete),
    },
    {
      id: 'customerPriceAmount',
      header: t('Customer price amount'),
      cell: ({ row }) =>
        amount(
          row.original.customerPriceAmount,
          row.original.customerAmountIncomplete
        ),
    },
  ]
  if (statistics.isPending) return <LoadingState />
  if (statistics.isError) {
    return <ErrorState onRetry={() => void statistics.refetch()} />
  }
  const { summary, priceGroups } = statistics.data
  const inviteFilters = (
    <>
      <DataTableColumnFilterField label={t('Exact invite code')}>
        <form
          className='flex gap-2'
          onSubmit={(event) => {
            event.preventDefault()
            exactCodeRef.current = exactCodeInput.trim().toUpperCase()
            setSearchVersion((value) => value + 1)
            inviteState.setPagination((value) => ({ ...value, pageIndex: 0 }))
          }}
        >
          <Input
            aria-label={t('Exact invite code')}
            autoComplete='off'
            value={exactCodeInput}
            onChange={(event) => setExactCodeInput(event.target.value)}
          />
          <Button type='submit' size='sm'>
            {t('Search')}
          </Button>
        </form>
      </DataTableColumnFilterField>
      <DataTableColumnFilterField label={t('Status')}>
        <Select
          value={inviteStatus || 'ALL'}
          onValueChange={(value) => {
            setInviteStatus(value === 'ALL' ? '' : (value ?? ''))
            inviteState.setPagination((page) => ({ ...page, pageIndex: 0 }))
          }}
        >
          <SelectTrigger className='w-full' aria-label={t('Status')}>
            <CanvasLocalizedSelectValue
              value={inviteStatus}
              emptyLabelKey='All statuses'
              displayValue={
                inviteStatus ? t(`Invite status ${inviteStatus}`) : undefined
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
            {['DRAFT', 'ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED'].map(
              (value) => (
                <SelectItem key={value} value={value}>
                  {t(`Invite status ${value}`)}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </DataTableColumnFilterField>
    </>
  )
  let pricesContent = <AgentModelPriceList models={prices.data?.items ?? []} />
  if (prices.isError) {
    pricesContent = <ErrorState onRetry={() => void prices.refetch()} />
  } else if (prices.isPending) {
    pricesContent = <LoadingState />
  }
  return (
    <div className='space-y-5'>
      <section className='space-y-2'>
        <h3 className='font-semibold'>{t('Cumulative overview')}</h3>
        <div className='grid gap-2 rounded border p-3 text-sm sm:grid-cols-4'>
          <span>
            {t('Activated customers')}: {summary.activatedCustomers}
          </span>
          <span>
            {t('Customers with successful tasks')}:{' '}
            {summary.customersWithSuccessfulTasks}
          </span>
          <span>
            {t('Successful tasks')}: {summary.successfulTasks}
          </span>
          <span>
            {t('Consumed points')}: {summary.settledPoints}
          </span>
          <span>
            {t('Agent display amount')}:{' '}
            {amount(summary.modelUsageAmount, summary.amountIncomplete)}
          </span>
          <span>
            {t('Customer price amount')}:{' '}
            {amount(
              summary.customerPriceAmount,
              summary.customerAmountIncomplete
            )}
          </span>
        </div>
      </section>
      <section className='space-y-3'>
        <h3 className='font-semibold'>{t('Current model prices')}</h3>
        <p className='text-muted-foreground text-sm'>
          {t('Prices for the price groups of your current customers.')}
        </p>
        <div className='flex flex-wrap gap-2'>
          <Input
            className='w-56'
            value={priceSearch}
            onChange={(event) => setPriceSearch(event.target.value)}
            placeholder={t('Model name')}
            aria-label={t('Model name')}
          />
          <Select
            value={priceCapability || 'ALL'}
            onValueChange={(value) =>
              setPriceCapability(value === 'ALL' ? '' : (value ?? ''))
            }
          >
            <SelectTrigger className='w-48' aria-label={t('Generation type')}>
              <CanvasLocalizedSelectValue
                value={priceCapability}
                emptyLabelKey='All types'
                displayValue={priceCapability ? t(priceCapability) : undefined}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>{t('All types')}</SelectItem>
              {prices.data?.filters.capabilities.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={priceTag || 'ALL'}
            onValueChange={(value) =>
              setPriceTag(value === 'ALL' ? '' : (value ?? ''))
            }
          >
            <SelectTrigger className='w-48' aria-label={t('Tag')}>
              <CanvasLocalizedSelectValue
                value={priceTag}
                emptyLabelKey='All tags'
                displayValue={
                  prices.data?.filters.tags.find((tag) => tag.id === priceTag)
                    ?.name
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>{t('All tags')}</SelectItem>
              {prices.data?.filters.tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {pricesContent}
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={pricePage <= 1}
            onClick={() => setPricePage((value) => value - 1)}
          >
            {t('Previous')}
          </Button>
          <span>
            {pricePage} /{' '}
            {Math.max(1, Math.ceil((prices.data?.total ?? 0) / 10))}
          </span>
          <Button
            variant='outline'
            size='sm'
            disabled={pricePage * 10 >= (prices.data?.total ?? 0)}
            onClick={() => setPricePage((value) => value + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      </section>
      <section className='space-y-2'>
        <h3 className='font-semibold'>{t('Invite codes')}</h3>
        <CanvasServerTable
          data={invites.data?.items ?? []}
          columns={inviteColumns}
          total={invites.data?.total ?? 0}
          state={inviteState}
          loading={
            (invites.isPending &&
              (exactCodeRef.current.length === 0 ||
                exactCodeRef.current.length >= 4)) ||
            invites.isFetching
          }
          error={invites.isError}
          onRetry={() => void invites.refetch()}
          emptyTitle={t('No invite codes')}
          additionalFilters={inviteFilters}
          hasActiveFilters={Boolean(exactCodeRef.current || inviteStatus)}
          onResetFilters={() => {
            exactCodeRef.current = ''
            setExactCodeInput('')
            setInviteStatus('')
            setSearchVersion((value) => value + 1)
          }}
          getRowId={(row) => row.id}
        />
      </section>
      <section className='space-y-2'>
        <h3 className='font-semibold'>{t('Price group summary')}</h3>
        {priceGroups.length ? (
          priceGroups.map((group) => (
            <div
              key={group.priceGroupId}
              className='grid gap-2 rounded border p-3 text-sm sm:grid-cols-5'
            >
              <strong>{group.priceGroupName}</strong>
              <span>
                {t('Current customers')}: {group.currentCustomers}
              </span>
              <span>
                {t('Successful tasks')}: {group.successfulTasks}
              </span>
              <span>
                {t('Consumed points')}: {group.settledPoints}
              </span>
              <span>
                {t('Agent display amount')}:{' '}
                {amount(group.modelUsageAmount, group.amountIncomplete)}
              </span>
              <span>
                {t('Customer price amount')}:{' '}
                {amount(
                  group.customerPriceAmount,
                  group.customerAmountIncomplete
                )}
              </span>
            </div>
          ))
        ) : (
          <p>{t('No price groups')}</p>
        )}
      </section>
      <section className='space-y-2'>
        <h3 className='font-semibold'>{t('Agent customers')}</h3>
        <CanvasServerTable
          data={customers.data?.items ?? []}
          columns={customerColumns}
          total={customers.data?.total ?? 0}
          state={customerState}
          searchLabel={t('Username')}
          additionalFilters={
            <DataTableColumnFilterField label={t('Status')}>
              <Select
                value={agentCustomerStatus || 'ALL'}
                onValueChange={(value) =>
                  setAgentCustomerStatus(value === 'ALL' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger className='w-full' aria-label={t('Status')}>
                  <CanvasLocalizedSelectValue
                    value={agentCustomerStatus}
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
          }
          hasActiveFilters={Boolean(agentCustomerStatus)}
          onResetFilters={() => setAgentCustomerStatus('')}
          loading={customers.isPending || customers.isFetching}
          error={customers.isError}
          onRetry={() => void customers.refetch()}
          emptyTitle={t('No customers')}
          getRowId={(row) => row.id}
          renderRow={(row) => (
            <Fragment key={row.id}>
              <DataTableRow
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
                    <CanvasServerTable
                      data={usage.data?.items ?? []}
                      columns={usageColumns}
                      total={usage.data?.total ?? 0}
                      state={usageState}
                      loading={usage.isPending || usage.isFetching}
                      error={usage.isError}
                      onRetry={() => void usage.refetch()}
                      emptyTitle={t('No model usage')}
                      getRowId={(item) =>
                        `${item.priceGroupId}:${item.modelKey}:${item.combinationKey}:${item.billingUnit}`
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          )}
          renderExpandedContent={(row) =>
            expandedCustomerId === row.original.id ? (
              <CanvasServerTable
                data={usage.data?.items ?? []}
                columns={usageColumns}
                total={usage.data?.total ?? 0}
                state={usageState}
                loading={usage.isPending || usage.isFetching}
                error={usage.isError}
                onRetry={() => void usage.refetch()}
                emptyTitle={t('No model usage')}
                getRowId={(item) =>
                  `${item.priceGroupId}:${item.modelKey}:${item.combinationKey}:${item.billingUnit}`
                }
              />
            ) : null
          }
        />
      </section>
    </div>
  )
}

export function AdminCustomerOperations({
  customerId,
  isAgent,
  selectedOrderId,
  initialOrderId,
  initialLotId,
  selectedLotId,
  onCorrectOrder,
  onReturnOrder,
  onDeductLot,
}: {
  customerId: string
  isAgent?: boolean
  selectedOrderId?: string
  initialOrderId?: string
  initialLotId?: string
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
  }, [customerId, initialLotId, initialOrderId])
  useEffect(() => {
    if (!initialLotId) return
    setTargetOrderId(undefined)
    setTab('points')
    setPointTab('lots')
    setSelection({ kind: 'lot', id: initialLotId, customerId })
  }, [customerId, initialLotId])
  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value)
        }}
      >
        <CanvasManagementTabsList>
          <CanvasManagementTabsTrigger value='orders'>
            {t('Recharge records')}
          </CanvasManagementTabsTrigger>
          <CanvasManagementTabsTrigger value='points'>
            {t('Point details')}
          </CanvasManagementTabsTrigger>
          <CanvasManagementTabsTrigger value='tasks'>
            {t('Consumption tasks')}
          </CanvasManagementTabsTrigger>
          {isAgent ? (
            <CanvasManagementTabsTrigger value='agent-statistics'>
              {t('Agent statistics')}
            </CanvasManagementTabsTrigger>
          ) : null}
        </CanvasManagementTabsList>
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
            <CanvasManagementTabsList>
              <CanvasManagementTabsTrigger value='lots'>
                {t('Point lots')}
              </CanvasManagementTabsTrigger>
              <CanvasManagementTabsTrigger value='ledger'>
                {t('Change ledger')}
              </CanvasManagementTabsTrigger>
            </CanvasManagementTabsList>
            <TabsContent value='lots' keepMounted>
              <CustomerPointHistory
                customerId={customerId}
                view='lots'
                selectedLotId={initialLotId ?? selectedLotId}
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
        {isAgent ? (
          <TabsContent value='agent-statistics'>
            <AgentStatistics customerId={customerId} />
          </TabsContent>
        ) : null}
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

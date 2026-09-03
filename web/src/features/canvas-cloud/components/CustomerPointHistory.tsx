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
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks'

import {
  getCanvasAdminCustomerPointLedger,
  getCanvasAdminCustomerPointLots,
  getCanvasCustomerPointLedger,
  getCanvasCustomerPointLots,
} from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import type { CanvasAdminPointLot, CanvasPointLedgerItem } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTerm, BusinessTermText } from './BusinessTerm'
import { CanvasColumnFilterField } from './CanvasColumnFilterPanel'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'

const ledgerEventTypes = [
  'ISSUE',
  'FREEZE',
  'SETTLE',
  'RELEASE',
  'EXPIRE',
  'CLAWBACK',
  'ADJUSTMENT_DEBIT',
  'TRANSFER_OUT',
  'TRANSFER_IN',
] as const

export function CustomerPointHistory({
  customerId,
  view = 'both',
  selectedLotId,
  onDeductLot,
}: {
  customerId?: string
  view?: 'both' | 'lots' | 'ledger'
  selectedLotId?: string
  onDeductLot?: (lot: CanvasAdminPointLot) => void
}) {
  const { t } = useTranslation()
  const lotsState = useServerTableState('expiresAt')
  const ledgerState = useServerTableState('occurredAt')
  const setLotsPagination = lotsState.setPagination
  const setLedgerPagination = ledgerState.setPagination
  const [lotType, setLotType] = useState('')
  const [eventType, setEventType] = useState('')
  const [rechargeOrderNumber, setRechargeOrderNumber] = useState('')
  const [taskId, setTaskId] = useState('')
  const [refundId, setRefundId] = useState('')
  const debouncedRechargeOrderNumber = useDebounce(
    rechargeOrderNumber.trim(),
    300
  )
  const debouncedTaskId = useDebounce(taskId.trim(), 300)
  const debouncedRefundId = useDebounce(refundId.trim(), 300)
  const [lotFrom, setLotFrom] = useState<Date>()
  const [lotTo, setLotTo] = useState<Date>()
  const [ledgerFrom, setLedgerFrom] = useState<Date>()
  const [ledgerTo, setLedgerTo] = useState<Date>()
  const lotDateRangeValid = isCanvasDateRangeValid(lotFrom, lotTo)
  const ledgerDateRangeValid = isCanvasDateRangeValid(ledgerFrom, ledgerTo)
  useEffect(() => {
    setLotsPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [debouncedRechargeOrderNumber, lotFrom, lotTo, lotType, setLotsPagination])
  useEffect(() => {
    setLedgerPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [
    debouncedRefundId,
    debouncedTaskId,
    eventType,
    ledgerFrom,
    setLedgerPagination,
    ledgerTo,
  ])
  const lots = useQuery({
    queryKey: [
      'canvas-cloud',
      customerId ? 'admin-customer' : 'customer',
      customerId,
      'point-lots',
      lotsState.query,
      debouncedRechargeOrderNumber,
      lotType,
      lotFrom?.toISOString(),
      lotTo?.toISOString(),
    ],
    queryFn: ({ signal }) => {
      let primarySearch: Record<string, string> = {}
      if (lotsState.query.search) {
        primarySearch = customerId
          ? { lotId: lotsState.query.search }
          : { rechargeOrderNumber: lotsState.query.search }
      }
      const query = {
        page: lotsState.query.page,
        pageSize: lotsState.query.pageSize,
        sortBy: lotsState.query.sortBy,
        sortOrder: lotsState.query.sortOrder,
        ...primarySearch,
        ...(debouncedRechargeOrderNumber
          ? { rechargeOrderNumber: debouncedRechargeOrderNumber }
          : {}),
        ...(lotType ? { type: lotType as 'PAID' | 'BONUS' } : {}),
        ...(lotFrom ? { from: lotFrom.toISOString() } : {}),
        ...(lotTo ? { to: lotTo.toISOString() } : {}),
      }
      return customerId
        ? getCanvasAdminCustomerPointLots(customerId, query, signal)
        : getCanvasCustomerPointLots(query, signal)
    },
    enabled: lotDateRangeValid && view !== 'ledger',
  })
  const ledger = useQuery({
    queryKey: [
      'canvas-cloud',
      customerId ? 'admin-customer' : 'customer',
      customerId,
      'point-ledger',
      ledgerState.query,
      debouncedTaskId,
      debouncedRefundId,
      eventType,
      ledgerFrom?.toISOString(),
      ledgerTo?.toISOString(),
    ],
    queryFn: ({ signal }) => {
      const query = {
        page: ledgerState.query.page,
        pageSize: ledgerState.query.pageSize,
        sortOrder: ledgerState.query.sortOrder,
        ...(ledgerState.query.search
          ? { reason: ledgerState.query.search }
          : {}),
        ...(debouncedTaskId ? { taskId: debouncedTaskId } : {}),
        ...(debouncedRefundId ? { refundId: debouncedRefundId } : {}),
        ...(eventType ? { eventType } : {}),
        ...(ledgerFrom ? { from: ledgerFrom.toISOString() } : {}),
        ...(ledgerTo ? { to: ledgerTo.toISOString() } : {}),
      }
      return customerId
        ? getCanvasAdminCustomerPointLedger(customerId, query, signal)
        : getCanvasCustomerPointLedger(query, signal)
    },
    enabled: ledgerDateRangeValid && view !== 'lots',
  })
  const lotColumns = useMemo<ColumnDef<CanvasAdminPointLot, unknown>[]>(() => {
    const columns: ColumnDef<CanvasAdminPointLot, unknown>[] = [
      {
        id: 'type',
        accessorKey: 'type',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Type')} />
        ),
        meta: { label: t('Type') },
        cell: ({ row }) => (
          <BusinessTerm kind='pointLotType' value={row.original.type} />
        ),
      },
      {
        id: 'rechargeOrderNumber',
        accessorKey: 'rechargeOrderNumber',
        enableSorting: false,
        header: t('Canvas recharge order'),
        cell: ({ row }) =>
          row.original.rechargeOrderNumber ? (
            <CopyableText value={row.original.rechargeOrderNumber} />
          ) : (
            '—'
          ),
      },
      {
        id: 'availablePoints',
        accessorKey: 'availablePoints',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Available')} />
        ),
        meta: { label: t('Available') },
      },
      {
        id: 'reservedPoints',
        accessorKey: 'reservedPoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Task-reserved points')}
          />
        ),
        meta: { label: t('Task-reserved points') },
      },
      {
        id: 'expiresAt',
        accessorKey: 'expiresAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Expires')} />
        ),
        meta: { label: t('Expires') },
        cell: ({ row }) =>
          formatCanvasDateTime(row.original.expiresAt, t('No expiry')),
      },
    ]
    if (customerId) {
      columns.unshift({
        id: 'id',
        accessorKey: 'id',
        enableSorting: false,
        header: t('Point Lot'),
        cell: ({ row }) => <CopyableText value={row.original.id} />,
      })
    }
    if (onDeductLot) {
      columns.push({
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        header: t('Actions'),
        cell: ({ row }) => {
          const available = BigInt(row.original.availablePoints)
          const expired = Boolean(
            row.original.expiresAt &&
            new Date(row.original.expiresAt).getTime() <= Date.now()
          )
          if (available <= 0n || expired) return null
          return (
            <Button
              type='button'
              size='sm'
              variant={
                selectedLotId === row.original.id ? 'default' : 'outline'
              }
              onClick={() => onDeductLot(row.original)}
            >
              {t('Deduct points')}
            </Button>
          )
        },
      })
    }
    return columns
  }, [customerId, onDeductLot, selectedLotId, t])
  const ledgerColumns = useMemo<
    ColumnDef<CanvasPointLedgerItem, unknown>[]
  >(() => {
    const columns: ColumnDef<CanvasPointLedgerItem, unknown>[] = [
      {
        id: 'occurredAt',
        accessorKey: 'occurredAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Time')} />
        ),
        meta: { label: t('Time') },
        cell: ({ row }) => formatCanvasDateTime(row.original.occurredAt),
      },
      {
        id: 'eventType',
        accessorKey: 'eventType',
        enableSorting: false,
        header: t('Event'),
        cell: ({ row }) => (
          <BusinessTerm kind='ledgerEvent' value={row.original.eventType} />
        ),
      },
      {
        id: 'eventPoints',
        accessorKey: 'eventPoints',
        enableSorting: false,
        header: customerId ? t('Points') : t('Affected points'),
      },
      {
        id: 'reason',
        accessorKey: 'reason',
        enableSorting: false,
        header: t('Reason'),
        cell: ({ row }) => {
          if (!row.original.reason) return '—'
          if (customerId) {
            return (
              <BusinessTerm kind='ledgerReason' value={row.original.reason} />
            )
          }
          return (
            <BusinessTermText
              kind='ledgerReason'
              value={row.original.reason}
              fallback={t('Other')}
            />
          )
        },
      },
    ]
    if (customerId) {
      columns.splice(
        3,
        0,
        {
          id: 'remainingDelta',
          accessorKey: 'remainingDelta',
          enableSorting: false,
          header: t('Remaining delta'),
        },
        {
          id: 'taskId',
          accessorKey: 'taskId',
          enableSorting: false,
          header: t('Task'),
          cell: ({ row }) =>
            row.original.taskId ? (
              <CopyableText value={row.original.taskId} />
            ) : (
              '—'
            ),
        }
      )
    } else {
      columns.splice(3, 0, {
        id: 'availablePointsDelta',
        enableSorting: false,
        header: t('Available points change'),
        cell: ({ row }) => {
          const delta =
            BigInt(row.original.remainingDelta) -
            BigInt(row.original.reservedDelta)
          return delta > 0n ? `+${delta}` : delta.toString()
        },
      })
    }
    return columns
  }, [customerId, t])
  return (
    <div className='space-y-6'>
      {view !== 'ledger' ? (
        <CanvasServerTable
          data={lots.data?.items ?? []}
          columns={lotColumns}
          total={lots.data?.total ?? 0}
          state={lotsState}
          searchLabel={customerId ? t('Point Lot') : t('Canvas recharge order')}
          loading={lots.isLoading || lots.isFetching}
          emptyTitle={t('No point lots')}
          additionalFilters={
            <>
              {customerId ? (
                <CanvasColumnFilterField label={t('Canvas recharge order')}>
                  <Input
                    value={rechargeOrderNumber}
                    placeholder={t('Canvas recharge order')}
                    onChange={(event) =>
                      setRechargeOrderNumber(event.target.value)
                    }
                  />
                </CanvasColumnFilterField>
              ) : null}
              <CanvasColumnFilterField label={t('Type')}>
                <Select
                  value={lotType || 'ALL'}
                  onValueChange={(value) =>
                    setLotType(value === 'ALL' ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger className='w-full' aria-label={t('Type')}>
                    <SelectValue placeholder={t('Type')}>
                      {lotType
                        ? t(lotType === 'PAID' ? 'Paid points' : 'Bonus points')
                        : t('All types')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All types')}</SelectItem>
                    <SelectItem value='PAID'>{t('Paid points')}</SelectItem>
                    <SelectItem value='BONUS'>{t('Bonus points')}</SelectItem>
                  </SelectContent>
                </Select>
              </CanvasColumnFilterField>
              <div className='sm:col-span-2'>
                <CanvasDateRangeFilter
                  from={lotFrom}
                  to={lotTo}
                  onFromChange={setLotFrom}
                  onToChange={setLotTo}
                />
              </div>
            </>
          }
          hasActiveFilters={Boolean(
            rechargeOrderNumber || lotType || lotFrom || lotTo
          )}
          onResetFilters={() => {
            setLotType('')
            setRechargeOrderNumber('')
            setLotFrom(undefined)
            setLotTo(undefined)
          }}
          getRowId={(row) => row.id}
          getRowClassName={(row) =>
            selectedLotId === row.original.id ? 'bg-primary/5' : undefined
          }
        />
      ) : null}
      {view !== 'lots' ? (
        <CanvasServerTable
          data={ledger.data?.items ?? []}
          columns={ledgerColumns}
          total={ledger.data?.total ?? 0}
          state={ledgerState}
          searchLabel={customerId ? t('Reason') : undefined}
          loading={ledger.isLoading || ledger.isFetching}
          emptyTitle={t('No consumption records')}
          additionalFilters={
            <>
              {customerId ? (
                <>
                  <CanvasColumnFilterField label={t('Task ID')}>
                    <Input
                      value={taskId}
                      placeholder={t('Task ID')}
                      onChange={(event) => setTaskId(event.target.value)}
                    />
                  </CanvasColumnFilterField>
                  <CanvasColumnFilterField label={t('Refund record ID')}>
                    <Input
                      value={refundId}
                      placeholder={t('Refund record ID')}
                      onChange={(event) => setRefundId(event.target.value)}
                    />
                  </CanvasColumnFilterField>
                </>
              ) : null}
              <CanvasColumnFilterField label={t('Event')}>
                <Select
                  value={eventType || 'ALL'}
                  onValueChange={(value) =>
                    setEventType(value === 'ALL' ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger className='w-full' aria-label={t('Event')}>
                    <SelectValue placeholder={t('Event')}>
                      {eventType ? t(eventType) : t('All events')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All events')}</SelectItem>
                    {ledgerEventTypes.map((value) => (
                      <SelectItem key={value} value={value}>
                        <BusinessTerm kind='ledgerEvent' value={value} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CanvasColumnFilterField>
              <div className='sm:col-span-2'>
                <CanvasDateRangeFilter
                  from={ledgerFrom}
                  to={ledgerTo}
                  onFromChange={setLedgerFrom}
                  onToChange={setLedgerTo}
                />
              </div>
            </>
          }
          hasActiveFilters={Boolean(
            taskId || refundId || eventType || ledgerFrom || ledgerTo
          )}
          onResetFilters={() => {
            setEventType('')
            setTaskId('')
            setRefundId('')
            setLedgerFrom(undefined)
            setLedgerTo(undefined)
          }}
          getRowId={(row) => row.id}
        />
      ) : null}
    </div>
  )
}

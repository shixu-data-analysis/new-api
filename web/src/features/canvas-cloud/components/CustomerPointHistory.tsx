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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
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
import { toIntlLocale } from '@/i18n/languages'

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
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import type { CustomerFactTarget } from './CustomerBusinessFacts'

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
  'DEBT_REPAYMENT',
  'POINT_RETURN',
] as const

const pointLotSourceTypes = [
  'RECHARGE_CODE',
  'REGISTRATION_BONUS',
  'INVITE_BONUS',
  'PROMOTION',
  'CUSTOMER_SERVICE',
  'MANUAL_GRANT',
  'GRACE_TRANSFER',
] as const
type PointLotSourceType = (typeof pointLotSourceTypes)[number]
const pointLotSourceLabels: Record<PointLotSourceType, string> = {
  RECHARGE_CODE: 'Recharge order',
  REGISTRATION_BONUS: 'Registration bonus',
  INVITE_BONUS: 'Invite bonus',
  PROMOTION: 'Promotion',
  CUSTOMER_SERVICE: 'Customer service',
  MANUAL_GRANT: 'Manual gift',
  GRACE_TRANSFER: 'Grace transfer',
}

function ExplainedHeader({
  label,
  explanation,
}: {
  label: string
  explanation: string
}) {
  return (
    <span
      className='cursor-help border-b border-dotted border-current'
      title={explanation}
      aria-label={`${label}. ${explanation}`}
    >
      {label}
    </span>
  )
}

export function CustomerPointHistory({
  customerId,
  view = 'both',
  selectedLotId,
  onDeductLot,
  onInspect,
  onOpenOrder,
}: {
  customerId?: string
  onInspect?: (target: CustomerFactTarget) => void
  onOpenOrder?: (rechargeOrderId: string) => void
  view?: 'both' | 'lots' | 'ledger'
  selectedLotId?: string
  onDeductLot?: (lot: CanvasAdminPointLot) => void
}) {
  const { t, i18n } = useTranslation()
  const lotsState = useServerTableState('expiresAt')
  const ledgerState = useServerTableState('occurredAt')
  const setLotsPagination = lotsState.setPagination
  const setLedgerPagination = ledgerState.setPagination
  const [lotType, setLotType] = useState('')
  const [sourceType, setSourceType] = useState<PointLotSourceType | ''>('')
  const [eventType, setEventType] = useState('')
  const [rechargeOrderNumber, setRechargeOrderNumber] = useState('')
  const [relatedRecord, setRelatedRecord] = useState('')
  const debouncedRechargeOrderNumber = useDebounce(
    rechargeOrderNumber.trim(),
    300
  )
  const debouncedRelatedRecord = useDebounce(relatedRecord.trim(), 300)
  const [lotFrom, setLotFrom] = useState<Date>()
  const [lotTo, setLotTo] = useState<Date>()
  const [expiresFrom, setExpiresFrom] = useState<Date>()
  const [expiresTo, setExpiresTo] = useState<Date>()
  const [ledgerFrom, setLedgerFrom] = useState<Date>()
  const [ledgerTo, setLedgerTo] = useState<Date>()
  const lotDateRangeValid =
    isCanvasDateRangeValid(lotFrom, lotTo) &&
    isCanvasDateRangeValid(expiresFrom, expiresTo)
  const ledgerDateRangeValid = isCanvasDateRangeValid(ledgerFrom, ledgerTo)
  const formatPoints = useCallback(
    (value: string) =>
      new Intl.NumberFormat(toIntlLocale(i18n.language)).format(BigInt(value)),
    [i18n.language]
  )
  const formatSignedPoints = useCallback(
    (value: string) => {
      const points = BigInt(value)
      const formatted = new Intl.NumberFormat(
        toIntlLocale(i18n.language)
      ).format(points)
      return points > 0n ? `+${formatted}` : formatted
    },
    [i18n.language]
  )
  useEffect(() => {
    setLotsPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [
    debouncedRechargeOrderNumber,
    expiresFrom,
    expiresTo,
    lotFrom,
    lotTo,
    lotType,
    setLotsPagination,
    sourceType,
  ])
  useEffect(() => {
    setLedgerPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [
    debouncedRelatedRecord,
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
      sourceType,
      lotFrom?.toISOString(),
      lotTo?.toISOString(),
      expiresFrom?.toISOString(),
      expiresTo?.toISOString(),
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
        ...(lotType
          ? { type: lotType as 'PAID' | 'BONUS' | 'GRACE_BONUS' }
          : {}),
        ...(sourceType ? { sourceType } : {}),
        ...(lotFrom ? { from: lotFrom.toISOString() } : {}),
        ...(lotTo ? { to: lotTo.toISOString() } : {}),
        ...(expiresFrom ? { expiresFrom: expiresFrom.toISOString() } : {}),
        ...(expiresTo ? { expiresTo: expiresTo.toISOString() } : {}),
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
      debouncedRelatedRecord,
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
        ...(debouncedRelatedRecord
          ? { relatedRecord: debouncedRelatedRecord }
          : {}),
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
        id: 'issuedAt',
        accessorKey: 'issuedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Issued at')} />
        ),
        meta: { label: t('Issued at') },
        cell: ({ row }) =>
          onInspect ? (
            <button
              type='button'
              className='text-primary text-start underline underline-offset-4 focus-visible:ring-2'
              onClick={() => onInspect({ kind: 'lot', id: row.original.id })}
            >
              {formatCanvasDateTime(row.original.issuedAt)}
            </button>
          ) : (
            formatCanvasDateTime(row.original.issuedAt)
          ),
      },
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
        id: 'sourceType',
        accessorKey: 'sourceType',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Source')} />
        ),
        meta: { label: t('Source') },
        cell: ({ row }) => {
          const rechargeOrderId = row.original.rechargeOrderId
          const rechargeOrderNumber = row.original.rechargeOrderNumber
          return rechargeOrderId && rechargeOrderNumber && onOpenOrder ? (
            <button
              type='button'
              className='text-primary text-start underline underline-offset-4 focus-visible:ring-2'
              onClick={() => onOpenOrder(rechargeOrderId)}
            >
              {rechargeOrderNumber}
            </button>
          ) : (
            t(
              pointLotSourceLabels[
                row.original.sourceType as PointLotSourceType
              ] ?? 'Unknown'
            )
          )
        },
      },
      {
        id: 'availablePoints',
        accessorKey: 'availablePoints',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Available')} />
        ),
        meta: { label: t('Available') },
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {formatPoints(row.original.availablePoints)}
          </div>
        ),
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
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {formatPoints(row.original.reservedPoints)}
          </div>
        ),
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
  }, [formatPoints, onDeductLot, onInspect, onOpenOrder, selectedLotId, t])
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
          <BusinessTermText kind='ledgerEvent' value={row.original.eventType} />
        ),
      },
      {
        id: 'eventPoints',
        accessorKey: 'eventPoints',
        enableSorting: false,
        header: () =>
          customerId ? (
            <ExplainedHeader
              label={t('Points in this change')}
              explanation={t(
                'The number of points processed by this operation.'
              )}
            />
          ) : (
            t('Affected points')
          ),
        cell: ({ row }) => (
          <div className='text-right tabular-nums'>
            {formatPoints(row.original.eventPoints)}
          </div>
        ),
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
          id: 'availableDelta',
          accessorKey: 'availableDelta',
          enableSorting: false,
          header: () => (
            <ExplainedHeader
              label={t('Available points change')}
              explanation={t(
                'The change in points available for immediate use.'
              )}
            />
          ),
          cell: ({ row }) => {
            const value = BigInt(
              row.original.availableDelta ??
                (
                  BigInt(row.original.remainingDelta) -
                  BigInt(row.original.reservedDelta)
                ).toString()
            )
            return (
              <div className='text-right tabular-nums'>
                {formatSignedPoints(value.toString())}
              </div>
            )
          },
        },
        {
          id: 'reservedDelta',
          accessorKey: 'reservedDelta',
          enableSorting: false,
          header: () => (
            <ExplainedHeader
              label={t('Reserved points change')}
              explanation={t(
                'The change in points reserved by an in-progress task.'
              )}
            />
          ),
          cell: ({ row }) => {
            const value = BigInt(row.original.reservedDelta)
            return (
              <div className='text-right tabular-nums'>
                {formatSignedPoints(value.toString())}
              </div>
            )
          },
        },
        {
          id: 'relatedRecord',
          enableSorting: false,
          header: t('Related record'),
          cell: ({ row }) => {
            const taskId = row.original.taskId
            const rechargeOrderId = row.original.rechargeOrderId
            const rechargeOrderNumber = row.original.rechargeOrderNumber
            const pointLotId = row.original.pointLotId
            if (taskId && onInspect) {
              return (
                <button
                  type='button'
                  className='text-primary underline underline-offset-4 focus-visible:ring-2'
                  onClick={() => onInspect({ kind: 'task', id: taskId })}
                >
                  {t('Task')}
                  {row.original.outputIndex !== null
                    ? ` · ${t('Result')} ${row.original.outputIndex + 1}`
                    : ''}
                </button>
              )
            }
            if (rechargeOrderId && rechargeOrderNumber && onOpenOrder) {
              return (
                <button
                  type='button'
                  className='text-primary underline underline-offset-4 focus-visible:ring-2'
                  onClick={() => onOpenOrder(rechargeOrderId)}
                >
                  {rechargeOrderNumber}
                </button>
              )
            }
            if (pointLotId && onInspect) {
              return (
                <button
                  type='button'
                  className='text-primary underline underline-offset-4 focus-visible:ring-2'
                  onClick={() => onInspect({ kind: 'lot', id: pointLotId })}
                >
                  {t('Point Lot')}
                </button>
              )
            }
            return t('No related record')
          },
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
          return (
            <div className='text-right tabular-nums'>
              {formatSignedPoints(delta.toString())}
            </div>
          )
        },
      })
    }
    return columns
  }, [customerId, formatPoints, formatSignedPoints, onInspect, onOpenOrder, t])
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
          error={lots.isError}
          onRetry={() => void lots.refetch()}
          emptyTitle={t('No point lots')}
          filteredEmptyTitle={t('No matching results')}
          additionalFilters={
            <>
              {customerId ? (
                <DataTableColumnFilterField label={t('Canvas recharge order')}>
                  <Input
                    value={rechargeOrderNumber}
                    placeholder={t('Canvas recharge order')}
                    onChange={(event) =>
                      setRechargeOrderNumber(event.target.value)
                    }
                  />
                </DataTableColumnFilterField>
              ) : null}
              <DataTableColumnFilterField label={t('Type')}>
                <Select
                  value={lotType || 'ALL'}
                  onValueChange={(value) =>
                    setLotType(value === 'ALL' ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger className='w-full' aria-label={t('Type')}>
                    <CanvasLocalizedSelectValue
                      value={lotType}
                      emptyLabelKey='All types'
                      placeholderKey='Type'
                      termKind='pointLotType'
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All types')}</SelectItem>
                    <SelectItem value='PAID'>{t('Paid points')}</SelectItem>
                    <SelectItem value='BONUS'>{t('Bonus points')}</SelectItem>
                    <SelectItem value='GRACE_BONUS'>
                      {t('Grace bonus points')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </DataTableColumnFilterField>
              <DataTableColumnFilterField label={t('Source type')}>
                <Select
                  value={sourceType || 'ALL'}
                  onValueChange={(value) =>
                    setSourceType(
                      value === 'ALL' ? '' : (value as PointLotSourceType)
                    )
                  }
                >
                  <SelectTrigger
                    className='w-full'
                    aria-label={t('Source type')}
                  >
                    <SelectValue placeholder={t('Source type')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All source types')}</SelectItem>
                    {pointLotSourceTypes.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(pointLotSourceLabels[value])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DataTableColumnFilterField>
              <div className='sm:col-span-2'>
                <p className='mb-2 text-sm font-medium'>{t('Issued time')}</p>
                <CanvasDateRangeFilter
                  from={lotFrom}
                  to={lotTo}
                  onFromChange={setLotFrom}
                  onToChange={setLotTo}
                />
              </div>
              <div className='sm:col-span-2'>
                <p className='mb-2 text-sm font-medium'>{t('Expiry time')}</p>
                <CanvasDateRangeFilter
                  from={expiresFrom}
                  to={expiresTo}
                  onFromChange={setExpiresFrom}
                  onToChange={setExpiresTo}
                />
              </div>
            </>
          }
          hasActiveFilters={Boolean(
            rechargeOrderNumber ||
            lotType ||
            sourceType ||
            lotFrom ||
            lotTo ||
            expiresFrom ||
            expiresTo
          )}
          onResetFilters={() => {
            setLotType('')
            setRechargeOrderNumber('')
            setSourceType('')
            setLotFrom(undefined)
            setLotTo(undefined)
            setExpiresFrom(undefined)
            setExpiresTo(undefined)
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
          error={ledger.isError}
          onRetry={() => void ledger.refetch()}
          emptyTitle={t('No consumption records')}
          filteredEmptyTitle={t('No matching results')}
          additionalFilters={
            <>
              {customerId ? (
                <DataTableColumnFilterField label={t('Related record')}>
                  <Input
                    value={relatedRecord}
                    placeholder={t('Related record')}
                    onChange={(event) => setRelatedRecord(event.target.value)}
                  />
                </DataTableColumnFilterField>
              ) : null}
              <DataTableColumnFilterField label={t('Event')}>
                <Select
                  value={eventType || 'ALL'}
                  onValueChange={(value) =>
                    setEventType(value === 'ALL' ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger className='w-full' aria-label={t('Event')}>
                    <CanvasLocalizedSelectValue
                      value={eventType}
                      emptyLabelKey='All events'
                      placeholderKey='Event'
                      termKind='ledgerEvent'
                    />
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
              </DataTableColumnFilterField>
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
            relatedRecord || eventType || ledgerFrom || ledgerTo
          )}
          onResetFilters={() => {
            setEventType('')
            setRelatedRecord('')
            setLedgerFrom(undefined)
            setLedgerTo(undefined)
          }}
          getRowId={(row) => row.id}
        />
      ) : null}
    </div>
  )
}

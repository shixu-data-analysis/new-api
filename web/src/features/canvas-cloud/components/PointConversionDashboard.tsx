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
*/
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toIntlLocale } from '@/i18n/languages'

import { formatCanvasDateTime } from '../formatters'
import { getCanvasPointConversionReport } from '../point-conversion-api'
import {
  formatExactPointQuantity,
  formatExactRmbReference,
  type CanvasPointConversionLot,
  type CanvasPointConversionState,
  type CanvasPointLotType,
} from '../point-conversion-types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasColumnFilterField } from './CanvasColumnFilterPanel'
import { CanvasServerTable } from './CanvasServerTable'

const lotTypes: CanvasPointLotType[] = ['PAID', 'BONUS', 'GRACE_BONUS']
const lotStates: CanvasPointConversionState[] = [
  'available',
  'reserved',
  'expiring',
  'expired',
]

export function PointConversionDashboard() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const tableState = useServerTableState('issuedAt')
  const [lotType, setLotType] = useState<CanvasPointLotType | ''>('')
  const [state, setState] = useState<CanvasPointConversionState | ''>('')
  const [expiryDays, setExpiryDays] = useState('7')
  const expiryDaysNumber = Number(expiryDays)
  const normalizedExpiryDays =
    Number.isInteger(expiryDaysNumber) &&
    expiryDaysNumber >= 1 &&
    expiryDaysNumber <= 3650
      ? expiryDaysNumber
      : 7
  const report = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin',
      'point-conversion',
      tableState.query,
      lotType,
      state,
      normalizedExpiryDays,
    ],
    queryFn: ({ signal }) =>
      getCanvasPointConversionReport(
        {
          ...tableState.query,
          ...(lotType ? { lotType } : {}),
          ...(state ? { state } : {}),
          expiryDays: normalizedExpiryDays,
        },
        signal
      ),
  })

  const applyDrilldown = (next: {
    lotType?: CanvasPointLotType
    state?: CanvasPointConversionState
  }) => {
    setLotType(next.lotType ?? '')
    setState(next.state ?? '')
    tableState.setPagination((current) => ({ ...current, pageIndex: 0 }))
  }

  const columns = useMemo<ColumnDef<CanvasPointConversionLot, unknown>[]>(
    () => [
      {
        id: 'customer',
        accessorKey: 'customer',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Customer')} />
        ),
        meta: { label: t('Customer') },
      },
      {
        id: 'lotType',
        accessorKey: 'lotType',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Point type')} />
        ),
        meta: { label: t('Point type') },
        cell: ({ row }) => t(row.original.lotType),
      },
      {
        id: 'effectivePoints',
        accessorKey: 'effectivePoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Effective points')}
          />
        ),
        meta: { label: t('Effective points') },
        cell: ({ row }) =>
          formatExactPointQuantity(row.original.effectivePoints, locale),
      },
      {
        id: 'availablePoints',
        accessorKey: 'availablePoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Available points')}
          />
        ),
        meta: { label: t('Available points') },
        cell: ({ row }) =>
          formatExactPointQuantity(row.original.availablePoints, locale),
      },
      {
        id: 'reservedPoints',
        accessorKey: 'reservedPoints',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Reserved points')} />
        ),
        meta: { label: t('Reserved points') },
        cell: ({ row }) =>
          formatExactPointQuantity(row.original.reservedPoints, locale),
      },
      {
        id: 'referenceAmountRmb',
        accessorKey: 'referenceAmountRmb',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('RMB reference')} />
        ),
        meta: { label: t('RMB reference') },
        cell: ({ row }) =>
          `RMB ${formatExactRmbReference(row.original.referenceAmountRmb, locale)}`,
      },
      {
        id: 'expiresAt',
        accessorKey: 'expiresAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Expires at')} />
        ),
        meta: { label: t('Expires at') },
        cell: ({ row }) =>
          formatCanvasDateTime(row.original.expiresAt, t('No expiry')),
      },
      {
        id: 'issuedAt',
        accessorKey: 'issuedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Issued at')} />
        ),
        meta: { label: t('Issued at') },
        cell: ({ row }) => formatCanvasDateTime(row.original.issuedAt),
      },
    ],
    [locale, t]
  )

  const summary = report.data?.summary
  return (
    <div className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
        <DrilldownCard
          label={t('Effective points')}
          value={
            summary
              ? formatExactPointQuantity(summary.effectivePoints, locale)
              : '—'
          }
          onClick={() => applyDrilldown({})}
        />
        <DrilldownCard
          label={t('Available points')}
          value={
            summary
              ? formatExactPointQuantity(summary.availablePoints, locale)
              : '—'
          }
          onClick={() => applyDrilldown({ state: 'available' })}
        />
        <DrilldownCard
          label={t('Reserved points')}
          value={
            summary
              ? formatExactPointQuantity(summary.reservedPoints, locale)
              : '—'
          }
          onClick={() => applyDrilldown({ state: 'reserved' })}
        />
        <DrilldownCard
          label={t('RMB reference')}
          value={
            summary
              ? `RMB ${formatExactRmbReference(summary.referenceAmountRmb, locale)}`
              : '—'
          }
          onClick={() => applyDrilldown({})}
        />
        <DrilldownCard
          label={t('Average RMB per point')}
          value={
            summary?.averageRmbPerPoint
              ? `RMB ${formatExactRmbReference(summary.averageRmbPerPoint, locale)}`
              : '—'
          }
          onClick={() => applyDrilldown({})}
        />
      </div>
      <div className='grid gap-3 md:grid-cols-2'>
        <DrilldownCard
          label={t('Expiring available points')}
          value={
            summary
              ? formatExactPointQuantity(summary.expiringPoints, locale)
              : '—'
          }
          description={t('Expiring within {{days}} days', {
            days: normalizedExpiryDays,
          })}
          onClick={() => applyDrilldown({ state: 'expiring' })}
        />
        <DrilldownCard
          label={t('Expired uncleared points')}
          value={
            summary
              ? formatExactPointQuantity(summary.expiredUnclearedPoints, locale)
              : '—'
          }
          onClick={() => applyDrilldown({ state: 'expired' })}
        />
      </div>
      <div className='grid gap-3 md:grid-cols-3'>
        {(report.data?.composition ?? []).map((item) => (
          <DrilldownCard
            key={item.lotType}
            label={t(item.lotType)}
            value={formatExactPointQuantity(item.availablePoints, locale)}
            description={t('Available points')}
            onClick={() => applyDrilldown({ lotType: item.lotType })}
          />
        ))}
      </div>
      <p className='text-muted-foreground text-sm'>
        {t(
          'RMB amounts are point conversion references derived from immutable Lot snapshots. They are not cash balances, revenue, or accounting totals.'
        )}
      </p>
      <CanvasServerTable
        data={report.data?.items ?? []}
        columns={columns}
        total={report.data?.total ?? 0}
        state={tableState}
        searchLabel={t('Customer')}
        loading={report.isPending || report.isFetching}
        emptyTitle={t('No point lots')}
        additionalFilters={
          <>
            <CanvasColumnFilterField label={t('Point type')}>
              <Select
                value={lotType || 'ALL'}
                onValueChange={(value) =>
                  applyDrilldown({
                    lotType:
                      value === 'ALL'
                        ? undefined
                        : (value as CanvasPointLotType),
                    state: state || undefined,
                  })
                }
              >
                <SelectTrigger aria-label={t('Point type')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All point types')}</SelectItem>
                  {lotTypes.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CanvasColumnFilterField>
            <CanvasColumnFilterField label={t('Lot state')}>
              <Select
                value={state || 'ALL'}
                onValueChange={(value) =>
                  applyDrilldown({
                    lotType: lotType || undefined,
                    state:
                      value === 'ALL'
                        ? undefined
                        : (value as CanvasPointConversionState),
                  })
                }
              >
                <SelectTrigger aria-label={t('Lot state')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All lot states')}</SelectItem>
                  {lotStates.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CanvasColumnFilterField>
            <CanvasColumnFilterField
              label={t('Expiry window (days)')}
              htmlFor='point-conversion-expiry-days'
            >
              <Input
                id='point-conversion-expiry-days'
                inputMode='numeric'
                min={1}
                max={3650}
                value={expiryDays}
                onChange={(event) => {
                  setExpiryDays(event.target.value)
                  tableState.setPagination((current) => ({
                    ...current,
                    pageIndex: 0,
                  }))
                }}
              />
            </CanvasColumnFilterField>
          </>
        }
        hasActiveFilters={Boolean(
          lotType || state || normalizedExpiryDays !== 7
        )}
        activeFilterCount={
          [
            tableState.search,
            lotType,
            state,
            normalizedExpiryDays !== 7 ? 'expiryDays' : '',
          ].filter(Boolean).length
        }
        onResetFilters={() => {
          setLotType('')
          setState('')
          setExpiryDays('7')
          tableState.setSearch('')
          tableState.setSorting([{ id: 'issuedAt', desc: true }])
          tableState.setPagination((current) => ({ ...current, pageIndex: 0 }))
        }}
        getRowId={(item) => item.id}
      />
    </div>
  )
}

function DrilldownCard(props: {
  label: string
  value: string
  description?: string
  onClick: () => void
}) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-muted-foreground text-sm font-medium'>
          {props.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <button
          type='button'
          className='focus-visible:ring-ring w-full text-left focus-visible:ring-2 focus-visible:outline-none'
          aria-label={props.label}
          onClick={props.onClick}
        >
          <div className='text-2xl font-semibold tabular-nums'>
            {props.value}
          </div>
          {props.description ? (
            <div className='text-muted-foreground mt-1 text-xs'>
              {props.description}
            </div>
          ) : null}
        </button>
      </CardContent>
    </Card>
  )
}

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
/* eslint-disable react-refresh/only-export-components */
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'

import { formatCanvasDateTime } from '../formatters'
import type { CanvasAdminRechargeOrder } from '../types'
import { BusinessTerm } from './BusinessTerm'
import { CopyableText } from './CopyableText'

const alwaysSelectable = () => true

export function useCanvasRechargeOrderColumns({
  showCustomer = false,
  showCorrectionDetails = false,
  selectedOrderId,
  isSelectable = alwaysSelectable,
  onSelect,
  actionLabel,
  hideUnavailableAction = false,
}: {
  showCustomer?: boolean
  showCorrectionDetails?: boolean
  selectedOrderId?: string
  isSelectable?: (order: CanvasAdminRechargeOrder) => boolean
  onSelect?: (order: CanvasAdminRechargeOrder) => void
  actionLabel?: string
  hideUnavailableAction?: boolean
}): ColumnDef<CanvasAdminRechargeOrder, unknown>[] {
  const { t } = useTranslation()

  return useMemo(() => {
    const columns: ColumnDef<CanvasAdminRechargeOrder, unknown>[] = [
      {
        id: 'orderNumber',
        accessorKey: 'orderNumber',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Canvas recharge order')}
          />
        ),
        meta: { label: t('Canvas recharge order') },
        cell: ({ row }) => <CopyableText value={row.original.orderNumber} />,
      },
    ]

    if (showCustomer) {
      columns.push({
        id: 'customer',
        accessorFn: (item) => item.customerName ?? item.customerEmailMasked,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Customer')} />
        ),
        meta: { label: t('Customer') },
        cell: ({ row }) =>
          row.original.customerName ? (
            <CopyableText value={row.original.customerName} />
          ) : (
            (row.original.customerEmailMasked ?? '—')
          ),
      })
    }

    columns.push(
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
        id: 'expectedPaidPoints',
        accessorKey: 'expectedPaidPoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Expected Paid points')}
          />
        ),
        meta: { label: t('Expected Paid points') },
      },
      {
        id: 'issuedPaidPoints',
        accessorKey: 'issuedPaidPoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Issued Paid points')}
          />
        ),
        meta: { label: t('Issued Paid points') },
      },
      {
        id: 'availablePaidPoints',
        accessorKey: 'availablePaidPoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Available Paid points for this order')}
          />
        ),
        meta: { label: t('Available Paid points for this order') },
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Order created at')}
          />
        ),
        meta: { label: t('Order created at') },
        cell: ({ row }) => formatCanvasDateTime(row.original.createdAt),
      },
      {
        id: 'redeemedAt',
        accessorKey: 'redeemedAt',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Recharge code redeemed at')}
          />
        ),
        meta: { label: t('Recharge code redeemed at') },
        cell: ({ row }) =>
          row.original.redeemedAt
            ? formatCanvasDateTime(row.original.redeemedAt)
            : t('Not redeemed'),
      }
    )

    if (showCorrectionDetails) {
      columns.push({
        id: 'remainingCorrectionPoints',
        accessorKey: 'remainingCorrectionPoints',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Remaining correctable points')}
          />
        ),
        meta: { label: t('Remaining correctable points') },
      })
    }

    if (onSelect) {
      columns.push({
        id: 'select',
        enableSorting: false,
        enableHiding: false,
        header: t('Actions'),
        cell: ({ row }) => {
          const selectable = isSelectable(row.original)
          if (!selectable && hideUnavailableAction) return null
          let label = t('Unavailable')
          if (selectable) {
            label =
              actionLabel ??
              (selectedOrderId === row.original.id
                ? t('Selected')
                : t('Select'))
          }
          return (
            <Button
              type='button'
              size='sm'
              disabled={!selectable}
              variant={
                selectedOrderId === row.original.id ? 'default' : 'outline'
              }
              onClick={() => onSelect(row.original)}
            >
              {label}
            </Button>
          )
        },
      })
    }

    return columns
  }, [
    isSelectable,
    actionLabel,
    hideUnavailableAction,
    onSelect,
    selectedOrderId,
    showCorrectionDetails,
    showCustomer,
    t,
  ])
}

export function CanvasRechargeOrderSummary({
  order,
  showCustomer = false,
  showCorrectionDetails = false,
  actions,
}: {
  order: CanvasAdminRechargeOrder
  showCustomer?: boolean
  showCorrectionDetails?: boolean
  actions?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className='flex flex-wrap items-start justify-between gap-3'>
      <div>
        <h3 className='font-semibold'>{t('Selected order')}</h3>
        <CopyableText value={order.orderNumber} />
        <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm'>
          {showCustomer ? (
            <span>
              {t('Customer')}:{' '}
              {order.customerName ? (
                <CopyableText value={order.customerName} />
              ) : (
                (order.customerEmailMasked ?? '—')
              )}
            </span>
          ) : null}
          <span>
            {t('Status')}:{' '}
            <BusinessTerm kind='rechargeOrderStatus' value={order.status} />
          </span>
          <span>
            {t('Expected Paid points')}: {order.expectedPaidPoints}
          </span>
          <span>
            {t('Issued Paid points')}: {order.issuedPaidPoints}
          </span>
          <span>
            {t('Available Paid points for this order')}:{' '}
            {order.availablePaidPoints}
          </span>
          {showCorrectionDetails ? (
            <span>
              {t('Remaining correctable points')}:{' '}
              {order.remainingCorrectionPoints}
            </span>
          ) : null}
          <span>
            {t('Order created at')}: {formatCanvasDateTime(order.createdAt)}
          </span>
          <span>
            {t('Recharge code redeemed at')}:{' '}
            {formatCanvasDateTime(order.redeemedAt, t('Not redeemed'))}
          </span>
        </div>
      </div>
      {actions}
    </div>
  )
}

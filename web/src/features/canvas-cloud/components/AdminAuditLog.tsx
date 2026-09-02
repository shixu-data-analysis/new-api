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
import type { TFunction } from 'i18next'
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

import { getCanvasAuditEvents } from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import type { CanvasAuditEventPage } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'

type AuditEvent = CanvasAuditEventPage['items'][number]
const categories = [
  'CONFIGURATION',
  'EXECUTOR',
  'IAM',
  'PAYMENT',
  'POINTS',
  'PRICING',
  'TASK_EXECUTION',
] as const
const actionsByCategory: Partial<
  Record<(typeof categories)[number], string[]>
> = {
  POINTS: [
    'points.manual_bonus.granted',
    'points.paid_correction.granted',
    'points.manual_deduction.posted',
    'points.external_refund.recovered',
  ],
}

function localizeAuditValue(t: TFunction, value: string, unknownKey: string) {
  return t(value, { defaultValue: t(unknownKey) })
}

const auditActorLabelKeys: Record<string, string> = {
  PLATFORM_ADMIN: 'Platform administrator',
}
const auditResourceLabelKeys: Record<string, string> = {
  POINT_LEDGER: 'Point ledger',
}
const auditReasonLabelKeys: Record<string, string> = {
  SELECTED_LOT_DEDUCTION: 'Selected Point Lot deduction',
}

export function AdminAuditLog({ customerId }: { customerId?: string }) {
  const { t } = useTranslation()
  const state = useServerTableState('occurredAt')
  const [category, setCategory] = useState('')
  const [action, setAction] = useState('')
  const [outcome, setOutcome] = useState('')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const dateRangeValid = isCanvasDateRangeValid(from, to)
  const availableActions = category
    ? (actionsByCategory[category as keyof typeof actionsByCategory] ?? [])
    : []
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'audit',
      customerId,
      state.query,
      category,
      action,
      outcome,
      from?.toISOString(),
      to?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasAuditEvents(
        {
          page: state.query.page,
          pageSize: state.query.pageSize,
          sortOrder: state.query.sortOrder,
          ...(state.query.search ? { search: state.query.search } : {}),
          ...(category ? { category } : {}),
          ...(action ? { action } : {}),
          ...(outcome
            ? { outcome: outcome as 'SUCCESS' | 'FAILURE' | 'DEFERRED' }
            : {}),
          ...(customerId ? { customerId } : {}),
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        },
        signal
      ),
    enabled: dateRangeValid,
  })
  const columns = useMemo<ColumnDef<AuditEvent, unknown>[]>(
    () => [
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
        id: 'category',
        accessorKey: 'category',
        enableSorting: false,
        header: t('Category'),
        cell: ({ row }) =>
          localizeAuditValue(t, row.original.category, 'Unknown category'),
      },
      {
        id: 'action',
        accessorKey: 'action',
        enableSorting: false,
        header: t('Action'),
        cell: ({ row }) =>
          localizeAuditValue(t, row.original.action, 'Unknown action'),
      },
      {
        id: 'outcome',
        accessorKey: 'outcome',
        enableSorting: false,
        header: t('Outcome'),
        cell: ({ row }) =>
          localizeAuditValue(t, row.original.outcome, 'Unknown outcome'),
      },
      {
        id: 'actor',
        accessorKey: 'actorType',
        enableSorting: false,
        header: t('Actor'),
        cell: ({ row }) => {
          const actorLabelKey = auditActorLabelKeys[row.original.actorType]
          const actorLabel = actorLabelKey
            ? t(actorLabelKey)
            : localizeAuditValue(t, row.original.actorType, 'Unknown actor')
          return (
            <span>
              {actorLabel}
              {row.original.actorExternalSystem === 'new-api' &&
              row.original.actorExternalId ? (
                <>
                  {' '}
                  · {t('New API user ID')}:{' '}
                  <CopyableText value={row.original.actorExternalId} />
                </>
              ) : null}
            </span>
          )
        },
      },
      {
        id: 'resource',
        accessorKey: 'resourceType',
        enableSorting: false,
        header: t('Resource'),
        cell: ({ row }) => {
          const resourceLabelKey =
            auditResourceLabelKeys[row.original.resourceType]
          const resourceLabel = resourceLabelKey
            ? t(resourceLabelKey)
            : localizeAuditValue(
                t,
                row.original.resourceType,
                'Unknown resource'
              )
          return (
            <span>
              {resourceLabel}
              {row.original.resourceId ? (
                <>
                  {' '}
                  · <CopyableText value={row.original.resourceId} />
                </>
              ) : null}
            </span>
          )
        },
      },
      {
        id: 'reason',
        accessorKey: 'reasonCode',
        enableSorting: false,
        header: t('Reason'),
        cell: ({ row }) => {
          if (!row.original.reasonCode) return '—'
          const reasonLabelKey = auditReasonLabelKeys[row.original.reasonCode]
          return reasonLabelKey
            ? t(reasonLabelKey)
            : localizeAuditValue(t, row.original.reasonCode, 'Unknown reason')
        },
      },
    ],
    [t]
  )
  const filters = (
    <div className='flex flex-wrap gap-2'>
      <Select
        value={category || 'ALL'}
        onValueChange={(value) => {
          setCategory(value === 'ALL' ? '' : (value ?? ''))
          setAction('')
        }}
      >
        <SelectTrigger className='w-40'>
          <SelectValue placeholder={t('Category')}>
            {category ? t(category) : t('All categories')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='ALL'>{t('All categories')}</SelectItem>
          {categories.map((value) => (
            <SelectItem key={value} value={value}>
              {t(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={action || 'ALL'}
        disabled={availableActions.length === 0}
        onValueChange={(value) =>
          setAction(value === 'ALL' ? '' : (value ?? ''))
        }
      >
        <SelectTrigger className='w-56'>
          <SelectValue placeholder={t('Action')}>
            {action ? t(action) : t('All actions')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='ALL'>{t('All actions')}</SelectItem>
          {availableActions.map((value) => (
            <SelectItem key={value} value={value}>
              {t(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={outcome || 'ALL'}
        onValueChange={(value) =>
          setOutcome(value === 'ALL' ? '' : (value ?? ''))
        }
      >
        <SelectTrigger className='w-40'>
          <SelectValue placeholder={t('Outcome')}>
            {outcome ? t(outcome) : t('All outcomes')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='ALL'>{t('All outcomes')}</SelectItem>
          {['SUCCESS', 'FAILURE', 'DEFERRED'].map((value) => (
            <SelectItem key={value} value={value}>
              {t(value)}
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
      searchPlaceholder={t('Search audit events')}
      loading={query.isLoading || query.isFetching}
      emptyTitle={t('No audit events')}
      additionalFilters={filters}
      hasActiveFilters={Boolean(category || action || outcome || from || to)}
      onResetFilters={() => {
        setCategory('')
        setAction('')
        setOutcome('')
        setFrom(undefined)
        setTo(undefined)
      }}
      getRowId={(row) => row.id}
    />
  )
}

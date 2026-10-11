/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasRegistrationRankGrants } from '../activity-api'
import {
  ActivityRecordNavigationContext,
  activityCustomerHref,
  activityRecordState,
  activityStatusKey,
} from '../activity-shared'
import type {
  CanvasActivityActor,
  CanvasRegistrationRankActivity,
  CanvasRegistrationRankGrantRecord,
} from '../activity-types'
import { isCanvasDateRangeValid } from '../date-range'
import {
  formatCanvasDateTime,
  formatCanvasDateTimeMinutes,
} from '../formatters'
import { useServerTableState } from '../use-server-table-state'
import {
  ActivityRecordLink,
  ActivityRecordTable,
  GrantInviteCode,
} from './ActivityShared'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'

function actorName(actor: CanvasActivityActor | null): string {
  return actor ? (actor.displayName ?? actor.principalId) : '—'
}

export function RegistrationRankActivityDetail(props: {
  activity: CanvasRegistrationRankActivity
  onBack: () => void
  onStop: () => void
  children: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const { activity } = props
  const number = new Intl.NumberFormat(toIntlLocale(i18n.language))
  const issued = BigInt(activity.recipientCount)
  const total = BigInt(activity.recipientLimit)
  const remaining = total > issued ? total - issued : 0n
  const running = activity.status === 'ACTIVE'
  const phase = t(running ? 'Activity phase RUNNING' : 'Activity phase ENDED')
  return (
    <Card className='max-w-3xl'>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle>
            {running
              ? t('{{name}} · {{phase}}', { name: activity.name, phase })
              : t('{{name}} · {{phase}} ({{status}})', {
                  name: activity.name,
                  phase,
                  status: t(activityStatusKey(activity.status)),
                })}
          </CardTitle>
          <Button type='button' variant='outline' onClick={props.onBack}>
            {t('Back to activity management')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>
        <p>
          {t(
            'Issued: {{issued}} / {{total}} recipients, {{remaining}} remaining, {{points}} points in total',
            {
              issued: number.format(issued),
              total: number.format(total),
              remaining: number.format(remaining),
              points: number.format(issued * BigInt(activity.points)),
            }
          )}
        </p>
        <p>
          {t(
            'Per recipient: {{points}} points, valid for {{days}} days after credit',
            {
              points: number.format(BigInt(activity.points)),
              days: activity.ttlDays,
            }
          )}
        </p>
        {activity.endsAt ? (
          <p>
            {activity.status === 'FILLED' || activity.status === 'STOPPED'
              ? // Already ended early: the title says why, so the time stands alone.
                `${t('{{label}}: ', { label: t('End time') })}${formatCanvasDateTimeMinutes(activity.endsAt)}`
              : t(
                  activity.status === 'EXPIRED'
                    ? 'End time: {{time}} (expired)'
                    : 'End time: {{time}} (ends automatically)',
                  { time: formatCanvasDateTimeMinutes(activity.endsAt) }
                )}
          </p>
        ) : null}
        <p>
          {t('{{label}}: ', { label: t('Reason') })}
          {activity.reason}
        </p>
        <p>
          {t(
            'Published: {{actor}} · {{time}} (counting starts at publication)',
            {
              actor: actorName(activity.publisher),
              time: formatCanvasDateTime(activity.publishedAt),
            }
          )}
        </p>
        {activity.stoppedAt ? (
          <p>
            {t('Disabled: {{actor}} · {{time}}', {
              actor: actorName(activity.stoppedBy),
              time: formatCanvasDateTime(activity.stoppedAt),
            })}
          </p>
        ) : null}
        {props.children}
        <RegistrationRankGrantRecords activityId={activity.id} />
        {running ? (
          <div className='flex justify-end'>
            <Button type='button' variant='destructive' onClick={props.onStop}>
              {t('Disable activity')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RegistrationRankGrantRecords(props: { activityId: string }) {
  const { t } = useTranslation()
  const navigation = useContext(ActivityRecordNavigationContext)
  const restored = activityRecordState<{
    search?: string
    pageIndex?: number
    pageSize?: number
    customer?: string
    issuedFrom?: string
    issuedTo?: string
    sortId?: 'rank' | 'customer' | 'inviteCode' | 'issuedAt'
    sortDesc?: boolean
  }>(navigation?.recordState, 'registration-rank')
  const table = useServerTableState<'issuedAt'>('issuedAt', restored?.search)
  const [customer, setCustomer] = useState(restored?.customer ?? '')
  const [issuedFrom, setIssuedFrom] = useState<Date | undefined>(
    restored?.issuedFrom ? new Date(restored.issuedFrom) : undefined
  )
  const [issuedTo, setIssuedTo] = useState<Date | undefined>(
    restored?.issuedTo ? new Date(restored.issuedTo) : undefined
  )
  const resetPage = () =>
    table.setPagination((current) => ({ ...current, pageIndex: 0 }))
  const restoredPage = useRef(false)
  useEffect(() => {
    if (!restored || restoredPage.current) return
    restoredPage.current = true
    table.setPagination({
      pageIndex: restored.pageIndex ?? 0,
      pageSize: restored.pageSize ?? 20,
    })
    if (restored.sortId) {
      table.setSorting([
        { id: restored.sortId, desc: restored.sortDesc ?? true },
      ])
    }
  }, [restored, table])
  useEffect(() => {
    navigation?.updateRecordState({
      kind: 'registration-rank',
      search: table.search,
      pageIndex: table.pagination.pageIndex,
      pageSize: table.pagination.pageSize,
      sortId: table.query.sortBy,
      sortDesc: table.query.sortOrder === 'desc',
      customer,
      ...(issuedFrom ? { issuedFrom: issuedFrom.toISOString() } : {}),
      ...(issuedTo ? { issuedTo: issuedTo.toISOString() } : {}),
    })
  }, [
    customer,
    issuedFrom,
    issuedTo,
    navigation,
    table.pagination.pageIndex,
    table.pagination.pageSize,
    table.search,
    table.query.sortBy,
    table.query.sortOrder,
  ])
  const records = useQuery({
    queryKey: [
      'canvas-cloud',
      'activity-registration-rank-grants',
      props.activityId,
      table.query.page,
      table.query.pageSize,
      table.query.sortBy,
      table.query.sortOrder,
      customer,
      issuedFrom?.toISOString(),
      issuedTo?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasRegistrationRankGrants(
        props.activityId,
        {
          page: table.query.page,
          pageSize: table.query.pageSize,
          sortBy: table.query.sortBy as
            | 'rank'
            | 'customer'
            | 'inviteCode'
            | 'issuedAt',
          sortOrder: table.query.sortOrder,
          ...(customer.trim() ? { customer: customer.trim() } : {}),
          ...(issuedFrom ? { issuedFrom: issuedFrom.toISOString() } : {}),
          ...(issuedTo ? { issuedTo: issuedTo.toISOString() } : {}),
        },
        signal
      ),
    enabled: isCanvasDateRangeValid(issuedFrom, issuedTo),
    placeholderData: (previous) => previous,
  })
  const columns = useMemo<
    ColumnDef<CanvasRegistrationRankGrantRecord, unknown>[]
  >(
    () => [
      {
        id: 'rank',
        accessorKey: 'rank',
        meta: { label: t('Rank') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Rank')} />
        ),
        cell: ({ row }) => (
          <span className='tabular-nums'>{row.original.rank}</span>
        ),
      },
      {
        id: 'customer',
        accessorKey: 'customer',
        meta: { label: t('Customer') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Customer')} />
        ),
        cell: ({ row }) => (
          <ActivityRecordLink
            href={activityCustomerHref(
              row.original.customerId,
              row.original.pointLotId
            )}
            focusId={`rank-lot-${row.original.customerId}-${row.original.pointLotId}`}
          >
            {row.original.customer}
          </ActivityRecordLink>
        ),
      },
      {
        id: 'inviteCode',
        accessorKey: 'inviteCodeMasked',
        meta: { label: t('Invite code') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Invite code')} />
        ),
        cell: ({ row }) => (
          <GrantInviteCode
            inviteCodeId={row.original.inviteCodeId}
            maskedCode={row.original.inviteCodeMasked}
            allowedActions={row.original.inviteCodeAllowedActions}
          />
        ),
      },
      {
        id: 'issuedAt',
        accessorKey: 'issuedAt',
        meta: { label: t('Credited at') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Credited at')} />
        ),
        cell: ({ row }) => formatCanvasDateTime(row.original.issuedAt),
      },
    ],
    [t]
  )
  return (
    <ActivityRecordTable
      title={t('Grant records')}
      table={table}
      data={records.data?.items ?? []}
      total={records.data?.total ?? 0}
      columns={columns}
      loading={records.isPending || records.isFetching}
      error={records.isError}
      onRetry={() => void records.refetch()}
      emptyTitle={t('No grant records')}
      filteredEmptyTitle={t('No grant records match the current filters')}
      getRowId={(item) => item.participationId}
      filters={
        <>
          <DataTableColumnFilterField label={t('Customer')}>
            <Input
              value={customer}
              onChange={(event) => {
                setCustomer(event.target.value)
                resetPage()
              }}
            />
          </DataTableColumnFilterField>
          <DataTableColumnFilterField
            label={t('Credited at')}
            className='sm:col-span-2'
          >
            <CanvasDateRangeFilter
              from={issuedFrom}
              to={issuedTo}
              onFromChange={(value) => {
                setIssuedFrom(value)
                resetPage()
              }}
              onToChange={(value) => {
                setIssuedTo(value)
                resetPage()
              }}
            />
          </DataTableColumnFilterField>
        </>
      }
      hasActiveFilters={Boolean(customer || issuedFrom || issuedTo)}
      onReset={() => {
        setCustomer('')
        setIssuedFrom(undefined)
        setIssuedTo(undefined)
        resetPage()
      }}
    />
  )
}

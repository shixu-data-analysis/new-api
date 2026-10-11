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
  useEffect,
  useContext,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectItem, SelectTrigger } from '@/components/ui/select'

import { getCanvasManualGrantMembers } from '../activity-api'
import {
  ActivityRecordNavigationContext,
  activityCustomerHref,
  activityRecordState,
  activityStatusKey,
  minorToCny,
} from '../activity-shared'
import type {
  CanvasManualGrantMember,
  CanvasManualGrantPlan,
} from '../activity-types'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import { useServerTableState } from '../use-server-table-state'
import { ActivityRecordLink, SelectContent } from './ActivityShared'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'

export function ManualActivityDetail(props: {
  plan: CanvasManualGrantPlan
  onBack: () => void
  onCancel: () => void
  onEdit: () => void
  onRetry: () => void
  retryPending: boolean
  onBasis: (member: CanvasManualGrantMember) => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const navigation = useContext(ActivityRecordNavigationContext)
  const restored = activityRecordState<{
    search?: string
    pageIndex?: number
    pageSize?: number
    result?: string
    creditedFrom?: string
    creditedTo?: string
    sortId?: 'customer' | 'status' | 'creditedAt'
    sortDesc?: boolean
  }>(navigation?.recordState, 'manual')
  const table = useServerTableState<'customer'>('customer', restored?.search)
  const [result, setResult] = useState<string>(restored?.result ?? '')
  const [creditedFrom, setCreditedFrom] = useState<Date | undefined>(
    restored?.creditedFrom ? new Date(restored.creditedFrom) : undefined
  )
  const [creditedTo, setCreditedTo] = useState<Date | undefined>(
    restored?.creditedTo ? new Date(restored.creditedTo) : undefined
  )
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
      kind: 'manual',
      search: table.search,
      pageIndex: table.pagination.pageIndex,
      pageSize: table.pagination.pageSize,
      sortId: table.query.sortBy,
      sortDesc: table.query.sortOrder === 'desc',
      result,
      ...(creditedFrom ? { creditedFrom: creditedFrom.toISOString() } : {}),
      ...(creditedTo ? { creditedTo: creditedTo.toISOString() } : {}),
    })
  }, [
    creditedFrom,
    creditedTo,
    navigation,
    result,
    table.pagination.pageIndex,
    table.pagination.pageSize,
    table.search,
    table.query.sortBy,
    table.query.sortOrder,
  ])
  const canCancel = props.plan.status === 'WAITING'
  const canRetry =
    props.plan.status === 'PARTIAL_FAILED' || props.plan.status === 'FAILED'
  const thresholdScope =
    props.plan.scope.type === 'RECHARGE_THRESHOLD' ? props.plan.scope : null
  const isMembershipSnapshot =
    props.plan.status === 'WAITING' || props.plan.status === 'CANCELLED'
  const showEligibilitySnapshot =
    Boolean(thresholdScope) && isMembershipSnapshot
  const showExecutionRecords = !isMembershipSnapshot
  const members = useQuery({
    queryKey: [
      'canvas-cloud',
      'activity-members',
      props.plan.activityId,
      table.query.page,
      table.query.pageSize,
      table.query.search,
      table.query.sortBy,
      table.query.sortOrder,
      showExecutionRecords ? result : undefined,
      showExecutionRecords ? creditedFrom?.toISOString() : undefined,
      showExecutionRecords ? creditedTo?.toISOString() : undefined,
    ],
    queryFn: ({ signal }) =>
      getCanvasManualGrantMembers(
        props.plan.activityId,
        {
          page: table.query.page,
          pageSize: table.query.pageSize,
          sortBy: table.query.sortBy,
          sortOrder: table.query.sortOrder,
          ...(table.query.search ? { customer: table.query.search } : {}),
          ...(showExecutionRecords && result ? { result } : {}),
          ...(showExecutionRecords && creditedFrom
            ? { creditedFrom: creditedFrom.toISOString() }
            : {}),
          ...(showExecutionRecords && creditedTo
            ? { creditedTo: creditedTo.toISOString() }
            : {}),
        },
        signal
      ),
    enabled:
      !showExecutionRecords || isCanvasDateRangeValid(creditedFrom, creditedTo),
    placeholderData: (previous) => previous,
  })
  const columns = useMemo<ColumnDef<CanvasManualGrantMember, unknown>[]>(() => {
    const customerColumn: ColumnDef<CanvasManualGrantMember, unknown> = {
      id: 'customer',
      accessorKey: 'customer',
      meta: { label: t('Customer') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Customer')} />
      ),
      cell: ({ row }) => row.original.customer,
    }
    if (isMembershipSnapshot) {
      return [
        customerColumn,
        ...(showEligibilitySnapshot
          ? [
              {
                id: 'qualifyingAmountMinor',
                meta: { label: t('Qualifying recharge amount') },
                header: t('Qualifying recharge amount'),
                cell: ({
                  row,
                }: {
                  row: { original: CanvasManualGrantMember }
                }) => (
                  <Button
                    type='button'
                    variant='link'
                    className='h-auto p-0'
                    onClick={() => props.onBasis(row.original)}
                  >
                    ¥{minorToCny(row.original.qualifyingAmountMinor ?? '0')}
                  </Button>
                ),
              },
            ]
          : []),
      ]
    }
    return [
      customerColumn,
      {
        id: 'status',
        accessorKey: 'status',
        meta: { label: t('Result') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Result')} />
        ),
        cell: ({ row }) => t(`Manual grant result ${row.original.status}`),
      },
      {
        id: 'creditedAt',
        accessorKey: 'creditedAt',
        meta: { label: t('Credited at') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Credited at')} />
        ),
        cell: ({ row }) =>
          row.original.creditedAt
            ? formatCanvasDateTime(row.original.creditedAt)
            : '—',
      },
      {
        id: 'resultDetail',
        meta: { label: t('Record or reason') },
        header: t('Record or reason'),
        cell: ({ row }) => {
          if (row.original.failureReason) return row.original.failureReason
          if (row.original.status !== 'SUCCEEDED' || !row.original.pointLotId) {
            return '—'
          }
          return (
            <ActivityRecordLink
              href={activityCustomerHref(
                row.original.customerId,
                row.original.pointLotId
              )}
              focusId={`manual-lot-${row.original.customerId}-${row.original.pointLotId}`}
              className='text-primary font-mono hover:underline'
            >
              {row.original.pointLotId}
            </ActivityRecordLink>
          )
        },
      },
    ]
  }, [isMembershipSnapshot, props, showEligibilitySnapshot, t])
  return (
    <Card className='max-w-3xl'>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle>
            {props.plan.name} · {t(activityStatusKey(props.plan.status))}
          </CardTitle>
          <Button type='button' variant='outline' onClick={props.onBack}>
            {t('Back to activity management')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-4 text-sm'>
        <div className='space-y-1'>
          <p>
            {t('{{label}}: ', { label: t('Points per customer') })}
            {props.plan.points} ·{' '}
            {t('{{label}}: ', { label: t('Bonus validity (days)') })}
            {props.plan.ttlDays}
          </p>
          <p>
            {props.plan.schedule.mode === 'SCHEDULED'
              ? `${t('{{label}}: ', { label: t('Scheduled time') })}${formatCanvasDateTime(props.plan.schedule.scheduledAt)}`
              : t('Immediate grant')}
          </p>
          <p>
            {t('{{label}}: ', { label: t('Actual start') })}
            {props.plan.actualStartedAt
              ? formatCanvasDateTime(props.plan.actualStartedAt)
              : '—'}
          </p>
          <p>
            {t('{{label}}: ', { label: t('Reason') })}
            {props.plan.reason}
          </p>
          <p>
            {t('{{label}}: ', { label: t('Published at') })}
            {props.plan.publishedAt
              ? formatCanvasDateTime(props.plan.publishedAt)
              : '—'}
          </p>
          {props.plan.publisher ? (
            <p>
              {t('{{label}}: ', { label: t('Published by') })}
              {props.plan.publisher.displayName ??
                props.plan.publisher.principalId}
            </p>
          ) : null}
          {props.plan.cancelledAt ? (
            <p>
              {t('{{label}}: ', { label: t('Cancelled at') })}
              {formatCanvasDateTime(props.plan.cancelledAt)}
            </p>
          ) : null}
          {props.plan.cancelledBy ? (
            <p>
              {t('{{label}}: ', { label: t('Cancelled by') })}
              {props.plan.cancelledBy.displayName ??
                props.plan.cancelledBy.principalId}
            </p>
          ) : null}
          {thresholdScope ? (
            <p>
              {t('{{label}}: ', { label: t('Minimum recharge amount (CNY)') })}¥
              {minorToCny(thresholdScope.minimumRechargeAmountMinor)}
            </p>
          ) : null}
        </div>
        <CanvasServerTable
          data={members.data?.items ?? []}
          columns={columns}
          total={members.data?.total ?? props.plan.memberCount}
          state={table}
          searchLabel={t('Customer')}
          loading={members.isPending || members.isFetching}
          error={members.isError}
          onRetry={() => void members.refetch()}
          emptyTitle={t('No grant members')}
          filteredEmptyTitle={t('No grant members match the current filters')}
          getRowId={(item) => item.customerId}
          additionalFilters={
            showExecutionRecords ? (
              <>
                <DataTableColumnFilterField label={t('Result')}>
                  <Select
                    value={result || 'ALL'}
                    onValueChange={(value) => {
                      setResult(value === 'ALL' ? '' : (value ?? ''))
                      table.setPagination((current) => ({
                        ...current,
                        pageIndex: 0,
                      }))
                    }}
                  >
                    <SelectTrigger
                      className='w-full min-w-0'
                      aria-label={t('Result')}
                    >
                      <CanvasLocalizedSelectValue
                        value={result}
                        valueLabelKey={
                          result ? `Manual grant result ${result}` : undefined
                        }
                        emptyLabelKey='All results'
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ALL'>{t('All results')}</SelectItem>
                      {['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED'].map(
                        (value) => (
                          <SelectItem key={value} value={value}>
                            {t(`Manual grant result ${value}`)}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </DataTableColumnFilterField>
                <DataTableColumnFilterField
                  label={t('Credited at')}
                  className='sm:col-span-2'
                >
                  <CanvasDateRangeFilter
                    from={creditedFrom}
                    to={creditedTo}
                    onFromChange={(value) => {
                      setCreditedFrom(value)
                      table.setPagination((current) => ({
                        ...current,
                        pageIndex: 0,
                      }))
                    }}
                    onToChange={(value) => {
                      setCreditedTo(value)
                      table.setPagination((current) => ({
                        ...current,
                        pageIndex: 0,
                      }))
                    }}
                  />
                </DataTableColumnFilterField>
              </>
            ) : null
          }
          hasActiveFilters={Boolean(
            showExecutionRecords && (result || creditedFrom || creditedTo)
          )}
          onResetFilters={() => {
            setResult('')
            setCreditedFrom(undefined)
            setCreditedTo(undefined)
            table.setPagination((current) => ({
              ...current,
              pageIndex: 0,
            }))
          }}
        />
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <ManualGrantSummary
            plan={props.plan}
            isMembershipSnapshot={isMembershipSnapshot}
          />
          <div className='flex gap-2'>
            {canCancel ? (
              <Button
                type='button'
                variant='destructive'
                onClick={props.onCancel}
              >
                {t('Cancel plan')}
              </Button>
            ) : null}
            {canCancel ? (
              <Button type='button' variant='outline' onClick={props.onEdit}>
                {t('Edit')}
              </Button>
            ) : null}
            {canRetry ? (
              <Button
                type='button'
                disabled={props.retryPending}
                onClick={props.onRetry}
              >
                {t('Retry failed customers')}
              </Button>
            ) : null}
          </div>
        </div>
        {props.children}
      </CardContent>
    </Card>
  )
}

function ManualGrantSummary(props: {
  plan: CanvasManualGrantPlan
  isMembershipSnapshot: boolean
}) {
  const { t } = useTranslation()
  if (props.isMembershipSnapshot) {
    return (
      <p>
        {t(
          'Fixed membership {{count}} customers · Planned total {{points}} points',
          {
            count: props.plan.memberCount,
            points: plannedTotalPoints(
              props.plan.memberCount,
              props.plan.points
            ),
          }
        )}
      </p>
    )
  }
  if (props.plan.status === 'RUNNING') {
    const counts = manualGrantRunningCounts(props.plan)
    if (!counts) return <p role='alert'>{t('Results are incomplete')}</p>
    const entries = [
      { status: 'PENDING', count: counts.pendingCount },
      { status: 'PROCESSING', count: counts.processingCount },
      { status: 'SUCCEEDED', count: counts.successCount },
      { status: 'FAILED', count: counts.failureCount },
    ]
    return (
      <p>
        {entries
          .filter(({ count }) => count > 0)
          .map(
            ({ status, count }) =>
              `${t(`Manual grant result ${status}`)} ${count}`
          )
          .join(' · ')}
      </p>
    )
  }
  return (
    <p>
      {t(
        'Successful {{success}} · Failed {{failure}} · Issued {{points}} points',
        {
          success: props.plan.successCount,
          failure: props.plan.failureCount,
          points: props.plan.issuedPoints,
        }
      )}
    </p>
  )
}

function manualGrantRunningCounts(plan: CanvasManualGrantPlan) {
  const counts = [
    plan.pendingCount,
    plan.processingCount,
    plan.successCount,
    plan.failureCount,
  ]
  if (
    counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
    counts.reduce((total, count) => total + count, 0) !== plan.memberCount
  ) {
    return undefined
  }
  return {
    pendingCount: plan.pendingCount,
    processingCount: plan.processingCount,
    successCount: plan.successCount,
    failureCount: plan.failureCount,
  }
}

export function CancelActivityDialog(props: {
  open: boolean
  plan: CanvasManualGrantPlan
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Cancel plan')}</DialogTitle>
          <DialogDescription>
            {t(
              'Cancellation prevents this scheduled grant from executing. Issued points are never reversed.'
            )}
          </DialogDescription>
        </DialogHeader>
        <p>
          {t('{{label}}: ', { label: t('Activity name') })}
          {props.plan.name}
        </p>
        <p>
          {props.plan.schedule.mode === 'SCHEDULED'
            ? `${t('{{label}}: ', { label: t('Scheduled time') })}${formatCanvasDateTime(props.plan.schedule.scheduledAt)}`
            : t('Immediate grant')}
        </p>
        <p>
          {t('{{label}}: ', { label: t('Uses your current time zone') })}
          {Intl.DateTimeFormat().resolvedOptions().timeZone}
        </p>
        <p>
          {t(
            'Fixed membership {{count}} customers · Planned total {{points}} points',
            {
              count: props.plan.memberCount,
              points: plannedTotalPoints(
                props.plan.memberCount,
                props.plan.points
              ),
            }
          )}
        </p>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Back')}
          </Button>
          <Button
            type='button'
            variant='destructive'
            disabled={props.pending}
            onClick={props.onConfirm}
          >
            {t('Confirm cancellation')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function plannedTotalPoints(memberCount: number, points: string): string {
  if (!/^\d+$/u.test(points) || memberCount < 0) return '—'
  return (BigInt(memberCount) * BigInt(points)).toString()
}

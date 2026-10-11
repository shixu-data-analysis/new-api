/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { toast } from 'sonner'

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
import { Input } from '@/components/ui/input'
import { Select, SelectItem, SelectTrigger } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import {
  cancelCanvasManualBonusActivity,
  getCanvasActivity,
  getCanvasInviteBonusGrants,
  getCanvasManualGrantEligibilityBasis,
  getCanvasRechargeBonusBindings,
  retryCanvasManualGrantFailures,
  stopCanvasBonusActivity,
} from '../activity-api'
import {
  ActivityRecordNavigationContext,
  activityCustomerHref,
  activityRecordState,
  activityStatusKey,
  minorToCny,
} from '../activity-shared'
import type {
  CanvasActivityDetail,
  CanvasBonusActivity,
  CanvasManualGrantMember,
  CanvasManualGrantPlan,
  CanvasInviteBonusGrantRecord,
  CanvasRechargeBonusBindingRecord,
} from '../activity-types'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import {
  type CanvasServerTableState,
  useServerTableState,
} from '../use-server-table-state'
import {
  ActivityRecordLink,
  EligibilityBasisContent,
  SelectContent,
} from './ActivityShared'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CustomerRecordDetails } from './CustomerRecordDetails'
import { LimitedPriceActivityDetail } from './LimitedPriceActivityDetail'
import {
  CancelActivityDialog,
  ManualActivityDetail,
} from './ManualActivityDetail'

function activityOrderHref(customerId: string, orderId: string): string {
  return `/canvas-cloud/customers?${new URLSearchParams({
    customerId,
    orderId,
  }).toString()}`
}

function redemptionStatusKey(value: string): string {
  return `Redemption status ${value}`
}

export function ActivityDetail(props: {
  activityId: string
  initialDetail?: CanvasActivityDetail
  onBack: () => void
  onEdit: (plan: CanvasManualGrantPlan) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [stopOpen, setStopOpen] = useState(false)
  const [basisTarget, setBasisTarget] = useState<CanvasManualGrantMember>()
  const detail = useQuery({
    queryKey: ['canvas-cloud', 'activity', props.activityId],
    queryFn: ({ signal }) => getCanvasActivity(props.activityId, signal),
    initialData: props.initialDetail,
  })
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'activity', props.activityId],
    })
    void queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'activities'],
    })
    void queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'activity-members', props.activityId],
    })
  }
  const cancel = useMutation({
    mutationFn: (plan: CanvasManualGrantPlan) =>
      cancelCanvasManualBonusActivity(plan.activityId, plan.version),
    onSuccess: () => {
      setCancelOpen(false)
      toast.success(t('Activity cancelled'))
      refresh()
    },
    onError: () => toast.error(t('Unable to cancel activity')),
  })
  const retry = useMutation({
    mutationFn: () => retryCanvasManualGrantFailures(props.activityId),
    onSuccess: () => {
      toast.success(t('Failed customers are being retried'))
      refresh()
    },
    onError: () => toast.error(t('Unable to retry failed customers')),
  })
  const stop = useMutation({
    mutationFn: () =>
      stopCanvasBonusActivity(props.activityId, 'Stopped by administrator'),
    onSuccess: () => {
      setStopOpen(false)
      toast.success(t('Activity stopped'))
      refresh()
    },
    onError: () => toast.error(t('Unable to stop activity')),
  })

  if (detail.isPending) {
    return (
      <Card>
        <CardContent className='py-6'>{t('Loading')}</CardContent>
      </Card>
    )
  }
  if (detail.isError || !detail.data) {
    return (
      <Card>
        <CardContent className='space-y-3 py-6'>
          <p role='alert'>{t('Unable to load activity details')}</p>
          <Button
            type='button'
            variant='outline'
            onClick={() => void detail.refetch()}
          >
            {t('Retry')}
          </Button>
        </CardContent>
      </Card>
    )
  }
  const activity = detail.data
  if ('activityId' in activity) {
    return (
      <ManualActivityDetail
        plan={activity}
        onBack={props.onBack}
        onCancel={() => setCancelOpen(true)}
        onEdit={() => props.onEdit(activity)}
        onRetry={() => retry.mutate()}
        retryPending={retry.isPending}
        onBasis={setBasisTarget}
      >
        <CancelActivityDialog
          open={cancelOpen}
          plan={activity}
          pending={cancel.isPending}
          onOpenChange={setCancelOpen}
          onConfirm={() => cancel.mutate(activity)}
        />
        <EligibilityBasisSheet
          activityId={activity.activityId}
          member={basisTarget}
          onClose={() => setBasisTarget(undefined)}
        />
      </ManualActivityDetail>
    )
  }
  if ('ttlDays' in activity) {
    return (
      <BonusActivityDetail
        activity={activity}
        onBack={props.onBack}
        onStop={() => setStopOpen(true)}
      >
        <StopActivityDialog
          open={stopOpen}
          activity={activity}
          pending={stop.isPending}
          onOpenChange={setStopOpen}
          onConfirm={() => stop.mutate()}
        />
        <BonusActivityRecords activity={activity} />
      </BonusActivityDetail>
    )
  }
  return (
    <LimitedPriceActivityDetail activity={activity} onBack={props.onBack} />
  )
}

function BonusActivityDetail(props: {
  activity: Extract<CanvasActivityDetail, { ttlDays: number }>
  onBack: () => void
  onStop: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle>
            {props.activity.name} ·{' '}
            {t(activityStatusKey(props.activity.status))}
          </CardTitle>
          <Button type='button' variant='outline' onClick={props.onBack}>
            {t('Back to activity management')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>
        <p>
          {props.activity.type === 'RECHARGE_BONUS'
            ? t('Bonus per recharge code')
            : t('Bonus per new customer')}
          : {props.activity.points} {t('points')}
        </p>
        <p>
          {t('Bonus validity')}:{' '}
          {t('Valid for {{days}} days after credit', {
            days: props.activity.ttlDays,
          })}
        </p>
        <p>
          {t('Reason')}: {props.activity.reason}
        </p>
        <p>
          {t('Published at')}:{' '}
          {props.activity.publishedAt
            ? formatCanvasDateTime(props.activity.publishedAt)
            : '—'}
        </p>
        {props.activity.publisher ? (
          <p>
            {t('Published by')}:{' '}
            {props.activity.publisher.displayName ??
              props.activity.publisher.principalId}
          </p>
        ) : null}
        {props.activity.stoppedAt ? (
          <p>
            {t('Stopped at')}: {formatCanvasDateTime(props.activity.stoppedAt)}
          </p>
        ) : null}
        {props.activity.stoppedBy ? (
          <p>
            {t('Stopped by')}:{' '}
            {props.activity.stoppedBy.displayName ??
              props.activity.stoppedBy.principalId}
          </p>
        ) : null}
        {props.children}
        {props.activity.status === 'ACTIVE' ? (
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

function BonusActivityRecords(props: { activity: CanvasBonusActivity }) {
  return props.activity.type === 'RECHARGE_BONUS' ? (
    <RechargeBonusBindingRecords activityId={props.activity.id} />
  ) : (
    <InviteBonusGrantRecords activityId={props.activity.id} />
  )
}

function RechargeBonusBindingRecords(props: { activityId: string }) {
  const { t } = useTranslation()
  const navigation = useContext(ActivityRecordNavigationContext)
  const restored = activityRecordState<{
    search?: string
    pageIndex?: number
    pageSize?: number
    order?: string
    customer?: string
    redemptionStatus?: '' | 'UNREDEEMED' | 'REDEEMED'
    redeemedFrom?: string
    redeemedTo?: string
    sortId?:
      | 'rechargeOrderNumber'
      | 'amountMinor'
      | 'redemptionStatus'
      | 'bonusPoints'
      | 'customer'
      | 'redeemedAt'
    sortDesc?: boolean
  }>(navigation?.recordState, 'recharge')
  const table = useServerTableState<'rechargeOrderNumber'>(
    'rechargeOrderNumber',
    restored?.search
  )
  const [order, setOrder] = useState(restored?.order ?? '')
  const [customer, setCustomer] = useState(restored?.customer ?? '')
  const [redemptionStatus, setRedemptionStatus] = useState<
    '' | 'UNREDEEMED' | 'REDEEMED'
  >(restored?.redemptionStatus ?? '')
  const [redeemedFrom, setRedeemedFrom] = useState<Date | undefined>(
    restored?.redeemedFrom ? new Date(restored.redeemedFrom) : undefined
  )
  const [redeemedTo, setRedeemedTo] = useState<Date | undefined>(
    restored?.redeemedTo ? new Date(restored.redeemedTo) : undefined
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
      kind: 'recharge',
      search: table.search,
      pageIndex: table.pagination.pageIndex,
      pageSize: table.pagination.pageSize,
      sortId: table.query.sortBy,
      sortDesc: table.query.sortOrder === 'desc',
      order,
      customer,
      redemptionStatus,
      ...(redeemedFrom ? { redeemedFrom: redeemedFrom.toISOString() } : {}),
      ...(redeemedTo ? { redeemedTo: redeemedTo.toISOString() } : {}),
    })
  }, [
    customer,
    navigation,
    order,
    redeemedFrom,
    redeemedTo,
    redemptionStatus,
    table.pagination.pageIndex,
    table.pagination.pageSize,
    table.search,
    table.query.sortBy,
    table.query.sortOrder,
  ])
  const records = useQuery({
    queryKey: [
      'canvas-cloud',
      'activity-recharge-bindings',
      props.activityId,
      table.query.page,
      table.query.pageSize,
      table.query.sortBy,
      table.query.sortOrder,
      order,
      customer,
      redemptionStatus,
      redeemedFrom?.toISOString(),
      redeemedTo?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasRechargeBonusBindings(
        props.activityId,
        {
          page: table.query.page,
          pageSize: table.query.pageSize,
          sortBy: table.query.sortBy,
          sortOrder: table.query.sortOrder,
          ...(order.trim() ? { order: order.trim() } : {}),
          ...(customer.trim() ? { customer: customer.trim() } : {}),
          ...(redemptionStatus ? { redemptionStatus } : {}),
          ...(redeemedFrom ? { redeemedFrom: redeemedFrom.toISOString() } : {}),
          ...(redeemedTo ? { redeemedTo: redeemedTo.toISOString() } : {}),
        },
        signal
      ),
    enabled: isCanvasDateRangeValid(redeemedFrom, redeemedTo),
    placeholderData: (previous) => previous,
  })
  const columns = useMemo<
    ColumnDef<CanvasRechargeBonusBindingRecord, unknown>[]
  >(
    () => [
      {
        id: 'rechargeOrderNumber',
        accessorKey: 'rechargeOrderNumber',
        meta: { label: t('Recharge order') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Recharge order')} />
        ),
        cell: ({ row }) =>
          row.original.redemptionStatus === 'REDEEMED' &&
          row.original.customerId ? (
            <ActivityRecordLink
              href={activityOrderHref(
                row.original.customerId,
                row.original.rechargeOrderId
              )}
              focusId={`recharge-order-${row.original.rechargeOrderId}`}
              className='text-primary font-mono hover:underline'
            >
              {row.original.rechargeOrderNumber}
            </ActivityRecordLink>
          ) : (
            row.original.rechargeOrderNumber
          ),
      },
      {
        id: 'amountMinor',
        accessorKey: 'amountMinor',
        meta: { label: t('Recharge amount') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Recharge amount')} />
        ),
        cell: ({ row }) => `¥${minorToCny(row.original.amountMinor)}`,
      },
      {
        id: 'redemptionStatus',
        accessorKey: 'redemptionStatus',
        meta: { label: t('Status') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        cell: ({ row }) =>
          row.original.redemptionStatus === 'REDEEMED'
            ? t('Redeemed')
            : t('Not redeemed'),
      },
      {
        id: 'bonusPoints',
        accessorKey: 'bonusPoints',
        meta: { label: t('Bonus points') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Bonus points')} />
        ),
        cell: ({ row }) => row.original.bonusPoints,
      },
      {
        id: 'customer',
        accessorKey: 'customer',
        meta: { label: t('Customer') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Customer')} />
        ),
        cell: ({ row }) => row.original.customer ?? '—',
      },
      {
        id: 'redeemedAt',
        accessorKey: 'redeemedAt',
        meta: { label: t('Redeemed at') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Redeemed at')} />
        ),
        cell: ({ row }) =>
          row.original.redeemedAt
            ? formatCanvasDateTime(row.original.redeemedAt)
            : '—',
      },
    ],
    [t]
  )
  return (
    <ActivityRecordTable
      title={t('Binding records')}
      table={table}
      data={records.data?.items ?? []}
      total={records.data?.total ?? 0}
      columns={columns}
      loading={records.isPending || records.isFetching}
      error={records.isError}
      onRetry={() => void records.refetch()}
      emptyTitle={t('No binding records')}
      filteredEmptyTitle={t('No binding records match the current filters')}
      getRowId={(item) => item.participationId}
      filters={
        <>
          <DataTableColumnFilterField label={t('Recharge order')}>
            <Input
              value={order}
              onChange={(event) => {
                setOrder(event.target.value)
                resetPage()
              }}
            />
          </DataTableColumnFilterField>
          <DataTableColumnFilterField label={t('Customer')}>
            <Input
              value={customer}
              onChange={(event) => {
                setCustomer(event.target.value)
                resetPage()
              }}
            />
          </DataTableColumnFilterField>
          <DataTableColumnFilterField label={t('Redemption status')}>
            <Select
              value={redemptionStatus || 'ALL'}
              onValueChange={(value) => {
                setRedemptionStatus(
                  value === 'ALL' ? '' : (value as 'UNREDEEMED' | 'REDEEMED')
                )
                resetPage()
              }}
            >
              <SelectTrigger
                className='w-full min-w-0'
                aria-label={t('Redemption status')}
              >
                <CanvasLocalizedSelectValue
                  value={redemptionStatus}
                  valueLabelKey={
                    redemptionStatus
                      ? redemptionStatusKey(redemptionStatus)
                      : undefined
                  }
                  emptyLabelKey='All statuses'
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                <SelectItem value='UNREDEEMED'>
                  {t(redemptionStatusKey('UNREDEEMED'))}
                </SelectItem>
                <SelectItem value='REDEEMED'>
                  {t(redemptionStatusKey('REDEEMED'))}
                </SelectItem>
              </SelectContent>
            </Select>
          </DataTableColumnFilterField>
          <DataTableColumnFilterField
            label={t('Redeemed at')}
            className='sm:col-span-2'
          >
            <CanvasDateRangeFilter
              from={redeemedFrom}
              to={redeemedTo}
              onFromChange={(value) => {
                setRedeemedFrom(value)
                resetPage()
              }}
              onToChange={(value) => {
                setRedeemedTo(value)
                resetPage()
              }}
            />
          </DataTableColumnFilterField>
        </>
      }
      hasActiveFilters={Boolean(
        order || customer || redemptionStatus || redeemedFrom || redeemedTo
      )}
      onReset={() => {
        setOrder('')
        setCustomer('')
        setRedemptionStatus('')
        setRedeemedFrom(undefined)
        setRedeemedTo(undefined)
        resetPage()
      }}
    />
  )
}

function InviteBonusGrantRecords(props: { activityId: string }) {
  const { t } = useTranslation()
  const navigation = useContext(ActivityRecordNavigationContext)
  const restored = activityRecordState<{
    search?: string
    pageIndex?: number
    pageSize?: number
    customer?: string
    issuedFrom?: string
    issuedTo?: string
    sortId?: 'customer' | 'inviteCodePrefix' | 'bonusPoints' | 'issuedAt'
    sortDesc?: boolean
  }>(navigation?.recordState, 'invite')
  const table = useServerTableState<'issuedAt'>('issuedAt', restored?.search)
  const [customer, setCustomer] = useState(restored?.customer ?? '')
  const [issuedFrom, setIssuedFrom] = useState<Date | undefined>(
    restored?.issuedFrom ? new Date(restored.issuedFrom) : undefined
  )
  const [issuedTo, setIssuedTo] = useState<Date | undefined>(
    restored?.issuedTo ? new Date(restored.issuedTo) : undefined
  )
  const [lotTarget, setLotTarget] = useState<{
    customerId: string
    pointLotId: string
  }>()
  const lotReturn = useRef<
    { scrollY: number; focus: HTMLButtonElement | null } | undefined
  >(undefined)
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
      kind: 'invite',
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
      'activity-invite-grants',
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
      getCanvasInviteBonusGrants(
        props.activityId,
        {
          page: table.query.page,
          pageSize: table.query.pageSize,
          sortBy: table.query.sortBy,
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
  const columns = useMemo<ColumnDef<CanvasInviteBonusGrantRecord, unknown>[]>(
    () => [
      {
        id: 'customer',
        accessorKey: 'customer',
        meta: { label: t('Customer') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Customer')} />
        ),
        cell: ({ row }) =>
          row.original.customerId ? (
            <ActivityRecordLink
              href={activityCustomerHref(
                row.original.customerId,
                row.original.pointLotId
              )}
              focusId={`invite-lot-${row.original.customerId}-${row.original.pointLotId}`}
            >
              {row.original.customer ?? row.original.customerId}
            </ActivityRecordLink>
          ) : (
            (row.original.customer ?? '—')
          ),
      },
      {
        id: 'inviteCodePrefix',
        accessorKey: 'inviteCodePrefix',
        meta: { label: t('Invite code') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Invite code')} />
        ),
      },
      {
        id: 'bonusPoints',
        accessorKey: 'bonusPoints',
        meta: { label: t('Bonus points') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Bonus points')} />
        ),
        cell: ({ row }) => row.original.bonusPoints,
      },
      {
        id: 'issuedAt',
        accessorKey: 'issuedAt',
        meta: { label: t('Credited at') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Credited at')} />
        ),
        cell: ({ row }) =>
          row.original.customerId && row.original.pointLotId ? (
            <Button
              type='button'
              variant='link'
              className='h-auto p-0'
              onClick={(event) => {
                lotReturn.current = {
                  scrollY: window.scrollY,
                  focus: event.currentTarget,
                }
                setLotTarget({
                  customerId: row.original.customerId as string,
                  pointLotId: row.original.pointLotId,
                })
              }}
            >
              {formatCanvasDateTime(row.original.issuedAt)}
            </Button>
          ) : (
            formatCanvasDateTime(row.original.issuedAt)
          ),
      },
    ],
    [t]
  )
  const closeLotDetails = () => {
    setLotTarget(undefined)
    requestAnimationFrame(() => {
      window.scrollTo({ top: lotReturn.current?.scrollY ?? 0 })
      lotReturn.current?.focus?.focus()
    })
  }
  return (
    <>
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
      <Sheet
        open={Boolean(lotTarget)}
        onOpenChange={(open) => !open && closeLotDetails()}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('Point lot details')}</SheetTitle>
          </SheetHeader>
          {lotTarget ? (
            <div className='p-4'>
              <CustomerRecordDetails
                customerId={lotTarget.customerId}
                target={{ kind: 'lot', id: lotTarget.pointLotId }}
                onOpenOrder={(orderId) => {
                  window.location.assign(
                    activityOrderHref(lotTarget.customerId, orderId)
                  )
                }}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}

function ActivityRecordTable<TData extends { participationId: string }>(props: {
  title: string
  table: CanvasServerTableState
  data: TData[]
  total: number
  columns: ColumnDef<TData, unknown>[]
  loading: boolean
  error: boolean
  onRetry: () => void
  emptyTitle: string
  filteredEmptyTitle: string
  getRowId: (item: TData) => string
  filters: ReactNode
  hasActiveFilters: boolean
  onReset: () => void
}) {
  return (
    <div className='space-y-3 border-t pt-4'>
      <h3 className='font-medium'>{props.title}</h3>
      <CanvasServerTable
        data={props.data}
        columns={props.columns}
        total={props.total}
        state={props.table}
        loading={props.loading}
        error={props.error}
        onRetry={props.onRetry}
        emptyTitle={props.emptyTitle}
        filteredEmptyTitle={props.filteredEmptyTitle}
        getRowId={props.getRowId}
        additionalFilters={props.filters}
        hasActiveFilters={props.hasActiveFilters}
        onResetFilters={props.onReset}
      />
    </div>
  )
}

function StopActivityDialog(props: {
  open: boolean
  activity: Extract<CanvasActivityDetail, { ttlDays: number }>
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const binding =
    props.activity.type === 'RECHARGE_BONUS'
      ? t('recharge codes')
      : t('invite codes')
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Disable activity')}</DialogTitle>
          <DialogDescription>
            {t(
              'New {{binding}} cannot bind this activity. Existing bindings retain their saved entitlement.',
              { binding }
            )}
          </DialogDescription>
        </DialogHeader>
        <p>
          {t('Activity name')}: {props.activity.name}
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
            {t('Confirm disable')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EligibilityBasisSheet(props: {
  activityId: string
  member?: CanvasManualGrantMember
  onClose: () => void
}) {
  const { t } = useTranslation()
  const basis = useQuery({
    queryKey: [
      'canvas-cloud',
      'activity-eligibility-basis',
      props.activityId,
      props.member?.customerId,
    ],
    enabled: Boolean(props.member),
    queryFn: ({ signal }) =>
      getCanvasManualGrantEligibilityBasis(
        props.activityId,
        props.member?.customerId ?? '',
        signal
      ),
  })
  return (
    <Sheet
      open={Boolean(props.member)}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {t('Eligibility basis')}{' '}
            {props.member ? `· ${props.member.customer}` : ''}
          </SheetTitle>
        </SheetHeader>
        <div className='space-y-3 p-4 text-sm'>
          {basis.isPending ? <p>{t('Loading')}</p> : null}
          {basis.isError ? (
            <p role='alert'>{t('Unable to load eligibility basis')}</p>
          ) : null}
          {basis.data ? <EligibilityBasisContent basis={basis.data} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

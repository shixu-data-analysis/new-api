/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useContext, useMemo, useRef, useState } from 'react'
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

import { getCanvasLimitedPriceParticipationTasks } from '../activity-api'
import {
  ActivityRecordNavigationContext,
  activityRecordState,
  activityStatusKey,
} from '../activity-shared'
import type {
  CanvasActivityDetail,
  CanvasLimitedPriceParticipationTaskRecord,
} from '../activity-types'
import { cancelCanvasLimitedPricePromotion } from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import { useServerTableState } from '../use-server-table-state'
import { SelectContent, TokenCategoryCostReferences } from './ActivityShared'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { TaskRecordDetailsSheet } from './TaskRecordDetailsSheet'

function executionStatusKey(value: string): string {
  return `Execution status ${value}`
}

function settlementProgressKey(value: string): string {
  return `Settlement progress ${value}`
}

export function LimitedPriceActivityDetail(props: {
  activity: Extract<CanvasActivityDetail, { billingUnit: string }>
  onBack: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [stopOpen, setStopOpen] = useState(false)
  const stop = useMutation({
    mutationFn: () => cancelCanvasLimitedPricePromotion(props.activity.id),
    onSuccess: () => {
      setStopOpen(false)
      toast.success(t('Activity stopped'))
      void queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'activity', props.activity.id],
      })
      void queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'activities'],
      })
    },
    onError: () => toast.error(t('Unable to stop activity')),
  })
  const active =
    props.activity.status === 'NOT_STARTED' ||
    props.activity.status === 'ACTIVE'
  return (
    <Card className='max-w-3xl'>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle>
            {props.activity.name} ·{' '}
            {t(
              props.activity.status === 'ACTIVE'
                ? 'Activity phase RUNNING'
                : activityStatusKey(props.activity.status)
            )}
          </CardTitle>
          <Button type='button' variant='outline' onClick={props.onBack}>
            {t('Back to activity management')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-4 text-sm'>
        <LimitedPriceSnapshot activity={props.activity} />
        <LimitedPriceTaskRecords activityId={props.activity.id} />
        {active ? (
          <div className='flex justify-end'>
            <Button
              type='button'
              variant='destructive'
              onClick={() => setStopOpen(true)}
            >
              {t('Stop activity')}
            </Button>
          </div>
        ) : null}
        <LimitedPriceStopDialog
          open={stopOpen}
          activity={props.activity}
          pending={stop.isPending}
          onOpenChange={setStopOpen}
          onConfirm={() => stop.mutate()}
        />
      </CardContent>
    </Card>
  )
}

function LimitedPriceStopDialog(props: {
  open: boolean
  activity: Extract<CanvasActivityDetail, { billingUnit: string }>
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const target = props.activity.target
  const specialPrice =
    props.activity.billingUnit === 'MILLION_TOKENS'
      ? Object.entries(props.activity.specialTokenRates ?? {})
          .map(
            ([category, value]) =>
              `${t('{{label}}: ', { label: t(`Token category ${category}`) })}${value}`
          )
          .join(' · ')
      : (props.activity.specialPoints ?? '—')
  const description =
    props.activity.status === 'NOT_STARTED'
      ? t('This activity will no longer take effect.')
      : t(
          'New quotes will use the applicable normal price. Accepted tasks retain their frozen special price.'
        )
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Stop activity')}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className='space-y-2 text-sm'>
          <p>
            {t('{{label}}: ', { label: t('Activity name') })}
            {props.activity.name}
          </p>
          <p>
            {t('{{label}}: ', { label: t('Applicable price') })}
            {target.customerModel.displayNameSnapshot} ·{' '}
            {target.parameterCombination.label ??
              target.parameterCombination.id}{' '}
            · {target.priceGroup.label ?? target.priceGroup.id}
          </p>
          <p>
            {t('{{label}}: ', { label: t('Special price') })}
            {specialPrice}
          </p>
        </div>
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
            {t('Confirm stop')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LimitedPriceSnapshot(props: {
  activity: Extract<CanvasActivityDetail, { billingUnit: string }>
}) {
  const { t } = useTranslation()
  const target = props.activity.target
  const facts = (
    <>
      <p>
        {t('{{label}}: ', { label: t('Applicable price') })}
        {target.customerModel.displayNameSnapshot} ·{' '}
        {target.priceGroup.label ?? target.priceGroup.id} ·{' '}
        {target.parameterCombination.label ?? target.parameterCombination.id}
        {target.parameterCombination.controlEnabled === false && (
          <span className='text-muted-foreground ml-2'>
            {t('Specification disabled')}
          </span>
        )}
      </p>
      <p>
        {t('{{label}}: ', { label: t('Reason') })}
        {props.activity.reason}
      </p>
      <p>
        {t('{{label}}: ', { label: t('Published at') })}
        {props.activity.publishedAt
          ? formatCanvasDateTime(props.activity.publishedAt)
          : '—'}
      </p>
      {props.activity.publisher ? (
        <p>
          {t('{{label}}: ', { label: t('Published by') })}
          {props.activity.publisher.displayName ??
            props.activity.publisher.principalId}
        </p>
      ) : null}
      {props.activity.stoppedAt ? (
        <p>
          {t('{{label}}: ', { label: t('Stopped at') })}
          {formatCanvasDateTime(props.activity.stoppedAt)}
        </p>
      ) : null}
      {props.activity.stoppedBy ? (
        <p>
          {t('{{label}}: ', { label: t('Stopped by') })}
          {props.activity.stoppedBy.displayName ??
            props.activity.stoppedBy.principalId}
        </p>
      ) : null}
    </>
  )
  if (props.activity.billingUnit !== 'MILLION_TOKENS') {
    return (
      <div className='space-y-1'>
        <p>
          {t('{{label}}: ', { label: t('Billing unit') })}
          {t(props.activity.billingUnit)}
        </p>
        {facts}
        <p>
          {t('{{label}}: ', { label: t('Original price') })}
          {props.activity.basePoints ?? '—'} {t('points')}
        </p>
        <p>
          {t('{{label}}: ', { label: t('Special price') })}
          {props.activity.specialPoints ?? '—'} {t('points')}
        </p>
        <p>
          {t('{{label}}: ', { label: t('Activity period') })}
          {formatCanvasDateTime(props.activity.startsAt)} —{' '}
          {formatCanvasDateTime(props.activity.endsAt)}
        </p>
      </div>
    )
  }
  return (
    <div className='space-y-2'>
      <p>{t('Points per million tokens')}</p>
      <TokenCategoryCostReferences
        references={props.activity.tokenCategoryCostReferences}
        historical
      />
      <p>
        {t('{{label}}: ', { label: t('Activity period') })}
        {formatCanvasDateTime(props.activity.startsAt)} —{' '}
        {formatCanvasDateTime(props.activity.endsAt)}
      </p>
      {facts}
    </div>
  )
}

function LimitedPriceTaskRecords(props: { activityId: string }) {
  const { t } = useTranslation()
  const navigation = useContext(ActivityRecordNavigationContext)
  const restored = activityRecordState<{
    search?: string
    pageIndex?: number
    pageSize?: number
    task?: string
    customer?: string
    executionStatus?: string
    settlementProgress?: string
    acceptedFrom?: string
    acceptedTo?: string
    sortId?: 'customer' | 'taskId' | 'executionStatus' | 'settledPoints'
    sortDesc?: boolean
  }>(navigation?.recordState, 'limited-price')
  const table = useServerTableState<'customer'>('customer', restored?.search)
  const [task, setTask] = useState(restored?.task ?? '')
  const [customer, setCustomer] = useState(restored?.customer ?? '')
  const [executionStatus, setExecutionStatus] = useState(
    restored?.executionStatus ?? ''
  )
  const [settlementProgress, setSettlementProgress] = useState(
    restored?.settlementProgress ?? ''
  )
  const [acceptedFrom, setAcceptedFrom] = useState<Date | undefined>(
    restored?.acceptedFrom ? new Date(restored.acceptedFrom) : undefined
  )
  const [acceptedTo, setAcceptedTo] = useState<Date | undefined>(
    restored?.acceptedTo ? new Date(restored.acceptedTo) : undefined
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
      kind: 'limited-price',
      search: table.search,
      pageIndex: table.pagination.pageIndex,
      pageSize: table.pagination.pageSize,
      sortId: table.query.sortBy,
      sortDesc: table.query.sortOrder === 'desc',
      task,
      customer,
      executionStatus,
      settlementProgress,
      ...(acceptedFrom ? { acceptedFrom: acceptedFrom.toISOString() } : {}),
      ...(acceptedTo ? { acceptedTo: acceptedTo.toISOString() } : {}),
    })
  }, [
    acceptedFrom,
    acceptedTo,
    customer,
    executionStatus,
    navigation,
    settlementProgress,
    table.pagination.pageIndex,
    table.pagination.pageSize,
    table.search,
    task,
    table.query.sortBy,
    table.query.sortOrder,
  ])
  const [target, setTarget] =
    useState<CanvasLimitedPriceParticipationTaskRecord>()
  const records = useQuery({
    queryKey: [
      'canvas-cloud',
      'activity-limited-price-tasks',
      props.activityId,
      table.query.page,
      table.query.pageSize,
      table.query.sortBy,
      table.query.sortOrder,
      task,
      customer,
      executionStatus,
      settlementProgress,
      acceptedFrom?.toISOString(),
      acceptedTo?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasLimitedPriceParticipationTasks(
        props.activityId,
        {
          page: table.query.page,
          pageSize: table.query.pageSize,
          sortBy: table.query.sortBy,
          sortOrder: table.query.sortOrder,
          ...(task.trim() ? { task: task.trim() } : {}),
          ...(customer.trim() ? { customer: customer.trim() } : {}),
          ...(executionStatus ? { executionStatus } : {}),
          ...(settlementProgress ? { settlementProgress } : {}),
          ...(acceptedFrom ? { acceptedFrom: acceptedFrom.toISOString() } : {}),
          ...(acceptedTo ? { acceptedTo: acceptedTo.toISOString() } : {}),
        },
        signal
      ),
    enabled: isCanvasDateRangeValid(acceptedFrom, acceptedTo),
    placeholderData: (previous) => previous,
  })
  const columns = useMemo<
    ColumnDef<CanvasLimitedPriceParticipationTaskRecord, unknown>[]
  >(
    () => [
      {
        id: 'customer',
        accessorKey: 'customer',
        meta: { label: t('Customer') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Customer')} />
        ),
        cell: ({ row }) => row.original.customer ?? row.original.customerId,
      },
      {
        id: 'taskId',
        accessorKey: 'taskId',
        meta: { label: t('Task') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Task')} />
        ),
        cell: ({ row }) =>
          row.original.taskId ? (
            <Button
              type='button'
              variant='link'
              className='h-auto p-0 font-mono'
              onClick={() => setTarget(row.original)}
            >
              {row.original.taskId}
            </Button>
          ) : (
            '—'
          ),
      },
      {
        id: 'executionStatus',
        accessorKey: 'executionStatus',
        meta: { label: t('Execution status') },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Execution status')}
          />
        ),
        cell: ({ row }) =>
          row.original.executionStatus
            ? t(executionStatusKey(row.original.executionStatus))
            : '—',
      },
      {
        id: 'settledPoints',
        accessorKey: 'settledPoints',
        meta: { label: t('Settled points') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Settled points')} />
        ),
        cell: ({ row }) => row.original.settledPoints ?? '—',
      },
    ],
    [t]
  )
  return (
    <>
      <div className='space-y-3 border-t pt-4'>
        <h3 className='font-medium'>{t('Participation tasks')}</h3>
        <CanvasServerTable
          data={records.data?.items ?? []}
          columns={columns}
          total={records.data?.total ?? 0}
          state={table}
          loading={records.isPending || records.isFetching}
          error={records.isError}
          onRetry={() => void records.refetch()}
          emptyTitle={t('No participation tasks')}
          filteredEmptyTitle={t(
            'No participation tasks match the current filters'
          )}
          getRowId={(item) => item.participationId}
          additionalFilters={
            <>
              <DataTableColumnFilterField label={t('Task')}>
                <Input
                  value={task}
                  onChange={(event) => {
                    setTask(event.target.value)
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
              <DataTableColumnFilterField label={t('Execution status')}>
                <Select
                  value={executionStatus || 'ALL'}
                  onValueChange={(value) => {
                    setExecutionStatus(value === 'ALL' ? '' : (value ?? ''))
                    resetPage()
                  }}
                >
                  <SelectTrigger
                    className='w-full min-w-0'
                    aria-label={t('Execution status')}
                  >
                    <CanvasLocalizedSelectValue
                      value={executionStatus}
                      valueLabelKey={
                        executionStatus
                          ? executionStatusKey(executionStatus)
                          : undefined
                      }
                      emptyLabelKey='All statuses'
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                    {[
                      'ACCEPTED',
                      'PROCESSING',
                      'SUCCEEDED',
                      'CONFIRMED_FAILED',
                      'UNKNOWN',
                    ].map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(executionStatusKey(value))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DataTableColumnFilterField>
              <DataTableColumnFilterField label={t('Settlement progress')}>
                <Select
                  value={settlementProgress || 'ALL'}
                  onValueChange={(value) => {
                    setSettlementProgress(value === 'ALL' ? '' : (value ?? ''))
                    resetPage()
                  }}
                >
                  <SelectTrigger
                    className='w-full min-w-0'
                    aria-label={t('Settlement progress')}
                  >
                    <CanvasLocalizedSelectValue
                      value={settlementProgress}
                      valueLabelKey={
                        settlementProgress
                          ? settlementProgressKey(settlementProgress)
                          : undefined
                      }
                      emptyLabelKey='All statuses'
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                    {[
                      'FROZEN',
                      'SETTLED',
                      'RELEASED_FAILED',
                      'RELEASED_TIMEOUT',
                    ].map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(settlementProgressKey(value))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DataTableColumnFilterField>
              <DataTableColumnFilterField
                label={t('Accepted at')}
                className='sm:col-span-2'
              >
                <CanvasDateRangeFilter
                  from={acceptedFrom}
                  to={acceptedTo}
                  onFromChange={(value) => {
                    setAcceptedFrom(value)
                    resetPage()
                  }}
                  onToChange={(value) => {
                    setAcceptedTo(value)
                    resetPage()
                  }}
                />
              </DataTableColumnFilterField>
            </>
          }
          hasActiveFilters={Boolean(
            task ||
            customer ||
            executionStatus ||
            settlementProgress ||
            acceptedFrom ||
            acceptedTo
          )}
          onResetFilters={() => {
            setTask('')
            setCustomer('')
            setExecutionStatus('')
            setSettlementProgress('')
            setAcceptedFrom(undefined)
            setAcceptedTo(undefined)
            resetPage()
          }}
        />
      </div>
      <TaskRecordDetailsSheet
        taskId={target?.taskId ?? undefined}
        onClose={() => setTarget(undefined)}
      />
    </>
  )
}

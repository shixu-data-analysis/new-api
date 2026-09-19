/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Rectangle,
  type BarShapeProps,
  XAxis,
  YAxis,
} from 'recharts'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'
import {
  getServerErrorMessageKey,
  getServerErrorStatus,
} from '@/lib/server-error-message'

import {
  getCanvasAdminTaskLogs,
  getCanvasModelMonitoring,
  getCanvasModelMonitoringControls,
  getCanvasModelMonitoringTargets,
} from '../api'
import { canvasBusinessTermConfig } from '../business-terms'
import { formatCanvasDateTime } from '../formatters'
import { getLocalizedErrorMessage } from '../localized-error-message'
import {
  modelDisableReasons,
  modelEnableReasons,
  modelMonitoringReasonLabels,
} from '../model-monitoring-control'
import type {
  CanvasAdminTaskLog,
  CanvasAdminTaskLogQuery,
  CanvasModelMonitoring,
  CanvasModelMonitoringControlRecord,
  CanvasModelMonitoringWindow,
  CanvasTaskOutputSummary,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTerm } from './BusinessTerm'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasServerTable } from './CanvasServerTable'
import { CanvasStatusBadge } from './CanvasStatusBadge'
import { CopyableText } from './CopyableText'
import { executionTargetLabel } from './execution-target-label'
import { ExecutionTargetCoverage } from './ExecutionTargetCoverage'
import { ModelControlDialog } from './ModelControlDialog'
import { TaskRecordDetailsSheet } from './TaskRecordDetailsSheet'

const windowLabels: Record<CanvasModelMonitoringWindow, string> = {
  hour: 'Last hour',
  day: 'Last 24 hours',
  week: 'Last 7 days',
  month: 'Last 30 days',
  custom: 'Custom range',
  round: 'Since latest enablement',
}
const controlActionLabels: Record<string, string> = {
  DISABLE: 'Disable model',
  ENABLE: 'Restore model',
}
const blockingReasonLabels: Record<string, string> = {
  MANUALLY_DISABLED: 'Model manually disabled',
  MODEL_UNAVAILABLE: 'Model unavailable',
  PROVIDER_UNAVAILABLE: 'Provider unavailable',
  INTERNAL_ROUTING_UNAVAILABLE: 'Internal routing unavailable',
}

function taskExecutionStatusLabel(status: string) {
  return (
    canvasBusinessTermConfig.taskExecutionStatus.labels[
      status as keyof typeof canvasBusinessTermConfig.taskExecutionStatus.labels
    ] ?? 'Unknown'
  )
}

function hasPositiveRange(from?: Date, to?: Date, limit?: number) {
  return Boolean(
    from &&
    to &&
    Number.isFinite(+from) &&
    Number.isFinite(+to) &&
    +to > +from &&
    (limit === undefined || +to - +from <= limit)
  )
}
function MonitoringStat(props: { label: string; value: string | number }) {
  return (
    <div className='rounded-lg border p-3'>
      <dt className='text-muted-foreground text-sm'>{props.label}</dt>
      <dd className='mt-1 text-lg font-semibold tabular-nums'>{props.value}</dd>
    </div>
  )
}

type MonitoringTrendBucket = CanvasModelMonitoring['trend'][number] & {
  label: string
  successRateLabel: string
}

function formatMonitoringPercent(
  value: number | null,
  language: string,
  t: (key: string) => string
) {
  if (value === null) return t('No data')
  return new Intl.NumberFormat(toIntlLocale(language), {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatMonitoringDateTime(value: string, language: string) {
  return new Intl.DateTimeFormat(toIntlLocale(language), {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function buildMonitoringTrend(
  data: CanvasModelMonitoring,
  language: string,
  t: (key: string) => string
): MonitoringTrendBucket[] {
  const bucketsByStart = new Map(
    data.trend.map((bucket) => [Date.parse(bucket.from), bucket])
  )
  const rangeStart = Date.parse(data.from)
  const rangeEnd = Date.parse(data.to)
  const bucketMilliseconds = data.bucketSeconds * 1000
  const hasValidRange =
    Number.isFinite(rangeStart) &&
    Number.isFinite(rangeEnd) &&
    rangeEnd > rangeStart &&
    Number.isFinite(bucketMilliseconds) &&
    bucketMilliseconds > 0

  const rawTrend = hasValidRange
    ? Array.from(
        { length: Math.ceil((rangeEnd - rangeStart) / bucketMilliseconds) },
        (_, index) => {
          const from = rangeStart + index * bucketMilliseconds
          const to = Math.min(from + bucketMilliseconds, rangeEnd)
          return (
            bucketsByStart.get(from) ?? {
              from: new Date(from).toISOString(),
              to: new Date(to).toISOString(),
              succeeded: 0,
              failed: 0,
              unknown: 0,
              processing: 0,
              resultCount: 0,
              sampleCount: 0,
              successRate: null,
            }
          )
        }
      )
    : data.trend

  return rawTrend.map((bucket) => ({
    ...bucket,
    label: formatMonitoringDateTime(bucket.from, language),
    successRateLabel: formatMonitoringPercent(bucket.successRate, language, t),
  }))
}

function monitoringTrendTooltipText(
  bucket: MonitoringTrendBucket,
  t: (key: string) => string,
  language: string
) {
  return `${formatMonitoringDateTime(bucket.from, language)} — ${formatMonitoringDateTime(bucket.to, language)} · ${t('Success rate')} ${bucket.successRateLabel} · ${t('Successful results')} ${bucket.succeeded} · ${t('Confirmed failures')} ${bucket.failed} · ${t('Unknown outcomes')} ${bucket.unknown} · ${t('Processing')} ${bucket.processing}`
}

type TrendTooltipAnchor = { left: number; top: number }

type TrendTooltipSelection = {
  anchor: TrendTooltipAnchor
  index: number
}

type TrendRect = {
  height: number
  left: number
  top: number
  width: number
}

function getTrendTooltipAnchor(
  container: Pick<TrendRect, 'left' | 'top'>,
  target: TrendRect,
  bucketSegments: TrendRect[]
): TrendTooltipAnchor {
  return {
    left: target.left - container.left + target.width / 2,
    top:
      Math.min(...bucketSegments.map((segment) => segment.top)) - container.top,
  }
}

function getTrendBarIndex(props: Pick<BarShapeProps, 'originalDataIndex'>) {
  return props.originalDataIndex
}

function hasPositiveTrendBarValue(value: BarShapeProps['value']) {
  return Array.isArray(value) ? value[1] - value[0] > 0 : value > 0
}

function MonitoringTrendBarShape(props: BarShapeProps) {
  const hasPositiveValue = hasPositiveTrendBarValue(props.value)
  const height = props.height === 0 ? 1 : props.height
  const y = props.height === 0 ? props.y - 1 : props.y

  return (
    <Rectangle
      {...props}
      data-trend-index={getTrendBarIndex(props)}
      data-trend-populated={hasPositiveValue ? 'true' : 'false'}
      fill={props.height === 0 ? 'transparent' : props.fill}
      height={height}
      y={y}
    />
  )
}

function MonitoringTrendTooltip(props: {
  bucket: MonitoringTrendBucket
  anchor: TrendTooltipAnchor
  language: string
  t: (key: string) => string
}) {
  return (
    <div
      className='border-border/50 bg-background pointer-events-none absolute z-10 max-w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl'
      role='status'
      style={{ left: props.anchor.left, top: props.anchor.top }}
    >
      {monitoringTrendTooltipText(props.bucket, props.t, props.language)}
    </div>
  )
}

function outputFacts(
  outputs: CanvasTaskOutputSummary[],
  t: (key: string) => string,
  language: string
) {
  if (!outputs.length) return t('No result details')
  return outputs
    .map((output) => {
      const reason = getLocalizedErrorMessage(output.error, language)
      const status = t(taskExecutionStatusLabel(output.executionStatus))
      return `${t('Result')} ${output.outputIndex + 1}: ${status}${reason ? `\n${reason}` : ''}`
    })
    .join('; ')
}
function errorTitle(error: unknown, t: (key: string) => string) {
  const key = getServerErrorMessageKey(error)
  const status = getServerErrorStatus(error)
  if (status === 401 || status === 403 || key === 'UNAUTHORIZED') {
    return t('You are not allowed to view this model monitoring.')
  }
  if (status === 404 || key === 'NOT_FOUND') {
    return t('The requested model was not found or is unavailable.')
  }
  return t('Model monitoring could not be loaded')
}

export function ModelMonitoring(props: {
  modelId: string
  executionTargetId: string
  onBack: () => void
  onSelectTarget: (executionTargetId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const [rangeWindow, setRangeWindow] =
    useState<CanvasModelMonitoringWindow>('day')
  const [origin, setOrigin] = useState<'REAL' | 'MOCK'>('REAL')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const [controlOpen, setControlOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string>()
  const [trendTooltipSelection, setTrendTooltipSelection] =
    useState<TrendTooltipSelection>()
  const trigger = useRef<HTMLButtonElement | null>(null)
  const scrollY = useRef(0)
  const trendInteraction = useRef<HTMLDivElement | null>(null)
  const taskState =
    useServerTableState<CanvasAdminTaskLogQuery['sortBy']>('acceptedAt')
  const controlState = useServerTableState<
    'occurredAt' | 'version' | 'action' | 'reason' | 'actor'
  >('occurredAt')
  const { setPagination: setTaskPagination } = taskState
  const { setPagination: setControlPagination } = controlState
  const [taskId, setTaskId] = useState('')
  const [taskStatus, setTaskStatus] = useState('')
  const [controlAction, setControlAction] = useState<'DISABLE' | 'ENABLE' | ''>(
    ''
  )
  const [controlActor, setControlActor] = useState('')
  const [controlReason, setControlReason] = useState('')
  const [controlFrom, setControlFrom] = useState<Date>()
  const [controlTo, setControlTo] = useState<Date>()
  const debouncedTaskId = useDebounce(taskId.trim(), 300)
  const debouncedActor = useDebounce(controlActor.trim(), 300)
  const monitoringRangeValid =
    rangeWindow !== 'custom' || hasPositiveRange(from, to, 30 * 86400000)
  const controlsRangeValid =
    !controlFrom && !controlTo ? true : hasPositiveRange(controlFrom, controlTo)
  const monitoring = useQuery({
    queryKey: [
      'canvas-cloud',
      'model-monitoring',
      props.modelId,
      props.executionTargetId,
      rangeWindow,
      origin,
      from?.toISOString(),
      to?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasModelMonitoring(
        props.modelId,
        props.executionTargetId,
        {
          window: rangeWindow,
          origin,
          ...(rangeWindow === 'custom' && from && to
            ? { from: from.toISOString(), to: to.toISOString() }
            : {}),
        },
        signal
      ),
    enabled: monitoringRangeValid,
  })
  const targets = useQuery({
    queryKey: ['canvas-cloud', 'model-monitoring-targets', props.modelId],
    queryFn: ({ signal }) =>
      getCanvasModelMonitoringTargets(props.modelId, signal),
  })
  const monitoringModelMatches =
    monitoring.data?.customerModel.id === props.modelId
  const tasks = useQuery({
    queryKey: [
      'canvas-cloud',
      'model-monitoring-tasks',
      props.modelId,
      props.executionTargetId,
      monitoring.data?.from,
      monitoring.data?.to,
      origin,
      taskState.query,
      debouncedTaskId,
      taskStatus,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminTaskLogs(
        {
          page: taskState.query.page,
          pageSize: taskState.query.pageSize,
          sortBy: taskState.query.sortBy,
          sortOrder: taskState.query.sortOrder,
          modelId: props.modelId,
          executionTargetId: props.executionTargetId,
          executionOrigin: origin,
          from: monitoring.data?.from,
          to: monitoring.data?.to,
          ...(debouncedTaskId ? { taskId: debouncedTaskId } : {}),
          ...(taskStatus ? { derivedExecutionStatus: taskStatus } : {}),
        },
        signal
      ),
    enabled: Boolean(
      monitoringModelMatches && monitoring.data?.from && monitoring.data?.to
    ),
    placeholderData: (previous) => previous,
  })
  const controls = useQuery({
    queryKey: [
      'canvas-cloud',
      'model-monitoring-controls',
      props.modelId,
      props.executionTargetId,
      controlState.query,
      controlAction,
      debouncedActor,
      controlReason,
      controlFrom?.toISOString(),
      controlTo?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasModelMonitoringControls(
        props.modelId,
        props.executionTargetId,
        {
          page: controlState.query.page,
          pageSize: controlState.query.pageSize,
          sortBy: controlState.query.sortBy,
          sortOrder: controlState.query.sortOrder,
          ...(controlAction ? { action: controlAction } : {}),
          ...(debouncedActor ? { actor: debouncedActor } : {}),
          ...(controlReason ? { reasonCode: controlReason } : {}),
          ...(controlFrom ? { from: controlFrom.toISOString() } : {}),
          ...(controlTo ? { to: controlTo.toISOString() } : {}),
        },
        signal
      ),
    enabled: Boolean(monitoringModelMatches && controlsRangeValid),
    placeholderData: (previous) => previous,
  })
  useEffect(() => {
    setTaskPagination((value) => ({ ...value, pageIndex: 0 }))
  }, [from, origin, rangeWindow, setTaskPagination, to])
  useEffect(() => {
    setTaskPagination((value) => ({ ...value, pageIndex: 0 }))
  }, [debouncedTaskId, setTaskPagination, taskStatus])
  useEffect(() => {
    setControlPagination((value) => ({ ...value, pageIndex: 0 }))
  }, [
    controlAction,
    controlFrom,
    controlReason,
    controlTo,
    debouncedActor,
    setControlPagination,
  ])
  const language = i18n.resolvedLanguage ?? i18n.language
  const percent = (value: number | null) =>
    formatMonitoringPercent(value, language, t)
  const trend = useMemo(
    () =>
      monitoring.data ? buildMonitoringTrend(monitoring.data, language, t) : [],
    [language, monitoring.data, t]
  )
  const activeTrendBucket =
    trendTooltipSelection === undefined
      ? undefined
      : trend[trendTooltipSelection.index]
  const selectTrendBucket = (index: number, target: Element) => {
    const container = trendInteraction.current
    if (!container || !trend[index]) return

    const bucketSegmentElements = [
      ...container.querySelectorAll<Element>(`[data-trend-index="${index}"]`),
    ]
    const populatedSegmentElements = bucketSegmentElements.filter(
      (segment) => segment.getAttribute('data-trend-populated') === 'true'
    )
    const bucketSegments = (
      populatedSegmentElements.length
        ? populatedSegmentElements
        : bucketSegmentElements
    ).map((segment) => segment.getBoundingClientRect())
    if (!bucketSegments.length) return

    setTrendTooltipSelection({
      anchor: getTrendTooltipAnchor(
        container.getBoundingClientRect(),
        target.getBoundingClientRect(),
        bucketSegments
      ),
      index,
    })
  }
  const selectTrendBucketFromTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false
    const segment = target.closest('[data-trend-index]')
    const index = Number(segment?.getAttribute('data-trend-index'))
    if (!segment || !Number.isInteger(index)) return false

    selectTrendBucket(index, segment)
    return true
  }
  const selectTrendBucketFromKeyboard = (index: number) => {
    const container = trendInteraction.current
    const segment = container?.querySelector<Element>(
      `[data-trend-index="${index}"]`
    )
    if (!segment) return

    selectTrendBucket(index, segment)
  }
  useEffect(() => {
    setTrendTooltipSelection(undefined)
  }, [origin, props.executionTargetId, monitoring.data, monitoring.data?.trend])
  useEffect(() => {
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (!trendInteraction.current?.contains(event.target as Node)) {
        setTrendTooltipSelection(undefined)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointerDown)
    return () =>
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown)
  }, [])
  const taskColumns = useMemo<ColumnDef<CanvasAdminTaskLog, unknown>[]>(
    () => [
      {
        id: 'taskId',
        accessorKey: 'id',
        meta: { label: t('Task') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Task')} />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-0 items-center gap-1'>
            <button
              ref={(node) => {
                if (node && row.original.id === selectedTaskId) {
                  trigger.current = node
                }
              }}
              type='button'
              className='text-primary min-w-0 text-start break-all underline underline-offset-4'
              onClick={(event) => {
                trigger.current = event.currentTarget
                scrollY.current = window.scrollY
                setSelectedTaskId(row.original.id)
              }}
            >
              {row.original.id}
            </button>
            <CopyableText value={row.original.id} hideValue />
          </div>
        ),
      },
      {
        id: 'derivedExecutionStatus',
        accessorKey: 'derivedExecutionStatus',
        meta: { label: t('Execution status') },
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Execution status')}
          />
        ),
        cell: ({ row }) => (
          <BusinessTerm
            kind='taskExecutionStatus'
            value={row.original.derivedExecutionStatus}
          />
        ),
      },
      {
        id: 'outputs',
        accessorKey: 'outputSummaries',
        enableSorting: false,
        meta: { label: t('Result details') },
        header: t('Result details'),
        cell: ({ row }) => (
          <span className='block max-w-xs text-sm break-words whitespace-pre-line'>
            {outputFacts(
              row.original.outputSummaries,
              t,
              i18n.resolvedLanguage ?? i18n.language
            )}
          </span>
        ),
      },
      {
        id: 'acceptedAt',
        accessorKey: 'acceptedAt',
        meta: { label: t('Accepted at') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Accepted at')} />
        ),
        cell: ({ row }) => formatCanvasDateTime(row.original.acceptedAt),
      },
    ],
    [i18n.language, i18n.resolvedLanguage, selectedTaskId, t]
  )
  const controlColumns = useMemo<
    ColumnDef<CanvasModelMonitoringControlRecord, unknown>[]
  >(
    () => [
      {
        id: 'occurredAt',
        accessorKey: 'occurredAt',
        meta: { label: t('Time') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Time')} />
        ),
        cell: ({ row }) => formatCanvasDateTime(row.original.occurredAt),
      },
      {
        id: 'version',
        accessorKey: 'version',
        meta: { label: t('Version') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Version')} />
        ),
      },
      {
        id: 'actor',
        accessorKey: 'actor',
        meta: { label: t('Operator') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Operator')} />
        ),
        cell: ({ row }) =>
          row.original.actor.name ??
          row.original.actor.userId ??
          t('Not recorded'),
      },
      {
        id: 'action',
        accessorKey: 'action',
        meta: { label: t('Action') },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Action')} />
        ),
        cell: ({ row }) =>
          t(controlActionLabels[row.original.action] ?? 'Unknown'),
      },
      {
        id: 'reason',
        accessorKey: 'reasonCode',
        enableSorting: false,
        meta: { label: t('Reason') },
        header: t('Reason'),
        cell: ({ row }) => (
          <div className='space-y-1 break-words whitespace-normal'>
            <span>
              {row.original.reasonCode
                ? t(
                    modelMonitoringReasonLabels[row.original.reasonCode] ??
                      'Other'
                  )
                : (row.original.legacyReason ?? t('Not recorded'))}
            </span>
            {row.original.note ? (
              <p className='text-muted-foreground text-sm'>
                {row.original.note}
              </p>
            ) : null}
          </div>
        ),
      },
    ],
    [t]
  )
  const data = monitoring.data
  let controlReasons: readonly string[] = []
  if (controlAction === 'ENABLE') {
    controlReasons = modelEnableReasons
  } else if (controlAction === 'DISABLE') {
    controlReasons = modelDisableReasons
  }
  if (monitoring.isError) {
    return (
      <ErrorState
        title={errorTitle(monitoring.error, t)}
        onRetry={() => void monitoring.refetch()}
      />
    )
  }
  if (data && !monitoringModelMatches) {
    return <ErrorState title={t('Invalid model monitoring target')} />
  }
  return (
    <div className='space-y-6'>
      <div className='flex min-w-0 flex-col gap-2'>
        <Button className='w-fit' variant='outline' onClick={props.onBack}>
          {t('Back to model list')}
        </Button>
        {data ? (
          <div className='space-y-1'>
            <h2 className='max-w-full min-w-0 font-medium break-words'>
              {data.customerModel.name}
            </h2>
            <p className='text-muted-foreground text-sm'>
              {t('Model provider')}: {data.customerModel.providerName}
            </p>
          </div>
        ) : null}
      </div>
      {data ? (
        <section className='space-y-3' aria-label={t('Monitoring target')}>
          <div className='flex flex-wrap items-center gap-3'>
            <p className='text-sm font-medium'>
              {t('Monitoring target')}:{' '}
              {executionTargetLabel(data.executionTarget, t)}
            </p>
            {targets.data && targets.data.targets.length > 1 ? (
              <div className='flex items-center gap-2'>
                <Label htmlFor='model-monitoring-target'>
                  {t('Switch monitoring target')}
                </Label>
                <NativeSelect
                  id='model-monitoring-target'
                  value={props.executionTargetId}
                  onChange={(event) => props.onSelectTarget(event.target.value)}
                >
                  {targets.data.targets.map((target) => (
                    <NativeSelectOption key={target.id} value={target.id}>
                      {executionTargetLabel(target, t)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
          </div>
          <div className='space-y-1'>
            <h3 className='text-sm font-medium'>
              {t('Price plans and customer visibility')}
            </h3>
            <ExecutionTargetCoverage
              coverage={data.executionTarget.pricingCoverage}
              parameterCombinations={data.executionTarget.parameterCombinations}
            />
          </div>
          {targets.isError ? (
            <p role='alert' className='text-destructive text-sm'>
              {t('Unable to load execution targets')}
            </p>
          ) : null}
        </section>
      ) : null}
      {!data && targets.isError ? (
        <p role='alert' className='text-destructive text-sm'>
          {t('Unable to load execution targets')}
        </p>
      ) : null}
      {data ? (
        <section
          className='flex flex-wrap items-center gap-2 rounded-md border p-3'
          aria-label={t('Runtime status')}
        >
          <span className='text-sm font-medium'>{t('Runtime status')}</span>
          <CanvasStatusBadge
            status={data.effectiveEnabled ? 'ACTIVE' : 'DISABLED'}
            label={data.effectiveEnabled ? t('Available') : t('Unavailable')}
          />
          <span className='text-muted-foreground text-sm'>
            {t('Manual control')}:{' '}
            {data.manualEnabled ? t('Enabled') : t('Disabled')}
          </span>
          {data.blockingReasons.map((reason) => (
            <span className='text-muted-foreground text-sm' key={reason}>
              {t(blockingReasonLabels[reason] ?? 'Unavailable')}
            </span>
          ))}
          <Button
            className='sm:ms-auto'
            variant={data.manualEnabled ? 'destructive' : 'default'}
            onClick={() => setControlOpen(true)}
          >
            {data.manualEnabled ? t('Disable model') : t('Restore model')}
          </Button>
        </section>
      ) : null}
      <section
        className='space-y-4'
        aria-label={t('Model monitoring statistics')}
      >
        <div className='flex flex-wrap items-end gap-3'>
          <div className='space-y-1'>
            <Label htmlFor='model-monitoring-window'>{t('Time range')}</Label>
            <NativeSelect
              id='model-monitoring-window'
              value={rangeWindow}
              onChange={(event) =>
                setRangeWindow(
                  event.target.value as CanvasModelMonitoringWindow
                )
              }
            >
              {Object.entries(windowLabels).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {t(label)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className='space-y-1'>
            <Label htmlFor='model-monitoring-origin'>
              {t('Execution source')}
            </Label>
            <NativeSelect
              id='model-monitoring-origin'
              value={origin}
              onChange={(event) =>
                setOrigin(event.target.value as 'REAL' | 'MOCK')
              }
            >
              <NativeSelectOption value='REAL'>
                {t('Real calls')}
              </NativeSelectOption>
              <NativeSelectOption value='MOCK'>
                {t('Mock calls')}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          {rangeWindow === 'custom' ? (
            <div className='space-y-1'>
              <CanvasDateRangeFilter
                from={from}
                to={to}
                onFromChange={setFrom}
                onToChange={setTo}
              />
              {!monitoringRangeValid ? (
                <p role='alert' className='text-destructive text-sm'>
                  {t('Select a positive time range of at most 30 days')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {data ? (
          <>
            <div className='text-muted-foreground text-sm'>
              {t('Statistics range')}: {formatCanvasDateTime(data.from)} —{' '}
              {formatCanvasDateTime(data.to)} ·{' '}
              {data.origin === 'REAL' ? t('Real calls') : t('Mock calls')}
              {data.window === 'round'
                ? ` · ${t('Since latest enablement')}: ${formatCanvasDateTime(data.roundStartedAt)}`
                : ''}
            </div>
            <dl className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'>
              <MonitoringStat
                label={t('Success rate')}
                value={percent(data.summary.successRate)}
              />
              <MonitoringStat
                label={t('Successful results')}
                value={data.summary.succeeded}
              />
              <MonitoringStat
                label={t('Confirmed failures')}
                value={data.summary.failed}
              />
              <MonitoringStat
                label={t('Unknown outcomes')}
                value={data.summary.unknown}
              />
              <MonitoringStat
                label={t('Processing')}
                value={data.summary.processing}
              />
            </dl>
          </>
        ) : (
          <p>{t('Loading model monitoring...')}</p>
        )}
      </section>
      {data ? (
        <div className='grid gap-6 lg:grid-cols-3'>
          <section
            className='min-w-0 space-y-3 lg:col-span-2'
            aria-label={t('Runtime trend')}
          >
            <h3 className='font-medium'>{t('Runtime trend')}</h3>
            {data.trend.length ? (
              <div
                ref={trendInteraction}
                aria-label={t('Runtime trend')}
                className='focus-visible:ring-ring relative focus-visible:ring-2 focus-visible:outline-none'
                onBlur={() => setTrendTooltipSelection(undefined)}
                onFocus={() => selectTrendBucketFromKeyboard(0)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setTrendTooltipSelection(undefined)
                    return
                  }
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                    return
                  }

                  event.preventDefault()
                  const current = trendTooltipSelection?.index ?? 0
                  const offset = event.key === 'ArrowLeft' ? -1 : 1
                  selectTrendBucketFromKeyboard(
                    Math.max(0, Math.min(trend.length - 1, current + offset))
                  )
                }}
                onMouseLeave={() => setTrendTooltipSelection(undefined)}
                onMouseMove={(event) => {
                  if (!selectTrendBucketFromTarget(event.target)) {
                    setTrendTooltipSelection(undefined)
                  }
                }}
                onPointerDown={(event) => {
                  if (!selectTrendBucketFromTarget(event.target)) {
                    setTrendTooltipSelection(undefined)
                  }
                }}
                role='application'
                tabIndex={0}
              >
                <ChartContainer
                  config={{
                    succeeded: {
                      label: t('Successful results'),
                      color: 'var(--chart-1)',
                    },
                    failed: {
                      label: t('Confirmed failures'),
                      color: 'var(--chart-2)',
                    },
                    unknown: {
                      label: t('Unknown outcomes'),
                      color: 'var(--chart-3)',
                    },
                    processing: {
                      label: t('Processing'),
                      color: 'var(--chart-4)',
                    },
                  }}
                  className='h-72 w-full'
                >
                  <BarChart
                    accessibilityLayer={false}
                    data={trend}
                    maxBarSize={32}
                    margin={{ top: 24, right: 12, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey='label' minTickGap={36} />
                    <YAxis allowDecimals={false} width={36} />
                    <ChartLegend
                      content={<ChartLegendContent />}
                      verticalAlign='top'
                    />
                    <Bar
                      dataKey='succeeded'
                      name={t('Successful results')}
                      shape={MonitoringTrendBarShape}
                      stackId='results'
                      fill='var(--color-succeeded)'
                    />
                    <Bar
                      dataKey='failed'
                      name={t('Confirmed failures')}
                      shape={MonitoringTrendBarShape}
                      stackId='results'
                      fill='var(--color-failed)'
                    />
                    <Bar
                      dataKey='unknown'
                      name={t('Unknown outcomes')}
                      shape={MonitoringTrendBarShape}
                      stackId='results'
                      fill='var(--color-unknown)'
                    />
                    <Bar
                      dataKey='processing'
                      name={t('Processing')}
                      shape={MonitoringTrendBarShape}
                      stackId='results'
                      fill='var(--color-processing)'
                    >
                      <LabelList
                        dataKey='successRateLabel'
                        formatter={(value) =>
                          value === t('No data') ? '' : value
                        }
                        position='top'
                      />
                    </Bar>
                  </BarChart>
                </ChartContainer>
                {activeTrendBucket ? (
                  <MonitoringTrendTooltip
                    bucket={activeTrendBucket}
                    anchor={
                      trendTooltipSelection?.anchor ?? {
                        left: 0,
                        top: 0,
                      }
                    }
                    language={language}
                    t={t}
                  />
                ) : null}
              </div>
            ) : (
              <p className='text-muted-foreground text-sm'>
                {t('No trend data')}
              </p>
            )}
          </section>
          <section className='space-y-3' aria-label={t('Failure reasons')}>
            <h3 className='font-medium'>{t('Failure reasons')}</h3>
            {data.failures.length ? (
              <ul className='space-y-2 text-sm'>
                {data.failures.map((failure) => (
                  <li
                    className='flex justify-between gap-3'
                    key={failure.category}
                  >
                    <span>
                      {t(
                        modelMonitoringReasonLabels[failure.category] ??
                          'Unclassified failure'
                      )}
                    </span>
                    <span className='tabular-nums'>{failure.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className='text-muted-foreground text-sm'>
                {t('No confirmed failures')}
              </p>
            )}
          </section>
        </div>
      ) : null}
      <section className='space-y-3' aria-label={t('Recent tasks')}>
        <h3 className='font-medium'>{t('Recent tasks')}</h3>
        <CanvasServerTable
          data={tasks.data?.items ?? []}
          columns={taskColumns}
          total={tasks.data?.total ?? 0}
          state={taskState}
          loading={tasks.isPending || tasks.isFetching}
          error={tasks.isError}
          errorTitle={t('Unable to load recent tasks')}
          onRetry={() => void tasks.refetch()}
          emptyTitle={t('No recent tasks')}
          filteredEmptyTitle={t('No matching results')}
          additionalFilters={
            <>
              <DataTableColumnFilterField label={t('Task')}>
                <Input
                  value={taskId}
                  placeholder={t('Task')}
                  onChange={(event) => setTaskId(event.target.value)}
                />
              </DataTableColumnFilterField>
              <DataTableColumnFilterField label={t('Execution status')}>
                <NativeSelect
                  value={taskStatus}
                  onChange={(event) => setTaskStatus(event.target.value)}
                >
                  <NativeSelectOption value=''>
                    {t('All execution statuses')}
                  </NativeSelectOption>
                  {[
                    'ACCEPTED',
                    'PROCESSING',
                    'SUCCEEDED',
                    'PARTIAL_SUCCESS',
                    'CONFIRMED_FAILED',
                    'UNKNOWN',
                  ].map((status) => (
                    <NativeSelectOption key={status} value={status}>
                      {t(taskExecutionStatusLabel(status))}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </DataTableColumnFilterField>
            </>
          }
          hasActiveFilters={Boolean(taskId || taskStatus)}
          onResetFilters={() => {
            setTaskId('')
            setTaskStatus('')
          }}
          getRowId={(row) => row.id}
        />
      </section>
      <section className='space-y-3' aria-label={t('Control history')}>
        <h3 className='font-medium'>{t('Control history')}</h3>
        <CanvasServerTable
          data={controls.data?.items ?? []}
          columns={controlColumns}
          total={controls.data?.total ?? 0}
          state={controlState}
          loading={controls.isPending || controls.isFetching}
          error={controls.isError}
          errorTitle={t('Unable to load control history')}
          onRetry={() => void controls.refetch()}
          emptyTitle={t('No control history')}
          filteredEmptyTitle={t('No matching results')}
          additionalFilters={
            <>
              <DataTableColumnFilterField label={t('Action')}>
                <NativeSelect
                  value={controlAction}
                  onChange={(event) => {
                    setControlAction(
                      event.target.value as 'DISABLE' | 'ENABLE' | ''
                    )
                    setControlReason('')
                  }}
                >
                  <NativeSelectOption value=''>
                    {t('All actions')}
                  </NativeSelectOption>
                  <NativeSelectOption value='DISABLE'>
                    {t('Disable model')}
                  </NativeSelectOption>
                  <NativeSelectOption value='ENABLE'>
                    {t('Restore model')}
                  </NativeSelectOption>
                </NativeSelect>
              </DataTableColumnFilterField>
              <DataTableColumnFilterField label={t('Operator')}>
                <Input
                  value={controlActor}
                  placeholder={t('Operator')}
                  onChange={(event) => setControlActor(event.target.value)}
                />
              </DataTableColumnFilterField>
              <DataTableColumnFilterField label={t('Reason')}>
                <NativeSelect
                  disabled={!controlAction}
                  value={controlReason}
                  onChange={(event) => setControlReason(event.target.value)}
                >
                  <NativeSelectOption value=''>
                    {t('All reasons')}
                  </NativeSelectOption>
                  {controlReasons.map((reason) => (
                    <NativeSelectOption key={reason} value={reason}>
                      {t(modelMonitoringReasonLabels[reason])}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </DataTableColumnFilterField>
              <div className='space-y-1'>
                <CanvasDateRangeFilter
                  from={controlFrom}
                  to={controlTo}
                  onFromChange={setControlFrom}
                  onToChange={setControlTo}
                />
                {!controlsRangeValid ? (
                  <p role='alert' className='text-destructive text-sm'>
                    {t('Start time must be before end time')}
                  </p>
                ) : null}
              </div>
            </>
          }
          hasActiveFilters={Boolean(
            controlAction ||
            controlActor ||
            controlReason ||
            controlFrom ||
            controlTo
          )}
          onResetFilters={() => {
            setControlAction('')
            setControlActor('')
            setControlReason('')
            setControlFrom(undefined)
            setControlTo(undefined)
          }}
          getRowId={(row) => row.id}
        />
      </section>
      <TaskRecordDetailsSheet
        taskId={selectedTaskId}
        onClose={() => {
          setSelectedTaskId(undefined)
          requestAnimationFrame(() => {
            window.scrollTo({ top: scrollY.current })
            trigger.current?.focus()
          })
        }}
      />
      {data && controlOpen ? (
        <ModelControlDialog
          monitoring={data}
          onClose={() => setControlOpen(false)}
          onChanged={(enabled) => {
            if (enabled) {
              setRangeWindow('round')
              setFrom(undefined)
              setTo(undefined)
              taskState.setPagination((value) => ({ ...value, pageIndex: 0 }))
            }
            void client.invalidateQueries({
              queryKey: ['canvas-cloud', 'admin-testing-models'],
            })
            void client.invalidateQueries({
              queryKey: [
                'canvas-cloud',
                'model-monitoring',
                props.modelId,
                props.executionTargetId,
              ],
            })
            void client.invalidateQueries({
              queryKey: [
                'canvas-cloud',
                'model-monitoring-targets',
                props.modelId,
              ],
            })
            void client.invalidateQueries({
              queryKey: [
                'canvas-cloud',
                'model-monitoring-tasks',
                props.modelId,
                props.executionTargetId,
              ],
            })
            void client.invalidateQueries({
              queryKey: [
                'canvas-cloud',
                'model-monitoring-controls',
                props.modelId,
                props.executionTargetId,
              ],
            })
          }}
        />
      ) : null}
    </div>
  )
}

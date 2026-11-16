/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import {
  getCanvasAdminTaskLogs,
  getCanvasModelMonitoringFailures,
} from '../api'
import {
  ADMIN_CONFIRMED_UPSTREAM_FAILURE,
  monitoringTickLabelIndexes,
  monitoringVersionSourceLabel,
  taskFailureLabelKey,
} from '../model-monitoring-overview'
import { taskErrorCategoryLabels } from '../task-error-categories'
import type { CanvasModelMonitoringFailures } from '../types'
import {
  formatMonitoringPercent,
  monitoringIntervalText,
} from './model-monitoring-utils'
import { ModelIdentityTooltip } from './ModelIdentityTooltip'
import { MonitoringHint, type ModelMonitoringRow } from './ModelMonitoringList'
import { TaskRecordDetailsSheet } from './TaskRecordDetailsSheet'

const segments = [
  ['succeeded', 'bg-success/70'],
  ['failed', 'bg-destructive'],
  ['pending', 'bg-amber-500'],
  ['processing', 'bg-primary'],
] as const
const segmentLabels = {
  succeeded: 'Successful results',
  failed: 'Confirmed failures',
  pending: 'Results pending confirmation',
  processing: 'Processing',
} as const

type Cause = {
  key: string
  label: string
  hint: string
  count: number
  pending: boolean
}

function failureCauses(
  failures: CanvasModelMonitoringFailures,
  language: string,
  t: (key: string, values?: Record<string, unknown>) => string
): Cause[] {
  const pending: Cause[] = [
    {
      key: 'queryable',
      label: t('Pending · still querying'),
      hint: t(
        'Has a provider task ID; the system keeps querying and it may still succeed\nThe points are released if there is still no result by the deadline'
      ),
      count: failures.pending.queryable,
      pending: true,
    },
    {
      key: 'unqueryable',
      label: t('Pending · cannot be queried'),
      hint: t(
        'No provider task ID after submission; the system no longer queries\nThe points are released at the deadline; the task can be ended in its details'
      ),
      count: failures.pending.unqueryable,
      pending: true,
    },
    {
      key: 'releasedTimeout',
      label: t('Released after timeout'),
      hint: t(
        'No result by the deadline; the system released the points automatically\nResult status UNKNOWN, points status RELEASED_TIMEOUT'
      ),
      count: failures.pending.releasedTimeout,
      pending: true,
    },
    {
      key: 'releasedByAdmin',
      label: t('Released early by an administrator'),
      hint: t(
        'An administrator released the points early in the task details (ending the task included)\nResult status UNKNOWN, points status RELEASED_TIMEOUT\nTold apart by the audit record ADMIN_EARLY_RELEASE'
      ),
      count: failures.pending.releasedByAdmin,
      pending: true,
    },
    {
      key: 'lateSuccess',
      label: t('Succeeded after release (not delivered)'),
      hint: t(
        'The provider reported success after the points were released\nThe result is not delivered to the customer; the cost is a reconciliation timeout loss\nResult status SUCCEEDED, points status RELEASED_TIMEOUT'
      ),
      count: failures.pending.lateSuccess,
      pending: true,
    },
  ]
  const confirmed = failures.causes.map((cause): Cause => {
    let label = t('Unknown error category')
    let hint = t('No error code was recorded')
    if (cause.errorCode === ADMIN_CONFIRMED_UPSTREAM_FAILURE) {
      label = t('Administrator confirmed the upstream failure')
      hint = [
        cause.errorCode,
        t(
          'An administrator confirmed the upstream failure and released the points'
        ),
      ].join('\n')
    } else if (cause.errorCode) {
      label = t(
        taskErrorCategoryLabels[cause.errorCode] ?? 'Unknown error category'
      )
      // An administrator may have overridden the message; the built-in one is what customers see by default.
      const message =
        cause.defaultCustomerMessages?.[language] ??
        cause.defaultCustomerMessages?.en
      hint = message
        ? [
            cause.errorCode,
            t('Customers see by default: {{message}}', { message }),
          ].join('\n')
        : cause.errorCode
    }
    return {
      key: cause.errorCode ?? 'none',
      label,
      hint,
      count: cause.count,
      pending: false,
    }
  })
  return [...pending, ...confirmed]
    .filter((cause) => cause.count > 0)
    .sort((a, b) => b.count - a.count)
}

function yTicks(max: number) {
  const step = 10 ** Math.floor(Math.log10(Math.max(1, max)))
  const tick =
    [1, 2, 5, 10]
      .map((factor) => factor * step)
      .find((value) => max / value <= 4) ?? step * 10
  const top = Math.max(tick, Math.ceil(max / tick) * tick)
  return {
    top,
    ticks: Array.from({ length: top / tick + 1 }, (_, index) => index * tick),
  }
}

function ResultsChart(props: {
  model: ModelMonitoringRow
  versions: CanvasModelMonitoringFailures['versions']
  selectedBucket: number | null
  onSelectBucket: (index: number) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const trend = props.model.trend
  const max = Math.max(
    1,
    ...trend.map((bucket) => bucket.determined + bucket.processing)
  )
  const { top, ticks } = yTicks(max)
  const labels = monitoringTickLabelIndexes(trend.length)
  const start = Date.parse(trend[0]?.from ?? '')
  const span = Date.parse(trend.at(-1)?.to ?? '') - start
  const daily = Date.parse(trend[1]?.from ?? '') - start >= 86400000
  const tickFormat = new Intl.DateTimeFormat(
    toIntlLocale(language),
    daily
      ? { month: 'numeric', day: 'numeric' }
      : { hour: '2-digit', minute: '2-digit' }
  )
  return (
    <div>
      <div className='grid h-40 grid-cols-[2rem_minmax(0,1fr)]'>
        <div className='relative' aria-hidden='true'>
          {ticks.map((value) => (
            <span
              key={value}
              className='text-muted-foreground absolute end-2 translate-y-1/2 text-xs tabular-nums'
              style={{ bottom: `${(value / top) * 100}%` }}
            >
              {value}
            </span>
          ))}
        </div>
        <div
          className='relative border-b'
          role='group'
          aria-label={t('Results by interval')}
        >
          {ticks.map((value) => (
            <div
              key={value}
              aria-hidden='true'
              className='absolute inset-x-0 border-t border-dashed'
              style={{ bottom: `${(value / top) * 100}%` }}
            />
          ))}
          <div className='absolute inset-0 flex items-end'>
            {trend.map((bucket, index) => {
              const text = monitoringIntervalText(bucket, language, t)
              const dimmed =
                props.selectedBucket !== null && props.selectedBucket !== index
              return (
                <MonitoringHint key={bucket.from} hint={text}>
                  <button
                    type='button'
                    aria-label={text.replaceAll('\n', '. ')}
                    aria-pressed={props.selectedBucket === index}
                    className={cn(
                      // Percent padding would follow the chart width, not the interval's, and push the intervals out of the chart.
                      'focus-visible:ring-ring flex h-full min-w-0 flex-1 flex-col-reverse items-center outline-none hover:bg-muted/60 focus-visible:ring-2',
                      props.selectedBucket === index && 'bg-muted',
                      dimmed && 'opacity-40'
                    )}
                    onClick={() => props.onSelectBucket(index)}
                  >
                    {segments.map(([key, color]) =>
                      bucket[key] > 0 ? (
                        <span
                          key={key}
                          aria-hidden='true'
                          className={cn('block w-3/4', color)}
                          style={{
                            height: `${(bucket[key] / top) * 100}%`,
                            minHeight: 2,
                          }}
                        />
                      ) : null
                    )}
                  </button>
                </MonitoringHint>
              )
            })}
          </div>
          {props.versions.map((version) => {
            const left =
              span > 0
                ? ((Date.parse(version.effectiveAt) - start) / span) * 100
                : 0
            if (left < 0 || left > 100) return null
            const hint = [
              t('Version {{version}} took effect {{time}}', {
                version: version.version,
                time: new Intl.DateTimeFormat(toIntlLocale(language), {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(new Date(version.effectiveAt)),
              }),
              t('Source: {{source}}', {
                source: monitoringVersionSourceLabel(t, version.source),
              }),
              version.upstreamChanged
                ? t('Upstream model ID changed: {{ids}}', {
                    ids: version.upstreamModelIds.join(', '),
                  })
                : t('Upstream model ID unchanged'),
              t('Counted together with earlier versions'),
            ].join('\n')
            return (
              <div
                key={version.version}
                className='border-foreground pointer-events-none absolute inset-y-0 border-s border-dashed'
                style={{ left: `${left}%` }}
              >
                <MonitoringHint hint={hint}>
                  <button
                    type='button'
                    className='bg-card pointer-events-auto ms-1 cursor-help px-0.5 text-xs leading-none'
                  >
                    {t('Version {{version}}', { version: version.version })}
                  </button>
                </MonitoringHint>
              </div>
            )
          })}
        </div>
      </div>
      <div className='relative ms-8 h-5' aria-hidden='true'>
        {trend.map((bucket, index) =>
          labels.has(index) ? (
            <span
              key={bucket.from}
              className='text-muted-foreground absolute top-1 -translate-x-1/2 text-xs whitespace-nowrap'
              style={{ left: `${((index + 0.5) / trend.length) * 100}%` }}
            >
              {tickFormat.format(new Date(bucket.from))}
            </span>
          ) : null
        )}
      </div>
      <ul className='text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs'>
        {segments.map(([key, color]) => (
          <li key={key} className='inline-flex items-center gap-1.5'>
            <span
              aria-hidden='true'
              className={cn('size-2.5 rounded-full', color)}
            />
            {t(segmentLabels[key])}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ModelMonitoringDetail(props: {
  model: ModelMonitoringRow
  range: { from: string; to: string }
  rangeLabel: string
  selectedBucket: number | null
  onSelectBucket: (index: number | null) => void
  onControl: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [taskId, setTaskId] = useState<string>()
  const bucket =
    props.selectedBucket === null
      ? null
      : props.model.trend[props.selectedBucket]
  const scope = bucket ? { from: bucket.from, to: bucket.to } : props.range
  const whole = useQuery({
    queryKey: [
      'canvas-cloud',
      'model-monitoring-failures',
      props.model.modelKey,
      props.range.from,
      props.range.to,
    ],
    queryFn: ({ signal }) =>
      getCanvasModelMonitoringFailures(
        props.model.modelKey,
        props.range,
        signal
      ),
  })
  const scoped = useQuery({
    queryKey: [
      'canvas-cloud',
      'model-monitoring-failures',
      props.model.modelKey,
      scope.from,
      scope.to,
    ],
    queryFn: ({ signal }) =>
      getCanvasModelMonitoringFailures(props.model.modelKey, scope, signal),
    enabled: Boolean(bucket),
  })
  const failures = bucket ? scoped.data : whole.data
  const linkSearch = {
    modelKey: props.model.modelKey,
    executionOrigin: 'REAL' as const,
    outcome: 'FAILED_OR_PENDING' as const,
    from: scope.from,
    to: scope.to,
  }
  const recent = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-task-logs',
      'monitoring-recent',
      linkSearch,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminTaskLogs(
        {
          ...linkSearch,
          page: 1,
          pageSize: 10,
          sortBy: 'acceptedAt',
          sortOrder: 'desc',
        },
        signal
      ),
  })
  const causes = failures ? failureCauses(failures, i18n.language, t) : []
  const largest = Math.max(1, ...causes.map((cause) => cause.count))
  const summary = bucket ?? props.model.summary
  const timeFormat = new Intl.DateTimeFormat(toIntlLocale(language), {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <Card>
      <CardHeader className='flex flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0 space-y-1'>
          <CardTitle className='flex items-center gap-1.5'>
            <h2>{props.model.effectiveDisplayName}</h2>
            <ModelIdentityTooltip
              effectiveDisplayName={props.model.effectiveDisplayName}
              catalogDefaultName={props.model.catalogDefaultName}
              modelKey={props.model.modelKey}
              upstreamModelIds={props.model.upstreamModelIds}
            />
          </CardTitle>
          <p className='text-muted-foreground text-sm'>
            {props.model.provider.name} ·{' '}
            {props.model.capability ? t(props.model.capability) : t('Unknown')}{' '}
            ·{' '}
            {bucket
              ? t('{{from}} – {{to}}', {
                  from: timeFormat.format(new Date(bucket.from)),
                  to: timeFormat.format(new Date(bucket.to)),
                })
              : props.rangeLabel}
            {bucket ? (
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto px-1.5'
                onClick={() => props.onSelectBucket(null)}
              >
                {t('Show the whole range')}
              </Button>
            ) : null}
          </p>
        </div>
        <Button
          type='button'
          size='sm'
          variant={props.model.manualEnabled ? 'destructive' : 'outline'}
          onClick={props.onControl}
        >
          {props.model.manualEnabled ? t('Disable model') : t('Restore model')}
        </Button>
      </CardHeader>
      <CardContent className='space-y-5'>
        <ResultsChart
          model={props.model}
          versions={whole.data?.versions ?? []}
          selectedBucket={props.selectedBucket}
          onSelectBucket={(index) =>
            props.onSelectBucket(props.selectedBucket === index ? null : index)
          }
        />
        <section className='space-y-3' aria-label={t('Failure reason')}>
          <h3 className='flex items-baseline gap-2 text-sm font-medium'>
            {t('Failure reason')}
            <span className='text-muted-foreground ms-auto text-xs font-normal tabular-nums'>
              {t('{{failures}} failures · {{rate}}', {
                failures: summary.failures.toLocaleString(
                  toIntlLocale(language)
                ),
                rate: formatMonitoringPercent(summary.failureRate, language, t),
              })}
            </span>
          </h3>
          {failures && causes.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('No failures in this period')}
            </p>
          ) : null}
          <ul className='space-y-3'>
            {causes.map((cause) => (
              <li key={cause.key} className='space-y-1.5'>
                <div className='flex items-baseline gap-2 text-sm'>
                  <MonitoringHint hint={cause.hint}>
                    <button
                      type='button'
                      className='cursor-help border-b border-dotted border-current text-start'
                      aria-label={`${cause.label}. ${cause.hint.replaceAll('\n', '. ')}`}
                    >
                      {cause.label}
                    </button>
                  </MonitoringHint>
                  <span className='text-primary ms-auto tabular-nums'>
                    {cause.count.toLocaleString(toIntlLocale(language))}
                  </span>
                </div>
                <div
                  className='bg-muted h-1.5 overflow-hidden rounded-full'
                  aria-hidden='true'
                >
                  <div
                    className={cn(
                      'h-full rounded-full',
                      cause.pending ? 'bg-amber-500' : 'bg-destructive'
                    )}
                    style={{ width: `${(cause.count / largest) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className='space-y-2' aria-label={t('Recent failed tasks')}>
          <h3 className='text-sm font-medium'>{t('Recent failed tasks')}</h3>
          {recent.data && recent.data.items.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {t('No failures in this period')}
            </p>
          ) : null}
          <ul className='divide-y'>
            {(recent.data?.items ?? []).map((task) => (
              <li key={task.id}>
                <button
                  type='button'
                  className='hover:bg-muted/60 grid w-full grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1.5 py-2 text-start text-sm'
                  aria-label={t('Open task {{id}}', { id: task.id })}
                  onClick={() => setTaskId(task.id)}
                >
                  <span className='text-muted-foreground whitespace-nowrap tabular-nums'>
                    {timeFormat.format(new Date(task.acceptedAt))}
                  </span>
                  <span className='min-w-0'>
                    <span className='block truncate'>
                      {t(taskFailureLabelKey(task))}
                    </span>
                    <span className='text-muted-foreground block truncate text-xs'>
                      {task.customerName ?? t('Unknown customer')}
                    </span>
                  </span>
                  <span className='text-muted-foreground font-mono text-xs'>
                    {task.id.slice(0, 8)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <MonitoringHint
            hint={t(
              'Opens task records with:\nModel key {{modelKey}}\nAccepted {{from}} – {{to}}\nResults with confirmed failures or pending confirmation',
              {
                modelKey: linkSearch.modelKey,
                from: timeFormat.format(new Date(linkSearch.from)),
                to: timeFormat.format(new Date(linkSearch.to)),
              }
            )}
          >
            <Link
              to='/canvas-cloud/$section'
              params={{ section: 'task-logs' }}
              search={linkSearch as never}
              className='text-primary text-sm underline underline-offset-4'
            >
              {t('View in task records')}
            </Link>
          </MonitoringHint>
        </section>
      </CardContent>
      <TaskRecordDetailsSheet
        taskId={taskId}
        onClose={() => setTaskId(undefined)}
      />
    </Card>
  )
}

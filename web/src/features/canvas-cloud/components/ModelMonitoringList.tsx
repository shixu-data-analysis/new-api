/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import {
  monitoringCellTone,
  type MonitoringCellTone,
} from '../model-monitoring-overview'
import type {
  CanvasModelMonitoringOverview,
  CanvasModelMonitoringOverviewQuery,
} from '../types'
import { CanvasStaticSortHeader } from './CanvasStaticSortHeader'
import { CanvasTooltip } from './CanvasTooltip'
import {
  formatMonitoringPercent,
  monitoringCellClasses,
  monitoringIntervalText,
} from './model-monitoring-utils'
import { ModelIdentityTooltip } from './ModelIdentityTooltip'

export type ModelMonitoringRow = CanvasModelMonitoringOverview['rows'][number]
type Sort = Pick<CanvasModelMonitoringOverviewQuery, 'sortBy' | 'sortOrder'>

const healthBadges = {
  bad: { label: 'Abnormal', variant: 'destructive' },
  watch: { label: 'Needs attention', variant: 'warning' },
  off: { label: 'Disabled', variant: 'outline' },
} as const

function HealthBadge(props: {
  row: ModelMonitoringRow
  thresholds: CanvasModelMonitoringOverview['thresholds']
}) {
  const { t, i18n } = useTranslation()
  const status = props.row.health.status
  // Too few results is not a judgement to act on: no badge, the rate says it (FailureRate).
  if (status === 'ok' || status === 'thin') return null
  const badge = healthBadges[status]
  const percent = (value: number | null) =>
    formatMonitoringPercent(value, i18n.language, t)
  const last = props.row.trend.at(-1)
  let hint = t('Manually disabled; takes no new tasks')
  if (status === 'watch') {
    hint = t('Failure rate {{rate}}, between {{low}} and {{high}}', {
      rate: percent(props.row.summary.failureRate),
      low: percent(props.thresholds.watchRate),
      high: percent(props.thresholds.badRate),
    })
  } else if (
    status === 'bad' &&
    props.row.health.trigger === 'lastBucket' &&
    last
  ) {
    hint = t(
      'Last interval failure rate {{rate}} ({{failures}} / {{determined}}), at or above {{threshold}}',
      {
        rate: percent(last.failureRate),
        failures: last.failures,
        determined: last.determined,
        threshold: percent(props.thresholds.badRate),
      }
    )
  } else if (status === 'bad') {
    hint = t('Failure rate {{rate}}, at or above {{threshold}}', {
      rate: percent(props.row.summary.failureRate),
      threshold: percent(props.thresholds.badRate),
    })
  }
  return (
    <CanvasTooltip content={hint}>
      <button
        type='button'
        className='cursor-help rounded-full'
        aria-label={`${t(badge.label)}. ${hint}`}
      >
        <Badge variant={badge.variant}>{t(badge.label)}</Badge>
      </button>
    </CanvasTooltip>
  )
}

/**
 * A model's failure rate: a dash without determined results; with too few of them it is faint and the hover says why
 * it is not judged.
 */
function FailureRate(props: {
  row: ModelMonitoringRow
  thresholds: CanvasModelMonitoringOverview['thresholds']
}) {
  const { t, i18n } = useTranslation()
  const failureRate = props.row.summary.failureRate
  if (failureRate === null) {
    return <span className='text-muted-foreground'>—</span>
  }
  const rate = formatMonitoringPercent(failureRate, i18n.language, t)
  if (props.row.health.status !== 'thin') {
    return <span className='text-muted-foreground'>{rate}</span>
  }
  const hint = t(
    'Only {{count}} determined results; fewer than {{min}} are not judged',
    {
      count: props.row.summary.determined,
      min: props.thresholds.minDetermined,
    }
  )
  return (
    <CanvasTooltip content={hint}>
      <span
        tabIndex={0}
        aria-label={`${rate}. ${hint}`}
        className='text-muted-foreground/65 focus-visible:ring-ring/50 cursor-help rounded-sm underline decoration-dotted underline-offset-4 focus-visible:ring-2 focus-visible:outline-none'
      >
        {rate}
      </span>
    </CanvasTooltip>
  )
}

/** A name cut to one line; the hover shows it in full only when it is cut. */
function ModelName(props: { name: string; onSelect: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <CanvasTooltip
      content={props.name}
      open={open}
      onOpenChange={(next) => {
        const button = ref.current
        setOpen(
          next && Boolean(button && button.scrollWidth > button.clientWidth)
        )
      }}
    >
      <button
        ref={ref}
        type='button'
        className='min-w-0 truncate text-start font-medium'
        onClick={props.onSelect}
      >
        {props.name}
      </button>
    </CanvasTooltip>
  )
}

function SortHeader(props: {
  column: Sort['sortBy']
  label: string
  hint?: string
  sort: Sort
  onSort: (sort: Sort) => void
}) {
  // Names sort A to Z first, counts and rates most first.
  const firstOrder = props.column === 'name' ? 'asc' : 'desc'
  const active = props.sort.sortBy === props.column
  const order = props.sort.sortOrder ?? firstOrder
  const flipped = order === 'desc' ? 'asc' : 'desc'
  const header = (
    <CanvasStaticSortHeader
      active={active}
      descending={order === 'desc'}
      label={props.label}
      onClick={() =>
        props.onSort({
          sortBy: props.column,
          sortOrder: active ? flipped : firstOrder,
        })
      }
    />
  )
  return props.hint ? (
    <CanvasTooltip content={props.hint}>
      <span className='inline-flex'>{header}</span>
    </CanvasTooltip>
  ) : (
    header
  )
}

function failureCountTone(status: ModelMonitoringRow['health']['status']) {
  if (status === 'bad') return 'text-destructive'
  if (status === 'watch') return 'text-amber-600 dark:text-amber-400'
  return ''
}

export function ModelMonitoringList(props: {
  data: CanvasModelMonitoringOverview
  sort: Sort
  onSort: (sort: Sort) => void
  selectedKey: string | null
  selectedBucket: number | null
  onSelectModel: (key: string) => void
  onSelectBucket: (key: string, bucket: number) => void
  emptyAction: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const thresholds = props.data.thresholds
  const percent = (value: number) => formatMonitoringPercent(value, language, t)
  const legend: Array<[MonitoringCellTone, string]> = [
    [
      'ok',
      t('Failure rate below {{rate}}', { rate: percent(thresholds.watchRate) }),
    ],
    [
      'watch',
      t('{{low}} to {{high}}', {
        low: percent(thresholds.watchRate),
        high: percent(thresholds.badRate),
      }),
    ],
    ['bad', t('{{rate}} or above', { rate: percent(thresholds.badRate) })],
    ['pending', t('Mostly pending')],
    ['none', t('No determined results')],
  ]
  const legendHints: Record<MonitoringCellTone, string> = {
    ok: t('The interval failure rate is below {{rate}}', {
      rate: percent(thresholds.watchRate),
    }),
    watch: t('The interval failure rate is between {{low}} and {{high}}', {
      low: percent(thresholds.watchRate),
      high: percent(thresholds.badRate),
    }),
    bad: t('The interval failure rate reaches {{rate}}', {
      rate: percent(thresholds.badRate),
    }),
    pending: t(
      'The interval failure rate reaches {{rate}} and pending results outnumber confirmed failures',
      { rate: percent(thresholds.watchRate) }
    ),
    none: t('The interval has no succeeded, failed or pending results'),
  }

  return (
    <Card className='gap-0 py-1'>
      {props.data.rows.length === 0 ? (
        <div className='space-y-3 p-4' role='status'>
          <p className='text-muted-foreground text-sm'>
            {t('No matching models. Clear filters to see all models.')}
          </p>
          {props.emptyAction}
        </div>
      ) : (
        <div className='px-2'>
          <div role='table' aria-label={t('Models')} className='text-sm'>
            <div
              role='row'
              className='grid grid-cols-[minmax(0,13rem)_8rem_minmax(0,1fr)] items-center gap-3 border-b px-2 py-2.5 max-sm:hidden'
            >
              <span role='columnheader'>
                <SortHeader
                  column='name'
                  label={t('Model')}
                  sort={props.sort}
                  onSort={props.onSort}
                />
              </span>
              <span
                role='columnheader'
                className='flex items-center justify-end gap-0.5'
              >
                <SortHeader
                  column='failures'
                  label={t('Failures')}
                  hint={t(
                    'Confirmed failures plus results pending confirmation'
                  )}
                  sort={props.sort}
                  onSort={props.onSort}
                />
                <span aria-hidden='true' className='text-muted-foreground'>
                  /
                </span>
                {/* The sort button pulls itself left to line up with a column edge; undo that so the slash sits midway. */}
                <span className='ms-3 inline-flex'>
                  <SortHeader
                    column='failureRate'
                    label={t('Failure rate')}
                    hint={t(
                      'Failures divided by successes plus failures; processing results are left out'
                    )}
                    sort={props.sort}
                    onSort={props.onSort}
                  />
                </span>
              </span>
              <span
                role='columnheader'
                className='text-muted-foreground font-medium'
              >
                {t('Each dot: {{interval}}', {
                  interval: intervalLabel(props.data.bucketSeconds, t),
                })}
              </span>
            </div>
            {props.data.rows.map((row) => {
              const selected = props.selectedKey === row.modelKey
              return (
                <div
                  key={row.modelKey}
                  role='row'
                  aria-selected={selected}
                  className={cn(
                    'grid cursor-pointer grid-cols-[minmax(0,13rem)_8rem_minmax(0,1fr)] items-center gap-3 border-b px-2 py-2 last:border-0 max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-2',
                    selected ? 'bg-primary/10' : 'hover:bg-muted/60'
                  )}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('button')) return
                    props.onSelectModel(row.modelKey)
                  }}
                >
                  <div role='cell' className='min-w-0'>
                    {/* Two fixed lines: name, ⓘ and an actionable status; then API service and type. */}
                    <div className='flex min-w-0 items-center gap-1'>
                      <ModelName
                        name={row.effectiveDisplayName}
                        onSelect={() => props.onSelectModel(row.modelKey)}
                      />
                      <ModelIdentityTooltip
                        effectiveDisplayName={row.effectiveDisplayName}
                        catalogDefaultName={row.catalogDefaultName}
                        modelKey={row.modelKey}
                        upstreamModelIds={row.upstreamModelIds}
                      />
                      <HealthBadge row={row} thresholds={thresholds} />
                    </div>
                    <p className='text-muted-foreground truncate text-xs'>
                      {row.provider.name} ·{' '}
                      {row.capability ? t(row.capability) : t('Unknown')}
                    </p>
                  </div>
                  {/* One line, as the header reads "failures / failure rate"; a rate without determined results is a dash.
                      Count right, rate left in a fixed width, so the slash lines up in every row. */}
                  <div
                    role='cell'
                    className='grid grid-cols-[minmax(0,1fr)_auto_3rem] items-baseline gap-1 text-sm whitespace-nowrap tabular-nums'
                  >
                    <span
                      className={cn(
                        'text-end font-semibold',
                        failureCountTone(row.health.status)
                      )}
                    >
                      {row.summary.failures.toLocaleString(
                        toIntlLocale(language)
                      )}
                    </span>
                    <span className='text-muted-foreground'>/</span>
                    <span className='justify-self-start'>
                      <FailureRate row={row} thresholds={thresholds} />
                    </span>
                  </div>
                  <div
                    role='cell'
                    className='grid min-w-0 auto-cols-[minmax(3px,10px)] grid-flow-col items-center justify-start gap-0.5 max-sm:col-span-2'
                  >
                    {row.trend.map((bucket, index) => {
                      const text = monitoringIntervalText(bucket, language, t)
                      const pressed = selected && props.selectedBucket === index
                      return (
                        <CanvasTooltip key={bucket.from} content={text}>
                          <button
                            type='button'
                            aria-label={`${row.effectiveDisplayName}. ${text.replaceAll('\n', '. ')}`}
                            aria-pressed={pressed}
                            className={cn(
                              'focus-visible:ring-ring aspect-square w-full rounded-full border outline-none hover:ring-2 hover:ring-ring/50 focus-visible:ring-2',
                              monitoringCellClasses[
                                monitoringCellTone(bucket, thresholds)
                              ],
                              pressed && 'ring-ring ring-2'
                            )}
                            onClick={() =>
                              props.onSelectBucket(row.modelKey, index)
                            }
                          />
                        </CanvasTooltip>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <ul
        className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-3 text-xs'
        aria-label={t('Interval colors')}
      >
        {legend.map(([tone, label]) => (
          <li key={tone}>
            <CanvasTooltip content={legendHints[tone]}>
              <button
                type='button'
                className='inline-flex cursor-help items-center gap-1.5'
              >
                <span
                  aria-hidden='true'
                  className={cn(
                    'size-2.5 rounded-full border',
                    monitoringCellClasses[tone]
                  )}
                />
                {label}
              </button>
            </CanvasTooltip>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function intervalLabel(
  seconds: number,
  t: (key: string, values?: Record<string, unknown>) => string
) {
  if (seconds % 86400 === 0) {
    return t('{{count}} days', { count: seconds / 86400 })
  }
  if (seconds % 3600 === 0) {
    return t('{{count}} hours', { count: seconds / 3600 })
  }
  return t('{{count}} minutes', { count: Math.round(seconds / 60) })
}

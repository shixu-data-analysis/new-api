/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import { getCanvasModelUsage } from '../api'
import type { CanvasModelUsage, CanvasModelUsageQuery } from '../types'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasStaticSortHeader } from './CanvasStaticSortHeader'
import { MonitoringHint } from './ModelMonitoringList'

type Metric = 'results' | 'customers'
type UsageModel = CanvasModelUsage['models'][number]

const presets: Array<{ value: 'week' | 'month'; label: string }> = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
]
const maximumCustomRangeMilliseconds = 30 * 86_400_000
const shownByDefault = 8
const typeColors = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4']

function ChangeCell(props: { model: UsageModel; metric: Metric }) {
  const { t, i18n } = useTranslation()
  const now = props.model[props.metric]
  const before =
    props.metric === 'results'
      ? props.model.previousResults
      : props.model.previousCustomers
  if (before === 0) {
    return <span className='text-primary'>{t('New in ranking')}</span>
  }
  const change = (now - before) / before
  const percent = new Intl.NumberFormat(toIntlLocale(i18n.language), {
    style: 'percent',
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
  }).format(change)
  const hint = t('Previous {{before}} → now {{now}} ({{delta}})', {
    before: before.toLocaleString(toIntlLocale(i18n.language)),
    now: now.toLocaleString(toIntlLocale(i18n.language)),
    delta: new Intl.NumberFormat(toIntlLocale(i18n.language), {
      signDisplay: 'exceptZero',
    }).format(now - before),
  })
  let tone = 'text-muted-foreground'
  if (change >= 0.005) tone = 'text-emerald-600 dark:text-emerald-400'
  else if (change <= -0.005) tone = 'text-destructive'
  return (
    <MonitoringHint hint={hint}>
      <button
        type='button'
        className={cn('cursor-help tabular-nums', tone)}
        aria-label={`${percent}. ${hint}`}
      >
        {percent}
      </button>
    </MonitoringHint>
  )
}

function TypeCard(props: {
  capability: string | null
  models: UsageModel[]
  metric: Metric
  onMetric: (metric: Metric) => void
  onOpenModel: (modelKey: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const language = i18n.language
  const sorted = [...props.models].sort(
    (a, b) =>
      b[props.metric] - a[props.metric] ||
      b.results - a.results ||
      a.displayName.localeCompare(b.displayName)
  )
  const shown = expanded ? sorted : sorted.slice(0, shownByDefault)
  const total = sorted.reduce((sum, model) => sum + model.results, 0)
  const typeName = props.capability ? t(props.capability) : t('Unknown')
  return (
    <Card className='min-w-0 gap-3'>
      <CardHeader className='flex flex-wrap items-baseline gap-x-2'>
        <CardTitle>
          <h2>{typeName}</h2>
        </CardTitle>
        <span className='text-muted-foreground text-sm tabular-nums'>
          {t('{{total}} results', {
            total: total.toLocaleString(toIntlLocale(language)),
          })}
        </span>
      </CardHeader>
      <CardContent className='space-y-2'>
        <StaticDataTable
          className='max-w-full overflow-x-auto'
          containerProps={{
            role: 'region',
            'aria-label': t('{{type}} ranking', { type: typeName }),
            tabIndex: 0,
          }}
          tableClassName='w-full table-fixed'
          data={shown}
          getRowKey={(row) => row.modelKey}
          emptyContent={t('No usage in this period')}
          columns={[
            {
              id: 'rank',
              className: 'w-10',
              cellClassName: 'text-muted-foreground font-semibold tabular-nums',
              header: <span className='sr-only'>{t('Rank')}</span>,
              cell: (_row, index) => index + 1,
            },
            {
              id: 'model',
              header: t('Model'),
              // Table cells do not wrap by default; a long model name wraps instead of being cut off.
              cellClassName: 'whitespace-normal',
              cell: (row) => {
                const share = total ? row.results / total : 0
                return (
                  <div className='min-w-0 space-y-1'>
                    <div className='flex flex-wrap items-center gap-1.5'>
                      <button
                        type='button'
                        className='text-start font-medium break-words'
                        onClick={() => props.onOpenModel(row.modelKey)}
                      >
                        {row.displayName}
                      </button>
                      {row.manualEnabled ? null : (
                        <span className='text-muted-foreground text-xs'>
                          {t('Disabled')}
                        </span>
                      )}
                    </div>
                    {share > 0 ? (
                      <div
                        className='flex items-center gap-2'
                        aria-hidden='true'
                      >
                        <div className='bg-muted h-1 flex-1 overflow-hidden rounded-full'>
                          <div
                            className='bg-primary/70 h-full rounded-full'
                            style={{ width: `${share * 100}%` }}
                          />
                        </div>
                        <span className='text-muted-foreground w-8 text-end text-xs tabular-nums'>
                          {new Intl.NumberFormat(toIntlLocale(language), {
                            style: 'percent',
                            maximumFractionDigits: 0,
                          }).format(share)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                )
              },
            },
            {
              id: 'results',
              className: 'w-20 text-end',
              cellClassName: 'text-end tabular-nums',
              header: (
                <MonitoringHint
                  hint={t('Accepted results, failed ones included')}
                >
                  <span className='inline-flex'>
                    <CanvasStaticSortHeader
                      active={props.metric === 'results'}
                      descending
                      label={t('Result count')}
                      onClick={() => props.onMetric('results')}
                    />
                  </span>
                </MonitoringHint>
              ),
              cell: (row) => row.results.toLocaleString(toIntlLocale(language)),
            },
            {
              id: 'customers',
              className: 'w-20 text-end',
              cellClassName: 'text-end tabular-nums',
              header: (
                <MonitoringHint hint={t('Customers who submitted tasks')}>
                  <span className='inline-flex'>
                    <CanvasStaticSortHeader
                      active={props.metric === 'customers'}
                      descending
                      label={t('Customer count')}
                      onClick={() => props.onMetric('customers')}
                    />
                  </span>
                </MonitoringHint>
              ),
              cell: (row) =>
                row.customers.toLocaleString(toIntlLocale(language)),
            },
            {
              id: 'change',
              className: 'w-20 text-end',
              cellClassName: 'text-end',
              header: (
                <MonitoringHint
                  hint={t(
                    'Compared with the period of the same length just before, on the sorted column'
                  )}
                >
                  <span className='border-b border-dotted border-current'>
                    {t('Vs. previous')}
                  </span>
                </MonitoringHint>
              ),
              cell: (row) => <ChangeCell model={row} metric={props.metric} />,
            },
          ]}
        />
        {sorted.length > shownByDefault ? (
          <Button
            type='button'
            variant='link'
            size='sm'
            className='px-0'
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded
              ? t('Show less')
              : t('Show all {{count}}', { count: sorted.length })}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

function TypeSummary(props: { usage: CanvasModelUsage }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const total = props.usage.types.reduce((sum, type) => sum + type.results, 0)
  const percent = (value: number) =>
    new Intl.NumberFormat(toIntlLocale(language), {
      style: 'percent',
      maximumFractionDigits: 0,
    }).format(total ? value / total : 0)
  return (
    <Card className='gap-3'>
      <CardHeader className='flex flex-wrap items-baseline gap-x-2'>
        <CardTitle>
          <h2>{t('By generation type')}</h2>
        </CardTitle>
        <span className='text-muted-foreground text-sm tabular-nums'>
          {t('{{total}} results', {
            total: total.toLocaleString(toIntlLocale(language)),
          })}
        </span>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div
          className='flex h-2.5 gap-0.5 overflow-hidden rounded-full'
          aria-hidden='true'
        >
          {props.usage.types.map((type, index) => (
            <div
              key={type.capability ?? 'none'}
              className={typeColors[index % typeColors.length]}
              style={{ width: `${total ? (type.results / total) * 100 : 0}%` }}
            />
          ))}
        </div>
        <dl className='grid gap-4 sm:grid-cols-3'>
          {props.usage.types.map((type, index) => (
            <div key={type.capability ?? 'none'} className='space-y-0.5'>
              <dt className='text-muted-foreground flex items-center gap-1.5 text-sm'>
                <span
                  aria-hidden='true'
                  className={cn(
                    'size-2.5 rounded-full',
                    typeColors[index % typeColors.length]
                  )}
                />
                {type.capability ? t(type.capability) : t('Unknown')}
              </dt>
              <dd className='text-lg font-semibold tabular-nums'>
                {type.results.toLocaleString(toIntlLocale(language))}
                <span className='text-muted-foreground ms-1.5 text-sm font-normal'>
                  {percent(type.results)}
                </span>
              </dd>
              <dd className='text-muted-foreground text-xs tabular-nums'>
                {t('{{customers}} users · {{models}} models', {
                  customers: type.customers.toLocaleString(
                    toIntlLocale(language)
                  ),
                  models: type.models,
                })}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

export function ModelUsageRanking(props: {
  onOpenModel: (modelKey: string) => void
}) {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<CanvasModelUsageQuery['window']>('week')
  const [customOpen, setCustomOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState<Date>()
  const [draftTo, setDraftTo] = useState<Date>()
  const [applied, setApplied] = useState<{ from: string; to: string }>()
  const [metric, setMetric] = useState<Metric>('results')
  const query: CanvasModelUsageQuery =
    period === 'custom' && applied
      ? { window: period, ...applied }
      : { window: period === 'custom' ? 'week' : period }
  const usage = useQuery({
    queryKey: ['canvas-cloud', 'model-usage', query],
    queryFn: ({ signal }) => getCanvasModelUsage(query, signal),
    placeholderData: (previous) => previous,
  })
  const customRangeValid = Boolean(
    draftFrom &&
    draftTo &&
    +draftFrom < +draftTo &&
    +draftTo - +draftFrom <= maximumCustomRangeMilliseconds
  )
  const customRangeStarted = Boolean(draftFrom || draftTo)
  // A ranking per type that has a model used in either period, most results first, so a type that fell to zero still shows its
  // models' drop; the summary above compares only this period.
  const currentResults = new Map(
    (usage.data?.types ?? []).map((type) => [type.capability, type.results])
  )
  const rankedTypes = [
    ...new Set((usage.data?.models ?? []).map((model) => model.capability)),
  ].sort((a, b) => (currentResults.get(b) ?? 0) - (currentResults.get(a) ?? 0))

  return (
    <div className='space-y-4'>
      <div
        className='flex flex-wrap items-center gap-2'
        role='group'
        aria-label={t('Time range')}
      >
        {presets.map((item) => (
          <Button
            key={item.value}
            type='button'
            size='sm'
            variant={
              !customOpen && period === item.value ? 'default' : 'outline'
            }
            aria-pressed={!customOpen && period === item.value}
            onClick={() => {
              setPeriod(item.value)
              setApplied(undefined)
              setCustomOpen(false)
            }}
          >
            {t(item.label)}
          </Button>
        ))}
        <Button
          type='button'
          size='sm'
          variant={customOpen || period === 'custom' ? 'default' : 'outline'}
          aria-pressed={customOpen || period === 'custom'}
          aria-expanded={customOpen}
          onClick={() => setCustomOpen((open) => !open)}
        >
          {t('Custom range')}
        </Button>
      </div>
      {customOpen ? (
        <div
          className='bg-muted/30 grid items-end gap-3 rounded-md border p-3 lg:grid-cols-[minmax(0,48rem)_auto] lg:justify-start'
          role='group'
          aria-label={t('Custom range')}
        >
          <div className='min-w-0'>
            <p className='mb-2 text-sm font-medium'>{t('Custom range')}</p>
            <CanvasDateRangeFilter
              from={draftFrom}
              to={draftTo}
              onFromChange={setDraftFrom}
              onToChange={setDraftTo}
            />
            {!customRangeValid ? (
              <p
                role={customRangeStarted ? 'alert' : undefined}
                className={
                  customRangeStarted
                    ? 'text-destructive mt-2 text-sm'
                    : 'text-muted-foreground mt-2 text-sm'
                }
              >
                {t('Select a positive time range of at most 30 days')}
              </p>
            ) : null}
          </div>
          <Button
            type='button'
            disabled={!customRangeValid}
            onClick={() => {
              if (!draftFrom || !draftTo) return
              setPeriod('custom')
              setApplied({
                from: draftFrom.toISOString(),
                to: draftTo.toISOString(),
              })
              setCustomOpen(false)
            }}
          >
            {t('Confirm')}
          </Button>
        </div>
      ) : null}
      {usage.isPending ? <LoadingState /> : null}
      {usage.isError ? (
        <ErrorState
          title={t('Model usage could not be loaded')}
          onRetry={() => void usage.refetch()}
        />
      ) : null}
      {usage.data && !usage.isError ? (
        <>
          <TypeSummary usage={usage.data} />
          {/* Cards share the row: two types fill it, more wrap once a card would get too narrow for its names. */}
          <div className='grid grid-cols-[repeat(auto-fit,minmax(min(100%,30rem),1fr))] gap-4'>
            {rankedTypes.map((capability) => (
              <TypeCard
                key={capability ?? 'none'}
                capability={capability}
                models={usage.data.models.filter(
                  (model) => model.capability === capability
                )}
                metric={metric}
                onMetric={setMetric}
                onOpenModel={props.onOpenModel}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

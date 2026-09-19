/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'

import {
  monitoringDeterminedCount,
  monitoringRateTone,
  monitoringTickLabelIndexes,
  type MonitoringRateTone,
} from '../model-monitoring-overview'
import type { CanvasModelMonitoringOverview } from '../types'
import {
  formatMonitoringDateTime,
  formatMonitoringPercent,
} from './model-monitoring-utils'

type ModelRow = CanvasModelMonitoringOverview['rows'][number]

const toneClasses: Record<MonitoringRateTone, string> = {
  none: 'bg-muted border-border',
  good: 'bg-emerald-500 border-emerald-600',
  watch: 'bg-amber-400 border-amber-500',
  bad: 'bg-rose-500 border-rose-600',
}

function bucketDescription(
  model: ModelRow,
  bucket: ModelRow['trend'][number],
  language: string,
  t: (key: string) => string
): string {
  return `${model.name} · ${formatMonitoringDateTime(bucket.from, language)} — ${formatMonitoringDateTime(bucket.to, language)} · ${t('Success rate')} ${formatMonitoringPercent(bucket.successRate, language, t)} · ${t('Successful results')} ${bucket.succeeded} · ${t('Confirmed failures')} ${bucket.failed} · ${t('Unknown outcomes')} ${bucket.unknown} · ${t('Processing')} ${bucket.processing}`
}

export function ModelMonitoringMatrix(props: {
  data: CanvasModelMonitoringOverview
  selectedKey: string | null
  selectedBucket: number | null
  onSelectModel: (key: string) => void
  onSelectBucket: (key: string, bucket: number) => void
  onControl: (model: ModelRow) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const locale = toIntlLocale(language)
  const ticks = props.data.rows[0]?.trend ?? []
  const visibleTickLabels = monitoringTickLabelIndexes(ticks.length)
  const gridTemplateColumns = `208px 128px 128px repeat(${ticks.length}, 24px) 128px`

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
            <h2>{t('Per-model result matrix')}</h2>
            <span className='text-muted-foreground text-sm font-normal tabular-nums'>
              {t('Total models: {{count}}', { count: props.data.total })}
            </span>
          </div>
        </CardTitle>
        <p className='text-muted-foreground text-sm'>
          {t('Time granularity')}: {props.data.bucketSeconds / 60}{' '}
          {t('minutes')}
        </p>
      </CardHeader>
      <CardContent className='space-y-3'>
        {props.data.rows.length === 0 ? (
          <p role='status' className='text-muted-foreground text-sm'>
            {t('No matching models. Clear filters to see all models.')}
          </p>
        ) : (
          <div
            className='max-w-full overflow-x-auto'
            tabIndex={0}
            aria-label={t('Per-model result matrix')}
          >
            <div
              className='min-w-max'
              role='table'
              aria-label={t('Per-model result matrix')}
            >
              <div
                className='grid items-center gap-1 border-b px-2 pb-2 text-xs font-medium'
                role='row'
                style={{ gridTemplateColumns }}
              >
                <span role='columnheader'>{t('Model')}</span>
                <span role='columnheader'>{t('Success rate')}</span>
                <span role='columnheader'>{t('Determined results')}</span>
                {ticks.map((bucket, index) => {
                  let alignment = 'text-center'
                  if (index === 0) alignment = 'text-left'
                  else if (index === ticks.length - 1) alignment = 'text-right'
                  return (
                    <span
                      key={bucket.from}
                      role='columnheader'
                      aria-label={formatMonitoringDateTime(
                        bucket.from,
                        language
                      )}
                      className={`text-muted-foreground whitespace-nowrap ${alignment}`}
                      title={formatMonitoringDateTime(bucket.from, language)}
                    >
                      {visibleTickLabels.has(index)
                        ? new Intl.DateTimeFormat(
                            locale,
                            props.data.bucketSeconds >= 86400
                              ? { month: 'numeric', day: 'numeric' }
                              : { hour: '2-digit', minute: '2-digit' }
                          ).format(new Date(bucket.from))
                        : null}
                    </span>
                  )
                })}
                <span role='columnheader' className='text-center'>
                  {t('Actions')}
                </span>
              </div>
              {props.data.rows.map((model) => (
                <div
                  key={model.modelKey}
                  role='row'
                  aria-selected={props.selectedKey === model.modelKey}
                  className={`grid items-center gap-1 border-b px-2 py-2 last:border-0 ${props.selectedKey === model.modelKey ? 'bg-primary/10' : ''}`}
                  style={{ gridTemplateColumns }}
                >
                  <div role='cell' className='min-w-0'>
                    <Button
                      variant='ghost'
                      className='h-auto max-w-full justify-start p-1 text-left'
                      onClick={() => props.onSelectModel(model.modelKey)}
                      aria-pressed={props.selectedKey === model.modelKey}
                    >
                      <span className='min-w-0 break-words'>{model.name}</span>
                    </Button>
                    {!model.manualEnabled ? (
                      <span className='text-muted-foreground block text-xs'>
                        {t('Disabled')}
                      </span>
                    ) : null}
                  </div>
                  <span role='cell' className='tabular-nums'>
                    {formatMonitoringPercent(
                      model.summary.successRate,
                      language,
                      t
                    )}
                  </span>
                  <span role='cell' className='tabular-nums'>
                    {monitoringDeterminedCount(model.summary).toLocaleString(
                      locale
                    )}
                  </span>
                  {model.trend.map((bucket, index) => (
                    <div
                      role='cell'
                      key={bucket.from}
                      className='flex justify-center'
                    >
                      <button
                        type='button'
                        className={`focus-visible:ring-ring h-6 w-5 rounded-sm border outline-none focus-visible:ring-2 ${toneClasses[monitoringRateTone(bucket)]} ${props.selectedKey === model.modelKey && props.selectedBucket === index ? 'ring-ring ring-2' : ''}`}
                        aria-label={bucketDescription(
                          model,
                          bucket,
                          language,
                          t
                        )}
                        title={bucketDescription(model, bucket, language, t)}
                        aria-pressed={
                          props.selectedKey === model.modelKey &&
                          props.selectedBucket === index
                        }
                        onClick={() =>
                          props.onSelectBucket(model.modelKey, index)
                        }
                      />
                    </div>
                  ))}
                  <div role='cell' className='flex justify-center'>
                    <Button
                      size='sm'
                      variant={model.manualEnabled ? 'destructive' : 'outline'}
                      onClick={() => props.onControl(model)}
                    >
                      {model.manualEnabled
                        ? t('Disable model')
                        : t('Restore model')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div
          className='flex flex-wrap gap-x-4 gap-y-1 text-xs'
          aria-label={t('Success-rate color rules')}
        >
          {(
            [
              ['good', 'At least 90%'],
              ['watch', '70% to under 90%'],
              ['bad', 'Under 70%'],
              ['none', 'No determined results'],
            ] as const
          ).map(([tone, label]) => (
            <span key={tone} className='inline-flex items-center gap-1'>
              <span
                aria-hidden='true'
                className={`size-3 rounded border ${toneClasses[tone]}`}
              />
              {t(label)}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const segmentClasses = {
  succeeded: 'bg-emerald-500',
  failed: 'bg-rose-500',
  unknown: 'bg-slate-400',
  processing: 'bg-sky-500',
} as const

export function ModelMonitoringChart(props: {
  model: ModelRow | null
  selectedBucket: number | null
  onSelectBucket: (index: number) => void
  windowLabel: string
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const locale = toIntlLocale(language)
  const model = props.model
  if (!model) return null
  const max = Math.max(1, ...model.trend.map((bucket) => bucket.resultCount))
  const segments = ['succeeded', 'failed', 'unknown', 'processing'] as const
  const segmentLabels = {
    succeeded: 'Successful results',
    failed: 'Confirmed failures',
    unknown: 'Unknown outcomes',
    processing: 'Processing',
  } as const
  const summary = model.summary

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>
            {model.name} · {t('Runtime results')}
          </h2>
        </CardTitle>
        <p className='text-muted-foreground text-sm'>
          {model.provider.name} ·{' '}
          {model.capability ? t(model.capability) : t('Unknown')} ·{' '}
          {props.windowLabel}
        </p>
      </CardHeader>
      <CardContent className='space-y-4'>
        <dl className='grid gap-3 text-sm sm:grid-cols-4'>
          <div>
            <dt className='text-muted-foreground'>{t('Success rate')}</dt>
            <dd className='font-semibold tabular-nums'>
              {formatMonitoringPercent(summary.successRate, language, t)}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>{t('Successful results')}</dt>
            <dd className='font-semibold tabular-nums'>
              {summary.succeeded.toLocaleString(locale)}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>{t('Confirmed failures')}</dt>
            <dd className='font-semibold tabular-nums'>
              {summary.failed.toLocaleString(locale)}
            </dd>
          </div>
          <div>
            <dt className='text-muted-foreground'>
              {t('Unknown outcomes')} / {t('Processing')}
            </dt>
            <dd className='font-semibold tabular-nums'>
              {summary.unknown.toLocaleString(locale)} /{' '}
              {summary.processing.toLocaleString(locale)}
            </dd>
          </div>
        </dl>
        <div
          className='max-w-full overflow-x-auto'
          tabIndex={0}
          aria-label={t('Results by interval')}
        >
          <div
            className='flex h-40 min-w-max items-end gap-1 border-b pb-1'
            role='group'
            aria-label={t('Results by interval')}
          >
            {model.trend.map((bucket, index) => (
              <button
                key={bucket.from}
                type='button'
                className={`focus-visible:ring-ring flex h-36 w-10 shrink-0 flex-col justify-end rounded-sm outline-none focus-visible:ring-2 ${props.selectedBucket === index ? 'ring-ring ring-2' : ''}`}
                title={bucketDescription(model, bucket, language, t)}
                aria-label={bucketDescription(model, bucket, language, t)}
                aria-pressed={props.selectedBucket === index}
                onClick={() => props.onSelectBucket(index)}
              >
                {segments.map((segment) =>
                  bucket[segment] > 0 ? (
                    <span
                      key={segment}
                      aria-hidden='true'
                      className={`block w-full ${segmentClasses[segment]}`}
                      style={{
                        height: `${(bucket[segment] / max) * 100}%`,
                        minHeight: 2,
                      }}
                    />
                  ) : null
                )}
              </button>
            ))}
          </div>
        </div>
        <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs'>
          {segments.map((segment) => (
            <span key={segment} className='inline-flex items-center gap-1'>
              <span
                aria-hidden='true'
                className={`size-3 rounded ${segmentClasses[segment]}`}
              />
              {t(segmentLabels[segment])}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

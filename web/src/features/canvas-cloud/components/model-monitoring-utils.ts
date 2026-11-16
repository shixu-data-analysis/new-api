/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { toIntlLocale } from '@/i18n/languages'

import type { MonitoringCellTone } from '../model-monitoring-overview'
import type { CanvasModelMonitoringOverview } from '../types'

type Bucket = CanvasModelMonitoringOverview['rows'][number]['trend'][number]

export function formatMonitoringPercent(
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

export const monitoringCellClasses: Record<MonitoringCellTone, string> = {
  none: 'border-border bg-muted',
  ok: 'border-transparent bg-muted-foreground/25',
  watch: 'border-transparent bg-destructive/45',
  bad: 'border-transparent bg-destructive',
  pending: 'border-transparent bg-amber-500',
}

export function monitoringIntervalText(
  bucket: Bucket,
  language: string,
  t: (key: string, values?: Record<string, unknown>) => string
) {
  const range = t('{{from}} – {{to}}', {
    from: formatMonitoringDateTime(bucket.from, language),
    to: formatMonitoringDateTime(bucket.to, language),
  })
  if (bucket.determined === 0) {
    return [
      range,
      bucket.processing
        ? t('No determined results; processing {{count}}', {
            count: bucket.processing,
          })
        : t('No determined results'),
    ].join('\n')
  }
  const parts = [
    bucket.failed
      ? t('Confirmed failures {{count}}', { count: bucket.failed })
      : '',
    bucket.pending ? t('Pending {{count}}', { count: bucket.pending }) : '',
    bucket.processing
      ? t('Processing {{count}}', { count: bucket.processing })
      : '',
  ].filter(Boolean)
  return [
    range,
    t('Succeeded {{succeeded}} · failed {{failures}} ({{rate}})', {
      succeeded: bucket.succeeded,
      failures: bucket.failures,
      rate: formatMonitoringPercent(bucket.failureRate, language, t),
    }),
    parts.join(' · '),
  ]
    .filter(Boolean)
    .join('\n')
}

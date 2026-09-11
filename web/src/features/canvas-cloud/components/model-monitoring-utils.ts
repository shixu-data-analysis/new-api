/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { BarShapeProps } from 'recharts'

import { toIntlLocale } from '@/i18n/languages'

import { canvasBusinessTermConfig } from '../business-terms'
import { getLocalizedErrorMessage } from '../localized-error-message'
import type { CanvasModelMonitoring, CanvasTaskOutputSummary } from '../types'

export type MonitoringTrendBucket = CanvasModelMonitoring['trend'][number] & {
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
export function buildMonitoringTrend(
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
export function monitoringTrendTooltipText(
  bucket: MonitoringTrendBucket,
  t: (key: string) => string,
  language: string
) {
  return `${formatMonitoringDateTime(bucket.from, language)} — ${formatMonitoringDateTime(bucket.to, language)} · ${t('Success rate')} ${bucket.successRateLabel} · ${t('Successful results')} ${bucket.succeeded} · ${t('Confirmed failures')} ${bucket.failed} · ${t('Unknown outcomes')} ${bucket.unknown} · ${t('Processing')} ${bucket.processing}`
}
type TrendRect = { height: number; left: number; top: number; width: number }
export function getTrendTooltipAnchor(
  container: Pick<TrendRect, 'left' | 'top'>,
  target: TrendRect,
  bucketSegments: TrendRect[]
) {
  return {
    left: target.left - container.left + target.width / 2,
    top:
      Math.min(...bucketSegments.map((segment) => segment.top)) - container.top,
  }
}
export function getTrendBarIndex(
  props: Pick<BarShapeProps, 'originalDataIndex'>
) {
  return props.originalDataIndex
}
export function hasPositiveTrendBarValue(value: BarShapeProps['value']) {
  return Array.isArray(value) ? value[1] - value[0] > 0 : value > 0
}
function taskExecutionStatusLabel(status: string) {
  return (
    canvasBusinessTermConfig.taskExecutionStatus.labels[
      status as keyof typeof canvasBusinessTermConfig.taskExecutionStatus.labels
    ] ?? 'Unknown'
  )
}
export function outputFacts(
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

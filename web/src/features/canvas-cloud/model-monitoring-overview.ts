/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { CanvasModelMonitoringStats } from './types'

export type MonitoringRateTone = 'none' | 'good' | 'watch' | 'bad'

export function monitoringRateTone(
  stats: Pick<CanvasModelMonitoringStats, 'succeeded' | 'failed'>
): MonitoringRateTone {
  const determined = stats.succeeded + stats.failed
  if (determined === 0) return 'none'
  const ratio = stats.succeeded / determined
  if (ratio >= 0.9) return 'good'
  if (ratio >= 0.7) return 'watch'
  return 'bad'
}

export function monitoringDeterminedCount(
  stats: Pick<CanvasModelMonitoringStats, 'succeeded' | 'failed'>
): number {
  return stats.succeeded + stats.failed
}

export function monitoringTickLabelIndexes(
  tickCount: number,
  maximumLabels = 6
): Set<number> {
  if (tickCount <= 0 || maximumLabels <= 0) return new Set()
  if (tickCount <= maximumLabels) {
    return new Set(Array.from({ length: tickCount }, (_, index) => index))
  }
  if (maximumLabels === 1) return new Set([0])

  const lastIndex = tickCount - 1
  return new Set(
    Array.from({ length: maximumLabels }, (_, index) =>
      Math.round((index * lastIndex) / (maximumLabels - 1))
    )
  )
}

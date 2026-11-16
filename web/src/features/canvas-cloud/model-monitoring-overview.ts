/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { TFunction } from 'i18next'

import { taskErrorCategoryLabels } from './task-error-categories'
import type {
  CanvasAdminTaskLog,
  CanvasModelMonitoringStats,
  CanvasModelMonitoringThresholds,
} from './types'

/** Error code of a result an administrator released after confirming the provider failed. */
export const ADMIN_CONFIRMED_UPSTREAM_FAILURE =
  'ADMIN_CONFIRMED_UPSTREAM_FAILED'

export type MonitoringCellTone = 'none' | 'ok' | 'watch' | 'bad' | 'pending'

/**
 * One interval's color, with the thresholds Cloud returns (the same lines that judge a model's health). An interval whose
 * failures are mostly pending shows as pending, since that points at results nobody can confirm rather than provider errors.
 */
export function monitoringCellTone(
  stats: Pick<
    CanvasModelMonitoringStats,
    'failed' | 'pending' | 'determined' | 'failureRate'
  >,
  thresholds: Pick<CanvasModelMonitoringThresholds, 'watchRate' | 'badRate'>
): MonitoringCellTone {
  if (stats.determined === 0 || stats.failureRate === null) return 'none'
  if (stats.failureRate < thresholds.watchRate) return 'ok'
  if (stats.pending > stats.failed) return 'pending'
  return stats.failureRate >= thresholds.badRate ? 'bad' : 'watch'
}

/** A model version's origin as the catalog names it. */
export function monitoringVersionSourceLabel(t: TFunction, source: string) {
  if (source === 'BUNDLE') return t('Bundle, short')
  if (source === 'ADMIN') return t('Admin edit')
  return t('Unknown')
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

/** Why one task failed, from its first failed or pending result; a legacy task without results speaks for itself. */
export function taskFailureLabelKey(task: CanvasAdminTaskLog): string {
  const output = task.outputSummaries.find(
    (item) =>
      item.executionStatus === 'CONFIRMED_FAILED' ||
      item.executionStatus === 'UNKNOWN' ||
      (item.executionStatus === 'SUCCEEDED' &&
        item.billingStatus === 'RELEASED_TIMEOUT')
  )
  const status = output?.executionStatus ?? task.derivedExecutionStatus
  const billing = output?.billingStatus ?? task.customerBillingStatus
  const code = output?.error?.code ?? null
  if (status === 'SUCCEEDED') return 'Succeeded after release (not delivered)'
  if (status === 'UNKNOWN') {
    return billing === 'RELEASED_TIMEOUT'
      ? 'Released after timeout'
      : 'Result pending confirmation'
  }
  if (code === ADMIN_CONFIRMED_UPSTREAM_FAILURE) {
    return 'Administrator confirmed the upstream failure'
  }
  return code
    ? (taskErrorCategoryLabels[code] ?? 'Unknown error category')
    : 'Unknown error category'
}

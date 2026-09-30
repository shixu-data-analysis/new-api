/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { normalizeInterfaceLanguage } from '@/i18n/languages'

import type {
  CanvasAdminTaskRecordDetail,
  CanvasAdminTaskRecordOutput,
} from './types'

/**
 * Reproduces what Canvas Web shows the customer for a Cloud task
 * (`cloudTaskNodeStatus()`, the result picker and the task information dialog)
 * from the administrator task detail. Keep the rules aligned with
 * `canvas-web/src/utils/cloudTaskFlow.ts` and `taskErrorDetails.ts`.
 */

export const ADMIN_CONFIRMED_UPSTREAM_FAILURE_CODE =
  'ADMIN_CONFIRMED_UPSTREAM_FAILED'

export const CUSTOMER_FALLBACK_ERROR_KEY = 'Customer task view fallback error'

type CustomerTask = Pick<
  CanvasAdminTaskRecordDetail,
  | 'executionStatus'
  | 'derivedExecutionStatus'
  | 'customerBillingStatus'
  | 'unknownDeadlineAt'
  | 'releasedPoints'
  | 'billingFinalizedAt'
  | 'taskError'
> & {
  outputs: Array<
    Pick<
      CanvasAdminTaskRecordOutput,
      'outputIndex' | 'executionStatus' | 'billingStatus' | 'error'
    >
  >
}

const isReleased = (status: string) =>
  status === 'RELEASED_FAILED' || status === 'RELEASED_TIMEOUT'

export type CustomerNodeStatus = {
  key: string
  failed: boolean
}

export function customerNodeStatus(task: CustomerTask): CustomerNodeStatus {
  const { outputs } = task
  const multiple = outputs.length > 1
  const hasSucceeded = outputs.some(
    (output) => output.executionStatus === 'SUCCEEDED'
  )
  const partial =
    task.derivedExecutionStatus === 'PARTIAL_SUCCESS' ||
    (multiple &&
      hasSucceeded &&
      outputs.some((output) => output.executionStatus === 'CONFIRMED_FAILED'))
  const releasedPartial =
    multiple &&
    hasSucceeded &&
    outputs.some((output) => output.executionStatus !== 'SUCCEEDED') &&
    outputs.every((output) => output.billingStatus !== 'FROZEN')
  if (
    (partial && task.customerBillingStatus === 'SETTLED') ||
    releasedPartial
  ) {
    return { key: 'Customer task view partially completed', failed: false }
  }
  if (
    task.executionStatus === 'SUCCEEDED' &&
    task.customerBillingStatus === 'SETTLED'
  ) {
    return { key: 'Customer task view completed', failed: false }
  }
  if (
    task.executionStatus === 'CONFIRMED_FAILED' ||
    task.customerBillingStatus === 'RELEASED_FAILED'
  ) {
    return {
      key:
        task.customerBillingStatus === 'RELEASED_FAILED'
          ? 'Customer task view failed points released'
          : 'Customer task view failed',
      failed: true,
    }
  }
  if (task.customerBillingStatus === 'RELEASED_TIMEOUT') {
    return { key: 'Customer task view failed points released', failed: true }
  }
  if (task.executionStatus === 'UNKNOWN') {
    return { key: 'Customer task view verifying', failed: false }
  }
  return { key: 'Customer task view running', failed: false }
}

/** Result picker label; Canvas Web only shows the picker for multiple results. */
export function customerOutputLabelKey(
  output: Pick<CanvasAdminTaskRecordOutput, 'executionStatus' | 'billingStatus'>
): string {
  if (output.executionStatus === 'SUCCEEDED') {
    return 'Customer task view succeeded'
  }
  if (output.executionStatus === 'CONFIRMED_FAILED') {
    return 'Customer task view confirmed failed'
  }
  if (isReleased(output.billingStatus)) return 'Customer task view released'
  return 'Customer task view confirming'
}

export type CustomerDeadline =
  | { kind: 'hidden' }
  | { kind: 'missing' }
  | { kind: 'releasing' }
  | { kind: 'scheduled'; at: string }

export function customerDeadline(
  task: CustomerTask,
  now = Date.now()
): CustomerDeadline {
  if (
    task.executionStatus !== 'UNKNOWN' ||
    task.customerBillingStatus !== 'FROZEN'
  ) {
    return { kind: 'hidden' }
  }
  if (!task.unknownDeadlineAt) return { kind: 'missing' }
  const timestamp = Date.parse(task.unknownDeadlineAt)
  if (!Number.isFinite(timestamp)) return { kind: 'missing' }
  return timestamp <= now
    ? { kind: 'releasing' }
    : { kind: 'scheduled', at: task.unknownDeadlineAt }
}

export type CustomerPoints = {
  key: string
  points?: string
  finalizedAt: string | null
}

export function customerPoints(task: CustomerTask): CustomerPoints {
  if (task.customerBillingStatus === 'FROZEN') {
    return { key: 'Customer task view points frozen', finalizedAt: null }
  }
  const released =
    task.releasedPoints && /^[1-9]\d*$/.test(task.releasedPoints)
      ? task.releasedPoints
      : undefined
  const finalizedAt = task.billingFinalizedAt
  if (task.customerBillingStatus === 'SETTLED') {
    return released
      ? {
          key: 'Customer task view points settled and released',
          points: released,
          finalizedAt,
        }
      : { key: 'Customer task view points settled', finalizedAt }
  }
  return released
    ? {
        key: 'Customer task view points released amount',
        points: released,
        finalizedAt,
      }
    : { key: 'Customer task view points released', finalizedAt }
}

export type CustomerErrorMessage =
  | { kind: 'key'; key: string }
  | { kind: 'text'; text: string }

/**
 * Canvas Web order: the administrator confirmation message, then the frozen
 * localized customer message (a mapping's text or the category default), then
 * the client fallback. Upstream text only appears as the separate reason.
 */
export function customerErrorMessage(
  task: CustomerTask,
  language: string
): CustomerErrorMessage {
  const locale = normalizeInterfaceLanguage(language)
  const errors = task.taskError
    ? [task.taskError]
    : task.outputs.map((output) => output.error)
  for (const error of errors) {
    if (!error) continue
    if (error.code === ADMIN_CONFIRMED_UPSTREAM_FAILURE_CODE) {
      return { kind: 'key', key: ADMIN_CONFIRMED_UPSTREAM_FAILURE_CODE }
    }
    const localized = error.messages?.[locale]?.trim()
    if (localized) return { kind: 'text', text: localized }
    if (task.taskError) break
  }
  return { kind: 'key', key: CUSTOMER_FALLBACK_ERROR_KEY }
}

/**
 * The upstream reason Cloud attached for customers, shown under the error
 * message; across several failed results it is kept only when all agree.
 */
export function customerUpstreamReason(task: CustomerTask): string | null {
  const errors = task.taskError
    ? [task.taskError]
    : task.outputs
        .filter((output) => output.executionStatus === 'CONFIRMED_FAILED')
        .map((output) => output.error)
  const reasons = errors.map((error) => error?.upstreamReason?.trim() || null)
  return reasons[0] && reasons.every((reason) => reason === reasons[0])
    ? reasons[0]
    : null
}

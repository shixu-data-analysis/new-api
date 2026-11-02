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
import type { CanvasAdminTaskRecordDetail } from './types'

/**
 * The frozen results an administrator can end: a processing task is force-ended (its results still executing or already
 * UNKNOWN), any other task releases its UNKNOWN results. Legacy request-billed tasks have no output rows; the task itself
 * is the frozen result.
 */
export function endableResults(task: CanvasAdminTaskRecordDetail) {
  const forceEnd =
    task.executionStatus === 'PROCESSING' &&
    task.customerBillingStatus === 'FROZEN'
  const outputs = task.outputs.filter(
    (output) =>
      output.billingStatus === 'FROZEN' &&
      (forceEnd
        ? ['ACCEPTED', 'PROCESSING', 'UNKNOWN'].includes(output.executionStatus)
        : output.executionStatus === 'UNKNOWN')
  )
  const legacyTask =
    task.outputs.length === 0 &&
    task.customerBillingStatus === 'FROZEN' &&
    (forceEnd || task.executionStatus === 'UNKNOWN')
  return {
    forceEnd,
    count: legacyTask ? 1 : outputs.length,
    points: legacyTask
      ? task.quotedPoints
      : outputs
          .reduce((sum, output) => sum + BigInt(output.quotedPoints), 0n)
          .toString(),
  }
}

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
import type { DashboardPeriodType } from './operating-dashboard-types'

/** Rounds a decimal RMB string to 0.0001 RMB, half away from zero, without going through Number. */
export function rmbToTenThousandths(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/u.exec(value)
  if (!match) throw new RangeError(`Invalid RMB amount: ${value}`)
  const [, sign = '', integer = '0', fraction = ''] = match
  let units =
    BigInt(integer) * 10_000n + BigInt(fraction.slice(0, 4).padEnd(4, '0'))
  if ((fraction[4] ?? '0') >= '5') units += 1n
  return sign && units ? -units : units
}

export function tenThousandthsToRmb(units: bigint): string {
  const absolute = units < 0n ? -units : units
  return `${units < 0n ? '-' : ''}${absolute / 10_000n}.${(absolute % 10_000n).toString().padStart(4, '0')}`
}

/**
 * The consumption equation must add up to the last shown digit (0.0001 RMB): the three base amounts are rounded first
 * and the gift part and both contributions are their differences.
 */
export function consumptionEquation(input: {
  listAmountRmb: string
  cashSupportRmb: string
  recordedCostRmb: string
}) {
  const list = rmbToTenThousandths(input.listAmountRmb)
  const cash = rmbToTenThousandths(input.cashSupportRmb)
  const cost = rmbToTenThousandths(input.recordedCostRmb)
  return {
    listAmount: tenThousandthsToRmb(list),
    gift: tenThousandthsToRmb(list - cash),
    cashSupport: tenThousandthsToRmb(cash),
    recordedCost: tenThousandthsToRmb(cost),
    contribution: tenThousandthsToRmb(cash - cost),
    listContribution: tenThousandthsToRmb(list - cost),
  }
}

export type PreviousChange =
  | { kind: 'up' | 'down'; percent: string }
  | { kind: 'flat' }
  | { kind: 'notApplicable' }

/** "Compared with the previous period": one decimal, flat when equal, not applicable when the previous value is zero. */
export function previousChange(
  current: string,
  previous: string
): PreviousChange {
  const now = Number(current)
  const before = Number(previous)
  if (now === before) return { kind: 'flat' }
  if (before === 0) return { kind: 'notApplicable' }
  const change = ((now - before) / Math.abs(before)) * 100
  const percent = Math.abs(change).toFixed(1)
  if (percent === '0.0') return { kind: 'flat' }
  return { kind: change > 0 ? 'up' : 'down', percent }
}

const MINUTE_MS = 60_000

/** The period of a preset in the browser time zone; the end of an open period is left to the server (its query time). */
export function presetPeriod(
  periodType: Exclude<DashboardPeriodType, 'CUSTOM'>,
  now: Date
): { from: Date; to?: Date } {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  if (periodType === 'MONTH') return { from: monthStart }
  if (periodType === 'LAST_MONTH') {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: monthStart,
    }
  }
  return { from: new Date(now.getTime() - 30 * 24 * 60 * MINUTE_MS) }
}

export const MAX_DASHBOARD_SPAN_DAYS = 366

export type CustomPeriodError =
  | 'incomplete'
  | 'order'
  | 'future'
  | 'span'
  | undefined

/** Mirrors the server's checks so an invalid custom period is never sent. */
export function customPeriodError(
  from: Date | undefined,
  to: Date | undefined,
  now: Date
): CustomPeriodError {
  if (!from || !to) return 'incomplete'
  if (from.getTime() >= to.getTime()) return 'order'
  if (to.getTime() > now.getTime()) return 'future'
  if (
    to.getTime() - from.getTime() >
    MAX_DASHBOARD_SPAN_DAYS * 24 * 60 * MINUTE_MS
  ) {
    return 'span'
  }
  return undefined
}

/** Minute precision: seconds are dropped so the submitted instant matches what the administrator sees. */
export function toMinute(value: Date): Date {
  const copy = new Date(value)
  copy.setSeconds(0, 0)
  return copy
}

export function ratioOrNull(value: string | null): number | null {
  return value === null ? null : Number(value)
}

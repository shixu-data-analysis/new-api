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
import type { CanvasTimeOfDaySchedule } from '../types'
import {
  clockText,
  minutesOf,
  multiplierText,
  rulePieces,
  zonedClock,
} from './time-of-day'

// What customers and agents read about a spec priced by time of day: the multiplier now and when it changes, every
// period, and prices at the multiplier now. Words, not "×2"; times stay in the Provider's zone.

export interface TimeOfDayNowState {
  multiplier: string
  until: string | null
  next: { at: string; day: number | null; multiplier: string } | null
  ruleIndex: number | null
}

const DAY_MINUTES = 1440
const RATE_SCALE = 100_000_000n

function scheduleRules(schedule: CanvasTimeOfDaySchedule) {
  return schedule.rules.map((rule, index) => ({ ...rule, id: String(index) }))
}

export function timeOfDayNowState(
  schedule: CanvasTimeOfDaySchedule,
  at = new Date()
): TimeOfDayNowState {
  const { day, minute } = zonedClock(schedule.timeZone, at)
  const pieces = scheduleRules(schedule).flatMap((rule, index) =>
    rulePieces(rule, index).map((piece) => ({
      ...piece,
      multiplier: rule.multiplier,
    }))
  )
  const current = pieces.find(
    (piece) => piece.day === day && piece.from <= minute && minute < piece.to
  )
  if (current) {
    const continued =
      current.to === DAY_MINUTES
        ? pieces.find(
            (piece) =>
              piece.rule === current.rule &&
              piece.from === 0 &&
              piece.day === (day === 7 ? 1 : day + 1)
          )
        : undefined
    return {
      multiplier: multiplierText(current.multiplier),
      until: clockText((continued ?? current).to % DAY_MINUTES),
      next: null,
      ruleIndex: current.rule,
    }
  }
  let best: { offset: number; piece: (typeof pieces)[number] } | null = null
  for (const piece of pieces) {
    let offset = ((piece.day - day + 7) % 7) * DAY_MINUTES + piece.from - minute
    if (offset <= 0) offset += 7 * DAY_MINUTES
    if (!best || offset < best.offset) best = { offset, piece }
  }
  return {
    multiplier: '1',
    until: null,
    next: best
      ? {
          at: clockText(best.piece.from),
          day: best.piece.day === day ? null : best.piece.day,
          multiplier: multiplierText(best.piece.multiplier),
        }
      : null,
    ruleIndex: null,
  }
}

/** Every period, a period into the next day marked, then the rest at the regular price. */
export function timeOfDayPeriods(schedule: CanvasTimeOfDaySchedule) {
  return schedule.rules.map((rule, index) => ({
    index,
    days: rule.days,
    start: rule.start,
    end: rule.end,
    nextDay:
      (minutesOf(rule.end, true) ?? 0) <= (minutesOf(rule.start, false) ?? 0),
    multiplier: multiplierText(rule.multiplier),
  }))
}

// rate × multiplier, exact to 8 places then trimmed.
export function rateAtMultiplier(rate: string, multiplier: string): string {
  if (Number(multiplier) === 1 || !/^\d+(\.\d+)?$/.test(rate)) return rate
  const [whole, fraction = ''] = rate.split('.')
  const value =
    BigInt(whole as string) * RATE_SCALE +
    BigInt(fraction.padEnd(8, '0').slice(0, 8))
  const [mWhole, mFraction = ''] = multiplier.split('.')
  const hundredths =
    BigInt(mWhole as string) * 100n +
    BigInt(mFraction.padEnd(2, '0').slice(0, 2))
  const product = (value * hundredths + 50n) / 100n
  return `${product / RATE_SCALE}.${(product % RATE_SCALE).toString().padStart(8, '0')}`.replace(
    /\.?0+$/,
    ''
  )
}

export function ratesAtMultiplier<T extends Partial<Record<string, string>>>(
  rates: T,
  multiplier: string
): T {
  return Object.fromEntries(
    Object.entries(rates).map(([key, value]) => [
      key,
      typeof value === 'string' ? rateAtMultiplier(value, multiplier) : value,
    ])
  ) as T
}

/** The one schedule every priced spec shares, shown once under the prices; null when specs differ or have none. */
export function sharedTimeOfDaySchedule(
  prices: Array<{ timeOfDaySchedule?: CanvasTimeOfDaySchedule }>
): CanvasTimeOfDaySchedule | null {
  const schedules = prices.map((price) => price.timeOfDaySchedule)
  const first = schedules[0]
  const same = schedules.every(
    (schedule) => JSON.stringify(schedule) === JSON.stringify(first)
  )
  return first && same ? first : null
}

/** Customer points of a yuan price at the issuance rate, rounded up like a published price (exact decimals). */
export function pointsAtRate(yuan: string, pointsPerRmb: string): string {
  const scaled = (value: string) => {
    const [whole, fraction = ''] = value.split('.')
    return (
      BigInt(whole as string) * RATE_SCALE +
      BigInt(fraction.padEnd(8, '0').slice(0, 8))
    )
  }
  const product = scaled(yuan) * scaled(pointsPerRmb)
  const unit = RATE_SCALE * RATE_SCALE
  return ((product + unit - 1n) / unit).toString()
}

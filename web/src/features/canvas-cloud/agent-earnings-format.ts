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
import { formatExactRmbReference } from './number-format'

// Earnings and withdrawals are always shown in Beijing time.
export const BEIJING_TIME_ZONE = 'Asia/Shanghai'

function trimFraction(value: string, decimal: string): string {
  if (!value.includes(decimal)) return value
  const trimmed = value.replace(/0+$/u, '')
  return trimmed.endsWith(decimal) ? trimmed.slice(0, -decimal.length) : trimmed
}

function decimalSeparator(locale?: string): string {
  return (
    new Intl.NumberFormat(locale)
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? '.'
  )
}

/** RMB minor units (fen) as "¥1,234.5": grouped digits, trailing zeros removed. */
export function formatRmbMinor(
  minor: string | number | bigint,
  locale?: string
): string {
  const value = BigInt(minor)
  const negative = value < 0n
  const absolute = negative ? -value : value
  const text = `${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`
  return `${negative ? '-' : ''}¥${formatExactRmbReference(text, locale)}`
}

/** RMB yuan with up to 12 decimals, rounded to fen, as "¥0.4". */
export function formatRmbYuan(value: string, locale?: string): string {
  return `¥${trimFraction(formatExactRmbReference(value, locale, 2), decimalSeparator(locale))}`
}

/** Basis points (1/10000) as a percentage with at most two decimals, for example 4000 → "40%". */
export function formatBasisPointsPercent(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100)
  const fraction = String(basisPoints % 100)
    .padStart(2, '0')
    .replace(/0+$/u, '')
  return `${whole}${fraction ? `.${fraction}` : ''}%`
}

/** Date and time in Beijing time, for example "2026/9/16 09:30". */
export function formatBeijingDateTime(
  value: string | null,
  locale?: string
): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat(locale, {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

/** "YYYY-MM" → its month number and the month and year of the following 1st, when the month is settled. */
export function settlementMonths(periodMonth: string): {
  month: number
  nextMonth: number
  nextYear: boolean
} {
  const month = Number(periodMonth.slice(5, 7))
  return {
    month,
    nextMonth: month === 12 ? 1 : month + 1,
    nextYear: month === 12,
  }
}

const AMOUNT = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/u

/** RMB entered by a person, with at most two decimals, in fen; null when the format is invalid or not positive. */
export function parseRmbInput(value: string): bigint | null {
  const trimmed = value.trim()
  if (!AMOUNT.test(trimmed)) return null
  const [whole, fraction = ''] = trimmed.split('.')
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  return minor > 0n ? minor : null
}

/** Withholding tax in fen: amount × rate, rounded half up to fen (the server's rule). */
export function withholdingTaxMinor(
  amountMinor: bigint,
  taxRateBasisPoints: number
): bigint {
  return (amountMinor * BigInt(taxRateBasisPoints) * 2n + 10_000n) / 20_000n
}

/** RMB minor units as the plain decimal the API accepts, for example 20050n → "200.5". */
export function rmbMinorToInput(minor: bigint): string {
  const fraction = (minor % 100n)
    .toString()
    .padStart(2, '0')
    .replace(/0+$/u, '')
  return `${minor / 100n}${fraction ? `.${fraction}` : ''}`
}

/** The Beijing-time month (YYYY-MM) of an instant, for statement links. */
export function beijingMonthOf(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(value))
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`
}

export function withdrawalStatusLabelKey(
  status: 'REQUESTED' | 'PAID' | 'REJECTED'
): string {
  return {
    REQUESTED: 'Withdrawal requested',
    PAID: 'Withdrawal paid',
    REJECTED: 'Withdrawal rejected',
  }[status]
}

/** Dedicated "Enabled / Disabled" wording for an agent's qualification; the generic status words stay unchanged. */
export function agentQualificationLabelKey(
  status: 'ACTIVE' | 'DISABLED'
): string {
  return status === 'ACTIVE' ? 'Agent status ACTIVE' : 'Agent status DISABLED'
}

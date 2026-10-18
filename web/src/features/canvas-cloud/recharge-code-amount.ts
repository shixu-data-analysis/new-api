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
/** A CNY amount in fen, or null when it is not a non-negative amount of at most two decimals. */
export function cnyToMinor(value: string): string | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim())
  const whole = match?.[1]
  if (whole === undefined) return null
  const minor =
    BigInt(whole) * 100n + BigInt((match?.[2] ?? '').padEnd(2, '0') || '0')
  return minor.toString()
}

const RATE_SCALE = 100_000_000n

/**
 * The Paid points an amount in fen buys at an issuance rate (points per yuan, up to 8 decimals), or null when they are
 * not whole: Cloud's points = fen x R / 100, computed exactly.
 */
export function rechargeCodePaidPoints(
  amountMinor: string,
  pointsPerRmb: string
): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(pointsPerRmb.trim())
  const whole = match?.[1]
  if (whole === undefined) return null
  const scaledRate =
    BigInt(whole) * RATE_SCALE + BigInt((match?.[2] ?? '').padEnd(8, '0'))
  const scaledPoints = BigInt(amountMinor) * scaledRate
  if (scaledPoints % (100n * RATE_SCALE) !== 0n) return null
  return scaledPoints / (100n * RATE_SCALE)
}

/**
 * Admin inventory lookup accepts only the complete generated code.  Partial
 * values must never silently degrade into an unfiltered inventory request.
 */
export function normalizeRechargeCodeInventorySearch(
  value: string
): string | null {
  const normalized = value.trim().toUpperCase()
  return /^CANVAS-[A-Z0-9]{24}$/u.test(normalized) ? normalized : null
}

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
*/
export type CanvasPointLotType = 'PAID' | 'BONUS' | 'GRACE_BONUS'
export type CanvasPointConversionState =
  | 'available'
  | 'reserved'
  | 'expiring'
  | 'expired'

export interface CanvasPointConversionQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  search?: string
  lotType?: CanvasPointLotType
  state?: CanvasPointConversionState
  expiryDays?: number
  sortBy:
    | 'customer'
    | 'lotType'
    | 'effectivePoints'
    | 'availablePoints'
    | 'reservedPoints'
    | 'referenceAmountRmb'
    | 'expiresAt'
    | 'issuedAt'
  sortOrder: 'asc' | 'desc'
}

export interface CanvasPointConversionSummary {
  total: number
  effectivePoints: string
  availablePoints: string
  reservedPoints: string
  referenceAmountRmb: string
  averageRmbPerPoint: string | null
  expiringPoints: string
  expiredUnclearedPoints: string
}

export interface CanvasPointConversionLot {
  id: string
  customerId: string
  customer: string
  lotType: CanvasPointLotType
  sourceType: string
  effectivePoints: string
  availablePoints: string
  reservedPoints: string
  referenceAmountRmb: string
  minorPerPointSnapshot: string
  expiresAt: string | null
  issuedAt: string
  expired: boolean
  expiring: boolean
  rechargeOrderId: string | null
  promotionVersionId: string | null
}

export interface CanvasPointConversionReport {
  at: string
  expiryDays: number
  summary: CanvasPointConversionSummary
  composition: Array<
    CanvasPointConversionSummary & { lotType: CanvasPointLotType }
  >
  items: CanvasPointConversionLot[]
  total: number
  page: number
  pageSize: number
}

/** Formats an integer string through Intl without first losing precision to Number. */
export function formatExactPointQuantity(
  value: string,
  locale?: string
): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    BigInt(value)
  )
}

/** Keeps the server's fixed decimal reference precise while applying locale grouping. */
export function formatExactRmbReference(
  value: string,
  locale?: string
): string {
  const [integer, fraction = ''] = value.split('.')
  const formattedInteger = formatExactPointQuantity(integer, locale)
  const significantFraction = fraction.replace(/0+$/u, '')
  return significantFraction
    ? `${formattedInteger}.${significantFraction}`
    : formattedInteger
}

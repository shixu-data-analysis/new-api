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
import { describe, expect, it, vi } from 'vitest'

import { isCanvasDateRangeValid } from '../date-range'
import {
  bonusAdjustmentSchema,
  deductionSchema,
  paidCorrectionSchema,
  refundRecoverySchema,
} from '../form-validation'

describe('Canvas governed form validation', () => {
  it('shares positive integer and required reason rules while keeping schemas separate', () => {
    vi.setSystemTime(new Date('2026-09-01T00:00:00.000Z'))
    expect(
      bonusAdjustmentSchema.safeParse({
        points: '10',
        expiresAt: new Date('2026-12-01T00:00:00.000Z'),
        reason: '  customer-visible reason  ',
      }).success
    ).toBe(true)
    expect(
      bonusAdjustmentSchema.safeParse({
        points: '0',
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        reason: ' ',
      }).success
    ).toBe(false)
    expect(
      paidCorrectionSchema('10').safeParse({
        rechargeOrderId: '85000000-0000-7000-8000-000000000001',
        points: '1',
        reason: 'correction',
      }).success
    ).toBe(true)
    expect(
      paidCorrectionSchema('10').safeParse({
        rechargeOrderId: '85000000-0000-7000-8000-000000000001',
        points: '11',
        reason: 'correction',
      }).success
    ).toBe(false)
    expect(
      refundRecoverySchema.safeParse({
        rechargeOrderId: '85000000-0000-7000-8000-000000000001',
        confirmedRefundAmountMinor: '1',
        refundConfirmationReference: 'refund',
        customerConfirmationReference: 'customer',
        reason: '',
      }).success
    ).toBe(false)
  })

  it('rejects zero and deductions above the selected Lot availability', () => {
    const schema = deductionSchema('30')
    expect(
      schema.safeParse({
        pointLotId: '85000000-0000-7000-8000-000000000001',
        points: '30',
        reason: 'confirmed',
      }).success
    ).toBe(true)
    expect(
      schema.safeParse({
        pointLotId: '85000000-0000-7000-8000-000000000001',
        points: '31',
        reason: 'confirmed',
      }).success
    ).toBe(false)
    expect(
      schema.safeParse({
        pointLotId: '85000000-0000-7000-8000-000000000001',
        points: '0',
        reason: 'confirmed',
      }).success
    ).toBe(false)
  })

  it('shares chronological validation for server-side date range filters', () => {
    const earlier = new Date('2026-09-01T00:00:00.000Z')
    const later = new Date('2026-09-02T00:00:00.000Z')
    expect(isCanvasDateRangeValid(undefined, later)).toBe(true)
    expect(isCanvasDateRangeValid(earlier, later)).toBe(true)
    expect(isCanvasDateRangeValid(later, earlier)).toBe(false)
  })
})

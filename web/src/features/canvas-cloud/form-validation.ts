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
import * as z from 'zod'

export const requiredTrimmedText = (maxLength: number) =>
  z.string().trim().min(1, 'This field is required').max(maxLength)

export const positiveIntegerText = z
  .string()
  .trim()
  .regex(/^[1-9]\d*$/, 'Enter a positive whole number')

export const futureDate = z
  .date({ error: 'This field is required' })
  .refine((value) => value.getTime() > Date.now(), 'Choose a future time')

export const bonusAdjustmentSchema = z.object({
  points: positiveIntegerText,
  expiresAt: futureDate,
  reason: requiredTrimmedText(255),
})

export const paidCorrectionSchema = (remainingCorrectionPoints: string) =>
  z.object({
    rechargeOrderId: z.string().uuid('Select a Canvas recharge order'),
    points: positiveIntegerText.refine(
      (value) => BigInt(value) <= BigInt(remainingCorrectionPoints || '0'),
      'Points cannot exceed the remaining correction amount'
    ),
    reason: requiredTrimmedText(255),
  })

export const deductionSchema = (availablePoints: string) =>
  z.object({
    pointLotId: z.string().uuid('Select a Point Lot'),
    points: positiveIntegerText.refine(
      (value) => BigInt(value) <= BigInt(availablePoints || '0'),
      'Points cannot exceed the available balance'
    ),
    reason: requiredTrimmedText(255),
  })

export const refundRecoverySchema = z.object({
  rechargeOrderId: z.string().uuid('Select a Canvas recharge order'),
  confirmedRefundAmountMinor: positiveIntegerText,
  refundConfirmationReference: requiredTrimmedText(191),
  customerConfirmationReference: requiredTrimmedText(191),
  reason: requiredTrimmedText(255),
})

export type BonusAdjustmentValues = z.infer<typeof bonusAdjustmentSchema>
export type PaidCorrectionValues = z.infer<
  ReturnType<typeof paidCorrectionSchema>
>
export type DeductionValues = z.infer<ReturnType<typeof deductionSchema>>
export type RefundRecoveryValues = z.infer<typeof refundRecoverySchema>

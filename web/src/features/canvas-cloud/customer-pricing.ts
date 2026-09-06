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

import type {
  CanvasBillingUnit,
  CanvasProviderPricingRow,
  CanvasTokenRateVector,
} from './types'

type MatrixPrice = CanvasProviderPricingRow['prices'][number]

const fixedDecimal = z
  .string()
  .trim()
  .regex(
    /^(0|[1-9]\d*)(?:\.\d{1,8})?$/u,
    'Enter 0 or a positive decimal with up to 8 places'
  )
const tokenVector = z.object({
  input: fixedDecimal,
  output: fixedDecimal,
  cacheRead: fixedDecimal,
  cacheWrite: fixedDecimal,
})
const rate = z
  .string()
  .trim()
  .regex(/^0(?:\.\d{1,6})?$/u, 'Enter a rate from 0 up to but not including 1')
  .refine(
    (value) => Number(value) < 1,
    'Enter a rate from 0 up to but not including 1'
  )
const probability = z
  .string()
  .trim()
  .regex(
    /^(?:0\.\d{1,6}|1(?:\.0{1,6})?)$/u,
    'Enter a probability greater than 0 and no more than 1'
  )

export const customerPriceFormSchema = z
  .object({
    priceGroupId: z.string().min(1, 'Select a price group'),
    billingUnit: z.enum(['REQUEST', 'SECOND', 'MILLION_TOKENS']),
    points: z.string().trim(),
    tokenRates: tokenVector,
    targetMarginRate: rate,
    successProbability: probability,
    successfulTaskCostRmb: fixedDecimal,
    failedUnrecoverableCostRmb: fixedDecimal,
    otherVariableCostRmb: fixedDecimal,
    riskBufferRmb: fixedDecimal,
    effectiveAt: z.string(),
    decisionSummary: z.string().trim().max(2_000),
  })
  .superRefine((value, context) => {
    if (
      value.billingUnit !== 'MILLION_TOKENS' &&
      !/^[1-9]\d*$/u.test(value.points)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['points'],
        message: 'Enter a positive whole number of points',
      })
    }
    if (value.effectiveAt) {
      const effectiveAt = new Date(value.effectiveAt)
      if (
        !Number.isFinite(effectiveAt.getTime()) ||
        effectiveAt <= new Date()
      ) {
        context.addIssue({
          code: 'custom',
          path: ['effectiveAt'],
          message: 'Scheduled publication must be in the future',
        })
      }
    }
  })

export type CustomerPriceFormValues = z.infer<typeof customerPriceFormSchema>

const emptyVector = (): CanvasTokenRateVector => ({
  input: '0',
  output: '0',
  cacheRead: '0',
  cacheWrite: '0',
})

function snapshotValue(
  snapshot: Record<string, unknown> | undefined,
  key: string,
  fallback: string
): string {
  const value = snapshot?.[key]
  return typeof value === 'string' ? value : fallback
}

export function ceilCustomerTokenInput(value: string): string {
  const [integer = '0', fraction = ''] = value.split('.')
  return (BigInt(integer) + (fraction.replace(/0+$/u, '') ? 1n : 0n)).toString()
}

export function customerPriceFormValues(
  row: CanvasProviderPricingRow,
  price?: MatrixPrice
): CustomerPriceFormValues {
  const source = price ?? row.prices.find((item) => item.status === 'PUBLISHED')
  const snapshot = source?.pricing_assumptions_snapshot
  const billingUnit: CanvasBillingUnit =
    price?.billingUnit ?? row.billingUnit ?? 'REQUEST'
  const providerCost =
    billingUnit === 'MILLION_TOKENS'
      ? (row.normalizedTokenRates?.input ?? '0')
      : (row.normalizedAmountMinor ?? '0')
  return {
    priceGroupId: price?.groupId ?? '',
    billingUnit,
    points: source?.points ?? (billingUnit === 'MILLION_TOKENS' ? '0' : ''),
    tokenRates: source?.tokenRates ?? emptyVector(),
    targetMarginRate: snapshotValue(snapshot, 'targetMarginRate', '0.25'),
    successProbability:
      source?.success_probability ??
      snapshotValue(snapshot, 'successProbability', '0.9'),
    successfulTaskCostRmb: snapshotValue(
      snapshot,
      'successfulTaskCostRmb',
      providerCost
    ),
    failedUnrecoverableCostRmb: snapshotValue(
      snapshot,
      'failedUnrecoverableCostRmb',
      '0'
    ),
    otherVariableCostRmb: snapshotValue(snapshot, 'otherVariableCostRmb', '0'),
    riskBufferRmb:
      source?.risk_buffer_minor ??
      snapshotValue(snapshot, 'riskBufferRmb', '0'),
    effectiveAt: '',
    decisionSummary: '',
  }
}

export function customerPriceRequest(
  values: CustomerPriceFormValues,
  sourcePriceVersionId?: string
) {
  const tokenBased = values.billingUnit === 'MILLION_TOKENS'
  return {
    ...(sourcePriceVersionId ? { sourcePriceVersionId } : {}),
    billingUnit: values.billingUnit,
    points: tokenBased
      ? ceilCustomerTokenInput(values.tokenRates.input)
      : values.points,
    ...(tokenBased ? { tokenRates: values.tokenRates } : {}),
    targetMarginRate: values.targetMarginRate,
    successProbability: values.successProbability,
    successfulTaskCostRmb: values.successfulTaskCostRmb,
    failedUnrecoverableCostRmb: values.failedUnrecoverableCostRmb,
    otherVariableCostRmb: values.otherVariableCostRmb,
    riskBufferRmb: values.riskBufferRmb,
    ...(values.decisionSummary
      ? { decisionSummary: values.decisionSummary }
      : {}),
    ...(values.effectiveAt
      ? { effectiveAt: new Date(values.effectiveAt).toISOString() }
      : {}),
  }
}

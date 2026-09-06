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
  CanvasTokenCategory,
  CanvasTokenRateVector,
} from './types'

export const providerTokenCategories = [
  'input',
  'output',
  'cacheRead',
  'cacheWrite',
] as const satisfies readonly CanvasTokenCategory[]

export const providerTokenCategoryLabel: Record<CanvasTokenCategory, string> = {
  input: 'Input tokens',
  output: 'Output tokens',
  cacheRead: 'Cache read',
  cacheWrite: 'Cache write',
}

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

export const providerRateFormSchema = z
  .object({
    targetId: z.string().min(1, 'Select a model and quality'),
    billingUnit: z.enum(['REQUEST', 'SECOND', 'MILLION_TOKENS']),
    nativeAmount: fixedDecimal,
    normalizedAmountMinor: fixedDecimal,
    tokenRates: tokenVector,
    normalizedTokenRates: tokenVector,
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/u, 'Enter a 3-letter currency code'),
    exchangeRate: fixedDecimal.refine(
      (value) => value !== '0',
      'Exchange rate must be greater than 0'
    ),
    exchangeSource: z
      .string()
      .trim()
      .min(1, 'Enter the exchange-rate source')
      .max(191),
    effectiveAt: z.string(),
    failureMode: z.enum(['NONE', 'SAME_AS_SUCCESS', 'FIXED']),
    fixedFailureCost: z.string().trim(),
    decisionSummary: z
      .string()
      .trim()
      .min(8, 'Enter at least 8 characters')
      .max(2_000),
  })
  .superRefine((value, context) => {
    if (
      value.billingUnit === 'MILLION_TOKENS' &&
      value.failureMode === 'FIXED'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['failureMode'],
        message: 'Token rates cannot use a fixed failure charge',
      })
    }
    if (
      value.failureMode === 'FIXED' &&
      !fixedDecimal.safeParse(value.fixedFailureCost).success
    ) {
      context.addIssue({
        code: 'custom',
        path: ['fixedFailureCost'],
        message: 'Enter 0 or a positive decimal with up to 8 places',
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

export type ProviderRateFormValues = z.infer<typeof providerRateFormSchema>

const emptyVector = (): CanvasTokenRateVector => ({
  input: '0',
  output: '0',
  cacheRead: '0',
  cacheWrite: '0',
})

export function providerBillingUnit(
  row: CanvasProviderPricingRow
): CanvasBillingUnit {
  const frozen = row.billingUnit ?? row.billingDimensions.billingUnit
  return frozen === 'SECOND' || frozen === 'MILLION_TOKENS' ? frozen : 'REQUEST'
}

export function providerRateFormValues(
  row?: CanvasProviderPricingRow
): ProviderRateFormValues {
  const billingUnit = row ? providerBillingUnit(row) : 'REQUEST'
  const tokenRates = row?.tokenRates ?? emptyVector()
  const normalizedTokenRates = row?.normalizedTokenRates ?? emptyVector()
  const failure = row?.failureChargePolicy
  return {
    targetId: row?.combinationId ?? '',
    billingUnit,
    nativeAmount:
      billingUnit === 'MILLION_TOKENS'
        ? tokenRates.input
        : (row?.nativeAmount ?? '0'),
    normalizedAmountMinor:
      billingUnit === 'MILLION_TOKENS'
        ? normalizedTokenRates.input
        : (row?.normalizedAmountMinor ?? '0'),
    tokenRates,
    normalizedTokenRates,
    currency: row?.currency ?? 'CNY',
    exchangeRate: '1',
    exchangeSource: '',
    effectiveAt: '',
    failureMode: failure?.mode ?? 'NONE',
    fixedFailureCost:
      failure?.mode === 'FIXED' ? failure.normalizedAmountMinor : '0',
    decisionSummary: '',
  }
}

export function providerRateRequest(
  values: ProviderRateFormValues,
  row: CanvasProviderPricingRow,
  asOf: string
) {
  const tokenBased = values.billingUnit === 'MILLION_TOKENS'
  return {
    customerModelId: row.customerModelId,
    parameterCombinationId: row.combinationId,
    billingUnit: values.billingUnit,
    nativeAmount: tokenBased ? values.tokenRates.input : values.nativeAmount,
    ...(tokenBased ? { tokenRates: values.tokenRates } : {}),
    currency: values.currency,
    exchangeRateSnapshot: {
      rate: values.exchangeRate,
      source: values.exchangeSource,
      asOf,
    },
    normalizedAmountMinor: tokenBased
      ? values.normalizedTokenRates.input
      : values.normalizedAmountMinor,
    ...(tokenBased
      ? { normalizedTokenRates: values.normalizedTokenRates }
      : {}),
    failureChargePolicy:
      values.failureMode === 'FIXED'
        ? ({
            mode: 'FIXED',
            normalizedAmountMinor: values.fixedFailureCost,
          } as const)
        : ({ mode: values.failureMode } as const),
    decisionSummary: values.decisionSummary,
    ...(values.effectiveAt
      ? { effectiveAt: new Date(values.effectiveAt).toISOString() }
      : {}),
  }
}

export const providerRiskFormSchema = z
  .object({
    decisionType: z.enum([
      'REPRICE_SCHEDULED',
      'MANUAL_PAUSE',
      'TEMPORARY_LOSS',
    ]),
    lossEndsAt: z.string(),
    maxExpectedLossPoints: z.string().trim(),
    reason: z.string().trim().min(8, 'Enter at least 8 characters').max(2_000),
  })
  .superRefine((value, context) => {
    if (value.decisionType !== 'TEMPORARY_LOSS') return
    if (!value.lossEndsAt || new Date(value.lossEndsAt) <= new Date()) {
      context.addIssue({
        code: 'custom',
        path: ['lossEndsAt'],
        message: 'Loss deadline must be in the future',
      })
    }
    if (!/^[1-9]\d*$/u.test(value.maxExpectedLossPoints)) {
      context.addIssue({
        code: 'custom',
        path: ['maxExpectedLossPoints'],
        message: 'Enter a positive whole point budget',
      })
    }
  })

export type ProviderRiskFormValues = z.infer<typeof providerRiskFormSchema>

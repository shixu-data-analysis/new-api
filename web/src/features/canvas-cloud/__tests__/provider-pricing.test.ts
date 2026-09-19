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
import { describe, expect, it } from 'vitest'

import {
  providerBillingUnit,
  providerRateFormSchema,
  providerRateFormValues,
  providerRateRequest,
} from '../provider-pricing'
import type { CanvasProviderPricingRow } from '../types'

function row(
  overrides: Partial<CanvasProviderPricingRow> = {}
): CanvasProviderPricingRow {
  return {
    providerId: 'provider-1',
    providerCode: 'openai',
    providerName: 'OpenAI',
    channelId: 'channel-1',
    channelCode: 'primary',
    customerModelId: 'model-1',
    modelKey: 'video',
    modelName: 'Video',
    combinationId: 'quality-hd',
    combinationKey: 'quality=hd',
    parameters: { quality: 'hd' },
    billingDimensions: { billingUnit: 'REQUEST' },
    resolvedProviderModelId: 'video-hd',
    rateId: null,
    rateVersion: null,
    rateStatus: null,
    billingUnit: 'REQUEST',
    nativeAmount: null,
    tokenRates: null,
    currency: null,
    normalizedAmountMinor: null,
    normalizedTokenRates: null,
    failureChargePolicy: null,
    rateEffectiveAt: null,
    prices: [],
    riskDecision: null,
    ...overrides,
  }
}

describe('provider pricing form contract', () => {
  it('uses the frozen top-level billing unit', () => {
    expect(
      providerBillingUnit(
        row({
          billingUnit: 'MILLION_TOKENS',
          billingDimensions: { billingUnit: 'REQUEST' },
        })
      )
    ).toBe('MILLION_TOKENS')
  })

  it('builds the exact four-category token payload and representative scalars', () => {
    const target = row({
      billingUnit: 'MILLION_TOKENS',
      tokenRates: {
        input: '1.25',
        output: '2.5',
        cacheRead: '0',
        cacheWrite: '0.75',
      },
      normalizedTokenRates: {
        input: '8.1',
        output: '16.2',
        cacheRead: '0',
        cacheWrite: '4.8',
      },
      currency: 'USD',
    })
    const values = {
      ...providerRateFormValues(target),
      exchangeRate: '6.48',
      exchangeSource: 'contract',
      decisionSummary: 'Approved upstream contract',
    }

    expect(
      providerRateRequest(values, target, '2026-09-06T00:00:00.000Z')
    ).toEqual(
      expect.objectContaining({
        billingUnit: 'MILLION_TOKENS',
        nativeAmount: '1.25',
        normalizedAmountMinor: '8.1',
        tokenRates: target.tokenRates,
        normalizedTokenRates: target.normalizedTokenRates,
        failureChargePolicy: { mode: 'NONE' },
      })
    )
  })

  it('rejects a fixed failure charge for token billing', () => {
    const values = {
      ...providerRateFormValues(row({ billingUnit: 'MILLION_TOKENS' })),
      exchangeSource: 'contract',
      decisionSummary: 'Approved upstream contract',
      failureMode: 'FIXED' as const,
      fixedFailureCost: '1',
    }

    const result = providerRateFormSchema.safeParse(values)
    expect(result.success).toBe(false)
    expect(
      result.error?.issues.some((issue) => issue.path[0] === 'failureMode')
    ).toBe(true)
  })

  it('allows zero token categories without converting them through Number', () => {
    const values = {
      ...providerRateFormValues(row({ billingUnit: 'MILLION_TOKENS' })),
      tokenRates: {
        input: '9007199254740993.12345678',
        output: '0',
        cacheRead: '0',
        cacheWrite: '0',
      },
      normalizedTokenRates: {
        input: '9007199254740993.12345678',
        output: '0',
        cacheRead: '0',
        cacheWrite: '0',
      },
      exchangeSource: 'contract',
      decisionSummary: 'Approved upstream contract',
    }

    expect(providerRateFormSchema.safeParse(values).success).toBe(true)
  })
})

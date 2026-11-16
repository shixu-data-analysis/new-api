/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import type { ModelCardPrice } from '../components/ModelCardPrices'
import { oneTokenPrice } from '../lib/one-token-price'
import {
  inputTiersSummary,
  tokenCategoryLabelKey,
  tokenRateKeyName,
  tokenRateKeyOrder,
} from '../lib/token-rate-summary'

const spec = (
  quality: string,
  output = '18000',
  extra: Partial<ModelCardPrice> = {}
): ModelCardPrice => ({
  key: quality,
  parameters: { quality },
  billingUnit: 'MILLION_TOKENS',
  points: '0',
  tokenRates: { input: '3000', imageInput: '4800', output },
  ...extra,
})

describe('Token-billed image prices on cards (IMAGE-TOKEN-BILLING-001)', () => {
  it('names text input apart only for a model that prices image input', () => {
    expect(
      tokenCategoryLabelKey('input', ['input', 'imageInput', 'output'])
    ).toBe('Text input')
    expect(
      tokenCategoryLabelKey('imageInput', ['input', 'imageInput', 'output'])
    ).toBe('Image input')
    expect(tokenCategoryLabelKey('input', ['input', 'output'])).toBe('Input')
  })

  it('lists a price by input tier tier by tier and names each key after its tier', () => {
    const keys = ['output@2', 'input', 'input@2', 'output', 'prompt@2']
    expect(tokenRateKeyOrder(keys)).toEqual([
      'input',
      'output',
      'input@2',
      'output@2',
    ])
    const t = (value: string, options?: Record<string, unknown>) =>
      value
        .replace('{{tier}}', String(options?.tier ?? ''))
        .replace('{{tokens}}', String(options?.tokens ?? ''))
    const priced = ['input', 'output', 'input@2', 'output@2']
    expect(tokenRateKeyName('output@2', priced, t)).toBe(
      'Input tier 2 · Output'
    )
    expect(tokenRateKeyName('input', priced, t)).toBe('Input tier 1 · Input')
    expect(tokenRateKeyName('input', ['input', 'output'], t)).toBe('Input')
    expect(inputTiersSummary([272000], t)).toBe(
      'Input up to 272,000 Tokens; Input over 272,000 Tokens'
    )
  })

  it('names the cache write the 5-minute one only beside the one-hour write', () => {
    const split = ['input', 'output', 'cacheWrite', 'cacheWrite1h']
    expect(tokenCategoryLabelKey('cacheWrite', split)).toBe(
      'Cache write (5 minutes)'
    )
    expect(tokenCategoryLabelKey('cacheWrite1h', split)).toBe(
      'Cache write (1 hour)'
    )
    expect(
      tokenCategoryLabelKey('cacheWrite', ['input', 'output', 'cacheWrite'])
    ).toBe('Cache write')
  })

  it('shows one block without a spec name when every spec bills the same', () => {
    expect(oneTokenPrice([spec('1K'), spec('2K'), spec('4K')])).toEqual([
      { ...spec('1K'), parameters: {} },
    ])
    expect(oneTokenPrice([spec('1K'), spec('2K', '17000')])).toHaveLength(2)
    expect(
      oneTokenPrice([
        spec('1K', '18000', { priceIdentity: 'a' }),
        spec('2K', '18000', { priceIdentity: 'b' }),
      ])
    ).toHaveLength(2)
    const perRequest = {
      ...spec('1K'),
      billingUnit: 'REQUEST' as const,
      tokenRates: null,
      points: '5',
    }
    expect(
      oneTokenPrice([perRequest, { ...perRequest, key: '2K' }])
    ).toHaveLength(2)
  })
})

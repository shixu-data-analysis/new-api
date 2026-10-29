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
import { tokenCategoryLabelKey } from '../lib/token-rate-summary'

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

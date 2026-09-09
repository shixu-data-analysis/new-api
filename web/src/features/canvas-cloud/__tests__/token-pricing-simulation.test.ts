/*
Copyright (C) 2023-2026 QuantumNous
*/
import { describe, expect, it } from 'vitest'

import { calculateTokenCategoryPricing } from '../pricing-simulation'

const basis = {
  targetMarginPercent: '40',
  successProbabilityPercent: '50',
  successfulTaskCostRmb: '0',
  failedUnrecoverableCostRmb: '0',
  otherVariableCostRmb: '0',
  riskBufferRmb: '0',
  proposedPoints: '',
}

describe('Token category pricing', () => {
  it('uses each category cost and compares fractional customer rates without rounding them', () => {
    expect(
      calculateTokenCategoryPricing(basis, '100', '0.20', 'NONE', '20.00000001')
    ).toMatchObject({
      breakEvenPoints: '20',
      recommendedPoints: '34',
      verdict: 'BELOW_TARGET',
    })
    expect(
      calculateTokenCategoryPricing(basis, '100', '0.60', 'NONE', '60')
    ).toMatchObject({
      breakEvenPoints: '60',
      recommendedPoints: '100',
      verdict: 'BELOW_BREAK_EVEN',
    })
  })
  it('applies same-as-success failure costs separately and keeps zero-cost categories valid', () => {
    expect(
      calculateTokenCategoryPricing(
        basis,
        '100',
        '0.20',
        'SAME_AS_SUCCESS',
        '40'
      )
    ).toMatchObject({
      breakEvenPoints: '40',
      recommendedPoints: '67',
      verdict: 'BELOW_BREAK_EVEN',
    })
    expect(
      calculateTokenCategoryPricing(basis, '100', '0', 'NONE', '0')
    ).toMatchObject({
      breakEvenPoints: '0',
      recommendedPoints: '0',
      verdict: 'MEETS_TARGET',
    })
  })
  it('keeps malformed inputs unknown and a zero-margin recommendation above the provider floor', () => {
    expect(
      calculateTokenCategoryPricing(basis, '100', '', 'NONE', '0')
    ).toBeNull()
    expect(
      calculateTokenCategoryPricing(
        { ...basis, targetMarginPercent: '0' },
        '100',
        '0.20',
        'NONE',
        ''
      )
    ).toMatchObject({ recommendedPoints: '21', verdict: null })
  })
  it('includes the category own extra cost and buffer even when the provider cost is zero', () => {
    expect(
      calculateTokenCategoryPricing(
        { ...basis, otherVariableCostRmb: '0.10', riskBufferRmb: '0.05' },
        '100',
        '0',
        'NONE',
        '25'
      )
    ).toMatchObject({
      kPricingRmb: '0.25000000',
      breakEvenPoints: '25',
      recommendedPoints: '42',
      verdict: 'BELOW_BREAK_EVEN',
    })
  })
})

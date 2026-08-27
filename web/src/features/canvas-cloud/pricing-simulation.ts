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
export interface SimulationInput {
  successProbability: string
  successfulTaskCostRmb: string
  failedUnrecoverableCostRmb: string
  otherVariableCostRmb: string
  riskBufferRmb: string
  pointsPerRmb: string
  actualCostEligible: boolean
  actualCostRmb: string
  proposedPoints: string
}

export interface PricingSimulationResult {
  expectedAttemptCostRmb: string
  kTheoryRmb: string
  kPricingRmb: string
  pricingBasis: 'ACTUAL' | 'BUFFER'
  breakEvenRaw: string
  breakEvenPoints: string
  targetMarginRaw: string
  targetMarginPoints: string
  verdict: 'BELOW_BREAK_EVEN' | 'BELOW_TARGET' | 'MEETS_TARGET'
}

export interface PricingQuestionnaireAnswers {
  successProbabilityPercent: string
  successfulTaskCostRmb: string
  failedUnrecoverableCostRmb: string
  otherVariableCostRmb: string
  riskBufferRmb: string
  proposedPoints: string
}

export function probabilityPercentToDecimal(value: string): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return (numeric / 100).toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

export function probabilityDecimalToPercent(value: string): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return (numeric * 100).toFixed(2).replace(/\.?0+$/, '')
}

export function calculateQuestionnairePricing(
  answers: PricingQuestionnaireAnswers,
  pointsPerRmb: string
): PricingSimulationResult | null {
  try {
    return simulatePricing({
      successProbability: probabilityPercentToDecimal(
        answers.successProbabilityPercent
      ),
      successfulTaskCostRmb: answers.successfulTaskCostRmb,
      failedUnrecoverableCostRmb: answers.failedUnrecoverableCostRmb,
      otherVariableCostRmb: answers.otherVariableCostRmb,
      riskBufferRmb: answers.riskBufferRmb,
      pointsPerRmb,
      actualCostEligible: false,
      actualCostRmb: '0',
      proposedPoints: answers.proposedPoints,
    })
  } catch {
    return null
  }
}

function fixed(value: string, scale: number): bigint {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value)
  if (!match || (match[2]?.length ?? 0) > scale) throw new Error('invalid')
  return (
    BigInt(match[1]) * 10n ** BigInt(scale) +
    BigInt((match[2] ?? '').padEnd(scale, '0'))
  )
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator
}

function formatFixed(value: bigint, scale: number): string {
  const divisor = 10n ** BigInt(scale)
  return `${value / divisor}.${(value % divisor).toString().padStart(scale, '0')}`
}

function rawDecimal(numerator: bigint, denominator: bigint): string {
  return formatFixed((numerator * 100_000_000n) / denominator, 8)
}

export function simulatePricing(
  input: SimulationInput
): PricingSimulationResult {
  const one = 1_000_000n
  const q = fixed(input.successProbability, 6)
  if (q <= 0n || q > one) throw new Error('invalid')
  const success = fixed(input.successfulTaskCostRmb, 8)
  const failure = fixed(input.failedUnrecoverableCostRmb, 8)
  const other = fixed(input.otherVariableCostRmb, 8)
  const buffer = fixed(input.riskBufferRmb, 8)
  const rate = fixed(input.pointsPerRmb, 8)
  const proposed = fixed(input.proposedPoints, 0)
  if (rate <= 0n || proposed <= 0n) throw new Error('invalid')

  const expectedNumerator = q * success + (one - q) * failure + one * other
  const theory = ceilDivide(expectedNumerator, q)
  let pricing = theory + buffer
  let pricingBasis: PricingSimulationResult['pricingBasis'] = 'BUFFER'
  if (input.actualCostEligible) {
    const actual = fixed(input.actualCostRmb, 8)
    pricing = theory > actual ? theory : actual
    pricingBasis = 'ACTUAL'
  }
  const pointDenominator = 100_000_000n * 100_000_000n
  const breakNumerator = pricing * rate
  const breakEven = ceilDivide(breakNumerator, pointDenominator)
  const targetNumerator = breakNumerator * one
  const targetDenominator = pointDenominator * 600_000n
  const target = ceilDivide(targetNumerator, targetDenominator)
  let verdict: PricingSimulationResult['verdict'] = 'MEETS_TARGET'
  if (proposed <= breakEven) verdict = 'BELOW_BREAK_EVEN'
  else if (proposed < target) verdict = 'BELOW_TARGET'
  return {
    expectedAttemptCostRmb: rawDecimal(expectedNumerator, one * 100_000_000n),
    kTheoryRmb: formatFixed(theory, 8),
    kPricingRmb: formatFixed(pricing, 8),
    pricingBasis,
    breakEvenRaw: rawDecimal(breakNumerator, pointDenominator),
    breakEvenPoints: breakEven.toString(),
    targetMarginRaw: rawDecimal(targetNumerator, targetDenominator),
    targetMarginPoints: target.toString(),
    verdict,
  }
}

import { describe, expect, it } from 'vitest'

import {
  beijingMonthOf,
  formatBasisPointsPercent,
  formatBeijingDateTime,
  formatRmbMinor,
  formatRmbYuan,
  parseRmbInput,
  rmbMinorToInput,
  withholdingTaxMinor,
} from '../agent-earnings-format'
import { agentSettlementPolicySchema } from '../lib/agent-settlement-policy-schema'

describe('agent earnings formatting', () => {
  it('shows RMB with grouped digits and no trailing zeros', () => {
    expect(formatRmbMinor('123450', 'en-US')).toBe('¥1,234.5')
    expect(formatRmbMinor('5000', 'en-US')).toBe('¥50')
    expect(formatRmbYuan('0.400000000000', 'en-US')).toBe('¥0.4')
    expect(formatRmbYuan('1.998000000000', 'en-US')).toBe('¥2')
    expect(formatRmbYuan('1234.004999999999', 'en-US')).toBe('¥1,234')
  })

  it('parses a positive RMB amount with at most two decimals into fen', () => {
    expect(parseRmbInput('200.5')).toBe(20050n)
    expect(parseRmbInput(' 50 ')).toBe(5000n)
    for (const invalid of ['0', '0.00', '1.234', '-1', 'abc', '01', '']) {
      expect(parseRmbInput(invalid)).toBeNull()
    }
    expect(rmbMinorToInput(20050n)).toBe('200.5')
    expect(rmbMinorToInput(5000n)).toBe('50')
  })

  it('rounds the withholding tax half up to fen like the server', () => {
    expect(withholdingTaxMinor(20000n, 1000)).toBe(2000n)
    expect(withholdingTaxMinor(5005n, 1000)).toBe(501n)
    expect(withholdingTaxMinor(5004n, 1000)).toBe(500n)
    expect(withholdingTaxMinor(20000n, 0)).toBe(0n)
  })

  it('writes rates and Beijing-time values', () => {
    expect(formatBasisPointsPercent(4000)).toBe('40%')
    expect(formatBasisPointsPercent(1234)).toBe('12.34%')
    expect(formatBasisPointsPercent(1250)).toBe('12.5%')
    expect(beijingMonthOf('2026-09-30T16:00:00.000Z')).toBe('2026-10')
    expect(beijingMonthOf('2026-09-30T15:59:59.999Z')).toBe('2026-09')
    expect(
      formatBeijingDateTime('2026-09-16T01:30:00.000Z', 'en-US')
    ).toContain('09:30')
    expect(formatBeijingDateTime(null)).toBe('—')
  })
})

describe('agent settlement policy form', () => {
  const valid = {
    minWithdrawal: '50',
    maxWithdrawal: '500',
    taxRatePercent: '0',
    expirySharePercent: '40',
  }

  it('accepts amounts and percentages with at most two decimals', () => {
    expect(agentSettlementPolicySchema.safeParse(valid).success).toBe(true)
    expect(
      agentSettlementPolicySchema.safeParse({
        ...valid,
        taxRatePercent: '100',
        expirySharePercent: '12.34',
      }).success
    ).toBe(true)
  })

  it('rejects a maximum below the minimum and out-of-range values on their own fields', () => {
    const lower = agentSettlementPolicySchema.safeParse({
      ...valid,
      maxWithdrawal: '49.99',
    })
    expect(lower.success).toBe(false)
    expect(lower.error?.issues[0]?.path).toEqual(['maxWithdrawal'])
    for (const [field, value] of [
      ['minWithdrawal', '0'],
      ['minWithdrawal', '1.234'],
      ['taxRatePercent', '100.01'],
      ['expirySharePercent', '-1'],
    ] as const) {
      const result = agentSettlementPolicySchema.safeParse({
        ...valid,
        [field]: value,
      })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.path).toEqual([field])
    }
  })
})

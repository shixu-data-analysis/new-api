import { describe, expect, it } from 'vitest'

import {
  consumptionEquation,
  customPeriodError,
  previousChange,
  presetPeriod,
  rmbToTenThousandths,
} from '../operating-dashboard-format'

describe('operating dashboard formatting', () => {
  it('rounds RMB to 0.0001 half away from zero without losing precision', () => {
    expect(rmbToTenThousandths('137.4999500000')).toBe(1375000n)
    expect(rmbToTenThousandths('-4.00005')).toBe(-40001n)
    expect(rmbToTenThousandths('0.00004')).toBe(0n)
    expect(rmbToTenThousandths('0.0035')).toBe(35n)
    expect(rmbToTenThousandths('922337203685477.5807')).toBe(
      9223372036854775807n
    )
  })

  it('keeps the consumption equation exact to 0.0001 RMB after rounding the three base amounts', () => {
    const equation = consumptionEquation({
      listAmountRmb: '137.49995',
      cashSupportRmb: '110.00004',
      recordedCostRmb: '0.0035',
    })
    expect(equation).toEqual({
      listAmount: '137.5000',
      gift: '27.5000',
      cashSupport: '110.0000',
      recordedCost: '0.0035',
      contribution: '109.9965',
      listContribution: '137.4965',
    })
    expect(
      consumptionEquation({
        listAmountRmb: '10',
        cashSupportRmb: '12',
        recordedCostRmb: '0',
      }).gift
    ).toBe('-2.0000')
  })

  it('describes the change against the previous period with one decimal', () => {
    expect(previousChange('108', '100')).toEqual({ kind: 'up', percent: '8.0' })
    expect(previousChange('96.8', '100')).toEqual({
      kind: 'down',
      percent: '3.2',
    })
    expect(previousChange('5', '5')).toEqual({ kind: 'flat' })
    expect(previousChange('5', '0')).toEqual({ kind: 'notApplicable' })
    expect(previousChange('-10', '-20')).toEqual({
      kind: 'up',
      percent: '50.0',
    })
  })

  it('derives preset periods in the browser time zone and validates custom periods like the server', () => {
    const now = new Date(2026, 8, 26, 10, 20)
    expect(presetPeriod('MONTH', now)).toEqual({ from: new Date(2026, 8, 1) })
    expect(presetPeriod('LAST_MONTH', now)).toEqual({
      from: new Date(2026, 7, 1),
      to: new Date(2026, 8, 1),
    })
    expect(presetPeriod('LAST_30_DAYS', now).from.getTime()).toBe(
      now.getTime() - 30 * 86_400_000
    )
    expect(customPeriodError(undefined, now, now)).toBe('incomplete')
    expect(customPeriodError(now, now, now)).toBe('order')
    expect(
      customPeriodError(new Date(2026, 8, 1), new Date(2026, 8, 27), now)
    ).toBe('future')
    expect(customPeriodError(new Date(2025, 8, 1), now, now)).toBe('span')
    expect(customPeriodError(new Date(2026, 8, 1), now, now)).toBeUndefined()
  })
})

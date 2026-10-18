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

import { cnyToMinor, rechargeCodePaidPoints } from '../recharge-code-amount'

describe('Canvas recharge-code currency input', () => {
  it('converts CNY display amounts to integer minor units', () => {
    expect(cnyToMinor('10')).toBe('1000')
    expect(cnyToMinor('10.50')).toBe('1050')
    expect(cnyToMinor('0.02')).toBe('2')
  })

  it('accepts 0 for a gift code and rejects malformed amounts', () => {
    expect(cnyToMinor('0')).toBe('0')
    expect(cnyToMinor('0.01')).toBe('1')
    expect(cnyToMinor('00')).toBeNull()
    expect(cnyToMinor('10.001')).toBeNull()
    expect(cnyToMinor('-10')).toBeNull()
  })

  it('computes the Paid points at the published issuance rate exactly, or none when they are not whole', () => {
    expect(rechargeCodePaidPoints('1000', '100')).toBe(1000n)
    expect(rechargeCodePaidPoints('1', '50')).toBeNull()
    expect(rechargeCodePaidPoints('8', '12.5')).toBe(1n)
    expect(rechargeCodePaidPoints('10', '12.5')).toBeNull()
    // No rounding: 3 fen at 33.33333333 points per yuan is 0.9999999999 points.
    expect(rechargeCodePaidPoints('3', '33.33333333')).toBeNull()
    expect(rechargeCodePaidPoints('0', '100')).toBe(0n)
    expect(rechargeCodePaidPoints('100', 'not-a-rate')).toBeNull()
  })
})

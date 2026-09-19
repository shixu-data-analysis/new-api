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

import { cnyToMinor } from '../recharge-code-amount'

describe('Canvas recharge-code currency input', () => {
  it('converts CNY display amounts to integer minor units', () => {
    expect(cnyToMinor('10')).toBe('1000')
    expect(cnyToMinor('10.50')).toBe('1050')
    expect(cnyToMinor('0.02')).toBe('2')
  })

  it('rejects values that cannot produce whole Canvas Points', () => {
    expect(cnyToMinor('0.01')).toBeNull()
    expect(cnyToMinor('0')).toBeNull()
    expect(cnyToMinor('10.001')).toBeNull()
    expect(cnyToMinor('-10')).toBeNull()
  })
})

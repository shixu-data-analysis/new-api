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
  formatBusinessNumber,
  formatBusinessPercentFromRate,
} from '../number-format'

describe('Canvas business-number display formatting', () => {
  it('limits visible precision to two decimals without changing integer presentation', () => {
    expect(formatBusinessNumber('2.16666667')).toBe('2.17')
    expect(formatBusinessNumber('118.333333')).toBe('118.33')
    expect(formatBusinessNumber('50.00000000')).toBe('50')
    expect(formatBusinessPercentFromRate('0.333333')).toBe('33.33')
  })
})

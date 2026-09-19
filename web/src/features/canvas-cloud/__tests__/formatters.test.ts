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

import { formatMoneyMinor } from '../formatters'

describe('Canvas Cloud money formatting', () => {
  it('preserves the declared currency and values beyond Number precision', () => {
    expect(formatMoneyMinor('1299', 'USD')).toBe('USD 12.99')
    expect(formatMoneyMinor('9223372036854775807', 'JPY')).toBe(
      'JPY 92,233,720,368,547,758.07'
    )
    expect(formatMoneyMinor('-1299', 'EUR')).toBe('-EUR 12.99')
  })
})

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

import { cleanBackupCode, formatBackupCode } from './validation'

describe('backup code formatting', () => {
  it('upper-cases, drops separators and groups as XXXX-XXXX', () => {
    expect(formatBackupCode('ab12-cd34')).toBe('AB12-CD34')
    expect(formatBackupCode('ab 12*cd#34ef')).toBe('AB12-CD34')
  })

  it('does not add a hyphen until a fifth character is typed', () => {
    expect(formatBackupCode('ab12')).toBe('AB12')
    expect(formatBackupCode('ab123')).toBe('AB12-3')
  })

  it('removes every hyphen before sending a code to the server', () => {
    expect(cleanBackupCode('AB12-CD34')).toBe('AB12CD34')
    expect(cleanBackupCode('A-B-1-2')).toBe('AB12')
  })
})

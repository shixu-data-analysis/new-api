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

import { validateUserPassword } from '../user-password'

describe('user form password confirmation', () => {
  it('requires a password when creating either account role', () => {
    expect(
      validateUserPassword({ password: '', confirmPassword: '' }, false)
    ).toEqual({
      field: 'password',
      message: 'Password must be between 8 and 20 characters',
    })
  })

  it('requires a matching confirmation when a password is entered', () => {
    expect(
      validateUserPassword(
        { password: 'CanvasAdm26!', confirmPassword: '' },
        false
      )
    ).toEqual({
      field: 'confirmPassword',
      message: 'Please confirm your password',
    })
    expect(
      validateUserPassword(
        { password: 'CanvasAdm26!', confirmPassword: 'different' },
        false
      )
    ).toEqual({
      field: 'confirmPassword',
      message: 'Passwords do not match',
    })
  })

  it('accepts matching passwords and optional unchanged update passwords', () => {
    expect(
      validateUserPassword(
        { password: 'CanvasAdm26!', confirmPassword: 'CanvasAdm26!' },
        false
      )
    ).toBeNull()
    expect(
      validateUserPassword({ password: '', confirmPassword: '' }, true)
    ).toBeNull()
  })
})

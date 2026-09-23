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
type UserPasswordFields = {
  password?: string
  confirmPassword?: string
}

export type UserPasswordValidationError = {
  field: 'password' | 'confirmPassword'
  message: string
}

export function validateUserPassword(
  data: UserPasswordFields,
  isUpdate: boolean
): UserPasswordValidationError | null {
  const password = data.password ?? ''
  const confirmation = data.confirmPassword ?? ''

  if (isUpdate && password.length === 0 && confirmation.length === 0) {
    return null
  }
  if (password.length < 8 || password.length > 20) {
    return {
      field: 'password',
      message: 'Password must be between 8 and 20 characters',
    }
  }
  if (confirmation.length === 0) {
    return {
      field: 'confirmPassword',
      message: 'Please confirm your password',
    }
  }
  if (password !== confirmation) {
    return {
      field: 'confirmPassword',
      message: 'Passwords do not match',
    }
  }
  return null
}

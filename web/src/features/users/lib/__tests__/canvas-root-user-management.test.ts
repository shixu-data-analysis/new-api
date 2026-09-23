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
  isCanvasRootProfilePath,
  canvasRootUserTableColumnVisibility,
  isCanvasRootUserManagementPath,
} from '../canvas-root-user-management'

describe('Canvas root user-management workspace', () => {
  it('matches only the exact user-management path for a role-100 root', () => {
    expect(isCanvasRootUserManagementPath('/users', 100)).toBe(true)
    expect(isCanvasRootUserManagementPath('/users/', 100)).toBe(true)
    expect(isCanvasRootUserManagementPath('/users/42', 100)).toBe(false)
    expect(isCanvasRootUserManagementPath('/users', 10)).toBe(false)
  })

  it('keeps only a role-100 root profile in the canvas account shell', () => {
    expect(isCanvasRootProfilePath('/profile', 100)).toBe(true)
    expect(isCanvasRootProfilePath('/profile/', 100)).toBe(true)
    expect(isCanvasRootProfilePath('/profile/security', 100)).toBe(true)
    expect(isCanvasRootProfilePath('/profile', 10)).toBe(false)
  })

  it('defaults to the four columns required by administrator provisioning', () => {
    expect(canvasRootUserTableColumnVisibility).toEqual({
      id: false,
      quota: false,
      group: false,
      invite_info: false,
      created_at: false,
      last_login_at: false,
    })
    expect(canvasRootUserTableColumnVisibility).not.toHaveProperty('username')
    expect(canvasRootUserTableColumnVisibility).not.toHaveProperty('status')
    expect(canvasRootUserTableColumnVisibility).not.toHaveProperty('role')
    expect(canvasRootUserTableColumnVisibility).not.toHaveProperty('actions')
  })
})

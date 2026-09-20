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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Route } from './index'

const mocks = vi.hoisted(() => ({ getAuthState: vi.fn() }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: mocks.getAuthState },
}))

async function runBeforeLoad() {
  try {
    return await Route.options.beforeLoad?.({} as never)
  } catch (error) {
    return error
  }
}

describe('root application entry', () => {
  beforeEach(() => {
    mocks.getAuthState.mockReset()
  })

  it('sends anonymous visitors directly to sign in', async () => {
    mocks.getAuthState.mockReturnValue({
      auth: { user: null, accessToken: null },
    })

    await expect(runBeforeLoad()).resolves.toMatchObject({
      options: { to: '/sign-in', replace: true },
    })
  })

  it.each([
    [1, '/canvas-cloud/points'],
    [10, '/canvas-cloud/dashboard'],
    [100, '/users'],
  ])('sends role %s directly to its business home', async (role, href) => {
    mocks.getAuthState.mockReturnValue({
      auth: {
        user: { id: role, username: `role-${role}`, role },
        accessToken: 'access-token',
      },
    })

    await expect(runBeforeLoad()).resolves.toMatchObject({
      options: { href, replace: true },
    })
  })
})

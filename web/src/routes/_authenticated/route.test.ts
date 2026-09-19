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

const mocks = vi.hoisted(() => ({
  getCanvasSession: vi.fn(),
  getCanvasSessionFailureRoute: vi.fn(),
  getAuthState: vi.fn(),
}))

vi.mock('@/components/layout', () => ({ AuthenticatedLayout: () => null }))
vi.mock('@/features/canvas-cloud/access', () => ({
  canCanvasPrincipalAccessPath: vi.fn(() => true),
  getCanvasHomeSection: vi.fn(() => 'customers'),
  isCanvasDefaultLandingPath: vi.fn(() => false),
}))
vi.mock('@/features/canvas-cloud/api', () => ({
  getCanvasSession: mocks.getCanvasSession,
  getCanvasSessionFailureRoute: mocks.getCanvasSessionFailureRoute,
  isCanvasInviteRegistrationRequired: vi.fn(() => false),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: mocks.getAuthState },
}))

import { Route } from './route'

const location = {
  href: '/canvas-cloud/runtime',
  pathname: '/canvas-cloud/runtime',
  search: {},
}

async function runBeforeLoad(pathname = location.pathname) {
  return Route.options
    .beforeLoad?.({
      location: { ...location, href: pathname, pathname },
    } as never)
    .catch((error: unknown) => error)
}

describe('authenticated Canvas session boundary', () => {
  beforeEach(() => {
    mocks.getCanvasSession.mockReset()
    mocks.getCanvasSessionFailureRoute.mockReset()
    mocks.getAuthState.mockReturnValue({
      auth: { user: { role: 10 }, accessToken: 'test-access-token' },
    })
  })

  it('redirects Cloud transport failures to service unavailable', async () => {
    const failure = new Error('upstream unavailable')
    mocks.getCanvasSession.mockRejectedValue(failure)
    mocks.getCanvasSessionFailureRoute.mockReturnValue('/503')

    await expect(runBeforeLoad()).resolves.toMatchObject({
      options: { to: '/503' },
    })
    expect(mocks.getCanvasSessionFailureRoute).toHaveBeenCalledWith(failure)
  })

  it('keeps actual session authorization failures on the forbidden route', async () => {
    const failure = { response: { status: 403 } }
    mocks.getCanvasSession.mockRejectedValue(failure)
    mocks.getCanvasSessionFailureRoute.mockReturnValue('/403')

    await expect(runBeforeLoad()).resolves.toMatchObject({
      options: { to: '/403' },
    })
  })

  it('does not recursively query Canvas session from the service unavailable route', async () => {
    await expect(runBeforeLoad('/503')).resolves.toBeUndefined()
    expect(mocks.getCanvasSession).not.toHaveBeenCalled()
  })
})

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

import { Route } from './route'

const mocks = vi.hoisted(() => ({
  getCanvasSession: vi.fn(),
  isCanvasInviteRegistrationRequired: vi.fn(() => false),
  getAuthState: vi.fn(),
}))

vi.mock('@/components/layout', () => ({ AuthenticatedLayout: () => null }))
vi.mock('@/features/canvas-cloud/access', () => ({
  canCanvasPrincipalAccessPath: vi.fn((pathname: string) =>
    pathname.startsWith('/canvas-cloud/')
  ),
  getCanvasHomeSection: vi.fn(() => 'customers'),
  isCanvasDefaultLandingPath: vi.fn(
    (pathname: string) => pathname === '/dashboard'
  ),
}))
vi.mock('@/features/canvas-cloud/api', () => ({
  getCanvasSession: mocks.getCanvasSession,
  isCanvasInviteRegistrationRequired: mocks.isCanvasInviteRegistrationRequired,
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: mocks.getAuthState },
}))
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
    mocks.isCanvasInviteRegistrationRequired.mockReset()
    mocks.isCanvasInviteRegistrationRequired.mockReturnValue(false)
    mocks.getAuthState.mockReturnValue({
      auth: { user: { role: 10 }, accessToken: 'test-access-token' },
    })
  })

  it('leaves a Cloud outage on a Canvas path to the page route', async () => {
    mocks.getCanvasSession.mockRejectedValue(new Error('upstream unavailable'))

    await expect(runBeforeLoad()).resolves.toBeUndefined()
  })

  it('leaves a Canvas authorization failure to the page route', async () => {
    mocks.getCanvasSession.mockRejectedValue({ response: { status: 403 } })

    await expect(runBeforeLoad()).resolves.toBeUndefined()
  })

  it('keeps an unregistered ordinary user inside Canvas activation', async () => {
    const failure = {
      response: {
        status: 403,
        data: { code: 'INVITE_REGISTRATION_REQUIRED' },
      },
    }
    mocks.getAuthState.mockReturnValue({
      auth: { user: { role: 1 }, accessToken: 'user-access-token' },
    })
    mocks.getCanvasSession.mockRejectedValue(failure)
    mocks.isCanvasInviteRegistrationRequired.mockReturnValue(true)

    await expect(runBeforeLoad('/canvas-cloud/points')).resolves.toBeUndefined()
  })

  it('does not recursively query Canvas session from the service unavailable route', async () => {
    await expect(runBeforeLoad('/503')).resolves.toBeUndefined()
    expect(mocks.getCanvasSession).not.toHaveBeenCalled()
  })

  it('lets the New API root reach user management before Canvas bootstrap', async () => {
    mocks.getAuthState.mockReturnValue({
      auth: { user: { role: 100 }, accessToken: 'root-access-token' },
    })

    await expect(runBeforeLoad('/users')).resolves.toBeUndefined()
    expect(mocks.getCanvasSession).not.toHaveBeenCalled()
  })

  it('lets an authenticated account reach its profile without a Canvas session', async () => {
    mocks.getAuthState.mockReturnValue({
      auth: { user: { role: 100 }, accessToken: 'root-access-token' },
    })

    await expect(runBeforeLoad('/profile')).resolves.toBeUndefined()
    expect(mocks.getCanvasSession).not.toHaveBeenCalled()

    await expect(runBeforeLoad('/profile/')).resolves.toBeUndefined()
    expect(mocks.getCanvasSession).not.toHaveBeenCalled()
  })

  it('keeps ordinary users out of New API business pages', async () => {
    mocks.getAuthState.mockReturnValue({
      auth: { user: { role: 1 }, accessToken: 'user-access-token' },
    })

    await expect(runBeforeLoad('/dashboard/models')).resolves.toMatchObject({
      options: {
        to: '/canvas-cloud/$section',
        params: { section: 'points' },
        replace: true,
      },
    })
    expect(mocks.getCanvasSession).not.toHaveBeenCalled()
  })

  it('keeps the New API dashboard usable when no Canvas principal exists', async () => {
    const failure = { response: { status: 403 } }
    mocks.getCanvasSession.mockRejectedValue(failure)

    await expect(runBeforeLoad('/dashboard')).resolves.toBeUndefined()
  })

  it('does not let a Cloud outage block the New API dashboard', async () => {
    const failure = new Error('upstream unavailable')
    mocks.getCanvasSession.mockRejectedValue(failure)

    await expect(runBeforeLoad('/dashboard')).resolves.toBeUndefined()
  })

  it('does not couple New API administration pages to Canvas permissions', async () => {
    await expect(runBeforeLoad('/users')).resolves.toBeUndefined()
    expect(mocks.getCanvasSession).not.toHaveBeenCalled()
  })
})

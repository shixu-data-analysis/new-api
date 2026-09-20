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
import { CanceledError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  beginAuthenticationSignOut,
  finishAuthenticationSignOut,
} from '@/lib/auth-session'
import { handleServerError } from '@/lib/handle-server-error'
import { api } from '@/lib/http-client'

const toastMocks = vi.hoisted(() => ({ error: vi.fn() }))

vi.mock('sonner', () => ({ toast: toastMocks }))

describe('HTTP request cancellation feedback', () => {
  beforeEach(() => {
    finishAuthenticationSignOut()
    vi.clearAllMocks()
  })
  afterEach(() => finishAuthenticationSignOut())

  it('does not show global errors for an intentionally canceled request', async () => {
    const cancellation = new CanceledError('canceled')

    await expect(
      api.get('/canceled-request-test', {
        adapter: async () => {
          throw cancellation
        },
      })
    ).rejects.toBe(cancellation)

    handleServerError(cancellation)
    expect(toastMocks.error).not.toHaveBeenCalled()
  })

  it('does not deduplicate GET requests that have caller-owned abort signals', async () => {
    const firstController = new AbortController()
    const secondController = new AbortController()
    let markFirstStarted: (() => void) | undefined
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve
    })
    const adapter = vi.fn(async (config) => {
      if (config.signal === firstController.signal) {
        markFirstStarted?.()
        await new Promise<never>((_resolve, reject) => {
          config.signal?.addEventListener('abort', () =>
            reject(new CanceledError('canceled'))
          )
        })
      }
      return {
        data: { source: 'replacement request' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    })

    const first = api.get('/strict-mode-request-test', {
      adapter,
      signal: firstController.signal,
    })
    await firstStarted
    firstController.abort()
    const second = api.get('/strict-mode-request-test', {
      adapter,
      signal: secondController.signal,
    })

    await expect(first).rejects.toBeInstanceOf(CanceledError)
    await expect(second).resolves.toMatchObject({
      data: { source: 'replacement request' },
    })
    expect(adapter).toHaveBeenCalledTimes(2)
  })

  it('does not report expected 401 responses while explicit sign-out is in progress', async () => {
    const unauthorized = {
      config: { skipAuthRefresh: true },
      response: { status: 401 },
    }
    beginAuthenticationSignOut()

    await expect(
      api.get('/sign-out-race-test', {
        adapter: async () => {
          throw unauthorized
        },
      })
    ).rejects.toBe(unauthorized)

    expect(toastMocks.error).not.toHaveBeenCalled()
  })

  it('uses one visual notification identity for concurrent session expiry failures', async () => {
    const requests = Array.from({ length: 3 }, (_, index) =>
      api.get(`/session-expiry-test-${index}`, {
        skipAuthRefresh: true,
        adapter: async (config) => {
          throw {
            config,
            response: { status: 401 },
          }
        },
      })
    )

    await Promise.allSettled(requests)

    expect(toastMocks.error).toHaveBeenCalledTimes(3)
    for (const call of toastMocks.error.mock.calls) {
      expect(call[1]).toEqual({ id: 'auth-session-expired' })
    }
  })
})

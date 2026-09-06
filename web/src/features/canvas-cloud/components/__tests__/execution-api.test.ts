/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getCanvasChannelExecution,
  getCanvasExecutionOverview,
  previewCanvasExecutionError,
  publishCanvasExecutionPolicy,
} from '../../execution-api'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: mocks }))

describe('execution policy API boundary', () => {
  beforeEach(() => {
    mocks.get.mockReset().mockResolvedValue({ data: {} })
    mocks.post.mockReset().mockResolvedValue({ data: {} })
  })

  it('reads overview and selected-channel policies from the execution endpoints', async () => {
    await getCanvasExecutionOverview()
    await getCanvasChannelExecution('channel/one')
    expect(mocks.get.mock.calls.map((call) => call[0])).toEqual([
      '/canvas-api/v1/web/admin/execution',
      '/canvas-api/v1/web/admin/channels/channel%2Fone/execution',
    ])
  })

  it('publishes only confirmed policy payloads with a unique idempotency key', async () => {
    await publishCanvasExecutionPolicy({
      kind: 'GLOBAL_LIMITS',
      scopeKey: 'GLOBAL',
      config: { instanceConcurrency: 20 },
    })
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/execution/policies',
      {
        kind: 'GLOBAL_LIMITS',
        scopeKey: 'GLOBAL',
        config: { instanceConcurrency: 20 },
        confirmed: true,
      },
      {
        headers: {
          'Idempotency-Key': expect.stringMatching(
            /^web-execution-policy-[0-9a-f-]+$/
          ),
        },
        skipErrorHandler: true,
      }
    )
  })

  it('keeps error preview separate from publication', async () => {
    await previewCanvasExecutionError({
      channelId: 'channel id',
      httpStatus: 429,
      response: { error: { code: 'RATE_LIMIT' } },
      locale: 'en',
    })
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/channels/channel%20id/error-preview',
      {
        httpStatus: 429,
        response: { error: { code: 'RATE_LIMIT' } },
        locale: 'en',
      },
      { skipErrorHandler: true }
    )
  })
})

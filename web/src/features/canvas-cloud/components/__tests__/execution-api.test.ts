/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getCanvasCredentialGroupExecution,
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

  it('reads overview and selected credential-group policies from the execution endpoints', async () => {
    await getCanvasExecutionOverview()
    await getCanvasCredentialGroupExecution('group/one')
    expect(mocks.get.mock.calls.map((call) => call[0])).toEqual([
      '/canvas-api/v1/web/admin/execution',
      '/canvas-api/v1/web/admin/credential-groups/group%2Fone/execution',
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
      providerId: 'provider id',
      httpStatus: 429,
      response: { error: { code: 'RATE_LIMIT' } },
      locale: 'en',
    })
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/providers/provider%20id/error-preview',
      {
        httpStatus: 429,
        response: { error: { code: 'RATE_LIMIT' } },
        locale: 'en',
      },
      { skipErrorHandler: true }
    )
  })
})

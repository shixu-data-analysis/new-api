/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getCanvasCredentialGroupExecution,
  getCanvasExecutionOverview,
  getCanvasExecutionCapacity,
  getCanvasExecutionWaits,
  getCanvasExecutionWaitDetail,
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

  it('reads the frozen safe capacity and waiting-task endpoints', async () => {
    await getCanvasExecutionCapacity({
      page: 1,
      pageSize: 10,
      sortBy: 'provider',
      sortOrder: 'asc',
    })
    await getCanvasExecutionWaits({
      credentialGroupId: 'group/one',
      page: 2,
      pageSize: 20,
    })
    await getCanvasExecutionWaitDetail('task/one')
    expect(mocks.get).toHaveBeenNthCalledWith(
      1,
      '/canvas-api/v1/web/admin/execution/capacity',
      {
        params: {
          page: 1,
          pageSize: 10,
          sortBy: 'provider',
          sortOrder: 'asc',
          status: undefined,
        },
        signal: undefined,
      }
    )
    expect(mocks.get).toHaveBeenNthCalledWith(
      2,
      '/canvas-api/v1/web/admin/execution/waits',
      {
        params: { credentialGroupId: 'group/one', page: 2, pageSize: 20 },
        signal: undefined,
      }
    )
    expect(mocks.get).toHaveBeenNthCalledWith(
      3,
      '/canvas-api/v1/web/admin/execution/waits/task%2Fone',
      { signal: undefined }
    )
  })

  it.each([10, 20, 30, 40, 50, 100] as const)(
    'reads waiting tasks with page size %i',
    async (pageSize) => {
      await getCanvasExecutionWaits({ page: 1, pageSize })
      expect(mocks.get).toHaveBeenLastCalledWith(
        '/canvas-api/v1/web/admin/execution/waits',
        { params: { page: 1, pageSize }, signal: undefined }
      )
    }
  )

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

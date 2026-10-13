/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getCanvasProviderConfiguration,
  publishCanvasProviderCredentialGroup,
} from '../../api'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: mocks }))

describe('provider configuration API boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends the model table query to the scoped provider endpoint', async () => {
    const response = {
      environment: 'UAT',
      selectedProviderId: null,
      providers: [],
      credentialGroups: [],
      models: { page: 2, pageSize: 20, total: 0, items: [] },
    }
    const query = {
      providerId: '85000000-0000-7000-8000-000000000001',
      search: 'image',
      modelScope: 'BOUND_TO_GROUP' as const,
      sortBy: 'effectiveDisplayName' as const,
      sortOrder: 'asc' as const,
      page: 2,
      pageSize: 20 as const,
    }
    const controller = new AbortController()
    mocks.get.mockResolvedValue({ data: response })

    await expect(
      getCanvasProviderConfiguration(query, controller.signal)
    ).resolves.toEqual(response)
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/provider-configuration',
      { params: query, signal: controller.signal }
    )
  })

  it('publishes the exact credential version snapshot confirmed by the admin', async () => {
    mocks.post.mockResolvedValue({ data: { status: 'PUBLISHED' } })
    const expectedBindings = [
      {
        customerModelId: 'model-id',
        bindingId: 'binding-id',
        bindingVersion: 3,
      },
    ]

    await publishCanvasProviderCredentialGroup({
      providerId: 'provider-id',
      credentialGroupId: 'group-id',
      name: 'Primary',
      apiKey: 'replacement',
      expectedCredentialGroupVersionId: 'version-id',
      expectedBindings,
      reason: 'rotate',
    })
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/provider-credential-groups/publications',
      {
        providerId: 'provider-id',
        credentialGroupId: 'group-id',
        name: 'Primary',
        apiKey: 'replacement',
        expectedCredentialGroupVersionId: 'version-id',
        expectedBindings,
        reason: 'rotate',
        confirmed: true,
      },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })
})

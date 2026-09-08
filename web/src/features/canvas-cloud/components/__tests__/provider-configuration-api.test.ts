/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  bindCanvasProviderCredentials,
  checkCanvasCustomerModelAccessPermission,
  getCanvasCredentialRotationPreview,
  getCanvasCredentialVersionAffectedModels,
  getCanvasModelCredentialBindingHistory,
  getCanvasProviderConfiguration,
  getCanvasProviderCredentialHistory,
  previewCanvasProviderCredentialBindings,
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
      modelName: 'image',
      modelScope: 'BOUND_TO_GROUP' as const,
      sortBy: 'publicName' as const,
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

  it('loads credential and binding histories only through their paged endpoints', async () => {
    mocks.get.mockResolvedValue({
      data: { page: 1, pageSize: 20, total: 0, items: [] },
    })

    const historyQuery = {
      page: 1,
      pageSize: 20 as const,
      sortBy: 'version' as const,
      sortOrder: 'desc' as const,
    }
    await getCanvasProviderCredentialHistory('group/id', historyQuery)
    await getCanvasModelCredentialBindingHistory('model/id', {
      page: 1,
      pageSize: 20,
    })

    expect(mocks.get).toHaveBeenNthCalledWith(
      1,
      '/canvas-api/v1/web/admin/provider-credential-groups/group%2Fid/versions',
      { params: historyQuery, signal: undefined }
    )
    expect(mocks.get).toHaveBeenNthCalledWith(
      2,
      '/canvas-api/v1/web/admin/provider-models/model%2Fid/credential-bindings',
      { params: { page: 1, pageSize: 20 }, signal: undefined }
    )
  })

  it('loads a version affected-model snapshot only through its lazy endpoint', async () => {
    mocks.get.mockResolvedValue({
      data: {
        page: 1,
        pageSize: 20,
        total: 0,
        factAvailable: true,
        items: [],
      },
    })

    await getCanvasCredentialVersionAffectedModels('version/id', {
      page: 1,
      pageSize: 20,
    })

    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/provider-credential-group-versions/version%2Fid/affected-models',
      { params: { page: 1, pageSize: 20 }, signal: undefined }
    )
  })

  it('uses dedicated preview endpoints before publication', async () => {
    mocks.get.mockResolvedValue({ data: { currentVersion: 1 } })
    mocks.post.mockResolvedValue({ data: { models: [] } })

    await getCanvasCredentialRotationPreview('group/id')
    await previewCanvasProviderCredentialBindings({
      credentialGroupVersionId: 'version-id',
      customerModelIds: ['model-id'],
    })

    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/provider-credential-groups/group%2Fid/rotation-preview',
      { signal: undefined }
    )
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/provider-credential-bindings/preview',
      {
        credentialGroupVersionId: 'version-id',
        customerModelIds: ['model-id'],
      },
      { skipErrorHandler: true }
    )
  })

  it('publishes the exact credential version and binding snapshots confirmed by the admin', async () => {
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
    await bindCanvasProviderCredentials({
      credentialGroupVersionId: 'version-id',
      customerModelIds: ['model-id'],
      expectedBindings,
      reason: 'bind',
    })

    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
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
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      '/canvas-api/v1/web/admin/provider-credential-bindings/publications',
      {
        credentialGroupVersionId: 'version-id',
        customerModelIds: ['model-id'],
        expectedBindings,
        reason: 'bind',
        confirmed: true,
      },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('checks access permission for one exact customer model', async () => {
    mocks.post.mockResolvedValue({ data: { outcome: 'UNVERIFIABLE' } })

    await checkCanvasCustomerModelAccessPermission('model-id')

    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/customer-models/model-id/access-permission-checks',
      undefined,
      expect.objectContaining({ skipErrorHandler: true })
    )
  })
})

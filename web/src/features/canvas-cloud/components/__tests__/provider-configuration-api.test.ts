/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { describe, expect, it, vi } from 'vitest'

import { getCanvasProviderConfiguration } from '../../api'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: mocks }))

describe('provider configuration API boundary', () => {
  it('uses the scoped provider endpoint and normalizes hidden storage to an empty list', async () => {
    mocks.get.mockResolvedValue({
      data: { providers: [], credentialGroups: [], models: [] },
    })

    await expect(getCanvasProviderConfiguration()).resolves.toEqual({
      providers: [],
      credentialGroups: [],
      models: [],
      storage: [],
    })
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/provider-configuration'
    )
  })
})

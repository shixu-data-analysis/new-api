/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it, vi } from 'vitest'

import {
  canvasCloudSearchSchema,
  invalidCanvasCloudRuntimeView,
  invalidCanvasCloudUuidSearchValue,
  Route,
} from './$section'

const mocks = vi.hoisted(() => ({
  getCanvasSession: vi.fn(),
}))

vi.mock('@/features/canvas-cloud/api', () => ({
  getCanvasSession: mocks.getCanvasSession,
  isCanvasInviteRegistrationRequired: vi.fn(() => false),
}))
vi.mock('@/features/canvas-cloud/access', () => ({
  isCanvasSectionAllowed: vi.fn(() => true),
}))

async function beforeLoad(section: string, search: Record<string, unknown>) {
  mocks.getCanvasSession.mockResolvedValue({
    principalType: 'ADMINISTRATOR',
    inviterEnabled: true,
  })
  try {
    await Route.options.beforeLoad?.({ params: { section }, search } as never)
  } catch (error) {
    return error
  }
  throw new Error('Expected the legacy route to redirect')
}

describe('Canvas Cloud legacy section search', () => {
  it('keeps an invalid runtime view for the route-localized recovery state', () => {
    const search = canvasCloudSearchSchema.parse({ view: 'unknown' })
    expect(search.view).toBe(invalidCanvasCloudRuntimeView)
  })

  it('keeps an invalid pricing model ID until beforeLoad returns its explicit error', async () => {
    const search = canvasCloudSearchSchema.parse({ modelId: 'not-a-uuid' })
    expect(search.modelId).toBe(invalidCanvasCloudUuidSearchValue)

    await expect(beforeLoad('pricing', search)).resolves.toMatchObject({
      options: {
        to: '/canvas-cloud/model-management',
        search: { legacyError: 'invalid-model' },
      },
    })
  })

  it('removes an invalid non-legacy UUID without turning it into a pricing error', async () => {
    const search = canvasCloudSearchSchema.parse({ providerId: 'not-a-uuid' })
    expect(search.providerId).toBe(invalidCanvasCloudUuidSearchValue)

    await expect(
      beforeLoad('provider-configuration', search)
    ).resolves.toMatchObject({
      options: {
        to: '/canvas-cloud/$section',
        params: { section: 'provider-configuration' },
        search: {},
        replace: true,
      },
    })
  })
})

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CanvasRouteFailure } from '@/features/canvas-cloud/route-access'

import { Route as InvitationsRoute } from './invitations'
import { Route as ModelManagementRoute } from './model-management/route'

const mocks = vi.hoisted(() => ({ getCanvasSession: vi.fn() }))

vi.mock('@/features/canvas-cloud/api', () => ({
  getCanvasSession: mocks.getCanvasSession,
  isCanvasAccessForbidden: (error: { response?: { status?: number } }) =>
    error.response?.status === 403,
}))
vi.mock('@/features/canvas-cloud/components/InvitationManagement', () => ({
  InvitationManagement: () => null,
}))
vi.mock('@/features/canvas-cloud/components/ModelManagementLayout', () => ({
  ModelManagementLayout: () => null,
}))

const guards = [
  ['invitation management', InvitationsRoute],
  ['model management', ModelManagementRoute],
] as const

async function runGuard(route: (typeof guards)[number][1]) {
  return Promise.resolve(route.options.beforeLoad?.({} as never)).then(
    () => undefined,
    (error: unknown) => error
  )
}

describe('Canvas administrator route guards', () => {
  beforeEach(() => mocks.getCanvasSession.mockReset())

  it.each(guards)('opens %s for an administrator', async (_, route) => {
    mocks.getCanvasSession.mockResolvedValue({
      principalType: 'PLATFORM_ADMIN',
    })
    await expect(runGuard(route)).resolves.toBeUndefined()
  })

  it.each(guards)(
    'keeps a customer opening %s inside the layout as access denied',
    async (_, route) => {
      mocks.getCanvasSession.mockResolvedValue({ principalType: 'CUSTOMER' })
      const failure = await runGuard(route)
      expect(failure).toBeInstanceOf(CanvasRouteFailure)
      expect(failure).toMatchObject({ kind: 'forbidden' })
    }
  )

  it.each(guards)(
    'separates withdrawn access from an unavailable session on %s',
    async (_, route) => {
      mocks.getCanvasSession.mockRejectedValueOnce({
        response: { status: 403 },
      })
      expect(await runGuard(route)).toMatchObject({ kind: 'forbidden' })
      mocks.getCanvasSession.mockRejectedValueOnce({
        response: { status: 503 },
      })
      expect(await runGuard(route)).toMatchObject({ kind: 'unavailable' })
    }
  )
})

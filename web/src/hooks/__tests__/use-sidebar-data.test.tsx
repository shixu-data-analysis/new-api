/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useSidebarData } from '../use-sidebar-data'

vi.mock('@/features/canvas-cloud/use-canvas-session', () => ({
  useCanvasSession: () => ({
    isPending: false,
    isSuccess: true,
    data: { principalType: 'PLATFORM_ADMIN' },
  }),
}))

describe('Canvas administrator primary sidebar', () => {
  it('places every administration destination in grouped primary navigation', () => {
    const { result } = renderHook(() => useSidebarData())

    expect(result.current.navGroups.map((group) => group.id)).toEqual([
      'canvas-admin-operations',
      'canvas-admin-business',
      'canvas-admin-models-cost',
      'account',
    ])
    expect(
      result.current.navGroups.flatMap((group) =>
        group.items.flatMap((item) => ('url' in item ? [item.url] : []))
      )
    ).toEqual([
      '/canvas-cloud/dashboard',
      '/canvas-cloud/usage-logs',
      '/canvas-cloud/task-logs',
      '/canvas-cloud/audit',
      '/canvas-cloud/customers',
      '/canvas-cloud/recharge-codes',
      '/canvas-cloud/invite-codes',
      '/canvas-cloud/refunds',
      '/canvas-cloud/catalog',
      '/canvas-cloud/pricing',
      '/canvas-cloud/channels',
      '/profile',
    ])
  })
})

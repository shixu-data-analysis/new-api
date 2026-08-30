/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSidebarData } from '../use-sidebar-data'

const { canvasShellState } = vi.hoisted(() => ({
  canvasShellState: {
    isCanvasShell: true,
    canvasSession: {
      isPending: false,
      isSuccess: true,
      data: { principalType: 'PLATFORM_ADMIN' as const },
    },
  },
}))

vi.mock('@/features/canvas-cloud/use-canvas-session', () => ({
  useCanvasShellSession: () => canvasShellState,
}))

describe('Canvas administrator primary sidebar', () => {
  beforeEach(() => {
    canvasShellState.isCanvasShell = true
    canvasShellState.canvasSession.isPending = false
    canvasShellState.canvasSession.isSuccess = true
    canvasShellState.canvasSession.data = {
      principalType: 'PLATFORM_ADMIN',
    }
  })

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
      '/canvas-cloud/agents',
      '/canvas-cloud/recharge-codes',
      '/canvas-cloud/invite-codes',
      '/canvas-cloud/refunds',
      '/canvas-cloud/catalog',
      '/canvas-cloud/pricing',
      '/canvas-cloud/channels',
      '/profile',
    ])
  })

  it('shows only activation and profile navigation before Canvas registration', () => {
    canvasShellState.canvasSession.isSuccess = false

    const { result } = renderHook(() => useSidebarData())

    expect(result.current.navGroups.map((group) => group.id)).toEqual([
      'canvas-activation',
      'account',
    ])
    expect(
      result.current.navGroups.flatMap((group) =>
        group.items.flatMap((item) => ('url' in item ? [item.url] : []))
      )
    ).toEqual(['/canvas-cloud/overview', '/profile'])
  })
})

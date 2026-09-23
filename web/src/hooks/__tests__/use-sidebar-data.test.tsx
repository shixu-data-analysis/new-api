/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { renderHook } from '@testing-library/react'
import { UserCog } from 'lucide-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSidebarData } from '../use-sidebar-data'

const { canvasShellState } = vi.hoisted(() => ({
  canvasShellState: {
    isCanvasShell: true,
    canvasSession: {
      isPending: false,
      isSuccess: true,
      data: {
        principalType: 'PLATFORM_ADMIN' as
          | 'CUSTOMER'
          | 'PLATFORM_ADMIN'
          | 'SUPER_ADMIN',
        inviterEnabled: false,
      },
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
      inviterEnabled: false,
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
      '/canvas-cloud/task-logs',
      '/canvas-cloud/audit',
      '/canvas-cloud/customers',
      '/canvas-cloud/point-campaigns',
      '/canvas-cloud/invitations',
      '/canvas-cloud/recharge-codes',
      '/canvas-cloud/model-management',
      '/canvas-cloud/pricing-point-rules',
      '/canvas-cloud/runtime',
      '/profile',
    ])
    expect(
      result.current.navGroups
        .flatMap((group) => group.items)
        .find((item) => 'url' in item && item.url === '/canvas-cloud/customers')
        ?.title
    ).toBe('Customer management')
    expect(
      result.current.navGroups.some((group) =>
        group.items.some(
          (item) => 'url' in item && item.url === '/canvas-cloud/refunds'
        )
      )
    ).toBe(false)
  })

  it('adds user provisioning only for the canvas super administrator', () => {
    const platformAdministrator = renderHook(() => useSidebarData())
    expect(
      platformAdministrator.result.current.navGroups.some((group) =>
        group.items.some((item) => 'url' in item && item.url === '/users')
      )
    ).toBe(false)
    platformAdministrator.unmount()

    canvasShellState.canvasSession.data = {
      principalType: 'SUPER_ADMIN',
      inviterEnabled: false,
    }
    const superAdministrator = renderHook(() => useSidebarData())
    const superAdministratorGroups = superAdministrator.result.current.navGroups
    const userManagementGroup = superAdministratorGroups.find(
      (group) => group.id === 'canvas-super-admin'
    )
    const userManagementItem = userManagementGroup?.items.find(
      (item) => 'url' in item && item.url === '/users'
    )

    expect(userManagementGroup?.title).toBe('Admin')
    expect(userManagementItem?.title).toBe('Users')
    expect(userManagementItem?.icon).toBe(UserCog)
    expect(
      superAdministratorGroups
        .find((group) => group.id === 'canvas-admin-business')
        ?.items.some((item) => 'url' in item && item.url === '/users')
    ).toBe(false)
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
    ).toEqual(['/canvas-cloud/points', '/profile'])
  })

  it('shows the inviter center only after a customer receives invitation ability', () => {
    canvasShellState.canvasSession.data = {
      principalType: 'CUSTOMER',
      inviterEnabled: false,
    }
    const ordinary = renderHook(() => useSidebarData())
    expect(
      ordinary.result.current.navGroups
        .flatMap((group) => group.items)
        .some(
          (item) => 'url' in item && item.url === '/canvas-cloud/agent-center'
        )
    ).toBe(false)
    ordinary.unmount()

    canvasShellState.canvasSession.data = {
      principalType: 'CUSTOMER',
      inviterEnabled: true,
    }
    const inviter = renderHook(() => useSidebarData())
    expect(
      inviter.result.current.navGroups
        .flatMap((group) => group.items)
        .find(
          (item) => 'url' in item && item.url === '/canvas-cloud/agent-center'
        )?.title
    ).toBe('My customers')
  })
})

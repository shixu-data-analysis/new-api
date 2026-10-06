/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { UserCog } from 'lucide-react'
import type { ReactNode } from 'react'
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

const balanceAlerts = vi.hoisted(() => ({ alertCount: 0 }))
vi.mock('@/features/canvas-cloud/operating-dashboard-api', () => ({
  providerBalanceAlertsQueryKey: ['canvas-cloud', 'provider-balance-alerts'],
  getProviderBalanceAlerts: async () => ({
    asOf: '2026-10-03T00:00:00.000Z',
    alertCount: balanceAlerts.alertCount,
  }),
}))

const executionAttention = vi.hoisted(() => ({ count: 0 }))
vi.mock('@/features/canvas-cloud/execution-api', () => ({
  getCanvasExecutionOverview: async () => ({
    attention: Array.from({ length: executionAttention.count }, () => ({
      type: 'OUTPUT_TOO_LARGE',
      count: 1,
      latestAt: null,
    })),
  }),
}))

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {children}
    </QueryClientProvider>
  )
}

describe('Canvas administrator primary sidebar', () => {
  beforeEach(() => {
    canvasShellState.isCanvasShell = true
    canvasShellState.canvasSession.isPending = false
    canvasShellState.canvasSession.isSuccess = true
    canvasShellState.canvasSession.data = {
      principalType: 'PLATFORM_ADMIN',
      inviterEnabled: false,
    }
    balanceAlerts.alertCount = 0
    executionAttention.count = 0
  })

  it('marks the runtime management entry with the number of attention hints', async () => {
    executionAttention.count = 3
    const { result } = renderHook(() => useSidebarData(), { wrapper })
    const runtimeItem = () =>
      result.current.navGroups
        .flatMap((group) => group.items)
        .find((item) => 'url' in item && item.url === '/canvas-cloud/runtime')
    await waitFor(() => expect(runtimeItem()?.badge).toBe('3'))
    expect(runtimeItem()).toMatchObject({
      badgeTone: 'alert',
      badgeLabel: '3 items need attention',
    })
  })

  it('marks the operating dashboard entry with the API provider balance alert count', async () => {
    balanceAlerts.alertCount = 2
    const { result } = renderHook(() => useSidebarData(), { wrapper })
    const dashboardItem = () =>
      result.current.navGroups[0]?.items.find(
        (item) => 'url' in item && item.url === '/canvas-cloud/dashboard'
      )
    await waitFor(() => expect(dashboardItem()?.badge).toBe('2'))
    expect(dashboardItem()).toMatchObject({
      badgeTone: 'alert',
      badgeLabel: '2 API providers are below their balance alert threshold',
    })
  })

  it('places every administration destination in grouped primary navigation', () => {
    const { result } = renderHook(() => useSidebarData(), { wrapper })

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
    const platformAdministrator = renderHook(() => useSidebarData(), {
      wrapper,
    })
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
    const superAdministrator = renderHook(() => useSidebarData(), { wrapper })
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

    const { result } = renderHook(() => useSidebarData(), { wrapper })

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
    const ordinary = renderHook(() => useSidebarData(), { wrapper })
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
    const inviter = renderHook(() => useSidebarData(), { wrapper })
    expect(
      inviter.result.current.navGroups
        .flatMap((group) => group.items)
        .find(
          (item) => 'url' in item && item.url === '/canvas-cloud/agent-center'
        )?.title
    ).toBe('My customers')
  })
})

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCanvasSession } from '../use-canvas-session'

const mocks = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock('../api', () => ({ getCanvasSession: mocks.session }))

const session = (inviterStatus: 'ACTIVE' | 'DISABLED') => ({
  principalId: 'agent-1',
  principalType: 'CUSTOMER',
  displayName: 'Agent',
  emailMasked: null,
  inviterEnabled: inviterStatus === 'ACTIVE',
  inviterStatus,
})

afterEach(() => focusManager.setFocused(undefined))

describe('useCanvasSession', () => {
  // The Desktop customer center stays loaded while the Canvas view is shown, so returning to it
  // must pick up an agent status changed in the meantime.
  it('reloads the session whenever the page is shown again', async () => {
    mocks.session
      .mockResolvedValueOnce(session('DISABLED'))
      .mockResolvedValueOnce(session('ACTIVE'))
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, refetchOnWindowFocus: false },
      },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useCanvasSession(), { wrapper })
    await waitFor(() =>
      expect(result.current.data?.inviterStatus).toBe('DISABLED')
    )

    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })

    await waitFor(() =>
      expect(result.current.data?.inviterStatus).toBe('ACTIVE')
    )
    expect(mocks.session).toHaveBeenCalledTimes(2)
  })
})

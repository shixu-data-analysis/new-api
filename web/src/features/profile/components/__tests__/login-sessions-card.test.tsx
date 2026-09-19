/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoginSessionsCard } from '../login-sessions-card'

const mocks = vi.hoisted(() => ({
  getLoginSessions: vi.fn(),
  navigate: vi.fn(),
  requestCanvasDesktopSignOut: vi.fn(),
  revokeLoginSession: vi.fn(),
  revokeOtherLoginSessions: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))
vi.mock('@/lib/canvas-desktop-sign-out', () => ({
  requestCanvasDesktopSignOut: mocks.requestCanvasDesktopSignOut,
}))
vi.mock('../../api', () => ({
  getLoginSessions: mocks.getLoginSessions,
  revokeLoginSession: mocks.revokeLoginSession,
  revokeOtherLoginSessions: mocks.revokeOtherLoginSessions,
}))
vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: (props: {
    open: boolean
    confirmText: string
    handleConfirm: () => void
  }) =>
    props.open ? (
      <button type='button' onClick={props.handleConfirm}>
        Confirm {props.confirmText}
      </button>
    ) : null,
}))

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginSessionsCard />
    </QueryClientProvider>
  )
}

describe('LoginSessionsCard Canvas Desktop coordination', () => {
  beforeEach(() => vi.clearAllMocks())

  it('routes current-session sign-out through Desktop before revoking the web session directly', async () => {
    mocks.getLoginSessions.mockResolvedValue({
      success: true,
      data: [
        {
          sid: 'current-session',
          current: true,
          login_method: 'password',
          ip: '127.0.0.1',
          user_agent: 'Mozilla/5.0',
          created_at: 1,
          last_active_at: 1,
          expires_at: 4_102_444_800,
        },
      ],
    })
    mocks.requestCanvasDesktopSignOut.mockReturnValue(
      Promise.resolve({ success: true })
    )

    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Sign out' }))

    await waitFor(() => {
      expect(mocks.requestCanvasDesktopSignOut).toHaveBeenCalledOnce()
    })
    expect(mocks.revokeLoginSession).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('does not fall back to web-only revocation when a Desktop SSO session lacks coordination state', async () => {
    mocks.getLoginSessions.mockResolvedValue({
      success: true,
      data: [
        {
          sid: 'current-session',
          current: true,
          login_method: 'canvas_customer_center',
          ip: '127.0.0.1',
          user_agent: 'Mozilla/5.0',
          created_at: 1,
          last_active_at: 1,
          expires_at: 4_102_444_800,
        },
      ],
    })
    mocks.requestCanvasDesktopSignOut.mockReturnValue(null)

    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Sign out' }))

    await waitFor(() => {
      expect(mocks.requestCanvasDesktopSignOut).toHaveBeenCalledOnce()
    })
    expect(mocks.revokeLoginSession).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})

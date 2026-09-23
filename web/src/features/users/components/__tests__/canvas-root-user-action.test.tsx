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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { User } from '../../types'
import { CanvasRootUserAction } from '../canvas-root-user-action'

const mocks = vi.hoisted(() => ({
  manageUser: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  triggerRefresh: vi.fn(),
}))

vi.mock('../../api', () => ({
  manageUser: mocks.manageUser,
}))

vi.mock('../users-provider', () => ({
  useUsers: () => ({ triggerRefresh: mocks.triggerRefresh }),
}))

vi.mock('../canvas-admin-provisioning-action', () => ({
  CanvasAdminProvisioningAction: () => <span>Grant canvas access</span>,
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 2,
    username: 'user',
    display_name: 'User',
    quota: 0,
    used_quota: 0,
    request_count: 0,
    group: 'default',
    status: 1,
    role: 1,
    ...overrides,
  }
}

describe('CanvasRootUserAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.manageUser.mockResolvedValue({ success: true })
  })

  it('does not expose administrator actions for an enabled ordinary customer', () => {
    const { container } = render(<CanvasRootUserAction user={createUser()} />)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('Grant canvas access')).not.toBeInTheDocument()
    expect(mocks.manageUser).not.toHaveBeenCalled()
  })

  it('offers only enablement for a disabled administrator', async () => {
    render(<CanvasRootUserAction user={createUser({ role: 10, status: 2 })} />)

    expect(screen.queryByText('Grant canvas access')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }))

    await waitFor(() => {
      expect(mocks.manageUser).toHaveBeenCalledWith(2, 'enable')
    })
    expect(mocks.triggerRefresh).toHaveBeenCalledOnce()
  })

  it('hands an enabled New API administrator to canvas provisioning', () => {
    render(<CanvasRootUserAction user={createUser({ role: 10 })} />)

    expect(screen.getByText('Grant canvas access')).toBeInTheDocument()
    expect(mocks.manageUser).not.toHaveBeenCalled()
  })

  it('does not expose row actions for root or deleted users', () => {
    const root = render(
      <CanvasRootUserAction user={createUser({ role: 100 })} />
    )
    expect(root.container).toBeEmptyDOMElement()

    root.rerender(
      <CanvasRootUserAction
        user={createUser({
          DeletedAt: { Time: '2026-09-20T00:00:00.000Z', Valid: true },
        })}
      />
    )
    expect(root.container).toBeEmptyDOMElement()
  })
})

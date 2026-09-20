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
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import type { User } from '../../types'
import { CanvasAdminProvisioningAction } from '../canvas-admin-provisioning-action'
import { CanvasSuperAdminProvisioningPanel } from '../canvas-super-admin-provisioning-panel'

const mocks = vi.hoisted(() => ({
  bootstrapCanvasSuperAdmin: vi.fn(),
  getCanvasAdminProvisioningPrincipals: vi.fn(),
  getCanvasAdminProvisioningStatus: vi.fn(),
  grantCanvasPlatformAdmin: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  triggerRefresh: vi.fn(),
}))

vi.mock('@/features/canvas-cloud/api', () => ({
  bootstrapCanvasSuperAdmin: mocks.bootstrapCanvasSuperAdmin,
  getCanvasAdminProvisioningPrincipals:
    mocks.getCanvasAdminProvisioningPrincipals,
  getCanvasAdminProvisioningStatus: mocks.getCanvasAdminProvisioningStatus,
  grantCanvasPlatformAdmin: mocks.grantCanvasPlatformAdmin,
}))

vi.mock('../users-provider', () => ({
  useUsers: () => ({ triggerRefresh: mocks.triggerRefresh }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children: ReactNode; params: { section: string } }) => (
    <a href={`/canvas-cloud/${props.params.section}`}>{props.children}</a>
  ),
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}))

vi.mock('@/components/confirm-dialog', () => ({
  ConfirmDialog: (props: {
    open: boolean
    title: ReactNode
    desc: ReactNode
    confirmText: ReactNode
    handleConfirm: () => void
    isLoading?: boolean
  }) =>
    props.open ? (
      <div role='dialog' aria-label={String(props.title)}>
        <div>{props.desc}</div>
        <button
          type='button'
          onClick={props.handleConfirm}
          disabled={props.isLoading}
        >
          {props.confirmText}
        </button>
      </div>
    ) : null,
}))

const rootUser = createUser({ id: 1, username: 'root', role: 100 })
const adminUser = createUser({ id: 10, username: 'enabled-admin', role: 10 })

function createUser(overrides: Partial<User>): User {
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

function setCurrentUser(role: number) {
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'root',
    role,
  })
}

function renderAction(user: User) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <CanvasAdminProvisioningAction user={user} />
    </QueryClientProvider>
  )
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <CanvasSuperAdminProvisioningPanel />
    </QueryClientProvider>
  )
}

describe('CanvasAdminProvisioningAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setCurrentUser(100)
  })

  it('hides provisioning from a signed-in role-10 administrator', () => {
    setCurrentUser(10)

    const { container } = renderAction(adminUser)

    expect(container).toBeEmptyDOMElement()
    expect(mocks.getCanvasAdminProvisioningStatus).not.toHaveBeenCalled()
    expect(mocks.getCanvasAdminProvisioningPrincipals).not.toHaveBeenCalled()
  })

  it('does not hide root bootstrap inside the paginated root row', () => {
    const { container } = renderAction(rootUser)

    expect(container).toBeEmptyDOMElement()
    expect(mocks.getCanvasAdminProvisioningStatus).not.toHaveBeenCalled()
  })

  it('shows loading and a retry action when administrator status fails', async () => {
    let rejectRequest: ((reason?: unknown) => void) | undefined
    mocks.getCanvasAdminProvisioningStatus.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject
        })
    )
    mocks.getCanvasAdminProvisioningPrincipals.mockResolvedValue({ items: [] })

    renderPanel()
    expect(
      screen.getByText('Loading Canvas administrator status...')
    ).toBeInTheDocument()

    rejectRequest?.(new Error('unavailable'))
    expect(
      await screen.findByText(
        'Failed to load Canvas administrator status. Retry'
      )
    ).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Retry' })
    mocks.getCanvasAdminProvisioningStatus.mockResolvedValueOnce({
      bootstrapStatus: 'REQUIRED',
      currentRootExternalId: '1',
      superAdminExternalId: null,
    })
    fireEvent.click(retry)

    expect(
      await screen.findByRole('button', {
        name: 'Initialize Canvas super administrator once',
      })
    ).toBeEnabled()
  })

  it('requires confirmation before the current root initializes Canvas once', async () => {
    mocks.getCanvasAdminProvisioningStatus
      .mockResolvedValueOnce({
        bootstrapStatus: 'REQUIRED',
        currentRootExternalId: '1',
        superAdminExternalId: null,
      })
      .mockResolvedValue({
        bootstrapStatus: 'COMPLETE',
        currentRootExternalId: '1',
        superAdminExternalId: '1',
      })
    mocks.getCanvasAdminProvisioningPrincipals.mockResolvedValue({ items: [] })
    mocks.bootstrapCanvasSuperAdmin.mockResolvedValue({
      principalId: 'super-admin-principal',
      principalType: 'SUPER_ADMIN',
      externalId: '1',
      displayName: 'Root',
      createdAt: '2026-09-19T00:00:00.000Z',
    })

    renderPanel()
    const initialize = await screen.findByRole('button', {
      name: 'Initialize Canvas super administrator once',
    })
    fireEvent.click(initialize)
    expect(mocks.bootstrapCanvasSuperAdmin).not.toHaveBeenCalled()

    fireEvent.click(
      within(
        screen.getByRole('dialog', {
          name: 'Initialize Canvas super administrator once',
        })
      ).getByRole('button', {
        name: 'Initialize Canvas super administrator once',
      })
    )

    await waitFor(() => {
      expect(mocks.bootstrapCanvasSuperAdmin).toHaveBeenCalledOnce()
    })
    expect(
      await screen.findByText('Canvas super administrator initialized')
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Canvas Cloud Administration' })
    ).not.toBeInTheDocument()
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Canvas super administrator initialized successfully'
    )
  })

  it('marks an already provisioned role-10 user as granted without presenting another action', async () => {
    mocks.getCanvasAdminProvisioningStatus.mockResolvedValue({
      bootstrapStatus: 'COMPLETE',
      currentRootExternalId: '1',
      superAdminExternalId: '1',
    })
    mocks.getCanvasAdminProvisioningPrincipals.mockResolvedValue({
      items: [
        {
          principalId: 'platform-admin-principal',
          principalType: 'PLATFORM_ADMIN',
          externalId: '10',
          displayName: 'Enabled Admin',
          createdAt: '2026-09-19T00:00:00.000Z',
        },
      ],
    })

    renderAction(adminUser)

    expect(
      await screen.findByText('Canvas platform administrator access granted')
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'Canvas platform administrator access granted',
      })
    ).not.toBeInTheDocument()
  })

  it('blocks bootstrap when Canvas reports an initialization conflict', async () => {
    mocks.getCanvasAdminProvisioningStatus.mockResolvedValue({
      bootstrapStatus: 'CONFLICT',
      currentRootExternalId: '1',
      superAdminExternalId: '99',
    })
    mocks.getCanvasAdminProvisioningPrincipals.mockResolvedValue({ items: [] })

    renderPanel()

    expect(
      await screen.findByText(
        'Canvas super administrator initialization conflict'
      )
    ).toBeInTheDocument()
    expect(mocks.bootstrapCanvasSuperAdmin).not.toHaveBeenCalled()
  })

  it('blocks role-10 grants while Canvas super administrator bootstrap is required', async () => {
    mocks.getCanvasAdminProvisioningStatus.mockResolvedValue({
      bootstrapStatus: 'REQUIRED',
      currentRootExternalId: '1',
      superAdminExternalId: null,
    })
    mocks.getCanvasAdminProvisioningPrincipals.mockResolvedValue({ items: [] })

    renderAction(adminUser)

    const grant = await screen.findByRole('button', {
      name: 'Complete administrator setup',
    })
    expect(grant).toBeDisabled()
    expect(
      screen.getByText(
        'Initialize the Canvas super administrator before granting platform administrator access'
      )
    ).toBeInTheDocument()
    fireEvent.click(grant)
    expect(mocks.grantCanvasPlatformAdmin).not.toHaveBeenCalled()
  })

  it('blocks role-10 grants while Canvas reports a bootstrap conflict', async () => {
    mocks.getCanvasAdminProvisioningStatus.mockResolvedValue({
      bootstrapStatus: 'CONFLICT',
      currentRootExternalId: '1',
      superAdminExternalId: '99',
    })
    mocks.getCanvasAdminProvisioningPrincipals.mockResolvedValue({ items: [] })

    renderAction(adminUser)

    const grant = await screen.findByRole('button', {
      name: 'Complete administrator setup',
    })
    expect(grant).toBeDisabled()
    expect(
      screen.getByText(
        'Resolve the Canvas super administrator conflict before granting platform administrator access'
      )
    ).toBeInTheDocument()
    fireEvent.click(grant)
    expect(mocks.grantCanvasPlatformAdmin).not.toHaveBeenCalled()
  })

  it('blocks role-10 grants when the signed-in root is not the initialized Canvas super administrator', async () => {
    mocks.getCanvasAdminProvisioningStatus.mockResolvedValue({
      bootstrapStatus: 'COMPLETE',
      currentRootExternalId: '1',
      superAdminExternalId: '99',
    })
    mocks.getCanvasAdminProvisioningPrincipals.mockResolvedValue({ items: [] })

    renderAction(adminUser)

    const grant = await screen.findByRole('button', {
      name: 'Complete administrator setup',
    })
    expect(grant).toBeDisabled()
    expect(
      screen.getByText(
        'Only the initialized Canvas super administrator can grant platform administrator access'
      )
    ).toBeInTheDocument()
    fireEvent.click(grant)
    expect(mocks.grantCanvasPlatformAdmin).not.toHaveBeenCalled()
  })

  it('completes an existing role-10 administrator only after confirmation', async () => {
    mocks.getCanvasAdminProvisioningStatus.mockResolvedValue({
      bootstrapStatus: 'COMPLETE',
      currentRootExternalId: '1',
      superAdminExternalId: '1',
    })
    mocks.getCanvasAdminProvisioningPrincipals.mockResolvedValue({ items: [] })
    mocks.grantCanvasPlatformAdmin.mockResolvedValue({
      principalId: 'platform-admin-principal',
      principalType: 'PLATFORM_ADMIN',
      externalId: '10',
      displayName: 'Enabled Admin',
      createdAt: '2026-09-19T00:00:00.000Z',
    })

    renderAction(adminUser)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Complete administrator setup',
      })
    )
    expect(mocks.grantCanvasPlatformAdmin).not.toHaveBeenCalled()

    fireEvent.click(
      within(
        screen.getByRole('dialog', {
          name: 'Complete administrator setup',
        })
      ).getByRole('button', {
        name: 'Complete administrator setup',
      })
    )
    await waitFor(() => {
      expect(mocks.grantCanvasPlatformAdmin).toHaveBeenCalledWith(
        'enabled-admin'
      )
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Canvas platform administrator access granted successfully'
    )
  })

  it('does not expose administrator provisioning for an ordinary customer account', () => {
    const { container } = renderAction(createUser({}))

    expect(container).toBeEmptyDOMElement()
    expect(mocks.getCanvasAdminProvisioningStatus).not.toHaveBeenCalled()
    expect(mocks.getCanvasAdminProvisioningPrincipals).not.toHaveBeenCalled()
    expect(mocks.grantCanvasPlatformAdmin).not.toHaveBeenCalled()
  })

  it('explains that an existing customer account requires a separate administrator account', async () => {
    mocks.getCanvasAdminProvisioningStatus.mockResolvedValue({
      bootstrapStatus: 'COMPLETE',
      currentRootExternalId: '1',
      superAdminExternalId: '1',
    })
    mocks.getCanvasAdminProvisioningPrincipals.mockResolvedValue({ items: [] })
    mocks.grantCanvasPlatformAdmin.mockRejectedValue({
      response: {
        status: 409,
        data: { code: 'CUSTOMER_ACCOUNT_NOT_ELIGIBLE' },
      },
    })

    renderAction(adminUser)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Complete administrator setup',
      })
    )
    fireEvent.click(
      within(
        screen.getByRole('dialog', {
          name: 'Complete administrator setup',
        })
      ).getByRole('button', {
        name: 'Complete administrator setup',
      })
    )

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Customer accounts cannot receive Canvas administrator access. Create a separate administrator account.'
      )
    })
    expect(mocks.triggerRefresh).not.toHaveBeenCalled()
  })

  it('keeps a disabled role-10 user ineligible for Canvas access', async () => {
    mocks.getCanvasAdminProvisioningStatus.mockResolvedValue({
      bootstrapStatus: 'COMPLETE',
      currentRootExternalId: '1',
      superAdminExternalId: '1',
    })
    mocks.getCanvasAdminProvisioningPrincipals.mockResolvedValue({ items: [] })

    renderAction(createUser({ ...adminUser, status: 2 }))

    expect(
      await screen.findByRole('button', {
        name: 'Complete administrator setup',
      })
    ).toBeDisabled()
    expect(
      screen.getByText(
        'Enable this user before granting Canvas administrator access'
      )
    ).toBeInTheDocument()
  })

  it('keeps a soft-deleted role-10 user ineligible for Canvas access', async () => {
    mocks.getCanvasAdminProvisioningStatus.mockResolvedValue({
      bootstrapStatus: 'COMPLETE',
      currentRootExternalId: '1',
      superAdminExternalId: '1',
    })
    mocks.getCanvasAdminProvisioningPrincipals.mockResolvedValue({ items: [] })

    renderAction(
      createUser({
        ...adminUser,
        DeletedAt: { Time: '2026-09-19T00:00:00.000Z', Valid: true },
      })
    )

    const grant = await screen.findByRole('button', {
      name: 'Complete administrator setup',
    })
    expect(grant).toBeDisabled()
    expect(
      screen.getByText(
        'Deleted users cannot receive Canvas administrator access'
      )
    ).toBeInTheDocument()
    fireEvent.click(grant)
    expect(mocks.grantCanvasPlatformAdmin).not.toHaveBeenCalled()
  })

  it('keeps the confirmed grant recoverable when provisioning fails', async () => {
    mocks.getCanvasAdminProvisioningStatus.mockResolvedValue({
      bootstrapStatus: 'COMPLETE',
      currentRootExternalId: '1',
      superAdminExternalId: '1',
    })
    mocks.getCanvasAdminProvisioningPrincipals.mockResolvedValue({ items: [] })
    mocks.grantCanvasPlatformAdmin.mockRejectedValue(new Error('conflict'))

    renderAction(adminUser)
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Complete administrator setup',
      })
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Complete administrator setup',
    })
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Complete administrator setup',
      })
    )

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Failed to grant Canvas administrator access'
      )
    })
    expect(dialog).not.toBeInTheDocument()
  })
})

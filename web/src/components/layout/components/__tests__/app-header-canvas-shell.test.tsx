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
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppHeader } from '../app-header'

const canvasShellState = {
  isCanvasRootUserManagement: true,
  isCanvasStandaloneShell: true,
  isCanvasShell: true,
}

vi.mock('@/features/canvas-cloud/use-canvas-session', () => ({
  useCanvasShellSession: () => canvasShellState,
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({}),
}))
vi.mock('@/hooks/use-top-nav-links', () => ({ useTopNavLinks: () => [] }))
vi.mock('@/components/config-drawer', () => ({
  ConfigDrawer: () => <div>Config drawer</div>,
}))
vi.mock('@/components/language-switcher', () => ({
  LanguageSwitcher: () => <div>Language switcher</div>,
}))
vi.mock('@/components/notification-popover', () => ({
  NotificationPopover: () => <div>Notifications</div>,
}))
vi.mock('@/components/profile-dropdown', () => ({
  ProfileDropdown: () => <div>Profile dropdown</div>,
}))
vi.mock('@/components/search', () => ({ Search: () => <div>Search</div> }))
vi.mock('../header', () => ({
  Header: (props: {
    children: React.ReactNode
    showSidebarTrigger?: boolean
  }) => (
    <header data-sidebar-trigger={String(props.showSidebarTrigger)}>
      {props.children}
    </header>
  ),
}))
vi.mock('../system-brand', () => ({
  SystemBrand: () => <div>Canvas brand</div>,
}))
vi.mock('../top-nav', () => ({ TopNav: () => <nav>Top navigation</nav> }))

describe('AppHeader Canvas shell boundary', () => {
  it('hides upstream navigation and utilities while invite registration is pending', () => {
    render(<AppHeader />)

    expect(screen.getByText('Canvas brand')).toBeVisible()
    expect(screen.getByText('Language switcher')).toBeVisible()
    expect(screen.getByText('Profile dropdown')).toBeVisible()
    expect(screen.queryByText('Top navigation')).not.toBeInTheDocument()
    expect(screen.queryByText('Search')).not.toBeInTheDocument()
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument()
    expect(screen.queryByText('Config drawer')).not.toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveAttribute(
      'data-sidebar-trigger',
      'false'
    )
  })

  it('restores the sidebar trigger after the root receives a canvas session', () => {
    canvasShellState.isCanvasRootUserManagement = true
    canvasShellState.isCanvasStandaloneShell = false
    canvasShellState.isCanvasShell = true

    render(<AppHeader />)

    expect(screen.getByRole('banner')).toHaveAttribute(
      'data-sidebar-trigger',
      'true'
    )
    expect(screen.queryByText('Top navigation')).not.toBeInTheDocument()

    canvasShellState.isCanvasStandaloneShell = true
  })
})

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InvitationManagement } from '../InvitationManagement'

const routeMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: { tab: 'codes' as const },
}))

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => routeMocks.navigate,
    useSearch: () => routeMocks.search,
  }),
  useBlocker: () => ({ status: 'idle' }),
}))

vi.mock('../AgentManagement', () => ({
  AgentManagement: () => <p>Inviter content</p>,
}))

vi.mock('../InviteCodeManagement', () => ({
  InviteCodeManagement: () => <p>Invite code content</p>,
}))

describe('Invitation management layout', () => {
  beforeEach(() => {
    routeMocks.navigate.mockReset()
  })

  it('uses the full content width for the tab track without stretching its tabs', () => {
    render(<InvitationManagement />)

    const tabList = screen.getByRole('tablist', {
      name: 'Invitation management',
    })
    expect(tabList).toHaveClass(
      'w-full',
      'max-w-full',
      'justify-start',
      'overflow-x-auto',
      'overflow-y-hidden'
    )
    expect(screen.getByRole('tab', { name: 'Invite codes' })).toHaveClass(
      'flex-none'
    )
    expect(screen.getByRole('tab', { name: 'Inviters' })).toHaveClass(
      'flex-none'
    )
  })

  it('keeps inviter selection routed through the existing tab callback', () => {
    render(<InvitationManagement />)

    fireEvent.click(screen.getByRole('tab', { name: 'Inviters' }))

    expect(routeMocks.navigate).toHaveBeenCalledWith({
      to: '/canvas-cloud/invitations',
      search: { tab: 'inviters' },
    })
  })
})

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

vi.mock('../AgentStatementTable', () => ({
  AgentStatementTable: () => <p>Statement content</p>,
}))

vi.mock('../AgentWithdrawalTable', () => ({
  AgentWithdrawalTable: () => <p>Withdrawal content</p>,
}))

vi.mock('../AgentEarningFormulaCard', () => ({
  AgentEarningFormulaCard: () => null,
}))

const earningsApi = vi.hoisted(() => ({
  getAdminPendingWithdrawalCount: vi.fn(),
  getAgentStatusPreview: vi.fn(),
}))

vi.mock('../../agent-earnings-api', () => ({
  ...earningsApi,
  agentEarningsQueryKeys: {
    all: ['canvas-cloud', 'agent-earnings'],
    pendingCount: ['canvas-cloud', 'agent-withdrawals', 'pending-count'],
  },
}))

function renderManagement() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <InvitationManagement />
    </QueryClientProvider>
  )
}

describe('Invitation management layout', () => {
  beforeEach(() => {
    routeMocks.navigate.mockReset()
    earningsApi.getAdminPendingWithdrawalCount.mockResolvedValue(0)
  })

  it('uses the full content width for the tab track without stretching its tabs', () => {
    renderManagement()

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
    renderManagement()

    fireEvent.click(screen.getByRole('tab', { name: 'Inviters' }))

    expect(routeMocks.navigate).toHaveBeenCalledWith({
      to: '/canvas-cloud/invitations',
      search: { tab: 'inviters' },
    })
  })

  it('shows the pending withdrawal count on the withdrawal requests tab', async () => {
    earningsApi.getAdminPendingWithdrawalCount.mockResolvedValue(3)
    renderManagement()

    const tab = screen.getByRole('tab', { name: /Withdrawal requests/u })
    expect(
      await screen.findByText(
        '3 withdrawal requests are waiting to be processed'
      )
    ).toBeInTheDocument()
    expect(tab).toHaveTextContent('3')
    fireEvent.click(screen.getByRole('tab', { name: /Monthly statements/u }))
    expect(routeMocks.navigate).toHaveBeenCalledWith({
      to: '/canvas-cloud/invitations',
      search: { tab: 'statements' },
    })
  })
})

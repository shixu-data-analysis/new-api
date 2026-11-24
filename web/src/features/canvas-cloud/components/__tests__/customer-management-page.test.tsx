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
import { fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { CustomerManagementPage } from '../CustomerManagementPage'

// The customer list stands in for AdminPointAdjustments: a selection it keeps in its own state, and the title action
// it puts into the slot the page gives it.
vi.mock('../AdminPointAdjustments', () => ({
  AdminPointAdjustments: (props: {
    titleActionSlot?: HTMLElement | null
    onOpenSupportConversation?: (conversationId: string) => void
  }) => {
    const [checked, setChecked] = useState(false)
    return (
      <>
        <label>
          <input
            type='checkbox'
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          alice
        </label>
        <button
          type='button'
          onClick={() => props.onOpenSupportConversation?.('conversation-1')}
        >
          message alice
        </button>
        {props.titleActionSlot
          ? createPortal(
              <button type='button'>Email every active customer</button>,
              props.titleActionSlot
            )
          : null}
      </>
    )
  },
}))
vi.mock('../../api', () => ({
  supportQueryKeys: {
    pendingCount: ['canvas-cloud', 'admin', 'support', 'pending-count'],
  },
  getCanvasAdminSupportPendingCount: vi.fn().mockResolvedValue(2),
}))
vi.mock('../SupportConversations', () => ({
  SupportConversations: (props: { conversationId?: string }) => (
    <p>conversation {props.conversationId ?? 'none'}</p>
  ),
}))
vi.mock('../CustomerMailRecords', () => ({
  CustomerMailRecords: () => <p>mail records</p>,
}))

describe('Customer management tabs', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  it('keeps the customer list and its title action across a switch to the email records', async () => {
    const slot = document.createElement('div')
    document.body.append(slot)
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <CustomerManagementPage titleActionSlot={slot} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'alice' }))
    // The support tab shows how many conversations wait for a reply, as the sidebar does.
    expect(
      await screen.findByText('2 support conversations are awaiting a reply')
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Customer emails' }))
    expect(screen.getByText('mail records')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Email every active customer' })
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Customer list' }))
    expect(screen.getByRole('checkbox', { name: 'alice' })).toBeChecked()
    slot.remove()
  })

  it('switches to the support tab with the conversation the customer details opened (SUPPORT-PROACTIVE-001)', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const onSupportChange = vi.fn()
    const view = render(
      <QueryClientProvider client={client}>
        <CustomerManagementPage onSupportChange={onSupportChange} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'message alice' }))
    expect(onSupportChange).toHaveBeenCalledWith({
      open: true,
      conversationId: 'conversation-1',
    })
    expect(
      screen.getByRole('tab', { name: /Support conversations/ })
    ).toHaveAttribute('aria-selected', 'true')
    // The route passes the conversation back, as the address bar does.
    view.rerender(
      <QueryClientProvider client={client}>
        <CustomerManagementPage
          tab='support'
          supportConversationId='conversation-1'
          onSupportChange={onSupportChange}
        />
      </QueryClientProvider>
    )
    expect(screen.getByText('conversation conversation-1')).toBeInTheDocument()
  })
})

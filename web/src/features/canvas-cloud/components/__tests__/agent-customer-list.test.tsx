/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import {
  AgentCustomerList,
  type AgentCustomerSource,
} from '../AgentCustomerList'

const apiMocks = vi.hoisted(() => ({
  getCanvasAgentCustomers: vi.fn(),
  getCanvasAgentCustomerModelUsage: vi.fn(),
  getCanvasAdminAgentCustomers: vi.fn(),
  getCanvasAdminAgentCustomerModelUsage: vi.fn(),
}))

vi.mock('../../api', () => apiMocks)

const recentDays = [
  '2026-10-10',
  '2026-10-11',
  '2026-10-12',
  '2026-10-13',
  '2026-10-14',
  '2026-10-15',
  '2026-10-16',
]

function renderList(source: AgentCustomerSource = { kind: 'agent' }) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AgentCustomerList source={source} />
    </QueryClientProvider>
  )
}

const adminSource: AgentCustomerSource = {
  kind: 'admin',
  agentCustomerId: 'agent-customer-v1',
  priceGroups: [
    {
      priceGroupId: 'group-v1',
      priceGroupName: 'Standard',
      currentCustomers: 1,
    },
  ],
}

describe('Agent customer list', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasAgentCustomers.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      recentDays,
      items: [
        {
          id: 'customer-v1',
          username: 'invited-user',
          status: 'ACTIVE',
          activatedAt: '2026-08-30T00:00:00.000Z',
          currentPriceGroup: { id: 'group-v1', name: 'Standard' },
          successfulTasks: 7,
          rechargedPoints: '12000',
          consumedPoints: '9860',
          activeDays: ['2026-10-12', '2026-10-16'],
        },
      ],
    })
    apiMocks.getCanvasAdminAgentCustomers.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      recentDays,
      items: [
        {
          id: 'customer-v1',
          username: 'invited-user',
          emailMasked: 'i***@example.com',
          status: 'ACTIVE',
          activatedAt: '2026-08-30T00:00:00.000Z',
          currentPriceGroup: { id: 'group-v1', name: 'Standard' },
          successfulTasks: 7,
          rechargedPoints: '12000',
          consumedPoints: '9860',
          activeDays: [],
          modelUsageAmount: '10.5',
          amountIncomplete: false,
        },
      ],
    })
  })

  it('shows recharge and consumption points and hides the two optional columns by default', async () => {
    renderList()

    expect(await screen.findByText('invited-user')).toBeVisible()
    expect(screen.getByText('12,000')).toBeVisible()
    expect(screen.getByText('9,860')).toBeVisible()
    expect(screen.queryByText('Current price group')).not.toBeInTheDocument()
    expect(screen.queryByText('Successful tasks')).not.toBeInTheDocument()
    expect(screen.queryByText('Standard')).not.toBeInTheDocument()
  })

  it('lights one dot per active day from the oldest day to today', async () => {
    renderList()

    const activity = await screen.findByRole('img', {
      name: /^Active on 2 of the last 7 days: /u,
    })
    const dots = [...activity.children]
    expect(dots).toHaveLength(7)
    expect(dots.map((dot) => dot.getAttribute('data-active'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
      'false',
      'true',
    ])
    expect(dots[6]).toHaveAttribute(
      'title',
      expect.stringMatching(/\(today\): active$/u)
    )
    expect(dots[0]).toHaveAttribute(
      'title',
      expect.stringMatching(/: inactive$/u)
    )
    // Keyboard, touch and screen reader users get the active dates from the accessible name, not only from hover.
    const activeLabels = [dots[2], dots[6]].map((dot) =>
      (dot?.getAttribute('title') ?? '').replace(/: active$/u, '')
    )
    const name = activity.getAttribute('aria-label') ?? ''
    expect(activeLabels.every((label) => name.includes(label))).toBe(true)
    expect(name).toMatch(/\(today\)$/u)
  })

  it('shows successful tasks from the View menu without a sort control', async () => {
    const user = userEvent.setup()
    renderList()
    await screen.findByText('invited-user')

    await user.click(screen.getByRole('button', { name: 'View' }))
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Successful tasks' })
    )

    const header = await screen.findByRole('columnheader', {
      name: 'Successful tasks',
    })
    expect(within(header).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('7')).toBeVisible()
  })

  it('sorts by total recharged points in the database query', async () => {
    const user = userEvent.setup()
    renderList()
    await screen.findByText('invited-user')

    await user.click(
      screen.getByRole('button', { name: /Total recharged points/u })
    )
    await user.click(await screen.findByRole('menuitem', { name: /Asc/u }))

    await waitFor(() =>
      expect(apiMocks.getCanvasAgentCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sortBy: 'rechargedPoints',
          sortOrder: 'asc',
          page: 1,
        }),
        expect.anything()
      )
    )
  })

  it('searches by username and offers no email field', async () => {
    const user = userEvent.setup()
    renderList()
    await screen.findByText('invited-user')

    await user.click(screen.getByRole('button', { name: /^Filters/u }))
    await user.type(
      await screen.findByRole('textbox', { name: 'Username' }),
      'invited'
    )

    expect(
      screen.queryByRole('textbox', { name: 'Email' })
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(apiMocks.getCanvasAgentCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({ username: 'invited' }),
        expect.anything()
      )
    )
    expect(apiMocks.getCanvasAgentCustomers).not.toHaveBeenCalledWith(
      expect.objectContaining({ email: expect.anything() }),
      expect.anything()
    )
  })

  it('shows the administrator the masked email under the username and the agent display amount', async () => {
    renderList(adminSource)

    expect(await screen.findByText('invited-user')).toBeVisible()
    expect(screen.getByText('i***@example.com')).toBeVisible()
    expect(screen.getByText('¥10.5')).toBeVisible()
    expect(apiMocks.getCanvasAdminAgentCustomers).toHaveBeenCalledWith(
      'agent-customer-v1',
      expect.objectContaining({ page: 1, sortBy: 'activatedAt' }),
      expect.anything()
    )
    expect(apiMocks.getCanvasAgentCustomers).not.toHaveBeenCalled()
  })

  it('never shows the agent an email or a display amount', async () => {
    renderList()

    expect(await screen.findByText('invited-user')).toBeVisible()
    expect(screen.queryByText(/@example\.com/u)).not.toBeInTheDocument()
    expect(screen.queryByText(/¥/u)).not.toBeInTheDocument()
  })

  it('filters the administrator list by email and current price group', async () => {
    const user = userEvent.setup()
    renderList(adminSource)
    await screen.findByText('invited-user')

    await user.click(screen.getByRole('button', { name: /^Filters/u }))
    await user.type(
      await screen.findByRole('textbox', { name: 'Email' }),
      'i***'
    )
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminAgentCustomers).toHaveBeenLastCalledWith(
        'agent-customer-v1',
        expect.objectContaining({ email: 'i***', page: 1 }),
        expect.anything()
      )
    )
    await user.click(
      screen.getByRole('combobox', { name: 'Current price plan' })
    )
    await user.click(await screen.findByRole('option', { name: 'Standard' }))
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminAgentCustomers).toHaveBeenLastCalledWith(
        'agent-customer-v1',
        expect.objectContaining({ priceGroupId: 'group-v1' }),
        expect.anything()
      )
    )
  })
})

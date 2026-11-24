/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

import { agentFilterQuery } from '../../agent-filter-query'
import { DashboardAgentSelect } from '../DashboardSearchSelect'

const apiMocks = vi.hoisted(() => ({
  getCanvasAgents: vi.fn(),
  getCanvasAdminCustomers: vi.fn(),
}))
vi.mock('../../api', () => apiMocks)
vi.mock('../../operating-dashboard-api', () => ({
  getOperatingDashboardModelOptions: vi.fn(),
}))

describe('agentFilterQuery', () => {
  it('filters by one agent for an agent option', () => {
    expect(
      agentFilterQuery({ value: 'agent-principal', label: 'linxiao' })
    ).toEqual({
      agentPrincipalId: 'agent-principal',
    })
  })

  it('filters to customers without an agent for No agent', () => {
    expect(agentFilterQuery({ value: '__none__', label: 'No agent' })).toEqual({
      noAgent: true,
    })
  })

  it('adds no filter for All agents', () => {
    expect(agentFilterQuery({ value: '__all__', label: 'All agents' })).toEqual(
      {}
    )
  })
})

describe('DashboardAgentSelect', () => {
  beforeAll(() =>
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  )

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasAgents.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
  })

  it('shows a fixed option in the current language, not the label saved when it was chosen', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DashboardAgentSelect
          id='agent'
          value={{ value: '__all__', label: 'Label saved in another language' }}
          onChange={vi.fn()}
        />
      </QueryClientProvider>
    )

    expect(screen.getByRole('combobox')).toHaveValue('All agents')
  })
  it('keeps the typed search text when the page re-renders while All agents is selected', async () => {
    const user = userEvent.setup()
    const client = new QueryClient()
    const value = { value: '__all__', label: 'All agents' }
    const onChange = vi.fn()
    const view = render(
      <QueryClientProvider client={client}>
        <DashboardAgentSelect id='agent' value={value} onChange={onChange} />
      </QueryClientProvider>
    )

    const input = screen.getByRole('combobox')
    await user.type(input, 'lin', {
      initialSelectionStart: 0,
      initialSelectionEnd: 'All agents'.length,
    })
    // The page re-renders while the administrator types, for example when the customer list arrives.
    view.rerender(
      <QueryClientProvider client={client}>
        <DashboardAgentSelect id='agent' value={value} onChange={onChange} />
      </QueryClientProvider>
    )

    expect(input).toHaveValue('lin')
    await waitFor(() =>
      expect(apiMocks.getCanvasAgents).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'lin' }),
        expect.anything()
      )
    )
  })
  it('keeps the shown candidates while the next search loads, so the list does not collapse', async () => {
    const user = userEvent.setup()
    apiMocks.getCanvasAgents
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 20,
        total: 1,
        items: [
          { principalId: 'agent-lin', username: 'linxiao', status: 'ACTIVE' },
        ],
      })
      .mockReturnValueOnce(new Promise(() => undefined))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DashboardAgentSelect
          id='agent'
          value={{ value: '__all__', label: 'All agents' }}
          onChange={vi.fn()}
        />
      </QueryClientProvider>
    )

    const input = screen.getByRole('combobox')
    await user.click(input)
    await screen.findByRole('option', { name: /linxiao/ })
    await user.type(input, 'li', {
      initialSelectionStart: 0,
      initialSelectionEnd: 'All agents'.length,
    })
    await waitFor(() =>
      expect(apiMocks.getCanvasAgents).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'li' }),
        expect.anything()
      )
    )

    expect(screen.getByRole('option', { name: /linxiao/ })).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).toBeNull()
  })
  it('marks a disabled agent with the agent qualification status 已停用', async () => {
    const user = userEvent.setup()
    i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
    await i18next.changeLanguage('zh')
    apiMocks.getCanvasAgents.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          principalId: 'agent-off',
          username: 'uatagentoff',
          status: 'DISABLED',
        },
      ],
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DashboardAgentSelect
          id='agent'
          value={{ value: '__all__', label: '全部代理商' }}
          onChange={vi.fn()}
        />
      </QueryClientProvider>
    )

    await user.click(screen.getByRole('combobox'))

    const option = await screen.findByRole('option', { name: /uatagentoff/ })
    expect(option).toHaveTextContent('已停用')
  })
})

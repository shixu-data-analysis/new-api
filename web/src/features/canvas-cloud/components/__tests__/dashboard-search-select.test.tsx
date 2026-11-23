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
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

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
})

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
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import { CampaignManagement } from '../CampaignManagement'

const mocks = vi.hoisted(() => ({
  getCanvasCampaigns: vi.fn(),
  getCanvasCampaignTracking: vi.fn(),
}))

vi.mock('../../campaign-api', () => ({
  getCanvasCampaigns: mocks.getCanvasCampaigns,
  getCanvasCampaignTracking: mocks.getCanvasCampaignTracking,
  grantCanvasCampaign: vi.fn(),
  publishCanvasCampaign: vi.fn(),
  saveCanvasCampaignDraft: vi.fn(),
  stopCanvasCampaign: vi.fn(),
}))
vi.mock('../../api', () => ({ getCanvasAdminCustomers: vi.fn() }))
vi.mock('../CampaignForm', () => ({ CampaignForm: () => null }))
vi.mock('../CanvasServerTable', () => ({
  CanvasServerTable: (props: { additionalFilters?: ReactNode }) => (
    <section>{props.additionalFilters}</section>
  ),
}))
vi.mock('../PricingActionConfirmation', () => ({
  PricingActionConfirmation: () => null,
}))

it('shows localized campaign filter labels instead of raw values in Chinese', async () => {
  i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
  await i18next.changeLanguage('zh')
  mocks.getCanvasCampaigns.mockResolvedValue({ items: [], total: 0 })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={client}>
      <CampaignManagement />
    </QueryClientProvider>
  )

  expect(
    await screen.findByRole('combobox', { name: '活动类型' })
  ).toHaveTextContent('全部活动类型')
  expect(screen.getByRole('combobox', { name: '状态' })).toHaveTextContent(
    '全部状态'
  )

  await i18next.changeLanguage('en')
})

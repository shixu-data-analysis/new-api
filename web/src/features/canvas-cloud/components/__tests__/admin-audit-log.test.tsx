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
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import type {
  CanvasAuditEventPage,
  CanvasAuditResolvedNames,
} from '../../types'
import { AdminAuditLog } from '../AdminAuditLog'

const mocks = vi.hoisted(() => ({ audit: vi.fn(), customers: vi.fn() }))
vi.mock('../../api', () => ({
  getCanvasAuditEvents: mocks.audit,
  getCanvasAdminCustomers: mocks.customers,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: () => null,
}))

const customerId = '89000000-0000-7000-8000-000000000001'
const lotId = '89000000-0000-7000-8000-000000000002'
type AuditEvent = CanvasAuditEventPage['items'][number]
const base: AuditEvent = {
  id: '89000000-0000-7000-8000-000000000010',
  occurredAt: '2026-10-11T08:42:10.000Z',
  service: 'canvas-cloud',
  environment: 'test',
  category: 'POINTS',
  action: 'points.manual_bonus.granted',
  outcome: 'SUCCESS',
  severity: 'INFO',
  actorPrincipalId: '89000000-0000-7000-8000-000000000003',
  actorType: 'SUPER_ADMIN',
  actorUsername: 'root',
  requestId: null,
  traceId: null,
  resourceType: 'POINT_LOT',
  resourceId: lotId,
  resourceKey: null,
  reasonCode: 'MANUAL_BONUS',
  publicMetadata: {
    customerId,
    points: '500',
    executionOrigin: 'REAL',
  },
}
const emptyNames: CanvasAuditResolvedNames = {
  customers: {},
  customerModels: {},
  agents: {},
  rechargeOrders: {},
  priceGroups: {},
  modelTags: {},
  promotionVersions: {},
  campaignGrantPlans: {},
  priceVersions: {},
  providerRateVersions: {},
  providers: {},
  inviteCodes: {},
  rechargeCodes: {},
  rechargeCodeBatches: {},
  principals: {},
}

function renderLog(
  items: AuditEvent[],
  names: Partial<CanvasAuditResolvedNames> = {}
) {
  mocks.audit.mockResolvedValue({
    page: 1,
    pageSize: 20,
    total: items.length,
    items,
    resolvedNames: { ...emptyNames, ...names },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <AdminAuditLog />
    </QueryClientProvider>
  )
}

describe('operation log', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.customers.mockResolvedValue({ items: [], total: 0 })
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
    await i18next.changeLanguage('en')
  })

  it('requests administrator operations by default and exact source filters after a change', async () => {
    const user = userEvent.setup()
    renderLog([base])
    await screen.findByRole('button', { name: 'Manual Bonus granted' })
    expect(mocks.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ actorScope: 'ADMIN' }),
      expect.anything()
    )
    expect(mocks.audit.mock.lastCall?.[0]).not.toHaveProperty('action')

    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    await user.click(screen.getByRole('combobox', { name: 'Operation source' }))
    await user.click(await screen.findByRole('option', { name: 'System' }))

    expect(mocks.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ actorScope: 'SYSTEM', page: 1 }),
      expect.anything()
    )
  })

  it('filters a task execution status by the exact code Cloud writes', async () => {
    const user = userEvent.setup()
    renderLog([base])
    await screen.findByRole('button', { name: 'Manual Bonus granted' })
    fireEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    await user.type(
      screen.getByRole('combobox', { name: 'Action' }),
      'Succeeded'
    )
    await user.click(
      await screen.findByRole('option', {
        name: 'Execution status changed · Succeeded',
      })
    )
    expect(mocks.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'task.execution.succeeded' }),
      expect.anything()
    )
  })

  it('shows registered names, raw codes for unregistered actions, and readable objects without IDs', async () => {
    renderLog(
      [
        base,
        {
          ...base,
          id: '89000000-0000-7000-8000-000000000011',
          action: 'future.action.added',
          actorType: 'PLATFORM_ADMIN',
          actorUsername: 'ops02',
          resourceType: 'FUTURE_RESOURCE',
          publicMetadata: {},
        },
      ],
      { customers: { [customerId]: 'lin_studio' } }
    )

    const named = await screen.findByRole('row', {
      name: /Manual Bonus granted/,
    })
    expect(within(named).getByText('Super Admin · root')).toBeVisible()
    expect(within(named).getByText('Customer · lin_studio')).toBeVisible()
    const raw = screen.getByRole('row', { name: /future\.action\.added/ })
    expect(
      within(raw).getByText('Platform administrator · ops02')
    ).toBeVisible()
    expect(within(raw).getByText('FUTURE_RESOURCE')).toBeVisible()
    expect(screen.queryByText(lotId)).not.toBeInTheDocument()
    expect(screen.queryByText(/Unknown/)).not.toBeInTheDocument()
  })

  it('falls back to the object type when the named row no longer exists', async () => {
    renderLog([base])
    const row = await screen.findByRole('row', {
      name: /Manual Bonus granted/,
    })
    expect(within(row).getByRole('cell', { name: 'Customer' })).toBeVisible()
  })

  it('opens details with labelled IDs, a named copy button and only the listed metadata', async () => {
    renderLog([base], { customers: { [customerId]: 'lin_studio' } })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Manual Bonus granted' })
    )

    const sheet = await screen.findByRole('dialog')
    expect(
      within(sheet).getByRole('heading', { name: 'Manual Bonus granted' })
    ).toBeVisible()
    expect(within(sheet).getByText('Point lot ID')).toBeVisible()
    expect(within(sheet).getByText(lotId)).toBeVisible()
    expect(
      within(sheet).getByRole('button', { name: 'Copy Point lot ID' })
    ).toBeVisible()
    expect(within(sheet).getByText('lin_studio')).toBeVisible()
    expect(within(sheet).getByText('500')).toBeVisible()
    expect(within(sheet).queryByText('REAL')).not.toBeInTheDocument()
    expect(within(sheet).queryByText('MANUAL_BONUS')).not.toBeInTheDocument()
  })

  it('explains a permission failure instead of showing an empty log', async () => {
    mocks.audit.mockRejectedValue({ response: { status: 403 } })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <AdminAuditLog />
      </QueryClientProvider>
    )
    expect(
      await screen.findByText(
        'You do not have permission to view operation logs.'
      )
    ).toBeVisible()
  })

  it.each(['zhCN', 'zhTW'])(
    'opens numeric details in the %s interface language without failing',
    async (language) => {
      i18next.addResourceBundle(
        language,
        'translation',
        (language === 'zhCN' ? zh : zhTW).translation,
        true,
        true
      )
      await i18next.changeLanguage(language)
      renderLog(
        [{ ...base, publicMetadata: { customerId, points: '12500' } }],
        {
          customers: { [customerId]: 'lin_studio' },
        }
      )
      fireEvent.click(
        await screen.findByRole('button', {
          name: i18next.t('points.manual_bonus.granted'),
        })
      )
      const sheet = await screen.findByRole('dialog')
      expect(within(sheet).getByText('12,500')).toBeVisible()
    }
  )
})

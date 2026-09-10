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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import { CustomerPointHistory } from '../CustomerPointHistory'

const apiMocks = vi.hoisted(() => ({
  getCanvasAdminCustomerPointLedger: vi.fn(),
  getCanvasCustomerPointLedger: vi.fn(),
  getCanvasCustomerPointLots: vi.fn(),
}))

vi.mock('../../api', () => apiMocks)

function renderHistory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CustomerPointHistory />
    </QueryClientProvider>
  )
}

describe('Customer point history', () => {
  beforeAll(() =>
    i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
  )

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('zh')
    apiMocks.getCanvasCustomerPointLots.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: '85000000-0000-7000-8000-000000000003',
          type: 'BONUS',
          sourceType: 'INVITE',
          rechargeOrderId: null,
          rechargeOrderNumber: null,
          initialPoints: '500',
          remainingPoints: '500',
          reservedPoints: '0',
          availablePoints: '500',
          expiresAt: null,
          issuedAt: '2026-09-03T00:55:45.000Z',
        },
      ],
    })
    apiMocks.getCanvasCustomerPointLedger.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: '85000000-0000-7000-8000-000000000005',
          pointLotId: '85000000-0000-7000-8000-000000000003',
          eventType: 'ISSUE',
          eventPoints: '500',
          remainingDelta: '500',
          reservedDelta: '0',
          taskId: '85000000-0000-7000-8000-000000000006',
          refundLinkId: '85000000-0000-7000-8000-000000000007',
          reason: 'INVITE_REGISTRATION',
          occurredAt: '2026-09-03T00:55:45.000Z',
        },
      ],
    })
  })

  it('opens the related task from administrator ledger history without displaying its identifier', async () => {
    const taskId = '85000000-0000-7000-8000-000000000006'
    apiMocks.getCanvasAdminCustomerPointLedger.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'ledger-settlement',
          pointLotId: 'lot-a',
          eventType: 'SETTLE',
          eventPoints: '25',
          remainingDelta: '-25',
          reservedDelta: '-25',
          taskId,
          outputIndex: null,
          pointReturnId: null,
          refundLinkId: null,
          rechargeOrderId: 'order-a',
          rechargeOrderNumber: 'ORD-001',
          reason: 'Task succeeded',
          occurredAt: '2026-09-03T00:55:45.000Z',
        },
      ],
    })
    const onInspect = vi.fn()
    const onOpenOrder = vi.fn()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <CustomerPointHistory
          customerId='customer-a'
          view='ledger'
          onInspect={onInspect}
          onOpenOrder={onOpenOrder}
        />
      </QueryClientProvider>
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: zh.translation.Task,
      })
    )
    expect(onInspect).toHaveBeenCalledWith({ kind: 'task', id: taskId })
    expect(onOpenOrder).not.toHaveBeenCalled()
    expect(screen.queryByText(taskId)).not.toBeInTheDocument()
    expect(apiMocks.getCanvasCustomerPointLedger).not.toHaveBeenCalled()
  })

  it('renders an ordinary related-record placeholder when no real target exists', async () => {
    apiMocks.getCanvasAdminCustomerPointLedger.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'ledger-unlinked',
          pointLotId: null,
          eventType: 'ISSUE',
          eventPoints: '25',
          remainingDelta: '25',
          reservedDelta: '0',
          availableDelta: '25',
          taskId: null,
          taskOutputId: null,
          outputIndex: null,
          pointReturnId: null,
          refundLinkId: null,
          rechargeOrderId: null,
          rechargeOrderNumber: null,
          reason: 'Manual gift',
          occurredAt: '2026-09-03T00:55:45.000Z',
        },
      ],
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <CustomerPointHistory customerId='customer-a' view='ledger' />
      </QueryClientProvider>
    )

    expect(await screen.findByText('无关联记录')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: zh.translation.Task })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: zh.translation['Point Lot'] })
    ).not.toBeInTheDocument()
  })

  it('opens the related Point Lot for an administrator ledger entry without a more specific record', async () => {
    apiMocks.getCanvasAdminCustomerPointLedger.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'ledger-gift',
          pointLotId: 'lot-gift',
          eventType: 'ISSUE',
          eventPoints: '25',
          remainingDelta: '25',
          reservedDelta: '0',
          availableDelta: '25',
          taskId: null,
          taskOutputId: null,
          outputIndex: null,
          pointReturnId: null,
          refundLinkId: null,
          rechargeOrderId: null,
          rechargeOrderNumber: null,
          reason: 'Manual gift',
          occurredAt: '2026-09-03T00:55:45.000Z',
        },
      ],
    })
    const onInspect = vi.fn()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <CustomerPointHistory
          customerId='customer-a'
          view='ledger'
          onInspect={onInspect}
        />
      </QueryClientProvider>
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: zh.translation['Point Lot'],
      })
    )
    expect(onInspect).toHaveBeenCalledWith({ kind: 'lot', id: 'lot-gift' })
    expect(screen.queryByText('lot-gift')).not.toBeInTheDocument()
  })

  it('shows customer-readable point fields without internal identifiers', async () => {
    renderHistory()

    expect(await screen.findByText('邀请注册')).toBeVisible()
    expect(screen.getByText('涉及积分')).toBeVisible()
    expect(screen.getByText('可用积分变化')).toBeVisible()
    expect(screen.getByText('+500')).toBeVisible()
    expect(screen.queryByText('INVITE_REGISTRATION')).not.toBeInTheDocument()
    expect(
      screen.queryByText('85000000-0000-7000-8000-000000000003')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('85000000-0000-7000-8000-000000000006')
    ).not.toBeInTheDocument()

    const filterButtons = screen.getAllByRole('button', { name: '列筛选' })
    fireEvent.click(filterButtons[0])
    await waitFor(() =>
      expect(screen.getByLabelText('画布充值订单')).toBeVisible()
    )
    expect(screen.queryByLabelText('积分批次')).not.toBeInTheDocument()

    fireEvent.click(filterButtons[0])
    fireEvent.click(filterButtons[1])
    await waitFor(() => expect(screen.getByLabelText('事件')).toBeVisible())
    expect(screen.queryByLabelText('任务 ID')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('退款记录编号')).not.toBeInTheDocument()
  })
})

/* Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import i18next from 'i18next'
import type { ComponentProps } from 'react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import en from '@/i18n/locales/en.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { CustomerLotDetails } from '../CustomerLotDetails'

const apiMocks = vi.hoisted(() => ({
  getCanvasCustomerBusinessFacts: vi.fn(),
}))
vi.mock('../../api', () => apiMocks)

function mount(props: ComponentProps<typeof CustomerLotDetails>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CustomerLotDetails {...props} />
    </QueryClientProvider>
  )
}

describe('Customer point lot details', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'en',
      resources: { en, zhCN: zh, zhTW },
      fallbackLng: 'en',
    })
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
  })
  afterEach(cleanup)

  it('uses only the exact batch source order and renders an unlinked event as text', async () => {
    const onOpenOrder = vi.fn()
    apiMocks.getCanvasCustomerBusinessFacts.mockImplementation(
      async (
        _customer: string,
        query: { kind?: string },
        root?: { kind: string; id: string }
      ) => {
        if (root?.kind === 'lot') {
          return {
            ...query,
            total: 1,
            items: [
              {
                id: 'ledger-a',
                kind: 'ledger',
                name: '',
                status: 'ISSUE',
                at: '2026-09-05T12:00:00Z',
              },
            ],
            fact: {
              id: 'lot-a',
              kind: 'lot',
              name: 'VCH-001',
              status: 'PAID',
              at: '2026-09-05T12:00:00Z',
              fields: {
                lotType: 'PAID',
                sourceType: 'RECHARGE_CODE',
                rechargeOrderId: 'order-a',
                rechargeOrderNumber: 'VCH-001',
                initialPoints: '500',
                availablePoints: '400',
                reservedPoints: '100',
                expiresAt: null,
              },
            },
          }
        }
        return {
          ...query,
          total: 0,
          items: [],
          fact: {
            id: 'ledger-a',
            kind: 'ledger',
            name: '',
            status: 'ISSUE',
            at: '2026-09-05T12:00:00Z',
            fields: { eventPoints: '500' },
          },
        }
      }
    )
    mount({
      customerId: 'customer-a',
      lotId: 'lot-a',
      onOpenOrder,
    })

    fireEvent.click(await screen.findByRole('button', { name: 'VCH-001' }))
    expect(onOpenOrder).toHaveBeenCalledWith('order-a')
    expect((await screen.findAllByText('500')).length).toBeGreaterThan(1)
    expect(
      screen.queryByRole('button', { name: 'Issuance' })
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(apiMocks.getCanvasCustomerBusinessFacts).toHaveBeenCalledWith(
        'customer-a',
        expect.objectContaining({ kind: 'ledger' }),
        { kind: 'lot', id: 'lot-a' },
        expect.any(AbortSignal)
      )
    )
  })

  it('retries a failed point-lot detail request and uses the Manual gift term', async () => {
    await i18next.changeLanguage('zhCN')
    apiMocks.getCanvasCustomerBusinessFacts
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 20,
        total: 0,
        items: [],
        fact: {
          id: 'lot-manual',
          kind: 'lot',
          name: '',
          status: 'BONUS',
          at: '2026-09-05T12:00:00Z',
          fields: {
            lotType: 'BONUS',
            sourceType: 'MANUAL_GRANT',
            initialPoints: '0',
            availablePoints: '0',
            reservedPoints: '0',
            expiresAt: null,
          },
        },
      })
    mount({
      customerId: 'customer-a',
      lotId: 'lot-manual',
      onOpenOrder: vi.fn(),
    })

    expect(await screen.findByRole('alert')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('人工赠送')).toBeVisible()
    expect(screen.getByText('批次编号')).toBeVisible()
    expect(screen.getByText('原始发放')).toBeVisible()
    expect(screen.getByText('冻结积分')).toBeVisible()
    expect(screen.getByRole('heading', { name: '积分变动' })).toBeVisible()
    expect(screen.queryByText('积分批次')).not.toBeInTheDocument()
    expect(screen.queryByText('初始积分')).not.toBeInTheDocument()
    expect(screen.queryByText('任务预留积分')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '变动流水' })
    ).not.toBeInTheDocument()
  })

  it('shows where an invitation lot came from and hides source fields it does not have', async () => {
    apiMocks.getCanvasCustomerBusinessFacts.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
      fact: {
        id: 'lot-invite',
        kind: 'lot',
        name: '',
        status: 'BONUS',
        at: '2026-09-19T17:36:48Z',
        fields: {
          lotType: 'BONUS',
          sourceType: 'INVITE_BONUS',
          initialPoints: '500',
          availablePoints: '165',
          reservedPoints: '0',
          expiresAt: null,
          inviteCode: 'CANVAS-••••••••',
          inviteRegisteredAt: '2026-09-19T17:36:48Z',
          issueReason: 'INVITE_REGISTRATION',
          issuedBy: 'UAT Platform Admin',
          activityName: null,
          originalLotId: null,
        },
      },
    })
    mount({
      customerId: 'customer-a',
      lotId: 'lot-invite',
      onOpenOrder: vi.fn(),
    })
    expect(await screen.findByText('CANVAS-••••••••')).toBeVisible()
    expect(screen.getByText('Registered at')).toBeVisible()
    expect(screen.getByText('Invite registration')).toBeVisible()
    expect(screen.getByText('UAT Platform Admin')).toBeVisible()
    expect(screen.queryByText('Activity name')).not.toBeInTheDocument()
    expect(screen.queryByText('Source lot')).not.toBeInTheDocument()
  })

  it('shows accessible Loading for pending point-lot and ledger detail requests', async () => {
    apiMocks.getCanvasCustomerBusinessFacts.mockReturnValue(
      new Promise(() => {})
    )
    mount({
      customerId: 'customer-a',
      lotId: 'lot-pending',
      onOpenOrder: vi.fn(),
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Not recorded')).not.toBeInTheDocument()

    cleanup()
    apiMocks.getCanvasCustomerBusinessFacts.mockImplementation(
      async (
        _customer: string,
        _query: Record<string, unknown>,
        root?: { kind: string; id: string }
      ) => {
        if (root?.kind === 'lot') {
          return {
            page: 1,
            pageSize: 20,
            total: 1,
            items: [
              {
                id: 'ledger-pending',
                kind: 'ledger',
                name: '',
                status: 'ISSUE',
                at: '2026-09-05T12:00:00Z',
              },
            ],
            fact: {
              id: 'lot-ready',
              kind: 'lot',
              name: '',
              status: 'BONUS',
              at: '2026-09-05T12:00:00Z',
              fields: {
                lotType: 'BONUS',
                sourceType: 'PROMOTION',
                initialPoints: '50',
                availablePoints: '50',
                reservedPoints: '0',
                expiresAt: null,
              },
            },
          }
        }
        return new Promise(() => {})
      }
    )
    mount({
      customerId: 'customer-a',
      lotId: 'lot-ready',
      onOpenOrder: vi.fn(),
    })
    expect((await screen.findAllByRole('status')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Not recorded')).not.toBeInTheDocument()
  })

  it('distinguishes an unavailable ledger detail from a missing field and retries it', async () => {
    let ledgerRequestCount = 0
    apiMocks.getCanvasCustomerBusinessFacts.mockImplementation(
      async (
        _customer: string,
        _query: Record<string, unknown>,
        root?: { kind: string; id: string }
      ) => {
        if (root?.kind === 'lot') {
          return {
            page: 1,
            pageSize: 20,
            total: 1,
            items: [
              {
                id: 'ledger-retry',
                kind: 'ledger',
                name: '',
                status: 'ISSUE',
                at: '2026-09-05T12:00:00Z',
              },
            ],
            fact: {
              id: 'lot-a',
              kind: 'lot',
              name: '',
              status: 'BONUS',
              at: '2026-09-05T12:00:00Z',
              fields: {
                lotType: 'BONUS',
                sourceType: 'PROMOTION',
                initialPoints: '500',
                availablePoints: '500',
                reservedPoints: '0',
                expiresAt: null,
              },
            },
          }
        }
        ledgerRequestCount += 1
        if (ledgerRequestCount === 1) throw new Error('offline')
        return {
          page: 1,
          pageSize: 20,
          total: 0,
          items: [],
          fact: {
            id: 'ledger-retry',
            kind: 'ledger',
            name: '',
            status: 'ISSUE',
            at: '2026-09-05T12:00:00Z',
            fields: { eventPoints: '500' },
          },
        }
      }
    )
    mount({
      customerId: 'customer-a',
      lotId: 'lot-a',
      onOpenOrder: vi.fn(),
    })

    expect(await screen.findByRole('alert')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findAllByText('500')).not.toHaveLength(0)
  })
})

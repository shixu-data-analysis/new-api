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

import { CustomerRecordDetails } from '../CustomerRecordDetails'

const apiMocks = vi.hoisted(() => ({
  getCanvasAdminCustomerTasks: vi.fn(),
  getCanvasCustomerBusinessFacts: vi.fn(),
}))
vi.mock('../../api', () => apiMocks)

function mount(props: ComponentProps<typeof CustomerRecordDetails>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CustomerRecordDetails {...props} />
    </QueryClientProvider>
  )
}

describe('Customer record details', () => {
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

  it('uses the exact task record and preserves a failed output reason', async () => {
    apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'task-a',
          modelName: 'GPT Image 2',
          quotedPoints: '100',
          allocatedPoints: '100',
          settledPoints: '0',
          releasedPoints: '100',
          executionStatus: 'CONFIRMED_FAILED',
          customerBillingStatus: 'RELEASED_FAILED',
          providerReconcileStatus: 'PENDING',
          upstreamTaskId: null,
          acceptedAt: '2026-09-05T12:00:00Z',
          completedAt: '2026-09-05T12:01:00Z',
          outputSummaries: [
            {
              id: 'output-a',
              outputIndex: 0,
              executionStatus: 'CONFIRMED_FAILED',
              billingStatus: 'RELEASED_FAILED',
              quotedPoints: '100',
              settledPoints: null,
              completedAt: '2026-09-05T12:01:00Z',
              error: {
                code: 'PROVIDER_REJECTED',
                messages: { en: 'Unsupported size' },
              },
            },
          ],
        },
      ],
    })
    mount({
      customerId: 'customer-a',
      target: { kind: 'task', id: 'task-a' },
      onOpenOrder: vi.fn(),
    })

    expect(await screen.findByText('GPT Image 2')).toBeVisible()
    expect(screen.getByText('Unsupported size')).toBeVisible()
    expect(screen.queryByText('PROVIDER_REJECTED')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible()
    expect(apiMocks.getCanvasAdminCustomerTasks).toHaveBeenCalledWith(
      'customer-a',
      expect.objectContaining({ taskId: 'task-a' }),
      expect.any(AbortSignal)
    )
  })

  it.each(['zhCN', 'zhTW'])(
    'formats task points safely for %s',
    async (language) => {
      await i18next.changeLanguage(language)
      apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
        page: 1,
        pageSize: 20,
        total: 1,
        items: [
          {
            id: `task-${language}`,
            modelName: 'GPT Image 2',
            quotedPoints: '1000',
            allocatedPoints: '1000',
            settledPoints: '1000',
            releasedPoints: '0',
            executionStatus: 'SUCCEEDED',
            customerBillingStatus: 'SETTLED',
            providerReconcileStatus: 'PENDING',
            upstreamTaskId: null,
            acceptedAt: '2026-09-05T12:00:00Z',
            completedAt: null,
          },
        ],
      })
      mount({
        customerId: 'customer-a',
        target: { kind: 'task', id: `task-${language}` },
        onOpenOrder: vi.fn(),
      })

      expect((await screen.findAllByText('1,000')).length).toBeGreaterThan(0)
    }
  )

  it('uses the current interface language then English for output errors', async () => {
    await i18next.changeLanguage('zhCN')
    apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'task-zh',
          modelName: 'GPT Image 2',
          quotedPoints: '100',
          allocatedPoints: '100',
          settledPoints: '0',
          releasedPoints: '100',
          executionStatus: 'CONFIRMED_FAILED',
          customerBillingStatus: 'RELEASED_FAILED',
          providerReconcileStatus: 'PENDING',
          upstreamTaskId: null,
          acceptedAt: '2026-09-05T12:00:00Z',
          completedAt: null,
          outputSummaries: [
            {
              outputIndex: 0,
              executionStatus: 'CONFIRMED_FAILED',
              billingStatus: 'RELEASED_FAILED',
              quotedPoints: '100',
              settledPoints: null,
              error: {
                code: 'PROVIDER_REJECTED',
                messages: { zhCN: '尺寸不受支持', en: 'Unsupported size' },
              },
            },
          ],
        },
      ],
    })
    mount({
      customerId: 'customer-a',
      target: { kind: 'task', id: 'task-zh' },
      onOpenOrder: vi.fn(),
    })
    expect(await screen.findByText('尺寸不受支持')).toBeVisible()
    expect(screen.getByText('受理时间')).toBeVisible()
    expect(screen.getByText('结算状态')).toBeVisible()
    expect(screen.queryByText('接受时间')).not.toBeInTheDocument()
    expect(screen.queryByText('计费状态')).not.toBeInTheDocument()

    cleanup()
    await i18next.changeLanguage('zhTW')
    mount({
      customerId: 'customer-a',
      target: { kind: 'task', id: 'task-zh' },
      onOpenOrder: vi.fn(),
    })
    expect(await screen.findByText('Unsupported size')).toBeVisible()
  })

  it('uses localized Failed without exposing an internal error code', async () => {
    apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'task-no-message',
          modelName: 'GPT Image 2',
          quotedPoints: '100',
          allocatedPoints: '100',
          settledPoints: '0',
          releasedPoints: '100',
          executionStatus: 'CONFIRMED_FAILED',
          customerBillingStatus: 'RELEASED_FAILED',
          providerReconcileStatus: 'PENDING',
          upstreamTaskId: null,
          acceptedAt: '2026-09-05T12:00:00Z',
          completedAt: null,
          outputSummaries: [
            {
              outputIndex: 0,
              executionStatus: 'CONFIRMED_FAILED',
              billingStatus: 'RELEASED_FAILED',
              quotedPoints: '100',
              settledPoints: null,
              error: { code: 'INTERNAL_ONLY', messages: null },
            },
          ],
        },
      ],
    })
    mount({
      customerId: 'customer-a',
      target: { kind: 'task', id: 'task-no-message' },
      onOpenOrder: vi.fn(),
    })
    expect(await screen.findByText('Failed')).toBeVisible()
    expect(screen.queryByText('INTERNAL_ONLY')).not.toBeInTheDocument()
  })

  it('distinguishes a frozen zero from settled zero and mixed results', async () => {
    apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'task-frozen',
          modelName: 'GPT Image 2',
          quotedPoints: '100',
          allocatedPoints: '100',
          settledPoints: '0',
          releasedPoints: '0',
          executionStatus: 'SUCCEEDED',
          customerBillingStatus: 'FROZEN',
          providerReconcileStatus: 'PENDING',
          upstreamTaskId: null,
          acceptedAt: '2026-09-05T12:00:00Z',
          completedAt: null,
          outputSummaries: [
            {
              outputIndex: 0,
              executionStatus: 'SUCCEEDED',
              billingStatus: 'FROZEN',
              quotedPoints: '100',
              settledPoints: null,
            },
          ],
        },
      ],
    })
    mount({
      customerId: 'customer-a',
      target: { kind: 'task', id: 'task-frozen' },
      onOpenOrder: vi.fn(),
    })
    expect(await screen.findByText('—')).toBeVisible()

    cleanup()
    apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'task-mixed',
          modelName: 'GPT Image 2',
          quotedPoints: '100',
          allocatedPoints: '100',
          settledPoints: '0',
          releasedPoints: '0',
          executionStatus: 'SUCCEEDED',
          customerBillingStatus: 'FROZEN',
          providerReconcileStatus: 'PENDING',
          upstreamTaskId: null,
          acceptedAt: '2026-09-05T12:00:00Z',
          completedAt: null,
          outputSummaries: [
            {
              outputIndex: 0,
              executionStatus: 'SUCCEEDED',
              billingStatus: 'SETTLED',
              quotedPoints: '50',
              settledPoints: '0',
            },
            {
              outputIndex: 1,
              executionStatus: 'CONFIRMED_FAILED',
              billingStatus: 'FROZEN',
              quotedPoints: '50',
              settledPoints: null,
            },
          ],
        },
      ],
    })
    mount({
      customerId: 'customer-a',
      target: { kind: 'task', id: 'task-mixed' },
      onOpenOrder: vi.fn(),
    })
    expect(await screen.findByText('Partial success')).toBeVisible()
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
    expect(screen.getByText('Points settled')).toBeVisible()
    expect(screen.getByText('Settlement in progress')).toBeVisible()
  })

  it('gives unknown precedence over processing and shows data review for settled null', async () => {
    apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'task-processing',
          modelName: 'GPT Image 2',
          quotedPoints: '100',
          allocatedPoints: '100',
          settledPoints: '0',
          releasedPoints: '0',
          executionStatus: 'PROCESSING',
          customerBillingStatus: 'FROZEN',
          providerReconcileStatus: 'PENDING',
          upstreamTaskId: null,
          acceptedAt: '2026-09-05T12:00:00Z',
          completedAt: null,
          outputSummaries: [
            {
              outputIndex: 0,
              executionStatus: 'PROCESSING',
              billingStatus: 'FROZEN',
              quotedPoints: '100',
              settledPoints: null,
            },
          ],
        },
      ],
    })
    mount({
      customerId: 'customer-a',
      target: { kind: 'task', id: 'task-processing' },
      onOpenOrder: vi.fn(),
    })
    expect((await screen.findAllByText('Processing')).length).toBeGreaterThan(1)
    expect(screen.getAllByText('Points reserved').length).toBeGreaterThan(1)

    cleanup()
    apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'task-review',
          modelName: 'GPT Image 2',
          quotedPoints: '100',
          allocatedPoints: '100',
          settledPoints: '100',
          releasedPoints: '0',
          executionStatus: 'PROCESSING',
          customerBillingStatus: 'SETTLED',
          providerReconcileStatus: 'PENDING',
          upstreamTaskId: null,
          acceptedAt: '2026-09-05T12:00:00Z',
          completedAt: null,
          outputSummaries: [
            {
              outputIndex: 0,
              executionStatus: 'PROCESSING',
              billingStatus: 'SETTLED',
              quotedPoints: '50',
              settledPoints: null,
            },
            {
              outputIndex: 1,
              executionStatus: 'UNKNOWN',
              billingStatus: 'RELEASED_FAILED',
              quotedPoints: '50',
              settledPoints: null,
            },
          ],
        },
      ],
    })
    mount({
      customerId: 'customer-a',
      target: { kind: 'task', id: 'task-review' },
      onOpenOrder: vi.fn(),
    })
    expect((await screen.findAllByText('Unknown')).length).toBeGreaterThan(1)
    expect(screen.getByText('Data needs review')).toBeVisible()
    expect(screen.getByText('—')).toBeVisible()
  })

  it('shows zero only after every output is released', async () => {
    apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'task-released',
          modelName: 'GPT Image 2',
          quotedPoints: '100',
          allocatedPoints: '100',
          settledPoints: '99',
          releasedPoints: '100',
          executionStatus: 'CONFIRMED_FAILED',
          customerBillingStatus: 'RELEASED_FAILED',
          providerReconcileStatus: 'PENDING',
          upstreamTaskId: null,
          acceptedAt: '2026-09-05T12:00:00Z',
          completedAt: null,
          outputSummaries: [
            {
              outputIndex: 0,
              executionStatus: 'CONFIRMED_FAILED',
              billingStatus: 'RELEASED_FAILED',
              quotedPoints: '50',
              settledPoints: null,
            },
            {
              outputIndex: 1,
              executionStatus: 'CONFIRMED_FAILED',
              billingStatus: 'RELEASED_TIMEOUT',
              quotedPoints: '50',
              settledPoints: null,
            },
          ],
        },
      ],
    })
    mount({
      customerId: 'customer-a',
      target: { kind: 'task', id: 'task-released' },
      onOpenOrder: vi.fn(),
    })
    expect(await screen.findByText('0')).toBeVisible()
  })

  it('retries a failed task-detail request', async () => {
    apiMocks.getCanvasAdminCustomerTasks
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        page: 1,
        pageSize: 20,
        total: 1,
        items: [
          {
            id: 'task-retry',
            modelName: 'GPT Image 2',
            quotedPoints: '100',
            allocatedPoints: '100',
            settledPoints: '100',
            releasedPoints: '0',
            executionStatus: 'SUCCEEDED',
            customerBillingStatus: 'SETTLED',
            providerReconcileStatus: 'PENDING',
            upstreamTaskId: null,
            acceptedAt: '2026-09-05T12:00:00Z',
            completedAt: null,
          },
        ],
      })
    mount({
      customerId: 'customer-a',
      target: { kind: 'task', id: 'task-retry' },
      onOpenOrder: vi.fn(),
    })
    expect(await screen.findByRole('alert')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('GPT Image 2')).toBeVisible()
  })

  it('keeps pending, failed, and missing task details mutually exclusive', async () => {
    apiMocks.getCanvasAdminCustomerTasks.mockReturnValue(new Promise(() => {}))
    mount({
      customerId: 'customer-a',
      target: { kind: 'task', id: 'task-pending' },
      onOpenOrder: vi.fn(),
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Not recorded')).not.toBeInTheDocument()

    cleanup()
    apiMocks.getCanvasAdminCustomerTasks.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    mount({
      customerId: 'customer-a',
      target: { kind: 'task', id: 'task-missing' },
      onOpenOrder: vi.fn(),
    })
    expect(await screen.findByText('Not recorded')).toBeVisible()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

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
      target: { kind: 'lot', id: 'lot-a' },
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
      target: { kind: 'lot', id: 'lot-manual' },
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

  it('shows accessible Loading for pending point-lot and ledger detail requests', async () => {
    apiMocks.getCanvasCustomerBusinessFacts.mockReturnValue(
      new Promise(() => {})
    )
    mount({
      customerId: 'customer-a',
      target: { kind: 'lot', id: 'lot-pending' },
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
      target: { kind: 'lot', id: 'lot-ready' },
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
      target: { kind: 'lot', id: 'lot-a' },
      onOpenOrder: vi.fn(),
    })

    expect(await screen.findByRole('alert')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findAllByText('500')).not.toHaveLength(0)
  })
})

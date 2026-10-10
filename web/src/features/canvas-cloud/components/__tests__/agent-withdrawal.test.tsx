import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import type {
  AdminAgentWithdrawalDetail,
  AgentEarningsSummary,
} from '../../agent-earnings-types'
import { AgentWithdrawalApplyCard } from '../AgentWithdrawalApplyCard'
import { WithdrawalImage } from '../AgentWithdrawalParts'
import { AdminWithdrawalProcessSheet } from '../AgentWithdrawalSheets'

const keyCounter = vi.hoisted(() => ({ value: 0 }))
const earningsApi = vi.hoisted(() => ({
  submitAgentWithdrawal: vi.fn(),
  payAgentWithdrawal: vi.fn(),
  rejectAgentWithdrawal: vi.fn(),
  getAdminAgentWithdrawal: vi.fn(),
  getAgentWithdrawal: vi.fn(),
  resolveAgentWithdrawalImage: vi.fn(),
}))

vi.mock('../../agent-earnings-api', () => ({
  ...earningsApi,
  agentEarningsQueryKeys: {
    all: ['canvas-cloud', 'agent-earnings'],
    admin: ['canvas-cloud', 'agent-withdrawals'],
  },
  newWithdrawalIdempotencyKey: () => `withdraw-key-${(keyCounter.value += 1)}`,
  newAdminWithdrawalIdempotencyKey: (action: string) => `${action}-key-0001`,
}))

const summary: AgentEarningsSummary = {
  status: 'ACTIVE',
  periodMonth: '2026-10',
  unsettledAmount: '0.400000000000',
  availableMinor: '80000',
  paidMinor: '0',
  policy: {
    minWithdrawalMinor: 5000,
    maxWithdrawalMinor: 50000,
    taxRateBasisPoints: 1000,
    expiryShareRateBasisPoints: 4000,
  },
  previousQr: {
    withdrawalId: 'previous',
    expired: false,
    retentionDays: 90,
    file: {
      url: 'https://r2.example/qr',
      expiresAt: '2026-12-31T00:00:00.000Z',
    },
  },
}

function mount(node: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      {node}
    </QueryClientProvider>
  )
}

const amountInput = () => screen.getByLabelText(/Withdrawal amount \(CNY\)/u)

describe('agent withdrawal application', () => {
  beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: { en } })
  })
  beforeEach(() => {
    vi.clearAllMocks()
    earningsApi.resolveAgentWithdrawalImage.mockResolvedValue({
      kind: 'remote',
      url: 'https://r2.example/qr',
    })
    earningsApi.submitAgentWithdrawal.mockResolvedValue({
      id: 'new',
      status: 'REQUESTED',
    })
    keyCounter.value = 0
  })

  it('shows each amount rule after the field is left', () => {
    mount(<AgentWithdrawalApplyCard summary={summary} />)
    const cases: Array<[string, RegExp]> = [
      ['1.234', /at most 2 decimals/u],
      ['49.99', /lower than the minimum withdrawal amount ¥50/u],
      ['500.01', /maximum single withdrawal amount ¥500/u],
    ]
    for (const [value, message] of cases) {
      fireEvent.change(amountInput(), { target: { value } })
      fireEvent.blur(amountInput())
      expect(screen.getByText(message)).toBeVisible()
      expect(amountInput()).toHaveAttribute('aria-invalid', 'true')
    }
  })

  it('stops at the available balance and shows the tax and net payment of a valid amount', () => {
    mount(
      <AgentWithdrawalApplyCard
        summary={{ ...summary, availableMinor: '30000' }}
      />
    )
    fireEvent.change(amountInput(), { target: { value: '400' } })
    fireEvent.blur(amountInput())
    expect(
      screen.getByText(/cannot exceed the available balance ¥300/u)
    ).toBeVisible()
    fireEvent.change(amountInput(), { target: { value: '200' } })
    expect(
      screen.getByText('Withholding tax ¥20 · Net payment ¥180')
    ).toBeVisible()
  })

  it('reuses the previous QR code and submits the amount after the confirmation', async () => {
    mount(<AgentWithdrawalApplyCard summary={summary} />)
    expect(await screen.findByText('QR code used last time')).toBeVisible()
    fireEvent.change(amountInput(), { target: { value: '200.5' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply for withdrawal' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText('Available balance ¥800 → ¥599.5')
    ).toBeVisible()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Confirm and submit' })
    )
    await waitFor(() =>
      expect(earningsApi.submitAgentWithdrawal).toHaveBeenCalledWith(
        { amount: '200.5', qrImage: null },
        'withdraw-key-1'
      )
    )
  })

  it('retries an unknown outcome with the same key and starts a new key after a definite rejection or a change', async () => {
    const submitOnce = async (amount: string) => {
      fireEvent.change(amountInput(), { target: { value: amount } })
      fireEvent.click(
        screen.getByRole('button', { name: 'Apply for withdrawal' })
      )
      fireEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Confirm and submit',
        })
      )
      await waitFor(() =>
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      )
    }
    earningsApi.submitAgentWithdrawal
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce({
        response: {
          status: 422,
          data: {
            code: 'VALIDATION_FAILED',
            details: { reason: 'ABOVE_BALANCE' },
          },
        },
      })
    mount(<AgentWithdrawalApplyCard summary={summary} />)
    await screen.findByText('QR code used last time')
    await submitOnce('100')
    await submitOnce('100')
    await submitOnce('100')
    await submitOnce('120')
    const keys = earningsApi.submitAgentWithdrawal.mock.calls.map(
      (call) => call[1]
    )
    expect(keys).toEqual([
      'withdraw-key-1',
      'withdraw-key-1',
      'withdraw-key-2',
      'withdraw-key-3',
    ])
  })

  it('requires a new QR code when the previous one expired', () => {
    mount(
      <AgentWithdrawalApplyCard
        summary={{
          ...summary,
          previousQr: {
            withdrawalId: 'previous',
            expired: true,
            retentionDays: 90,
            file: null,
          },
        }}
      />
    )
    expect(
      screen.getByText(
        'The QR code used last time expired (kept for 90 days). Upload a new one.'
      )
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Upload QR code' })).toBeVisible()
    fireEvent.change(amountInput(), { target: { value: '100' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply for withdrawal' })
    )
    expect(screen.getByText('Upload a QR code')).toBeVisible()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('rejects a non-image QR code before reading it', async () => {
    mount(<AgentWithdrawalApplyCard summary={summary} />)
    fireEvent.change(screen.getByLabelText('Change QR code'), {
      target: { files: [new File(['text'], 'qr.txt', { type: 'text/plain' })] },
    })
    expect(
      await screen.findByText('Only JPG, PNG and WEBP images are supported')
    ).toBeVisible()
  })

  it('disables the whole card for a disabled agent and below the minimum balance', () => {
    const { unmount } = mount(
      <AgentWithdrawalApplyCard summary={{ ...summary, status: 'DISABLED' }} />
    )
    expect(amountInput()).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Apply for withdrawal' })
    ).toBeDisabled()
    expect(
      screen.getByText(
        /Withdrawals are unavailable while the agent qualification is disabled/u
      )
    ).toBeVisible()
    unmount()
    mount(
      <AgentWithdrawalApplyCard
        summary={{ ...summary, availableMinor: '4999' }}
      />
    )
    expect(
      screen.getByRole('button', { name: 'Apply for withdrawal' })
    ).toBeDisabled()
    expect(
      screen.getByText(/below the minimum withdrawal amount ¥50/u)
    ).toBeVisible()
  })
})

describe('administrator withdrawal processing', () => {
  const pending: AdminAgentWithdrawalDetail = {
    id: 'w1',
    amountMinor: '20000',
    taxMinor: '2000',
    netMinor: '18000',
    taxRateBasisPoints: 1000,
    status: 'REQUESTED',
    requestedAt: '2026-10-01T01:30:00.000Z',
    processedAt: null,
    rejectReason: null,
    returnedToBalance: false,
    qrExpired: false,
    proofExpired: null,
    proofRetentionDays: null,
    qrRetentionDays: 90,
    unread: false,
    agentPrincipalId: 'agent',
    agentUsername: 'tokyo-agent',
    processedByUsername: null,
    overdue: true,
    qr: { url: 'https://r2.example/qr', expiresAt: '2026-10-01T02:00:00.000Z' },
    proof: null,
  }
  beforeEach(() => {
    vi.clearAllMocks()
    earningsApi.resolveAgentWithdrawalImage.mockResolvedValue({
      kind: 'remote',
      url: 'https://r2.example/qr',
    })
    earningsApi.rejectAgentWithdrawal.mockResolvedValue({
      id: 'w1',
      status: 'REJECTED',
    })
  })

  it('requires the payment proof before confirming payment and marks an overdue request', async () => {
    earningsApi.getAdminAgentWithdrawal.mockResolvedValue(pending)
    mount(
      <AdminWithdrawalProcessSheet
        withdrawalId='w1'
        onOpenChange={() => undefined}
      />
    )
    expect(await screen.findByText('Overdue')).toBeVisible()
    expect(screen.getByText('Pay ¥180 with this QR code')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Upload payment proof' })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm paid' }))
    expect(screen.getByText('Upload the payment proof')).toBeVisible()
    expect(earningsApi.payAgentWithdrawal).not.toHaveBeenCalled()
  })

  it('cannot pay an expired QR code but can reject it with a reason', async () => {
    earningsApi.getAdminAgentWithdrawal.mockResolvedValue({
      ...pending,
      qrExpired: true,
      qr: null,
    })
    mount(
      <AdminWithdrawalProcessSheet
        withdrawalId='w1'
        onOpenChange={() => undefined}
      />
    )
    expect(
      await screen.findByText(
        /The QR code expired and cannot be paid. Reject the request and ask the agent/u
      )
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm paid' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    expect(screen.getByText('Enter a reject reason')).toBeVisible()
    fireEvent.change(screen.getByLabelText(/Reject reason/u), {
      target: { value: 'QR code expired' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    await waitFor(() =>
      expect(earningsApi.rejectAgentWithdrawal).toHaveBeenCalledWith(
        'w1',
        'QR code expired',
        'reject-key-0001'
      )
    )
  })
})

describe('withdrawal image ownership', () => {
  it('keeps a shared local image open in one place after another place closes', async () => {
    const created: string[] = []
    const revoked: string[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:image-${created.length + 1}`
      created.push(url)
      return url
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(
      (url) => void revoked.push(url)
    )
    earningsApi.resolveAgentWithdrawalImage.mockResolvedValue({
      kind: 'blob',
      blob: new Blob(['png']),
    })
    const file = {
      url: '/v1/web/agent/withdrawals/w1/files/qr/content',
      expiresAt: '2026-12-31T00:00:00.000Z',
    }
    function Two(props: { second: boolean }) {
      return (
        <>
          <WithdrawalImage file={file} alt='Card QR' retentionDays={90} />
          {props.second ? (
            <WithdrawalImage file={file} alt='Dialog QR' retentionDays={90} />
          ) : null}
        </>
      )
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const view = render(
      <QueryClientProvider client={client}>
        <Two second />
      </QueryClientProvider>
    )
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    const cardUrl = screen.getByAltText('Card QR').getAttribute('src')
    view.rerender(
      <QueryClientProvider client={client}>
        <Two second={false} />
      </QueryClientProvider>
    )
    expect(revoked).not.toContain(cardUrl)
    expect(screen.getByAltText('Card QR')).toHaveAttribute('src', cardUrl)
    vi.restoreAllMocks()
  })
})

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
import { AgentPaymentQrCard } from '../AgentPaymentQrCard'
import { AgentWithdrawalApplyCard } from '../AgentWithdrawalApplyCard'
import { WithdrawalImage } from '../AgentWithdrawalParts'
import { AdminWithdrawalProcessSheet } from '../AgentWithdrawalSheets'

const keyCounter = vi.hoisted(() => ({ value: 0 }))
const earningsApi = vi.hoisted(() => ({
  submitAgentWithdrawal: vi.fn(),
  replaceAgentPaymentQr: vi.fn(),
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
  newPaymentQrIdempotencyKey: () => 'qr-key-0001',
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
  paymentQr: {
    uploadId: 'qr-upload-1',
    uploadedAt: '2026-10-01T01:00:00.000Z',
    url: 'https://r2.example/qr',
    expiresAt: '2026-12-31T00:00:00.000Z',
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

  it('pays to the current QR code and submits only the amount after the confirmation', async () => {
    mount(<AgentWithdrawalApplyCard summary={summary} />)
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
        { amount: '200.5' },
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

  it('cannot apply before a QR code exists, and keeps the QR code apart from the application', () => {
    mount(
      <AgentWithdrawalApplyCard summary={{ ...summary, paymentQr: null }} />
    )
    expect(
      screen.getByRole('button', { name: 'Apply for withdrawal' })
    ).toBeDisabled()
    expect(
      screen.getByText('Upload a payment QR code above first.')
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /QR code/u })
    ).not.toBeInTheDocument()
  })

  it('lets the QR code be uploaded while a withdrawal is not possible', () => {
    mount(<AgentPaymentQrCard paymentQr={null} />)
    expect(screen.getByRole('button', { name: 'Upload QR code' })).toBeEnabled()
  })

  it('saves a replacement QR code as soon as it is chosen, without submitting a request', async () => {
    earningsApi.replaceAgentPaymentQr.mockResolvedValue({
      uploadId: 'qr-upload-2',
      uploadedAt: '2026-10-11T01:00:00.000Z',
      pendingWithdrawalCount: 1,
    })
    mount(<AgentPaymentQrCard paymentQr={summary.paymentQr} />)
    expect(
      await screen.findByText(/^Uploaded .+ \(Beijing time\)$/u)
    ).toBeVisible()
    fireEvent.change(screen.getByLabelText('Change QR code'), {
      target: { files: [new File(['x'], 'qr.png', { type: 'image/png' })] },
    })
    await waitFor(() =>
      expect(earningsApi.replaceAgentPaymentQr).toHaveBeenCalledWith(
        'eA==',
        'qr-key-0001'
      )
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(earningsApi.submitAgentWithdrawal).not.toHaveBeenCalled()
  })

  it('rejects a non-image QR code before reading it', async () => {
    mount(<AgentPaymentQrCard paymentQr={summary.paymentQr} />)
    fireEvent.change(screen.getByLabelText('Change QR code'), {
      target: { files: [new File(['text'], 'qr.txt', { type: 'text/plain' })] },
    })
    expect(
      await screen.findByText('Only JPG, PNG and WEBP images are supported')
    ).toBeVisible()
  })

  it('fixes the amount of a disabled agent to the whole balance, outside the single withdrawal limits', async () => {
    mount(
      <AgentWithdrawalApplyCard summary={{ ...summary, status: 'DISABLED' }} />
    )
    expect(amountInput()).toHaveValue('800')
    expect(amountInput()).toHaveAttribute('readonly')
    expect(
      screen.getByText(
        /^Available balance ¥800; while disabled, each request takes the whole balance/u
      )
    ).toBeVisible()
    expect(
      screen.getByText('Withholding tax ¥80 · Net payment ¥720')
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply for withdrawal' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText('Available balance ¥800 → ¥0')
    ).toBeVisible()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Confirm and submit' })
    )
    await waitFor(() =>
      expect(earningsApi.submitAgentWithdrawal).toHaveBeenCalledWith(
        { amount: '800' },
        'withdraw-key-1'
      )
    )
  })

  it('blocks the card without a balance while disabled and below the minimum while active', () => {
    const { unmount: unmountBelowMinimum } = mount(
      <AgentWithdrawalApplyCard
        summary={{ ...summary, status: 'DISABLED', availableMinor: '20' }}
      />
    )
    expect(
      screen.getByRole('button', { name: 'Apply for withdrawal' })
    ).toBeEnabled()
    unmountBelowMinimum()
    const { unmount } = mount(
      <AgentWithdrawalApplyCard
        summary={{ ...summary, status: 'DISABLED', availableMinor: '0' }}
      />
    )
    expect(
      screen.getByRole('button', { name: 'Apply for withdrawal' })
    ).toBeDisabled()
    expect(
      screen.getByText('There is no available balance to withdraw.')
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
    fullBalance: false,
    proofExpired: null,
    proofRetentionDays: null,
    unread: false,
    agentPrincipalId: 'agent',
    agentUsername: 'tokyo-agent',
    processedByUsername: null,
    overdue: true,
    qr: {
      uploadId: 'qr-upload-1',
      uploadedAt: '2026-10-01T01:00:00.000Z',
      url: 'https://r2.example/qr',
      expiresAt: '2026-10-01T02:00:00.000Z',
    },
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
    expect(
      screen.queryByText(/Whole-balance withdrawal while disabled/u)
    ).not.toBeInTheDocument()
  })

  it('marks a whole-balance request of a disabled agent', async () => {
    earningsApi.getAdminAgentWithdrawal.mockResolvedValue({
      ...pending,
      amountMinor: '80000',
      taxMinor: '8000',
      netMinor: '72000',
      fullBalance: true,
    })
    mount(
      <AdminWithdrawalProcessSheet
        withdrawalId='w1'
        onOpenChange={() => undefined}
      />
    )
    expect(
      await screen.findByText(
        'Whole-balance withdrawal while disabled; single withdrawal limits do not apply.'
      )
    ).toBeVisible()
  })

  it('pays to the QR code it showed and asks for a review when the agent replaced it', async () => {
    earningsApi.getAdminAgentWithdrawal.mockResolvedValue(pending)
    earningsApi.payAgentWithdrawal.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'QR_CODE_CHANGED' } },
    })
    mount(
      <AdminWithdrawalProcessSheet
        withdrawalId='w1'
        onOpenChange={() => undefined}
      />
    )
    await screen.findByText('Pay ¥180 with this QR code')
    fireEvent.change(screen.getByLabelText(/Payment proof/u), {
      target: { files: [new File(['x'], 'proof.png', { type: 'image/png' })] },
    })
    await screen.findByAltText('Payment proof')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm paid' }))
    await waitFor(() =>
      expect(earningsApi.payAgentWithdrawal).toHaveBeenCalledWith(
        'w1',
        'eA==',
        'qr-upload-1',
        'pay-key-0001'
      )
    )
    await waitFor(() =>
      expect(earningsApi.getAdminAgentWithdrawal).toHaveBeenCalledTimes(2)
    )
    // The sheet keeps telling the administrator what to do, whether or not the old code was already paid.
    const guidance = await screen.findByRole('alert')
    expect(
      within(guidance).getByText(
        'The agent replaced the payment QR code. Check the new code below.'
      )
    ).toBeVisible()
    expect(within(guidance).getByText(/Paid to the old code/u)).toBeVisible()
    expect(screen.getByAltText('Payment proof')).toBeVisible()
  })

  it('cannot pay without a QR code but can reject it with a reason', async () => {
    earningsApi.getAdminAgentWithdrawal.mockResolvedValue({
      ...pending,
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
        'The agent has no payment QR code. Ask the agent to upload one, or reject the request.'
      )
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Confirm paid' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    expect(screen.getByText('Enter a reject reason')).toBeVisible()
    fireEvent.change(screen.getByLabelText(/Reject reason/u), {
      target: { value: 'No QR code' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    await waitFor(() =>
      expect(earningsApi.rejectAgentWithdrawal).toHaveBeenCalledWith(
        'w1',
        'No QR code',
        'reject-key-0001'
      )
    )
  })
})

describe('withdrawal image ownership', () => {
  it('loads the replaced local QR code although its content path stays the same', async () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      (blob) => `blob:${(blob as Blob & { label: string }).label}`
    )
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    earningsApi.resolveAgentWithdrawalImage.mockImplementation(async () => ({
      kind: 'blob',
      blob: Object.assign(new Blob(['png']), {
        label: `image-${earningsApi.resolveAgentWithdrawalImage.mock.calls.length}`,
      }),
    }))
    const qr = (uploadId: string) => ({
      uploadId,
      uploadedAt: '2026-10-11T00:00:00.000Z',
      url: '/v1/web/agent/payment-qr/content',
      expiresAt: '2026-10-12T00:00:00.000Z',
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const view = render(
      <QueryClientProvider client={client}>
        <WithdrawalImage file={qr('a')} alt='QR' retentionDays={null} />
      </QueryClientProvider>
    )
    await waitFor(() =>
      expect(screen.getByAltText('QR')).toHaveAttribute('src', 'blob:image-1')
    )
    view.rerender(
      <QueryClientProvider client={client}>
        <WithdrawalImage file={qr('b')} alt='QR' retentionDays={null} />
      </QueryClientProvider>
    )
    await waitFor(() =>
      expect(screen.getByAltText('QR')).toHaveAttribute('src', 'blob:image-2')
    )
    vi.restoreAllMocks()
  })

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

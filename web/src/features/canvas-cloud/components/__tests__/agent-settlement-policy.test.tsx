import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { AgentSettlementPolicySettings } from '../AgentSettlementPolicySettings'

const earningsApi = vi.hoisted(() => ({
  getAgentSettlementPolicy: vi.fn(),
  publishAgentSettlementPolicy: vi.fn(),
}))

vi.mock('../../agent-earnings-api', () => ({
  ...earningsApi,
  agentEarningsQueryKeys: { all: ['canvas-cloud', 'agent-earnings'] },
}))

const policy = {
  minWithdrawalMinor: 5000,
  maxWithdrawalMinor: 50000,
  taxRateBasisPoints: 0,
  expiryShareRateBasisPoints: 4000,
  version: 2,
  effectiveAt: '2026-10-01T03:00:00.000Z',
}

function mount() {
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
      <AgentSettlementPolicySettings />
    </QueryClientProvider>
  )
}

describe('agent settlement rules', () => {
  beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: { en } })
  })
  beforeEach(() => {
    vi.clearAllMocks()
    earningsApi.getAgentSettlementPolicy.mockResolvedValue(policy)
    earningsApi.publishAgentSettlementPolicy.mockResolvedValue({
      ...policy,
      maxWithdrawalMinor: 60000,
      version: 3,
    })
  })

  it('shows the shared version once and describes every field with its explanation and the version line', async () => {
    mount()
    const maximum = await screen.findByLabelText(
      /Maximum single withdrawal amount/u
    )
    expect(maximum).toHaveValue('500')
    expect(screen.getAllByText('v2')).toHaveLength(1)
    expect(maximum).toHaveAccessibleDescription(
      expect.stringContaining('a larger balance takes several requests')
    )
    expect(maximum).toHaveAccessibleDescription(
      expect.stringContaining(
        "A disabled agent's whole-balance withdrawal ignores the minimum and the maximum."
      )
    )
    expect(
      screen.getByRole('button', { name: 'Review rule changes' })
    ).toBeDisabled()
  })

  it('reviews only the changed field before publishing', async () => {
    mount()
    fireEvent.change(
      await screen.findByLabelText(/Maximum single withdrawal amount/u),
      { target: { value: '600' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Review rule changes' }))
    expect(await screen.findByText('¥500 → ¥600')).toBeVisible()
    expect(screen.queryByText(/¥50 →/u)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    await waitFor(() =>
      expect(earningsApi.publishAgentSettlementPolicy).toHaveBeenCalledWith(
        expect.objectContaining({ maxWithdrawal: '600' })
      )
    )
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { AgentEarningFormulaCard } from '../AgentEarningFormulaCard'

vi.mock('../../agent-earnings-api', () => ({
  agentEarningsQueryKeys: { all: ['canvas-cloud', 'agent-earnings'] },
  getAgentSettlementPolicy: vi.fn().mockResolvedValue({
    minWithdrawalMinor: 5000,
    maxWithdrawalMinor: 50000,
    taxRateBasisPoints: 0,
    expiryShareRateBasisPoints: 4000,
    version: null,
    effectiveAt: null,
  }),
}))

describe('agent earning formula card', () => {
  beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: { en } })
  })

  it('starts collapsed to its title and expands to the definition list with the current ratio', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AgentEarningFormulaCard />
      </QueryClientProvider>
    )
    // Collapsed by default: only the title and the expand button show.
    expect(await screen.findByText('How earnings are calculated')).toBeVisible()
    expect(screen.queryByRole('term')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
    expect(await screen.findByText(/expiry share ratio \(40%\)/u)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const terms = screen.getAllByRole('term')
    expect(terms).toHaveLength(7)
    expect(terms[0]).toHaveTextContent('RMB per point')
    expect(terms[0]?.nextElementSibling?.tagName).toBe('DD')
  })
})

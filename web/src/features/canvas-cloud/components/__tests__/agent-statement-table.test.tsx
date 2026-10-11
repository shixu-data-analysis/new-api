import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { AgentStatementTable } from '../AgentStatementTable'

const earningsApi = vi.hoisted(() => ({
  getAgentStatements: vi.fn(),
  getAdminAgentStatements: vi.fn(),
  getAgentStatementCustomers: vi.fn(),
  getAdminAgentStatementCustomers: vi.fn(),
}))

vi.mock('../../agent-earnings-api', () => ({
  ...earningsApi,
  agentEarningsQueryKeys: { all: ['canvas-cloud', 'agent-earnings'] },
}))

describe('agent monthly statement table', () => {
  beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: { en } })
  })
  beforeEach(() => {
    vi.clearAllMocks()
    earningsApi.getAgentStatements.mockResolvedValue({
      items: [
        {
          id: 's1',
          periodMonth: '2026-09',
          consumptionMinor: '240',
          expiryShareMinor: '0',
          totalMinor: '240',
          settledAt: '2026-09-30T16:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      months: ['2026-09'],
    })
  })

  it('right-aligns the amount cells of its expandable rows under their headers', async () => {
    const { container } = render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <AgentStatementTable mode='agent' />
      </QueryClientProvider>
    )
    await screen.findByText('2026-09')
    for (const columnId of [
      'consumptionMinor',
      'expiryShareMinor',
      'totalMinor',
    ]) {
      const cell = container.querySelector(
        `tbody td[data-column-id="${columnId}"]`
      )
      expect(cell).toHaveClass('text-right')
    }
    expect(
      container.querySelector('tbody td[data-column-id="periodMonth"]')
    ).not.toHaveClass('text-right')
  })

  it('keeps every real column at its tier width and leaves the remaining width to a blank trailing column', async () => {
    const { container } = render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <AgentStatementTable mode='agent' />
      </QueryClientProvider>
    )
    await screen.findByText('2026-09')
    const widths = [...container.querySelectorAll('colgroup col')].map(
      (col) => (col as HTMLElement).style.width
    )
    expect(widths.at(-1)).toBe('')
    expect(widths.slice(0, -1).every((width) => width.endsWith('px'))).toBe(
      true
    )
    // A narrow container scrolls the table instead of squeezing columns below their tier width.
    expect(container.querySelector('table')).toHaveStyle({
      minWidth: 'max-content',
    })
    const headers = [...container.querySelectorAll('thead th')]
    expect(headers.at(-1)).toHaveAttribute('aria-hidden', 'true')
    // Assistive technology sees only the real columns.
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent)
    ).toEqual([
      'Month',
      'Consumption earnings',
      'Expiry share',
      'Total earnings',
      'Settled at (Beijing time)',
      'Action',
    ])
  })
})

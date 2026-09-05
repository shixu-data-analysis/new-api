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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PointConversionDashboard } from '../PointConversionDashboard'

const apiMocks = vi.hoisted(() => ({ getCanvasPointConversionReport: vi.fn() }))

vi.mock('../../point-conversion-api', () => apiMocks)
vi.mock('../CanvasServerTable', () => ({
  CanvasServerTable: (props: { additionalFilters: ReactNode }) => (
    <section aria-label='Point lot details'>{props.additionalFilters}</section>
  ),
}))

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PointConversionDashboard />
    </QueryClientProvider>
  )
}

describe('point conversion dashboard', () => {
  beforeEach(() => {
    apiMocks.getCanvasPointConversionReport.mockResolvedValue({
      at: '2026-09-05T00:00:00.000Z',
      expiryDays: 7,
      summary: {
        total: 1,
        effectivePoints: '9223372036854775807',
        availablePoints: '900',
        reservedPoints: '240',
        referenceAmountRmb: '100.0000000000',
        averageRmbPerPoint: '0.1000000000',
        expiringPoints: '12',
        expiredUnclearedPoints: '3',
      },
      composition: [],
      items: [],
      total: 1,
      page: 1,
      pageSize: 20,
    })
  })

  it('preserves BIGINT point quantities and drills expiring cards into the matching server state', async () => {
    renderDashboard()

    expect(
      await screen.findByText('9,223,372,036,854,775,807')
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Expiring available points' })
    )

    await waitFor(() => {
      expect(apiMocks.getCanvasPointConversionReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ state: 'expiring', expiryDays: 7 }),
        expect.any(AbortSignal)
      )
    })
  })
})

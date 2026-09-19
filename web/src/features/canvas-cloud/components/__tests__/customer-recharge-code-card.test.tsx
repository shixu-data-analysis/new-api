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
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { getCanvasRechargePurchaseLink } from '../../api'
import { CustomerRechargeCodeCard } from '../CustomerRechargeCodeCard'

vi.mock('../../api', () => ({
  getCanvasRechargePurchaseLink: vi.fn(),
}))

describe('Canvas customer recharge card', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      'Redeem recharge code': 'Redeem recharge code',
      'Points are issued only after a valid code is redeemed.':
        'Points are issued only after a valid code is redeemed.',
      'Need a recharge code?': 'Need a recharge code?',
      'Purchase a one-time code from the configured store, then return here to redeem it.':
        'Purchase a one-time code from the configured store, then return here to redeem it.',
      'Purchase recharge code': 'Purchase recharge code',
      'Recharge code': 'Recharge code',
      Redeem: 'Redeem',
    })
  })

  it('shows the safe administrator-configured purchase link', async () => {
    vi.mocked(getCanvasRechargePurchaseLink).mockResolvedValue(
      'https://shop.example.com/canvas-codes'
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <CustomerRechargeCodeCard
          code=''
          onCodeChange={vi.fn()}
          onRedeem={vi.fn()}
          redeeming={false}
        />
      </QueryClientProvider>
    )

    expect(
      await screen.findByRole('link', { name: 'Purchase recharge code' })
    ).toHaveAttribute('href', 'https://shop.example.com/canvas-codes')
  })
})

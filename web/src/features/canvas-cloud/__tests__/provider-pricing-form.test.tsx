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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProviderPricingMatrix } from '../components/ProviderPricingMatrix'
import type { CanvasProviderPricingRow } from '../types'

const apiMocks = vi.hoisted(() => ({
  getCanvasProviderPricingMatrix: vi.fn(),
  publishCanvasProviderRate: vi.fn(),
  resolveCanvasProviderRateRisk: vi.fn(),
  getCanvasPriceGroups: vi.fn(),
  publishConfirmedCanvasInitialPrice: vi.fn(),
  publishConfirmedCanvasPriceChange: vi.fn(),
}))

vi.mock('../api', () => apiMocks)

const tokenRow: CanvasProviderPricingRow = {
  providerId: 'provider-1',
  providerCode: 'openai',
  providerName: 'OpenAI',
  channelId: 'channel-1',
  channelCode: 'primary',
  customerModelId: 'model-1',
  modelKey: 'chat',
  modelName: 'Chat',
  combinationId: 'quality-hd',
  combinationKey: 'quality=hd',
  parameters: { quality: 'HD' },
  billingDimensions: { billingUnit: 'MILLION_TOKENS' },
  resolvedProviderModelId: 'chat-hd',
  rateId: null,
  rateVersion: null,
  rateStatus: null,
  billingUnit: 'MILLION_TOKENS',
  nativeAmount: null,
  tokenRates: null,
  currency: null,
  normalizedAmountMinor: null,
  normalizedTokenRates: null,
  failureChargePolicy: null,
  rateEffectiveAt: null,
  prices: [],
  riskDecision: null,
}

function renderMatrix() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ProviderPricingMatrix />
    </QueryClientProvider>
  )
}

describe('provider pricing matrix form', () => {
  beforeEach(() => {
    apiMocks.getCanvasProviderPricingMatrix.mockResolvedValue([tokenRow])
    apiMocks.getCanvasPriceGroups.mockResolvedValue([
      {
        id: 'group-1',
        code: 'PG-1',
        internalName: 'Standard',
        version: 1,
        status: 'PUBLISHED',
        createdAt: '2026-09-01T00:00:00.000Z',
        approvedAt: '2026-09-01T00:00:00.000Z',
        effectiveAt: '2026-09-01T00:00:00.000Z',
      },
    ])
    apiMocks.publishConfirmedCanvasInitialPrice.mockResolvedValue({
      status: 'PUBLISHED',
    })
  })

  it('locks token billing to the selected combination and exposes all categories', async () => {
    const user = userEvent.setup()
    renderMatrix()

    const target = await screen.findByRole('combobox', {
      name: /Model and quality/,
    })
    await user.selectOptions(target, tokenRow.combinationId)

    expect(screen.getByDisplayValue('Per million tokens')).toBeDisabled()
    for (const category of [
      'Input tokens',
      'Output tokens',
      'Cache read',
      'Cache write',
    ]) {
      expect(
        screen.getByRole('textbox', {
          name: `${category} Native amount`,
        })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('textbox', {
          name: `${category} Normalized CNY cost`,
        })
      ).toBeInTheDocument()
    }

    const failureCharge = screen.getByRole('combobox', {
      name: 'Failure charge',
    })
    expect(
      within(failureCharge).queryByRole('option', { name: 'Fixed amount' })
    ).not.toBeInTheDocument()
  })

  it('publishes four independent customer token rates from the matrix', async () => {
    const user = userEvent.setup()
    renderMatrix()

    await user.click(await screen.findByText(/^View \(/))
    await user.click(screen.getByRole('button', { name: 'Add customer price' }))
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Price group' }),
      'group-1'
    )

    const rates = {
      'Input tokens': '0',
      'Output tokens': '6.25',
      'Cache read': '0.5',
      'Cache write': '1.75',
    }
    for (const [category, value] of Object.entries(rates)) {
      const input = screen.getByRole('textbox', {
        name: `${category} Customer points per million tokens`,
      })
      await user.clear(input)
      await user.type(input, value)
    }

    await user.click(
      screen.getByRole('button', { name: 'Review price change' })
    )
    await user.click(
      await screen.findByRole('button', { name: 'Confirm publication' })
    )

    await waitFor(() => {
      expect(apiMocks.publishConfirmedCanvasInitialPrice).toHaveBeenCalledWith(
        expect.objectContaining({
          customerModelId: tokenRow.customerModelId,
          priceGroupId: 'group-1',
          parameterCombinationId: tokenRow.combinationId,
          billingUnit: 'MILLION_TOKENS',
          points: '0',
          tokenRates: {
            input: '0',
            output: '6.25',
            cacheRead: '0.5',
            cacheWrite: '1.75',
          },
        })
      )
    })
  })
})

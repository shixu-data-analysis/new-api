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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import type { CanvasAdminWorkspace } from '../../types'
import { AdminPricing } from '../AdminPricing'

const apiMocks = vi.hoisted(() => ({
  approveCanvasPriceDraft: vi.fn(),
  createCanvasPriceDraft: vi.fn(),
  publishCanvasPriceVersion: vi.fn(),
}))

vi.mock('../../api', () => apiMocks)

const prices: CanvasAdminWorkspace['prices'] = [
  {
    id: 'published-price',
    modelKey: 'canvas.image',
    modelName: 'Canvas Image',
    priceGroupCode: 'STANDARD',
    priceGroup: 'Standard',
    combinationKey: 'default',
    normalizedParameters: {},
    version: 1,
    status: 'PUBLISHED',
    points: '20',
    baseRatePointsPerRmb: '50.00000000',
    targetMarginRate: '0.400000',
    successProbability: '0.900000',
    kTheoryRmb: '0.18000000',
    kActualRmb: null,
    kPricingRmb: '0.20000000',
    riskBufferRmb: '0.02000000',
    breakEvenPoints: '10',
    targetMarginPoints: '17',
    pricingAssumptionsSnapshot: {
      successfulTaskCostRmb: '0.16000000',
      failedUnrecoverableCostRmb: '0.18000000',
      otherVariableCostRmb: '0.00000000',
    },
    createdByPrincipalId: 'platform-admin',
    approvedByPrincipalId: 'platform-admin',
    createdAt: '2026-08-26T00:00:00.000Z',
    approvedAt: '2026-08-26T00:01:00.000Z',
    effectiveAt: '2026-08-26T00:02:00.000Z',
  },
]

function renderPricing(onChanged = vi.fn().mockResolvedValue(undefined)) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPricing prices={prices} onChanged={onChanged} />
    </QueryClientProvider>
  )
}

describe('Canvas administrator pricing', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  beforeEach(async () => {
    await i18next.changeLanguage('en')
    apiMocks.createCanvasPriceDraft.mockResolvedValue({ status: 'DRAFT' })
  })

  it('shows every pricing category and keeps derived and audit values read-only', () => {
    renderPricing()

    expect(
      screen.getByText(
        'K_theory = [q × success cost + (1−q) × unrecoverable failure cost + other variable cost] ÷ q'
      )
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /Break-even\./ })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Pricing assumptions\./ })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: /Created\./ })).toBeVisible()
    expect(
      screen.queryByRole('textbox', { name: /Break-even/ })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: /K_pricing/ })
    ).not.toBeInTheDocument()
    expect(screen.getByText('50.00000000 points per RMB')).toBeVisible()
    expect(screen.getByText('Not eligible or unavailable')).toBeVisible()
  })

  it('submits only administrator inputs as a new calculated draft', async () => {
    renderPricing()

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Decision summary' }),
      {
        target: { value: 'Reviewed current cost evidence' },
      }
    )
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Evidence references' }),
      {
        target: { value: 'pricing-review://2026-08-26' },
      }
    )
    fireEvent.submit(
      screen.getByRole('form', { name: 'Create price version draft' })
    )

    await waitFor(() => {
      expect(apiMocks.createCanvasPriceDraft).toHaveBeenCalledWith({
        sourcePriceVersionId: 'published-price',
        points: '20',
        successProbability: '0.900000',
        successfulTaskCostRmb: '0.16000000',
        failedUnrecoverableCostRmb: '0.18000000',
        otherVariableCostRmb: '0.00000000',
        riskBufferRmb: '0.02000000',
        decisionSummary: 'Reviewed current cost evidence',
        evidenceRefs: ['pricing-review://2026-08-26'],
      })
    })
  })

  it('uses responsive grids and never renders a wide pricing table', () => {
    const { container } = renderPricing()

    expect(container.querySelector('table')).not.toBeInTheDocument()
    expect(container.querySelector('.sm\\:grid-cols-2')).toBeInTheDocument()
    expect(container.querySelector('.xl\\:grid-cols-5')).toBeInTheDocument()
  })

  it('moves the draft source to the newly published version after publication', async () => {
    const queryClient = new QueryClient()
    const rendered = render(
      <QueryClientProvider client={queryClient}>
        <AdminPricing prices={prices} onChanged={vi.fn()} />
      </QueryClientProvider>
    )
    const nextPublished = {
      ...prices[0],
      id: 'published-price-v2',
      version: 2,
      points: '30',
      pricingAssumptionsSnapshot: {
        successfulTaskCostRmb: '0.30000000',
        failedUnrecoverableCostRmb: '0.00000000',
        otherVariableCostRmb: '0.00000000',
      },
    }

    rendered.rerender(
      <QueryClientProvider client={queryClient}>
        <AdminPricing
          prices={[{ ...prices[0], status: 'RETIRED' }, nextPublished]}
          onChanged={vi.fn()}
        />
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveValue('published-price-v2')
      expect(screen.getByRole('textbox', { name: 'Points' })).toHaveValue('30')
      expect(
        screen.getByRole('textbox', { name: 'Successful task cost' })
      ).toHaveValue('0.30000000')
    })
  })
})

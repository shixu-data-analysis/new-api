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
import { fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { simulatePricing } from '../../pricing-simulation'
import { PricingCalculator } from '../PricingCalculator'

const apiMocks = vi.hoisted(() => ({
  getCanvasPointIssuanceRates: vi.fn(),
}))

vi.mock('../../api', () => apiMocks)

describe('Canvas pricing calculator', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  beforeEach(async () => {
    await i18next.changeLanguage('en')
    apiMocks.getCanvasPointIssuanceRates.mockResolvedValue([
      {
        id: 'rate-v2',
        version: 2,
        status: 'PUBLISHED',
        pointsPerRmb: '50.00000000',
      },
    ])
  })

  it('matches the fixed-point break-even example and separates actual-cost eligibility', () => {
    expect(
      simulatePricing({
        targetMarginRate: '0.400000',
        successProbability: '1.000000',
        successfulTaskCostRmb: '2.50000000',
        failedUnrecoverableCostRmb: '0',
        otherVariableCostRmb: '0',
        riskBufferRmb: '0',
        pointsPerRmb: '50',
        actualCostEligible: false,
        actualCostRmb: '0',
        proposedPoints: '209',
      })
    ).toMatchObject({
      kTheoryRmb: '2.50000000',
      kPricingRmb: '2.50000000',
      breakEvenPoints: '125',
      targetMarginPoints: '209',
      verdict: 'MEETS_TARGET',
    })

    expect(
      simulatePricing({
        targetMarginRate: '0.400000',
        successProbability: '1.000000',
        successfulTaskCostRmb: '2.00000000',
        failedUnrecoverableCostRmb: '0',
        otherVariableCostRmb: '0',
        riskBufferRmb: '9.00000000',
        pointsPerRmb: '50',
        actualCostEligible: true,
        actualCostRmb: '2.50000000',
        proposedPoints: '126',
      })
    ).toMatchObject({
      pricingBasis: 'ACTUAL',
      kPricingRmb: '2.50000000',
      breakEvenPoints: '125',
      verdict: 'BELOW_TARGET',
    })

    expect(
      simulatePricing({
        targetMarginRate: '0.250000',
        successProbability: '1.000000',
        successfulTaskCostRmb: '2.50000000',
        failedUnrecoverableCostRmb: '0',
        otherVariableCostRmb: '0',
        riskBufferRmb: '0',
        pointsPerRmb: '50',
        actualCostEligible: false,
        actualCostRmb: '0',
        proposedPoints: '167',
      })
    ).toMatchObject({
      breakEvenPoints: '125',
      targetMarginPoints: '167',
      verdict: 'MEETS_TARGET',
    })
  })

  it('renders an administrator-only explanation and a side-effect-free live calculator', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <PricingCalculator />
      </QueryClientProvider>
    )

    expect(
      screen.getByText('How often do you expect this task to succeed?')
    ).toBeVisible()
    expect(
      screen.getByRole('form', { name: 'Pricing simulator' })
    ).toBeVisible()
    expect(screen.getByText(/This simulator does not write data/)).toBeVisible()
    expect(
      screen.queryByLabelText('Point issuance rate')
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('K_actual')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Target margin rate')).toHaveValue('40')
    fireEvent.change(screen.getByLabelText('Target margin rate'), {
      target: { value: '25' },
    })
    expect(screen.getByText('25%')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Proposed price points'), {
      target: { value: '' },
    })
    const recommendation = screen.getByRole('region', {
      name: 'Pricing recommendation',
    })
    expect(recommendation).toHaveTextContent('158 points')
    expect(
      screen.queryByText(/meets or exceeds this price version/)
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use recommended' }))
    expect(screen.getByLabelText('Proposed price points')).toHaveValue('158')
    expect(
      await screen.findByText(/meets or exceeds this price version/)
    ).toBeVisible()
    expect(screen.getByText('2.17 RMB')).toBeVisible()
    expect(screen.getByText('2.37 RMB')).toBeVisible()

    fireEvent.click(screen.getByText('Show calculation details'))
    expect(screen.getByText('1.95 RMB')).toBeVisible()
    expect(screen.getByText('118.33 points')).toBeVisible()
    expect(screen.queryByText('118.333333 points')).not.toBeInTheDocument()
  })
})

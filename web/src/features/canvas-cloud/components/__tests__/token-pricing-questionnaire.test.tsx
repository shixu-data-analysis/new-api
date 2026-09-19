/*
Copyright (C) 2023-2026 QuantumNous
*/
import { fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { TokenPricingQuestionnaire } from '../TokenPricingQuestionnaire'

describe('TokenPricingQuestionnaire', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  beforeEach(async () => {
    await i18next.changeLanguage('en')
  })

  it('keeps category assumptions in basis and uses a category recommendation with actual-price feedback', () => {
    const onAssumptionChange = vi.fn()
    const onRateChange = vi.fn()
    render(
      <TokenPricingQuestionnaire
        idPrefix='token-basis'
        categories={['input', 'output']}
        stage='basis'
        providerRates={{ input: '0.20', output: '0.40' }}
        categoryAssumptions={{
          input: { otherVariableCostRmb: '0.01', riskBufferRmb: '0.02' },
          output: { otherVariableCostRmb: '0', riskBufferRmb: '0' },
        }}
        successProbabilityPercent='90'
        targetMarginPercent='40'
        customerRates={{ input: '20', output: '70' }}
        failureMode='NONE'
        pointsPerRmb='100'
        onAssumptionChange={onAssumptionChange}
        onRateChange={onRateChange}
      />
    )

    expect(
      screen.getByLabelText('Additional cost per million tokens · input')
    ).toBeVisible()
    expect(
      screen.queryByLabelText('Customer price per million tokens · input')
    ).not.toBeInTheDocument()
    fireEvent.change(
      screen.getByLabelText(
        'Risk buffer per successful million tokens · input'
      ),
      { target: { value: '0.03' } }
    )
    expect(onAssumptionChange).toHaveBeenCalledWith(
      'input',
      'riskBufferRmb',
      '0.03'
    )

    render(
      <TokenPricingQuestionnaire
        idPrefix='token-price'
        categories={['input']}
        stage='price'
        providerRates={{ input: '0.20' }}
        categoryAssumptions={{
          input: { otherVariableCostRmb: '0.01', riskBufferRmb: '0.02' },
        }}
        successProbabilityPercent='90'
        targetMarginPercent='40'
        customerRates={{ input: '20' }}
        currentRates={{ input: '30' }}
        failureMode='NONE'
        pointsPerRmb='100'
        onAssumptionChange={onAssumptionChange}
        onRateChange={onRateChange}
        onKeepCurrent={vi.fn()}
      />
    )

    expect(
      screen.getByLabelText('Customer price per million tokens · input')
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Use recommended · input' })
    ).toBeVisible()
    expect(
      screen.getByLabelText('Customer price per million tokens · input')
    ).toHaveValue('20')
    expect(
      screen.getByRole('button', { name: 'Keep current rates' })
    ).toBeVisible()
  })

  it('treats missing assumptions as incomplete and exposes errors after blur', () => {
    render(
      <TokenPricingQuestionnaire
        idPrefix='token-validation'
        categories={['input']}
        stage='basis'
        providerRates={{ input: '0.20' }}
        categoryAssumptions={{}}
        successProbabilityPercent='90'
        targetMarginPercent='40'
        customerRates={{ input: '20' }}
        failureMode='NONE'
        pointsPerRmb='100'
        onAssumptionChange={vi.fn()}
        onRateChange={vi.fn()}
      />
    )

    const otherCost = screen.getByLabelText(
      'Additional cost per million tokens · input'
    )
    expect(otherCost).toHaveValue('')
    expect(otherCost).toHaveAttribute('aria-required', 'true')
    expect(otherCost).toHaveAttribute(
      'aria-describedby',
      'token-validation-token-other-input-unit'
    )
    fireEvent.blur(otherCost)
    expect(otherCost).toHaveAttribute('aria-invalid', 'true')
    expect(otherCost).toHaveAttribute(
      'aria-describedby',
      'token-validation-token-other-input-unit token-validation-token-other-input-error'
    )
    expect(
      screen.getByText('Enter a non-negative RMB amount with up to 2 decimals')
    ).toBeVisible()
  })

  it('shows the complete category calculation inputs and differentiated risk feedback', () => {
    const { rerender } = render(
      <TokenPricingQuestionnaire
        idPrefix='token-details'
        categories={['input']}
        stage='price'
        providerRates={{ input: '0.20' }}
        categoryAssumptions={{
          input: { otherVariableCostRmb: '0.01', riskBufferRmb: '0.02' },
        }}
        successProbabilityPercent='90'
        targetMarginPercent='40'
        customerRates={{ input: '0' }}
        failureMode='SAME_AS_SUCCESS'
        pointsPerRmb='100'
        onAssumptionChange={vi.fn()}
        onRateChange={vi.fn()}
      />
    )

    expect(
      screen
        .getByText(
          'The proposed price is at or below break-even and cannot be published.'
        )
        .closest('[aria-live]')
    ).toHaveClass('text-destructive')
    fireEvent.click(screen.getByText('Show calculation details'))
    expect(
      screen.getByText(
        /Service provider cost.*Additional cost per million tokens/
      )
    ).toBeVisible()
    expect(screen.getByText(/90% × 0.20.*0.01.*90%.*0.23/)).toBeVisible()
    expect(
      screen.getByText(/pricing cost basis.*Risk buffer.*0.02.*0.25/i)
    ).toBeVisible()
    expect(screen.getByText(/Published point issuance rate: 100/)).toBeVisible()

    rerender(
      <TokenPricingQuestionnaire
        idPrefix='token-details'
        categories={['input']}
        stage='price'
        providerRates={{ input: '0.20' }}
        categoryAssumptions={{
          input: { otherVariableCostRmb: '0.01', riskBufferRmb: '0.02' },
        }}
        successProbabilityPercent='90'
        targetMarginPercent='40'
        customerRates={{ input: '30' }}
        failureMode='SAME_AS_SUCCESS'
        pointsPerRmb='100'
        onAssumptionChange={vi.fn()}
        onRateChange={vi.fn()}
      />
    )
    expect(
      screen
        .getByText(
          "The proposed price is above break-even but below this price version's target-margin floor."
        )
        .closest('[aria-live]')
    ).toHaveClass('text-amber-700')
  })

  it('numbers a token price area once and keeps current token rates through the existing callback', () => {
    const onKeepCurrent = vi.fn()
    render(
      <TokenPricingQuestionnaire
        idPrefix='token-price-number'
        categories={['input', 'output']}
        stage='price'
        questionNumber={4}
        providerRates={{ input: '0.20', output: '0.40' }}
        categoryAssumptions={{
          input: { otherVariableCostRmb: '0.01', riskBufferRmb: '0.02' },
          output: { otherVariableCostRmb: '0.01', riskBufferRmb: '0.02' },
        }}
        successProbabilityPercent='90'
        targetMarginPercent='40'
        customerRates={{ input: '20', output: '70' }}
        currentRates={{ input: '30', output: '80' }}
        failureMode='NONE'
        pointsPerRmb='100'
        onAssumptionChange={vi.fn()}
        onRateChange={vi.fn()}
        onKeepCurrent={onKeepCurrent}
      />
    )

    expect(screen.getByText('4.')).toBeVisible()
    expect(
      screen.getAllByText('How many points should the customer pay?')
    ).toHaveLength(1)
    expect(
      screen.getByText('Current price: 30 points per million tokens')
    ).toBeVisible()
    expect(
      screen.getByText('Current price: 80 points per million tokens')
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Keep current rates' }))
    expect(onKeepCurrent).toHaveBeenCalledOnce()
  })

  it('keeps token retention distinct from proposed-price simulation feedback', () => {
    render(
      <TokenPricingQuestionnaire
        idPrefix='token-keep'
        categories={['input']}
        stage='price'
        providerRates={{ input: '0.20' }}
        categoryAssumptions={{
          input: { otherVariableCostRmb: '0.01', riskBufferRmb: '0.02' },
        }}
        successProbabilityPercent='90'
        targetMarginPercent='40'
        customerRates={{ input: '0' }}
        currentRates={{ input: '0' }}
        failureMode='NONE'
        pointsPerRmb='100'
        onAssumptionChange={vi.fn()}
        onRateChange={vi.fn()}
        priceAction='KEEP'
      />
    )

    expect(screen.getByText('Current price retention selected')).toBeVisible()
    expect(
      screen.getByLabelText('Customer price per million tokens · input')
    ).toHaveValue('0')
    expect(
      screen.queryByText('Simulation below break-even')
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'The current price may incur a loss under these costs; the server preview determines whether risk handling is required.'
      )
    ).toBeVisible()
  })
})

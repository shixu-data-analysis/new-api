/*
Copyright (C) 2023-2026 QuantumNous
*/
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CnyPricingQuestionnaire } from '../CnyPricingQuestionnaire'

describe('CnyPricingQuestionnaire', () => {
  it.each([
    ['50.00000000', '50 points per RMB'],
    ['50.50000000', '50.5 points per RMB'],
  ])(
    'formats the pricing rate snapshot %s without meaningless zeros',
    (rate, expected) => {
      render(
        <CnyPricingQuestionnaire
          idPrefix='cny-rate'
          billingUnit='REQUEST'
          categories={[]}
          draft={{ provider: {}, customer: {} }}
          errors={{}}
          pointsPerRmb={rate}
          onChange={vi.fn()}
          onBlur={vi.fn()}
        />
      )

      expect(screen.getByText(new RegExp(expected))).toBeVisible()
    }
  )

  it('renders only supported Token categories and exposes field errors accessibly', () => {
    const onChange = vi.fn()
    render(
      <CnyPricingQuestionnaire
        idPrefix='cny'
        billingUnit='MILLION_TOKENS'
        categories={['input', 'output', 'cacheRead']}
        draft={{
          provider: { input: '1.00', output: '', cacheRead: '0.20' },
          customer: { input: '2.00', output: '3.00', cacheRead: '0.40' },
        }}
        errors={{ 'provider:output': 'Enter a valid amount' }}
        onChange={onChange}
        onBlur={vi.fn()}
      />
    )

    expect(screen.getAllByLabelText(/Provider successful price/)).toHaveLength(
      3
    )
    expect(screen.queryByText('cacheWrite')).not.toBeInTheDocument()
    const outputProvider = screen.getAllByLabelText(
      /Provider successful price/
    )[1]
    expect(outputProvider).toHaveAttribute('aria-invalid', 'true')
    expect(outputProvider).toHaveAccessibleDescription(
      'RMB / per million tokens Enter a valid amount'
    )
    fireEvent.change(outputProvider, { target: { value: '1.50' } })
    expect(onChange).toHaveBeenLastCalledWith('provider', 'output', '1.50')
  })

  it('displays only server-returned derived pricing facts', () => {
    const { container } = render(
      <CnyPricingQuestionnaire
        idPrefix='cny'
        billingUnit='REQUEST'
        categories={[]}
        draft={{
          provider: { scalar: '1.20' },
          customer: { scalar: '2.40' },
        }}
        errors={{}}
        calculation={{
          providerSuccessPriceCny: '1.20',
          customerPriceCny: '2.40',
          actualMarginRate: '0.5',
          fullCostCny: '1.20',
          canPublish: true,
        }}
        points='240'
        pointsPerRmb='100'
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />
    )

    expect(screen.getByText('240 points / per request')).toBeVisible()
    expect(screen.getByText('50.00%')).toBeVisible()
    expect(screen.getByText('Can publish')).toBeVisible()
    expect(screen.getByText(/100 points per RMB/)).toBeVisible()
    const fields = container.querySelector('.mt-4.grid.max-w-xs')
    expect(fields).not.toHaveClass('sm:grid-cols-2')
  })
})

/*
Copyright (C) 2023-2026 QuantumNous
*/
import { fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { PricingActionConfirmation } from '../PricingActionConfirmation'
import { PricingQuestionnaire } from '../PricingQuestionnaire'

const answers = {
  targetMarginPercent: '40',
  successProbabilityPercent: '90',
  successfulTaskCostRmb: '0.20',
  failedUnrecoverableCostRmb: '0.10',
  otherVariableCostRmb: '0.02',
  riskBufferRmb: '0.01',
  proposedPoints: '',
}

describe('PricingQuestionnaire', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  beforeEach(async () => {
    await i18next.changeLanguage('en')
  })

  it('keeps the basis formula collapsed without repeating a later price recommendation', () => {
    render(
      <PricingQuestionnaire
        idPrefix='pricing'
        answers={answers}
        pointsPerRmb='100'
        providerCostEditor={<input aria-label='Service provider cost' />}
        showProposedPoints={false}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText(/Cost per successful task =/)).not.toBeVisible()
    expect(
      screen.queryByRole('region', { name: 'Pricing recommendation' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Show calculation details'))
    expect(screen.getByText(/Cost per successful task =/)).toBeVisible()
    expect(screen.getByText(/90% × 0.20/)).toBeVisible()
  })

  it('uses the proposed-price action as the only recommendation when it is shown', () => {
    render(
      <PricingQuestionnaire
        idPrefix='pricing'
        answers={answers}
        pointsPerRmb='100'
        showProposedPoints
        onChange={vi.fn()}
      />
    )

    expect(
      screen.getAllByRole('region', { name: 'Pricing recommendation' })
    ).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: 'Use recommended' })
    ).toBeVisible()
  })

  it('raises a zero-margin recommendation above the strict break-even floor', () => {
    const onChange = vi.fn()
    render(
      <PricingQuestionnaire
        idPrefix='pricing'
        answers={{ ...answers, targetMarginPercent: '0' }}
        pointsPerRmb='100'
        showBasis={false}
        showProposedPoints
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Use recommended' }))
    expect(onChange).toHaveBeenCalledWith('proposedPoints', '26')
  })

  it('can hide scalar additional-cost questions when token categories own them', () => {
    render(
      <PricingQuestionnaire
        idPrefix='pricing'
        answers={answers}
        pointsPerRmb='100'
        providerCostEditor={<input aria-label='Service provider cost' />}
        showAdditionalCosts={false}
        showProposedPoints={false}
        onChange={vi.fn()}
      />
    )

    expect(
      screen.queryByLabelText('Other variable cost for every attempt')
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Risk buffer')).not.toBeInTheDocument()
    expect(screen.getByText('3.')).toBeVisible()
  })

  it('numbers a standalone customer-price step from one and keeps its risk beside the entered unit price', () => {
    render(
      <PricingQuestionnaire
        idPrefix='pricing'
        answers={{ ...answers, proposedPoints: '20' }}
        pointsPerRmb='100'
        billingUnitLabel='per second'
        showBasis={false}
        showProposedPoints
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('1.')).toBeVisible()
    expect(screen.getByLabelText('Proposed price points')).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('pricing-proposed-points-unit')
    )
    expect(screen.getByLabelText('Proposed price points')).toHaveValue('20')
    expect(
      screen.getByText(
        'The proposed price is at or below break-even and cannot be published.'
      )
    ).toBeVisible()
  })

  it('uses the supplied price question number and delegates current-price retention', () => {
    const onKeepCurrent = vi.fn()
    render(
      <PricingQuestionnaire
        idPrefix='pricing'
        answers={answers}
        pointsPerRmb='100'
        currentPoints='30'
        proposedQuestionNumber={6}
        showBasis={false}
        showProposedPoints
        onKeepCurrent={onKeepCurrent}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('6.')).toBeVisible()
    expect(screen.getByText('Current price: 30 points')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Keep current' }))
    expect(onKeepCurrent).toHaveBeenCalledOnce()
  })

  it('shows retention without a proposed-price verdict and only reports a current-cost loss', () => {
    render(
      <PricingQuestionnaire
        idPrefix='pricing'
        answers={{ ...answers, proposedPoints: '1' }}
        pointsPerRmb='100'
        currentPoints='1'
        priceAction='KEEP'
        showBasis={false}
        showProposedPoints
        onChange={vi.fn()}
      />
    )

    expect(screen.getByText('Current price retention selected')).toBeVisible()
    expect(screen.getByLabelText('Proposed price points')).toHaveValue('1')
    expect(
      screen.queryByText('Simulation below break-even')
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'The current price may incur a loss under these costs; the server preview determines whether risk handling is required.'
      )
    ).toBeVisible()
  })

  it('marks an already selected recommendation as applied', () => {
    render(
      <PricingQuestionnaire
        idPrefix='pricing'
        answers={{ ...answers, proposedPoints: '41' }}
        pointsPerRmb='100'
        showBasis={false}
        showProposedPoints
        onChange={vi.fn()}
      />
    )

    expect(
      screen.getByRole('button', { name: 'Recommendation applied' })
    ).toBeDisabled()
  })
})

describe('PricingActionConfirmation', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en')
  })

  it('shows compact details before grouped comparisons while preserving the fixed action footer', () => {
    render(
      <PricingActionConfirmation
        open
        onOpenChange={vi.fn()}
        title='Confirm pricing publication'
        description='Review the changes and their effective schedule.'
        details={[{ label: 'Effective at', value: '2026-09-10T00:00' }]}
        comparisonRows={[
          {
            scope: 'Quality: HD',
            scopeId: 'scope-hd',
            field: 'Provider cost',
            before: '0.10 RMB',
            after: '0.12 RMB',
          },
          {
            scope: 'Quality: HD',
            scopeId: 'scope-hd',
            priceGroupId: 'standard',
            priceGroup: 'Standard',
            field: 'Customer price',
            before: '20 points',
            after: '24 points',
          },
          {
            scope: 'Quality: HD',
            scopeId: 'scope-hd',
            priceGroupId: 'premium',
            priceGroup: 'Premium',
            field: 'Customer price',
            before: '30 points',
            after: '36 points',
          },
          {
            scope: 'Quality: HD',
            scopeId: 'scope-uhd',
            field: 'Provider cost',
            before: '0.20 RMB',
            after: '0.24 RMB',
          },
          {
            scope: 'Quality: HD',
            scopeId: 'scope-uhd',
            priceGroupId: 'standard',
            priceGroup: 'Standard',
            field: 'Customer price',
            before: '40 points',
            after: '48 points',
          },
        ]}
        confirmLabel='Confirm'
        pending={false}
        onConfirm={vi.fn()}
      />
    )

    const changedFields = screen.getAllByText('Changed field')
    expect(changedFields).toHaveLength(5)
    expect(screen.getAllByText('Quality: HD')).toHaveLength(2)
    expect(screen.getAllByText('Price plan: Standard')).toHaveLength(2)
    expect(screen.getByText('Price plan: Premium')).toBeVisible()
    expect(screen.getAllByRole('table', { name: 'Quality: HD' })).toHaveLength(
      2
    )
    expect(screen.getAllByText('Provider cost')).toHaveLength(2)
    expect(screen.getAllByRole('table', { name: 'Standard' })).toHaveLength(2)
    expect(screen.getByRole('table', { name: 'Premium' })).toHaveTextContent(
      'Customer price'
    )
    expect(screen.getByText('Effective at:')).toBeVisible()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveClass('sm:max-w-4xl')
    expect(dialog.querySelector('[role="table"]')).not.toHaveClass(
      'min-w-[44rem]'
    )
    expect(
      dialog.querySelector('[data-slot="alert-dialog-footer"]')
    ).toHaveClass('shrink-0')
    expect(
      [...dialog.querySelectorAll('[aria-hidden="true"]')].filter(
        (element) => element.textContent === 'Before'
      )
    ).toHaveLength(5)
    expect(
      [...dialog.querySelectorAll('[aria-hidden="true"]')].filter(
        (element) => element.textContent === 'After'
      )
    ).toHaveLength(5)
    expect(
      screen
        .getByText('Effective at:')
        .compareDocumentPosition(changedFields[0]) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeVisible()
  })

  it('uses the compact dialog width when there are no comparisons', () => {
    render(
      <PricingActionConfirmation
        open
        onOpenChange={vi.fn()}
        title='Confirm pricing publication'
        description='Review the changes and their effective schedule.'
        details={[{ label: 'Immediately', value: 'Immediately' }]}
        confirmLabel='Confirm'
        pending={false}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByRole('alertdialog')).toHaveClass('sm:max-w-lg')
  })
})

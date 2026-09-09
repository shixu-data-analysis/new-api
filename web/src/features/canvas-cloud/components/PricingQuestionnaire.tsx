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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toIntlLocale } from '@/i18n/languages'

import { formatBusinessNumber } from '../number-format'
import { formatExactRmbReference } from '../point-conversion-types'
import {
  type PricingSimulationResult,
  calculateQuestionnairePricing,
  type PricingQuestionnaireAnswers,
} from '../pricing-simulation'

type AnswerKey = keyof PricingQuestionnaireAnswers

function verdictPresentation(verdict: PricingSimulationResult['verdict']) {
  if (verdict === 'BELOW_BREAK_EVEN') {
    return {
      className: 'text-destructive',
      message: 'Simulation below break-even',
    }
  }
  if (verdict === 'BELOW_TARGET') {
    return {
      className: 'text-amber-700 dark:text-amber-400',
      message: 'Simulation below target margin',
    }
  }
  return {
    className: 'text-emerald-700 dark:text-emerald-400',
    message: 'Simulation meets target margin',
  }
}

function Question(props: {
  number: number
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className='border-t pt-6 first:border-t-0 first:pt-0'>
      <div className='flex gap-3'>
        <div className='text-muted-foreground shrink-0 text-sm font-medium'>
          {props.number}.
        </div>
        <div className='min-w-0 flex-1'>
          <h3 className='font-medium'>{props.title}</h3>
          <p className='text-muted-foreground mt-1 text-sm leading-5'>
            {props.description}
          </p>
          <div className='mt-4'>{props.children}</div>
        </div>
      </div>
    </section>
  )
}

function AnswerField(props: {
  id: string
  label: string
  value: string
  unit: string
  inputMode?: 'decimal' | 'numeric'
  error?: string | null
  onChange: (value: string) => void
  onBlur?: () => void
}) {
  const describedBy = `${props.id}-unit${props.error ? ` ${props.id}-error` : ''}`
  return (
    <div className='space-y-1'>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        aria-label={props.label}
        inputMode={props.inputMode ?? 'decimal'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={props.onBlur}
        aria-required='true'
        aria-describedby={describedBy}
        aria-invalid={Boolean(props.error)}
      />
      <div id={`${props.id}-unit`} className='text-muted-foreground text-xs'>
        {props.unit}
      </div>
      {props.error && (
        <div
          id={`${props.id}-error`}
          className='text-destructive text-xs'
          role='alert'
        >
          {props.error}
        </div>
      )}
    </div>
  )
}

export function PricingQuestionnaire(props: {
  idPrefix: string
  answers: PricingQuestionnaireAnswers
  pointsPerRmb: string
  billingUnitLabel?: string
  providerCostRmb?: string
  providerCostEditor?: React.ReactNode
  currentPoints?: string
  onKeepCurrent?: () => void
  priceAction?: 'KEEP' | 'SET'
  proposedQuestionNumber?: number
  showBasis?: boolean
  showProposedPoints?: boolean
  showRecommendation?: boolean
  showCalculation?: boolean
  showAdditionalCosts?: boolean
  errors?: Partial<Record<AnswerKey, string | null>>
  onChange: (key: AnswerKey, value: string) => void
  onBlur?: (key: AnswerKey) => void
}) {
  const { t, i18n } = useTranslation()
  const result = useMemo(
    () => calculateQuestionnairePricing(props.answers, props.pointsPerRmb),
    [props.answers, props.pointsPerRmb]
  )
  const priceAction = props.priceAction ?? 'SET'
  const hasValidProposedPoints = /^[1-9]\d*$/.test(props.answers.proposedPoints)
  let recommendedPoints: string | null = null
  if (result) {
    recommendedPoints = result.targetMarginPoints
    if (BigInt(result.targetMarginPoints) <= BigInt(result.breakEvenPoints)) {
      recommendedPoints = (BigInt(result.breakEvenPoints) + 1n).toString()
    }
  }
  const verdict =
    priceAction === 'SET' && result && hasValidProposedPoints
      ? verdictPresentation(result.verdict)
      : null
  const id = (suffix: string) => `${props.idPrefix}-${suffix}`
  const costUnit = props.billingUnitLabel
    ? `${t('RMB')} / ${props.billingUnitLabel}`
    : t('RMB per successful attempt')
  const pointUnit = props.billingUnitLabel
    ? `${t('points')} ${props.billingUnitLabel}`
    : t('points')
  const showRecommendation = props.showRecommendation ?? false
  let proposedQuestionNumber =
    props.proposedQuestionNumber ?? (props.providerCostEditor ? 6 : 5)
  if (props.proposedQuestionNumber === undefined && props.showBasis === false) {
    proposedQuestionNumber = 1
  }
  const targetMarginQuestionNumber =
    (props.providerCostEditor ? 2 : 1) +
    (props.showAdditionalCosts === false ? 0 : 2) +
    1
  const field = (key: AnswerKey) => ({
    error: props.errors?.[key],
    onBlur: () => props.onBlur?.(key),
  })
  const proposedPointsAction = () => {
    return (
      <div className='space-y-3'>
        {result ? (
          <section
            aria-label={t('Pricing recommendation')}
            className='border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'
          >
            <div className='min-w-0'>
              <div className='text-primary text-xs font-medium'>
                {t('Pricing recommendation')}
              </div>
              <div className='mt-1 text-lg font-semibold tabular-nums'>
                {recommendedPoints ?? result.targetMarginPoints} {pointUnit}
              </div>
            </div>
            <Button
              type='button'
              variant='outline'
              disabled={
                priceAction === 'SET' &&
                props.answers.proposedPoints ===
                  (recommendedPoints ?? result.targetMarginPoints)
              }
              onClick={() =>
                props.onChange(
                  'proposedPoints',
                  recommendedPoints ?? result.targetMarginPoints
                )
              }
            >
              {priceAction === 'SET' &&
              props.answers.proposedPoints ===
                (recommendedPoints ?? result.targetMarginPoints)
                ? t('Recommendation applied')
                : t('Use recommended')}
            </Button>
          </section>
        ) : null}
        {props.currentPoints ? (
          <div className='flex flex-wrap items-center gap-2 text-sm'>
            <span className='text-muted-foreground'>
              {t('Current price')}: {props.currentPoints} {pointUnit}
            </span>
            {priceAction === 'SET' && props.onKeepCurrent ? (
              <Button
                type='button'
                variant='outline'
                onClick={props.onKeepCurrent}
              >
                {t('Keep current')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {priceAction === 'KEEP' ? (
          <p className='text-muted-foreground text-sm'>
            {t('Current price retention selected')}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      {props.showBasis !== false && (
        <>
          {props.providerCostEditor && (
            <Question
              number={1}
              title={t('Service provider cost')}
              description={`${t('Set the successful and failed-attempt service provider costs before estimating customer pricing.')} ${t('Costs are stated per {{unit}}.', { unit: props.billingUnitLabel ?? t('billing unit') })}`}
            >
              {props.providerCostEditor}
            </Question>
          )}

          <Question
            number={props.providerCostEditor ? 2 : 1}
            title={t('How often do you expect this task to succeed?')}
            description={t(
              'Enter the expected number of successful results out of 100 attempts.'
            )}
          >
            <div className='max-w-xs'>
              <AnswerField
                id={id('success-rate')}
                label={t('Expected success rate')}
                value={props.answers.successProbabilityPercent}
                unit={t('Percent, above 0 and at most 100')}
                onChange={(value) =>
                  props.onChange('successProbabilityPercent', value)
                }
                {...field('successProbabilityPercent')}
              />
            </div>
          </Question>

          {props.showAdditionalCosts !== false && (
            <>
              <Question
                number={props.providerCostEditor ? 3 : 2}
                title={t('What other variable cost does every attempt add?')}
                description={t(
                  'Add only variable costs outside the service provider charge for every attempt and each {{unit}}. Do not include fixed operating expenses.',
                  { unit: props.billingUnitLabel ?? t('billing unit') }
                )}
              >
                <div className='max-w-xs'>
                  <AnswerField
                    id={id('other-cost')}
                    label={t('Other variable cost for every attempt')}
                    value={props.answers.otherVariableCostRmb}
                    unit={costUnit}
                    onChange={(value) =>
                      props.onChange('otherVariableCostRmb', value)
                    }
                    {...field('otherVariableCostRmb')}
                  />
                </div>
              </Question>

              <Question
                number={props.providerCostEditor ? 4 : 3}
                title={t(
                  'How much risk buffer should each successful result include?'
                )}
                description={t(
                  'The buffer for each successful {{unit}} covers uncertainty and is added after the theoretical successful-result cost is calculated.',
                  { unit: props.billingUnitLabel ?? t('billing unit') }
                )}
              >
                <div className='max-w-xs'>
                  <AnswerField
                    id={id('risk-buffer')}
                    label={t('Risk buffer')}
                    value={props.answers.riskBufferRmb}
                    unit={costUnit}
                    onChange={(value) => props.onChange('riskBufferRmb', value)}
                    {...field('riskBufferRmb')}
                  />
                </div>
              </Question>
            </>
          )}

          <Question
            number={targetMarginQuestionNumber}
            title={t('What target gross margin should this model use?')}
            description={t('This price version stores its own target margin.')}
          >
            <div className='max-w-xs'>
              <AnswerField
                id={id('target-margin')}
                label={t('Target margin rate')}
                value={props.answers.targetMarginPercent}
                unit={t('Percent, at least 0 and below 100. Default: 40%')}
                onChange={(value) =>
                  props.onChange('targetMarginPercent', value)
                }
                {...field('targetMarginPercent')}
              />
            </div>
          </Question>
        </>
      )}

      {props.showProposedPoints !== false && (
        <Question
          number={proposedQuestionNumber}
          title={t('How many points should the customer pay?')}
          description={t(
            'Use the recommendation, keep the current price, or enter a custom positive integer.'
          )}
        >
          <div className='max-w-2xl'>
            {proposedPointsAction()}

            <div className='mt-3 w-full max-w-xs'>
              <AnswerField
                id={id('proposed-points')}
                label={t('Proposed price points')}
                value={props.answers.proposedPoints}
                unit={pointUnit}
                inputMode='numeric'
                onChange={(value) => props.onChange('proposedPoints', value)}
                {...field('proposedPoints')}
              />
            </div>
            {hasValidProposedPoints && result && verdict && (
              <div
                aria-live='polite'
                className={`mt-3 text-sm ${verdict.className}`}
              >
                <p>{t(verdict.message)}</p>
              </div>
            )}
            {priceAction === 'KEEP' &&
            result &&
            props.currentPoints &&
            /^\d+$/.test(props.currentPoints) &&
            BigInt(props.currentPoints) < BigInt(result.breakEvenPoints) ? (
              <p className='text-destructive mt-3 text-sm' role='status'>
                {t(
                  'The current price may incur a loss under these costs; the server preview determines whether risk handling is required.'
                )}
              </p>
            ) : null}
          </div>
        </Question>
      )}

      {props.showBasis !== false && props.showCalculation !== false && (
        <details className='border-t pt-6 text-sm'>
          <summary className='cursor-pointer font-medium'>
            {t('Show calculation details')}
          </summary>
          <div className='text-muted-foreground mt-3 space-y-3'>
            <p>
              {t('Published point issuance rate')}:{' '}
              {formatBusinessNumber(props.pointsPerRmb)} {t('points per RMB')}
            </p>
            <p>{t('Expected attempt cost explanation')}</p>
            <p className='text-xs'>
              {t(
                'Calculations use unrounded costs; displayed RMB amounts are rounded to two decimal places.'
              )}
            </p>
            <div className='space-y-2 text-xs leading-5'>
              <div>
                {t('Cost per successful task')} = ({t('Expected success rate')}{' '}
                × {t('Service provider cost')} + (100% −{' '}
                {t('Expected success rate')}) × {t('Failed-attempt cost')} +{' '}
                {t('Other variable cost for every attempt')}) ÷{' '}
                {t('Expected success rate')}
              </div>
              <div>
                {t('Pricing cost basis')} = {t('Cost per successful task')} +{' '}
                {t('Risk buffer')}
              </div>
              <div>
                {t('Break-even')} = {t('Pricing cost basis')} ×{' '}
                {t('Published point issuance rate')} ·{' '}
                {t('Rounded upward to integer points')}
              </div>
              <div>
                {t('Target margin floor')} = ({t('Pricing cost basis')} ×{' '}
                {t('Published point issuance rate')}) ÷ (1 −{' '}
                {t('Target margin rate')}) ·{' '}
                {t('Rounded upward to integer points')}
              </div>
            </div>
            {result ? (
              <div className='space-y-2 text-xs leading-5'>
                <div>
                  {t('Cost per successful task')} ≈ (
                  {props.answers.successProbabilityPercent}% ×{' '}
                  {props.answers.successfulTaskCostRmb} + (100% −{' '}
                  {props.answers.successProbabilityPercent}%) ×{' '}
                  {props.answers.failedUnrecoverableCostRmb} +{' '}
                  {props.answers.otherVariableCostRmb}) ÷{' '}
                  {props.answers.successProbabilityPercent}% ≈{' '}
                  {formatExactRmbReference(
                    result.kTheoryRmb,
                    toIntlLocale(i18n.resolvedLanguage ?? i18n.language),
                    2
                  )}{' '}
                  {t('RMB')}
                </div>
                <div>
                  {t('Pricing cost basis')} ≈{' '}
                  {formatExactRmbReference(
                    result.kTheoryRmb,
                    toIntlLocale(i18n.resolvedLanguage ?? i18n.language),
                    2
                  )}{' '}
                  + {props.answers.riskBufferRmb} ≈{' '}
                  {formatExactRmbReference(
                    result.kPricingRmb,
                    toIntlLocale(i18n.resolvedLanguage ?? i18n.language),
                    2
                  )}{' '}
                  {t('RMB')}
                </div>
                <div>
                  {t('Break-even')} ≈{' '}
                  {formatExactRmbReference(
                    result.kPricingRmb,
                    toIntlLocale(i18n.resolvedLanguage ?? i18n.language),
                    2
                  )}{' '}
                  × {formatBusinessNumber(props.pointsPerRmb)} ≈{' '}
                  {formatBusinessNumber(result.breakEvenRaw)} →{' '}
                  {result.breakEvenPoints} {pointUnit}
                </div>
                <div>
                  {t('Target margin floor')} ≈ (
                  {formatExactRmbReference(
                    result.kPricingRmb,
                    toIntlLocale(i18n.resolvedLanguage ?? i18n.language),
                    2
                  )}{' '}
                  × {formatBusinessNumber(props.pointsPerRmb)}) ÷ (1 −{' '}
                  {props.answers.targetMarginPercent}%) ≈{' '}
                  {formatBusinessNumber(result.targetMarginRaw)} →{' '}
                  {result.targetMarginPoints} {pointUnit}
                </div>
              </div>
            ) : (
              <p role='status' className='text-muted-foreground mt-3 text-sm'>
                {t('Complete the questions to see a recommendation.')}
              </p>
            )}
          </div>
        </details>
      )}
      {showRecommendation && result && priceAction === 'SET' && (
        <section
          aria-label={t('Pricing recommendation')}
          className={`border-t pt-6 ${verdict?.className ?? ''}`}
        >
          <div className='text-muted-foreground text-sm'>
            {t('Pricing recommendation')}
          </div>
          <div className='mt-1 text-lg font-semibold tabular-nums'>
            {recommendedPoints ?? result.targetMarginPoints} {pointUnit}
          </div>
          {verdict && <p className='mt-1 text-sm'>{t(verdict.message)}</p>}
        </section>
      )}
    </div>
  )
}

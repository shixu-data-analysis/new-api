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

import {
  type PricingSimulationResult,
  calculateQuestionnairePricing,
  type PricingQuestionnaireAnswers,
} from '../pricing-simulation'

type AnswerKey = keyof PricingQuestionnaireAnswers

function verdictPresentation(verdict: PricingSimulationResult['verdict']) {
  if (verdict === 'BELOW_BREAK_EVEN') {
    return {
      className: 'border-destructive/40 bg-destructive/5 text-destructive',
      message: 'Simulation below break-even',
    }
  }
  if (verdict === 'BELOW_TARGET') {
    return {
      className: 'border-amber-500/40 bg-amber-500/10',
      message: 'Simulation below target margin',
    }
  }
  return {
    className: 'border-emerald-500/40 bg-emerald-500/10',
    message: 'Simulation meets target margin',
  }
}

function displayRmb(value: string): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric)
}

function Question(props: {
  number: number
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className='rounded-xl border p-4 sm:p-5'>
      <div className='flex gap-3'>
        <div className='bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold'>
          {props.number}
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

function SummaryValue(props: {
  label: string
  value: string
  emphasized?: boolean
}) {
  return (
    <div className='bg-background rounded-lg border p-3'>
      <dt className='text-muted-foreground text-xs'>{props.label}</dt>
      <dd
        className={`mt-1 tabular-nums ${props.emphasized ? 'text-lg font-semibold' : 'font-medium'}`}
      >
        {props.value}
      </dd>
    </div>
  )
}

export function PricingQuestionnaire(props: {
  idPrefix: string
  answers: PricingQuestionnaireAnswers
  pointsPerRmb: string
  currentPoints?: string
  errors?: Partial<Record<AnswerKey, string | null>>
  onChange: (key: AnswerKey, value: string) => void
  onBlur?: (key: AnswerKey) => void
}) {
  const { t } = useTranslation()
  const result = useMemo(
    () => calculateQuestionnairePricing(props.answers, props.pointsPerRmb),
    [props.answers, props.pointsPerRmb]
  )
  const verdict = result ? verdictPresentation(result.verdict) : null
  const id = (suffix: string) => `${props.idPrefix}-${suffix}`
  const field = (key: AnswerKey) => ({
    error: props.errors?.[key],
    onBlur: () => props.onBlur?.(key),
  })

  return (
    <div className='space-y-4'>
      <div className='bg-muted/35 grid gap-3 rounded-xl border p-4 sm:grid-cols-2'>
        <SummaryValue
          label={t('Published point issuance rate')}
          value={`${Number(props.pointsPerRmb || 0)} ${t('points per RMB')}`}
        />
        <SummaryValue
          label={t('Model target margin')}
          value={`${props.answers.targetMarginPercent || '—'}%`}
        />
      </div>

      <Question
        number={1}
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

      <Question
        number={2}
        title={t('What does one attempt cost?')}
        description={t(
          'Use service provider costs and other variable costs. Do not include fixed operating expenses.'
        )}
      >
        <div className='grid gap-3 md:grid-cols-3'>
          <AnswerField
            id={id('success-cost')}
            label={t('Service provider cost when successful')}
            value={props.answers.successfulTaskCostRmb}
            unit={t('RMB per successful attempt')}
            onChange={(value) => props.onChange('successfulTaskCostRmb', value)}
            {...field('successfulTaskCostRmb')}
          />
          <AnswerField
            id={id('failure-cost')}
            label={t('Unrecoverable service provider cost when failed')}
            value={props.answers.failedUnrecoverableCostRmb}
            unit={t('RMB per failed attempt')}
            onChange={(value) =>
              props.onChange('failedUnrecoverableCostRmb', value)
            }
            {...field('failedUnrecoverableCostRmb')}
          />
          <AnswerField
            id={id('other-cost')}
            label={t('Other variable cost for every attempt')}
            value={props.answers.otherVariableCostRmb}
            unit={t('RMB per attempt')}
            onChange={(value) => props.onChange('otherVariableCostRmb', value)}
            {...field('otherVariableCostRmb')}
          />
        </div>
      </Question>

      <Question
        number={3}
        title={t('How much risk buffer should each successful result include?')}
        description={t(
          'The buffer covers uncertainty and is added after the theoretical successful-result cost is calculated.'
        )}
      >
        <div className='max-w-xs'>
          <AnswerField
            id={id('risk-buffer')}
            label={t('Risk buffer')}
            value={props.answers.riskBufferRmb}
            unit={t('RMB per successful chargeable result')}
            onChange={(value) => props.onChange('riskBufferRmb', value)}
            {...field('riskBufferRmb')}
          />
        </div>
      </Question>

      <Question
        number={4}
        title={t('What target gross margin should this model use?')}
        description={t(
          'This price version stores its own target margin. New model prices start from the 40% default.'
        )}
      >
        <div className='max-w-xs'>
          <AnswerField
            id={id('target-margin')}
            label={t('Target margin rate')}
            value={props.answers.targetMarginPercent}
            unit={t('Percent, at least 0 and below 100. Default: 40%')}
            onChange={(value) => props.onChange('targetMarginPercent', value)}
            {...field('targetMarginPercent')}
          />
        </div>
      </Question>

      <Question
        number={5}
        title={t('How many points should the customer pay?')}
        description={t(
          'Use the recommendation or enter a custom positive integer. The server rechecks the floor before publication.'
        )}
      >
        <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
          <div className='w-full max-w-xs'>
            <AnswerField
              id={id('proposed-points')}
              label={t('Proposed price points')}
              value={props.answers.proposedPoints}
              unit={t('Integer points')}
              inputMode='numeric'
              onChange={(value) => props.onChange('proposedPoints', value)}
              {...field('proposedPoints')}
            />
          </div>
          <div className='flex flex-wrap gap-2 pb-0.5'>
            {result && (
              <Button
                type='button'
                variant='outline'
                onClick={() =>
                  props.onChange('proposedPoints', result.targetMarginPoints)
                }
              >
                {t('Use recommended')} · {result.targetMarginPoints}
              </Button>
            )}
            {props.currentPoints && (
              <Button
                type='button'
                variant='ghost'
                onClick={() =>
                  props.onChange('proposedPoints', props.currentPoints ?? '')
                }
              >
                {t('Keep current')} · {props.currentPoints}
              </Button>
            )}
          </div>
        </div>
      </Question>

      {result ? (
        <section
          aria-live='polite'
          className='bg-muted/20 rounded-xl border p-4 sm:p-5'
        >
          <h3 className='font-semibold'>{t('Pricing recommendation')}</h3>
          <div className='mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            <SummaryValue
              label={t('Cost per successful task')}
              value={`${displayRmb(result.kTheoryRmb)} ${t('RMB')}`}
            />
            <SummaryValue
              label={t('Pricing cost basis')}
              value={`${displayRmb(result.kPricingRmb)} ${t('RMB')}`}
            />
            <SummaryValue
              label={t('Break-even')}
              value={`${result.breakEvenPoints} ${t('points')}`}
            />
            <SummaryValue
              label={t('Target margin floor')}
              value={`${result.targetMarginPoints} ${t('points')}`}
              emphasized
            />
          </div>
          <div
            className={`mt-3 rounded-lg border p-3 text-sm ${verdict?.className ?? ''}`}
          >
            {t(verdict?.message ?? 'Simulation meets target margin')}
          </div>
          <details className='mt-3 text-sm'>
            <summary className='cursor-pointer font-medium'>
              {t('Show calculation details')}
            </summary>
            <dl className='text-muted-foreground mt-2 grid gap-2 sm:grid-cols-2'>
              <div>
                <dt>{t('Expected attempt cost')}</dt>
                <dd>
                  {displayRmb(result.expectedAttemptCostRmb)} {t('RMB')}
                </dd>
              </div>
              <div>
                <dt>{t('Break-even before rounding')}</dt>
                <dd>
                  {Number(result.breakEvenRaw)} {t('points')}
                </dd>
              </div>
            </dl>
          </details>
        </section>
      ) : (
        <div
          role='status'
          className='text-muted-foreground rounded-lg border border-dashed p-3 text-sm'
        >
          {t('Complete the questions to see a recommendation.')}
        </div>
      )}
    </div>
  )
}

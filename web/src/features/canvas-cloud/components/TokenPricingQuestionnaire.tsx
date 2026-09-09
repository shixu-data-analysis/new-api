/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toIntlLocale } from '@/i18n/languages'

import { formatExactRmbReference } from '../point-conversion-types'
import { calculateTokenCategoryPricing } from '../pricing-simulation'
import type {
  CanvasTokenCategory,
  CanvasTokenCategoryAssumptions,
} from '../types'

type TokenAssumption = NonNullable<
  CanvasTokenCategoryAssumptions[CanvasTokenCategory]
>

export interface TokenPricingQuestionnaireProps {
  idPrefix: string
  categories: CanvasTokenCategory[]
  stage: 'basis' | 'price'
  providerRates: Partial<Record<CanvasTokenCategory, string>>
  categoryAssumptions: CanvasTokenCategoryAssumptions
  successProbabilityPercent: string
  targetMarginPercent: string
  customerRates: Partial<Record<CanvasTokenCategory, string>>
  currentRates?: Partial<Record<CanvasTokenCategory, string>>
  failureMode: 'NONE' | 'SAME_AS_SUCCESS'
  pointsPerRmb: string
  onAssumptionChange: (
    category: CanvasTokenCategory,
    field: keyof TokenAssumption,
    value: string
  ) => void
  onRateChange: (category: CanvasTokenCategory, value: string) => void
  onKeepCurrent?: () => void
  priceAction?: 'KEEP' | 'SET'
  questionNumber?: number
  showErrors?: boolean
}

function isRmbAmount(value: string) {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)
}

function isTokenPrice(value: string) {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(value)
}

function isBelowTokenBreakEven(value: string, breakEvenPoints: string) {
  if (!isTokenPrice(value) || !/^\d+$/.test(breakEvenPoints)) return false
  const [whole, decimal = ''] = value.split('.')
  const scaledValue = BigInt(`${whole}${decimal.padEnd(8, '0')}`)
  return scaledValue < BigInt(breakEvenPoints) * 100_000_000n
}

function verdictMessage(
  verdict: 'BELOW_BREAK_EVEN' | 'BELOW_TARGET' | 'MEETS_TARGET' | null,
  t: (key: string) => string
) {
  if (verdict === 'BELOW_BREAK_EVEN') return t('Simulation below break-even')
  if (verdict === 'BELOW_TARGET') return t('Simulation below target margin')
  if (verdict === 'MEETS_TARGET') return t('Simulation meets target margin')
  return null
}

function verdictClass(
  verdict: 'BELOW_BREAK_EVEN' | 'BELOW_TARGET' | 'MEETS_TARGET' | null
) {
  if (verdict === 'BELOW_BREAK_EVEN') return 'text-destructive'
  if (verdict === 'BELOW_TARGET') return 'text-amber-700 dark:text-amber-400'
  return 'text-emerald-700 dark:text-emerald-400'
}

export function TokenPricingQuestionnaire(
  props: TokenPricingQuestionnaireProps
) {
  const { t, i18n } = useTranslation()
  const priceAction = props.priceAction ?? 'SET'
  const locale = toIntlLocale(i18n.resolvedLanguage ?? i18n.language)
  const [touchedFields, setTouchedFields] = useState<Set<string>>(
    () => new Set()
  )
  const markTouched = (field: string) =>
    setTouchedFields((previous) => new Set(previous).add(field))
  const calculations = useMemo(
    () =>
      Object.fromEntries(
        props.categories.map((category) => {
          const assumptions = props.categoryAssumptions[category] ?? {
            otherVariableCostRmb: '',
            riskBufferRmb: '',
          }
          const sharedAssumptions = {
            targetMarginPercent: props.targetMarginPercent,
            successProbabilityPercent: props.successProbabilityPercent,
            ...assumptions,
          }
          return [
            category,
            calculateTokenCategoryPricing(
              sharedAssumptions,
              props.pointsPerRmb,
              props.providerRates[category] ?? '',
              props.failureMode,
              props.customerRates[category] ?? ''
            ),
          ]
        })
      ),
    [
      props.categories,
      props.categoryAssumptions,
      props.customerRates,
      props.failureMode,
      props.pointsPerRmb,
      props.providerRates,
      props.successProbabilityPercent,
      props.targetMarginPercent,
    ]
  ) as Partial<
    Record<
      CanvasTokenCategory,
      ReturnType<typeof calculateTokenCategoryPricing>
    >
  >

  return (
    <div className='space-y-6'>
      {props.stage === 'price' && props.questionNumber !== undefined ? (
        <div className='flex gap-3'>
          <div className='text-muted-foreground shrink-0 text-sm font-medium'>
            {props.questionNumber}.
          </div>
          <div>
            <h3 className='font-medium'>
              {t('How many points should the customer pay?')}
            </h3>
          </div>
        </div>
      ) : null}
      {props.categories.map((category) => {
        const assumption = props.categoryAssumptions[category] ?? {
          otherVariableCostRmb: '',
          riskBufferRmb: '',
        }
        const calculation = calculations[category]
        const feedback = calculation
          ? verdictMessage(calculation.verdict, t)
          : null
        const categoryLabel = t(category)
        const otherField = `${category}-other`
        const bufferField = `${category}-buffer`
        const rateField = `${category}-rate`
        const otherError =
          (props.showErrors || touchedFields.has(otherField)) &&
          !isRmbAmount(assumption.otherVariableCostRmb)
        const bufferError =
          (props.showErrors || touchedFields.has(bufferField)) &&
          !isRmbAmount(assumption.riskBufferRmb)
        const rate = props.customerRates[category] ?? ''
        const rateError =
          (props.showErrors || touchedFields.has(rateField)) &&
          !isTokenPrice(rate)
        const otherId = `${props.idPrefix}-token-other-${category}`
        const bufferId = `${props.idPrefix}-token-buffer-${category}`
        const rateId = `${props.idPrefix}-token-rate-${category}`

        return (
          <section
            key={category}
            className='border-t pt-6 first:border-t-0 first:pt-0'
          >
            <h3 className='font-medium'>{categoryLabel}</h3>
            {props.stage === 'basis' ? (
              <div className='mt-4 grid gap-4 sm:grid-cols-2'>
                <div className='space-y-1'>
                  <Label htmlFor={otherId}>
                    {t('Additional cost per million tokens')} · {categoryLabel}
                  </Label>
                  <Input
                    id={otherId}
                    aria-describedby={`${otherId}-unit${otherError ? ` ${otherId}-error` : ''}`}
                    aria-required='true'
                    aria-label={`${t('Additional cost per million tokens')} · ${categoryLabel}`}
                    inputMode='decimal'
                    value={assumption.otherVariableCostRmb}
                    aria-invalid={otherError}
                    onBlur={() => markTouched(otherField)}
                    onChange={(event) =>
                      props.onAssumptionChange(
                        category,
                        'otherVariableCostRmb',
                        event.target.value
                      )
                    }
                  />
                  <p
                    id={`${otherId}-unit`}
                    className='text-muted-foreground text-xs'
                  >
                    {t('RMB per million tokens')}
                  </p>
                  {otherError && (
                    <p
                      id={`${otherId}-error`}
                      className='text-destructive text-xs'
                      role='alert'
                    >
                      {t(
                        'Enter a non-negative RMB amount with up to 2 decimals'
                      )}
                    </p>
                  )}
                </div>
                <div className='space-y-1'>
                  <Label htmlFor={bufferId}>
                    {t('Risk buffer per successful million tokens')} ·{' '}
                    {categoryLabel}
                  </Label>
                  <Input
                    id={bufferId}
                    aria-describedby={`${bufferId}-unit${bufferError ? ` ${bufferId}-error` : ''}`}
                    aria-required='true'
                    aria-label={`${t('Risk buffer per successful million tokens')} · ${categoryLabel}`}
                    inputMode='decimal'
                    value={assumption.riskBufferRmb}
                    aria-invalid={bufferError}
                    onBlur={() => markTouched(bufferField)}
                    onChange={(event) =>
                      props.onAssumptionChange(
                        category,
                        'riskBufferRmb',
                        event.target.value
                      )
                    }
                  />
                  <p
                    id={`${bufferId}-unit`}
                    className='text-muted-foreground text-xs'
                  >
                    {t('RMB per successful million tokens')}
                  </p>
                  {bufferError && (
                    <p
                      id={`${bufferId}-error`}
                      className='text-destructive text-xs'
                      role='alert'
                    >
                      {t(
                        'Enter a non-negative RMB amount with up to 2 decimals'
                      )}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className='mt-4 space-y-3'>
                {props.currentRates?.[category] !== undefined ? (
                  <p className='text-muted-foreground text-sm'>
                    {t('Current price')}: {props.currentRates[category]}{' '}
                    {t('points per million tokens')}
                  </p>
                ) : null}
                {calculation ? (
                  <div className='flex flex-wrap items-center justify-between gap-3 border-b pb-3'>
                    <div>
                      <div className='text-muted-foreground text-sm'>
                        {t('Pricing recommendation')}
                      </div>
                      <div className='text-lg font-semibold tabular-nums'>
                        {calculation.recommendedPoints}{' '}
                        {t('points per million tokens')}
                      </div>
                    </div>
                    <Button
                      type='button'
                      variant='outline'
                      aria-label={`${t('Use recommended')} · ${categoryLabel}`}
                      disabled={
                        priceAction === 'SET' &&
                        rate === calculation.recommendedPoints
                      }
                      onClick={() =>
                        props.onRateChange(
                          category,
                          calculation.recommendedPoints
                        )
                      }
                    >
                      {priceAction === 'SET' &&
                      rate === calculation.recommendedPoints
                        ? t('Recommendation applied')
                        : t('Use recommended')}
                    </Button>
                  </div>
                ) : null}
                <div className='max-w-xs space-y-1'>
                  <Label htmlFor={rateId}>
                    {t('Customer price per million tokens')} · {categoryLabel}
                  </Label>
                  <Input
                    id={rateId}
                    aria-describedby={`${rateId}-unit${rateError ? ` ${rateId}-error` : ''}`}
                    aria-required='true'
                    aria-label={`${t('Customer price per million tokens')} · ${categoryLabel}`}
                    inputMode='decimal'
                    value={rate}
                    aria-invalid={rateError}
                    onBlur={() => markTouched(rateField)}
                    onChange={(event) =>
                      props.onRateChange(category, event.target.value)
                    }
                  />
                  <p
                    id={`${rateId}-unit`}
                    className='text-muted-foreground text-xs'
                  >
                    {t('points per million tokens')}
                  </p>
                  {rateError && (
                    <p
                      id={`${rateId}-error`}
                      className='text-destructive text-xs'
                      role='alert'
                    >
                      {t(
                        'Enter a non-negative token price with up to 8 decimals'
                      )}
                    </p>
                  )}
                </div>
                {calculation &&
                feedback &&
                rate !== '' &&
                priceAction === 'SET' ? (
                  <div
                    className={`border-t pt-3 text-sm ${verdictClass(
                      calculation.verdict
                    )}`}
                    aria-live='polite'
                  >
                    <p>{feedback}</p>
                  </div>
                ) : null}
                {priceAction === 'KEEP' ? (
                  <>
                    <p className='text-muted-foreground text-sm'>
                      {t('Current price retention selected')}
                    </p>
                    {calculation &&
                    props.currentRates?.[category] !== undefined &&
                    isBelowTokenBreakEven(
                      props.currentRates[category] ?? '',
                      calculation.breakEvenPoints
                    ) ? (
                      <p className='text-destructive text-sm' role='status'>
                        {t(
                          'The current price may incur a loss under these costs; the server preview determines whether risk handling is required.'
                        )}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {calculation && (
                  <details className='border-t pt-3 text-sm'>
                    <summary className='cursor-pointer font-medium'>
                      {t('Show calculation details')}
                    </summary>
                    <div className='text-muted-foreground mt-3 space-y-1 text-xs'>
                      <p>
                        {t(
                          'Calculations use unrounded costs; displayed RMB amounts are rounded to two decimal places.'
                        )}
                      </p>
                      <p>
                        {t('Cost per successful task')} = (
                        {t('Expected success rate')} ×{' '}
                        {t('Service provider cost')} + (100% −{' '}
                        {t('Expected success rate')}) ×{' '}
                        {t('Failed-attempt cost')} +{' '}
                        {t('Additional cost per million tokens')}) ÷{' '}
                        {t('Expected success rate')}
                      </p>
                      <p>
                        ({props.successProbabilityPercent}% ×{' '}
                        {props.providerRates[category]} + (100% −{' '}
                        {props.successProbabilityPercent}%) ×{' '}
                        {props.failureMode === 'SAME_AS_SUCCESS'
                          ? props.providerRates[category]
                          : '0'}{' '}
                        + {assumption.otherVariableCostRmb}) ÷{' '}
                        {props.successProbabilityPercent}% ≈{' '}
                        {formatExactRmbReference(
                          calculation.kTheoryRmb,
                          locale,
                          2
                        )}{' '}
                        {t('RMB per million tokens')}
                      </p>
                      <p>
                        {t('Pricing cost basis')} ={' '}
                        {t('Cost per successful task')} + {t('Risk buffer')} ≈{' '}
                        {formatExactRmbReference(
                          calculation.kTheoryRmb,
                          locale,
                          2
                        )}{' '}
                        + {assumption.riskBufferRmb} ≈{' '}
                        {formatExactRmbReference(
                          calculation.kPricingRmb,
                          locale,
                          2
                        )}{' '}
                        {t('RMB per million tokens')}
                      </p>
                      <p>
                        {t('Published point issuance rate')}:{' '}
                        {props.pointsPerRmb} {t('points per RMB')}
                      </p>
                      <p>
                        {t('Break-even')} = {t('Pricing cost basis')} ×{' '}
                        {t('Published point issuance rate')} ·{' '}
                        {t('Rounded upward to integer points')} →{' '}
                        {calculation.breakEvenPoints}{' '}
                        {t('points per million tokens')}
                      </p>
                      <p>
                        {t('Target margin floor')} = ({t('Pricing cost basis')}{' '}
                        × {t('Published point issuance rate')}) ÷ (1 −{' '}
                        {props.targetMarginPercent}%) ·{' '}
                        {t('Rounded upward to integer points')} →{' '}
                        {calculation.targetMarginPoints}{' '}
                        {t('points per million tokens')}
                      </p>
                    </div>
                  </details>
                )}
              </div>
            )}
          </section>
        )
      })}
      {props.stage === 'price' &&
        priceAction === 'SET' &&
        props.currentRates &&
        props.onKeepCurrent &&
        Object.values(calculations).some(Boolean) && (
          <Button type='button' variant='outline' onClick={props.onKeepCurrent}>
            {t('Keep current rates')}
          </Button>
        )}
    </div>
  )
}

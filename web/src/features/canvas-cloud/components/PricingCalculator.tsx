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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { getCanvasPointIssuanceRates } from '../api'
import { simulatePricing, type SimulationInput } from '../pricing-simulation'
import { BusinessTerm } from './BusinessTerm'

function Field(props: {
  id: string
  label: ReactNode
  accessibleLabel: string
  value: string
  onChange: (value: string) => void
  unit: string
  disabled?: boolean
}) {
  return (
    <div className='space-y-1'>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        aria-label={props.accessibleLabel}
        inputMode='decimal'
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        aria-describedby={`${props.id}-unit`}
      />
      <div id={`${props.id}-unit`} className='text-muted-foreground text-xs'>
        {props.unit}
      </div>
    </div>
  )
}

function Result(props: { label: ReactNode; value: string; detail: string }) {
  return (
    <div className='bg-muted/35 min-w-0 rounded-lg border p-3'>
      <div className='text-muted-foreground text-xs font-medium'>
        {props.label}
      </div>
      <div className='mt-1 text-xl font-semibold tabular-nums'>
        {props.value}
      </div>
      <div className='text-muted-foreground mt-1 text-xs'>{props.detail}</div>
    </div>
  )
}

function businessDecimal(value: string, maximumFractionDigits = 2): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(numeric)
}

function verdictPresentation(
  verdict: 'BELOW_BREAK_EVEN' | 'BELOW_TARGET' | 'MEETS_TARGET'
) {
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

export function PricingCalculator() {
  const { t } = useTranslation()
  const rates = useQuery({
    queryKey: ['canvas-cloud', 'point-issuance-rates'],
    queryFn: getCanvasPointIssuanceRates,
  })
  const publishedRate = rates.data?.find((rate) => rate.status === 'PUBLISHED')
  const [input, setInput] = useState<SimulationInput>({
    successProbability: '0.900000',
    successfulTaskCostRmb: '2',
    failedUnrecoverableCostRmb: '0.5',
    otherVariableCostRmb: '0.1',
    riskBufferRmb: '0.2',
    pointsPerRmb: '50',
    actualCostEligible: false,
    actualCostRmb: '2.5',
    proposedPoints: '150',
  })
  useEffect(() => {
    if (!publishedRate) return
    setInput((current) => ({
      ...current,
      pointsPerRmb: String(Number(publishedRate.pointsPerRmb)),
    }))
  }, [publishedRate])
  const result = useMemo(() => {
    try {
      return { value: simulatePricing(input), error: false }
    } catch {
      return { value: null, error: true }
    }
  }, [input])
  const update = (key: keyof SimulationInput, value: string | boolean) =>
    setInput((current) => ({ ...current, [key]: value }))
  const verdict = result.value
    ? verdictPresentation(result.value.verdict)
    : null

  return (
    <div className='mx-auto w-full max-w-4xl space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Pricing calculation guide')}</CardTitle>
          <CardDescription>
            {t('Pricing calculation core purpose')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4 text-sm'>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            {[
              [
                '1',
                'Expected attempt cost',
                'Expected attempt cost explanation',
              ],
              [
                '2',
                'Cost per successful task',
                'Cost per successful task explanation',
              ],
              ['3', 'Pricing cost basis', 'Pricing cost basis explanation'],
              [
                '4',
                'Convert RMB cost to points',
                'Convert RMB cost explanation',
              ],
            ].map(([number, title, description]) => (
              <div key={number} className='rounded-xl border p-4'>
                <div className='text-primary text-xs font-semibold'>
                  {number}
                </div>
                <div className='mt-1 font-medium'>{t(title)}</div>
                <p className='text-muted-foreground mt-2 leading-6'>
                  {t(description)}
                </p>
              </div>
            ))}
          </div>
          <div className='bg-muted/50 space-y-1 rounded-lg border p-3 font-mono text-xs leading-6 sm:text-sm'>
            <div>{t('K_theory formula')}</div>
            <div>{t('K_pricing formula')}</div>
            <div>{t('Break-even formula')}</div>
            <div>{t('Target margin formula')}</div>
          </div>
          <div className='grid gap-3 lg:grid-cols-2'>
            <div className='rounded-xl border p-4'>
              <div className='font-medium'>{t('Actual cost eligibility')}</div>
              <p className='text-muted-foreground mt-2 leading-6'>
                {t('Actual cost eligibility explanation')}
              </p>
            </div>
            <div className='rounded-xl border p-4'>
              <div className='font-medium'>{t('Rounding and publication')}</div>
              <p className='text-muted-foreground mt-2 leading-6'>
                {t('Rounding and publication explanation')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Pricing simulator')}</CardTitle>
          <CardDescription>
            {t('Pricing simulator description')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          <form
            aria-label={t('Pricing simulator')}
            className='space-y-5'
            onSubmit={(event) => event.preventDefault()}
          >
            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
              <Field
                id='sim-q'
                label={
                  <BusinessTerm
                    kind='pricingField'
                    value='SUCCESS_PROBABILITY'
                  />
                }
                accessibleLabel={t('Success probability')}
                value={input.successProbability}
                onChange={(value) => update('successProbability', value)}
                unit={t('Decimal from 0 to 1')}
              />
              <Field
                id='sim-success'
                label={
                  <BusinessTerm kind='pricingField' value='SUCCESS_COST' />
                }
                accessibleLabel={t('Successful task cost')}
                value={input.successfulTaskCostRmb}
                onChange={(value) => update('successfulTaskCostRmb', value)}
                unit={t('RMB per successful chargeable result')}
              />
              <Field
                id='sim-failure'
                label={
                  <BusinessTerm kind='pricingField' value='FAILURE_COST' />
                }
                accessibleLabel={t('Failed unrecoverable cost')}
                value={input.failedUnrecoverableCostRmb}
                onChange={(value) =>
                  update('failedUnrecoverableCostRmb', value)
                }
                unit={t('RMB per attempt')}
              />
              <Field
                id='sim-other'
                label={<BusinessTerm kind='pricingField' value='OTHER_COST' />}
                accessibleLabel={t('Other variable cost')}
                value={input.otherVariableCostRmb}
                onChange={(value) => update('otherVariableCostRmb', value)}
                unit={t('RMB per attempt')}
              />
              <Field
                id='sim-buffer'
                label={<BusinessTerm kind='pricingField' value='RISK_BUFFER' />}
                accessibleLabel={t('Risk buffer')}
                value={input.riskBufferRmb}
                onChange={(value) => update('riskBufferRmb', value)}
                unit={t('RMB per successful chargeable result')}
                disabled={input.actualCostEligible}
              />
              <Field
                id='sim-rate'
                label={
                  <BusinessTerm kind='pricingField' value='ISSUANCE_RATE' />
                }
                accessibleLabel={t('Point issuance rate')}
                value={input.pointsPerRmb}
                onChange={(value) => update('pointsPerRmb', value)}
                unit={t('points per RMB, up to 2 decimals')}
              />
              <Field
                id='sim-actual'
                label={<BusinessTerm kind='pricingField' value='K_ACTUAL' />}
                accessibleLabel={t('K_actual')}
                value={input.actualCostRmb}
                onChange={(value) => update('actualCostRmb', value)}
                unit={t('RMB per successful chargeable result')}
                disabled={!input.actualCostEligible}
              />
              <Field
                id='sim-points'
                label={
                  <BusinessTerm kind='pricingField' value='PROPOSED_POINTS' />
                }
                accessibleLabel={t('Proposed price points')}
                value={input.proposedPoints}
                onChange={(value) => update('proposedPoints', value)}
                unit={t('Integer points')}
              />
            </div>
            <label className='flex cursor-pointer items-start gap-3 rounded-lg border p-3'>
              <input
                type='checkbox'
                className='mt-1 size-4'
                checked={input.actualCostEligible}
                onChange={(event) =>
                  update('actualCostEligible', event.target.checked)
                }
              />
              <span>
                <span className='block font-medium'>
                  <BusinessTerm kind='pricingField' value='ACTUAL_ELIGIBLE' />
                </span>
                <span className='text-muted-foreground block text-xs leading-5'>
                  {t('Use eligible actual cost explanation')}
                </span>
              </span>
            </label>
          </form>
          {result.error || !result.value ? (
            <div
              role='alert'
              className='border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm'
            >
              {t('Invalid simulation inputs')}
            </div>
          ) : (
            <>
              <div
                aria-live='polite'
                className='grid gap-3 sm:grid-cols-2 xl:grid-cols-5'
              >
                <Result
                  label={
                    <BusinessTerm
                      kind='pricingField'
                      value='EXPECTED_ATTEMPT_COST'
                    />
                  }
                  value={`${businessDecimal(result.value.expectedAttemptCostRmb)} ${t('RMB')}`}
                  detail={t('Before dividing by success probability')}
                />
                <Result
                  label={<BusinessTerm kind='pricingField' value='K_THEORY' />}
                  value={`${businessDecimal(result.value.kTheoryRmb)} ${t('RMB')}`}
                  detail={t('Cost per successful task')}
                />
                <Result
                  label={<BusinessTerm kind='pricingField' value='K_PRICING' />}
                  value={`${businessDecimal(result.value.kPricingRmb)} ${t('RMB')}`}
                  detail={t(
                    result.value.pricingBasis === 'ACTUAL'
                      ? 'Uses max theory and actual'
                      : 'Uses theory plus buffer'
                  )}
                />
                <Result
                  label={
                    <BusinessTerm kind='pricingField' value='BREAK_EVEN' />
                  }
                  value={`${result.value.breakEvenPoints} ${t('points')}`}
                  detail={t('Rounded upward to integer points')}
                />
                <Result
                  label={
                    <BusinessTerm
                      kind='pricingField'
                      value='TARGET_MARGIN_POINTS'
                    />
                  }
                  value={`${result.value.targetMarginPoints} ${t('points')}`}
                  detail={t('Rounded upward to integer points')}
                />
              </div>
              <div
                className={`rounded-lg border p-3 text-sm ${verdict?.className ?? ''}`}
              >
                {t(verdict?.message ?? 'Simulation meets target margin')}
              </div>
            </>
          )}
          <p className='text-muted-foreground text-xs leading-5'>
            {t('Simulation has no side effects')}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

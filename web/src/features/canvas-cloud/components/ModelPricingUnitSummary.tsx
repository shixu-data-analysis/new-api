/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toIntlLocale } from '@/i18n/languages'

import { billingUnitLabelKey } from '../lib/billing-unit-labels'
import { formatExactRmbReference } from '../number-format'
import type { CanvasBillingUnit, CanvasModelPricingModel } from '../types'

const FIXED_UNIT_HINT_KEYS: Partial<Record<CanvasBillingUnit, string>> = {
  REQUEST: 'Image models are always billed per request',
  MILLION_TOKENS: 'Text models are always billed per million tokens',
}

/** The line above the pricing table: billing unit, pricing rate snapshot and unit notices. */
export function ModelPricingUnitSummary(props: {
  model: CanvasModelPricingModel
  billingUnit: CanvasBillingUnit
  unitChosen: boolean
  unitChange: boolean
  pointsPerRmb: string | undefined
  onUnitChange: (unit: CanvasBillingUnit) => void
}) {
  const { t, i18n } = useTranslation()
  const { model } = props
  const fixed =
    model.allowedBillingUnits.length === 1 && model.billingUnitState !== 'MIXED'
  const unitLabel = t(billingUnitLabelKey(props.billingUnit))
  const hint = FIXED_UNIT_HINT_KEYS[props.billingUnit]
  const rate = props.pointsPerRmb ? (
    <span>
      {t('{{label}}: ', { label: t('Pricing rate snapshot') })}
      {formatExactRmbReference(
        props.pointsPerRmb,
        toIntlLocale(i18n.resolvedLanguage ?? i18n.language),
        4
      )}{' '}
      {t('points per RMB')}
    </span>
  ) : null
  let notice: string | null = null
  if (model.billingUnitState === 'MIXED') {
    notice = `${t(
      'Published pricing contains mixed billing units. Choose one unit and re-enter every scope and price plan before publishing.'
    )} ${model.publishedBillingUnits
      .map((unit) => t(billingUnitLabelKey(unit)))
      .join(' · ')}`
  } else if (props.unitChange) {
    notice = t(
      'The billing unit was changed. Re-enter every pricing scope and price plan before publishing.'
    )
  }
  return (
    <div className='text-muted-foreground flex flex-col gap-2 text-sm'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
        {fixed ? (
          <span>
            {t('{{label}}: ', { label: t('Billing unit') })}
            {hint
              ? t('{{label}} ({{detail}})', {
                  label: unitLabel,
                  detail: t(hint),
                })
              : unitLabel}
          </span>
        ) : (
          <span className='inline-flex items-center gap-2'>
            <Label htmlFor='model-pricing-unit' className='text-foreground'>
              {t('Billing unit')}
            </Label>
            <Select
              value={props.unitChosen ? props.billingUnit : ''}
              onValueChange={(value) =>
                props.onUnitChange(value as CanvasBillingUnit)
              }
            >
              <SelectTrigger id='model-pricing-unit' className='h-8 w-36'>
                <SelectValue placeholder={t('Billing unit')}>
                  {props.unitChosen ? unitLabel : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {model.allowedBillingUnits.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {t(billingUnitLabelKey(unit))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </span>
        )}
        {rate}
      </div>
      {props.billingUnit === 'REQUEST' && model.fixedRequestBatchSize ? (
        <p role='note'>
          {t(
            'This model always returns {{count}} images per request. Enter the price of one whole request ({{count}} images), not the price of one image.',
            { count: model.fixedRequestBatchSize }
          )}
        </p>
      ) : null}
      {notice ? (
        <p
          role={model.billingUnitState === 'MIXED' ? 'alert' : 'status'}
          className='text-foreground rounded-lg border border-amber-500/40 bg-amber-500/10 p-3'
        >
          {notice}
        </p>
      ) : null}
    </div>
  )
}

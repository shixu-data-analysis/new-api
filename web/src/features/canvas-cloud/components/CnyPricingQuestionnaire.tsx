/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import type {
  CanvasBillingUnit,
  CanvasModelPricingCnyValue,
  CanvasTokenCategory,
} from '../types'

export type CnyPricingDraft = {
  provider: Record<string, string>
  customer: Record<string, string>
}

export type CnyPricingErrors = Partial<Record<string, string>>

function categoryValues(
  value: CanvasModelPricingCnyValue | undefined,
  category?: CanvasTokenCategory
): string | undefined {
  if (typeof value === 'string') return value
  return category ? value?.[category] : undefined
}

export function CnyPricingQuestionnaire(props: {
  idPrefix: string
  billingUnit: CanvasBillingUnit
  categories: CanvasTokenCategory[]
  draft: CnyPricingDraft
  errors: CnyPricingErrors
  calculation?: {
    providerSuccessPriceCny: CanvasModelPricingCnyValue
    customerPriceCny: CanvasModelPricingCnyValue
    actualMarginRate: CanvasModelPricingCnyValue
    fullCostCny: CanvasModelPricingCnyValue
    canPublish: boolean
  }
  points?: CanvasModelPricingCnyValue
  pointsPerRmb?: string
  onChange: (
    side: 'provider' | 'customer',
    field: CanvasTokenCategory | 'scalar',
    value: string
  ) => void
  onBlur: (side: 'provider' | 'customer', field: string) => void
}) {
  const { t } = useTranslation()
  const categories =
    props.billingUnit === 'MILLION_TOKENS'
      ? props.categories
      : ([undefined] as const)
  let unit = t('per million tokens')
  if (props.billingUnit === 'REQUEST') unit = t('per request')
  if (props.billingUnit === 'SECOND') unit = t('per second')

  return (
    <div className='space-y-6'>
      {categories.map((category) => {
        const field = category ?? 'scalar'
        const suffix = category ? `-${category}` : ''
        const providerId = `${props.idPrefix}-provider${suffix}`
        const customerId = `${props.idPrefix}-customer${suffix}`
        const label = category ? t(category) : null
        const providerError = props.errors[`provider:${field}`]
        const customerError = props.errors[`customer:${field}`]
        const calculation = props.calculation
        const points = categoryValues(props.points, category)
        const margin = categoryValues(calculation?.actualMarginRate, category)
        const cost = categoryValues(calculation?.fullCostCny, category)
        return (
          <section
            key={field}
            className='border-t pt-6 first:border-t-0 first:pt-0'
          >
            {label ? <h3 className='font-medium'>{label}</h3> : null}
            <div
              className={
                props.billingUnit === 'MILLION_TOKENS'
                  ? 'mt-4 grid gap-4 sm:grid-cols-2'
                  : 'mt-4 grid max-w-xs gap-4'
              }
            >
              <div className='space-y-1'>
                <Label htmlFor={providerId}>
                  {t('Provider successful price')} *
                </Label>
                <Input
                  id={providerId}
                  inputMode='decimal'
                  value={props.draft.provider[field] ?? ''}
                  aria-required='true'
                  aria-invalid={Boolean(providerError)}
                  aria-describedby={`${providerId}-unit${providerError ? ` ${providerId}-error` : ''}`}
                  onBlur={() => props.onBlur('provider', field)}
                  onChange={(event) =>
                    props.onChange('provider', field, event.target.value)
                  }
                />
                <p
                  id={`${providerId}-unit`}
                  className='text-muted-foreground text-xs'
                >
                  {t('RMB')} / {unit}
                </p>
                {providerError ? (
                  <p
                    id={`${providerId}-error`}
                    role='alert'
                    className='text-destructive text-xs'
                  >
                    {providerError}
                  </p>
                ) : null}
              </div>
              <div className='space-y-1'>
                <Label htmlFor={customerId}>{t('Customer CNY price')} *</Label>
                <Input
                  id={customerId}
                  inputMode='decimal'
                  value={props.draft.customer[field] ?? ''}
                  aria-required='true'
                  aria-invalid={Boolean(customerError)}
                  aria-describedby={`${customerId}-unit${customerError ? ` ${customerId}-error` : ''}`}
                  onBlur={() => props.onBlur('customer', field)}
                  onChange={(event) =>
                    props.onChange('customer', field, event.target.value)
                  }
                />
                <p
                  id={`${customerId}-unit`}
                  className='text-muted-foreground text-xs'
                >
                  {t('RMB')} / {unit}
                </p>
                {customerError ? (
                  <p
                    id={`${customerId}-error`}
                    role='alert'
                    className='text-destructive text-xs'
                  >
                    {customerError}
                  </p>
                ) : null}
              </div>
            </div>
            {calculation ? (
              <dl className='mt-4 grid gap-2 text-sm sm:grid-cols-2'>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('Calculated customer points')}
                  </dt>
                  <dd className='tabular-nums'>
                    {points ?? '—'} {t('points')} / {unit}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('Actual margin')}
                  </dt>
                  <dd className='tabular-nums'>
                    {margin === undefined
                      ? '—'
                      : `${(Number(margin) * 100).toFixed(2)}%`}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>{t('Full cost')}</dt>
                  <dd className='tabular-nums'>
                    {cost ?? '—'} {t('RMB')} / {unit}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('Publication result')}
                  </dt>
                  <dd>
                    {calculation.canPublish
                      ? t('Can publish')
                      : t('Cannot publish')}
                  </dd>
                </div>
              </dl>
            ) : null}
          </section>
        )
      })}
      {props.pointsPerRmb ? (
        <p className='text-muted-foreground text-sm'>
          {t('Pricing rate snapshot')}: {props.pointsPerRmb}{' '}
          {t('points per RMB')}
        </p>
      ) : null}
    </div>
  )
}

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

import { formatBusinessNumber } from '../number-format'
import type {
  CanvasBillingUnit,
  CanvasModelPricingCnyValue,
  CanvasTokenCategory,
} from '../types'

export type CnyPricingDraft = {
  provider: Record<string, string>
  inviter: Record<string, string>
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
    inviterDisplayPriceCny?: CanvasModelPricingCnyValue
    customerPriceCny: CanvasModelPricingCnyValue
    inviterMinusProviderCny?: CanvasModelPricingCnyValue
    customerMinusInviterCny?: CanvasModelPricingCnyValue
  }
  points?: CanvasModelPricingCnyValue
  pointsPerRmb?: string
  onChange: (
    side: 'provider' | 'inviter' | 'customer',
    field: CanvasTokenCategory | 'scalar',
    value: string
  ) => void
  onBlur: (side: 'provider' | 'inviter' | 'customer', field: string) => void
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
        const inviterId = `${props.idPrefix}-inviter${suffix}`
        const customerId = `${props.idPrefix}-customer${suffix}`
        const label = category ? t(category) : null
        const providerError = props.errors[`provider:${field}`]
        const inviterError = props.errors[`inviter:${field}`]
        const customerError = props.errors[`customer:${field}`]
        const calculation = props.calculation
        const points = categoryValues(props.points, category)
        const inviterDifference = categoryValues(
          calculation?.inviterMinusProviderCny,
          category
        )
        const customerDifference = categoryValues(
          calculation?.customerMinusInviterCny,
          category
        )
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
                <Label htmlFor={providerId}>{t('Provider cost')} *</Label>
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
                <Label htmlFor={inviterId}>
                  {t('Inviter (agent) display price')} *
                </Label>
                <Input
                  id={inviterId}
                  inputMode='decimal'
                  value={props.draft.inviter[field] ?? ''}
                  aria-required='true'
                  aria-invalid={Boolean(inviterError)}
                  aria-describedby={`${inviterId}-unit${inviterError ? ` ${inviterId}-error` : ''}`}
                  onBlur={() => props.onBlur('inviter', field)}
                  onChange={(event) =>
                    props.onChange('inviter', field, event.target.value)
                  }
                />
                <p
                  id={`${inviterId}-unit`}
                  className='text-muted-foreground text-xs'
                >
                  {t('RMB')} / {unit}
                </p>
                {inviterError ? (
                  <p
                    id={`${inviterId}-error`}
                    role='alert'
                    className='text-destructive text-xs'
                  >
                    {inviterError}
                  </p>
                ) : null}
              </div>
              <div className='space-y-1'>
                <Label htmlFor={customerId}>{t('Customer sale price')} *</Label>
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
              <dl className='mt-4 grid gap-2 text-sm'>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('Converted customer points')}
                  </dt>
                  <dd className='tabular-nums'>
                    {points ?? '—'} {t('points')} / {unit}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('Inviter display price minus provider cost')}
                  </dt>
                  <dd className='tabular-nums'>
                    {inviterDifference ?? '—'} {t('RMB')} / {unit}
                  </dd>
                </div>
                <div>
                  <dt className='text-muted-foreground'>
                    {t('Customer sale price minus inviter display price')}
                  </dt>
                  <dd className='tabular-nums'>
                    {customerDifference ?? '—'} {t('RMB')} / {unit}
                  </dd>
                </div>
              </dl>
            ) : null}
          </section>
        )
      })}
      {props.pointsPerRmb ? (
        <p className='text-muted-foreground text-sm'>
          {t('Pricing rate snapshot')}:{' '}
          {formatBusinessNumber(props.pointsPerRmb, 8)} {t('points per RMB')}
        </p>
      ) : null}
    </div>
  )
}

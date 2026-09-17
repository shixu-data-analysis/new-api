/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { toIntlLocale } from '@/i18n/languages'

import { pricingScopeLabel } from '../pricing-scope-label'
import type { CanvasModelCatalogPlanPrice } from '../types'

const reasonKeys: Record<string, string> = {
  CURRENT_PRICE: 'Current published price',
  MATCHED_PUBLISHED_PRICE:
    'Matching published price from the previous model version',
  NEW_MODEL: 'New model has no previous price',
  CHANNEL_CHANGED: 'Channel changed',
  PROVIDER_CHANGED: 'Provider changed',
  NEW_SPECIFICATION: 'New specification has no matching price',
  BILLING_DIMENSIONS_CHANGED: 'Billing dimensions changed',
  TOKEN_CATEGORIES_CHANGED: 'Token categories changed',
  BILLING_UNIT_CHANGED: 'Billing unit changed',
  UNPRICED_SOURCE: 'Previous specification was not priced',
  SCHEDULED_PRICE_CONFLICT: 'Scheduled price cannot be carried forward safely',
  PROMOTION_CONFLICT: 'Limited-time promotion cannot be carried forward safely',
  AMBIGUOUS_SOURCE: 'Published price source is ambiguous',
}

export function CatalogPricingPreview(props: {
  pricing: CanvasModelCatalogPlanPrice[]
}) {
  const { t, i18n } = useTranslation()
  if (props.pricing.length === 0) {
    return (
      <span className='text-muted-foreground'>
        {t('No published price plans')}
      </span>
    )
  }

  return (
    <div className='space-y-3'>
      {props.pricing.map((price) => {
        const hasAmount =
          price.billingUnit === 'MILLION_TOKENS'
            ? Boolean(price.tokenRates?.input && price.tokenRates.output)
            : price.points !== null
        const hasPrice =
          price.status === 'REUSE' && price.billingUnit !== null && hasAmount
        const amount =
          price.billingUnit === 'MILLION_TOKENS'
            ? (['input', 'output', 'cacheRead', 'cacheWrite'] as const)
                .filter(
                  (category) => price.tokenRates?.[category] !== undefined
                )
                .map(
                  (category) =>
                    `${t(category)}: ${price.tokenRates?.[category]}`
                )
                .join(' · ')
            : price.points
        const unit = price.billingUnit ? t(price.billingUnit) : null
        let reason = t('Price status needs review')
        if (hasAmount || price.status === 'NEEDS_PRICING') {
          const reasonKey = reasonKeys[price.reasonCode]
          if (reasonKey) reason = t(reasonKey)
        }
        const effectiveAt = price.effectiveAt
          ? new Intl.DateTimeFormat(toIntlLocale(i18n.language), {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(price.effectiveAt))
          : null
        return (
          <div
            key={`${price.combinationKey}:${price.priceGroupId}`}
            className='min-w-0 rounded-md border p-2 text-sm [overflow-wrap:anywhere]'
          >
            <div className='font-medium'>
              {pricingScopeLabel(
                { key: price.combinationKey, parameters: price.parameters },
                t
              )}
              {' · '}
              {price.priceGroupName || price.priceGroupCode || t('Price plan')}
            </div>
            <div className='mt-1 flex flex-wrap items-center gap-1.5'>
              <Badge variant={hasPrice ? 'secondary' : 'outline'}>
                {hasPrice ? t('Reuse existing price') : t('Needs pricing')}
              </Badge>
              {hasPrice && amount && unit && (
                <span className='tabular-nums'>
                  {amount} {t('points')} / {unit}
                </span>
              )}
            </div>
            <div className='text-muted-foreground mt-1 text-xs'>{reason}</div>
            {hasPrice && price.sourcePriceVersionId && (
              <div className='text-muted-foreground mt-1 text-xs'>
                {price.sourceModelVersion !== null && (
                  <span>
                    {t('Source model version')}: v{price.sourceModelVersion}{' '}
                    ·{' '}
                  </span>
                )}
                {t('Source price version')}: {price.sourcePriceVersionId}
                {effectiveAt && (
                  <span>
                    {' '}
                    · {t('Effective at')}: {effectiveAt}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

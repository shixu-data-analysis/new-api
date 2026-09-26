/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'

import { formatExactRmbReference } from '../point-conversion-types'
import { pricingScopeLabel } from '../pricing-scope-label'
import type { CanvasAgentModelPrice, CanvasBillingUnit } from '../types'

const billingUnitKeys: Record<CanvasBillingUnit, string> = {
  REQUEST: 'Per request',
  SECOND: 'Per second',
  MILLION_TOKENS: 'Per million tokens',
}
const tokenCategoryKeys: Record<string, string> = {
  input: 'Input',
  output: 'Output',
  cacheRead: 'Cache read',
  cacheWrite: 'Cache write',
}

export function AgentModelPriceList(props: {
  models: CanvasAgentModelPrice[]
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const tokenLabel = (category: string) =>
    t(tokenCategoryKeys[category] ?? category)
  if (props.models.length === 0) {
    return <p>{t('No current model prices')}</p>
  }
  const modelPrice = (
    value: CanvasAgentModelPrice['priceGroups'][number]['prices'][number]['modelPriceCny']
  ) => {
    if (value === null) return '—'
    if (typeof value === 'string') {
      return `¥${formatExactRmbReference(value, locale)}`
    }
    return Object.entries(value)
      .map(
        ([category, amount]) =>
          `${tokenLabel(category)}: ¥${formatExactRmbReference(amount, locale)}`
      )
      .join(' · ')
  }

  return props.models.map((model) => (
    <div key={model.modelKey} className='space-y-2 rounded border p-3'>
      <div>
        <strong>{model.effectiveDisplayName}</strong>{' '}
        <span className='text-muted-foreground text-sm'>
          {t(model.capability)}
        </span>
      </div>
      {model.description ? (
        <p className='text-muted-foreground text-sm'>{model.description}</p>
      ) : null}
      {model.tags.length ? (
        <p className='text-muted-foreground text-sm'>
          {model.tags.map((tag) => tag.name).join(' · ')}
        </p>
      ) : null}
      {model.priceGroups.map((group) => (
        <div key={group.priceGroupId} className='text-sm'>
          <strong>{group.priceGroupName}</strong>
          {group.prices.map((price) => (
            <div
              key={`${price.combinationKey}:${price.billingUnit}`}
              className='grid gap-2 border-t py-2 sm:grid-cols-3'
            >
              <span>
                {pricingScopeLabel(
                  { key: price.combinationKey, parameters: price.parameters },
                  t
                )}{' '}
                · {t(billingUnitKeys[price.billingUnit])}
              </span>
              <span>
                {t('Customer points')}:{' '}
                {price.customerTokenRates
                  ? Object.entries(price.customerTokenRates)
                      .map(([key, value]) => `${tokenLabel(key)}: ${value}`)
                      .join(' · ')
                  : price.customerPoints}
              </span>
              <span>
                {t('Model price')}: {modelPrice(price.modelPriceCny)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  ))
}

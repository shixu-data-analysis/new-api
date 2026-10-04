/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, expect, it } from 'vitest'
import zh from '@/i18n/locales/zh.json'
import { CatalogPricingPreview } from '../CatalogPricingPreview'

afterEach(async () => {
  await i18next.changeLanguage('en')
})

it('names a blocking scheduled cost change separately from a scheduled price', async () => {
  i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
  await i18next.changeLanguage('zh')
  const conflict = {
    combinationKey: 'quality=480P',
    label: '480P',
    parameters: { quality: '480P' },
    billingDimensions: { billingUnit: 'REQUEST' },
    priceGroupId: 'standard',
    priceGroupCode: 'standard',
    priceGroupName: 'Standard',
    status: 'NEEDS_PRICING' as const,
    billingUnit: null,
    points: null,
    tokenRates: null,
    sourcePriceVersionId: null,
    sourceProviderRateVersionId: null,
    sourceModelVersion: null,
    effectiveAt: null,
  }
  render(
    <CatalogPricingPreview
      pricing={[
        { ...conflict, reasonCode: 'SCHEDULED_COST_CONFLICT' },
        {
          ...conflict,
          priceGroupId: 'premium',
          reasonCode: 'SCHEDULED_PRICE_CONFLICT',
        },
      ]}
    />
  )
  expect(screen.getByText('预约成本调整无法安全沿用')).toBeVisible()
  expect(screen.getByText('预约价格无法安全沿用')).toBeVisible()
})

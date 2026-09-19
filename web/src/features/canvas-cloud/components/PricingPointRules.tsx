/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { PointIssuanceRateSettings } from './PointIssuanceRateSettings'
import { PriceGroupManagement } from './PriceGroupManagement'
import { TaskPolicySettings } from './TaskPolicySettings'

export function PricingPointRules() {
  const { t } = useTranslation()
  return (
    <div className='min-w-0 space-y-6'>
      <section aria-label={t('Price plans')} className='min-w-0'>
        <PriceGroupManagement />
      </section>
      <section
        aria-labelledby='recharge-rules-heading'
        className='min-w-0 space-y-3'
      >
        <h2 id='recharge-rules-heading' className='text-lg font-semibold'>
          {t('Recharge rules')}
        </h2>
        <PointIssuanceRateSettings />
        <TaskPolicySettings section='recharge' />
      </section>
      <section aria-label={t('Quote and release rules')} className='min-w-0'>
        <TaskPolicySettings section='release' />
      </section>
    </div>
  )
}

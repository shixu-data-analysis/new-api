/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { AgentSettlementPolicySettings } from './AgentSettlementPolicySettings'
import { PointIssuanceRateSettings } from './PointIssuanceRateSettings'
import { PriceGroupManagement } from './PriceGroupManagement'
import { TaskPolicySettings } from './TaskPolicySettings'

export function PricingPointRules() {
  const { t } = useTranslation()
  return (
    <div className='min-w-0 space-y-6'>
      {/* One card per rule category, in business order; each card keeps its own publication flow. */}
      <section aria-label={t('Price plans')} className='min-w-0'>
        <PriceGroupManagement />
      </section>
      <section aria-label={t('Point issuance rate')} className='min-w-0'>
        <PointIssuanceRateSettings />
      </section>
      <section aria-label={t('Point validity')} className='min-w-0'>
        <TaskPolicySettings section='points' />
      </section>
      <section aria-label={t('Quote rules')} className='min-w-0'>
        <TaskPolicySettings section='quote' />
      </section>
      <section aria-label={t('Agent settlement rules')} className='min-w-0'>
        <AgentSettlementPolicySettings />
      </section>
    </div>
  )
}

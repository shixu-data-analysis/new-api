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

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'

import { formatExactPointQuantity } from '../number-format'
import type { CanvasAgentCustomerSummary } from '../types'

export function OverviewStat(props: { label: ReactNode; value: ReactNode }) {
  return (
    <div className='min-w-0'>
      <p className='text-muted-foreground text-sm'>{props.label}</p>
      <p className='text-lg font-semibold tabular-nums'>{props.value}</p>
    </div>
  )
}

/**
 * The overview of an agent's customers, shared by the agent's 我的客户 and the administrator's agent statistics. The
 * administrator adds the earnings as a second group and an action in the header.
 */
export function AgentCustomerOverview(props: {
  summary: CanvasAgentCustomerSummary
  action?: ReactNode
  earnings?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const count = (value: string | number) =>
    formatExactPointQuantity(String(value), locale)
  const customers = (
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
      <OverviewStat
        label={t('Activated customers')}
        value={count(props.summary.activatedCustomers)}
      />
      <OverviewStat
        label={t('Customers with consumption')}
        value={count(props.summary.customersWithConsumption)}
      />
      <OverviewStat
        label={t('Total recharged points')}
        value={count(props.summary.rechargedPoints)}
      />
      <OverviewStat
        label={t('Total consumed points')}
        value={count(props.summary.consumedPoints)}
      />
    </div>
  )
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between gap-3'>
        <CardTitle>{t('Summary')}</CardTitle>
        {props.action}
      </CardHeader>
      <CardContent className='grid gap-4'>
        {props.earnings ? (
          <>
            <section className='space-y-2' aria-label={t('Customer')}>
              <p className='text-muted-foreground text-xs font-medium'>
                {t('Customer')}
              </p>
              {customers}
            </section>
            <section className='space-y-2' aria-label={t('Earnings')}>
              <p className='text-muted-foreground text-xs font-medium'>
                {t('Earnings')}
              </p>
              <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
                {props.earnings}
              </div>
            </section>
          </>
        ) : (
          customers
        )}
      </CardContent>
    </Card>
  )
}

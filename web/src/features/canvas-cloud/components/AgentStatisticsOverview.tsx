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
import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'

import {
  agentEarningsQueryKeys,
  getAdminAgentEarningsSummary,
} from '../agent-earnings-api'
import {
  formatRmbMinor,
  formatRmbYuan,
  settlementMonths,
} from '../agent-earnings-format'
import {
  formatExactPointQuantity,
  formatExactRmbReference,
} from '../number-format'
import type { CanvasAdminAgentSummary } from '../types'
import { BusinessTerm } from './BusinessTerm'

function Stat(props: { label: ReactNode; value: ReactNode }) {
  return (
    <div className='min-w-0'>
      <p className='text-muted-foreground text-sm'>{props.label}</p>
      <p className='text-lg font-semibold tabular-nums'>{props.value}</p>
    </div>
  )
}

/**
 * Customer details → agent statistics: customers and consumption on the first row, money on the second (the agent display
 * amount and the earnings), with a link to the agent's statements and withdrawals.
 */
export function AgentStatisticsOverview(props: {
  agentPrincipalId: string
  summary: CanvasAdminAgentSummary
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const navigate = useNavigate()
  const earnings = useQuery({
    queryKey: [
      ...agentEarningsQueryKeys.all,
      'admin-summary',
      props.agentPrincipalId,
    ],
    queryFn: ({ signal }) =>
      getAdminAgentEarningsSummary(props.agentPrincipalId, signal),
  })
  const count = (value: string | number) =>
    formatExactPointQuantity(String(value), locale)
  const summary = props.summary
  // The amount is null exactly when it is incomplete, so the hint follows the flag, not the amount.
  const displayAmount = (
    <>
      {summary.modelUsageAmount === null
        ? '—'
        : `¥${formatExactRmbReference(summary.modelUsageAmount, locale)}`}
      {summary.amountIncomplete ? (
        <span className='text-muted-foreground ms-2 text-sm font-normal'>
          {t('Amount incomplete')}
        </span>
      ) : null}
    </>
  )
  const monthName = earnings.data
    ? new Intl.DateTimeFormat(locale, {
        month: 'long',
        timeZone: 'UTC',
      }).format(
        Date.UTC(2000, settlementMonths(earnings.data.periodMonth).month - 1, 1)
      )
    : ''
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between gap-3'>
        <CardTitle>{t('Overview')}</CardTitle>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() =>
            void navigate({
              to: '/canvas-cloud/invitations',
              search: {
                tab: 'statements',
                principalId: props.agentPrincipalId,
              },
            })
          }
        >
          {t('View statements and withdrawal requests')}
        </Button>
      </CardHeader>
      <CardContent className='grid gap-4'>
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <Stat
            label={t('Activated customers')}
            value={count(summary.activatedCustomers)}
          />
          <Stat
            label={t('Customers with successful tasks')}
            value={count(summary.customersWithSuccessfulTasks)}
          />
          <Stat
            label={t('Successful tasks')}
            value={count(summary.successfulTasks)}
          />
          <Stat
            label={t('Consumed points')}
            value={count(summary.settledPoints)}
          />
        </div>
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <Stat
            label={
              <BusinessTerm
                kind='dashboardMetric'
                value='AGENT_DISPLAY_AMOUNT'
              />
            }
            value={displayAmount}
          />
          {earnings.data ? (
            <>
              <Stat
                label={t('{{month}} earnings (unsettled)', {
                  month: monthName,
                })}
                value={formatRmbYuan(earnings.data.unsettledAmount, locale)}
              />
              <Stat
                label={t('Available balance')}
                value={formatRmbMinor(earnings.data.availableMinor, locale)}
              />
              <Stat
                label={t('Total paid out')}
                value={formatRmbMinor(earnings.data.paidMinor, locale)}
              />
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

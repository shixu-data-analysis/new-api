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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
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
import type { CanvasAgentCustomerSummary } from '../types'
import { AgentCustomerOverview, OverviewStat } from './AgentCustomerOverview'

/**
 * Customer details → agent statistics: the agent's customer overview, as the agent sees it, plus the earnings and a link
 * to the agent's statements and withdrawals.
 */
export function AgentStatisticsOverview(props: {
  agentPrincipalId: string
  summary: CanvasAgentCustomerSummary
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
  const monthName = earnings.data
    ? new Intl.DateTimeFormat(locale, {
        month: 'long',
        timeZone: 'UTC',
      }).format(
        Date.UTC(2000, settlementMonths(earnings.data.periodMonth).month - 1, 1)
      )
    : ''
  return (
    <AgentCustomerOverview
      summary={props.summary}
      action={
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
      }
      earnings={
        earnings.data ? (
          <>
            <OverviewStat
              label={t('{{month}} earnings (unsettled)', { month: monthName })}
              value={formatRmbYuan(earnings.data.unsettledAmount, locale)}
            />
            <OverviewStat
              label={t('Available balance')}
              value={formatRmbMinor(earnings.data.availableMinor, locale)}
            />
            <OverviewStat
              label={t('Total paid out')}
              value={formatRmbMinor(earnings.data.paidMinor, locale)}
            />
          </>
        ) : (
          <span className='text-muted-foreground text-sm'>—</span>
        )
      }
    />
  )
}

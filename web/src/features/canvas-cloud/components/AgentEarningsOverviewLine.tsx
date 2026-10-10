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

/** Customer details → agent statistics: the agent's earnings at a glance, with a link to its statements and withdrawals. */
export function AgentEarningsOverviewLine(props: { agentPrincipalId: string }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const navigate = useNavigate()
  const summary = useQuery({
    queryKey: [
      ...agentEarningsQueryKeys.all,
      'admin-summary',
      props.agentPrincipalId,
    ],
    queryFn: ({ signal }) =>
      getAdminAgentEarningsSummary(props.agentPrincipalId, signal),
  })
  if (!summary.data) return null
  const monthName = new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'UTC',
  }).format(
    Date.UTC(2000, settlementMonths(summary.data.periodMonth).month - 1, 1)
  )
  return (
    <section className='space-y-2'>
      <h3 className='font-semibold'>{t('Earnings overview')}</h3>
      <div className='flex flex-wrap items-center gap-x-6 gap-y-2 rounded border p-3 text-sm'>
        <span>
          {t('{{month}} earnings (unsettled)', { month: monthName })}:{' '}
          <strong className='tabular-nums'>
            {formatRmbYuan(summary.data.unsettledAmount, locale)}
          </strong>
        </span>
        <span>
          {t('Available balance')}:{' '}
          <strong className='tabular-nums'>
            {formatRmbMinor(summary.data.availableMinor, locale)}
          </strong>
        </span>
        <span>
          {t('Total paid out')}:{' '}
          <strong className='tabular-nums'>
            {formatRmbMinor(summary.data.paidMinor, locale)}
          </strong>
        </span>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='ms-auto'
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
      </div>
    </section>
  )
}

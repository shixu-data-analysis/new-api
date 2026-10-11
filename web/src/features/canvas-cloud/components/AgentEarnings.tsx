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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { NavBadge } from '@/components/layout/components/nav-group'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { toIntlLocale } from '@/i18n/languages'

import {
  agentEarningsQueryKeys,
  getAgentEarningsSummary,
  getAgentUnreadWithdrawalCount,
  markAgentWithdrawalsSeen,
} from '../agent-earnings-api'
import {
  formatBasisPointsPercent,
  formatRmbMinor,
  formatRmbYuan,
  settlementMonths,
} from '../agent-earnings-format'
import type { AgentEarningsSummary } from '../agent-earnings-types'
import { AgentPaymentQrCard } from './AgentPaymentQrCard'
import { AgentStatementTable } from './AgentStatementTable'
import { AgentWithdrawalApplyCard } from './AgentWithdrawalApplyCard'
import { AgentWithdrawalTable } from './AgentWithdrawalTable'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'

/** "How are earnings calculated?" — no pricing method or provider cost; the ratio and the ¥4 it yields follow the current setting. */
function EarningsGuide(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  expiryShareRateBasisPoints: number
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const rate = formatBasisPointsPercent(props.expiryShareRateBasisPoints)
  const share = formatRmbMinor(
    (1000n * BigInt(props.expiryShareRateBasisPoints) * 2n + 10_000n) / 20_000n,
    locale
  )
  const items: Array<[string, string]> = [
    [
      t('Each time'),
      t(
        'Each time a customer generates successfully, you earn = what the customer actually paid − the model fee. The model fee uses the model price in "My customers → Current model prices".'
      ),
    ],
    [
      t('What the customer paid'),
      t(
        'It follows the price the customer paid when recharging. For example, a customer who pays ¥100 for 10,000 points pays ¥0.01 per point.'
      ),
    ],
    [
      t('Bonus points do not count'),
      t('The part a customer pays with bonus points earns nothing.'),
    ],
    [
      t('Special prices'),
      t(
        'Earnings follow what the customer actually paid. If that is less than the model fee, this time earns 0 and nothing is deducted.'
      ),
    ],
    [
      t('Expired-points share'),
      t(
        "When a customer's paid points expire unused, you receive {{rate}} of what those points cost, counted in the month they expire. Expired bonus points share nothing.",
        { rate }
      ),
    ],
    [
      t('Monthly settlement'),
      t(
        "On the 1st of each month, last month's consumption earnings and expiry share are added up, settled and added to the available balance."
      ),
    ],
    [
      t('Example'),
      t(
        'A customer generates once with paid points and is charged 120 points. At recharge 1 point = ¥0.01, so the customer paid ¥1.2. With a model price of ¥0.8 you earn ¥1.2 − ¥0.8 = ¥0.4. If half of the 120 points were bonus points, you earn ¥0.2. The customer also has 1,000 paid points that expired unused; they cost ¥10, so you get ¥10 × {{rate}} = {{share}}.',
        { rate, share }
      ),
    ],
  ]
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('How are earnings calculated?')}
      contentClassName='sm:max-w-xl'
      contentHeight='auto'
    >
      <dl className='grid gap-3 text-sm'>
        {items.map(([term, text]) => (
          <div key={term} className='grid gap-0.5'>
            <dt className='font-medium'>{term}</dt>
            <dd className='text-muted-foreground'>{text}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  )
}

function EarningsOverview(props: { summary: AgentEarningsSummary }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const [guideOpen, setGuideOpen] = useState(false)
  const months = settlementMonths(props.summary.periodMonth)
  // Written as a month ("October") and a date ("November 1"), never as "this month".
  const monthName = new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone: 'UTC',
  }).format(Date.UTC(2000, months.month - 1, 1))
  const settleDate = months.nextYear
    ? t('January 1 of next year')
    : new Intl.DateTimeFormat(locale, {
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(Date.UTC(2000, months.nextMonth - 1, 1))
  const stats: Array<[string, string]> = [
    [
      t('{{month}} earnings (unsettled)', { month: monthName }),
      formatRmbYuan(props.summary.unsettledAmount, locale),
    ],
    [
      t('Available balance'),
      formatRmbMinor(props.summary.availableMinor, locale),
    ],
    [t('Total paid out'), formatRmbMinor(props.summary.paidMinor, locale)],
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Earnings overview')}</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-4'>
        <div className='grid gap-4 sm:grid-cols-3'>
          {stats.map(([label, value]) => (
            <div key={label}>
              <p className='text-muted-foreground text-sm'>{label}</p>
              <p className='text-2xl font-semibold tabular-nums'>{value}</p>
            </div>
          ))}
        </div>
        {/* A flex row keeps the icon link centered on the text; an inline-flex button would sit on the icon's bottom edge. */}
        <p className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
          <span>
            {props.summary.status === 'DISABLED'
              ? t(
                  'The agent qualification is disabled: nothing is earned while disabled, nor added after a restore. Earlier earnings settle as usual; each withdrawal takes the whole balance.'
                )
              : t(
                  '{{month}} earnings accumulate in real time and join the available balance after settlement on {{date}}.',
                  { month: monthName, date: settleDate }
                )}
          </span>
          <Button
            variant='link'
            className='h-auto p-0'
            onClick={() => setGuideOpen(true)}
          >
            <CircleHelp aria-hidden='true' />
            {t('How are earnings calculated?')}
          </Button>
        </p>
      </CardContent>
      <EarningsGuide
        open={guideOpen}
        onOpenChange={setGuideOpen}
        expiryShareRateBasisPoints={
          props.summary.policy.expiryShareRateBasisPoints
        }
      />
    </Card>
  )
}

/** "My earnings": monthly statements and withdrawal requests of the signed-in agent. A disabled agent reads them only. */
export function AgentEarnings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'statements' | 'withdrawals'>('statements')
  const summary = useQuery({
    queryKey: [...agentEarningsQueryKeys.all, 'summary'],
    queryFn: ({ signal }) => getAgentEarningsSummary(signal),
  })
  const unread = useQuery({
    queryKey: agentEarningsQueryKeys.unreadCount,
    queryFn: ({ signal }) => getAgentUnreadWithdrawalCount(signal),
  })
  const markSeen = useMutation({
    mutationFn: markAgentWithdrawalsSeen,
    onSuccess: () =>
      queryClient.setQueryData(agentEarningsQueryKeys.unreadCount, 0),
  })
  if (summary.isPending) return <LoadingState />
  if (summary.isError) {
    return <ErrorState onRetry={() => void summary.refetch()} />
  }
  const unreadCount = unread.data ?? 0
  return (
    <div className='space-y-4'>
      <EarningsOverview summary={summary.data} />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = value as typeof tab
          setTab(next)
          // Opening the tab clears the unread results.
          if (next === 'withdrawals' && unreadCount > 0) markSeen.mutate()
        }}
      >
        <CanvasManagementTabsList aria-label={t('My earnings sections')}>
          <CanvasManagementTabsTrigger value='statements'>
            {t('Monthly statements')}
          </CanvasManagementTabsTrigger>
          <CanvasManagementTabsTrigger value='withdrawals'>
            {t('Withdrawal requests')}
            {unreadCount > 0 ? (
              <NavBadge
                tone='alert'
                label={t('{{count}} withdrawal requests have new results', {
                  count: unreadCount,
                })}
              >
                {String(unreadCount)}
              </NavBadge>
            ) : null}
          </CanvasManagementTabsTrigger>
        </CanvasManagementTabsList>
        <TabsContent value='statements' className='mt-4'>
          <AgentStatementTable mode='agent' />
        </TabsContent>
        <TabsContent value='withdrawals' className='mt-4 space-y-4'>
          <AgentPaymentQrCard paymentQr={summary.data.paymentQr} />
          <AgentWithdrawalApplyCard summary={summary.data} />
          <AgentWithdrawalTable mode='agent' />
        </TabsContent>
      </Tabs>
    </div>
  )
}

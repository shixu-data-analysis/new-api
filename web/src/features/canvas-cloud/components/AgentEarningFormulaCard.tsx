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
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

import {
  agentEarningsQueryKeys,
  getAgentSettlementPolicy,
} from '../agent-earnings-api'
import { formatBasisPointsPercent } from '../agent-earnings-format'

/**
 * The administrator's always-visible statement of how earnings are calculated; the ratio follows the current setting.
 * Name and formula pairs are a definition list, not a data table: nothing here is filtered, sorted or paged. It starts
 * collapsed to its title, so the statements below stay in view.
 */
export function AgentEarningFormulaCard() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const policy = useQuery({
    queryKey: [...agentEarningsQueryKeys.all, 'policy'],
    queryFn: ({ signal }) => getAgentSettlementPolicy(signal),
  })
  const rate = policy.data
    ? formatBasisPointsPercent(policy.data.expiryShareRateBasisPoints)
    : '—'
  const groups: Array<{ title: string; rows: Array<[string, string]> }> = [
    {
      title: t('Each successful result'),
      rows: [
        [
          t('RMB per point'),
          t(
            'Recharge amount ÷ points received (from the recharge order the points belong to)'
          ),
        ],
        [t('Customer paid amount'), t('Paid points used × RMB per point')],
        [t('Paid points share'), t('Paid points ÷ consumed points')],
        [
          t('Agent display amount (paid portion)'),
          t('Agent display price × usage × paid points share'),
        ],
        [
          t('Consumption earnings'),
          t(
            'Customer paid amount − agent display amount (paid portion); 0 when the difference is below 0'
          ),
        ],
      ],
    },
    {
      title: t('Each expiry of paid points'),
      rows: [
        [
          t('Expiry share'),
          t(
            'Expired paid points × RMB per point × expiry share ratio ({{rate}}); expired bonus points share nothing',
            { rate }
          ),
        ],
      ],
    },
    {
      title: t('Each month'),
      rows: [
        [
          t('Total earnings of the month'),
          t(
            "Sum of each result's consumption earnings + the month's expiry shares; added to the available balance after settlement"
          ),
        ],
      ],
    },
  ]
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between gap-3'>
          <CardTitle>{t('How earnings are calculated')}</CardTitle>
          <CollapsibleTrigger
            render={<Button variant='ghost' size='sm' className='shrink-0' />}
          >
            {open ? t('Collapse') : t('Expand')}
            <ChevronDown
              aria-hidden='true'
              className={cn('transition-transform', open && 'rotate-180')}
            />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className='grid gap-4'>
            {groups.map((group) => (
              <section key={group.title} className='grid gap-1.5'>
                <h3 className='text-sm font-semibold'>{group.title}</h3>
                <dl className='grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[14rem_minmax(0,1fr)]'>
                  {group.rows.map(([name, formula]) => (
                    <div key={name} className='contents'>
                      <dt className='text-muted-foreground'>{name}</dt>
                      <dd className='mb-1 sm:mb-0'>{formula}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            <ul className='text-muted-foreground list-disc space-y-1 ps-5 text-sm'>
              <li>
                {t(
                  'Each result is calculated first and then added up. When a result counts as 0, "customer paid amount − agent display amount (paid portion)" in the details is slightly smaller than "consumption earnings"; this is expected.'
                )}
              </li>
              <li>
                {t(
                  'Points bought at different times use their own RMB per point.'
                )}
              </li>
              <li>
                {t(
                  'Bonus points earn nothing; rounding remainders count as earnings.'
                )}
              </li>
              <li>
                {t(
                  '"Agent display amount (paid portion)" is called "model fee" on the agent side; it is not the provider cost.'
                )}
              </li>
            </ul>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

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
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'

import {
  agentEarningsQueryKeys,
  getAgentSettlementPolicy,
} from '../agent-earnings-api'
import { formatBasisPointsPercent } from '../agent-earnings-format'

/** The administrator's always-visible statement of how earnings are calculated; the ratio follows the current setting. */
export function AgentEarningFormulaCard() {
  const { t } = useTranslation()
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
    <Card>
      <CardHeader>
        <CardTitle>{t('How earnings are calculated')}</CardTitle>
      </CardHeader>
      <CardContent className='grid gap-3'>
        <StaticDataTable
          className='max-w-full overflow-x-auto'
          tableClassName='w-full min-w-[640px] table-fixed'
        >
          <TableBody>
            {groups.map((group) => (
              <Fragment key={group.title}>
                <TableRow>
                  <TableCell colSpan={2} className='bg-muted/40 font-semibold'>
                    {group.title}
                  </TableCell>
                </TableRow>
                {group.rows.map(([name, formula]) => (
                  <TableRow key={name}>
                    <TableCell className='w-64 align-top font-medium whitespace-normal'>
                      {name}
                    </TableCell>
                    <TableCell className='whitespace-normal'>
                      {formula}
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </StaticDataTable>
        <ul className='text-muted-foreground list-disc space-y-1 ps-5 text-sm'>
          <li>
            {t(
              'Each result is calculated first and then added up. When a result counts as 0, "customer paid amount − agent display amount (paid portion)" in the details is slightly smaller than "consumption earnings"; this is expected.'
            )}
          </li>
          <li>
            {t('Points bought at different times use their own RMB per point.')}
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
    </Card>
  )
}

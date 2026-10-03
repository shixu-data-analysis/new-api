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
import { Bar, BarChart, Cell, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip } from '@/components/ui/chart'

import { BusinessTerm, BusinessTermText } from './BusinessTerm'

export interface WaterfallRow {
  /** dashboardMetric business term of the row name. */
  term: string
  role: 'total' | 'increase' | 'decrease'
  /** Signed decimal used for the bar length; the displayed value is `value`. */
  amount: string
  value: ReactNode
  sub?: ReactNode
  onOpen?: () => void
  previous?: ReactNode
}

const ROW_HEIGHT = 48
const roleColors = {
  total: 'var(--muted-foreground)',
  increase: 'var(--chart-5)',
  decrease: 'var(--chart-4)',
} as const

/**
 * Horizontal waterfall of one equation. Totals start at zero; an increase or a decrease continues from where the previous
 * row ended, so an unbalanced closing total visibly leaves a gap. Names and values are ordinary DOM next to the chart,
 * aligned to the same row height, so links and tooltips keep working.
 */
export function OperatingDashboardWaterfall(props: {
  kind: 'points' | 'consumption'
  rows: WaterfallRow[]
}) {
  const { t } = useTranslation()
  let position = 0
  const data = props.rows.map((row, index) => {
    const amount = Number(row.amount)
    let range: [number, number]
    if (row.role === 'total') {
      range = [Math.min(0, amount), Math.max(0, amount)]
      position = amount
    } else {
      const magnitude = Math.abs(amount)
      const end =
        row.role === 'increase' ? position + magnitude : position - magnitude
      range = [Math.min(position, end), Math.max(position, end)]
      position = end
    }
    return { key: `${index}`, term: row.term, role: row.role, range }
  })
  const legend: Array<[keyof typeof roleColors, string]> =
    props.kind === 'points'
      ? [
          ['total', 'Opening and closing'],
          ['increase', 'Increase'],
          ['decrease', 'Decrease'],
        ]
      : [
          ['total', 'Amount'],
          ['decrease', 'Deduction'],
        ]
  return (
    <div className='space-y-2'>
      <ul className='text-muted-foreground flex flex-wrap gap-4 text-xs'>
        {legend.map(([role, label]) => (
          <li key={role} className='flex items-center gap-1.5'>
            <span
              className='inline-block size-2.5 rounded-sm'
              style={{ background: roleColors[role] }}
              aria-hidden='true'
            />
            {t(label)}
          </li>
        ))}
      </ul>
      <div className='grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_minmax(0,auto)] gap-x-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,16rem)]'>
        <ul className='text-sm'>
          {props.rows.map((row) => (
            <li
              key={row.term}
              className='flex items-center'
              style={{ height: ROW_HEIGHT }}
            >
              <BusinessTerm kind='dashboardMetric' value={row.term} />
            </li>
          ))}
        </ul>
        <ChartContainer
          config={{ range: { label: t('Amount') } }}
          className='aspect-auto w-full'
          style={{ height: ROW_HEIGHT * props.rows.length }}
        >
          <BarChart
            data={data}
            layout='vertical'
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            barCategoryGap={12}
          >
            <XAxis type='number' hide domain={['dataMin', 'dataMax']} />
            <YAxis type='category' dataKey='key' hide />
            <ChartTooltip
              cursor={false}
              content={({ active, payload }) => {
                const entry = payload?.[0]?.payload as
                  | (typeof data)[number]
                  | undefined
                const row = entry ? props.rows[Number(entry.key)] : undefined
                if (!active || !row) return null
                return (
                  <div className='bg-background rounded-md border px-2.5 py-1.5 text-xs shadow-md'>
                    <BusinessTermText kind='dashboardMetric' value={row.term} />{' '}
                    <span className='tabular-nums'>{row.value}</span>
                  </div>
                )
              }}
            />
            <Bar dataKey='range' isAnimationActive={false} radius={2}>
              {data.map((entry) => (
                <Cell key={entry.key} fill={roleColors[entry.role]} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
        <ul className='text-sm tabular-nums'>
          {props.rows.map((row) => (
            <li
              key={row.term}
              className='flex flex-col justify-center'
              style={{ height: ROW_HEIGHT }}
            >
              <span>
                {row.onOpen ? (
                  <button
                    type='button'
                    className='text-primary focus-visible:ring-ring/50 rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
                    onClick={row.onOpen}
                  >
                    {row.value}
                  </button>
                ) : (
                  row.value
                )}{' '}
                {row.sub ? (
                  <span className='text-muted-foreground text-xs'>
                    {row.sub}
                  </span>
                ) : null}
              </span>
              {row.previous}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

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
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { timeOfDayNowState, timeOfDayPeriods } from '../lib/time-of-day-display'
import type { CanvasTimeOfDaySchedule } from '../types'
import {
  daysLabel,
  multiplierWords,
  timeOfDayNowText,
  timeZoneName,
} from './time-of-day-text'

/**
 * "分时段计价" under a model card's prices (prototype cards.html): folded to the price now and the number of periods;
 * opened, every period with the one in force marked and the Provider's time zone named. The open state is not kept.
 */
export function TimeOfDayPricing(props: {
  schedule: CanvasTimeOfDaySchedule
  now: Date
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const state = timeOfDayNowState(props.schedule, props.now)
  const periods = timeOfDayPeriods(props.schedule)
  const zone =
    props.schedule.timeZone === 'Asia/Shanghai'
      ? t('Beijing time')
      : timeZoneName(props.schedule.timeZone, i18n.language)
  return (
    <div className='grid gap-1'>
      <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-1'>
        <span
          className={cn(
            'text-[13px] font-semibold',
            Number(state.multiplier) > 1
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground'
          )}
        >
          {timeOfDayNowText(state, t)}
        </span>
        <button
          type='button'
          aria-expanded={open}
          className='text-primary focus-visible:ring-ring inline-flex items-center gap-1 rounded text-[12.5px] focus-visible:ring-2 focus-visible:outline-none'
          onClick={() => setOpen(!open)}
        >
          <ChevronRight
            className={cn(
              'size-3.5 transition-transform motion-reduce:transition-none',
              open && 'rotate-90'
            )}
          />
          <span>{open ? t('Collapse') : t('All periods')}</span>
          {open ? null : (
            <span className='bg-primary/10 rounded-full px-1.5 text-[11px] tabular-nums'>
              {periods.length + 1}
            </span>
          )}
        </button>
      </div>
      {open ? (
        <div className='bg-muted text-muted-foreground grid gap-0.5 rounded-lg px-3 py-2 text-[12.5px] tabular-nums'>
          <span className='text-xs'>
            {t('Time-of-day pricing ({{zone}})', { zone })}
          </span>
          {periods.map((period) => (
            <span
              key={period.index}
              className={cn(
                'flex justify-between gap-3',
                period.index === state.ruleIndex &&
                  'text-foreground font-semibold'
              )}
            >
              <span>
                {period.nextDay
                  ? t('{{days}} {{start}}–next day {{end}}', {
                      days: daysLabel(period.days, t),
                      start: period.start,
                      end: period.end,
                    })
                  : t('{{days}} {{start}}–{{end}}', {
                      days: daysLabel(period.days, t),
                      start: period.start,
                      end: period.end,
                    })}
              </span>
              <b className='text-foreground font-semibold'>
                {multiplierWords(period.multiplier, t)}
              </b>
            </span>
          ))}
          <span
            className={cn(
              'flex justify-between gap-3',
              state.ruleIndex === null && 'text-foreground font-semibold'
            )}
          >
            <span>{t('Other periods')}</span>
            <b className='text-foreground font-semibold'>
              {t('Regular price')}
            </b>
          </span>
        </div>
      ) : null}
    </div>
  )
}

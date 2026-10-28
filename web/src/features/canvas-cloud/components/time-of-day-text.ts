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
import { useEffect, useState } from 'react'

import { multiplierText } from '../lib/time-of-day'
import type { TimeOfDayNowState } from '../lib/time-of-day-display'
import type { CanvasTimeOfDaySchedule } from '../types'

type Translate = (key: string, options?: Record<string, unknown>) => string

const WEEKDAY_NAME_KEYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

export function weekdayName(day: number, t: Translate): string {
  return t(WEEKDAY_NAME_KEYS[day - 1] ?? '')
}

/** The zone's long name in the page language, such as "中国标准时间". */
export function timeZoneName(zone: string, locale: string): string {
  try {
    return (
      new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'long' })
        .formatToParts(new Date())
        .find((part) => part.type === 'timeZoneName')?.value ?? zone
    )
  } catch {
    return zone
  }
}

/** A schedule in one line for the publish confirmation and the scheduled notice; the admin side writes "×2". */
export function timeOfDayScheduleText(
  schedule: CanvasTimeOfDaySchedule | null,
  t: Translate,
  locale: string
): string {
  if (!schedule || schedule.rules.length === 0) return t('Not set (×1 all day)')
  const periods = schedule.rules
    .map((rule) =>
      t('{{days}} {{start}}–{{end}} ×{{multiplier}}', {
        days: daysLabel(rule.days, t),
        start: rule.start,
        end: rule.end,
        multiplier: multiplierText(rule.multiplier),
      })
    )
    .join(t('; '))
  return t('{{periods}}; other periods ×1 ({{zone}})', {
    periods,
    zone: timeZoneName(schedule.timeZone, locale),
  })
}

/** "2 倍", "0.8 倍", "原价": customers read words, not "×2". */
export function multiplierWords(multiplier: string, t: Translate): string {
  return Number(multiplier) === 1
    ? t('Regular price')
    : t('{{value}} times', { value: multiplier })
}

/** "现在为 2 倍价格，12:00 结束" or "现在为原价，14:00 起 2 倍". */
export function timeOfDayNowText(
  state: TimeOfDayNowState,
  t: Translate
): string {
  if (Number(state.multiplier) !== 1) {
    return t('Now at {{multiplier}} price, ends {{until}}', {
      multiplier: multiplierWords(state.multiplier, t),
      until: state.until,
    })
  }
  if (!state.next) return t('Now at the regular price')
  const time = state.next.day
    ? `${weekdayName(state.next.day, t)} ${state.next.at}`
    : state.next.at
  return t('Now at the regular price, {{multiplier}} from {{time}}', {
    multiplier: multiplierWords(state.next.multiplier, t),
    time,
  })
}

/** The minute now, renewed each minute, so prices follow period boundaries while a page stays open. */
export function useMinuteNow(active: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [active])
  return now
}

export function daysLabel(days: number[], t: Translate) {
  const key = [...days].sort((a, b) => a - b).join(',')
  if (key === '1,2,3,4,5') return t('Monday to Friday')
  if (key === '6,7') return t('Saturday and Sunday')
  if (key === '1,2,3,4,5,6,7') return t('Every day')
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => weekdayName(day, t))
    .join(t('list separator'))
}

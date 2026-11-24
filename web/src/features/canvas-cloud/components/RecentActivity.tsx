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
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'

// 近 7 天活跃 (Cloud docs/discussions/agent-customer-center-simplification.zh-CN.md section 3), shown by the agent's 我的客户,
// the administrator's agent statistics and the customer list.

/** Seven dots for `recentDays`, oldest on the left and today on the right; a day with a submitted task is lit. */
export function RecentActivity(props: {
  recentDays: string[]
  activeDays: string[]
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const active = new Set(props.activeDays)
  const format = new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  })
  const days = props.recentDays.map((day, index) => {
    const date = format.format(new Date(`${day}T00:00:00Z`))
    return {
      day,
      label:
        index === props.recentDays.length - 1
          ? t('{{date}} (today)', { date })
          : date,
      lit: active.has(day),
    }
  })
  const litLabels = days
    .filter((entry) => entry.lit)
    .map((entry) => entry.label)
  // Hover shows each day; the accessible name lists the active days for keyboard, touch and screen reader users.
  return (
    <span
      role='img'
      aria-label={
        litLabels.length === 0
          ? t('Active on {{count}} of the last 7 days', { count: 0 })
          : t('Active on {{count}} of the last 7 days: {{dates}}', {
              count: litLabels.length,
              dates: new Intl.ListFormat(locale, {
                style: 'narrow',
                type: 'unit',
              }).format(litLabels),
            })
      }
      className='inline-flex gap-1 align-middle'
    >
      {days.map((entry) => (
        <span
          key={entry.day}
          title={
            entry.lit
              ? t('{{day}}: active', { day: entry.label })
              : t('{{day}}: inactive', { day: entry.label })
          }
          data-active={entry.lit}
          className={
            entry.lit
              ? 'bg-primary size-2 rounded-full'
              : 'bg-border size-2 rounded-full'
          }
        />
      ))}
    </span>
  )
}

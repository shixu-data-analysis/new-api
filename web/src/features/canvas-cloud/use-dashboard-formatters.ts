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

import {
  formatExactPointQuantity,
  formatExactRmbReference,
} from './number-format'

/** Locale-aware point, RMB, rate and time formatting shared by the operating dashboard. */
export function useDashboardFormatters() {
  const { i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const yuan = (formatted: string) =>
    formatted.startsWith('-') || formatted.startsWith('−')
      ? `${formatted.slice(0, 1)}¥${formatted.slice(1)}`
      : `¥${formatted}`
  return {
    locale,
    points: (value: string) => formatExactPointQuantity(value, locale),
    /** RMB amounts show up to four decimals and at least two, so sub-cent call costs stay visible. */
    rmb: (value: string) => {
      let formatted = formatExactRmbReference(value, locale, 4)
      for (
        let trimmed = 0;
        trimmed < 2 && formatted.endsWith('0');
        trimmed += 1
      ) {
        formatted = formatted.slice(0, -1)
      }
      return yuan(formatted)
    },
    perPoint: (value: string) =>
      `¥${formatExactRmbReference(value, locale, 4)}`,
    percent: (rate: string) =>
      `${formatExactRmbReference((Number(rate) * 100).toFixed(6), locale, 2)}%`,
    dateTime: (value: string) =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value)),
  }
}

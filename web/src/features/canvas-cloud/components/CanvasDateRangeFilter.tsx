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

import { DateTimePicker } from '@/components/datetime-picker'

import { isCanvasDateRangeValid } from '../date-range'

export function CanvasDateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  showLabels = false,
}: {
  from?: Date
  to?: Date
  onFromChange: (value?: Date) => void
  onToChange: (value?: Date) => void
  showLabels?: boolean
}) {
  const { t } = useTranslation()
  const valid = isCanvasDateRangeValid(from, to)

  return (
    <div className='flex flex-wrap items-end gap-2'>
      <div className='space-y-1'>
        {showLabels ? (
          <p className='text-sm font-medium'>{t('Start time')}</p>
        ) : null}
        <DateTimePicker
          value={from}
          onChange={onFromChange}
          placeholder={t('From')}
        />
      </div>
      <div className='space-y-1'>
        {showLabels ? (
          <p className='text-sm font-medium'>{t('End time')}</p>
        ) : null}
        <DateTimePicker
          value={to}
          onChange={onToChange}
          placeholder={t('To')}
        />
      </div>
      {!valid ? (
        <span className='text-destructive text-sm'>
          {t('Start time must not be after end time')}
        </span>
      ) : null}
    </div>
  )
}

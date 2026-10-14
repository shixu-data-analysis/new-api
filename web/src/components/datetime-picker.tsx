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
import { ChevronDownIcon } from 'lucide-react'
import * as React from 'react'
import { enUS, fr, ja, ru, vi, zhCN, zhTW } from 'react-day-picker/locale'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { normalizeInterfaceLanguage } from '@/i18n/languages'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

// Keyed by the interface language codes i18next uses (`zhCN` / `zhTW`), not BCP-47 tags.
const calendarLocales = {
  en: enUS,
  zhCN,
  zhTW,
  fr,
  ru,
  ja,
  vi,
} as const

interface DateTimePickerProps {
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  className?: string
  futureOnly?: boolean
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const TIME_SLOTS = Array.from(
  { length: 48 },
  (_, index) =>
    `${Math.floor(index / 2)
      .toString()
      .padStart(2, '0')}:${index % 2 ? '30' : '00'}`
)

const startOfLocalDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate())

const nextLocalMinute = (value: Date) => {
  const result = new Date(value)
  result.setSeconds(0, 0)
  result.setMinutes(result.getMinutes() + 1)
  return result
}

const nextLocalHour = (value: Date) => {
  const result = new Date(value)
  result.setMinutes(0, 0, 0)
  result.setHours(result.getHours() + 1)
  return result
}

const isSameLocalDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

const formatLocalTime = (value: Date) =>
  `${value.getHours().toString().padStart(2, '0')}:${value
    .getMinutes()
    .toString()
    .padStart(2, '0')}`

const atLocalTime = (day: Date, time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  const result = new Date(day)
  result.setHours(hours, minutes, 0, 0)
  return result
}

/**
 * A date button and a typable time box with a 30-minute list. The time can be filled before the date; a value is
 * reported only once both are set. A future-only picker starts today at the next whole hour and moves any past
 * moment there; other pickers start a new date at 00:00, since time-range filters look at past data.
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder,
  className,
  futureOnly = false,
}: DateTimePickerProps) {
  const { t, i18n } = useTranslation()
  const placeholderText = placeholder ?? t('Select date')
  const calendarLocale =
    calendarLocales[
      normalizeInterfaceLanguage(
        i18n.resolvedLanguage ?? i18n.language
      ) as keyof typeof calendarLocales
    ] ?? enUS
  const currentYear = new Date().getFullYear()
  const [open, setOpen] = React.useState(false)
  const [date, setDate] = React.useState<Date | undefined>(value)
  const [month, setMonth] = React.useState<Date | undefined>(value)
  const [time, setTime] = React.useState(value ? formatLocalTime(value) : '')
  const [timeText, setTimeText] = React.useState(time)
  const now = new Date()

  // Callers often rebuild the Date on every render, so follow the moment rather than the object.
  const valueTime = value?.getTime()
  React.useEffect(() => {
    const next = valueTime === undefined ? undefined : new Date(valueTime)
    setDate(next)
    setMonth(next)
    const nextTime = next ? formatLocalTime(next) : ''
    setTime(nextTime)
    setTimeText(nextTime)
  }, [valueTime])

  const commit = (day: Date, nextTime: string) => {
    const current = new Date()
    const defaultTime =
      futureOnly && isSameLocalDay(day, current)
        ? formatLocalTime(nextLocalHour(current))
        : '00:00'
    let result = atLocalTime(day, nextTime || defaultTime)
    if (futureOnly && result < nextLocalMinute(current)) {
      result = nextLocalHour(current)
    }
    setDate(result)
    setMonth(result)
    setTime(formatLocalTime(result))
    setTimeText(formatLocalTime(result))
    onChange?.(result)
  }

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      commit(selectedDate, time)
      setOpen(false)
      return
    }
    setDate(undefined)
    setMonth(undefined)
    onChange?.(undefined)
  }

  const applyTime = (nextTime: string) => {
    if (date) {
      commit(date, nextTime)
      return
    }
    setTime(nextTime)
    setTimeText(nextTime)
  }

  const handleClear = () => {
    setDate(undefined)
    setMonth(undefined)
    setTime('')
    setTimeText('')
    onChange?.(undefined)
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant='outline'
              className={cn(
                'flex-1 justify-between font-normal',
                !date && 'text-muted-foreground'
              )}
            />
          }
        >
          {date ? dayjs(date).format('YYYY-MM-DD') : placeholderText}
          <ChevronDownIcon className='h-4 w-4 opacity-50' />
        </PopoverTrigger>
        <PopoverContent className='w-auto overflow-hidden p-0' align='start'>
          <Calendar
            mode='single'
            selected={date}
            month={month}
            onMonthChange={setMonth}
            captionLayout='dropdown'
            onSelect={handleDateSelect}
            locale={calendarLocale}
            startMonth={new Date(currentYear - 100, 0)}
            endMonth={new Date(currentYear + 100, 11)}
            disabled={
              futureOnly
                ? { before: startOfLocalDay(nextLocalMinute(now)) }
                : undefined
            }
          />
        </PopoverContent>
      </Popover>
      <Combobox<string>
        items={TIME_SLOTS}
        value={TIME_SLOTS.includes(time) ? time : null}
        filter={null}
        inputValue={timeText}
        onInputValueChange={(text, details) => {
          // Only typing edits the box; the list and blur keep it in step with the chosen time.
          if (details.reason !== 'input-change') return
          const digits = text.replaceAll(/\D/g, '').slice(0, 4)
          const formatted =
            digits.length > 2
              ? `${digits.slice(0, 2)}:${digits.slice(2)}`
              : digits
          setTimeText(formatted)
          if (TIME_PATTERN.test(formatted)) applyTime(formatted)
        }}
        onValueChange={(slot) => {
          if (slot) applyTime(slot)
        }}
      >
        <ComboboxInput
          className='w-32 shrink-0'
          placeholder={t('Time')}
          aria-label={t('Time')}
          inputMode='numeric'
          maxLength={5}
          onBlur={() => setTimeText(time)}
        />
        <ComboboxContent>
          <ComboboxList>
            {(slot: string) => (
              <ComboboxItem
                key={slot}
                value={slot}
                disabled={Boolean(
                  futureOnly &&
                  date &&
                  isSameLocalDay(date, now) &&
                  atLocalTime(date, slot) < nextLocalMinute(now)
                )}
              >
                {slot}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {(date || time) && (
        <Button
          type='button'
          variant='outline'
          size='icon'
          onClick={handleClear}
          className='shrink-0'
          aria-label='Clear'
        >
          <span aria-hidden='true'>✕</span>
        </Button>
      )}
    </div>
  )
}

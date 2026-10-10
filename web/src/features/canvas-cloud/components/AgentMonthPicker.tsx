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
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Picks one statement month (YYYY-MM). Months without a statement are disabled. The trigger keeps the fixed 208px width,
 * the documented exception to "controls fill the filter column" (Cloud data table guide, section 4).
 */
export function AgentMonthPicker(props: {
  value: string | undefined
  availableMonths: string[]
  onChange: (month: string | undefined) => void
  label: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const available = new Set(props.availableMonths)
  const latest = props.value ?? props.availableMonths[0]
  const [year, setYear] = useState(() =>
    Number((latest ?? new Date().toISOString()).slice(0, 4))
  )
  const select = (month: string | undefined) => {
    props.onChange(month)
    setOpen(false)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && props.value) setYear(Number(props.value.slice(0, 4)))
        setOpen(next)
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant='outline'
            aria-label={props.label}
            className='w-[208px] justify-start text-start font-normal'
          />
        }
      >
        <span
          className={cn(
            'tabular-nums',
            !props.value && 'text-muted-foreground'
          )}
        >
          {props.value ?? t('All months')}
        </span>
        <CalendarIcon
          className='ms-auto size-4 opacity-50'
          aria-hidden='true'
        />
      </PopoverTrigger>
      <PopoverContent className='w-64 p-3'>
        <div className='mb-2 flex items-center justify-between'>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Previous year')}
            onClick={() => setYear(year - 1)}
          >
            <ChevronLeft aria-hidden='true' />
          </Button>
          <strong className='text-sm tabular-nums'>{year}</strong>
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={t('Next year')}
            onClick={() => setYear(year + 1)}
          >
            <ChevronRight aria-hidden='true' />
          </Button>
        </div>
        <div className='grid grid-cols-4 gap-1'>
          {Array.from({ length: 12 }, (_, index) => {
            const month = `${year}-${String(index + 1).padStart(2, '0')}`
            return (
              <Button
                key={month}
                size='sm'
                variant={props.value === month ? 'default' : 'ghost'}
                disabled={!available.has(month)}
                aria-pressed={props.value === month}
                onClick={() => select(month)}
                className='tabular-nums'
              >
                {month.slice(5)}
              </Button>
            )
          })}
        </div>
        <div className='mt-2 flex items-center justify-between gap-2'>
          <span className='text-muted-foreground text-xs'>
            {t('Greyed months have no statement')}
          </span>
          <Button variant='ghost' size='sm' onClick={() => select(undefined)}>
            {t('Clear month filter')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

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
import { fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DateTimePicker } from '../datetime-picker'

describe('DateTimePicker', () => {
  afterEach(async () => {
    vi.useRealTimers()
    await i18next.changeLanguage('en')
  })

  // i18next reports Chinese as zhCN / zhTW; the calendar must follow the interface language, not fall back to English.
  it.each([
    ['zhCN', '2026年', ['日', '一', '二', '三', '四', '五', '六']],
    ['zhTW', '2026年', ['日', '一', '二', '三', '四', '五', '六']],
    ['en', '2026', ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']],
  ])(
    'shows the %s calendar in the interface language, starting on Sunday',
    async (language, year, weekdays) => {
      vi.setSystemTime(new Date(2026, 9, 12, 10, 0, 0))
      await i18next.changeLanguage(language)
      const { container } = render(
        <DateTimePicker futureOnly placeholder='date' />
      )

      fireEvent.click(screen.getByRole('button', { name: 'date' }))

      const document = container.ownerDocument
      expect(
        [...document.querySelectorAll('.rdp-weekday')].map(
          (cell) => cell.textContent
        )
      ).toEqual(weekdays)
      expect(
        [...document.querySelectorAll('.rdp-years_dropdown option')].some(
          (option) => option.textContent === year
        )
      ).toBe(true)
    }
  )

  it('disables past local dates and advances today to the next local minute', () => {
    vi.setSystemTime(new Date(2026, 8, 2, 10, 15, 30))
    const onChange = vi.fn()
    const { container } = render(
      <DateTimePicker futureOnly onChange={onChange} />
    )

    fireEvent.click(screen.getByRole('button', { name: /select date/i }))

    const yesterday = container.ownerDocument.querySelector(
      'button[data-day="9/1/2026"]'
    )
    const today = container.ownerDocument.querySelector(
      'button[data-day="9/2/2026"]'
    )
    expect(yesterday).toBeDisabled()
    expect(today).toBeEnabled()
    if (!today) throw new Error('Expected the current local date in calendar')

    fireEvent.click(today)

    expect(screen.getByDisplayValue('10:16')).toHaveAttribute('min', '10:16')
    expect(onChange).toHaveBeenLastCalledWith(
      new Date(2026, 8, 2, 10, 16, 0, 0)
    )
  })
})

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

  it('disables past local dates and starts today at the next whole hour', () => {
    vi.setSystemTime(new Date(2026, 8, 2, 10, 15, 30))
    const onChange = vi.fn()
    const { container } = render(
      <DateTimePicker futureOnly onChange={onChange} />
    )

    expect(screen.getByLabelText('Time')).toHaveValue('')
    expect(screen.getByLabelText('Time')).toHaveAttribute('placeholder', 'Time')
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

    expect(screen.getByLabelText('Time')).toHaveValue('11:00')
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 2, 11, 0, 0, 0))
  })

  it('moves a past future-only time to the next whole hour and disables past slots', async () => {
    vi.setSystemTime(new Date(2026, 8, 2, 10, 15, 30))
    const onChange = vi.fn()
    render(
      <DateTimePicker
        futureOnly
        value={new Date(2026, 8, 2, 12, 0)}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByLabelText('Time'), {
      target: { value: '0800' },
    })
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 2, 11, 0, 0, 0))

    fireEvent.keyDown(screen.getByLabelText('Time'), { key: 'ArrowDown' })
    expect(
      await screen.findByRole('option', { name: '10:00' })
    ).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('option', { name: '10:30' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  it('keeps a time typed before the date and reports nothing until the date is set', () => {
    vi.setSystemTime(new Date(2026, 8, 2, 10, 15, 30))
    const onChange = vi.fn()
    const { container } = render(<DateTimePicker onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Time'), {
      target: { value: '0930' },
    })
    expect(screen.getByLabelText('Time')).toHaveValue('09:30')
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /select date/i }))
    const day = container.ownerDocument.querySelector(
      'button[data-day="9/5/2026"]'
    )
    if (!day) throw new Error('Expected a calendar day')
    fireEvent.click(day)

    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 5, 9, 30, 0, 0))
  })

  it('starts a filter date at 00:00, even today', () => {
    vi.setSystemTime(new Date(2026, 8, 2, 10, 15, 30))
    const onChange = vi.fn()
    const { container } = render(<DateTimePicker onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /select date/i }))
    const today = container.ownerDocument.querySelector(
      'button[data-day="9/2/2026"]'
    )
    if (!today) throw new Error('Expected the current local date in calendar')
    fireEvent.click(today)

    expect(screen.getByLabelText('Time')).toHaveValue('00:00')
    expect(onChange).toHaveBeenLastCalledWith(new Date(2026, 8, 2, 0, 0, 0, 0))
  })
})

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
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { TimeOfDayMultiplierSection } from '../components/TimeOfDayMultiplierSection'
import type { TimeOfDayDraft } from '../lib/time-of-day'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key.replaceAll(/\{\{(\w+)\}\}/g, (_, name) =>
        String(values?.[name] ?? '')
      ),
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))

function Harness(props: { initial: TimeOfDayDraft; attempted?: boolean }) {
  const [draft, setDraft] = useState(props.initial)
  return (
    <TimeOfDayMultiplierSection
      draft={draft}
      changed
      attempted={props.attempted ?? false}
      scheduled={null}
      priceRows={[
        {
          id: 'input',
          label: 'Input · Standard',
          priced: true,
          customerCny: '1.0000',
          points: '100',
          costCny: '0.5000',
        },
      ]}
      onChange={setDraft}
    />
  )
}

const off: TimeOfDayDraft = {
  enabled: false,
  timeZone: 'Asia/Shanghai',
  rules: [],
}

describe('time-of-day section', () => {
  it('starts off and adds the first weekday period when switched on', () => {
    render(<Harness initial={off} />)
    expect(screen.getByText('Off: priced at ×1 all day.')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch'))
    expect(
      (screen.getByLabelText('Start time of period 1') as HTMLInputElement)
        .value
    ).toBe('09:00')
    expect(
      (screen.getByLabelText('Multiplier of period 1') as HTMLInputElement)
        .value
    ).toBe('2')
    expect(screen.getByText('Unpublished')).toBeTruthy()
  })

  it('keeps a new empty period quiet until it is left, then names the overlap', () => {
    render(
      <Harness
        initial={{
          enabled: true,
          timeZone: 'Asia/Shanghai',
          rules: [
            {
              id: 'a',
              days: [1, 2, 3, 4, 5],
              start: '09:00',
              end: '12:00',
              multiplier: '2',
            },
          ],
        }}
      />
    )
    fireEvent.click(screen.getByText('Add period'))
    expect(screen.queryByRole('alert')).toBeNull()
    const start = screen.getByLabelText('Start time of period 2')
    fireEvent.change(start, { target: { value: '1100' } })
    expect((start as HTMLInputElement).value).toBe('11:00')
    fireEvent.change(screen.getByLabelText('End time of period 2'), {
      target: { value: '1300' },
    })
    fireEvent.change(screen.getByLabelText('Multiplier of period 2'), {
      target: { value: '1.5' },
    })
    fireEvent.blur(screen.getByLabelText('Multiplier of period 2'))
    expect(screen.getByRole('alert').textContent).toBe(
      'Overlaps period 1 on Monday 11:00–12:00'
    )
  })

  it('shows every error after a publish attempt and lists prices by period', () => {
    render(
      <Harness
        attempted
        initial={{
          enabled: true,
          timeZone: 'Asia/Shanghai',
          rules: [
            { id: 'b', days: [], start: '', end: '', multiplier: '12' },
            {
              id: 'c',
              days: [6, 7],
              start: '22:00',
              end: '02:00',
              multiplier: '0.8',
            },
          ],
        }}
      />
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'Choose the days of the period'
    )
    fireEvent.click(screen.getByText('Prices by period'))
    expect(screen.getByRole('columnheader', { name: '×0.8' })).toBeTruthy()
    expect(screen.getByText('0.8 yuan')).toBeTruthy()
    expect(screen.getByText('80 points · cost 0.4 yuan')).toBeTruthy()
  })
})

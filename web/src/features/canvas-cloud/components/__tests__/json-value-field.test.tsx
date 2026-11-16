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
import { describe, expect, it } from 'vitest'

import { JsonValueField } from '../catalog-edit/TextModelFields'

const issueOf = (text: string) => {
  if (!text.trim()) return ''
  try {
    JSON.parse(text)
    return ''
  } catch {
    return 'not JSON'
  }
}

// Holds a value and its issues the way the model editor does: replacing the whole draft clears the issues and bumps
// the revision the field is keyed by.
function Harness() {
  const [value, setValue] = useState<unknown>([272000])
  const [issue, setIssue] = useState<string | undefined>()
  const [revision, setRevision] = useState(0)
  return (
    <>
      <JsonValueField
        key={revision}
        label='Input tiers'
        rows={2}
        value={value}
        error={undefined}
        was={undefined}
        issueOf={issueOf}
        onValid={setValue}
        onIssue={setIssue}
      />
      <output data-testid='issue'>{issue ?? ''}</output>
      <output data-testid='value'>{JSON.stringify(value)}</output>
      <button
        type='button'
        onClick={() => {
          setValue([272000])
          setIssue(undefined)
          setRevision((current) => current + 1)
        }}
      >
        replace
      </button>
    </>
  )
}

describe('JsonValueField', () => {
  it('keeps invalid typing and its issue, and shows a replacing draft even when its value is the same', () => {
    render(<Harness />)
    const box = screen.getByLabelText('Input tiers') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '[272000,' } })
    expect(box.value).toBe('[272000,')
    expect(screen.getByTestId('issue').textContent).toBe('not JSON')
    expect(screen.getByTestId('value').textContent).toBe('[272000]')

    fireEvent.click(screen.getByText('replace'))
    const replaced = screen.getByLabelText('Input tiers') as HTMLTextAreaElement
    expect(replaced.value).toBe(JSON.stringify([272000], null, 2))
    expect(replaced.getAttribute('aria-invalid')).toBe('false')
    expect(screen.getByTestId('issue').textContent).toBe('')
  })

  it('changes the draft only once the typing is valid', () => {
    render(<Harness />)
    const box = screen.getByLabelText('Input tiers')
    fireEvent.change(box, { target: { value: '[128000, 272000]' } })
    expect(screen.getByTestId('value').textContent).toBe('[128000,272000]')
    // The draft coming back does not rewrite what was typed.
    expect(box).toHaveValue('[128000, 272000]')
    expect(screen.getByTestId('issue').textContent).toBe('')
  })
})

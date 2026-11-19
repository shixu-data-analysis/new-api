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
import { describe, expect, it, vi } from 'vitest'

import { CanvasFormDialog } from '../CanvasFormDialog'

describe('CanvasFormDialog', () => {
  it('submits the form, asks the caller to close, and keeps its footer inside the dialog', () => {
    const onSubmit = vi.fn()
    const onRequestClose = vi.fn()
    render(
      <CanvasFormDialog
        title='Settings'
        onSubmit={onSubmit}
        onRequestClose={onRequestClose}
        footer={<button type='submit'>Save</button>}
      >
        <input aria-label='Name' />
      </CanvasFormDialog>
    )
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), {
      key: 'Escape',
    })
    expect(onRequestClose).toHaveBeenCalled()
    // The shared footer's negative margins assume a padded dialog; this one has none, so they are taken back.
    const footer = screen
      .getByRole('button', { name: 'Save' })
      .closest('[data-slot="dialog-footer"]')
    expect(footer).toHaveClass('mx-0', 'mb-0')
    expect(footer?.className).not.toMatch(/(^|\s)-m[xb]-/)
  })
})

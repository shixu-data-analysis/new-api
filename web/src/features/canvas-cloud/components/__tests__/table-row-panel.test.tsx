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
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'

import { TableRowPanel } from '../TableRowPanel'

describe('TableRowPanel', () => {
  it('keeps a full-row panel to the visible width of a sideways-scrolling table and lets its text wrap', () => {
    const clientWidth = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.dataset.slot === 'table-container' ? 600 : 0
      })
    // The shared Table renders the sideways-scrolling container the panel measures.
    render(
      <Table>
        <TableBody>
          <TableRow>
            <TableCell colSpan={8}>
              <TableRowPanel>call details</TableRowPanel>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    )
    const panel = screen.getByText('call details')
    expect(panel).toHaveClass('sticky', 'whitespace-normal')
    // 600 px visible minus the cell padding on both sides.
    expect(panel).toHaveStyle({ width: '584px' })
    clientWidth.mockRestore()
  })

  it('keeps its natural width before the table has a layout', () => {
    render(
      <div data-slot='table-container'>
        <TableRowPanel>call details</TableRowPanel>
      </div>
    )
    expect(screen.getByText('call details').style.width).toBe('')
  })
})

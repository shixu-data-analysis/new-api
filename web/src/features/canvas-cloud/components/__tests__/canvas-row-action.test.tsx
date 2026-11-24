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
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CanvasRowAction } from '../CanvasRowAction'

afterEach(cleanup)

describe('CanvasRowAction', () => {
  it('draws every tone at the small size, the main one tinted, the dangerous one red', () => {
    render(
      <>
        <CanvasRowAction tone='primary'>Main</CanvasRowAction>
        <CanvasRowAction>Other</CanvasRowAction>
        <CanvasRowAction tone='danger'>Delete</CanvasRowAction>
      </>
    )
    const main = screen.getByRole('button', { name: 'Main' })
    const other = screen.getByRole('button', { name: 'Other' })
    const danger = screen.getByRole('button', { name: 'Delete' })
    for (const button of [main, other, danger]) {
      expect(button.className).toContain('h-7')
    }
    expect(main).toHaveAttribute('data-row-action', 'primary')
    expect(main.className).toContain('bg-primary/10')
    expect(main.className).toContain('text-primary')
    expect(main.className).not.toContain('hover:bg-muted')
    expect(other).toHaveAttribute('data-row-action', 'normal')
    expect(other.className).toContain('border-border')
    expect(danger).toHaveAttribute('data-row-action', 'danger')
    expect(danger.className).toContain('text-destructive')
  })

  it('acts and can be disabled like any button', () => {
    const onClick = vi.fn()
    render(
      <>
        <CanvasRowAction onClick={onClick}>Open</CanvasRowAction>
        <CanvasRowAction disabled onClick={onClick}>
          Busy
        </CanvasRowAction>
      </>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Busy' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

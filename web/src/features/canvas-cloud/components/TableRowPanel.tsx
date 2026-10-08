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
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// The cell padding (p-2) on each side of a full-row cell.
const CELL_PADDING = 8

/**
 * A panel in a full-row cell (colSpan) of a table that may scroll sideways. It keeps to the visible width
 * of the table and sticks to its left edge, so the panel never grows to the width of all columns and its
 * right side (copy and other actions) stays in view. Its text wraps, unlike the shared cells.
 */
export function TableRowPanel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()
  useLayoutEffect(() => {
    const container = ref.current?.closest<HTMLElement>(
      '[data-slot="table-container"]'
    )
    if (!container) return
    // Before layout the container has no width yet; the panel then keeps its natural width.
    const update = () =>
      setWidth(
        container.clientWidth > 0
          ? container.clientWidth - 2 * CELL_PADDING
          : undefined
      )
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      data-slot='table-row-panel'
      className='sticky left-2 min-w-0 whitespace-normal'
      style={width === undefined ? undefined : { width }}
    >
      {children}
    </div>
  )
}

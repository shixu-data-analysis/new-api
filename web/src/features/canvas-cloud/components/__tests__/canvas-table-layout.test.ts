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
import type { ColumnDef } from '@tanstack/react-table'
import { describe, expect, it } from 'vitest'

import { withCanvasColumnAlignment } from '../canvas-table-layout'

type Row = { name: string; points: string }

describe('Canvas table column alignment', () => {
  it('aligns the header and cells of end-aligned columns together and keeps page classes', () => {
    const columns: ColumnDef<Row, unknown>[] = [
      { accessorKey: 'name', header: 'Name' },
      {
        id: 'points',
        accessorKey: 'points',
        header: 'Points',
        meta: { align: 'end' },
      },
    ]
    const className = withCanvasColumnAlignment(columns, (columnId, kind) =>
      columnId === 'points' && kind === 'cell' ? 'font-medium' : undefined
    )

    expect(className('points', 'header')).toContain('[&>div]:justify-end')
    expect(className('points', 'header')).toContain('text-right')
    expect(className('points', 'cell')).toBe(
      'font-medium text-right tabular-nums'
    )
    expect(className('name', 'header')).toBeUndefined()
    expect(className('name', 'cell')).toBeUndefined()
  })
})

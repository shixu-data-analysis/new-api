import type { ColumnDef } from '@tanstack/react-table'

export const canvasStaticColumnWidth = {
  compact: 'w-32 min-w-32',
  standard: 'w-40 min-w-40',
  wide: 'w-52 min-w-52',
  detail: 'w-64 min-w-64',
} as const

const COMPACT_COLUMN =
  /(^|[-_])(action|actions|status|type|outcome|version|quality|count|total|points|amount|balance|billing|execution|reconciliation|source|visibility|category|used|capacity)($|[-_])/i
const TIME_COLUMN =
  /(^|[-_])(time|date|created|updated|expires|accepted|completed|effective|published|redeemed|issued)($|[-_])/i
const WIDE_COLUMN =
  /(^|[-_])(id|code|reference|order|model|customer|username|email|name|provider|inviter)($|[-_])/i
const DETAIL_COLUMN =
  /(^|[-_])(reason|description|resource|details|summary|configuration)($|[-_])/i

export function canvasTableColumnSize(identifier: string): number {
  if (DETAIL_COLUMN.test(identifier)) return 256
  if (TIME_COLUMN.test(identifier)) return 208
  if (WIDE_COLUMN.test(identifier)) return 208
  if (COMPACT_COLUMN.test(identifier)) return 128
  return 160
}

export function withCanvasTableColumnSizes<TData>(
  columns: ColumnDef<TData, unknown>[]
): ColumnDef<TData, unknown>[] {
  return columns.map((column) => {
    if (column.size !== undefined) return column
    const identity = column as { id?: string; accessorKey?: string }
    const identifier = identity.id ?? identity.accessorKey ?? ''
    return { ...column, size: canvasTableColumnSize(identifier) }
  })
}

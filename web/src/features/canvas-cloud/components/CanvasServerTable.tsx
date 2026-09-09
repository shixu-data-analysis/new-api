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
import type { ColumnDef, Row, VisibilityState } from '@tanstack/react-table'
import { useId, type ReactNode } from 'react'

import {
  DataTablePage,
  DataTableToolbar,
  useDataTable,
} from '@/components/data-table'
import {
  DataTableColumnFilterField,
  DataTableColumnFilterPanel,
} from '@/components/data-table/toolbar/column-filter-panel'
import { Input } from '@/components/ui/input'

import type { CanvasServerTableState } from '../use-server-table-state'
import { withCanvasTableColumnSizes } from './canvas-table-layout'

export function CanvasServerTable<TData>({
  data,
  columns,
  total,
  state,
  searchLabel,
  loading,
  emptyTitle,
  additionalFilters,
  hasActiveFilters = false,
  activeFilterCount,
  onResetFilters,
  getRowId,
  getRowClassName,
  renderRow,
  renderExpandedContent,
  initialColumnVisibility,
}: {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  total: number
  state: CanvasServerTableState
  searchLabel?: string
  loading?: boolean
  emptyTitle: string
  additionalFilters?: React.ReactNode
  hasActiveFilters?: boolean
  activeFilterCount?: number
  onResetFilters?: () => void
  getRowId: (row: TData) => string
  getRowClassName?: (
    row: Row<TData>,
    context: { isMobile: boolean }
  ) => string | undefined
  renderRow?: (row: Row<TData>) => ReactNode
  renderExpandedContent?: (row: Row<TData>) => ReactNode
  initialColumnVisibility?: VisibilityState
}) {
  const { pagination, setPagination, sorting, setSorting, search, setSearch } =
    state
  const searchId = useId()
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize))
  const sizedColumns = withCanvasTableColumnSizes(columns)
  const visibleActiveFilterCount =
    activeFilterCount ?? (search.trim() ? 1 : 0) + (hasActiveFilters ? 1 : 0)
  const { table } = useDataTable({
    data,
    columns: sizedColumns,
    totalCount: total,
    pageCount,
    pagination,
    onPaginationChange: setPagination,
    sorting,
    onSortingChange: setSorting,
    globalFilter: search,
    columnFilters: [],
    onGlobalFilterChange: (updater) =>
      setSearch(typeof updater === 'function' ? updater(search) : updater),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    getRowId,
    initialColumnVisibility,
  })

  return (
    <DataTablePage
      table={table}
      columns={sizedColumns}
      isLoading={loading}
      isFetching={loading}
      emptyTitle={emptyTitle}
      fixedHeight={false}
      paginationInFooter={false}
      getRowClassName={getRowClassName}
      renderRow={renderRow ? (row) => renderRow(row) : undefined}
      mobileProps={{ renderExpandedContent }}
      applyHeaderSize
      toolbar={
        <DataTableToolbar
          table={table}
          filterPanel={
            <DataTableColumnFilterPanel activeCount={visibleActiveFilterCount}>
              {searchLabel ? (
                <DataTableColumnFilterField
                  label={searchLabel}
                  htmlFor={searchId}
                >
                  <Input
                    id={searchId}
                    className='min-w-0'
                    value={search}
                    placeholder={searchLabel}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </DataTableColumnFilterField>
              ) : null}
              {additionalFilters}
            </DataTableColumnFilterPanel>
          }
          onReset={() => {
            setSearch('')
            onResetFilters?.()
          }}
          hasAdditionalFilters={hasActiveFilters}
        />
      }
    />
  )
}

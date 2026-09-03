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
import type { ColumnDef, Row } from '@tanstack/react-table'
import { useId } from 'react'

import {
  DataTablePage,
  DataTableToolbar,
  useDataTable,
} from '@/components/data-table'
import { Input } from '@/components/ui/input'

import type { CanvasServerTableState } from '../use-server-table-state'
import { withCanvasTableColumnSizes } from './canvas-table-layout'
import {
  CanvasColumnFilterField,
  CanvasColumnFilterPanel,
} from './CanvasColumnFilterPanel'

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
      applyHeaderSize
      toolbar={
        <DataTableToolbar
          table={table}
          stableGrid
          customSearch={
            <CanvasColumnFilterPanel activeCount={visibleActiveFilterCount}>
              {searchLabel ? (
                <CanvasColumnFilterField label={searchLabel} htmlFor={searchId}>
                  <Input
                    id={searchId}
                    className='min-w-0'
                    value={search}
                    placeholder={searchLabel}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </CanvasColumnFilterField>
              ) : null}
              {additionalFilters}
            </CanvasColumnFilterPanel>
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

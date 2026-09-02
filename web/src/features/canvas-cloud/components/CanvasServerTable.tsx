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
import { Label } from '@/components/ui/label'

import type { CanvasServerTableState } from '../use-server-table-state'

export function CanvasServerTable<TData>({
  data,
  columns,
  total,
  state,
  searchPlaceholder,
  searchLabel,
  searchDescription,
  loading,
  emptyTitle,
  additionalFilters,
  hasActiveFilters = false,
  onResetFilters,
  getRowId,
  getRowClassName,
}: {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  total: number
  state: CanvasServerTableState
  searchPlaceholder: string
  searchLabel?: string
  searchDescription?: string
  loading?: boolean
  emptyTitle: string
  additionalFilters?: React.ReactNode
  hasActiveFilters?: boolean
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
  const searchDescriptionId = `${searchId}-description`
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize))
  const { table } = useDataTable({
    data,
    columns,
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
      columns={columns}
      isLoading={loading}
      isFetching={loading}
      emptyTitle={emptyTitle}
      fixedHeight={false}
      paginationInFooter={false}
      getRowClassName={getRowClassName}
      toolbar={
        <DataTableToolbar
          table={table}
          searchPlaceholder={searchPlaceholder}
          searchDebounceMs={0}
          customSearch={
            searchLabel || searchDescription ? (
              <div className='w-full space-y-1 sm:w-[280px] lg:w-[360px]'>
                {searchLabel ? (
                  <Label htmlFor={searchId}>{searchLabel}</Label>
                ) : null}
                <Input
                  id={searchId}
                  value={search}
                  placeholder={searchPlaceholder}
                  aria-describedby={
                    searchDescription ? searchDescriptionId : undefined
                  }
                  onChange={(event) => setSearch(event.target.value)}
                />
                {searchDescription ? (
                  <p
                    id={searchDescriptionId}
                    className='text-muted-foreground text-xs leading-relaxed'
                  >
                    {searchDescription}
                  </p>
                ) : null}
              </div>
            ) : undefined
          }
          additionalSearch={additionalFilters}
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

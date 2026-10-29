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
import { useId, useMemo, type ReactNode } from 'react'

import {
  type DataTableColumnClassName,
  DataTablePage,
  DataTableToolbar,
  useDataTable,
} from '@/components/data-table'
import {
  DataTableColumnFilterField,
  DataTableColumnFilterPanel,
} from '@/components/data-table/toolbar/column-filter-panel'
import { ErrorState } from '@/components/error-state'
import { Input } from '@/components/ui/input'

import type { CanvasServerTableState } from '../use-server-table-state'
import {
  withCanvasColumnAlignment,
  withCanvasTableColumnSizes,
} from './canvas-table-layout'

const FILLER_COLUMN_ID = '__canvas_filler'

/** Blank trailing column: no header or content, not in the column list, hidden in mobile cards and from assistive technology. */
function fillerColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: FILLER_COLUMN_ID,
    header: () => null,
    cell: () => null,
    enableSorting: false,
    enableHiding: false,
    meta: { mobileHidden: true, presentational: true },
  }
}

export function CanvasServerTable<TData>({
  data,
  columns,
  total,
  state,
  searchLabel,
  searchPlaceholder,
  loading,
  error = false,
  errorTitle,
  onRetry,
  emptyTitle,
  emptyDescription,
  filteredEmptyTitle,
  additionalFilters,
  filterTags,
  selectionActions,
  hasActiveFilters = false,
  activeFilterCount,
  onResetFilters,
  getRowId,
  getRowClassName,
  renderRow,
  renderExpandedContent,
  initialColumnVisibility,
  getColumnClassName,
  hideMobile = false,
}: {
  data: TData[]
  columns: ColumnDef<TData, unknown>[]
  total: number
  state: CanvasServerTableState
  searchLabel?: string
  searchPlaceholder?: string
  loading?: boolean
  error?: boolean
  errorTitle?: string
  onRetry?: () => void
  emptyTitle: string
  /** Replaces the generic hint under the empty title when the table explains why it has no rows. */
  emptyDescription?: string
  filteredEmptyTitle?: string
  additionalFilters?: React.ReactNode
  /** Removable tags of the active filters, shown beside the column-filter button. */
  filterTags?: ReactNode
  /** Actions on the selected rows, after the filter button (for example 删除所选). */
  selectionActions?: ReactNode
  hasActiveFilters?: boolean
  activeFilterCount?: number
  onResetFilters?: () => void
  getRowId: (row: TData) => string
  getRowClassName?: (
    row: Row<TData>,
    context: { isMobile: boolean }
  ) => string | undefined
  /** A custom row passes `getColumnClassName` to its `DataTableRow`, so column widths and alignment match the header. */
  renderRow?: (
    row: Row<TData>,
    getColumnClassName: DataTableColumnClassName
  ) => ReactNode
  renderExpandedContent?: (row: Row<TData>) => ReactNode
  initialColumnVisibility?: VisibilityState
  getColumnClassName?: DataTableColumnClassName
  hideMobile?: boolean
}) {
  const { pagination, setPagination, sorting, setSorting, search, setSearch } =
    state
  const searchId = useId()
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize))
  // A blank trailing column takes the width the real columns leave, so every real column keeps its tier width and a
  // right-aligned last column stays next to its neighbours instead of being pushed to the far edge.
  const sizedColumns = useMemo(
    () => [...withCanvasTableColumnSizes(columns), fillerColumn<TData>()],
    [columns]
  )
  // Stable per columns so memoized rows are not re-rendered by a new class callback.
  const columnClassName = useMemo(
    () => withCanvasColumnAlignment(columns, getColumnClassName),
    [columns, getColumnClassName]
  )
  // Tables without search or filter fields keep the toolbar slot but show no empty panel.
  const hasFilterFields = Boolean(searchLabel || additionalFilters)
  const visibleActiveFilterCount =
    (search.trim() ? 1 : 0) + (activeFilterCount ?? (hasActiveFilters ? 1 : 0))
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

  // Table rule: without a column that can be hidden there is no "Display" menu.
  const hasHideableColumn = table
    .getAllLeafColumns()
    .some(
      (column) =>
        column.id !== FILLER_COLUMN_ID &&
        typeof column.accessorFn !== 'undefined' &&
        column.getCanHide()
    )
  // Real columns get their tier width; only the blank trailing column has none, so it takes the rest.
  const visibleColumns = table.getVisibleLeafColumns()
  const colgroup = (
    <colgroup>
      {visibleColumns.map((column) => (
        <col
          key={column.id}
          style={
            column.id === FILLER_COLUMN_ID
              ? undefined
              : { width: column.getSize() }
          }
        />
      ))}
    </colgroup>
  )

  return (
    <div className='space-y-3'>
      {error ? (
        <ErrorState className='min-h-0' title={errorTitle} onRetry={onRetry} />
      ) : null}
      <DataTablePage
        table={table}
        columns={sizedColumns}
        isLoading={loading}
        isFetching={loading}
        emptyTitle={
          filteredEmptyTitle && (search.trim() || hasActiveFilters)
            ? filteredEmptyTitle
            : emptyTitle
        }
        emptyDescription={emptyDescription}
        fixedHeight={false}
        viewportBoundedTable
        paginationInFooter={false}
        getRowClassName={getRowClassName}
        getColumnClassName={columnClassName}
        renderRow={
          renderRow ? (row) => renderRow(row, columnClassName) : undefined
        }
        mobileProps={{ renderExpandedContent }}
        colgroup={colgroup}
        // A tier width is a lower bound: longer content widens only its own column, and a container narrower than
        // the content scrolls the table sideways instead of squeezing the other columns below their tier.
        tableStyle={{ minWidth: 'max-content' }}
        hideMobile={hideMobile}
        toolbar={
          <DataTableToolbar
            table={table}
            filterPanel={
              <div className='flex min-w-0 flex-wrap items-center gap-2'>
                {hasFilterFields ? (
                  <DataTableColumnFilterPanel
                    activeCount={visibleActiveFilterCount}
                  >
                    {searchLabel ? (
                      <DataTableColumnFilterField
                        label={searchLabel}
                        htmlFor={searchId}
                      >
                        <Input
                          id={searchId}
                          className='min-w-0'
                          value={search}
                          placeholder={searchPlaceholder ?? searchLabel}
                          onChange={(event) => setSearch(event.target.value)}
                        />
                      </DataTableColumnFilterField>
                    ) : null}
                    {additionalFilters}
                  </DataTableColumnFilterPanel>
                ) : null}
                {filterTags}
                {selectionActions}
              </div>
            }
            onReset={() => {
              setSearch('')
              onResetFilters?.()
            }}
            hasAdditionalFilters={hasActiveFilters}
            hideViewOptions={!hasHideableColumn}
          />
        }
      />
    </div>
  )
}

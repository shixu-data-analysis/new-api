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
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePagination,
  DataTableToolbar,
  DataTableView,
  useDataTable,
} from '@/components/data-table'
import { Input } from '@/components/ui/input'

import { withCanvasTableColumnSizes } from './canvas-table-layout'
import {
  CanvasColumnFilterField,
  CanvasColumnFilterPanel,
} from './CanvasColumnFilterPanel'

export type PricingRecordFilter = {
  columnId: string
  label: string
}

export function PricingRecordsTable<TData>(props: {
  columns: ColumnDef<TData, unknown>[]
  data: TData[]
  filters: PricingRecordFilter[]
  getRowId: (row: TData) => string
  initialSorting?: SortingState
  emptyTitle: string
}) {
  const { t } = useTranslation()
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const filterIds = useMemo(
    () => new Set(props.filters.map((filter) => filter.columnId)),
    [props.filters]
  )
  const columns = useMemo(
    () =>
      withCanvasTableColumnSizes(props.columns).map((column) => {
        const filterable =
          typeof column.id === 'string' && filterIds.has(column.id)
        return {
          ...column,
          enableColumnFilter: filterable,
          filterFn: filterable ? 'includesString' : column.filterFn,
        }
      }),
    [filterIds, props.columns]
  )
  const { table } = useDataTable({
    data: props.data,
    columns,
    getRowId: props.getRowId,
    columnFilters,
    onColumnFiltersChange: setColumnFilters,
    initialSorting: props.initialSorting,
    initialPagination: { pageIndex: 0, pageSize: 20 },
    autoResetPageIndex: true,
  })

  return (
    <div className='space-y-3'>
      <DataTableToolbar
        table={table}
        stableGrid
        customSearch={
          <CanvasColumnFilterPanel activeCount={columnFilters.length}>
            {props.filters.map((filter) => {
              const column = table.getColumn(filter.columnId)
              if (!column) return null
              return (
                <CanvasColumnFilterField
                  key={filter.columnId}
                  label={filter.label}
                  htmlFor={`pricing-filter-${filter.columnId}`}
                >
                  <Input
                    id={`pricing-filter-${filter.columnId}`}
                    value={
                      (column.getFilterValue() as string | undefined) ?? ''
                    }
                    onChange={(event) =>
                      column.setFilterValue(event.target.value || undefined)
                    }
                    placeholder={filter.label}
                  />
                </CanvasColumnFilterField>
              )
            })}
          </CanvasColumnFilterPanel>
        }
        hasAdditionalFilters={columnFilters.length > 0}
        onReset={() => setColumnFilters([])}
      />

      <DataTableView
        table={table}
        containerProps={{ 'aria-label': props.emptyTitle }}
        tableContainerClassName='overflow-x-auto'
        tableClassName='min-w-max'
        applyHeaderSize
        emptyTitle={props.emptyTitle}
        emptyDescription={t('No records found. Try adjusting your filters.')}
      />

      <div className='pt-2'>
        <DataTablePagination table={table} />
      </div>
    </div>
  )
}

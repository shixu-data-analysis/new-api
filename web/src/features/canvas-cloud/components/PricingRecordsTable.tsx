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
import { ListFilter, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTablePagination,
  DataTableView,
  useDataTable,
} from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [globalFilter, setGlobalFilter] = useState('')
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const hasFilters = globalFilter.length > 0 || columnFilters.length > 0
  const filterIds = useMemo(
    () => new Set(props.filters.map((filter) => filter.columnId)),
    [props.filters]
  )
  const columns = useMemo(
    () =>
      props.columns.map((column) => ({
        ...column,
        enableColumnFilter:
          typeof column.id === 'string' && filterIds.has(column.id),
      })),
    [filterIds, props.columns]
  )
  const { table } = useDataTable({
    data: props.data,
    columns,
    getRowId: props.getRowId,
    columnFilters,
    onColumnFiltersChange: setColumnFilters,
    globalFilter,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: 'includesString',
    initialSorting: props.initialSorting,
    initialPagination: { pageIndex: 0, pageSize: 20 },
    autoResetPageIndex: true,
  })

  const clearFilters = () => {
    setGlobalFilter('')
    setColumnFilters([])
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <Input
          className='sm:max-w-sm'
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder={t('Filter...')}
          aria-label={t('Search all columns')}
        />
        <div className='flex flex-wrap gap-2'>
          <Collapsible
            className='relative'
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
          >
            <CollapsibleTrigger
              render={
                <Button
                  type='button'
                  variant='outline'
                  aria-expanded={filtersOpen}
                />
              }
            >
              <ListFilter />
              {t('Column filters')}
              {columnFilters.length > 0 && (
                <span className='bg-primary text-primary-foreground rounded-full px-1.5 text-xs tabular-nums'>
                  {columnFilters.length}
                </span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className='mt-3 sm:absolute sm:left-0 sm:z-20 sm:w-[min(56rem,calc(100vw-3rem))]'>
              <div className='bg-popover grid max-h-[50vh] gap-3 overflow-y-auto rounded-lg border p-3 shadow-lg sm:grid-cols-2 lg:grid-cols-3'>
                {props.filters.map((filter) => {
                  const column = table.getColumn(filter.columnId)
                  if (!column) return null
                  return (
                    <div key={filter.columnId} className='space-y-1'>
                      <Label htmlFor={`pricing-filter-${filter.columnId}`}>
                        {filter.label}
                      </Label>
                      <Input
                        id={`pricing-filter-${filter.columnId}`}
                        value={
                          (column.getFilterValue() as string | undefined) ?? ''
                        }
                        onChange={(event) =>
                          column.setFilterValue(event.target.value || undefined)
                        }
                        placeholder={t('Filter {{column}}', {
                          column: filter.label,
                        })}
                      />
                    </div>
                  )
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
          <Button
            type='button'
            variant='ghost'
            disabled={!hasFilters}
            onClick={clearFilters}
          >
            <RotateCcw />
            {t('Clear filters')}
          </Button>
        </div>
      </div>

      <DataTableView
        table={table}
        containerProps={{ 'aria-label': props.emptyTitle }}
        tableContainerClassName='overflow-x-auto'
        tableClassName='min-w-max'
        emptyTitle={props.emptyTitle}
        emptyDescription={t('No records found. Try adjusting your filters.')}
      />

      <div className='border-t pt-3'>
        <DataTablePagination table={table} />
      </div>
    </div>
  )
}

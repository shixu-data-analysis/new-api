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
import type { Table } from '@tanstack/react-table'
import { Loader2, X as Cross2Icon } from 'lucide-react'
import * as React from 'react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks'
import { cn } from '@/lib/utils'

import {
  DataTableColumnFilterField,
  DataTableColumnFilterPanel,
} from './column-filter-panel'
import { DataTableFacetedFilter } from './faceted-filter'
import {
  getDataTableSelectedFilterValues,
  hasDataTableLegacyAllFilterValue,
  isDataTableFilterValueActive,
} from './filter-value'
import { DataTableViewOptions } from './view-options'

type FilterDef = {
  columnId: string
  title: string
  allLabel: string
  options: {
    label: string
    value: string
    icon?: React.ComponentType<{ className?: string }>
    iconNode?: React.ReactNode
    count?: number
  }[]
  singleSelect?: boolean
}

type SearchDraft = {
  baseValue: string
  value: string
}

export type DataTableToolbarProps<TData> = {
  table: Table<TData>
  /**
   * Placeholder for the default search input. Defaults to `t('Filter...')`.
   */
  searchPlaceholder?: string
  /**
   * Delay committing the default search input. Defaults to immediate updates.
   */
  searchDebounceMs?: number
  /**
   * Column id to filter on. When provided, the search input filters
   * a specific column. When omitted, the search input updates the
   * table's `globalFilter`.
   */
  searchKey?: string
  /**
   * Column filters displayed inside the shared column-filter panel.
   */
  filters?: FilterDef[]
  /**
   * An existing column-filter panel that replaces the default panel.
   */
  filterPanel?: ReactNode
  /**
   * Additional labeled fields displayed inside the column-filter panel.
   */
  additionalSearch?: ReactNode
  /**
   * Whether non-table filter inputs are currently active. Controls Clear filters visibility
   * when no column filters are set.
   */
  hasAdditionalFilters?: boolean
  /**
   * Callback invoked after the user clears the table's ordinary filters.
   */
  onReset?: () => void
  /**
   * Business actions rendered below the fixed filter and view row.
   */
  preActions?: ReactNode
  /**
   * Explicit "Search" / "Apply" callback. When provided the toolbar
   * shows a primary Search button. Filters are committed only on click
   * (form-mode workflow).
   */
  onSearch?: () => void
  /**
   * Loading state for the explicit Search button.
   */
  searchLoading?: boolean
  /**
   * Hide the View Options (column visibility) dropdown.
   */
  hideViewOptions?: boolean
  /**
   * Optional view-mode toggle (e.g. table vs. card) rendered in the right
   * action cluster, before the View Options dropdown. Typically a
   * {@link DataTableViewModeToggle}. Omitted by default.
   */
  viewToggle?: ReactNode
  /**
   * Business actions displayed in a separate row below the fixed toolbar.
   */
  leftActions?: ReactNode
  /**
   * Outer wrapper className override.
   */
  className?: string
}

/** Shared toolbar: column filters on the left, column visibility on the right. */
export function DataTableToolbar<TData>(props: DataTableToolbarProps<TData>) {
  const { t } = useTranslation()
  const [isSearchComposing, setIsSearchComposing] = useState(false)

  const filters = props.filters ?? []
  const hasSearch = props.onSearch != null

  const columnFilters = props.table.getState().columnFilters
  const hasLegacyAllFilter = columnFilters.some((filter) =>
    hasDataTableLegacyAllFilterValue(filter.value)
  )
  const activeColumnFilterCount = columnFilters.filter((filter) =>
    isDataTableFilterValueActive(filter.value)
  ).length

  React.useEffect(() => {
    if (!hasLegacyAllFilter) return

    props.table.setColumnFilters(
      columnFilters.flatMap((filter) => {
        const values = getDataTableSelectedFilterValues(filter.value)
        return values.length ? [{ ...filter, value: values }] : []
      })
    )
  }, [columnFilters, hasLegacyAllFilter, props.table])

  const isFiltered =
    activeColumnFilterCount > 0 ||
    !!props.table.getState().globalFilter ||
    !!props.hasAdditionalFilters

  const placeholder = props.searchPlaceholder ?? t('Filter...')
  const currentSearchValue = props.searchKey
    ? ((props.table.getColumn(props.searchKey)?.getFilterValue() as string) ??
      '')
    : ((props.table.getState().globalFilter as string | undefined) ?? '')

  const [searchDraft, setSearchDraft] = useState<SearchDraft | null>(null)
  const activeSearchDraft =
    searchDraft &&
    (isSearchComposing || searchDraft.baseValue === currentSearchValue)
      ? searchDraft
      : null
  const searchValue = activeSearchDraft?.value ?? currentSearchValue
  const searchDebounceMs = Math.max(0, props.searchDebounceMs ?? 0)
  const debouncedSearchValue = useDebounce(searchValue, searchDebounceMs)

  const commitSearchValue = React.useCallback(
    (value: string) => {
      if (value === currentSearchValue) {
        return
      }

      if (props.searchKey) {
        props.table.getColumn(props.searchKey)?.setFilterValue(value)
        return
      }

      props.table.setGlobalFilter(value)
    },
    [currentSearchValue, props.searchKey, props.table]
  )

  React.useEffect(() => {
    if (
      searchDebounceMs <= 0 ||
      isSearchComposing ||
      debouncedSearchValue !== searchValue
    ) {
      return
    }

    commitSearchValue(debouncedSearchValue)
  }, [
    commitSearchValue,
    debouncedSearchValue,
    isSearchComposing,
    searchDebounceMs,
    searchValue,
  ])

  const queueSearchValue = (value: string) => {
    if (searchDebounceMs <= 0) {
      commitSearchValue(value)
    }
  }

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setSearchDraft({ baseValue: currentSearchValue, value })

    if (!isSearchComposing) {
      queueSearchValue(value)
    }
  }

  const handleSearchCompositionStart = () => {
    setIsSearchComposing(true)
  }

  const handleSearchCompositionEnd = (
    event: React.CompositionEvent<HTMLInputElement>
  ) => {
    setIsSearchComposing(false)
    const value = event.currentTarget.value
    setSearchDraft({ baseValue: currentSearchValue, value })
    queueSearchValue(value)
  }

  const searchInput = (
    <Input
      aria-label={placeholder}
      placeholder={placeholder}
      value={searchValue}
      onChange={handleSearchChange}
      onCompositionStart={handleSearchCompositionStart}
      onCompositionEnd={handleSearchCompositionEnd}
      className='w-full sm:w-[200px] lg:w-[240px]'
    />
  )

  const columnFields = React.useMemo(
    () =>
      filters.map((filter) => {
        const column = props.table.getColumn(filter.columnId)
        if (!column) return null
        return (
          <DataTableFacetedFilter
            key={filter.columnId}
            column={column}
            title={filter.title}
            allLabel={filter.allLabel}
            options={filter.options}
            singleSelect={filter.singleSelect}
          />
        )
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.filters, props.table]
  )

  const handleClearFilters = () => {
    setIsSearchComposing(false)
    setSearchDraft(null)
    props.table.resetColumnFilters()
    props.table.setGlobalFilter('')
    props.table.setPageIndex(0)
    props.onReset?.()
  }

  const clearFiltersButton: ReactNode = isFiltered ? (
    <Button
      variant='ghost'
      onClick={handleClearFilters}
      className='text-muted-foreground hover:text-foreground gap-1 px-2'
    >
      {t('Clear filters')}
      <Cross2Icon />
    </Button>
  ) : null

  const searchButton = hasSearch ? (
    <Button onClick={props.onSearch} disabled={props.searchLoading}>
      {props.searchLoading && <Loader2 className='animate-spin' />}
      {t('Search')}
    </Button>
  ) : null

  const viewOptionsNode = !props.hideViewOptions ? (
    <DataTableViewOptions table={props.table} />
  ) : null

  const viewToggleNode = props.viewToggle ?? null

  const activeCount =
    activeColumnFilterCount +
    (props.table.getState().globalFilter ? 1 : 0) +
    (props.hasAdditionalFilters ? 1 : 0)
  const filterPanel = props.filterPanel ?? (
    <DataTableColumnFilterPanel activeCount={activeCount}>
      <DataTableColumnFilterField label={placeholder}>
        {searchInput}
      </DataTableColumnFilterField>
      {props.additionalSearch}
      {columnFields}
    </DataTableColumnFilterPanel>
  )

  return (
    <div className={cn('space-y-2', props.className)}>
      <div
        className='grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2'
        data-slot='data-table-toolbar'
      >
        <div
          className='flex min-w-0 flex-wrap items-center gap-2 justify-self-start'
          data-slot='data-table-filters'
        >
          {filterPanel}
          {clearFiltersButton}
          {searchButton}
        </div>
        <div
          className='flex shrink-0 items-center justify-end gap-2 justify-self-end'
          data-slot='data-table-view-options'
        >
          {viewToggleNode}
          {viewOptionsNode}
        </div>
      </div>
      {(props.leftActions || props.preActions) && (
        <div className='flex flex-wrap items-center gap-2'>
          {props.leftActions}
          {props.preActions}
        </div>
      )}
    </div>
  )
}

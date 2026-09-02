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
import type { PaginationState, SortingState } from '@tanstack/react-table'
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

import { useDebounce } from '@/hooks'

export interface CanvasServerTableState {
  pagination: PaginationState
  setPagination: Dispatch<SetStateAction<PaginationState>>
  sorting: SortingState
  setSorting: Dispatch<SetStateAction<SortingState>>
  search: string
  setSearch: Dispatch<SetStateAction<string>>
}

export function useServerTableState<TSortBy extends string>(
  defaultSortBy: TSortBy,
  initialSearch = ''
) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const [sorting, setSorting] = useState<SortingState>([
    { id: defaultSortBy, desc: true },
  ])
  const [search, setSearch] = useState(initialSearch)
  const debouncedSearch = useDebounce(search.trim(), 300)

  useEffect(() => {
    setPagination((value) => ({ ...value, pageIndex: 0 }))
  }, [debouncedSearch, sorting])

  return {
    pagination,
    setPagination,
    sorting,
    setSorting,
    search,
    setSearch,
    query: {
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize as 10 | 20 | 30 | 40 | 50 | 100,
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      sortBy: (sorting[0]?.id ?? defaultSortBy) as TSortBy,
      sortOrder:
        sorting[0]?.desc === false ? ('asc' as const) : ('desc' as const),
    },
  }
}

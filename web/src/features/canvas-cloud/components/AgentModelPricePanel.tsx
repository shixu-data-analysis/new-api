/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import { useQuery } from '@tanstack/react-query'
import type { PaginationState } from '@tanstack/react-table'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePagination, useDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { useDebounce } from '@/hooks'

import type { CanvasAgentModelPrice, CanvasAgentModelPricePage } from '../types'
import { AgentModelPriceCards } from './AgentModelPriceCards'
import { ModelFilterBar, UNTAGGED_TAG_ID } from './ModelFilterBar'

export type AgentModelPriceQuery = {
  capability?: string
  tagId?: string
  search?: string
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
}

// The grid renders cards itself; the table instance only drives the shared pagination footer.
const NO_COLUMNS: never[] = []

/**
 * Current model prices for an agent's customers, laid out like the model center and paged by Cloud. Shared by the agent's
 * own page and the administrator's agent statistics; it queries only while `enabled`.
 */
export function AgentModelPricePanel(props: {
  queryKey: readonly unknown[]
  fetchPrices: (
    query: AgentModelPriceQuery,
    signal?: AbortSignal
  ) => Promise<CanvasAgentModelPricePage>
  enabled?: boolean
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [capability, setCapability] = useState('')
  const [tagId, setTagId] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const debouncedSearch = useDebounce(search.trim(), 300)
  useEffect(() => {
    setPagination((value) => ({ ...value, pageIndex: 0 }))
  }, [capability, tagId, debouncedSearch])

  const prices = useQuery({
    queryKey: [
      ...props.queryKey,
      capability,
      tagId,
      debouncedSearch,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: ({ signal }) =>
      props.fetchPrices(
        {
          page: pagination.pageIndex + 1,
          pageSize: pagination.pageSize as AgentModelPriceQuery['pageSize'],
          ...(capability ? { capability } : {}),
          ...(tagId
            ? { tagId: tagId === UNTAGGED_TAG_ID ? 'UNTAGGED' : tagId }
            : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
        signal
      ),
    placeholderData: (previousData) => previousData,
    enabled: props.enabled !== false,
  })
  const items: CanvasAgentModelPrice[] = prices.data?.items ?? []
  const total = prices.data?.total ?? 0
  const filters = prices.data?.filters
  const { table } = useDataTable({
    data: items,
    columns: NO_COLUMNS,
    totalCount: total,
    pageCount: Math.max(1, Math.ceil(total / pagination.pageSize)),
    pagination,
    onPaginationChange: setPagination,
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    getRowId: (row) => row.customerModelId,
  })
  const filtered = Boolean(search.trim() || capability || tagId)

  let content
  if (prices.isError) {
    content = <ErrorState onRetry={() => void prices.refetch()} />
  } else if (prices.isPending) {
    content = <LoadingState />
  } else if (items.length === 0) {
    content = (
      <p className='text-muted-foreground text-sm' role='status'>
        {filtered ? t('No matching models') : t('No current model prices')}
      </p>
    )
  } else {
    content = <AgentModelPriceCards models={items} />
  }

  return (
    <div className='space-y-4'>
      <ModelFilterBar
        capabilities={filters?.capabilities ?? []}
        capability={capability}
        onCapabilityChange={(value) => {
          setCapability(value)
          setTagId('')
        }}
        tags={filters?.tags ?? []}
        totalCount={filters?.totalCount ?? 0}
        untaggedCount={filters?.untaggedCount ?? 0}
        tagId={tagId}
        onTagChange={setTagId}
        search={search}
        onSearchChange={setSearch}
      />
      {content}
      <DataTablePagination table={table} />
    </div>
  )
}

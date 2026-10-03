/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import type { PaginationState } from '@tanstack/react-table'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePagination, useDataTable } from '@/components/data-table'
import {
  DataTableColumnFilterField,
  DataTableColumnFilterPanel,
} from '@/components/data-table/toolbar/column-filter-panel'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks'

import type { CanvasAgentModelPrice, CanvasAgentModelPricePage } from '../types'
import { AgentModelPriceCards } from './AgentModelPriceCards'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'

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
 * Current model prices for an agent's customers, collapsed by default so the query only runs once opened.
 * Shared by the agent's own page and the administrator's agent statistics.
 */
export function AgentModelPricePanel(props: {
  queryKey: readonly unknown[]
  fetchPrices: (
    query: AgentModelPriceQuery,
    signal?: AbortSignal
  ) => Promise<CanvasAgentModelPricePage>
  enabled?: boolean
  // 'card' fits pages made of Cards; 'section' fits pages made of titled sections.
  variant?: 'card' | 'section'
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
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
          ...(tagId ? { tagId } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
        signal
      ),
    placeholderData: (previousData) => previousData,
    enabled: open && props.enabled !== false,
  })
  const items: CanvasAgentModelPrice[] = prices.data?.items ?? []
  const total = prices.data?.total ?? 0
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
  const activeCount = [search.trim(), capability, tagId].filter(Boolean).length

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

  const toggle = (
    <Button type='button' aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? t('Collapse') : t('Expand')}
      <ChevronDown
        aria-hidden='true'
        className={open ? 'rotate-180' : undefined}
      />
    </Button>
  )
  const description = t(
    'Prices for the price groups of your current customers.'
  )
  const body = (
    <>
      <DataTableColumnFilterPanel
        activeCount={activeCount}
        onClear={() => {
          setSearch('')
          setCapability('')
          setTagId('')
        }}
      >
        <DataTableColumnFilterField label={t('Model name')}>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('Model name')}
            aria-label={t('Model name')}
          />
        </DataTableColumnFilterField>
        <DataTableColumnFilterField label={t('Generation type')}>
          <Select
            value={capability || 'ALL'}
            onValueChange={(value) =>
              setCapability(value === 'ALL' ? '' : (value ?? ''))
            }
          >
            <SelectTrigger aria-label={t('Generation type')}>
              <CanvasLocalizedSelectValue
                value={capability}
                emptyLabelKey='All types'
                displayValue={capability ? t(capability) : undefined}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>{t('All types')}</SelectItem>
              {prices.data?.filters.capabilities.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DataTableColumnFilterField>
        <DataTableColumnFilterField label={t('Tag')}>
          <Select
            value={tagId || 'ALL'}
            onValueChange={(value) =>
              setTagId(value === 'ALL' ? '' : (value ?? ''))
            }
          >
            <SelectTrigger aria-label={t('Tag')}>
              <CanvasLocalizedSelectValue
                value={tagId}
                emptyLabelKey='All tags'
                displayValue={
                  prices.data?.filters.tags.find((tag) => tag.id === tagId)
                    ?.name
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>{t('All tags')}</SelectItem>
              {prices.data?.filters.tags.map((tag) => (
                <SelectItem key={tag.id} value={tag.id}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DataTableColumnFilterField>
      </DataTableColumnFilterPanel>
      {content}
      <DataTablePagination table={table} />
    </>
  )

  if (props.variant === 'section') {
    return (
      <section className='space-y-3'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <h3 className='font-semibold'>{t('Current model prices')}</h3>
            <p className='text-muted-foreground text-sm'>{description}</p>
          </div>
          {toggle}
        </div>
        {open ? <div className='space-y-3'>{body}</div> : null}
      </section>
    )
  }
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between'>
        <div>
          <CardTitle>{t('Current model prices')}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {toggle}
      </CardHeader>
      {open ? <CardContent className='space-y-3'>{body}</CardContent> : null}
    </Card>
  )
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePagination } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useDebounce } from '@/hooks'
import { getServerErrorStatus } from '@/lib/server-error-message'

import { getCanvasModelMonitoringOverview } from '../api'
import type {
  CanvasModelMonitoringOverview,
  CanvasModelMonitoringOverviewQuery,
} from '../types'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { LogicalModelControlDialog } from './LogicalModelControlDialog'
import {
  ModelMonitoringChart,
  ModelMonitoringMatrix,
} from './ModelMonitoringResults'
import { ModelTagFilterButton } from './ModelTagFilterButton'

type PresetWindow = 'hour' | 'day' | 'week' | 'month'
type Window = PresetWindow | 'custom'
type ModelRow = CanvasModelMonitoringOverview['rows'][number]
type PageSize = CanvasModelMonitoringOverviewQuery['pageSize']

const windows: Array<{ value: Window; label: string }> = [
  { value: 'hour', label: 'Last hour' },
  { value: 'day', label: 'Last 24 hours' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
]
const maximumCustomRangeMilliseconds = 30 * 86_400_000
const monitoringPaginationColumns: ColumnDef<ModelRow, unknown>[] = [
  { id: 'modelKey', accessorKey: 'modelKey' },
]

function FilterButton(props: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type='button'
      size='sm'
      variant={props.selected ? 'default' : 'outline'}
      aria-pressed={props.selected}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  )
}

export function ModelMonitoringOverview() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [rangeSelection, setRangeSelection] = useState<Window>('day')
  const [appliedWindow, setAppliedWindow] = useState<Window>('day')
  const [draftFrom, setDraftFrom] = useState<Date>()
  const [draftTo, setDraftTo] = useState<Date>()
  const [appliedFrom, setAppliedFrom] = useState<string>()
  const [appliedTo, setAppliedTo] = useState<string>()
  const [origin, setOrigin] = useState<'REAL' | 'MOCK'>('REAL')
  const [capability, setCapability] = useState('')
  const [providerId, setProviderId] = useState('')
  const [tagId, setTagId] = useState('')
  const [tagsOpen, setTagsOpen] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search.trim(), 300)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null)
  const [control, setControl] = useState<ModelRow | null>(null)
  const queryKey = useMemo(
    () =>
      [
        'canvas-cloud',
        'model-monitoring-overview',
        appliedWindow,
        appliedFrom,
        appliedTo,
        origin,
        capability,
        providerId,
        tagId,
        debouncedSearch,
        page,
        pageSize,
      ] as const,
    [
      appliedWindow,
      appliedFrom,
      appliedTo,
      origin,
      capability,
      providerId,
      tagId,
      debouncedSearch,
      page,
      pageSize,
    ]
  )
  const monitoring = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      getCanvasModelMonitoringOverview(
        {
          window: appliedWindow,
          origin,
          page,
          pageSize,
          ...(appliedWindow === 'custom' && appliedFrom && appliedTo
            ? { from: appliedFrom, to: appliedTo }
            : {}),
          ...(capability ? { capability } : {}),
          ...(providerId ? { providerId } : {}),
          ...(tagId === 'untagged' ? { untagged: true as const } : {}),
          ...(tagId && tagId !== 'untagged' ? { tagId } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
        signal
      ),
  })
  const data = monitoring.data
  const rows = data?.rows ?? []
  const paginationTable = useReactTable({
    data: rows,
    columns: monitoringPaginationColumns,
    rowCount: data?.total ?? 0,
    pageCount: Math.max(1, Math.ceil((data?.total ?? 0) / pageSize)),
    manualPagination: true,
    state: { pagination: { pageIndex: page - 1, pageSize } },
    onPaginationChange: (updater) => {
      const current = { pageIndex: page - 1, pageSize }
      const next = typeof updater === 'function' ? updater(current) : updater
      setPage(next.pageSize === pageSize ? next.pageIndex + 1 : 1)
      setPageSize(next.pageSize as PageSize)
      setSelectedKey(null)
      setSelectedBucket(null)
    },
    getCoreRowModel: getCoreRowModel(),
  })
  const selectedModel =
    rows.find((row) => row.modelKey === selectedKey) ?? rows[0] ?? null
  const currentKey = selectedModel?.modelKey ?? null

  useEffect(() => {
    if (data && data.page !== page) {
      queryClient.setQueryData(
        [...queryKey.slice(0, -2), data.page, pageSize],
        data
      )
      setPage(data.page)
    }
  }, [data, page, pageSize, queryClient, queryKey])

  const resetPage = () => {
    setPage(1)
    setSelectedKey(null)
    setSelectedBucket(null)
  }
  const clearFilters = () => {
    setCapability('')
    setProviderId('')
    setTagId('')
    setSearch('')
    resetPage()
  }
  const customRangeValid = Boolean(
    draftFrom &&
    draftTo &&
    Number.isFinite(+draftFrom) &&
    Number.isFinite(+draftTo) &&
    +draftFrom < +draftTo &&
    +draftTo - +draftFrom <= maximumCustomRangeMilliseconds
  )
  const customRangeStarted = Boolean(draftFrom || draftTo)
  const changeWindow = (value: Window) => {
    setRangeSelection(value)
    if (value === 'custom') return
    setAppliedWindow(value)
    setAppliedFrom(undefined)
    setAppliedTo(undefined)
    resetPage()
  }
  const applyCustomRange = () => {
    if (!customRangeValid || !draftFrom || !draftTo) return
    setAppliedWindow('custom')
    setAppliedFrom(draftFrom.toISOString())
    setAppliedTo(draftTo.toISOString())
    resetPage()
  }
  const changeOrigin = (value: 'REAL' | 'MOCK') => {
    setOrigin(value)
    setSelectedBucket(null)
  }
  const queryError =
    getServerErrorStatus(monitoring.error) === 403
      ? t('You are not allowed to view this model monitoring.')
      : t('Model monitoring could not be loaded')

  return (
    <div className='space-y-4'>
      <Card>
        <CardContent className='space-y-3 pt-5'>
          <div>
            <p className='mb-2 text-sm font-medium'>{t('Generation type')}</p>
            <div
              className='flex flex-wrap gap-2'
              role='group'
              aria-label={t('Generation type')}
            >
              <FilterButton
                selected={!capability}
                onClick={() => {
                  setCapability('')
                  resetPage()
                }}
              >
                {t('All types')}
              </FilterButton>
              {data?.capabilities.map((item) => (
                <FilterButton
                  key={item.value}
                  selected={capability === item.value}
                  onClick={() => {
                    setCapability(item.value)
                    resetPage()
                  }}
                >
                  {t(item.value)}
                </FilterButton>
              ))}
            </div>
          </div>
          <div>
            <p className='mb-2 text-sm font-medium'>{t('API provider')}</p>
            <div
              className='flex flex-wrap gap-2'
              role='group'
              aria-label={t('API provider')}
            >
              <FilterButton
                selected={!providerId}
                onClick={() => {
                  setProviderId('')
                  resetPage()
                }}
              >
                {t('All API providers')}
              </FilterButton>
              {data?.providers.map((item) => (
                <FilterButton
                  key={item.id}
                  selected={providerId === item.id}
                  onClick={() => {
                    setProviderId(item.id)
                    resetPage()
                  }}
                >
                  {item.name}
                </FilterButton>
              ))}
            </div>
          </div>
          <div>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              aria-expanded={tagsOpen}
              aria-controls='monitoring-tag-options'
              onClick={() => setTagsOpen((open) => !open)}
            >
              {t('Model tags')}
            </Button>
            {tagsOpen ? (
              <div
                id='monitoring-tag-options'
                className='mt-2 flex flex-wrap gap-2'
                role='group'
                aria-label={t('Model tags')}
              >
                <ModelTagFilterButton
                  label={t('All tags')}
                  count={data?.preTagTotal ?? 0}
                  selected={!tagId}
                  onClick={() => {
                    setTagId('')
                    resetPage()
                  }}
                />
                {data?.tags.map((tag) => (
                  <ModelTagFilterButton
                    key={tag.id}
                    label={tag.name}
                    count={tag.count}
                    selected={tagId === tag.id}
                    onClick={() => {
                      setTagId(tag.id)
                      resetPage()
                    }}
                  />
                ))}
                <ModelTagFilterButton
                  label={t('Untagged')}
                  count={data?.untaggedCount ?? 0}
                  selected={tagId === 'untagged'}
                  onClick={() => {
                    setTagId('untagged')
                    resetPage()
                  }}
                />
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className='space-y-3 pt-5'>
          <div className='flex flex-wrap items-center gap-3'>
            <div
              className='flex flex-wrap gap-2'
              role='group'
              aria-label={t('Time range')}
            >
              {windows.map((item) => (
                <FilterButton
                  key={item.value}
                  selected={rangeSelection === item.value}
                  onClick={() => changeWindow(item.value)}
                >
                  {t(item.label)}
                </FilterButton>
              ))}
            </div>
            <Input
              className='min-w-48 flex-1'
              type='search'
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                resetPage()
              }}
              placeholder={t('Search model name')}
              aria-label={t('Search model name')}
            />
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-sm font-medium'>
                {t('Execution source')}
              </span>
              <div
                className='flex gap-2'
                role='group'
                aria-label={t('Execution source')}
              >
                <FilterButton
                  selected={origin === 'REAL'}
                  onClick={() => changeOrigin('REAL')}
                >
                  {t('Real calls')}
                </FilterButton>
                <FilterButton
                  selected={origin === 'MOCK'}
                  onClick={() => changeOrigin('MOCK')}
                >
                  {t('Mock calls')}
                </FilterButton>
              </div>
            </div>
          </div>
          {rangeSelection === 'custom' ? (
            <div
              className='bg-muted/30 grid items-end gap-3 rounded-md border p-3 lg:grid-cols-[minmax(0,1fr)_auto]'
              role='group'
              aria-label={t('Custom range')}
            >
              <div className='max-w-3xl min-w-0'>
                <p className='mb-2 text-sm font-medium'>{t('Custom range')}</p>
                <CanvasDateRangeFilter
                  from={draftFrom}
                  to={draftTo}
                  onFromChange={setDraftFrom}
                  onToChange={setDraftTo}
                />
                {!customRangeValid ? (
                  <p
                    role={customRangeStarted ? 'alert' : undefined}
                    className={
                      customRangeStarted
                        ? 'text-destructive mt-2 text-sm'
                        : 'text-muted-foreground mt-2 text-sm'
                    }
                  >
                    {t('Select a positive time range of at most 30 days')}
                  </p>
                ) : null}
              </div>
              <Button
                type='button'
                disabled={!customRangeValid}
                onClick={applyCustomRange}
              >
                {t('Confirm')}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {monitoring.isPending ? <LoadingState /> : null}
      {monitoring.isError ? (
        <ErrorState
          title={queryError}
          onRetry={() => void monitoring.refetch()}
        />
      ) : null}
      {data && !monitoring.isError ? (
        <>
          <ModelMonitoringMatrix
            data={data}
            selectedKey={currentKey}
            selectedBucket={selectedBucket}
            onSelectModel={(key) => {
              setSelectedKey(key)
              setSelectedBucket(null)
            }}
            onSelectBucket={(key, bucket) => {
              setSelectedKey(key)
              setSelectedBucket(bucket)
            }}
            onControl={setControl}
          />
          {data.total === 0 ? (
            <Button variant='outline' size='sm' onClick={clearFilters}>
              {t('Clear filters')}
            </Button>
          ) : null}
          <div className='pt-2'>
            <DataTablePagination table={paginationTable} />
          </div>
          <ModelMonitoringChart
            model={selectedModel}
            selectedBucket={selectedBucket}
            onSelectBucket={setSelectedBucket}
            windowLabel={t(
              windows.find((item) => item.value === appliedWindow)?.label ??
                'Last 24 hours'
            )}
          />
        </>
      ) : null}
      {control ? (
        <LogicalModelControlDialog
          key={`${control.modelKey}:${control.controlVersion}`}
          modelKey={control.modelKey}
          name={control.name}
          manualEnabled={control.manualEnabled}
          controlVersion={control.controlVersion}
          onClose={() => setControl(null)}
          onChanged={() => {
            toast.success(t('Model state updated'))
            void queryClient.invalidateQueries({
              queryKey: ['canvas-cloud', 'model-monitoring-overview'],
            })
          }}
        />
      ) : null}
    </div>
  )
}

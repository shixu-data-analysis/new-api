/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useDebounce } from '@/hooks'
import { getServerErrorStatus } from '@/lib/server-error-message'

import { getCanvasModelMonitoringOverview } from '../api'
import type { CanvasModelMonitoringOverview } from '../types'
import { LogicalModelControlDialog } from './LogicalModelControlDialog'
import { ModelTagFilterButton } from './ModelTagFilterButton'
import {
  ModelMonitoringChart,
  ModelMonitoringMatrix,
} from './ModelMonitoringResults'

type Window = 'hour' | 'day' | 'week' | 'month'
type ModelRow = CanvasModelMonitoringOverview['rows'][number]

const windows: Array<{ value: Window; label: string }> = [
  { value: 'hour', label: 'Last hour' },
  { value: 'day', label: 'Last 24 hours' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
]
const pageSizes = [10, 20, 30, 40, 50, 100] as const

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
  const [window, setWindow] = useState<Window>('day')
  const [origin, setOrigin] = useState<'REAL' | 'MOCK'>('REAL')
  const [capability, setCapability] = useState('')
  const [providerId, setProviderId] = useState('')
  const [tagId, setTagId] = useState('')
  const [tagsOpen, setTagsOpen] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search.trim(), 300)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof pageSizes)[number]>(10)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null)
  const [control, setControl] = useState<ModelRow | null>(null)
  const queryKey = useMemo(
    () =>
      [
        'canvas-cloud',
        'model-monitoring-overview',
        window,
        origin,
        capability,
        providerId,
        tagId,
        debouncedSearch,
        page,
        pageSize,
      ] as const,
    [
      window,
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
          window,
          origin,
          page,
          pageSize,
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
  const selectedModel =
    rows.find((row) => row.modelKey === selectedKey) ?? rows[0] ?? null
  const currentKey = selectedModel?.modelKey ?? null

  useEffect(() => {
    if (data && data.page !== page) {
      queryClient.setQueryData(
        [...queryKey.slice(0, 8), data.page, pageSize],
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
  const changeWindow = (value: Window) => {
    setWindow(value)
    setSelectedBucket(null)
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
        <CardContent className='flex flex-wrap items-center gap-3 pt-5'>
          <div
            className='flex flex-wrap gap-2'
            role='group'
            aria-label={t('Time range')}
          >
            {windows.map((item) => (
              <FilterButton
                key={item.value}
                selected={window === item.value}
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
            <span className='text-sm font-medium'>{t('Execution source')}</span>
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
          <div className='flex flex-wrap items-center justify-end gap-3 text-sm'>
            <div className='flex flex-wrap items-center gap-2'>
              <label htmlFor='monitoring-page-size'>{t('Rows per page')}</label>
              <NativeSelect
                id='monitoring-page-size'
                value={pageSize}
                onChange={(event) => {
                  setPageSize(
                    Number(event.target.value) as (typeof pageSizes)[number]
                  )
                  resetPage()
                }}
              >
                {pageSizes.map((size) => (
                  <NativeSelectOption key={size} value={size}>
                    {size}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <span>
                {data.page} / {Math.max(1, Math.ceil(data.total / pageSize))}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={data.page <= 1}
                onClick={() => {
                  setPage(data.page - 1)
                  setSelectedKey(null)
                  setSelectedBucket(null)
                }}
              >
                {t('Previous')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={data.page * pageSize >= data.total}
                onClick={() => {
                  setPage(data.page + 1)
                  setSelectedKey(null)
                  setSelectedBucket(null)
                }}
              >
                {t('Next')}
              </Button>
            </div>
          </div>
          <ModelMonitoringChart
            model={selectedModel}
            selectedBucket={selectedBucket}
            onSelectBucket={setSelectedBucket}
            windowLabel={t(
              windows.find((item) => item.value === window)?.label ??
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

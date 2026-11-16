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
import { ListFilter } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePagination } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'
import { getServerErrorStatus } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { getCanvasModelMonitoringOverview } from '../api'
import {
  defaultMonitoringRange,
  type MonitoringRange,
} from '../model-monitoring-overview'
import type {
  CanvasModelMonitoringOverview,
  CanvasModelMonitoringOverviewQuery,
} from '../types'
import { ActiveFilterTags } from './ActiveFilterTags'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasTooltip } from './CanvasTooltip'
import { LogicalModelControlDialog } from './LogicalModelControlDialog'
import { ModelMonitoringDetail } from './ModelMonitoringDetail'
import {
  ModelMonitoringList,
  type ModelMonitoringRow,
} from './ModelMonitoringList'
import { ModelTagFilterButton } from './ModelTagFilterButton'

type PresetWindow = 'hour' | 'day' | 'week'
type PageSize = CanvasModelMonitoringOverviewQuery['pageSize']
type Sort = Pick<CanvasModelMonitoringOverviewQuery, 'sortBy' | 'sortOrder'>

const presets: Array<{ value: PresetWindow; label: string }> = [
  { value: 'hour', label: 'Last hour' },
  { value: 'day', label: 'Last 24 hours' },
  { value: 'week', label: 'Last 7 days' },
]
const maximumCustomRangeMilliseconds = 30 * 86_400_000
const refreshMilliseconds = 60_000
const paginationColumns: ColumnDef<ModelMonitoringRow, unknown>[] = [
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

function Totals(props: { data: CanvasModelMonitoringOverview }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const totals = props.data.totals
  const failures = totals.failed + totals.pending
  const number = (value: number) => value.toLocaleString(toIntlLocale(language))
  const rate = totals.determined
    ? new Intl.NumberFormat(toIntlLocale(language), {
        style: 'percent',
        maximumFractionDigits: 1,
      }).format(failures / totals.determined)
    : t('No data')
  const cell =
    'flex min-w-0 flex-col gap-0.5 border-s px-4 first:border-s-0 max-sm:[&:nth-child(3)]:border-s-0'
  return (
    <Card
      className='grid grid-cols-4 gap-y-3 py-3.5 max-sm:grid-cols-2'
      aria-label={t('Overview')}
    >
      <div className={cell}>
        <span className='text-muted-foreground text-sm'>
          {t('Abnormal / needs attention')}
        </span>
        <span className='text-lg font-semibold tabular-nums'>
          <span className={totals.bad ? 'text-destructive' : ''}>
            {number(totals.bad)}
          </span>
          <span className='text-muted-foreground font-normal'> / </span>
          <span
            className={totals.watch ? 'text-amber-600 dark:text-amber-400' : ''}
          >
            {number(totals.watch)}
          </span>
        </span>
        <span className='text-muted-foreground text-xs'>
          {t('Total models: {{count}}', { count: totals.models })}
        </span>
      </div>
      <div className={cell}>
        <span className='text-muted-foreground text-sm'>
          {t('Failure rate')}
        </span>
        <span className='text-lg font-semibold tabular-nums'>{rate}</span>
        <span className='text-muted-foreground text-xs tabular-nums'>
          {t('{{failures}} / {{determined}} determined results', {
            failures: number(failures),
            determined: number(totals.determined),
          })}
        </span>
      </div>
      <div className={cell}>
        <span className='text-muted-foreground text-sm'>
          {t('Confirmed failures')}
        </span>
        <span className='text-lg font-semibold tabular-nums'>
          {number(totals.failed)}
        </span>
        <span className='text-muted-foreground text-xs'>
          {t('Released after failure')}
        </span>
      </div>
      <div className={cell}>
        <span className='text-muted-foreground text-sm'>
          {t('Results pending confirmation')}
        </span>
        <span className='text-lg font-semibold tabular-nums'>
          {number(totals.pending)}
        </span>
        <span className='text-muted-foreground text-xs tabular-nums'>
          {t(
            'Frozen {{frozen}} (cannot be queried {{unqueryable}}) · released {{released}}',
            {
              frozen: number(totals.pendingFrozen),
              unqueryable: number(totals.pendingUnqueryable),
              released: number(totals.pending - totals.pendingFrozen),
            }
          )}
        </span>
      </div>
    </Card>
  )
}

export function ModelMonitoringOverview(props: {
  /** A model opened from the usage ranking; the address bar owns it so removing its tag also leaves the link. */
  focusModelKey?: string
  onClearFocus: () => void
  /** Owned by the address like the focused model; missing means the default range. */
  range?: MonitoringRange
  onRangeChange: (range: MonitoringRange) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const range = props.range ?? defaultMonitoringRange
  const appliedWindow = range.window
  const appliedFrom = range.window === 'custom' ? range.from : undefined
  const appliedTo = range.window === 'custom' ? range.to : undefined
  const [customOpen, setCustomOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState<Date>()
  const [draftTo, setDraftTo] = useState<Date>()
  const [capability, setCapability] = useState('')
  const [providerId, setProviderId] = useState('')
  const [tagId, setTagId] = useState('')
  // Filtered by its exact key; search would also match longer keys on other pages.
  const focusModelKey = props.focusModelKey ?? ''
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search.trim(), 300)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)
  const [sort, setSort] = useState<Sort>({ sortBy: 'failures' })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null)
  const [control, setControl] = useState<ModelMonitoringRow | null>(null)
  const [paused, setPaused] = useState(false)
  const custom = appliedWindow === 'custom'
  const queryKey = useMemo(
    () =>
      [
        'canvas-cloud',
        'model-monitoring-overview',
        appliedWindow,
        appliedFrom,
        appliedTo,
        capability,
        providerId,
        tagId,
        focusModelKey,
        debouncedSearch,
        sort.sortBy,
        sort.sortOrder,
        page,
        pageSize,
      ] as const,
    [
      appliedWindow,
      appliedFrom,
      appliedTo,
      capability,
      providerId,
      tagId,
      focusModelKey,
      debouncedSearch,
      sort,
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
          page,
          pageSize,
          sortBy: sort.sortBy,
          ...(sort.sortOrder ? { sortOrder: sort.sortOrder } : {}),
          ...(custom && appliedFrom && appliedTo
            ? { from: appliedFrom, to: appliedTo }
            : {}),
          ...(capability ? { capability } : {}),
          ...(providerId ? { providerId } : {}),
          ...(tagId === 'untagged' ? { untagged: true as const } : {}),
          ...(tagId && tagId !== 'untagged' ? { tagId } : {}),
          ...(focusModelKey ? { modelKey: focusModelKey } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
        signal
      ),
    // Presets follow the clock; a custom range is fixed and is not refreshed.
    refetchInterval: custom || paused ? false : refreshMilliseconds,
    placeholderData: (previous) => previous,
  })
  const data = monitoring.data
  const rows = data?.rows ?? []
  const paginationTable = useReactTable({
    data: rows,
    columns: paginationColumns,
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

  // The server returns a smaller page when the filters shrank the list; the previous query's data shown while the next page
  // loads is not such an answer.
  useEffect(() => {
    if (data && !monitoring.isPlaceholderData && data.page !== page) {
      queryClient.setQueryData(
        [...queryKey.slice(0, -2), data.page, pageSize],
        data
      )
      setPage(data.page)
    }
  }, [
    data,
    monitoring.isPlaceholderData,
    page,
    pageSize,
    queryClient,
    queryKey,
  ])

  const resetPage = () => {
    setPage(1)
    setSelectedKey(null)
    setSelectedBucket(null)
  }
  const clearFilters = () => {
    setCapability('')
    setProviderId('')
    setTagId('')
    if (focusModelKey) props.onClearFocus()
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
  // Only a range with both ends is judged; a half-chosen one keeps the neutral hint.
  const customRangeChosen = Boolean(draftFrom && draftTo)
  const choosePreset = (value: PresetWindow) => {
    setCustomOpen(false)
    props.onRangeChange({ window: value })
    resetPage()
  }
  const applyCustomRange = () => {
    if (!customRangeValid || !draftFrom || !draftTo) return
    props.onRangeChange({
      window: 'custom',
      from: draftFrom.toISOString(),
      to: draftTo.toISOString(),
    })
    setCustomOpen(false)
    resetPage()
  }
  const language = i18n.language
  const minuteFormat = new Intl.DateTimeFormat(toIntlLocale(language), {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const customLabel =
    appliedFrom && appliedTo
      ? t('{{from}} – {{to}}', {
          from: minuteFormat.format(new Date(appliedFrom)),
          to: minuteFormat.format(new Date(appliedTo)),
        })
      : t('Custom range')
  const rangeLabel = custom
    ? customLabel
    : t(
        presets.find((item) => item.value === appliedWindow)?.label ??
          'Last 7 days'
      )
  const updatedAt = monitoring.dataUpdatedAt
    ? new Intl.DateTimeFormat(toIntlLocale(language), {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(monitoring.dataUpdatedAt))
    : ''
  let refreshHint = t('Refreshes every minute; click to pause')
  if (custom) refreshHint = t('A custom range does not refresh')
  else if (paused) refreshHint = t('Paused; click to resume')
  const tagName = data?.tags.find((tag) => tag.id === tagId)?.name
  const filterTags = [
    focusModelKey && {
      key: 'model',
      label: t('{{field}}: {{value}}', {
        field: t('Model'),
        value:
          rows.find((row) => row.modelKey === focusModelKey)
            ?.effectiveDisplayName ?? focusModelKey,
      }),
      remove: () => {
        props.onClearFocus()
        resetPage()
      },
    },
    capability && {
      key: 'capability',
      label: t('{{field}}: {{value}}', {
        field: t('Generation type'),
        value: t(capability),
      }),
      remove: () => {
        setCapability('')
        resetPage()
      },
    },
    providerId && {
      key: 'provider',
      label: t('{{field}}: {{value}}', {
        field: t('API provider'),
        value:
          data?.providers.find((item) => item.id === providerId)?.name ??
          t('Loading'),
      }),
      remove: () => {
        setProviderId('')
        resetPage()
      },
    },
    tagId && {
      key: 'tag',
      label: t('{{field}}: {{value}}', {
        field: t('Model categories'),
        value:
          tagId === 'untagged' ? t('No category') : (tagName ?? t('Loading')),
      }),
      remove: () => {
        setTagId('')
        resetPage()
      },
    },
  ].filter((item): item is { key: string; label: string; remove: () => void } =>
    Boolean(item)
  )
  const queryError =
    getServerErrorStatus(monitoring.error) === 403
      ? t('You are not allowed to view this model monitoring.')
      : t('Model monitoring could not be loaded')

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Popover>
          <PopoverTrigger
            render={<Button type='button' size='sm' variant='outline' />}
          >
            <ListFilter aria-hidden='true' />
            {t('Filter')}
          </PopoverTrigger>
          <PopoverContent
            align='start'
            className='w-[min(36rem,calc(100vw-2rem))] space-y-3'
          >
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
              <p className='mb-2 text-sm font-medium'>
                {t('Model categories')}
              </p>
              <div
                className='flex flex-wrap gap-2'
                role='group'
                aria-label={t('Model categories')}
              >
                <ModelTagFilterButton
                  label={t('All categories')}
                  count={data?.preTagTotal ?? 0}
                  selected={!tagId}
                  onClick={() => {
                    setTagId('')
                    resetPage()
                  }}
                />
                {/* Categories without a model in the current filters stay hidden unless chosen. */}
                {data?.tags
                  .filter((tag) => tag.count > 0 || tagId === tag.id)
                  .map((tag) => (
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
                {((data?.untaggedCount ?? 0) > 0 || tagId === 'untagged') && (
                  <ModelTagFilterButton
                    label={t('No category')}
                    count={data?.untaggedCount ?? 0}
                    selected={tagId === 'untagged'}
                    onClick={() => {
                      setTagId('untagged')
                      resetPage()
                    }}
                  />
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <ActiveFilterTags tags={filterTags} />
        <Input
          className='w-full min-w-40 sm:w-64'
          type='search'
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            resetPage()
          }}
          placeholder={t('Search model name')}
          aria-label={t('Search model name')}
        />
        <div
          className='flex flex-wrap items-center gap-2 sm:ms-auto'
          role='group'
          aria-label={t('Time range')}
        >
          {presets.map((item) => (
            <FilterButton
              key={item.value}
              selected={!customOpen && appliedWindow === item.value}
              onClick={() => choosePreset(item.value)}
            >
              {t(item.label)}
            </FilterButton>
          ))}
          <Button
            type='button'
            size='sm'
            variant={custom || customOpen ? 'default' : 'outline'}
            aria-pressed={custom || customOpen}
            aria-expanded={customOpen}
            onClick={() => setCustomOpen((open) => !open)}
          >
            {custom ? customLabel : t('Custom range')}
          </Button>
          <CanvasTooltip content={refreshHint}>
            <button
              type='button'
              className='text-muted-foreground inline-flex items-center gap-1.5 text-sm'
              disabled={custom}
              aria-label={refreshHint}
              onClick={() => setPaused((value) => !value)}
            >
              <span
                aria-hidden='true'
                className={cn(
                  'size-1.5 rounded-full',
                  !custom && !paused ? 'bg-emerald-500' : 'bg-muted-foreground'
                )}
              />
              {!custom && !paused
                ? t('Updated {{time}}', { time: updatedAt })
                : t('Paused')}
            </button>
          </CanvasTooltip>
        </div>
      </div>
      {customOpen ? (
        <div
          className='bg-muted/30 grid items-end gap-3 rounded-md border p-3 lg:grid-cols-[minmax(0,48rem)_auto] lg:justify-start'
          role='group'
          aria-label={t('Custom range')}
        >
          <div className='min-w-0'>
            <p className='mb-2 text-sm font-medium'>{t('Custom range')}</p>
            <CanvasDateRangeFilter
              from={draftFrom}
              to={draftTo}
              onFromChange={setDraftFrom}
              onToChange={setDraftTo}
            />
            {!customRangeValid ? (
              <p
                role={customRangeChosen ? 'alert' : undefined}
                className={
                  customRangeChosen
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
      {monitoring.isPending ? <LoadingState /> : null}
      {monitoring.isError ? (
        <ErrorState
          title={queryError}
          onRetry={() => void monitoring.refetch()}
        />
      ) : null}
      {data && !monitoring.isError ? (
        <>
          <Totals data={data} />
          <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]'>
            <div className='min-w-0 space-y-2'>
              <ModelMonitoringList
                data={data}
                sort={sort}
                onSort={(next) => {
                  setSort(next)
                  resetPage()
                }}
                selectedKey={selectedModel?.modelKey ?? null}
                selectedBucket={selectedBucket}
                onSelectModel={(key) => {
                  setSelectedKey(key)
                  setSelectedBucket(null)
                }}
                onSelectBucket={(key, bucket) => {
                  const same =
                    selectedModel?.modelKey === key && selectedBucket === bucket
                  setSelectedKey(key)
                  setSelectedBucket(same ? null : bucket)
                }}
                emptyAction={
                  <Button variant='outline' size='sm' onClick={clearFilters}>
                    {t('Clear filters')}
                  </Button>
                }
              />
              <DataTablePagination table={paginationTable} />
            </div>
            {selectedModel ? (
              <div className='min-w-0 xl:sticky xl:top-4'>
                <ModelMonitoringDetail
                  key={selectedModel.modelKey}
                  model={selectedModel}
                  range={{ from: data.from, to: data.to }}
                  rangeLabel={rangeLabel}
                  selectedBucket={selectedBucket}
                  onSelectBucket={setSelectedBucket}
                  onControl={() => setControl(selectedModel)}
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      {control ? (
        <LogicalModelControlDialog
          key={`${control.modelKey}:${control.controlVersion}`}
          modelKey={control.modelKey}
          name={control.effectiveDisplayName}
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

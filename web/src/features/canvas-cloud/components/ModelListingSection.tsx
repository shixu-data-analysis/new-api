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
import { useMutation } from '@tanstack/react-query'
import type { ColumnDef, PaginationState } from '@tanstack/react-table'
import { useCallback, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DataTablePage,
  DataTableToolbar,
  useDataTable,
} from '@/components/data-table'
import {
  DataTableColumnFilterField,
  DataTableColumnFilterPanel,
} from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { formatCanvasDateTime } from '../formatters'
import {
  ignoreModelListings,
  type ListedModel,
} from '../model-availability-api'
import { CANVAS_COLUMN_SIZES, pageWithinRange } from './canvas-table-layout'
import { CanvasRowAction } from './CanvasRowAction'

// MODEL-LISTING-ALERT-001: the new provider models on the 上下架监测 page and the way to dismiss them.

const entryKey = (model: ListedModel) =>
  `${model.providerId}\n${model.upstreamId}`

function useIgnoreListings(onChanged: () => void) {
  return useMutation({
    mutationFn: (selection: Parameters<typeof ignoreModelListings>[0]) =>
      ignoreModelListings(selection),
    onSettled: onChanged,
  })
}

/** The newest time among the rows shown; ISO times of one format compare as text. */
const newestFirstSeen = (models: ListedModel[]) =>
  models.reduce(
    (newest, model) =>
      model.firstSeenAt > newest ? model.firstSeenAt : newest,
    ''
  )

function IgnoreFailed() {
  const { t } = useTranslation()
  return (
    <p role='alert' className='text-destructive text-sm'>
      {t('Ignoring failed. Try again.')}
    </p>
  )
}

/** Ignores what was shown when it was clicked: one found while the administrator confirmed is newer and stays listed. */
export function IgnoreAllListingsButton(props: {
  models: ListedModel[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState<ListedModel[] | null>(null)
  const ignore = useIgnoreListings(props.onChanged)
  return (
    <>
      <Button
        variant='outline'
        disabled={props.models.length === 0}
        onClick={() => setConfirming(props.models)}
      >
        {t('Ignore all ({{count}})', { count: props.models.length })}
      </Button>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title={t('Ignore all new models?')}
        desc={t(
          '{{count}} models leave the list and cannot be restored. Alerts already sent are not affected.',
          { count: confirming?.length ?? 0 }
        )}
        confirmText={t('Ignore all')}
        isLoading={ignore.isPending}
        handleConfirm={() => {
          if (!confirming) return
          ignore.mutate(
            { firstSeenThrough: newestFirstSeen(confirming) },
            { onSuccess: () => setConfirming(null) }
          )
        }}
      >
        {ignore.isError ? <IgnoreFailed /> : null}
      </ConfirmDialog>
    </>
  )
}

/**
 * New provider models, built like the availability table and the model list (MODEL-AVAILABILITY-TABLES-001): API
 * provider buttons, the upstream model ID in the Filters panel, Ignore all beside it, and 20 rows a page in the browser.
 */
export function ModelListingTable(props: {
  models: ListedModel[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const ignore = useIgnoreListings(props.onChanged)
  const fieldId = useId()
  const [chosenProviderId, setProviderId] = useState('')
  const [upstreamId, setUpstreamId] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const providers = useMemo(
    () => [
      ...new Map(
        props.models.map((model) => [model.providerId, model.providerName])
      ),
    ],
    [props.models]
  )
  // As the model list does: a chosen provider whose last new model was ignored filters nothing.
  const providerId = providers.some(([id]) => id === chosenProviderId)
    ? chosenProviderId
    : ''
  const query = upstreamId.trim().toLocaleLowerCase()
  const visible = useMemo(
    () =>
      props.models.filter(
        (model) =>
          (!providerId || model.providerId === providerId) &&
          (!query || model.upstreamId.toLocaleLowerCase().includes(query))
      ),
    [props.models, providerId, query]
  )
  const firstPage = () =>
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  const ensurePageInRange = useCallback((pageCount: number) => {
    setPagination(pageWithinRange(pageCount))
  }, [])
  const columns = useMemo<ColumnDef<ListedModel, unknown>[]>(
    () => [
      {
        id: 'upstreamId',
        size: CANVAS_COLUMN_SIZES.detail,
        header: t('Upstream model ID'),
        cell: ({ row }) => (
          <span className='font-mono [overflow-wrap:anywhere]'>
            {row.original.upstreamId}
          </span>
        ),
      },
      {
        id: 'provider',
        size: CANVAS_COLUMN_SIZES.wide,
        header: t('API provider'),
        cell: ({ row }) => row.original.providerName,
      },
      {
        id: 'firstFound',
        size: CANVAS_COLUMN_SIZES.wide,
        header: t('First found'),
        cell: ({ row }) => (
          <span className='tabular-nums'>
            {formatCanvasDateTime(row.original.firstSeenAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        size: CANVAS_COLUMN_SIZES.compact,
        header: t('Actions'),
        cell: ({ row }) => (
          <CanvasRowAction
            disabled={ignore.isPending}
            aria-label={t('Ignore {{model}}', {
              model: row.original.upstreamId,
            })}
            onClick={() =>
              ignore.mutate({
                items: [
                  {
                    providerId: row.original.providerId,
                    upstreamId: row.original.upstreamId,
                  },
                ],
              })
            }
          >
            {t('Ignore')}
          </CanvasRowAction>
        ),
      },
    ],
    [ignore, t]
  )
  const { table } = useDataTable({
    data: visible,
    columns,
    getRowId: entryKey,
    manualFiltering: true,
    columnFilters: [],
    globalFilter: '',
    pagination,
    onPaginationChange: setPagination,
    ensurePageInRange,
    autoResetPageIndex: false,
  })
  const title = (
    <h3 className='text-sm font-medium'>
      {t('New models ({{count}})', { count: props.models.length })}
    </h3>
  )
  if (props.models.length === 0) {
    return (
      <section className='space-y-2'>
        {title}
        <p className='text-muted-foreground text-sm'>
          {t(
            'No new models. Only models that appeared after the baseline, contain a keyword and are not yet added are listed.'
          )}
        </p>
      </section>
    )
  }
  return (
    <section className='space-y-3'>
      {title}
      <section className='space-y-2' aria-label={t('API provider')}>
        <p className='text-sm font-medium'>{t('API provider')}</p>
        <div
          className='flex flex-wrap gap-2'
          role='group'
          aria-label={t('API provider')}
        >
          <Button
            variant={!providerId ? 'default' : 'outline'}
            aria-pressed={!providerId}
            onClick={() => {
              setProviderId('')
              firstPage()
            }}
          >
            {t('All API providers')}
          </Button>
          {providers.map(([id, name]) => (
            <Button
              key={id}
              variant={providerId === id ? 'default' : 'outline'}
              aria-pressed={providerId === id}
              onClick={() => {
                setProviderId(id)
                firstPage()
              }}
            >
              {name}
            </Button>
          ))}
        </div>
      </section>
      {ignore.isError ? <IgnoreFailed /> : null}
      <DataTablePage
        table={table}
        columns={columns}
        emptyTitle={t('No matching models')}
        emptyDescription={t('No records found. Try adjusting your filters.')}
        fixedHeight={false}
        paginationInFooter={false}
        applyHeaderSize
        getColumnClassName={(columnId, section) => {
          if (columnId === 'actions') return 'text-center'
          return section === 'cell' ? 'whitespace-normal' : undefined
        }}
        toolbar={
          <DataTableToolbar
            table={table}
            hideViewOptions
            hasAdditionalFilters={Boolean(query)}
            onReset={() => {
              setUpstreamId('')
              firstPage()
            }}
            leftActions={
              <IgnoreAllListingsButton
                models={props.models}
                onChanged={props.onChanged}
              />
            }
            filterPanel={
              <DataTableColumnFilterPanel activeCount={query ? 1 : 0}>
                <DataTableColumnFilterField
                  label={t('Upstream model ID')}
                  htmlFor={`${fieldId}-upstream-id`}
                >
                  <Input
                    id={`${fieldId}-upstream-id`}
                    value={upstreamId}
                    placeholder={t('Upstream model ID')}
                    onChange={(event) => {
                      setUpstreamId(event.target.value)
                      firstPage()
                    }}
                  />
                </DataTableColumnFilterField>
              </DataTableColumnFilterPanel>
            }
          />
        }
      />
    </section>
  )
}

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
import { useIsMutating, useMutation } from '@tanstack/react-query'
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

import { listedProviderId, providersOf } from '../api-provider-filter'
import { formatCanvasDateTime } from '../formatters'
import {
  ignoreModelListings,
  type ListedModel,
} from '../model-availability-api'
import { ApiProviderFilterButtons } from './ApiProviderFilterButtons'
import {
  CANVAS_COLUMN_SIZES,
  pageWithinRange,
  wrappedCellsCenteredActions,
} from './canvas-table-layout'
import { CanvasRowAction } from './CanvasRowAction'

// MODEL-LISTING-ALERT-001: the new provider models on the 上下架监测 page and the way to dismiss them.

const entryKey = (model: ListedModel) =>
  `${model.providerId}\n${model.upstreamId}`

// Row buttons read the pending state through this key, so the columns need not depend on it.
const ignoreRowKey = ['canvas-cloud', 'model-listing', 'ignore-row']

function useIgnoreListings(onChanged: () => void, mutationKey?: string[]) {
  return useMutation({
    mutationKey,
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

function IgnoreListingButton(props: {
  model: ListedModel
  ignore: (selection: Parameters<typeof ignoreModelListings>[0]) => void
}) {
  const { t } = useTranslation()
  const ignoring = useIsMutating({ mutationKey: ignoreRowKey }) > 0
  return (
    <CanvasRowAction
      disabled={ignoring}
      aria-label={t('Ignore {{model}}', { model: props.model.upstreamId })}
      onClick={() =>
        props.ignore({
          items: [
            {
              providerId: props.model.providerId,
              upstreamId: props.model.upstreamId,
            },
          ],
        })
      }
    >
      {t('Ignore')}
    </CanvasRowAction>
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
      <Button variant='outline' onClick={() => setConfirming(props.models)}>
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
  const ignore = useIgnoreListings(props.onChanged, ignoreRowKey)
  const fieldId = useId()
  const [chosenProviderId, setProviderId] = useState('')
  const [upstreamId, setUpstreamId] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const providers = useMemo(
    () =>
      providersOf(props.models, (model) => ({
        id: model.providerId,
        name: model.providerName,
      })),
    [props.models]
  )
  const providerId = listedProviderId(providers, chosenProviderId)
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
  // Columns depend only on stable values: flexRender mounts each cell function as a component, and useMutation returns a
  // new object at each render while its mutate keeps one identity. The row button reads the pending state itself.
  const ignoreListing = ignore.mutate
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
          <IgnoreListingButton model={row.original} ignore={ignoreListing} />
        ),
      },
    ],
    [ignoreListing, t]
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
      <ApiProviderFilterButtons
        providers={providers}
        selectedId={providerId}
        onSelect={(id) => {
          setProviderId(id)
          firstPage()
        }}
      />
      {ignore.isError ? <IgnoreFailed /> : null}
      <DataTablePage
        table={table}
        columns={columns}
        emptyTitle={t('No matching models')}
        emptyDescription={t('No records found. Try adjusting your filters.')}
        fixedHeight={false}
        paginationInFooter={false}
        applyHeaderSize
        getColumnClassName={wrappedCellsCenteredActions}
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

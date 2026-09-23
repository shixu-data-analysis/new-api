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
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type PaginationState,
} from '@tanstack/react-table'
import { ArrowLeftRight } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePagination, StaticDataTable } from '@/components/data-table'
import {
  DataTableColumnFilterField,
  DataTableColumnFilterPanel,
} from '@/components/data-table/toolbar/column-filter-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableCell, TableRow } from '@/components/ui/table'

import type { ModelCatalogPlan } from '../generated/model-catalog-import'
import { canvasStaticColumnWidth } from './canvas-table-layout'
import { CatalogPricingPreview } from './CatalogPricingPreview'

type CatalogPlanModel = ModelCatalogPlan['models'][number]

export function CatalogModelPreview(props: {
  models: CatalogPlanModel[]
  recoverPricing?: boolean
  recoverContinuity?: boolean
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [productKey, setProductKey] = useState('')
  const [capability, setCapability] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const keyQuery = productKey.trim().toLocaleLowerCase()
    const capabilityQuery = capability.trim().toLocaleLowerCase()
    return props.models.filter(
      (model) =>
        (!query || model.displayName.toLocaleLowerCase().includes(query)) &&
        (!keyQuery ||
          model.productKey.toLocaleLowerCase().includes(keyQuery)) &&
        (!capabilityQuery ||
          model.capability.toLocaleLowerCase().includes(capabilityQuery))
    )
  }, [capability, productKey, props.models, search])
  const pageCount = Math.max(
    1,
    Math.ceil(filtered.length / pagination.pageSize)
  )
  useEffect(() => {
    setPagination((value) =>
      value.pageIndex >= pageCount
        ? { ...value, pageIndex: pageCount - 1 }
        : value
    )
  }, [pageCount])
  const effectivePagination = {
    ...pagination,
    pageIndex: Math.min(pagination.pageIndex, pageCount - 1),
  }
  const table = useReactTable({
    data: filtered,
    columns: [{ id: 'model', accessorFn: (model) => model.productKey }],
    state: { pagination: effectivePagination },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function' ? updater(effectivePagination) : updater
      setPagination(
        next.pageSize === effectivePagination.pageSize
          ? next
          : { ...next, pageIndex: 0 }
      )
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })
  const visible = table.getRowModel().rows.map((row) => row.original)

  return (
    <div className='space-y-3'>
      <DataTableColumnFilterPanel
        activeCount={[search, productKey, capability].filter(Boolean).length}
        onClear={() => {
          setSearch('')
          setProductKey('')
          setCapability('')
          setPagination((value) => ({ ...value, pageIndex: 0 }))
          setExpandedKey(null)
        }}
      >
        <DataTableColumnFilterField label={t('Client model')}>
          <Input
            value={search}
            placeholder={t('Client model')}
            onChange={(event) => {
              setSearch(event.target.value)
              setPagination((value) => ({ ...value, pageIndex: 0 }))
              setExpandedKey(null)
            }}
          />
        </DataTableColumnFilterField>
        <DataTableColumnFilterField label={t('Key')}>
          <Input
            value={productKey}
            placeholder={t('Key')}
            onChange={(event) => {
              setProductKey(event.target.value)
              setPagination((value) => ({ ...value, pageIndex: 0 }))
              setExpandedKey(null)
            }}
          />
        </DataTableColumnFilterField>
        <DataTableColumnFilterField label={t('Capability')}>
          <Input
            value={capability}
            placeholder={t('Capability')}
            onChange={(event) => {
              setCapability(event.target.value)
              setPagination((value) => ({ ...value, pageIndex: 0 }))
              setExpandedKey(null)
            }}
          />
        </DataTableColumnFilterField>
      </DataTableColumnFilterPanel>
      <p className='text-muted-foreground flex items-center gap-1 text-xs'>
        <ArrowLeftRight aria-hidden='true' className='size-4 shrink-0' />
        {t('Scroll horizontally to view all columns')}
      </p>
      <StaticDataTable
        className='max-w-full overflow-x-auto'
        containerProps={{
          role: 'region',
          'aria-label': t('Client model preview'),
          tabIndex: 0,
        }}
        tableClassName='min-w-[760px] table-fixed'
        columns={[
          {
            id: 'model',
            className: canvasStaticColumnWidth.wide,
            header: t('Client model'),
          },
          {
            id: 'capability',
            className: canvasStaticColumnWidth.standard,
            header: t('Capability'),
          },
          {
            id: 'pricing',
            className: canvasStaticColumnWidth.standard,
            header: t('Price continuity by specification and plan'),
          },
          {
            id: 'credential',
            className: canvasStaticColumnWidth.standard,
            header: t('API Key binding continuity'),
          },
          {
            id: 'visibility',
            className: canvasStaticColumnWidth.wide,
            header: t('Customer visibility'),
          },
          {
            id: 'result',
            className: canvasStaticColumnWidth.standard,
            header: t('Publication result'),
          },
        ]}
        data={visible}
        getRowKey={(model) => model.productKey}
        renderRow={(model) => {
          const expanded = expandedKey === model.productKey
          const needsPricing = model.pricing.filter(
            (price) => price.status !== 'REUSE'
          ).length
          const reusedPricing = model.pricing.length - needsPricing
          const hasPriceLink = model.pricing.some(
            (price) => price.reasonCode === 'MATCHED_PUBLISHED_PRICE'
          )
          let result = t('Unchanged — skipped')
          if (
            props.recoverContinuity &&
            (model.credential.reasonCode === 'MATCHED_PUBLISHED_BINDING' ||
              hasPriceLink)
          ) {
            result = t('Catalog unchanged; verified links to restore')
          } else if (props.recoverPricing && hasPriceLink) {
            result = t('Catalog unchanged; price links to restore')
          }
          return (
            <Fragment key={model.productKey}>
              <TableRow className='align-top [&>td]:whitespace-normal'>
                <TableCell className='max-w-0 align-top [overflow-wrap:anywhere]'>
                  <div className='font-medium'>{model.displayName}</div>
                  <div className='text-muted-foreground mt-1 font-mono text-xs break-all'>
                    {model.productKey}
                  </div>
                  <div className='text-muted-foreground mt-1 text-xs break-all'>
                    {t('Channel')}: {model.channelId} · {t('Provider')}:{' '}
                    {model.providerId}
                  </div>
                  <Button
                    variant='link'
                    size='sm'
                    className='mt-1 h-auto p-0'
                    aria-expanded={expanded}
                    aria-controls={
                      expanded
                        ? `catalog-model-detail-${model.productKey}`
                        : undefined
                    }
                    onClick={() =>
                      setExpandedKey(expanded ? null : model.productKey)
                    }
                  >
                    {expanded ? t('Hide details') : t('View details')}
                  </Button>
                </TableCell>
                <TableCell className='align-top [overflow-wrap:anywhere]'>
                  {t(model.capability)}
                </TableCell>
                <TableCell className='align-top [overflow-wrap:anywhere]'>
                  <div>
                    {model.pricing.length} {t('Price plans')}
                  </div>
                  <div className='text-muted-foreground text-xs'>
                    {t('Existing prices reused')}: {reusedPricing}
                  </div>
                  {needsPricing > 0 && (
                    <Badge variant='destructive'>
                      {needsPricing} {t('Needs pricing')}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className='align-top [overflow-wrap:anywhere]'>
                  <div className='font-medium'>
                    {t(
                      {
                        REUSE: 'Binding retained',
                        NEEDS_BINDING: 'Binding required',
                        BLOCKED: 'Binding blocked',
                      }[model.credential.status]
                    )}
                  </div>
                  {model.credential.credentialGroupName && (
                    <div className='text-muted-foreground text-xs'>
                      {t('API Key group')}:{' '}
                      {model.credential.credentialGroupName}
                    </div>
                  )}
                </TableCell>
                <TableCell className='align-top [overflow-wrap:anywhere]'>
                  {model.customerVisibleAfterPublish
                    ? t('Visible to customers')
                    : t(
                        'Customer availability depends on presentation, runtime controls, bindings, and price coverage'
                      )}
                </TableCell>
                <TableCell className='align-top [overflow-wrap:anywhere]'>
                  <Badge
                    variant={model.action === 'NO_OP' ? 'secondary' : 'default'}
                  >
                    {model.action === 'NO_OP' ? result : t(model.action)}
                  </Badge>
                  {model.action !== 'NO_OP' && (
                    <div className='text-muted-foreground mt-1 text-xs tabular-nums'>
                      {model.currentVersion ?? '—'} →{' '}
                      {model.proposedVersion ?? '—'}
                    </div>
                  )}
                </TableCell>
              </TableRow>
              {expanded && (
                <TableRow id={`catalog-model-detail-${model.productKey}`}>
                  <TableCell colSpan={6} className='max-w-0 align-top'>
                    <div className='grid min-w-0 gap-4 p-2 lg:grid-cols-2'>
                      <div className='min-w-0'>
                        <div className='mb-2 font-medium'>
                          {t('Price continuity by specification and plan')}
                        </div>
                        <CatalogPricingPreview pricing={model.pricing} />
                      </div>
                      <div className='min-w-0 space-y-3 [overflow-wrap:anywhere]'>
                        <div>
                          <div className='font-medium'>
                            {t('Client configuration')}
                          </div>
                          <pre className='bg-muted/50 mt-2 max-h-64 max-w-full overflow-auto rounded-md p-3 text-xs'>
                            {JSON.stringify(model.publicInteraction, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className='font-medium'>
                            {t('API Key binding continuity')}
                          </div>
                          <div>
                            {t(
                              {
                                CURRENT_BINDING: 'Current binding retained',
                                MATCHED_PUBLISHED_BINDING:
                                  'Published binding carried forward',
                                UNBOUND_SOURCE: 'Previous model has no binding',
                                PROVIDER_CHANGED: 'Provider changed',
                                CHANNEL_CHANGED: 'Channel changed',
                                CREDENTIAL_GROUP_UNAVAILABLE:
                                  'API Key group is unavailable',
                                CREDENTIAL_SCHEME_MISMATCH:
                                  'API Key scheme does not match',
                                BINDING_CONFLICT: 'Binding conflict',
                              }[model.credential.reasonCode]
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        }}
      />
      <DataTablePagination table={table} />
    </div>
  )
}

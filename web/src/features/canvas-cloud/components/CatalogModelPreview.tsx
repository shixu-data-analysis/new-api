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
import { Link } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type PaginationState,
} from '@tanstack/react-table'
import { Copy } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePagination, StaticDataTable } from '@/components/data-table'
import {
  DataTableColumnFilterField,
  DataTableColumnFilterPanel,
} from '@/components/data-table/toolbar/column-filter-panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { TableCell, TableRow } from '@/components/ui/table'

import { diffCatalogJson } from '../catalog-json-diff'
import {
  catalogModelName,
  emptyCatalogModelFilters,
  matchesCatalogModelFilters,
  sortCatalogModelReviews,
  type CatalogModelFilters,
  type CatalogModelReview,
} from '../catalog-plan-review'
import type { ModelCatalogChange } from '../generated/model-catalog-import'
import { canvasStaticColumnWidth } from './canvas-table-layout'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CatalogJsonDiff } from './CatalogJsonDiff'
import {
  catalogBindingReasonLabel,
  catalogBindingStatusLabel,
  catalogChangeBadgeVariant,
  catalogListText,
  catalogModelChangeLabel,
  catalogPriceReasonLabel,
} from './catalog-plan-labels'

export type CatalogRowFocus = { key: string; nonce: number }

const pageSize = 20

function catalogModelRowId(productKey: string): string {
  return `catalog-model-${productKey}`
}

function ModelChangeCell(props: { review: CatalogModelReview }) {
  const { t } = useTranslation()
  const { model, kind } = props.review
  let version = `v${model.currentVersion}`
  if (kind === 'CREATE') version = `v${model.proposedVersion}`
  if (kind === 'NEW_VERSION') {
    version = `v${model.currentVersion} → v${model.proposedVersion}`
  }
  return (
    <div className='space-y-1'>
      <Badge variant={catalogChangeBadgeVariant(kind)}>
        {catalogModelChangeLabel(t, kind)}
      </Badge>
      <div className='text-muted-foreground text-xs tabular-nums'>
        {version}
      </div>
    </div>
  )
}

function ModelPendingCell(props: { review: CatalogModelReview }) {
  const { t } = useTranslation()
  const { review } = props
  const pending = [
    review.pricingCount > 0 &&
      t('Pricing: {{count}} items', { count: review.pricingCount }),
    review.needsBinding && t('Bind API Key'),
  ].filter((value): value is string => Boolean(value))
  if (!pending.length && !review.blockers.length) return <span>—</span>
  return (
    <div className='space-y-1'>
      {review.blockers.map((blocker) => (
        <div
          key={`${blocker.source}:${blocker.reasonCode}`}
          className='text-destructive'
        >
          {t('Blocks publication: {{reason}}', {
            reason:
              blocker.source === 'credential'
                ? catalogBindingReasonLabel(t, blocker.reasonCode)
                : catalogPriceReasonLabel(t, blocker.reasonCode),
          })}
        </div>
      ))}
      {pending.length > 0 && (
        <div className='text-orange-700 dark:text-orange-300'>
          {catalogListText(t, pending)}
        </div>
      )}
    </div>
  )
}

function ModelPricingSummary(props: { review: CatalogModelReview }) {
  const { t } = useTranslation()
  const { model } = props.review
  const specifications = new Set(model.pricing.map((price) => price.combinationKey))
  const plans = [...new Set(model.pricing.map((price) => price.priceGroupId))]
  const needsPricing = model.pricing.filter(
    (price) => price.status === 'NEEDS_PRICING'
  ).length
  const counts = { specs: specifications.size, plans: plans.length }
  return (
    <div className='space-y-2'>
      <div className='font-medium'>
        {needsPricing > 0
          ? t(
              'Pricing ({{specs}} specifications × {{plans}} price plans, {{count}} need pricing)',
              { ...counts, count: needsPricing }
            )
          : t(
              'Pricing ({{specs}} specifications × {{plans}} price plans, all kept)',
              counts
            )}
      </div>
      <ul className='space-y-1'>
        {plans.map((planId) => {
          const prices = model.pricing.filter(
            (price) => price.priceGroupId === planId
          )
          return (
            <li key={planId}>
              <span className='text-muted-foreground'>
                {prices[0]?.priceGroupName}
              </span>
              {': '}
              {catalogListText(
                t,
                prices.map(
                  (price) =>
                    `${price.label === 'Default' ? t('Default') : price.label} ${
                      price.status === 'REUSE'
                        ? t('Price kept')
                        : t('Needs pricing ({{reason}})', {
                            reason: catalogPriceReasonLabel(t, price.reasonCode),
                          })
                    }`
                )
              )}
            </li>
          )
        })}
      </ul>
      {needsPricing > 0 && (
        <div className='text-muted-foreground'>
          {t(
            'Specifications needing pricing are hidden from customers until priced'
          )}
          {' · '}
          {model.currentModelId ? (
            <Link
              className='text-primary underline underline-offset-4'
              to='/canvas-cloud/model-management/$modelId/pricing'
              params={{ modelId: model.currentModelId }}
              search={{}}
            >
              {t('Go to pricing')}
            </Link>
          ) : (
            t('Price this model in model management after publication')
          )}
        </div>
      )}
    </div>
  )
}

function CatalogModelDetail(props: {
  review: CatalogModelReview
  changes: ModelCatalogChange[]
  onViewChannel: (channelId: string) => void
}) {
  const { t } = useTranslation()
  const { review } = props
  const { model } = review
  const diff = useMemo(
    () =>
      diffCatalogJson(
        review.kind === 'CREATE' ? null : model.definition.current,
        model.definition.proposed
      ),
    [model.definition, review.kind]
  )
  const channel = props.changes.find(
    (change) =>
      change.resourceType === 'PROVIDER_CHANNEL' &&
      change.key === model.channelId &&
      change.action === 'CREATE_VERSION'
  )
  const changedLines = diff.added + diff.removed > 0
  let summary = t('Same as the current version')
  if (review.kind === 'CREATE') {
    summary = t('New model with no current version; showing the full new version')
  } else if (changedLines) {
    summary = t(
      'Compared with the current version · {{added}} lines added, {{removed}} lines removed',
      { added: diff.added, removed: diff.removed }
    )
  } else if (review.kind === 'NEW_VERSION' && channel) {
    summary = t('Model definition is the same as the current version')
  } else if (review.kind === 'NEW_VERSION') {
    summary = t(
      'Model definition is the same as the current version; the change is in fields that are not stored (for example source kind)'
    )
  }
  return (
    <div className='grid min-w-0 gap-4 p-2 lg:grid-cols-3'>
      <div className='min-w-0 lg:col-span-2'>
        <CatalogJsonDiff
          title={t('Model definition')}
          summary={
            <>
              <div>{summary}</div>
              <div>{t('Client configuration is in release.publicInteraction')}</div>
            </>
          }
          diff={diff}
          actions={
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={async () => {
                await navigator.clipboard.writeText(diff.proposedText)
                toast.success(t('Copied'))
              }}
            >
              <Copy aria-hidden='true' />
              {t('Copy JSON')}
            </Button>
          }
        />
      </div>
      <div className='min-w-0 space-y-4 text-sm [overflow-wrap:anywhere]'>
        {review.kind === 'NEW_VERSION' && channel && (
          <div className='space-y-1'>
            <div>
              {changedLines
                ? t(
                    'Also updated with the new version of channel {{channel}} (v{{current}} → v{{next}})',
                    {
                      channel: channel.key,
                      current: channel.currentVersion,
                      next: channel.proposedVersion,
                    }
                  )
                : t(
                    'Model definition is unchanged; the new version comes only from the new version of channel {{channel}}',
                    { channel: channel.key }
                  )}
            </div>
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto p-0'
              onClick={() => props.onViewChannel(channel.key)}
            >
              {t('View this channel')}
            </Button>
          </div>
        )}
        {model.currentBundleVersion && (
          <div>
            {t('Current version comes from Bundle {{version}}', {
              version: model.currentBundleVersion,
            })}
          </div>
        )}
        <ModelPricingSummary review={review} />
        <div className='space-y-1'>
          <div className='font-medium'>{t('API Key binding')}</div>
          <div>
            {catalogBindingStatusLabel(t, model.credential.status)}
            {' · '}
            {model.credential.reasonCode === 'CREDENTIAL_GROUP_UNAVAILABLE'
              ? t(
                  'The previous API Key group is archived or unavailable. Customers cannot use this model now.'
                )
              : catalogBindingReasonLabel(t, model.credential.reasonCode)}
          </div>
          {model.credential.credentialGroupName && (
            <div className='text-muted-foreground'>
              {t('API Key group')}: {model.credential.credentialGroupName}
            </div>
          )}
        </div>
        <div className='space-y-1'>
          <div className='font-medium'>{t('Channel')}</div>
          <div className='font-mono text-xs break-all'>{model.channelId}</div>
        </div>
      </div>
    </div>
  )
}

export function CatalogModelPreview(props: {
  reviews: CatalogModelReview[]
  changes: ModelCatalogChange[]
  focus: CatalogRowFocus | null
  onViewChannel: (channelId: string) => void
}) {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<CatalogModelFilters>(
    emptyCatalogModelFilters
  )
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  })
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const sorted = useMemo(
    () => sortCatalogModelReviews(props.reviews),
    [props.reviews]
  )
  const filtered = useMemo(
    () => sorted.filter((review) => matchesCatalogModelFilters(review, filters)),
    [filters, sorted]
  )
  const capabilities = [...new Set(props.reviews.map((r) => r.model.capability))]
  const providers = [...new Set(props.reviews.map((r) => r.model.providerId))]
  const pageCount = Math.max(1, Math.ceil(filtered.length / pagination.pageSize))
  const effectivePagination = {
    ...pagination,
    pageIndex: Math.min(pagination.pageIndex, pageCount - 1),
  }
  const table = useReactTable({
    data: filtered,
    columns: [{ id: 'model', accessorFn: (review) => review.model.productKey }],
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
  const focus = props.focus
  const focusedRow = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (!focus) return
    const index = sorted.findIndex((review) => review.model.productKey === focus.key)
    if (index < 0) return
    setFilters(emptyCatalogModelFilters)
    setPagination((value) => ({
      ...value,
      pageIndex: Math.floor(index / value.pageSize),
    }))
    setExpandedKey(focus.key)
    const frame = window.requestAnimationFrame(() =>
      focusedRow.current?.scrollIntoView({ block: 'nearest' })
    )
    return () => window.cancelAnimationFrame(frame)
  }, [focus, sorted])
  function changeFilter(next: Partial<CatalogModelFilters>) {
    setFilters((value) => ({ ...value, ...next }))
    setPagination((value) => ({ ...value, pageIndex: 0 }))
    setExpandedKey(null)
  }
  const activeCount = Object.values(filters).filter(
    (value) => value !== 'ALL'
  ).length
  const changeOptions = [
    ['CHANGED', t('Changed')],
    ['CREATE', t('New')],
    ['NEW_VERSION', t('New version')],
    ['DESCRIPTION', t('Description updated')],
    ['UNCHANGED', t('Unchanged')],
  ] as const
  const pendingOptions = [
    ['PRICING', t('Needs pricing')],
    ['BINDING', t('Needs API Key binding')],
    ['BLOCKED', t('Blocks publication')],
    ['NONE', t('Nothing to handle')],
  ] as const

  return (
    <div className='space-y-3'>
      <DataTableColumnFilterPanel
        activeCount={activeCount}
        onClear={() => changeFilter(emptyCatalogModelFilters)}
      >
        <DataTableColumnFilterField label={t('Capability')}>
          <Select
            value={filters.capability}
            onValueChange={(value) => changeFilter({ capability: value ?? 'ALL' })}
          >
            <SelectTrigger className='w-full' aria-label={t('Capability')}>
              <CanvasLocalizedSelectValue
                value={filters.capability === 'ALL' ? '' : filters.capability}
                emptyLabelKey='All capabilities'
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>{t('All capabilities')}</SelectItem>
              {capabilities.map((capability) => (
                <SelectItem key={capability} value={capability}>
                  {t(capability)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DataTableColumnFilterField>
        <DataTableColumnFilterField label={t('API provider')}>
          <Select
            value={filters.providerId}
            onValueChange={(value) => changeFilter({ providerId: value ?? 'ALL' })}
          >
            <SelectTrigger className='w-full' aria-label={t('API provider')}>
              <CanvasLocalizedSelectValue
                value={filters.providerId === 'ALL' ? '' : filters.providerId}
                displayValue={filters.providerId}
                emptyLabelKey='All API providers'
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>{t('All API providers')}</SelectItem>
              {providers.map((providerId) => (
                <SelectItem key={providerId} value={providerId}>
                  {providerId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DataTableColumnFilterField>
        <DataTableColumnFilterField label={t('Change in this Bundle')}>
          <Select
            value={filters.change}
            onValueChange={(value) =>
              changeFilter({
                change: (value ?? 'ALL') as CatalogModelFilters['change'],
              })
            }
          >
            <SelectTrigger
              className='w-full'
              aria-label={t('Change in this Bundle')}
            >
              <CanvasLocalizedSelectValue
                value={filters.change === 'ALL' ? '' : filters.change}
                displayValue={
                  changeOptions.find(([value]) => value === filters.change)?.[1]
                }
                emptyLabelKey='All change types'
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>{t('All change types')}</SelectItem>
              {changeOptions.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DataTableColumnFilterField>
        <DataTableColumnFilterField label={t('To handle')}>
          <Select
            value={filters.pending}
            onValueChange={(value) =>
              changeFilter({
                pending: (value ?? 'ALL') as CatalogModelFilters['pending'],
              })
            }
          >
            <SelectTrigger className='w-full' aria-label={t('To handle')}>
              <CanvasLocalizedSelectValue
                value={filters.pending === 'ALL' ? '' : filters.pending}
                displayValue={
                  pendingOptions.find(([value]) => value === filters.pending)?.[1]
                }
                emptyLabelKey='All attention states'
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>{t('All attention states')}</SelectItem>
              {pendingOptions.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </DataTableColumnFilterField>
      </DataTableColumnFilterPanel>
      <StaticDataTable
        className='max-w-full overflow-x-auto'
        containerProps={{
          role: 'region',
          'aria-label': t('Models'),
          tabIndex: 0,
        }}
        tableClassName='min-w-[1120px] table-fixed'
        columns={[
          { id: 'model', className: canvasStaticColumnWidth.detail, header: t('Model') },
          {
            id: 'capability',
            className: canvasStaticColumnWidth.compact,
            header: t('Capability'),
          },
          {
            id: 'provider',
            className: canvasStaticColumnWidth.standard,
            header: t('API provider'),
          },
          {
            id: 'change',
            className: canvasStaticColumnWidth.standard,
            header: t('Change in this Bundle'),
          },
          {
            id: 'pending',
            className: canvasStaticColumnWidth.detail,
            header: t('To handle'),
          },
          {
            id: 'visibility',
            className: canvasStaticColumnWidth.compact,
            header: t('Customer visible'),
          },
          {
            id: 'actions',
            className: canvasStaticColumnWidth.compact,
            header: t('Action'),
          },
        ]}
        data={visible}
        getRowKey={(review) => review.model.productKey}
        renderRow={(review) => {
          const { model } = review
          const expanded = expandedKey === model.productKey
          const detailId = `${catalogModelRowId(model.productKey)}-detail`
          const name = catalogModelName(model)
          return (
            <Fragment key={model.productKey}>
              <TableRow
                id={catalogModelRowId(model.productKey)}
                ref={focus?.key === model.productKey ? focusedRow : undefined}
                className='align-top [&>td]:whitespace-normal'
              >
                <TableCell className='max-w-0 align-top [overflow-wrap:anywhere]'>
                  <div className='font-medium'>{name}</div>
                  {model.presentationDisplayName &&
                    model.presentationDisplayName !== model.displayName && (
                      <div className='text-muted-foreground text-xs'>
                        {t('Name in Bundle: {{name}}', {
                          name: model.displayName,
                        })}
                      </div>
                    )}
                  <div className='text-muted-foreground text-xs'>
                    {t('Model key')}{' '}
                    <span className='font-mono break-all'>{model.productKey}</span>
                  </div>
                </TableCell>
                <TableCell className='align-top'>{t(model.capability)}</TableCell>
                <TableCell className='align-top break-all'>
                  {model.providerId}
                </TableCell>
                <TableCell className='align-top'>
                  <ModelChangeCell review={review} />
                </TableCell>
                <TableCell className='align-top text-sm'>
                  <ModelPendingCell review={review} />
                </TableCell>
                <TableCell className='align-top'>
                  {model.customerVisibleAfterPublish
                    ? t('Visible')
                    : t('Not visible yet')}
                </TableCell>
                <TableCell className='align-top'>
                  <Button
                    variant='link'
                    size='sm'
                    className='h-auto p-0'
                    aria-expanded={expanded}
                    aria-controls={expanded ? detailId : undefined}
                    onClick={() => setExpandedKey(expanded ? null : model.productKey)}
                  >
                    {expanded ? t('Collapse') : t('View details')}
                  </Button>
                </TableCell>
              </TableRow>
              {expanded && (
                <TableRow id={detailId}>
                  <TableCell colSpan={7} className='max-w-0 align-top'>
                    <CatalogModelDetail
                      review={review}
                      changes={props.changes}
                      onViewChannel={props.onViewChannel}
                    />
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

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
import type { TFunction } from 'i18next'
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
import { cn } from '@/lib/utils'

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
  catalogChangeBadgeClass,
  catalogCredentialRemedy,
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
      <Badge className={catalogChangeBadgeClass(kind)}>
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
  if (!pending.length && !review.blockers.length) {
    return <span className='text-muted-foreground'>—</span>
  }
  return (
    <div className='space-y-1'>
      {review.blockers.map((blocker) => (
        <div
          key={`${blocker.source}:${blocker.reasonCode}`}
          className='text-destructive font-semibold'
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
      <ul className='space-y-2'>
        {plans.map((planId) => {
          const prices = model.pricing.filter(
            (price) => price.priceGroupId === planId
          )
          return (
            <li key={planId} className='flex flex-wrap items-center gap-1.5'>
              <span className='text-muted-foreground min-w-14 text-xs'>
                {prices[0]?.priceGroupName}
              </span>
              {prices.map((price) => (
                <span
                  key={price.combinationKey}
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-xs',
                    price.status === 'REUSE'
                      ? 'bg-muted text-foreground'
                      : 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200'
                  )}
                >
                  {price.label === 'Default' ? t('Default') : price.label}
                  {' · '}
                  {price.status === 'REUSE'
                    ? t('Price kept')
                    : t('Needs pricing ({{reason}})', {
                        reason: catalogPriceReasonLabel(t, price.reasonCode),
                      })}
                </span>
              ))}
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

const bindingStatusClass = {
  REUSE: 'text-foreground',
  NEEDS_BINDING: 'text-orange-700 dark:text-orange-300',
  BLOCKED: 'text-destructive font-semibold',
} as const

/** Why the API Key binding has this status and what to do; one entry per line. */
function bindingExplanation(t: TFunction, review: CatalogModelReview): string[] {
  const { credential, definition } = review.model
  if (credential.status === 'REUSE') {
    const currentChannel = (
      definition.current?.release as { channelId?: unknown } | undefined
    )?.channelId
    const proposedChannel = (
      definition.proposed.release as { channelId?: unknown } | undefined
    )?.channelId
    if (currentChannel !== undefined && currentChannel !== proposedChannel) {
      return [
        t(
          'Moved to a new channel of the same API provider; the binding is kept'
        ),
      ]
    }
    return [catalogBindingReasonLabel(t, credential.reasonCode)]
  }
  if (credential.status === 'NEEDS_BINDING' && review.kind === 'CREATE') {
    return [
      t(
        'New models have no binding to keep; bind an API Key group after publication'
      ),
    ]
  }
  if (credential.status === 'NEEDS_BINDING') {
    return [
      credential.reasonCode === 'CREDENTIAL_GROUP_UNAVAILABLE'
        ? t(
            'The previous API Key group is archived or unavailable. Customers cannot use this model now.'
          )
        : catalogBindingReasonLabel(t, credential.reasonCode),
      t(
        'Binding does not depend on this publication and can be done at any time.'
      ),
    ]
  }
  return [
    catalogBindingReasonLabel(t, credential.reasonCode),
    catalogCredentialRemedy(t, credential.reasonCode),
  ]
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
    <div className='bg-muted/20 m-1 flex min-w-0 flex-wrap gap-5 rounded-lg border p-4'>
      <div className='min-w-0 flex-[999_1_520px]'>
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
      <div className='min-w-0 flex-[1_1_260px] space-y-4 text-sm [overflow-wrap:anywhere]'>
        {/* The table truncates these lines; the detail shows them in full. */}
        <div className='space-y-0.5'>
          <div className='font-medium'>{catalogModelName(model)}</div>
          {model.presentationDisplayName &&
            model.presentationDisplayName !== model.displayName && (
              <div className='text-muted-foreground text-xs'>
                {t('Name in Bundle: {{name}}', { name: model.displayName })}
              </div>
            )}
          <div className='text-muted-foreground text-xs'>
            {t('Model key')} <span className='font-mono'>{model.productKey}</span>
          </div>
        </div>
        {review.kind === 'NEW_VERSION' && channel && (
          <div className='bg-muted rounded-md px-2.5 py-2 text-xs'>
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
            </div>{' '}
            <Button
              type='button'
              variant='link'
              size='sm'
              className='h-auto p-0 text-xs'
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
          <div className={bindingStatusClass[model.credential.status]}>
            {catalogBindingStatusLabel(t, model.credential.status)}
          </div>
          {bindingExplanation(t, review).map((line) => (
            <div key={line} className='text-muted-foreground'>
              {line}
            </div>
          ))}
          {model.credential.credentialGroupName && (
            <div className='text-muted-foreground'>
              {t('API Key group {{name}}', {
                name: model.credential.credentialGroupName,
              })}
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
  // A located row stays visible even when it does not match the filters; filters stay unchanged.
  const [pinnedKey, setPinnedKey] = useState<string | null>(null)
  const sorted = useMemo(
    () => sortCatalogModelReviews(props.reviews),
    [props.reviews]
  )
  const filtered = useMemo(
    () =>
      sorted.filter(
        (review) =>
          review.model.productKey === pinnedKey ||
          matchesCatalogModelFilters(review, filters)
      ),
    [filters, pinnedKey, sorted]
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
  const filtersRef = useRef(filters)
  filtersRef.current = filters
  useEffect(() => {
    if (!focus) return
    const index = sorted
      .filter(
        (review) =>
          review.model.productKey === focus.key ||
          matchesCatalogModelFilters(review, filtersRef.current)
      )
      .findIndex((review) => review.model.productKey === focus.key)
    if (index < 0) return
    setPinnedKey(focus.key)
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
    setPinnedKey(null)
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
        tableClassName='w-full min-w-[1008px] table-fixed'
        emptyContent={t('No models match the filters.')}
        columns={[
          // The model column takes the remaining width, at least the wide tier.
          { id: 'model', className: 'min-w-52', header: t('Model (name customers see)') },
          {
            id: 'capability',
            className: canvasStaticColumnWidth.compact,
            header: t('Capability'),
          },
          {
            id: 'provider',
            className: canvasStaticColumnWidth.compact,
            header: t('API provider'),
          },
          {
            id: 'change',
            className: canvasStaticColumnWidth.compact,
            header: t('Change in this Bundle'),
          },
          {
            id: 'pending',
            className: canvasStaticColumnWidth.standard,
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
                <TableCell className='max-w-0 align-top'>
                  <div className='truncate font-medium' title={name}>
                    {name}
                  </div>
                  {model.presentationDisplayName &&
                    model.presentationDisplayName !== model.displayName && (
                      <div className='text-muted-foreground truncate text-xs'>
                        {t('Name in Bundle: {{name}}', {
                          name: model.displayName,
                        })}
                      </div>
                    )}
                  <div
                    className='text-muted-foreground truncate text-xs'
                    title={model.productKey}
                  >
                    {t('Model key')}{' '}
                    <span className='font-mono'>{model.productKey}</span>
                  </div>
                </TableCell>
                <TableCell className='align-top'>{t(model.capability)}</TableCell>
                <TableCell className='max-w-0 truncate align-top' title={model.providerId}>
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

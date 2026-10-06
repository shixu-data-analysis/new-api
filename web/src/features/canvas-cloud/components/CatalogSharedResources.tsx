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
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  catalogPreviousArtifactKey,
  catalogSharedChangeKind,
  catalogSharedImpact,
  catalogSharedResourceTypes,
  sortCatalogSharedChanges,
  type CatalogModelReview,
  type CatalogSharedChange,
  type CatalogSharedChangeKind,
  type CatalogSharedResourceType,
} from '../catalog-plan-review'
import type { ModelCatalogPlan } from '../generated/model-catalog-import'
import { canvasStaticColumnWidth } from './canvas-table-layout'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CatalogJsonDiff } from './CatalogJsonDiff'
import {
  catalogChangeBadgeVariant,
  catalogListText,
  catalogPlanDiagnosticText,
  catalogResourceTypeLabel,
  catalogSharedChangeLabel,
} from './catalog-plan-labels'

export type CatalogSharedFocus = {
  resourceType: CatalogSharedResourceType
  key: string
  nonce: number
}

type SharedFilters = {
  resourceType: 'ALL' | CatalogSharedResourceType
  change: 'ALL' | 'CHANGED' | CatalogSharedChangeKind
}

const emptySharedFilters: SharedFilters = { resourceType: 'ALL', change: 'ALL' }

function sharedRowKey(change: { resourceType: string; key: string }): string {
  return `${change.resourceType}:${change.key}`
}

function sharedRowId(change: { resourceType: string; key: string }): string {
  return `catalog-shared-${sharedRowKey(change)}`
}

function ImpactCell(props: {
  change: CatalogSharedChange
  plan: Pick<ModelCatalogPlan, 'changes' | 'models' | 'diagnostics'>
  reviews: CatalogModelReview[]
}) {
  const { t } = useTranslation()
  const impact = catalogSharedImpact(props.change, props.plan, props.reviews)
  switch (impact.kind) {
    case 'CONFLICT': {
      const text = impact.diagnostic
        ? catalogPlanDiagnosticText(t, impact.diagnostic, props.plan.models)
        : null
      return (
        <span className='text-destructive'>
          {t('Blocks publication: {{reason}}', {
            reason: text?.remedy ?? t('In conflict'),
          })}
        </span>
      )
    }
    case 'CHANNEL':
      return (
        <div className='space-y-1'>
          {impact.newVersions.length > 0 && (
            <div>
              {t('Causes new versions of {{count}} models: {{names}}', {
                count: impact.newVersions.length,
                names: catalogListText(t, impact.newVersions),
              })}
            </div>
          )}
          {impact.newModels.length > 0 && (
            <div>
              {t('Used by {{names}}', {
                names: catalogListText(t, impact.newModels),
              })}
            </div>
          )}
        </div>
      )
    case 'PROFILE':
      return (
        <span>
          {t('Used by channels {{keys}}', {
            keys: catalogListText(t, impact.channels),
          })}
        </span>
      )
    case 'OPENAPI':
      return (
        <span>
          {t('Used by Profiles {{keys}}', {
            keys: catalogListText(t, impact.profiles),
          })}
        </span>
      )
    default:
      return <span>—</span>
  }
}

function SharedResourceDetail(props: { change: CatalogSharedChange }) {
  const { t } = useTranslation()
  const { change } = props
  const kind = catalogSharedChangeKind(change)
  const diff = useMemo(
    () =>
      diffCatalogJson(
        change.definition?.current ?? null,
        change.definition?.proposed ?? {}
      ),
    [change.definition]
  )
  const previousKey = catalogPreviousArtifactKey(change)
  let summary = t('New, no current version; showing the full text')
  if (kind === 'CONFLICT') {
    summary = t('Published content compared with the Bundle')
  } else if (kind === 'NEW_VERSION' && diff.added + diff.removed > 0) {
    summary = t('Compared with the current version')
  } else if (kind === 'NEW_VERSION') {
    summary = t(
      'Definition is the same as the current version; the change is in fields that are not stored (for example internalOnly)'
    )
  } else if (previousKey) {
    summary = t('Compared with the previous version {{key}}', {
      key: previousKey,
    })
  }
  return (
    <div className='min-w-0 p-2'>
      <CatalogJsonDiff title={t('Definition')} summary={summary} diff={diff} />
    </div>
  )
}

export function CatalogSharedResources(props: {
  plan: Pick<ModelCatalogPlan, 'changes' | 'models' | 'diagnostics'>
  changes: CatalogSharedChange[]
  reviews: CatalogModelReview[]
  focus: CatalogSharedFocus | null
}) {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<SharedFilters>(emptySharedFilters)
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const sorted = useMemo(
    () => sortCatalogSharedChanges(props.changes),
    [props.changes]
  )
  const filtered = useMemo(
    () =>
      sorted.filter((change) => {
        const kind = catalogSharedChangeKind(change)
        return (
          (filters.resourceType === 'ALL' ||
            change.resourceType === filters.resourceType) &&
          (filters.change === 'ALL' ||
            (filters.change === 'CHANGED'
              ? kind !== 'UNCHANGED'
              : kind === filters.change))
        )
      }),
    [filters, sorted]
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / pagination.pageSize))
  const effectivePagination = {
    ...pagination,
    pageIndex: Math.min(pagination.pageIndex, pageCount - 1),
  }
  const table = useReactTable({
    data: filtered,
    columns: [{ id: 'resource', accessorFn: sharedRowKey }],
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
    const rowKey = sharedRowKey(focus)
    const index = sorted.findIndex((change) => sharedRowKey(change) === rowKey)
    if (index < 0) return
    setFilters(emptySharedFilters)
    setPagination((value) => ({
      ...value,
      pageIndex: Math.floor(index / value.pageSize),
    }))
    setExpandedKey(rowKey)
    const frame = window.requestAnimationFrame(() =>
      focusedRow.current?.scrollIntoView({ block: 'nearest' })
    )
    return () => window.cancelAnimationFrame(frame)
  }, [focus, sorted])
  function changeFilter(next: Partial<SharedFilters>) {
    setFilters((value) => ({ ...value, ...next }))
    setPagination((value) => ({ ...value, pageIndex: 0 }))
    setExpandedKey(null)
  }
  const changeOptions = [
    ['CHANGED', t('Changed')],
    ['CREATE', t('New')],
    ['NEW_VERSION', t('New version')],
    ['CONFLICT', t('In conflict')],
    ['UNCHANGED', t('Unchanged')],
  ] as const
  return (
    <div className='space-y-3'>
      <DataTableColumnFilterPanel
        activeCount={
          Object.values(filters).filter((value) => value !== 'ALL').length
        }
        onClear={() => changeFilter(emptySharedFilters)}
      >
        <DataTableColumnFilterField label={t('Resource type')}>
          <Select
            value={filters.resourceType}
            onValueChange={(value) =>
              changeFilter({
                resourceType: (value ?? 'ALL') as SharedFilters['resourceType'],
              })
            }
          >
            <SelectTrigger className='w-full' aria-label={t('Resource type')}>
              <CanvasLocalizedSelectValue
                value={filters.resourceType === 'ALL' ? '' : filters.resourceType}
                displayValue={
                  filters.resourceType === 'ALL'
                    ? undefined
                    : catalogResourceTypeLabel(t, filters.resourceType)
                }
                emptyLabelKey='All resource types'
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>{t('All resource types')}</SelectItem>
              {catalogSharedResourceTypes.map((resourceType) => (
                <SelectItem key={resourceType} value={resourceType}>
                  {catalogResourceTypeLabel(t, resourceType)}
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
                change: (value ?? 'ALL') as SharedFilters['change'],
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
      </DataTableColumnFilterPanel>
      <StaticDataTable
        className='max-w-full overflow-x-auto'
        containerProps={{
          role: 'region',
          'aria-label': t('Shared resources'),
          tabIndex: 0,
        }}
        tableClassName='min-w-[880px] table-fixed'
        columns={[
          {
            id: 'resource-type',
            className: canvasStaticColumnWidth.standard,
            header: t('Resource type'),
          },
          {
            id: 'key',
            className: canvasStaticColumnWidth.wide,
            header: t('Key'),
          },
          {
            id: 'change',
            className: canvasStaticColumnWidth.standard,
            header: t('Change in this Bundle'),
          },
          {
            id: 'impact',
            className: canvasStaticColumnWidth.detail,
            header: t('Impact'),
          },
          {
            id: 'actions',
            className: canvasStaticColumnWidth.compact,
            header: t('Action'),
          },
        ]}
        data={visible}
        getRowKey={sharedRowKey}
        renderRow={(change) => {
          const rowKey = sharedRowKey(change)
          const kind = catalogSharedChangeKind(change)
          const expanded = expandedKey === rowKey
          const detailId = `${sharedRowId(change)}-detail`
          return (
            <Fragment key={rowKey}>
              <TableRow
                id={sharedRowId(change)}
                ref={
                  focus && sharedRowKey(focus) === rowKey ? focusedRow : undefined
                }
                className='align-top [&>td]:whitespace-normal'
              >
                <TableCell className='align-top'>
                  {catalogResourceTypeLabel(t, change.resourceType)}
                </TableCell>
                <TableCell className='max-w-0 align-top font-mono text-xs break-all'>
                  {change.key}
                </TableCell>
                <TableCell className='align-top'>
                  <div className='space-y-1'>
                    <Badge variant={catalogChangeBadgeVariant(kind)}>
                      {catalogSharedChangeLabel(t, kind)}
                    </Badge>
                    {kind === 'NEW_VERSION' && (
                      <div className='text-muted-foreground text-xs tabular-nums'>
                        v{change.currentVersion} → v{change.proposedVersion}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className='align-top text-sm [overflow-wrap:anywhere]'>
                  <ImpactCell
                    change={change}
                    plan={props.plan}
                    reviews={props.reviews}
                  />
                </TableCell>
                <TableCell className='align-top'>
                  {kind === 'UNCHANGED' ? (
                    '—'
                  ) : (
                    <Button
                      variant='link'
                      size='sm'
                      className='h-auto p-0'
                      aria-expanded={expanded}
                      aria-controls={expanded ? detailId : undefined}
                      onClick={() => setExpandedKey(expanded ? null : rowKey)}
                    >
                      {expanded ? t('Collapse') : t('View details')}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
              {expanded && kind !== 'UNCHANGED' && (
                <TableRow id={detailId}>
                  <TableCell colSpan={5} className='max-w-0 align-top'>
                    <SharedResourceDetail change={change} />
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

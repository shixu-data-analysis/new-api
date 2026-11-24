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
import type { ColumnDef, PaginationState } from '@tanstack/react-table'
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

import { formatCanvasDateTime } from '../formatters'
import type {
  DisabledModel,
  MissingModel,
  UpstreamStatus,
} from '../model-availability-api'
import {
  availabilityRows,
  emptyAvailabilityFilters,
  matchesAvailabilityFilters,
  type AvailabilityControl,
  type AvailabilityFilters,
  type AvailabilityModelRow,
  type AvailabilityUpstreamFilter,
} from '../model-availability-rows'
import {
  modelControlReasonLabel,
  modelDisableReasons,
} from '../model-monitoring-control'
import { CANVAS_COLUMN_SIZES, pageWithinRange } from './canvas-table-layout'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasRowAction } from './CanvasRowAction'

const upstreamLabels: Record<Exclude<UpstreamStatus, null>, string> = {
  AVAILABLE: 'Listed by the provider',
  SUSPECTED: 'Absence to be confirmed',
  MISSING: 'Missing from the provider',
}

function UpstreamCell(props: { row: AvailabilityModelRow }) {
  const { t } = useTranslation()
  const { row } = props
  const status = row.kind === 'missing' ? 'MISSING' : row.model.upstreamStatus
  if (status === null) return <div>{t('Not probed yet')}</div>
  const time =
    status === 'MISSING' && row.model.firstMissingAt
      ? t('First missing {{time}}', {
          time: formatCanvasDateTime(row.model.firstMissingAt),
        })
      : null
  const listedAt = row.kind === 'disabled' ? row.model.lastListedAt : null
  const read =
    status !== 'MISSING' && listedAt
      ? t('Last read {{time}}', { time: formatCanvasDateTime(listedAt) })
      : null
  return (
    <>
      <div>{t(upstreamLabels[status])}</div>
      {time || read ? (
        <div className='text-muted-foreground text-xs tabular-nums'>
          {time ?? read}
        </div>
      ) : null}
    </>
  )
}

const upstreamFilterLabels: Record<AvailabilityUpstreamFilter, string> = {
  AVAILABLE: 'Listed by the provider',
  SUSPECTED: 'Absence to be confirmed',
  MISSING: 'Missing from the provider',
  NOT_PROBED: 'Not probed yet',
}

const stateLabels: Record<AvailabilityModelRow['kind'], string> = {
  missing: 'Missing, to handle',
  disabled: 'Model disabled',
}

/**
 * Missing and disabled models in one table, missing first (MODEL-AVAILABILITY-TABLES-001). Built like the model list:
 * API provider buttons above the toolbar (an exception to the Cloud table guide's no-chips rule, so both pages filter
 * providers the same way), the other filters in the Filters panel, and 20 rows a page in the browser: the overview
 * returns every row and the list is bounded by the catalog.
 */
export function ModelAvailabilityModelTable(props: {
  missing: MissingModel[]
  disabled: DisabledModel[]
  bulkAction: ReactNode
  onControl: (control: AvailabilityControl) => void
}) {
  const { t } = useTranslation()
  const fieldId = useId()
  const [filters, setFilters] = useState<AvailabilityFilters>(
    emptyAvailabilityFilters
  )
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const rows = useMemo(
    () => availabilityRows(props.missing, props.disabled),
    [props.missing, props.disabled]
  )
  const providers = useMemo(
    () => [
      ...new Map(
        rows.map((row) => [row.model.providerId, row.model.providerName])
      ),
    ],
    [rows]
  )
  // As the model list does: a chosen provider whose last row left (restored, or no longer missing) filters nothing.
  const providerId = providers.some(([id]) => id === filters.providerId)
    ? filters.providerId
    : ''
  const visible = useMemo(
    () =>
      rows.filter((row) =>
        matchesAvailabilityFilters(row, { ...filters, providerId })
      ),
    [rows, filters, providerId]
  )
  const changeFilters = (next: Partial<AvailabilityFilters>) => {
    setFilters((current) => ({ ...current, ...next }))
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }
  const ensurePageInRange = useCallback((pageCount: number) => {
    setPagination(pageWithinRange(pageCount))
  }, [])
  const columns = useMemo<ColumnDef<AvailabilityModelRow, unknown>[]>(
    () => [
      {
        id: 'model',
        size: CANVAS_COLUMN_SIZES.wide,
        header: t('Model'),
        cell: ({ row }) => (
          <>
            <div className='font-medium [overflow-wrap:anywhere]'>
              {row.original.model.displayName}
            </div>
            <div className='text-muted-foreground font-mono text-xs [overflow-wrap:anywhere]'>
              {row.original.model.upstreamIds.join(', ')}
            </div>
          </>
        ),
      },
      {
        id: 'provider',
        size: CANVAS_COLUMN_SIZES.wide,
        header: t('API provider'),
        cell: ({ row }) => (
          <>
            {row.original.model.providerName}
            {row.original.model.credentialGroupName ? (
              <div className='text-muted-foreground text-xs'>
                {t('API Key group: {{name}}', {
                  name: row.original.model.credentialGroupName,
                })}
              </div>
            ) : null}
          </>
        ),
      },
      {
        id: 'upstreamStatus',
        size: CANVAS_COLUMN_SIZES.wide,
        header: t('Upstream status'),
        cell: ({ row }) => <UpstreamCell row={row.original} />,
      },
      {
        id: 'modelState',
        size: CANVAS_COLUMN_SIZES.detail,
        header: t('Model state'),
        cell: ({ row }) => {
          const reason =
            row.original.kind === 'disabled' &&
            row.original.model.disabledReason
              ? modelControlReasonLabel(row.original.model.disabledReason)
              : undefined
          return (
            <>
              <div>
                {t(
                  row.original.kind === 'missing'
                    ? 'Model enabled'
                    : 'Model disabled'
                )}
              </div>
              {reason ? (
                <div className='text-muted-foreground text-xs'>
                  {t('Reason: {{reason}}', { reason: t(reason) })}
                </div>
              ) : null}
            </>
          )
        },
      },
      {
        id: 'actions',
        // The action column is wide, not compact, so the longest translations of its labels fit.
        size: CANVAS_COLUMN_SIZES.wide,
        header: t('Actions'),
        cell: ({ row }) => {
          const { model } = row.original
          const enabled = row.original.kind === 'missing'
          return (
            <CanvasRowAction
              tone={enabled ? 'danger' : 'primary'}
              aria-label={t(
                enabled
                  ? 'Disable model: {{model}}'
                  : 'Restore model: {{model}}',
                { model: model.displayName }
              )}
              onClick={() =>
                props.onControl({
                  modelKey: model.modelKey,
                  displayName: model.displayName,
                  controlVersion: model.controlVersion,
                  enabled,
                })
              }
            >
              {enabled ? t('Disable model') : t('Restore model')}
            </CanvasRowAction>
          )
        },
      },
    ],
    [props, t]
  )
  const { table } = useDataTable({
    data: visible,
    columns,
    getRowId: (row) => row.model.modelKey,
    manualFiltering: true,
    columnFilters: [],
    globalFilter: '',
    pagination,
    onPaginationChange: setPagination,
    ensurePageInRange,
    autoResetPageIndex: false,
  })
  const panelCount = [
    filters.state,
    filters.model.trim(),
    filters.upstreamId.trim(),
    filters.upstream,
    filters.reason,
  ].filter(Boolean).length
  const noRows = rows.length === 0

  return (
    <section className='space-y-3'>
      <h3 className='text-sm font-medium'>
        {t('Missing and disabled models ({{count}})', { count: rows.length })}
      </h3>
      {providers.length ? (
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
              onClick={() => changeFilters({ providerId: '' })}
            >
              {t('All API providers')}
            </Button>
            {providers.map(([id, name]) => (
              <Button
                key={id}
                variant={providerId === id ? 'default' : 'outline'}
                aria-pressed={providerId === id}
                onClick={() => changeFilters({ providerId: id })}
              >
                {name}
              </Button>
            ))}
          </div>
        </section>
      ) : null}
      <DataTablePage
        table={table}
        columns={columns}
        emptyTitle={t(
          noRows ? 'No confirmed model absences' : 'No matching models'
        )}
        emptyDescription={t(
          noRows
            ? 'Models not yet probed, with failed probes, or below the count do not appear here.'
            : 'No records found. Try adjusting your filters.'
        )}
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
            hasAdditionalFilters={panelCount > 0}
            onReset={() =>
              changeFilters({
                ...emptyAvailabilityFilters,
                providerId,
              })
            }
            leftActions={props.bulkAction}
            filterPanel={
              <DataTableColumnFilterPanel activeCount={panelCount}>
                <DataTableColumnFilterField label={t('Model state')}>
                  <Select
                    value={filters.state || 'ALL'}
                    onValueChange={(value) =>
                      changeFilters({
                        state:
                          value === 'missing' || value === 'disabled'
                            ? value
                            : '',
                      })
                    }
                  >
                    <SelectTrigger
                      className='w-full'
                      aria-label={t('Model state')}
                    >
                      <CanvasLocalizedSelectValue
                        value={filters.state}
                        valueLabelKey={
                          filters.state ? stateLabels[filters.state] : undefined
                        }
                        emptyLabelKey='All model states'
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ALL'>
                        {t('All model states')}
                      </SelectItem>
                      <SelectItem value='missing'>
                        {t(stateLabels.missing)}
                      </SelectItem>
                      <SelectItem value='disabled'>
                        {t(stateLabels.disabled)}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </DataTableColumnFilterField>
                <DataTableColumnFilterField
                  label={t('Model')}
                  htmlFor={`${fieldId}-model`}
                >
                  <Input
                    id={`${fieldId}-model`}
                    value={filters.model}
                    placeholder={t('Model')}
                    onChange={(event) =>
                      changeFilters({ model: event.target.value })
                    }
                  />
                </DataTableColumnFilterField>
                <DataTableColumnFilterField
                  label={t('Upstream model ID')}
                  htmlFor={`${fieldId}-upstream-id`}
                >
                  <Input
                    id={`${fieldId}-upstream-id`}
                    value={filters.upstreamId}
                    placeholder={t('Upstream model ID')}
                    onChange={(event) =>
                      changeFilters({ upstreamId: event.target.value })
                    }
                  />
                </DataTableColumnFilterField>
                <DataTableColumnFilterField label={t('Upstream status')}>
                  <Select
                    value={filters.upstream || 'ALL'}
                    onValueChange={(value) =>
                      changeFilters({
                        upstream:
                          value && value in upstreamFilterLabels
                            ? (value as AvailabilityUpstreamFilter)
                            : '',
                      })
                    }
                  >
                    <SelectTrigger
                      className='w-full'
                      aria-label={t('Upstream status')}
                    >
                      <CanvasLocalizedSelectValue
                        value={filters.upstream}
                        valueLabelKey={
                          filters.upstream
                            ? upstreamFilterLabels[filters.upstream]
                            : undefined
                        }
                        emptyLabelKey='All upstream statuses'
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ALL'>
                        {t('All upstream statuses')}
                      </SelectItem>
                      {(
                        Object.keys(
                          upstreamFilterLabels
                        ) as AvailabilityUpstreamFilter[]
                      ).map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(upstreamFilterLabels[value])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DataTableColumnFilterField>
                <DataTableColumnFilterField label={t('Disable reason')}>
                  <Select
                    value={filters.reason || 'ALL'}
                    onValueChange={(value) =>
                      changeFilters({
                        reason: !value || value === 'ALL' ? '' : value,
                      })
                    }
                  >
                    <SelectTrigger
                      className='w-full'
                      aria-label={t('Disable reason')}
                    >
                      <CanvasLocalizedSelectValue
                        value={filters.reason}
                        valueLabelKey={
                          filters.reason
                            ? modelControlReasonLabel(filters.reason)
                            : undefined
                        }
                        emptyLabelKey='All disable reasons'
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ALL'>
                        {t('All disable reasons')}
                      </SelectItem>
                      {modelDisableReasons.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(modelControlReasonLabel(value))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DataTableColumnFilterField>
              </DataTableColumnFilterPanel>
            }
          />
        }
      />
    </section>
  )
}

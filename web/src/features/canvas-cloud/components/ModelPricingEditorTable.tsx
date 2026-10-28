/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type {
  CellContext,
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
} from '@tanstack/react-table'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
  DataTableView,
  useDataTable,
} from '@/components/data-table'
import {
  DataTableColumnFilterField,
  DataTableColumnFilterPanel,
} from '@/components/data-table/toolbar/column-filter-panel'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { TableCell, TableRow } from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import { pointsUnitKey } from '../lib/billing-unit-labels'
import {
  calculatedPoints,
  draftValue,
  groupBy,
  isCostLocked,
  isPendingRow,
  isRowIncluded,
  isRowLocked,
  isSideChanged,
  pendingPublicationId,
  pricingCostError,
  pricingInputId,
  pricingRowErrors,
  PRICING_SIDE_LABEL_KEYS,
  validCalculatedPrice,
  type PricingEditorRow,
  type PricingEditorState,
  type PricingSide,
} from '../lib/model-pricing-editor'
import {
  ALL_PRICING_PLANS,
  effectivePriceGroupIds,
  matchesPricingPlanFilter,
  pagesByGroup,
  type PricingPlanFilter,
  type PricingStatusFilter,
} from '../lib/model-pricing-filter'
import {
  pricingRowCombination,
  pricingRowLabel,
  pricingRowLabeling,
} from '../lib/model-pricing-row-label'
import { formatExactRmbReference } from '../number-format'
import type {
  CanvasModelPricingCnyCalculation,
  CanvasModelPricingCnyValue,
  CanvasModelPricingDetail,
} from '../types'
import { END_ALIGNED_HEADER } from './canvas-table-layout'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import {
  PendingPriceCell,
  PricingInputCell,
  type PricingCellNote,
} from './ModelPricingEditorCells'

/** A row the page wants in view: its input is scrolled to, and focused for a field error. */
export interface PricingRevealRequest {
  rowId: string
  side: PricingSide
  focus: boolean
  seq: number
}

/** Scrolls only the nearest scrolling ancestor, so the page shell stays still. */
function scrollIntoPane(element: HTMLElement) {
  let pane = element.parentElement
  while (pane && !/(auto|scroll)/.test(getComputedStyle(pane).overflowY)) {
    pane = pane.parentElement
  }
  if (!pane) return
  pane.scrollTop +=
    element.getBoundingClientRect().top -
    pane.getBoundingClientRect().top -
    pane.clientHeight / 2
}

// Columns are rebuilt on every render; flexRender would treat each new cell function as a new component and
// remount the inputs (losing focus while typing), so the cell is called as a plain function.
function renderCell(
  cell: ColumnDef<TableRowData, unknown>['cell'],
  context: CellContext<TableRowData, unknown>
): ReactNode {
  return typeof cell === 'function' ? cell(context) : cell
}

type TableRowData = {
  id: string
  row: PricingEditorRow
  combination: string
  plan: string
}

// Rows of one group share these cells, merged over the group's consecutive rows on the page.
const MERGED_COLUMNS = new Set(['combination', 'cost'])
const NUMERIC_COLUMNS = new Set(['cost', 'inviter', 'price', 'scheduled'])
const PAGE_SIZE = 20
const NO_COLUMN_FILTERS: ColumnFiltersState = []
const ALL = 'ALL'
const STATUS_OPTIONS: Array<{ value: PricingStatusFilter; labelKey: string }> =
  [
    { value: 'ALL', labelKey: 'All pricing statuses' },
    { value: 'PRICED', labelKey: 'Priced' },
    { value: 'UNPRICED', labelKey: 'Not priced' },
  ]

const fieldValue = (
  value: CanvasModelPricingCnyValue | null | undefined,
  field: string
) => (typeof value === 'string' ? value : (value?.[field as 'input'] ?? ''))

/**
 * The current-pricing table with every price editable in place. Filtered or paged-out rows keep their drafts; the
 * page decides what is published. The price plan and pricing status filters are shared by every model's page; the
 * combination filter belongs to this model. Pages hold whole groups, so a merged provider cost is never split.
 */
export function ModelPricingEditorTable(props: {
  detail: CanvasModelPricingDetail
  state: PricingEditorState
  attempted: boolean
  calculation: CanvasModelPricingCnyCalculation | null
  conflicts: Map<string, string>
  onChange: (row: PricingEditorRow, side: PricingSide, value: string) => void
  onCancelSchedule: (publicationId: string, scopeId: string) => void
  reveal: PricingRevealRequest | null
  /** The shared price plan and status choice; the page also filters the time-of-day price table by it. */
  planFilter: PricingPlanFilter
  onPlanFilterChange: (filter: PricingPlanFilter) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  // Cloud returns CNY differences with 8 decimals; the note shows the amount without trailing zeros.
  const difference = (value: CanvasModelPricingCnyValue, field: string) =>
    formatExactRmbReference(fieldValue(value, field), locale)
  const { detail, state } = props
  const [combinationFilter, setCombinationFilter] = useState(ALL)
  const { planFilter, onPlanFilterChange: setPlanFilter } = props
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  })
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null)
  const token = state.billingUnit === 'MILLION_TOKENS'
  const labeling = useMemo(
    () => pricingRowLabeling(detail, token),
    [detail, token]
  )
  let combinationTitle = t('Parameter combination')
  if (token) combinationTitle = t('Token category')
  else if (labeling.qualityOnly) combinationTitle = t('Quality')
  const data = useMemo<TableRowData[]>(
    () =>
      state.rows.map((row) => ({
        id: row.id,
        row,
        combination: pricingRowCombination(row, labeling, t),
        plan: row.price.priceGroupName,
      })),
    [state.rows, labeling, t]
  )
  const groups = useMemo(
    () => groupBy(state.rows, (row) => row.groupKey),
    [state.rows]
  )
  const grouped = groups.size !== state.rows.length
  const planIds = useMemo(
    () =>
      effectivePriceGroupIds(
        planFilter,
        detail.priceGroups.map((plan) => plan.id)
      ),
    [planFilter, detail.priceGroups]
  )
  const activeFilters =
    (combinationFilter !== ALL ? 1 : 0) +
    (planIds.length ? 1 : 0) +
    (planFilter.status !== ALL ? 1 : 0)
  const visible = useMemo(
    () =>
      data.filter(
        (item) =>
          (combinationFilter === ALL ||
            item.combination === combinationFilter) &&
          matchesPricingPlanFilter(item.row, planFilter, planIds)
      ),
    [data, combinationFilter, planFilter, planIds]
  )
  const pages = useMemo(
    () => pagesByGroup(visible, (item) => item.row.groupKey, PAGE_SIZE),
    [visible]
  )
  const pageIndex = Math.min(
    pagination.pageIndex,
    Math.max(pages.length - 1, 0)
  )
  const changeFilters = (change: () => void) => {
    change()
    setPagination((value) => ({ ...value, pageIndex: 0 }))
  }
  const clearFilters = () =>
    changeFilters(() => {
      setCombinationFilter(ALL)
      setPlanFilter(ALL_PRICING_PLANS)
    })
  const pointsUnit = t(pointsUnitKey(state.billingUnit))

  const input = (
    row: PricingEditorRow,
    side: PricingSide,
    notes: PricingCellNote[]
  ) => {
    const pending = isPendingRow(row)
    const value =
      pending && side !== 'provider'
        ? fieldValue(
            row.price.current?.originalCnyValues?.[
              side === 'inviter' ? 'inviterDisplayPriceCny' : 'customerPriceCny'
            ],
            row.field
          )
        : draftValue(state, row, side)
    let placeholder: string | undefined
    if (side !== 'provider' && !row.price.current && !state.unitChange) {
      placeholder = t('Not priced')
    }
    return (
      <PricingInputCell
        id={pricingInputId(row, side)}
        label={`${pricingRowLabel(row, labeling, t)} ${t(PRICING_SIDE_LABEL_KEYS[side])}`}
        value={value}
        placeholder={placeholder}
        locked={
          side === 'provider'
            ? isCostLocked(state, groups.get(row.groupKey) ?? [row])
            : isRowLocked(state, row)
        }
        changed={
          !pending && !state.unitPending && isSideChanged(state, row, side)
        }
        notes={notes}
        onChange={(next) => props.onChange(row, side, next)}
      />
    )
  }

  const costNotes = (row: PricingEditorRow): PricingCellNote[] => {
    const groupRows = groups.get(row.groupKey) ?? [row]
    const error = pricingCostError(state, groupRows, props.attempted)
    if (error) return [{ text: t(error), error: true }]
    if (grouped && !state.unitChange && isSideChanged(state, row, 'provider')) {
      const priced = groupRows.filter((item) => item.price.current).length
      return [{ text: t('Affects {{count}} priced plans', { count: priced }) }]
    }
    return []
  }

  const priceNotes = (row: PricingEditorRow, side: 'inviter' | 'customer') => {
    const errors = pricingRowErrors(state, row, props.attempted)
    const conflict = props.conflicts.get(row.id)
    const notes: PricingCellNote[] = []
    if (isPendingRow(row)) {
      if (side === 'inviter') return notes
      const current = row.price.current
      notes.push({
        text: current
          ? `${fieldValue(current.tokenRates ?? current.points, row.field)} ${pointsUnit}`
          : t('Not priced; customers cannot see this specification'),
      })
      const error = conflict ?? errors.customer
      notes.push(
        error
          ? { text: t(error), error: true }
          : { text: t('A price is scheduled and cannot be changed') }
      )
      return notes
    }
    const included = isRowIncluded(state, row)
    const error =
      side === 'customer' ? (conflict ?? errors.customer) : errors.inviter
    if (error) notes.push({ text: t(error), error: true })
    const result = validCalculatedPrice(
      state,
      row,
      props.calculation,
      conflict,
      props.attempted
    )
    if (side === 'inviter') {
      if (result) {
        notes.push({
          text: t('Above provider cost by {{amount}} yuan', {
            amount: difference(result.inviterMinusProviderCny, row.field),
          }),
        })
      }
      return notes
    }
    const empty = draftValue(state, row, 'customer') === ''
    if (
      !row.price.current &&
      (!included || state.unitChange) &&
      empty &&
      !state.unitPending
    ) {
      notes.push({
        text: t('Not priced; customers cannot see this specification'),
      })
    }
    if (
      row.price.current?.inputMode === 'POINTS' &&
      !included &&
      !state.unitChange
    ) {
      notes.push({ text: t('Current active version is legacy points pricing') })
    }
    if (result) {
      notes.push({ text: `${calculatedPoints(result, row)} ${pointsUnit}` })
      notes.push({
        text: t('Above inviter display price by {{amount}} yuan', {
          amount: difference(result.customerMinusInviterCny, row.field),
        }),
      })
    }
    if (
      included &&
      row.price.current &&
      !state.unitChange &&
      !isSideChanged(state, row, 'inviter') &&
      !isSideChanged(state, row, 'customer')
    ) {
      notes.push({ text: t('Published with the cost change') })
    }
    if (!row.scope.controlEnabled) {
      notes.push({ text: t('Specification disabled; customers cannot see it') })
    }
    return notes
  }

  // Cells read the latest drafts, calculation and conflicts, so the columns are rebuilt on every render.
  const columns: ColumnDef<TableRowData, unknown>[] = [
    {
      accessorKey: 'combination',
      size: labeling.qualityOnly || token ? 128 : 208,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={combinationTitle} />
      ),
      meta: { label: combinationTitle },
      cell: ({ row }) => (
        <div>
          {row.original.combination}
          {row.original.row.scope.enabled === false && (
            <span className='text-muted-foreground ml-2'>{t('Disabled')}</span>
          )}
          {row.original.row.scope.enabled !== false &&
            row.original.row.scope.controlEnabled === false && (
              <span className='text-muted-foreground ml-2'>
                {t('Specification disabled')}
              </span>
            )}
        </div>
      ),
    },
    {
      accessorKey: 'plan',
      size: 160,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Price plan')} />
      ),
      meta: { label: t('Price plan') },
      cell: ({ row }) => (
        <span className='break-words whitespace-normal'>
          {row.original.plan}
        </span>
      ),
    },
    {
      id: 'cost',
      size: 208,
      header: t('Provider cost'),
      meta: { label: t('Provider cost') },
      cell: ({ row }) =>
        input(row.original.row, 'provider', costNotes(row.original.row)),
    },
    {
      id: 'inviter',
      size: 208,
      header: t('Inviter (agent) display price'),
      meta: { label: t('Inviter (agent) display price') },
      cell: ({ row }) =>
        input(
          row.original.row,
          'inviter',
          priceNotes(row.original.row, 'inviter')
        ),
    },
    {
      id: 'price',
      size: 208,
      header: t('Customer sale price'),
      meta: { label: t('Customer sale price') },
      cell: ({ row }) =>
        input(
          row.original.row,
          'customer',
          priceNotes(row.original.row, 'customer')
        ),
    },
    {
      id: 'scheduled',
      size: 160,
      header: t('Scheduled price'),
      meta: { label: t('Scheduled price') },
      cell: ({ row }) => {
        const editorRow = row.original.row
        if (!isPendingRow(editorRow)) return <span>—</span>
        // A cost-only schedule keeps the current customer price.
        const price = editorRow.price.scheduled ?? editorRow.price.current
        const publicationId = pendingPublicationId(editorRow)
        return (
          <PendingPriceCell
            row={editorRow}
            amount={fieldValue(
              price?.originalCnyValues?.customerPriceCny,
              editorRow.field
            )}
            points={fieldValue(
              price?.tokenRates ?? price?.points,
              editorRow.field
            )}
            onCancel={
              publicationId
                ? () =>
                    props.onCancelSchedule(
                      publicationId,
                      editorRow.scope.parameterCombinationId
                    )
                : null
            }
          />
        )
      },
    },
  ]
  const { table } = useDataTable({
    data: pages[pageIndex] ?? [],
    columns,
    getRowId: (row) => row.id,
    // The rows are filtered here; the toolbar still reads the (empty) column filter state.
    columnFilters: NO_COLUMN_FILTERS,
    manualFiltering: true,
    manualPagination: true,
    totalCount: visible.length,
    pageCount: Math.max(pages.length, 1),
    pagination: { ...pagination, pageIndex },
    onPaginationChange: setPagination,
  })
  const visibleColumns = table.getVisibleLeafColumns()
  const pageRows = table.getRowModel().rows
  // A hidden row is brought back by clearing the filters, then its page is opened.
  const revealed = useRef(0)
  const { reveal } = props
  useEffect(() => {
    if (!reveal || revealed.current === reveal.seq) return
    const page = pages.findIndex((items) =>
      items.some((item) => item.id === reveal.rowId)
    )
    if (page < 0 && activeFilters) {
      setCombinationFilter(ALL)
      setPlanFilter(ALL_PRICING_PLANS)
      return
    }
    revealed.current = reveal.seq
    if (page < 0) return
    setPagination((value) => ({ ...value, pageIndex: page }))
    const row = state.rows.find((item) => item.id === reveal.rowId)
    if (!row) return
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLElement>(
        `[id="${pricingInputId(row, reveal.side)}"]`
      )
      if (!input) return
      scrollIntoPane(input)
      if (reveal.focus) input.focus({ preventScroll: true })
    })
  }, [reveal, pages, activeFilters, setPlanFilter, state.rows])
  return (
    <div className='min-w-0 space-y-3'>
      <DataTableToolbar
        table={table}
        filterPanel={
          <DataTableColumnFilterPanel activeCount={activeFilters}>
            <DataTableColumnFilterField
              label={combinationTitle}
              htmlFor='current-pricing-filter-combination'
            >
              <Select
                value={combinationFilter}
                onValueChange={(next) =>
                  changeFilters(() => setCombinationFilter(next || ALL))
                }
              >
                <SelectTrigger
                  id='current-pricing-filter-combination'
                  className='w-full'
                >
                  <CanvasLocalizedSelectValue
                    value={combinationFilter}
                    displayValue={
                      combinationFilter === ALL
                        ? t('All combinations')
                        : combinationFilter
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('All combinations')}</SelectItem>
                  {[...new Set(data.map((row) => row.combination))].map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </DataTableColumnFilterField>
            <DataTableColumnFilterField
              label={t('Price plan')}
              htmlFor='current-pricing-filter-plan'
            >
              <MultiSelect
                id='current-pricing-filter-plan'
                options={[
                  ...detail.priceGroups.map((plan) => ({
                    value: plan.id,
                    label: plan.internalName,
                  })),
                  // Picking it shows every plan again.
                  ...(planIds.length
                    ? [{ value: ALL, label: t('All price plans') }]
                    : []),
                ]}
                selected={planIds}
                onChange={(values) =>
                  changeFilters(() =>
                    setPlanFilter({
                      ...planFilter,
                      priceGroupIds: values.includes(ALL) ? [] : values,
                    })
                  )
                }
                placeholder={t('All price plans')}
                renderSelectedSummary={(values) =>
                  t('{{count}} price plans selected', { count: values.length })
                }
              />
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('Applies to every model and is kept in this browser only.')}
              </p>
            </DataTableColumnFilterField>
            <DataTableColumnFilterField
              label={t('Pricing status')}
              htmlFor='current-pricing-filter-status'
            >
              <Select
                value={planFilter.status}
                onValueChange={(next) =>
                  changeFilters(() =>
                    setPlanFilter({
                      ...planFilter,
                      status: (next as PricingStatusFilter) || 'ALL',
                    })
                  )
                }
              >
                <SelectTrigger
                  id='current-pricing-filter-status'
                  className='w-full'
                >
                  <CanvasLocalizedSelectValue
                    value={planFilter.status}
                    displayValue={t(
                      STATUS_OPTIONS.find(
                        (option) => option.value === planFilter.status
                      )?.labelKey ?? 'All pricing statuses'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t(
                  'Hidden rows keep their changes and are published with them.'
                )}
              </p>
            </DataTableColumnFilterField>
          </DataTableColumnFilterPanel>
        }
        hasAdditionalFilters={activeFilters > 0}
        onReset={clearFilters}
      />
      {/* The wrappers stop clipping so the header sticks to the page scroller. */}
      <DataTableView
        table={table}
        containerClassName='overflow-visible [&_[data-slot=table-container]]:overflow-visible'
        tableClassName='w-full table-fixed'
        tableHeaderClassName='bg-card sticky -top-1 z-10 shadow-[inset_0_-1px_0_var(--border)] sm:-top-1.5'
        colgroup={
          <colgroup>
            {visibleColumns.map((column) => (
              <col
                key={column.id}
                style={{
                  width: column.id === 'plan' ? undefined : column.getSize(),
                }}
              />
            ))}
          </colgroup>
        }
        getColumnClassName={(columnId, section) => {
          const numeric = NUMERIC_COLUMNS.has(columnId)
          if (section === 'header') {
            return numeric ? cn('px-2', END_ALIGNED_HEADER) : 'px-2'
          }
          // Inputs share one line per row; text cells drop 6px to the input's center line.
          return cn(
            'px-2 py-2 align-top whitespace-normal break-words',
            numeric && 'text-right tabular-nums',
            !['cost', 'inviter', 'price'].includes(columnId) && 'pt-3.5'
          )
        }}
        tableBodyClassName='[&>tr]:h-auto'
        emptyTitle={
          activeFilters
            ? t('No prices match the filters')
            : t('No records found. Try adjusting your filters.')
        }
        emptyAction={
          activeFilters ? (
            <Button type='button' variant='outline' onClick={clearFilters}>
              {t('Clear filters')}
            </Button>
          ) : undefined
        }
        renderRow={(tableRow, helpers) => {
          const index = pageRows.indexOf(tableRow)
          const groupKey = tableRow.original.row.groupKey
          const firstInGroup =
            index <= 0 ||
            pageRows[index - 1]?.original.row.groupKey !== groupKey
          let span = 1
          while (pageRows[index + span]?.original.row.groupKey === groupKey) {
            span += 1
          }
          return (
            <TableRow
              key={tableRow.id}
              className={cn(
                'hover:bg-transparent',
                isRowIncluded(state, tableRow.original.row) && 'bg-primary/5',
                hoveredGroup === groupKey && 'bg-muted/50 hover:bg-muted/50'
              )}
              onMouseEnter={() => setHoveredGroup(groupKey)}
              onMouseLeave={() => setHoveredGroup(null)}
            >
              {tableRow.getVisibleCells().map((cell) => {
                const merged = grouped && MERGED_COLUMNS.has(cell.column.id)
                if (merged && !firstInGroup) return null
                return (
                  <TableCell
                    key={cell.id}
                    data-column-id={cell.column.id}
                    rowSpan={merged && span > 1 ? span : undefined}
                    className={helpers.getCellClassName(
                      cell.column.id,
                      merged && span > 1 ? 'align-middle pt-2' : undefined
                    )}
                  >
                    {renderCell(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                )
              })}
            </TableRow>
          )
        }}
      />
      <DataTablePagination table={table} />
    </div>
  )
}

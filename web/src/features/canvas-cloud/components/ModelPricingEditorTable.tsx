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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

import { pointsUnitKey } from '../lib/billing-unit-labels'
import {
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
  type PricingEditorRow,
  type PricingEditorState,
  type PricingSide,
} from '../lib/model-pricing-editor'
import {
  pricingRowCombination,
  pricingRowLabel,
  pricingRowLabeling,
} from '../lib/model-pricing-row-label'
import type {
  CanvasModelPricingCnyCalculation,
  CanvasModelPricingCnyValue,
  CanvasModelPricingDetail,
} from '../types'
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

const fieldValue = (
  value: CanvasModelPricingCnyValue | null | undefined,
  field: string
) => (typeof value === 'string' ? value : (value?.[field as 'input'] ?? ''))

/**
 * The current-pricing table with every price editable in place. Filtered or paged-out rows keep their drafts; the
 * page decides what is published.
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
}) {
  const { t } = useTranslation()
  const { detail, state } = props
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
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
  const pointsUnit = t(pointsUnitKey(state.billingUnit))
  const calculated = (row: PricingEditorRow) =>
    props.calculation?.scopes
      .find(
        (scope) =>
          scope.parameterCombinationId === row.scope.parameterCombinationId
      )
      ?.prices.find((price) => price.priceGroupId === row.price.priceGroupId)

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
    const result = calculated(row)
    const valid =
      Boolean(result) && !conflict && Object.keys(errors).length === 0
    if (side === 'inviter') {
      if (valid && result) {
        notes.push({
          text: t('Above provider cost by {{amount}} yuan', {
            amount: fieldValue(result.inviterMinusProviderCny, row.field),
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
    if (valid && result) {
      const points =
        row.field === 'scalar'
          ? result.normalizedPoints
          : (result.normalizedTokenRates?.[row.field] ?? '')
      notes.push({ text: `${points} ${pointsUnit}` })
      notes.push({
        text: t('Above inviter display price by {{amount}} yuan', {
          amount: fieldValue(result.customerMinusInviterCny, row.field),
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
      filterFn: (row, id, values: string[]) =>
        values.includes(row.getValue(id)),
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
      filterFn: (row, id, values: string[]) =>
        values.includes(row.getValue(id)),
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
    data,
    columns,
    columnFilters,
    onColumnFiltersChange: setColumnFilters,
    globalFilter,
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row) => row.id,
    initialPagination: { pageIndex: 0, pageSize: 20 },
  })
  const visibleColumns = table.getVisibleLeafColumns()
  const pageRows = table.getRowModel().rows
  // A hidden row is brought back by clearing the filters, then its page is opened.
  const revealed = useRef(0)
  const { reveal } = props
  useEffect(() => {
    if (!reveal || revealed.current === reveal.seq) return
    const index = table
      .getPrePaginationRowModel()
      .rows.findIndex((row) => row.id === reveal.rowId)
    if (index < 0 && (columnFilters.length || globalFilter)) {
      setColumnFilters([])
      setGlobalFilter('')
      return
    }
    revealed.current = reveal.seq
    if (index < 0) return
    table.setPageIndex(Math.floor(index / table.getState().pagination.pageSize))
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
  }, [reveal, columnFilters, globalFilter, table, state.rows])
  return (
    <div className='min-w-0 space-y-3'>
      <DataTableToolbar
        table={table}
        filterPanel={
          <DataTableColumnFilterPanel activeCount={columnFilters.length}>
            {[
              {
                columnId: 'combination',
                title: combinationTitle,
                allLabel: t('All combinations'),
                options: [...new Set(data.map((row) => row.combination))].map(
                  (value) => ({ value, label: value })
                ),
              },
              {
                columnId: 'plan',
                title: t('Price plan'),
                allLabel: t('All price plans'),
                options: detail.priceGroups.map((plan) => ({
                  value: plan.internalName,
                  label: plan.internalName,
                })),
              },
            ].map((filter) => {
              const column = table.getColumn(filter.columnId)
              const value =
                (column?.getFilterValue() as string[] | undefined)?.[0] ?? 'ALL'
              return (
                <DataTableColumnFilterField
                  key={filter.columnId}
                  label={filter.title}
                  htmlFor={`current-pricing-filter-${filter.columnId}`}
                >
                  <Select
                    value={value}
                    onValueChange={(next) =>
                      column?.setFilterValue(
                        next && next !== 'ALL' ? [next] : undefined
                      )
                    }
                  >
                    <SelectTrigger
                      id={`current-pricing-filter-${filter.columnId}`}
                      className='w-full'
                    >
                      <CanvasLocalizedSelectValue
                        value={value}
                        displayValue={
                          filter.options.find(
                            (option) => option.value === value
                          )?.label ?? filter.allLabel
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ALL'>{filter.allLabel}</SelectItem>
                      {filter.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DataTableColumnFilterField>
              )
            })}
          </DataTableColumnFilterPanel>
        }
        hasAdditionalFilters={columnFilters.length > 0}
        onReset={() => {
          setColumnFilters([])
          setGlobalFilter('')
          table.setPageIndex(0)
        }}
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
            return numeric
              ? 'px-2 text-right [&>div]:justify-end [&_button]:justify-end'
              : 'px-2'
          }
          // Inputs share one line per row; text cells drop 6px to the input's center line.
          return cn(
            'px-2 py-2 align-top whitespace-normal break-words',
            numeric && 'text-right tabular-nums',
            !['cost', 'inviter', 'price'].includes(columnId) && 'pt-3.5'
          )
        }}
        tableBodyClassName='[&>tr]:h-auto'
        emptyTitle={t('No records found. Try adjusting your filters.')}
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

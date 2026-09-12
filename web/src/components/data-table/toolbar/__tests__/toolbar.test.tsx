/*
Copyright (C) 2023-2026 QuantumNous
*/
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useDataTable } from '../../hooks/use-data-table'
import { DataTableToolbar } from '../toolbar'

type RecordRow = { name: string; status: string }
const data = [
  { name: 'Alpha', status: 'enabled' },
  { name: 'Beta', status: 'disabled' },
]
const columns: ColumnDef<RecordRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  {
    accessorKey: 'status',
    header: 'Status',
    filterFn: (row, id, values: string[]) => values.includes(row.getValue(id)),
  },
]
function Example(props: {
  initialColumnFilters?: ColumnFiltersState
  onReset?: () => void
  onSearch?: () => void
}) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    props.initialColumnFilters ?? []
  )
  const [globalFilter, setGlobalFilter] = useState('')
  const { table } = useDataTable({
    data,
    columns,
    columnFilters,
    onColumnFiltersChange: setColumnFilters,
    globalFilter,
    onGlobalFilterChange: setGlobalFilter,
  })
  return (
    <>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Name'
        searchKey='name'
        filters={[
          {
            columnId: 'status',
            title: 'Status',
            allLabel: 'All statuses',
            singleSelect: true,
            options: [
              { value: 'all', label: 'All Status' },
              { value: 'enabled', label: 'Enabled' },
              { value: 'disabled', label: 'Disabled' },
            ],
          },
        ]}
        onReset={props.onReset}
        onSearch={props.onSearch}
      />
      <output aria-label='Matching names'>
        {table
          .getRowModel()
          .rows.map((row) => row.original.name)
          .join(', ')}
      </output>
      <output aria-label='Visible columns'>
        {table
          .getVisibleLeafColumns()
          .map((column) => column.id)
          .join(', ')}
      </output>
    </>
  )
}
describe('shared table toolbar', () => {
  it('keeps column visibility independent from opening and closing the filter panel', async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole('button', { name: 'View' }))
    await user.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Status' })
    )
    expect(screen.getByLabelText('Visible columns')).toHaveTextContent(/^name$/)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Column filters' }))
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Beta')
    expect(screen.getByLabelText('Matching names')).toHaveTextContent(/^Beta$/)
    expect(screen.getByLabelText('Visible columns')).toHaveTextContent(/^name$/)
  })
  it('shows Clear filters in the toolbar only after ordinary filters become active', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    render(<Example onReset={onReset} onSearch={vi.fn()} />)
    expect(
      screen.queryByRole('textbox', { name: 'Name' })
    ).not.toBeInTheDocument()
    const view = screen.getByRole('button', { name: 'View' })
    expect(view.closest('[data-slot="data-table-view-options"]')).toHaveClass(
      'justify-self-end'
    )
    const filters = screen.getByRole('button', { name: 'Column filters' })
    expect(
      screen.queryByRole('button', { name: 'Clear filters' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Reset' })
    ).not.toBeInTheDocument()
    expect(filters.closest('[data-slot="data-table-filters"]')).toHaveClass(
      'justify-self-start'
    )
    await user.click(filters)
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeVisible()
    expect(screen.getByText('All statuses')).toBeVisible()
    await user.click(screen.getByLabelText('Status'))
    await user.click(await screen.findByRole('option', { name: /Enabled/ }))
    await waitFor(() =>
      expect(screen.getByLabelText('Matching names')).toHaveTextContent(
        /^Alpha$/
      )
    )
    expect(screen.getAllByText('Clear filters')).toHaveLength(1)
    await user.keyboard('{Escape}')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onReset).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Matching names')).toHaveTextContent(
      'Alpha, Beta'
    )
    expect(
      screen.queryByRole('button', { name: 'Clear filters' })
    ).not.toBeInTheDocument()
    expect(view.closest('[data-slot="data-table-view-options"]')).toHaveClass(
      'justify-self-end'
    )
  })
  it('normalizes legacy all options without showing a duplicate filter choice', async () => {
    const user = userEvent.setup()
    render(
      <Example initialColumnFilters={[{ id: 'status', value: ['all'] }]} />
    )

    const filters = screen.getByRole('button', { name: 'Column filters' })
    expect(filters).not.toHaveTextContent('1')
    expect(
      screen.queryByRole('button', { name: 'Clear filters' })
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByLabelText('Matching names')).toHaveTextContent(
        'Alpha, Beta'
      )
    )

    await user.click(filters)
    await user.click(screen.getByLabelText('Status'))
    expect(
      screen.queryByRole('option', { name: 'All Status' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Enabled/ })).toBeVisible()
  })
})

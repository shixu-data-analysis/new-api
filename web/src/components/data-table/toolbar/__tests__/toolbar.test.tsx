/*
Copyright (C) 2023-2026 QuantumNous
*/
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

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
function Example() {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
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
            singleSelect: true,
            options: [
              { value: 'enabled', label: 'Enabled' },
              { value: 'disabled', label: 'Disabled' },
            ],
          },
        ]}
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
  it('contains search and status in one column panel while keeping View in its fixed end position', async () => {
    const user = userEvent.setup()
    render(<Example />)
    expect(
      screen.queryByRole('textbox', { name: 'Name' })
    ).not.toBeInTheDocument()
    const view = screen.getByRole('button', { name: 'View' })
    expect(view.closest('[data-slot="data-table-view-options"]')).toHaveClass(
      'justify-self-end'
    )
    const filters = screen.getByRole('button', { name: 'Column filters' })
    expect(filters.closest('[data-slot="data-table-filters"]')).toHaveClass(
      'justify-self-start'
    )
    await user.click(filters)
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeVisible()
    await user.click(screen.getByLabelText('Status'))
    await user.click(await screen.findByRole('option', { name: /Enabled/ }))
    await waitFor(() =>
      expect(screen.getByLabelText('Matching names')).toHaveTextContent(
        /^Alpha$/
      )
    )
    await user.keyboard('{Escape}')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByLabelText('Matching names')).toHaveTextContent(
      'Alpha, Beta'
    )
    expect(view.closest('[data-slot="data-table-view-options"]')).toHaveClass(
      'justify-self-end'
    )
  })
})

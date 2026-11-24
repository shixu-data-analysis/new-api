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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LogicalModelControlDialog } from '../LogicalModelControlDialog'

const controlCanvasLogicalModel = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock('../../api', () => ({ controlCanvasLogicalModel }))
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

afterEach(cleanup)

describe('LogicalModelControlDialog', () => {
  it('refreshes every page that shows the model state, wherever the change was made', async () => {
    controlCanvasLogicalModel.mockResolvedValue({})
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    render(
      <QueryClientProvider client={client}>
        <LogicalModelControlDialog
          modelKey='a'
          name='Model A'
          manualEnabled={false}
          controlVersion={4}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('combobox'), {
      target: { value: 'UPSTREAM_RESTORED' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Restore model' })
    )
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Model state updated')
    )
    expect(controlCanvasLogicalModel).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ enabled: true, expectedVersion: 4 })
    )
    const refreshed = invalidate.mock.calls.map(([filters]) =>
      JSON.stringify(filters?.queryKey)
    )
    expect(refreshed).toEqual(
      expect.arrayContaining([
        JSON.stringify(['canvas-cloud', 'admin-testing-models']),
        JSON.stringify(['canvas-cloud', 'model-availability']),
        JSON.stringify(['canvas-cloud', 'model-monitoring-overview']),
        JSON.stringify(['canvas-cloud', 'model-usage']),
      ])
    )
    expect(refreshed.length).toBe(5)
  })
})

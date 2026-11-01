import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CanvasAdminTestingModel } from '../../types'
import { ModelBulkRetireDialog } from '../catalog-edit/ModelBulkRetireDialog'

const api = vi.hoisted(() => ({ retire: vi.fn(), impact: vi.fn() }))

vi.mock('../../catalog-edit-api', async (original) => ({
  ...(await original<typeof import('../../catalog-edit-api')>()),
  retireCatalogModel: api.retire,
  getModelRetirementImpact: api.impact,
}))

const model = (modelKey: string, version: number) =>
  ({
    modelKey,
    version,
    effectiveDisplayName: `Name ${modelKey}`,
    provider: { name: 'Acme' },
  }) as unknown as CanvasAdminTestingModel
const models = [model('a', 3), model('b', 5)]

function open(onClose = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ModelBulkRetireDialog models={models} onClose={onClose} />
    </QueryClientProvider>
  )
  return onClose
}

function confirm(typed: string) {
  fireEvent.change(screen.getByLabelText('Reason for deletion'), {
    target: { value: 'OTHER' },
  })
  fireEvent.change(
    screen.getByLabelText(
      'Type {{count}} to confirm'.replace('{{count}}', '2')
    ),
    { target: { value: typed } }
  )
}

describe('Deleting all disabled models', () => {
  beforeEach(() => {
    api.retire.mockReset()
    api.impact.mockReset()
    api.retire.mockResolvedValue({})
    api.impact.mockResolvedValue({ inFlightTasks: 1 })
  })

  it('names every model, and waits for a reason and the typed count', async () => {
    open()
    expect(screen.getByText('Name a', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('Name b', { exact: false })).toBeInTheDocument()
    await waitFor(() => expect(api.impact).toHaveBeenCalledTimes(2))
    const submit = screen.getByRole('button', { name: 'Delete 2 models' })
    expect(submit).toBeDisabled()
    confirm('1')
    expect(submit).toBeDisabled()
    confirm('2')
    expect(submit).toBeEnabled()
    expect(api.retire).not.toHaveBeenCalled()
  })

  it('deletes each model with its own version and key, then closes', async () => {
    const onClose = open()
    confirm('2')
    fireEvent.click(screen.getByRole('button', { name: 'Delete 2 models' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(
      api.retire.mock.calls.map(([input]) => [
        input.modelKey,
        input.expectedVersion,
        input.confirmedModelKey,
        input.reasonCode,
      ])
    ).toEqual([
      ['a', 3, 'a', 'OTHER'],
      ['b', 5, 'b', 'OTHER'],
    ])
  })

  it('keeps going past a failure, names it and retries only that one', async () => {
    api.retire.mockRejectedValueOnce(new Error('changed'))
    const onClose = open()
    confirm('2')
    fireEvent.click(screen.getByRole('button', { name: 'Delete 2 models' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Name a')
    expect(api.retire).toHaveBeenCalledTimes(2)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed (1)' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(api.retire.mock.calls.map(([input]) => input.modelKey)).toEqual([
      'a',
      'b',
      'a',
    ])
  })
})

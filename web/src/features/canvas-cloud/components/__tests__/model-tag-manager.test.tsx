/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program.
If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CanvasAdminTestingModel } from '../../types'
import { ModelTagManager } from '../ModelTagManager'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
  assign: vi.fn(),
}))
vi.mock('../../api', () => ({
  createCanvasAdminModelTag: mocks.create,
  renameCanvasAdminModelTag: mocks.rename,
  deleteCanvasAdminModelTag: mocks.remove,
  setCanvasAdminModelTagModels: mocks.assign,
}))

const associated = { id: 'photo', name: 'Photography' }
const models = [
  {
    modelKey: 'alpha',
    effectiveDisplayName: 'Alpha',
    catalogDefaultName: 'Catalog Alpha',
    provider: { name: 'Provider A' },
    executionTargets: [{ id: 'target-a', upstreamModelId: 'upstream-a' }],
    tags: [associated],
  },
  {
    modelKey: 'beta',
    effectiveDisplayName: 'Beta',
    catalogDefaultName: 'Catalog Beta',
    provider: { name: 'Provider B' },
    executionTargets: [{ id: 'target-b', upstreamModelId: 'upstream-b' }],
    tags: [associated],
  },
  {
    modelKey: 'gamma',
    effectiveDisplayName: 'Gamma',
    catalogDefaultName: 'Catalog Gamma',
    provider: { name: 'Provider C' },
    executionTargets: [{ id: 'target-c', upstreamModelId: 'upstream-c' }],
    tags: [],
  },
] as CanvasAdminTestingModel[]

describe('model tag manager', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.assign.mockResolvedValue({})
  })

  it('saves full associations after selecting only a searched candidate', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ModelTagManager
          open
          onOpenChange={() => {}}
          tags={[
            {
              ...associated,
              modelCount: 3,
              modelKeys: ['alpha', 'beta', 'retired'],
            },
          ]}
          models={models}
        />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Associate models' }))
    fireEvent.change(
      screen.getByLabelText('Search model, API provider or upstream model ID'),
      { target: { value: 'Gamma' } }
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Select search results' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save associations' }))
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith({
        id: 'photo',
        modelKeys: ['alpha', 'beta', 'retired', 'gamma'],
        expectedModelKeys: ['alpha', 'beta', 'retired'],
      })
    )
  })

  it('protects an unsaved tag name when closing the manager', () => {
    const close = vi.fn()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ModelTagManager open onOpenChange={close} tags={[]} models={models} />
      </QueryClientProvider>
    )
    fireEvent.change(screen.getByLabelText('New tag'), {
      target: { value: 'New category' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(close).not.toHaveBeenCalled()
    expect(
      screen.getByText('Your unsaved model tag changes will be lost.')
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('New tag')).toHaveValue('New category')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(close).toHaveBeenCalledWith(false)
  })

  it('protects selected associations when returning to tags', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ModelTagManager
          open
          onOpenChange={() => {}}
          tags={[
            { ...associated, modelCount: 2, modelKeys: ['alpha', 'beta'] },
          ]}
          models={models}
        />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Associate models' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Select search results' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back to tags' }))
    expect(
      screen.getByText('Your unsaved model tag changes will be lost.')
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.getByRole('button', { name: 'Save associations' })
    ).toBeEnabled()
  })

  it('retains rename draft and refreshes expected name after a conflict', async () => {
    const client = new QueryClient()
    mocks.rename
      .mockRejectedValueOnce({ response: { status: 409 } })
      .mockResolvedValueOnce({})
    render(
      <QueryClientProvider client={client}>
        <ModelTagManager
          open
          onOpenChange={() => {}}
          tags={[
            { ...associated, modelCount: 2, modelKeys: ['alpha', 'beta'] },
          ]}
          models={models}
        />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('Rename tag'), {
      target: { value: 'Portraits' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0])
    await screen.findByText(
      'Model tags changed elsewhere. Refresh and review before retrying.'
    )
    client.setQueryData(
      ['canvas-cloud', 'admin-model-tags'],
      [
        {
          id: 'photo',
          name: 'Photos',
          modelCount: 2,
          modelKeys: ['alpha', 'beta'],
        },
      ]
    )
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() =>
      expect(
        screen.queryByText(
          'Model tags changed elsewhere. Refresh and review before retrying.'
        )
      ).not.toBeInTheDocument()
    )
    expect(screen.getByLabelText('Rename tag')).toHaveValue('Portraits')
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[0])
    await waitFor(() =>
      expect(mocks.rename).toHaveBeenLastCalledWith({
        id: 'photo',
        name: 'Portraits',
        expectedName: 'Photos',
      })
    )
  })

  it('retains selected models and refreshes expected associations after a conflict', async () => {
    const client = new QueryClient()
    mocks.assign
      .mockRejectedValueOnce({ response: { status: 409 } })
      .mockResolvedValueOnce({})
    render(
      <QueryClientProvider client={client}>
        <ModelTagManager
          open
          onOpenChange={() => {}}
          tags={[
            { ...associated, modelCount: 2, modelKeys: ['alpha', 'beta'] },
          ]}
          models={models}
        />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Associate models' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Select search results' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save associations' }))
    await screen.findByText(
      'Model tags changed elsewhere. Refresh and review before retrying.'
    )
    client.setQueryData(
      ['canvas-cloud', 'admin-testing-models'],
      [
        { ...models[0], tags: [associated] },
        { ...models[1], tags: [] },
        models[2],
      ]
    )
    client.setQueryData(
      ['canvas-cloud', 'admin-model-tags'],
      [{ ...associated, modelCount: 2, modelKeys: ['alpha', 'retired'] }]
    )
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() =>
      expect(
        screen.queryByText(
          'Model tags changed elsewhere. Refresh and review before retrying.'
        )
      ).not.toBeInTheDocument()
    )
    expect(screen.getByRole('checkbox', { name: 'Beta' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Save associations' }))
    await waitFor(() =>
      expect(mocks.assign).toHaveBeenLastCalledWith({
        id: 'photo',
        modelKeys: ['alpha', 'beta', 'gamma', 'retired'],
        expectedModelKeys: ['alpha', 'retired'],
      })
    )
  })

  it('deletes with complete expected keys including a retired model', async () => {
    mocks.remove.mockResolvedValue({})
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ModelTagManager
          open
          onOpenChange={() => {}}
          tags={[
            {
              ...associated,
              modelCount: 3,
              modelKeys: ['alpha', 'beta', 'retired'],
            },
          ]}
          models={models}
        />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(
      screen.getByText(
        'This removes the tag from 3 models. The models and their other tags remain.'
      )
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith({
        id: 'photo',
        expectedModelKeys: ['alpha', 'beta', 'retired'],
      })
    )
  })
})

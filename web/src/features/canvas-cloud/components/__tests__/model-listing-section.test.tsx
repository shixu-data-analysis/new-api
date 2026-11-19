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
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ListedModel } from '../../model-availability-api'
import {
  IgnoreAllListingsButton,
  ModelListingTable,
} from '../ModelListingSection'

const ignoreModelListings = vi.hoisted(() => vi.fn())
vi.mock('../../model-availability-api', async (original) => ({
  ...(await original<object>()),
  ignoreModelListings,
}))

const listed = (upstreamId: string, providerName = 'MangoAI'): ListedModel => ({
  providerId: `${providerName}-id`,
  providerName,
  upstreamId,
  firstSeenAt: '2026-11-19T01:00:12.000Z',
})

function renderWithQuery(element: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>
  )
  return {
    rerender: (next: React.ReactElement) =>
      view.rerender(
        <QueryClientProvider client={client}>{next}</QueryClientProvider>
      ),
  }
}

beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

describe('ModelListingTable', () => {
  it('explains what is listed when there are no new models', () => {
    renderWithQuery(<ModelListingTable models={[]} onChanged={vi.fn()} />)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByText(/No new models/)).toBeInTheDocument()
  })

  it('ignores only the row clicked and refreshes the page afterwards', async () => {
    ignoreModelListings.mockResolvedValue({ removed: 1 })
    const onChanged = vi.fn()
    renderWithQuery(
      <ModelListingTable
        models={[listed('kling-4.0（特价）'), listed('veo-3', 'GWay')]}
        onChanged={onChanged}
      />
    )
    expect(screen.getByText('New models (2)')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Ignore kling-4.0（特价）' })
    )
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(ignoreModelListings).toHaveBeenCalledWith([
      { providerId: 'MangoAI-id', upstreamId: 'kling-4.0（特价）' },
    ])
  })

  it('keeps the rows and says so when ignoring fails', async () => {
    ignoreModelListings.mockRejectedValue(new Error('down'))
    renderWithQuery(
      <ModelListingTable models={[listed('veo-3')]} onChanged={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ignore veo-3' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ignoring failed. Try again.'
    )
    expect(screen.getByText('veo-3')).toBeInTheDocument()
  })
})

describe('IgnoreAllListingsButton', () => {
  it('is disabled while nothing is listed', () => {
    renderWithQuery(<IgnoreAllListingsButton models={[]} onChanged={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Ignore all (0)' })
    ).toBeDisabled()
  })

  it('asks first, and cancelling sends nothing', () => {
    renderWithQuery(
      <IgnoreAllListingsButton models={[listed('veo-3')]} onChanged={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: /^Ignore all \(/ }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(ignoreModelListings).not.toHaveBeenCalled()
  })

  it('sends the entries shown when it was clicked, not one found while confirming', async () => {
    ignoreModelListings.mockResolvedValue({ removed: 2 })
    const onChanged = vi.fn()
    const shown = [listed('veo-3'), listed('kling-4')]
    const view = renderWithQuery(
      <IgnoreAllListingsButton models={shown} onChanged={onChanged} />
    )
    fireEvent.click(screen.getByRole('button', { name: /^Ignore all \(/ }))
    view.rerender(
      <IgnoreAllListingsButton
        models={[...shown, listed('veo-4')]}
        onChanged={onChanged}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ignore all' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(ignoreModelListings).toHaveBeenCalledWith([
      { providerId: 'MangoAI-id', upstreamId: 'veo-3' },
      { providerId: 'MangoAI-id', upstreamId: 'kling-4' },
    ])
  })
})

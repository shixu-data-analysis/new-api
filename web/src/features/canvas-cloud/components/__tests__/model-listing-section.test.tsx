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

const listed = (
  upstreamId: string,
  providerName = 'MangoAI',
  firstSeenAt = '2026-11-19T01:00:12.000Z'
): ListedModel => ({
  providerId: `${providerName}-id`,
  providerName,
  upstreamId,
  firstSeenAt,
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
    expect(ignoreModelListings).toHaveBeenCalledWith({
      items: [{ providerId: 'MangoAI-id', upstreamId: 'kling-4.0（特价）' }],
    })
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
  it('narrows the rows to one API provider and to an upstream model ID, with Ignore all for every new model', () => {
    renderWithQuery(
      <ModelListingTable
        models={[
          listed('kling-4.0'),
          listed('veo-3', 'GWay'),
          listed('veo-3-fast', 'GWay'),
        ]}
        onChanged={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Ignore all (3)' })).toBeEnabled()
    const providers = screen.getByRole('group', { name: 'API provider' })
    fireEvent.click(within(providers).getByRole('button', { name: 'GWay' }))
    expect(screen.queryByText('kling-4.0')).toBeNull()
    expect(screen.getByText('veo-3-fast')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Column filters/ }))
    fireEvent.change(screen.getByLabelText('Upstream model ID'), {
      target: { value: 'FAST' },
    })
    expect(screen.queryByText('veo-3')).toBeNull()
    expect(screen.getByText('veo-3-fast')).toBeInTheDocument()
    // Ignore all still covers every new model, not only the rows the filters show.
    expect(screen.getByRole('button', { name: 'Ignore all (3)' })).toBeEnabled()
  })

  it('stops filtering by a chosen API provider once its last new model is ignored', () => {
    const view = renderWithQuery(
      <ModelListingTable
        models={[listed('kling-4.0'), listed('veo-3', 'GWay')]}
        onChanged={vi.fn()}
      />
    )
    const providers = () => screen.getByRole('group', { name: 'API provider' })
    fireEvent.click(within(providers()).getByRole('button', { name: 'GWay' }))
    expect(screen.queryByText('kling-4.0')).toBeNull()
    view.rerender(
      <ModelListingTable models={[listed('kling-4.0')]} onChanged={vi.fn()} />
    )
    expect(screen.getByText('kling-4.0')).toBeInTheDocument()
    expect(
      within(providers()).getByRole('button', { name: 'All API providers' })
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows 20 rows a page and moves to the next page', () => {
    renderWithQuery(
      <ModelListingTable
        models={Array.from({ length: 21 }, (_, index) =>
          listed(`model-${String(index).padStart(2, '0')}`)
        )}
        onChanged={vi.fn()}
      />
    )
    expect(screen.getByText('model-00')).toBeInTheDocument()
    expect(screen.queryByText('model-20')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /next page/i }))
    expect(screen.getByText('model-20')).toBeInTheDocument()
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

  it('ignores up to the newest entry shown when it was clicked, not one found while confirming', async () => {
    ignoreModelListings.mockResolvedValue({ removed: 2 })
    const onChanged = vi.fn()
    const shown = [
      listed('veo-3', 'MangoAI', '2026-11-19T04:00:00.000Z'),
      listed('kling-4', 'GWay', '2026-11-19T01:00:00.000Z'),
    ]
    const view = renderWithQuery(
      <IgnoreAllListingsButton models={shown} onChanged={onChanged} />
    )
    fireEvent.click(screen.getByRole('button', { name: /^Ignore all \(/ }))
    view.rerender(
      <IgnoreAllListingsButton
        models={[
          ...shown,
          listed('veo-4', 'MangoAI', '2026-11-19T07:00:00.000Z'),
        ]}
        onChanged={onChanged}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ignore all' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(ignoreModelListings).toHaveBeenCalledWith({
      firstSeenThrough: '2026-11-19T04:00:00.000Z',
    })
  })
})

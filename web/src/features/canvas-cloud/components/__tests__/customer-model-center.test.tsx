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
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CanvasCatalogModel } from '../../types'
import { CustomerModelCenter } from '../CustomerModelCenter'

const models: CanvasCatalogModel[] = [
  {
    id: 'image-1',
    modelKey: 'canvas.image.portrait',
    effectiveDisplayName: 'Portrait',
    catalogDefaultName: 'Catalog Portrait',
    catalog: {
      capability: 'image.generate',
      description: 'A long published description',
    },
    tags: [{ id: 'photo', name: 'Photography' }],
    parameterCombinations: [
      {
        id: 'quality-1',
        executionTargetId: 'target-1',
        parameters: { quality: '2K' },
        billingDimensions: {},
        billingUnit: 'REQUEST',
        tokenRates: null,
        points: '20',
      },
    ],
  },
  {
    id: 'image-2',
    modelKey: 'canvas.image.sketch',
    effectiveDisplayName: 'Sketch',
    catalogDefaultName: 'Catalog Sketch',
    catalog: { capability: 'image.generate' },
    tags: [],
    parameterCombinations: [],
  },
  {
    id: 'video-1',
    modelKey: 'canvas.video.clip',
    effectiveDisplayName: 'Clip',
    catalogDefaultName: 'Catalog Clip',
    catalog: { capability: 'video.generate' },
    tags: [{ id: 'film', name: 'Film' }],
    parameterCombinations: [
      {
        id: 'duration-1',
        executionTargetId: 'target-2',
        parameters: { resolution: '480P' },
        billingDimensions: {},
        billingUnit: 'SECOND',
        tokenRates: null,
        points: '22',
      },
      {
        id: 'clip-1',
        executionTargetId: 'target-3',
        parameters: { resolution: '720P' },
        billingDimensions: {},
        billingUnit: 'REQUEST',
        tokenRates: null,
        points: '150',
      },
    ],
  },
]

describe('customer model center', () => {
  it('filters actual catalog capabilities, tags and names without losing the current scope', () => {
    render(<CustomerModelCenter models={models} />)
    expect(screen.getByRole('button', { name: 'All tags 3' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'image.generate' }))
    expect(screen.getByRole('button', { name: 'All tags 2' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Photography 1' })).toBeVisible()
    expect(screen.getByText('Portrait')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'View model identity' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Clip')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Untagged 1' }))
    expect(screen.getByText('Sketch')).toBeVisible()
    expect(screen.queryByText('Portrait')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search model name'), {
      target: { value: 'missing' },
    })
    expect(screen.getByRole('button', { name: 'All tags 0' })).toBeVisible()
    expect(screen.getByText('No matching models')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByText('Sketch')).toBeVisible()
  })

  it('shows complete published description and distinguishes an empty filtered scope', () => {
    render(<CustomerModelCenter models={models} />)
    expect(screen.getByText('A long published description')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'video.generate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Untagged 0' }))
    expect(screen.getByText('No models available in this filter')).toBeVisible()
  })

  it('anchors each card with its capability icon, tags and emphasized points', () => {
    const { container } = render(<CustomerModelCenter models={models} />)

    const cards = container.querySelectorAll('[data-slot="card"]')
    expect(cards).toHaveLength(3)
    expect(
      cards[0].querySelector('[data-slot="card-header"] svg')
    ).not.toBeNull()
    expect(
      within(cards[0] as HTMLElement).getByText('Photography')
    ).toHaveAttribute('data-slot', 'badge')
    expect(within(cards[2] as HTMLElement).getByText('Film')).toHaveAttribute(
      'data-slot',
      'badge'
    )
    expect(
      within(cards[1] as HTMLElement).queryByText('Photography')
    ).toBeNull()
  })

  it('searches only the client display name without exposing internal identities', () => {
    render(<CustomerModelCenter models={models} />)
    const search = screen.getByLabelText('Search model name')

    fireEvent.change(search, { target: { value: 'Catalog Portrait' } })
    expect(screen.getByText('No matching models')).toBeVisible()
    fireEvent.change(search, { target: { value: 'canvas.image.portrait' } })
    expect(screen.getByText('No matching models')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'View model identity' })
    ).not.toBeInTheDocument()
  })

  it('shows each combination price with its billing unit', () => {
    const tokenModel: CanvasCatalogModel = {
      id: 'text-1',
      modelKey: 'canvas.text.chat',
      effectiveDisplayName: 'Chat',
      catalogDefaultName: 'Catalog Chat',
      catalog: { capability: 'text.generate' },
      tags: [],
      parameterCombinations: [
        {
          id: 'token-1',
          executionTargetId: 'target-4',
          parameters: {},
          billingDimensions: {},
          billingUnit: 'MILLION_TOKENS',
          tokenRates: { input: '12', output: '48' },
          points: '0',
        },
      ],
    }
    const { container } = render(
      <CustomerModelCenter models={[...models, tokenModel]} />
    )
    const cards = container.querySelectorAll('[data-slot="card"]')
    expect(cards[0]).toHaveTextContent('20points per request')
    expect(cards[2]).toHaveTextContent('22points per second')
    expect(cards[2]).toHaveTextContent('150points per request')
    expect(cards[3]).toHaveTextContent(
      'Input 12 · Output 48points per million tokens'
    )
    expect(cards[3]).not.toHaveTextContent('0points')
  })
})

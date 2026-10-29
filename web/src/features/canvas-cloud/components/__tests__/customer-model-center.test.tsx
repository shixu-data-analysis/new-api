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

import type { CanvasCatalogCategories, CanvasCatalogModel } from '../../types'
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
    iconKey: 'openai',
    iconColor: 'green',
    badges: [
      { name: 'Official', color: 'green' },
      { name: 'Hot', color: 'unknown' },
      { name: 'New', color: 'blue' },
    ],
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
    iconKey: null,
    iconColor: null,
    badges: [],
    parameterCombinations: [],
  },
  {
    id: 'video-1',
    modelKey: 'canvas.video.clip',
    effectiveDisplayName: 'Clip',
    catalogDefaultName: 'Catalog Clip',
    catalog: { capability: 'video.generate' },
    tags: [{ id: 'film', name: 'Film' }],
    iconKey: null,
    iconColor: null,
    badges: [],
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

const categories: CanvasCatalogCategories = {
  categories: [
    {
      id: 'photo',
      name: 'Photography',
      iconKey: 'seedance',
      iconColor: 'blue',
      description: 'Portraits and scenes',
    },
    {
      id: 'film',
      name: 'Film',
      iconKey: null,
      iconColor: 'gray',
      description: null,
    },
  ],
  orders: { 'image.generate': ['photo'], 'video.generate': ['film'] },
  defaults: { 'image.generate': 'photo', 'video.generate': 'UNTAGGED' },
}
// Cloud returns no presentation when no visible model has a category.
const noCategories: CanvasCatalogCategories = {
  categories: [],
  orders: {},
  defaults: {},
}

describe('customer model center', () => {
  it('opens on the first type in client order without an all-types choice', () => {
    render(
      <CustomerModelCenter
        showModelIcons
        models={[models[2]!, models[0]!, models[1]!]}
        categories={noCategories}
      />
    )
    const types = screen.getAllByRole('button', { name: /\.generate$/u })
    expect(types.map((button) => button.textContent)).toEqual([
      'image.generate',
      'video.generate',
    ])
    expect(screen.queryByRole('button', { name: 'All types' })).toBeNull()
    expect(types[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens each type on its cloud default category and follows it again after a type switch', () => {
    render(
      <CustomerModelCenter
        showModelIcons
        models={models}
        categories={categories}
      />
    )
    expect(
      screen.getByRole('button', { name: 'Photography 1' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Portrait')).toBeVisible()
    expect(screen.queryByText('Sketch')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'All categories 2' }))
    expect(screen.getByText('Sketch')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'video.generate' }))
    expect(
      screen.getByRole('button', { name: 'No category 0' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('No models available in this filter')).toBeVisible()
  })

  it('keeps the category filters text-only', () => {
    const { container } = render(
      <CustomerModelCenter
        showModelIcons
        models={models}
        categories={categories}
      />
    )
    expect(
      screen.getByRole('button', { name: 'Photography 1' })
    ).toBeInTheDocument()
    expect(
      container.querySelectorAll('[role="group"] .model-icon-tile')
    ).toHaveLength(0)
  })

  it('filters categories and names inside the selected type without losing the current scope', () => {
    render(
      <CustomerModelCenter
        showModelIcons
        models={models}
        categories={noCategories}
      />
    )
    expect(
      screen.getByRole('button', { name: 'All categories 2' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Photography 1' })).toBeVisible()
    expect(screen.getByText('Portrait')).toBeVisible()
    expect(screen.queryByText('Clip')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'No category 1' }))
    expect(screen.getByText('Sketch')).toBeVisible()
    expect(screen.queryByText('Portrait')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search model name'), {
      target: { value: 'missing' },
    })
    expect(
      screen.getByRole('button', { name: 'All categories 0' })
    ).toBeVisible()
    expect(screen.getByText('No matching models')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByText('Sketch')).toBeVisible()
  })

  it('shows the complete published description', () => {
    render(
      <CustomerModelCenter
        showModelIcons
        models={models}
        categories={noCategories}
      />
    )
    expect(screen.getByText('A long published description')).toBeVisible()
  })

  it('shows the generation type on each card and no category', () => {
    const { container } = render(
      <CustomerModelCenter
        showModelIcons
        models={models}
        categories={categories}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'All categories 2' }))
    const cards = container.querySelectorAll<HTMLElement>('[data-slot="card"]')
    expect(cards).toHaveLength(2)
    expect(
      cards[0]!.querySelector('[data-slot="card-header"] svg')
    ).not.toBeNull()
    expect(within(cards[0]!).queryByText('Photography')).toBeNull()
    expect(within(cards[0]!).getByText('image.generate')).toBeVisible()
  })

  it('shows the chosen icon and at most two badges after the title with unknown colors as gray', () => {
    const { container } = render(
      <CustomerModelCenter
        showModelIcons
        models={models}
        categories={noCategories}
      />
    )
    const cards = container.querySelectorAll<HTMLElement>('[data-slot="card"]')
    const brandTile = cards[0]!.querySelector('.model-icon-tile')
    expect(brandTile).toHaveAttribute('data-model-color', 'green')
    expect(brandTile).toHaveAttribute('aria-hidden', 'true')
    expect(brandTile?.querySelector('use')).toHaveAttribute(
      'href',
      '#model-icon-openai'
    )
    expect(within(cards[0]!).getByText('Official')).toHaveAttribute(
      'data-model-color',
      'green'
    )
    expect(within(cards[0]!).getByText('Hot')).toHaveAttribute(
      'data-model-color',
      'gray'
    )
    expect(within(cards[0]!).queryByText('New')).toBeNull()
    expect(cards[1]!.querySelector('.model-icon-tile')).toHaveAttribute(
      'data-model-color',
      'none'
    )
  })

  it('shows no model icon and no icon column while the administrator hides model icons', () => {
    const { container } = render(
      <CustomerModelCenter
        showModelIcons={false}
        models={models}
        categories={noCategories}
      />
    )
    expect(
      container.querySelector('[data-slot="card"] .model-icon-tile')
    ).toBeNull()
    expect(
      container.querySelector('[data-slot="card"] [data-slot="card-header"]')
    ).toHaveClass('grid-cols-[minmax(0,1fr)]')
  })

  it('searches only the client display name without exposing internal identities', () => {
    render(
      <CustomerModelCenter
        showModelIcons
        models={models}
        categories={noCategories}
      />
    )
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
      catalog: { capability: 'chat.generate' },
      tags: [],
      iconKey: null,
      iconColor: null,
      badges: [],
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
      <CustomerModelCenter
        showModelIcons
        models={[...models, tokenModel]}
        categories={noCategories}
      />
    )
    const cards = () => container.querySelectorAll('[data-slot="card"]')
    expect(cards()[0]).toHaveTextContent('20points per request')
    fireEvent.click(screen.getByRole('button', { name: 'video.generate' }))
    expect(cards()[0]).toHaveTextContent('22points per second')
    expect(cards()[0]).toHaveTextContent('150points per request')
    fireEvent.click(screen.getByRole('button', { name: 'chat.generate' }))
    expect(cards()[0]).toHaveTextContent(
      'Input12points per million tokensOutput48points per million tokens'
    )
    expect(cards()[0]).not.toHaveTextContent('0points')
  })
})

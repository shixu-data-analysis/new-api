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
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CanvasCatalogModel } from '../../types'
import { CustomerModelCenter } from '../CustomerModelCenter'

const models: CanvasCatalogModel[] = [
  {
    id: 'image-1',
    name: 'Portrait',
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
        points: '20',
      },
    ],
  },
  {
    id: 'image-2',
    name: 'Sketch',
    catalog: { capability: 'image.generate' },
    tags: [],
    parameterCombinations: [],
  },
  {
    id: 'video-1',
    name: 'Clip',
    catalog: { capability: 'video.generate' },
    tags: [{ id: 'film', name: 'Film' }],
    parameterCombinations: [],
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
})

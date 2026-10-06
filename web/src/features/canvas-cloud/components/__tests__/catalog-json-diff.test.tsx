import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { diffCatalogJson } from '../../catalog-json-diff'
import { CatalogJsonDiff } from '../CatalogJsonDiff'

const before = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  release: { publicInteraction: { referenceLimits: { max: 1 } } },
}
const after = {
  ...before,
  release: { publicInteraction: { referenceLimits: { max: 2 } } },
}

describe('Catalog JSON diff', () => {
  it('folds unchanged lines by default and switches to the full text when a fold is clicked', () => {
    render(
      <CatalogJsonDiff
        title='Model definition'
        summary='Compared'
        diff={diffCatalogJson(before, after)}
      />
    )

    expect(screen.queryByText('"a": 1,')).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', {
        name: '⋯ 5 unchanged lines. Click to expand.',
      })
    )

    expect(screen.getByText('"a": 1,')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Show changes only' })
    ).toBeInTheDocument()
  })

  it('switches between the full text and changes only', () => {
    render(
      <CatalogJsonDiff
        title='Model definition'
        summary='Compared'
        diff={diffCatalogJson(before, after)}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Show full text' }))
    expect(screen.getByText('"a": 1,')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show changes only' }))
    expect(screen.queryByText('"a": 1,')).not.toBeInTheDocument()
  })

  it('marks removed and added lines', () => {
    render(
      <CatalogJsonDiff
        title='Model definition'
        summary='Compared'
        diff={diffCatalogJson(before, after)}
      />
    )

    expect(screen.getByText('"max": 1').tagName).toBe('DEL')
    expect(screen.getByText('"max": 2').tagName).toBe('INS')
  })

  it('shows the full new text without a toggle when there is no current content', () => {
    render(
      <CatalogJsonDiff
        title='Model definition'
        summary='New'
        diff={diffCatalogJson(null, after)}
      />
    )

    expect(screen.getByText('"a": 1,')).toBeInTheDocument()
    expect(screen.queryByText(/^[+−]$/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Show full text' })
    ).not.toBeInTheDocument()
  })

  it('shows the full text without a toggle when nothing changed', () => {
    render(
      <CatalogJsonDiff
        title='Model definition'
        summary='Same'
        diff={diffCatalogJson(before, { ...before })}
      />
    )

    expect(screen.getByText('"a": 1,')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Show full text' })
    ).not.toBeInTheDocument()
  })
})

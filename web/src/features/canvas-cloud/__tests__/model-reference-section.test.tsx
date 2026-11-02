import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Accepts } from '../catalog-channel-draft'
import type { SentFields } from '../catalog-edit-logic'
import type { CatalogModelDefinition } from '../catalog-edit-types'
import { ModelReferenceSection } from '../components/catalog-edit/ModelEditorSections'

function modelOf(
  capability: string,
  referenceLimits: Record<string, unknown> = {}
): CatalogModelDefinition {
  return {
    capability,
    release: { publicInteraction: { referenceLimits } },
  } as unknown as CatalogModelDefinition
}

function renderSection(draft: CatalogModelDefinition, accepted: Accepts) {
  render(
    <ModelReferenceSection
      draft={draft}
      base={null}
      sent={{} as SentFields}
      catalogValues={() => []}
      errors={{}}
      set={() => undefined}
      was={() => undefined}
      accepted={accepted}
    />
  )
}

describe('modes a model can turn on follow what its interface takes', () => {
  it('greys out first and last frames and full reference when the interface takes only the first frame', () => {
    renderSection(modelOf('video.generate'), { first: true })
    expect(
      screen.getByRole('switch', { name: 'Image to video' })
    ).not.toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('switch', { name: 'First and last frames' })
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByText(
        'Not available: the Channel configuration does not take both frames, so first and last frames cannot be turned on.'
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('switch', { name: 'Full reference' })
    ).not.toBeInTheDocument()
  })

  it('keeps a mode that is already on switchable, so it can be turned off', () => {
    renderSection(
      modelOf('video.generate', { supportsStartEndFrames: true }),
      {}
    )
    expect(
      screen.getByRole('switch', { name: 'First and last frames' })
    ).not.toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('switch', { name: 'Image to video' })
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('explains why an image model has no reference images', () => {
    renderSection(modelOf('image.generate'), {})
    expect(
      screen.getByText(
        'Not available: the Channel configuration does not take reference images, so reference images and camera angle, relight and region edit cannot be turned on.'
      )
    ).toBeInTheDocument()
  })
})

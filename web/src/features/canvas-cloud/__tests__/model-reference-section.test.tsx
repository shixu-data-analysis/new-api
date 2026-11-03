import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function renderSection(
  draft: CatalogModelDefinition,
  accepted: Accepts,
  set: (path: string[], value: unknown) => void = () => undefined
) {
  render(
    <ModelReferenceSection
      draft={draft}
      base={null}
      sent={{} as SentFields}
      catalogValues={() => []}
      errors={{}}
      set={set}
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

describe('a video model can be made an upscale model', () => {
  it('turns upscale on when the interface takes a video, without accepting the source resolution', async () => {
    const calls: Array<[string[], unknown]> = []
    renderSection(modelOf('video.generate'), { video: true }, (path, value) =>
      calls.push([path, value])
    )
    const upscale = screen.getByRole('switch', { name: 'Upscale only' })
    expect(upscale).not.toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(upscale)
    expect(calls).toEqual([
      [
        ['referenceLimits', 'videoOperations'],
        { upscale: { sameResolution: false } },
      ],
    ])
  })

  it('offers the same-resolution rebuild once on, and keeps upscale switchable off without a video', () => {
    renderSection(
      modelOf('video.generate', {
        videoOperations: { upscale: { sameResolution: true } },
      }),
      {}
    )
    expect(
      screen.getByRole('switch', { name: 'Upscale only' })
    ).not.toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('switch', {
        name: 'Accepts the source resolution (rebuilds at the same size)',
      })
    ).toBeChecked()
  })

  it('cannot be turned on when the interface takes no video', () => {
    renderSection(modelOf('video.generate'), { first: true })
    expect(
      screen.getByRole('switch', { name: 'Upscale only' })
    ).toHaveAttribute('aria-disabled', 'true')
  })
})

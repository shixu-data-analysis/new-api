import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CatalogModelDefinition } from '../../catalog-edit-types'
import { CanvasPreview } from '../catalog-edit/CanvasPreview'

const sent = {
  aspectRatio: [],
  quality: [],
  apiQuality: [],
  durationSeconds: [],
  generateAudio: [],
  watermark: [],
  batchSize: [],
  background: [],
  media: { image: false, video: true, audio: false },
  modelFields: [],
}

function upscaleModel(sameResolution: boolean) {
  return {
    productKey: 'p.video.upscale',
    displayName: 'MC-视频超分-标准',
    capability: 'video.generate',
    release: {
      channelId: 'c',
      execution: { providerModel: { modelId: 'u' } },
      publicInteraction: {
        defaultParams: { quality: '1080P', durationSeconds: 5, batchSize: 1 },
        paramSchema: {
          qualities: ['720P', '1080P', '2K'],
          durationRange: { min: 1, max: 600, step: 1 },
          maxBatchSize: 1,
        },
        referenceLimits: {
          supportsVideoReference: true,
          maxVideoReferences: 1,
          videoOperations: { upscale: { sameResolution } },
        },
      },
    },
  } as unknown as CatalogModelDefinition
}

// Tiers within the resolution group; the source picker lists names like 720P too.
const tier = (name: string) =>
  within(screen.getByRole('group', { name: 'Quality tier' })).getByRole(
    'button',
    { name }
  )

describe('Canvas preview of a video upscale model', () => {
  it('shows the toolbar upscale panel instead of the generation panel', () => {
    render(<CanvasPreview model={upscaleModel(true)} sent={sent} />)
    expect(screen.getByText('Upscale panel')).toBeInTheDocument()
    expect(screen.getByText('Start upscale')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Video mode' })).toBeNull()
    expect(screen.queryByRole('slider', { name: 'Length' })).toBeNull()
    // A 720P source: 720P rebuilds at its size, nothing is below it.
    expect(tier('720P')).not.toBeDisabled()
    expect(
      screen.getByText('720P rebuilds at the source size without enlarging')
    ).toBeInTheDocument()
    expect(screen.getByText('720 × 1280')).toBeInTheDocument()
  })

  it('disables the tiers the source rules out, as the canvas does', () => {
    render(<CanvasPreview model={upscaleModel(false)} sent={sent} />)
    expect(tier('720P')).toBeDisabled()
    expect(
      screen.getByText(
        '720P and below are not offered: this model only enlarges'
      )
    ).toBeInTheDocument()
    fireEvent.click(tier('1080P'))
    expect(screen.getByText('1080 × 1920')).toBeInTheDocument()
  })
})

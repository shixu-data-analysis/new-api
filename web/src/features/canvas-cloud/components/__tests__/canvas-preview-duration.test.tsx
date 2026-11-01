import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CatalogModelDefinition } from '../../catalog-edit-types'
import { CanvasPreview } from '../catalog-edit/CanvasPreview'

const sent = { aspectRatio: [], quality: [], apiQuality: [], durationSeconds: [], generateAudio: [], watermark: [], batchSize: [], background: [], media: { image: false, video: false, audio: false }, modelFields: [] }

function model(qualities: string[]) {
  return {
    productKey: 'p.video.m', displayName: 'm', capability: 'video.generate',
    release: { channelId: 'c', execution: { providerModel: { modelId: 'm' } }, publicInteraction: {
      defaultParams: { quality: '720P' },
      paramSchema: { qualities, durationRange: { min: 5, max: 15, step: 1 }, durationRangeByQuality: { '720P': { max: 12 } } },
      referenceLimits: { supportsTextToVideo: true },
    } },
  } as unknown as CatalogModelDefinition
}

describe('Canvas preview duration', () => {
  it('limits the duration by the resolution shown, also after a picked resolution is removed', () => {
    const { rerender } = render(<CanvasPreview model={model(['480P', '720P'])} sent={sent} />)
    const slider = () => screen.getByRole('slider', { name: 'Length' })
    expect(slider()).toHaveAttribute('max', '12')
    fireEvent.click(screen.getByRole('button', { name: '480P' }))
    expect(slider()).toHaveAttribute('max', '15')
    rerender(<CanvasPreview model={model(['720P'])} sent={sent} />)
    expect(slider()).toHaveAttribute('max', '12')
  })
})

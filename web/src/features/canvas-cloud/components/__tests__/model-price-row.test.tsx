/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'

import en from '@/i18n/locales/en.json'

import { ModelCardPrices } from '../ModelCardPrices'
import { ModelPriceRow } from '../ModelCatalogCard'

beforeAll(() =>
  i18next.addResourceBundle('en', 'translation', en.translation, true, true)
)

describe('ModelPriceRow (VIDEO-TOKEN-BILLING-001)', () => {
  it('shows a video priced by its totals as one line per pricing scope, named by the video input', () => {
    render(
      <ModelPriceRow
        parameters={{ quality: '720p' }}
        billingUnit='MILLION_TOKENS'
        points='4800'
        tokenRates={{ total: '4800', totalWithVideoInput: '2950' }}
      />
    )
    expect(screen.getByText('720p · Without video input')).toBeVisible()
    expect(screen.getByText('720p · With video input')).toBeVisible()
    expect(screen.getByText('4800')).toBeVisible()
    expect(screen.getByText('2950')).toBeVisible()
    expect(screen.queryByText(/Total/)).not.toBeInTheDocument()
  })

  it('names a per-second video spec by its resolution only', () => {
    render(
      <ModelPriceRow
        parameters={{ quality: '720p' }}
        billingUnit='SECOND'
        points='100'
        tokenRates={null}
      />
    )
    expect(screen.getByText('720p')).toBeVisible()
    expect(screen.queryByText(/video input/)).not.toBeInTheDocument()
  })
})

describe('ModelCardPrices (VIDEO-TOKEN-BILLING-001)', () => {
  const spec = (quality: string) => ({
    key: quality,
    parameters: { quality },
    billingUnit: 'MILLION_TOKENS' as const,
    points: '4800',
    tokenRates: { total: '4800', totalWithVideoInput: '2950' },
  })

  it('keeps a row per resolution of a video at equal rates, but one block for an image', () => {
    const now = new Date('2026-10-30T00:00:00Z')
    const { unmount } = render(
      <ModelCardPrices
        prices={[spec('480p'), spec('720p')]}
        capability='video.generate'
        now={now}
      />
    )
    for (const name of [
      '480p · Without video input',
      '480p · With video input',
      '720p · Without video input',
      '720p · With video input',
    ]) {
      expect(screen.getByText(name)).toBeVisible()
    }
    unmount()
    render(
      <ModelCardPrices
        prices={['1K', '2K'].map((quality) => ({
          ...spec(quality),
          tokenRates: { input: '3000', output: '18000' },
        }))}
        capability='image.generate'
        now={now}
      />
    )
    expect(screen.getAllByText('3000')).toHaveLength(1)
    expect(screen.queryByText('1K')).not.toBeInTheDocument()
  })
})

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

import type { CanvasModelMonitoringOverview } from '../../types'
import { ModelMonitoringOverview } from '../ModelMonitoringOverview'

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  control: vi.fn(),
}))
vi.mock('../../api', () => ({
  getCanvasModelMonitoringOverview: mocks.getOverview,
  controlCanvasLogicalModel: mocks.control,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const bucket = (
  from: string,
  succeeded: number,
  failed: number,
  unknown = 0,
  processing = 0
) => ({
  from,
  to: new Date(Date.parse(from) + 60 * 60 * 1000).toISOString(),
  succeeded,
  failed,
  unknown,
  processing,
  resultCount: succeeded + failed + unknown + processing,
  sampleCount: succeeded + failed,
  successRate: succeeded + failed ? succeeded / (succeeded + failed) : null,
})

const overview: CanvasModelMonitoringOverview = {
  window: 'day',
  origin: 'REAL',
  from: '2026-09-18T00:00:00.000Z',
  to: '2026-09-19T00:00:00.000Z',
  bucketSeconds: 3600,
  page: 1,
  pageSize: 10,
  total: 2,
  preTagTotal: 2,
  capabilities: [{ value: 'IMAGE', count: 2 }],
  providers: [{ id: 'provider-a', name: 'Provider A', count: 2 }],
  tags: [{ id: 'tag-a', name: 'Photo', count: 1 }],
  untaggedCount: 1,
  rows: [
    {
      modelKey: 'image.alpha',
      name: 'Alpha model',
      capability: 'IMAGE',
      provider: { id: 'provider-a', name: 'Provider A' },
      tags: [{ id: 'tag-a', name: 'Photo' }],
      manualEnabled: true,
      controlVersion: 3,
      summary: bucket('2026-09-18T00:00:00.000Z', 9, 1),
      trend: [
        bucket('2026-09-18T00:00:00.000Z', 9, 1),
        bucket('2026-09-18T01:00:00.000Z', 0, 0, 1),
      ],
    },
    {
      modelKey: 'image.beta',
      name: 'Beta model',
      capability: 'IMAGE',
      provider: { id: 'provider-a', name: 'Provider A' },
      tags: [],
      manualEnabled: false,
      controlVersion: 7,
      summary: bucket('2026-09-18T00:00:00.000Z', 0, 0, 1),
      trend: [
        bucket('2026-09-18T00:00:00.000Z', 0, 0, 1),
        bucket('2026-09-18T01:00:00.000Z', 0, 0),
      ],
    },
  ],
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ModelMonitoringOverview />
    </QueryClientProvider>
  )
}

describe('logical model monitoring overview', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
    i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    mocks.getOverview.mockResolvedValue(overview)
    mocks.control.mockResolvedValue({
      id: 'control-a',
      version: 4,
      status: 'PUBLISHED',
      effectiveAt: '2026-09-19T00:00:00.000Z',
    })
  })

  it('shows a model-key matrix and keeps unknown-only buckets as no-data results', async () => {
    mount()
    expect(
      await screen.findByRole('heading', { name: 'Per-model result matrix' })
    ).toBeVisible()
    expect(mocks.getOverview).toHaveBeenCalledWith(
      expect.objectContaining({ window: 'day', origin: 'REAL', page: 1 }),
      expect.anything()
    )
    const allTags = screen.getByRole('button', { name: 'All tags 2' })
    expect(allTags).toHaveAttribute('aria-pressed', 'true')
    expect(within(allTags).getByText('2')).toHaveAttribute('data-slot', 'badge')
    expect(screen.getByRole('button', { name: 'Photo 1' })).toBeVisible()
    const matrix = screen.getByRole('table', {
      name: 'Per-model result matrix',
    })
    expect(
      within(matrix).getByRole('button', {
        name: /Alpha model.*Successful results 9.*Confirmed failures 1/,
      })
    ).toHaveAttribute('aria-pressed', 'false')
    const unknownBucket = within(matrix).getByRole('button', {
      name: /Alpha model.*No data.*Unknown outcomes 1/,
    })
    fireEvent.click(unknownBucket)
    expect(unknownBucket).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('group', { name: 'Results by interval' })
    ).toBeVisible()
  })

  it('sends stable-key filters and separates Mock results from Real results', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Per-model result matrix' })
    fireEvent.click(screen.getByRole('button', { name: 'Photo 1' }))
    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({ tagId: 'tag-a', page: 1 }),
        expect.anything()
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mock calls' }))
    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({ origin: 'MOCK', tagId: 'tag-a' }),
        expect.anything()
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Untagged 1' }))
    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({ untagged: true }),
        expect.anything()
      )
    )
  })

  it('submits a reasoned whole-model control with the expected version', async () => {
    mount()
    await screen.findByRole('heading', { name: 'Per-model result matrix' })
    const matrix = screen.getByRole('table', {
      name: 'Per-model result matrix',
    })
    fireEvent.click(
      within(matrix).getByRole('button', { name: 'Disable model' })
    )
    const dialog = await screen.findByRole('dialog', { name: 'Disable model' })
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: 'MAINTENANCE' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Disable model' })
    )
    await waitFor(() =>
      expect(mocks.control).toHaveBeenCalledWith('image.alpha', {
        enabled: false,
        expectedVersion: 3,
        reasonCode: 'MAINTENANCE',
        note: '',
        confirmed: true,
      })
    )
  })

  it('resets the selected bucket on pagination and follows the server-clamped page', async () => {
    let clamped = false
    mocks.getOverview.mockImplementation(async (query: { page: number }) => {
      if (query.page === 2) clamped = true
      return {
        ...overview,
        page: 1,
        total: clamped ? 1 : 22,
        rows: clamped ? overview.rows.slice(0, 1) : overview.rows,
      }
    })
    mount()
    const matrix = await screen.findByRole('table', {
      name: 'Per-model result matrix',
    })
    const unknownBucket = within(matrix).getByRole('button', {
      name: /Alpha model.*No data.*Unknown outcomes 1/,
    })
    fireEvent.click(unknownBucket)
    expect(unknownBucket).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything()
      )
    )
    await waitFor(() => expect(screen.getByText('1 / 1')).toBeVisible())
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(
      within(
        screen.getByRole('table', { name: 'Per-model result matrix' })
      ).getByRole('button', {
        name: /Alpha model.*No data.*Unknown outcomes 1/,
      })
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the control dialog open and explains a version conflict', async () => {
    mocks.control.mockRejectedValueOnce({ response: { status: 409 } })
    mount()
    const matrix = await screen.findByRole('table', {
      name: 'Per-model result matrix',
    })
    fireEvent.click(
      within(matrix).getByRole('button', { name: 'Disable model' })
    )
    const dialog = await screen.findByRole('dialog', { name: 'Disable model' })
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: 'MAINTENANCE' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Disable model' })
    )
    expect(
      await within(dialog).findByText(
        'The model state changed. Refresh and review before retrying.'
      )
    ).toBeVisible()
    expect(dialog).toBeVisible()
  })
})

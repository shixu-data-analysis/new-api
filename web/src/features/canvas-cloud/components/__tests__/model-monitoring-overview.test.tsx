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

import { monitoringTickLabelIndexes } from '../../model-monitoring-overview'
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
vi.mock('../CanvasDateRangeFilter', () => ({
  CanvasDateRangeFilter: (props: {
    from?: Date
    to?: Date
    onFromChange: (value?: Date) => void
    onToChange: (value?: Date) => void
  }) => (
    <div>
      <label>
        Start time
        <input
          aria-label='Start time'
          value={props.from?.toISOString() ?? ''}
          onChange={(event) =>
            props.onFromChange(
              event.target.value ? new Date(event.target.value) : undefined
            )
          }
        />
      </label>
      <label>
        End time
        <input
          aria-label='End time'
          value={props.to?.toISOString() ?? ''}
          onChange={(event) =>
            props.onToChange(
              event.target.value ? new Date(event.target.value) : undefined
            )
          }
        />
      </label>
    </div>
  ),
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

it('keeps the first and last time labels while limiting dense matrix ticks', () => {
  expect([...monitoringTickLabelIndexes(24)]).toEqual([0, 5, 9, 14, 18, 23])
  expect([...monitoringTickLabelIndexes(6)]).toEqual([0, 1, 2, 3, 4, 5])
  expect([...monitoringTickLabelIndexes(0)]).toEqual([])
})

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
    const matrixHeading = await screen.findByRole('heading', {
      name: 'Per-model result matrix',
    })
    expect(matrixHeading).toBeVisible()
    expect(matrixHeading.parentElement).toHaveTextContent('Total models: 2')
    expect(screen.getByText('Page 1 of 1')).toBeVisible()
    expect(screen.getByLabelText('Rows per page')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Go to previous page' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Go to next page' })
    ).toBeDisabled()
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
    const alphaName = within(matrix).getByText('Alpha model')
    expect(
      within(matrix).queryByRole('button', { name: 'Alpha model' })
    ).not.toBeInTheDocument()
    const alphaRow = alphaName.closest('[role="row"]')
    expect(alphaRow).toHaveAttribute('aria-selected', 'true')
    expect(alphaRow).toHaveClass('bg-primary/10')
    const betaRow = within(matrix)
      .getByText('Beta model')
      .closest('[role="row"]')
    if (!betaRow) throw new Error('Beta model row is missing')
    fireEvent.click(betaRow)
    expect(betaRow).toHaveAttribute('aria-selected', 'true')
    expect(betaRow).toHaveClass('bg-primary/10')
    expect(alphaRow).toHaveAttribute('aria-selected', 'false')
    expect(
      within(matrix).getByRole('button', {
        name: /Alpha model.*Successful results 9.*Confirmed failures 1/,
      })
    ).toHaveClass('h-6', 'w-5')
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

  it('applies only a complete valid custom range and clears it for a preset', async () => {
    mocks.getOverview.mockImplementation(async (query: { page: number }) => ({
      ...overview,
      page: query.page,
      total: 22,
    }))
    mount()
    const matrix = await screen.findByRole('table', {
      name: 'Per-model result matrix',
    })
    fireEvent.click(
      within(matrix).getByRole('button', {
        name: /Alpha model.*No data.*Unknown outcomes 1/,
      })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything()
      )
    )

    const callsBeforeDraft = mocks.getOverview.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }))
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.getByText('Select a positive time range of at most 30 days')
    ).toBeVisible()
    expect(mocks.getOverview).toHaveBeenCalledTimes(callsBeforeDraft)

    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '2026-09-01T00:00:00.000Z' },
    })
    fireEvent.change(screen.getByLabelText('End time'), {
      target: { value: '2026-10-02T00:00:00.000Z' },
    })
    expect(confirm).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Select a positive time range of at most 30 days'
    )
    expect(mocks.getOverview).toHaveBeenCalledTimes(callsBeforeDraft)

    fireEvent.change(screen.getByLabelText('End time'), {
      target: { value: '2026-09-15T12:30:00.000Z' },
    })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({
          window: 'custom',
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-15T12:30:00.000Z',
          page: 1,
        }),
        expect.anything()
      )
    )
    expect(
      within(
        screen.getByRole('table', { name: 'Per-model result matrix' })
      ).getByRole('button', {
        name: /Alpha model.*No data.*Unknown outcomes 1/,
      })
    ).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Last hour' }))
    await waitFor(() => {
      const query = mocks.getOverview.mock.calls.at(-1)?.[0]
      expect(query).toEqual(
        expect.objectContaining({ window: 'hour', page: 1 })
      )
      expect(query).not.toHaveProperty('from')
      expect(query).not.toHaveProperty('to')
    })
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
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything()
      )
    )
    await waitFor(() => expect(screen.getByText('Page 1 of 1')).toBeVisible())
    expect(
      screen.getByRole('button', { name: 'Go to next page' })
    ).toBeDisabled()
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

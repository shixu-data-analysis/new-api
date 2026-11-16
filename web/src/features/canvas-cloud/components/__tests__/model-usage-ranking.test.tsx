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

import type { CanvasModelUsage } from '../../types'
import { ModelUsageRanking } from '../ModelUsageRanking'

const mocks = vi.hoisted(() => ({ getUsage: vi.fn() }))
vi.mock('../../api', () => ({ getCanvasModelUsage: mocks.getUsage }))
vi.mock('../CanvasDateRangeFilter', () => ({
  CanvasDateRangeFilter: (props: {
    onFromChange: (value?: Date) => void
    onToChange: (value?: Date) => void
  }) => (
    <div>
      <input
        aria-label='Start time'
        onChange={(event) => props.onFromChange(new Date(event.target.value))}
      />
      <input
        aria-label='End time'
        onChange={(event) => props.onToChange(new Date(event.target.value))}
      />
    </div>
  ),
}))

const model = (
  modelKey: string,
  capability: string,
  results: number,
  customers: number,
  previousResults: number,
  previousCustomers = previousResults
) => ({
  modelKey,
  displayName: modelKey,
  capability,
  manualEnabled: modelKey !== 'video.old',
  results,
  customers,
  previousResults,
  previousCustomers,
})
const usage: CanvasModelUsage = {
  window: 'week',
  from: '2026-11-09T00:00:00.000Z',
  to: '2026-11-16T00:00:00.000Z',
  previousFrom: '2026-11-02T00:00:00.000Z',
  types: [
    { capability: 'image.generate', results: 300, customers: 40, models: 9 },
    { capability: 'video.generate', results: 100, customers: 12, models: 2 },
  ],
  models: [
    ...Array.from({ length: 9 }, (_, index) =>
      model(`image.${index}`, 'image.generate', 60 - index * 5, index + 1, 40)
    ),
    model('video.fast', 'video.generate', 70, 3, 0),
    model('video.old', 'video.generate', 30, 9, 60),
  ],
}

function mount(onOpenModel = vi.fn()) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ModelUsageRanking onOpenModel={onOpenModel} />
    </QueryClientProvider>
  )
  return onOpenModel
}

describe('model usage ranking', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    mocks.getUsage.mockResolvedValue(usage)
  })

  it('compares the types and ranks each type by results with the change against the previous period', async () => {
    const onOpenModel = mount()
    const video = await screen.findByRole('region', {
      name: 'Video generation ranking',
    })
    expect(mocks.getUsage).toHaveBeenCalledWith(
      { window: 'week' },
      expect.anything()
    )
    expect(
      screen.getByRole('heading', { name: 'By generation type' })
    ).toBeVisible()
    const rows = within(video).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('video.fast'),
      expect.stringContaining('video.old'),
    ])
    expect(
      within(rows[0] as HTMLElement).getByText('New in ranking')
    ).toBeVisible()
    expect(
      within(rows[1] as HTMLElement).getByRole('button', {
        name: /^-50%\. Previous 60 → now 30 \(-30\)/,
      })
    ).toBeVisible()
    expect(within(rows[1] as HTMLElement).getByText('Disabled')).toBeVisible()
    fireEvent.click(
      within(rows[0] as HTMLElement).getByRole('button', { name: 'video.fast' })
    )
    expect(onOpenModel).toHaveBeenCalledWith('video.fast')
  })

  it('sorts by customers and shows the rest of a long type on request', async () => {
    mount()
    const image = await screen.findByRole('region', {
      name: 'Image generation ranking',
    })
    expect(within(image).getAllByRole('row')).toHaveLength(9)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 9' }))
    expect(within(image).getAllByRole('row')).toHaveLength(10)
    fireEvent.click(
      within(image).getByRole('button', { name: /Sort by.*Customer count/ })
    )
    expect(within(image).getAllByRole('row')[1]).toHaveTextContent('image.8')
  })

  it('keeps the ranking of a type that fell to zero this period', async () => {
    mocks.getUsage.mockResolvedValue({
      ...usage,
      models: [
        ...usage.models,
        model('text.retired', 'chat.generate', 0, 0, 5),
      ],
    })
    mount()
    const text = await screen.findByRole('region', {
      name: 'Text generation ranking',
    })
    expect(
      within(text).getByRole('button', {
        name: /^-100%\. Previous 5 → now 0 \(-5\)/,
      })
    ).toBeVisible()
    expect(
      screen
        .getByRole('heading', { name: 'By generation type' })
        .closest('[data-slot="card"]')
    ).not.toHaveTextContent('Text generation')
  })

  it('asks for a custom range of at most 30 days', async () => {
    mount()
    await screen.findByRole('region', { name: 'Video generation ranking' })
    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }))
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '2026-11-01T00:00:00.000Z' },
    })
    fireEvent.change(screen.getByLabelText('End time'), {
      target: { value: '2026-11-08T00:00:00.000Z' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(mocks.getUsage).toHaveBeenLastCalledWith(
        {
          window: 'custom',
          from: '2026-11-01T00:00:00.000Z',
          to: '2026-11-08T00:00:00.000Z',
        },
        expect.anything()
      )
    )
  })
})

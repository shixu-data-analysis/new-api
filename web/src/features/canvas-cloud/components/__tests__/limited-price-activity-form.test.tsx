/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { LimitedPriceActivityForm } from '../LimitedPriceActivityForm'

const activityApi = vi.hoisted(() => ({
  createCanvasLimitedPriceActivity: vi.fn(),
}))
const pricingApi = vi.hoisted(() => ({
  getCanvasModelPricingModel: vi.fn(),
  getCanvasModelPricingWorkspace: vi.fn(),
}))

vi.mock('../../activity-api', () => activityApi)
vi.mock('../../api', () => pricingApi)
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
// The calendar popover is covered by its own component; here a plain input sets the moment.
vi.mock('@/components/datetime-picker', () => ({
  DateTimePicker: (props: {
    onChange?: (date: Date | undefined) => void
    placeholder?: string
  }) => (
    <input
      aria-label={props.placeholder}
      onChange={(event) => props.onChange?.(new Date(event.target.value))}
    />
  ),
}))

function tokenPrice(id: string, tokenRates: Record<string, string>) {
  return {
    pricingScopes: [
      {
        combinationKey: 'quality=720p',
        parameters: { quality: '720p' },
        prices: [
          {
            priceGroupName: 'Standard',
            current: {
              id,
              status: 'PUBLISHED',
              billingUnit: 'MILLION_TOKENS',
              points: Object.values(tokenRates)[0],
              tokenRates,
              calculation: { baseRatePointsPerRmb: '100' },
              assumptions: { tokenCategoryRisks: [] },
            },
          },
        ],
      },
    ],
  }
}

describe('LimitedPriceActivityForm', () => {
  beforeAll(() =>
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  )

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
  })

  it('sends exactly the Token categories of the chosen video price (VIDEO-TOKEN-BILLING-001)', async () => {
    pricingApi.getCanvasModelPricingWorkspace.mockResolvedValue({
      models: [
        {
          id: 'model-text',
          effectiveDisplayName: 'Canvas Text',
          catalogDefaultName: 'Canvas Text',
          modelKey: 'canvas.text',
          hasPublishedPricing: true,
        },
        {
          id: 'model-video',
          effectiveDisplayName: 'WT-Seedance 2.0',
          catalogDefaultName: 'WT-Seedance 2.0',
          modelKey: 'whatstoken.video.seedance-2.0-official',
          hasPublishedPricing: true,
        },
      ],
    })
    pricingApi.getCanvasModelPricingModel.mockImplementation(
      async (modelId: string) =>
        modelId === 'model-video'
          ? tokenPrice('price-video', {
              total: '4800',
              totalWithVideoInput: '2950',
            })
          : tokenPrice('price-text', { input: '10', output: '20' })
    )
    activityApi.createCanvasLimitedPriceActivity.mockResolvedValue({
      id: 'activity-video',
    })
    const onSaved = vi.fn()
    const user = userEvent.setup()
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <LimitedPriceActivityForm onBack={vi.fn()} onSaved={onSaved} />
      </QueryClientProvider>
    )

    const chooseSource = async (modelOption: string) => {
      await user.click(screen.getByRole('combobox', { name: 'Model' }))
      await user.click(await screen.findByRole('option', { name: modelOption }))
      await user.click(
        await screen.findByRole('combobox', { name: 'Applicable price' })
      )
      await user.click(
        await screen.findByRole('option', { name: 'Standard · Quality: 720p' })
      )
    }
    // A rate typed for another model first must not reach the video request.
    await chooseSource('Canvas Text · canvas.text')
    await user.type(
      screen.getByLabelText(
        'Special input token rate (points per million tokens)'
      ),
      '5'
    )
    await chooseSource(
      'WT-Seedance 2.0 · whatstoken.video.seedance-2.0-official'
    )
    await user.type(screen.getByLabelText('Activity name'), 'Video special')
    await user.type(
      screen.getByLabelText(
        'Special without-video-input token rate (points per million tokens)'
      ),
      '0'
    )
    await user.type(
      screen.getByLabelText(
        'Special with-video-input token rate (points per million tokens)'
      ),
      '1800'
    )
    await user.type(
      screen.getByLabelText('Start time'),
      '2030-01-01T00:00:00.000Z'
    )
    await user.type(
      screen.getByLabelText('End time'),
      '2030-01-02T00:00:00.000Z'
    )
    await user.type(screen.getByLabelText('Reason'), 'Launch')
    await user.click(screen.getByRole('button', { name: 'Confirm publish' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('activity-video'))
    expect(activityApi.createCanvasLimitedPriceActivity).toHaveBeenCalledWith({
      name: 'Video special',
      sourcePriceVersionId: 'price-video',
      specialTokenRates: { total: '0', totalWithVideoInput: '1800' },
      startsAt: '2030-01-01T00:00:00.000Z',
      endsAt: '2030-01-02T00:00:00.000Z',
      approvalReason: 'Launch',
    })
  })
})

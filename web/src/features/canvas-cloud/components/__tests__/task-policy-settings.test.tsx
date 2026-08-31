/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { TaskPolicySettings } from '../TaskPolicySettings'

const apiMocks = vi.hoisted(() => ({
  getCanvasTaskPolicySettings: vi.fn(),
  publishConfirmedCanvasTaskPolicySettings: vi.fn(),
}))

vi.mock('../../api', () => apiMocks)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <TaskPolicySettings />
    </QueryClientProvider>
  )
}

describe('Canvas administrator task policy settings', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasTaskPolicySettings.mockResolvedValue({
      quoteTtlSeconds: 300,
      quoteTtlVersion: null,
      quoteTtlEffectiveAt: null,
      bonusFailureGraceDays: 7,
      bonusFailureGraceVersion: null,
      bonusFailureGraceEffectiveAt: null,
      paidExpiryDays: 90,
      paidExpiryVersion: null,
      paidExpiryEffectiveAt: null,
    })
    apiMocks.publishConfirmedCanvasTaskPolicySettings.mockResolvedValue({
      quoteTtlSeconds: 600,
      quoteTtlVersion: 1,
      quoteTtlEffectiveAt: '2026-08-29T00:00:00.000Z',
      bonusFailureGraceDays: 14,
      bonusFailureGraceVersion: 1,
      bonusFailureGraceEffectiveAt: '2026-08-29T00:00:00.000Z',
      paidExpiryDays: 120,
      paidExpiryVersion: 1,
      paidExpiryEffectiveAt: '2026-08-29T00:00:00.000Z',
    })
  })

  it('loads defaults and publishes confirmed bounded values', async () => {
    renderSettings()

    const quote = await screen.findByLabelText('Quote validity')
    const grace = screen.getByLabelText('Bonus failure grace')
    const paidExpiry = screen.getByLabelText('Paid points validity')
    expect(quote).toHaveValue('300')
    expect(grace).toHaveValue('7')
    expect(paidExpiry).toHaveValue('90')
    expect(
      screen.getByText(/After it expires, the system creates a new quote/)
    ).toBeVisible()
    expect(
      screen.getByText(/They are returned points, not extra points/)
    ).toBeVisible()

    fireEvent.change(quote, { target: { value: '600' } })
    fireEvent.change(grace, { target: { value: '14' } })
    fireEvent.change(paidExpiry, { target: { value: '120' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review settings change' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))

    await waitFor(() =>
      expect(
        apiMocks.publishConfirmedCanvasTaskPolicySettings
      ).toHaveBeenCalledWith({
        quoteTtlSeconds: 600,
        bonusFailureGraceDays: 14,
        paidExpiryDays: 120,
      })
    )
  })

  it('rejects values outside the documented bounds', async () => {
    renderSettings()
    const quote = await screen.findByLabelText('Quote validity')
    const grace = screen.getByLabelText('Bonus failure grace')
    const paidExpiry = screen.getByLabelText('Paid points validity')
    fireEvent.change(quote, { target: { value: '0' } })
    fireEvent.change(grace, { target: { value: '366' } })
    fireEvent.change(paidExpiry, { target: { value: '3651' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review settings change' })
    )

    expect(
      screen.getByText('Enter a whole number from 1 to 86400')
    ).toBeVisible()
    expect(screen.getByText('Enter a whole number from 1 to 365')).toBeVisible()
    expect(
      screen.getByText('Enter a whole number from 1 to 3650')
    ).toBeVisible()
    expect(
      apiMocks.publishConfirmedCanvasTaskPolicySettings
    ).not.toHaveBeenCalled()
  })
})

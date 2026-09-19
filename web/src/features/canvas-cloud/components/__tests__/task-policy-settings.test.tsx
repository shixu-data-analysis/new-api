/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { toast } from 'sonner'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { TaskPolicySettings } from '../TaskPolicySettings'

const apiMocks = vi.hoisted(() => ({
  getCanvasTaskPolicySettings: vi.fn(),
  publishConfirmedCanvasTaskPolicySettings: vi.fn(),
}))

vi.mock('../../api', () => apiMocks)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderSettings(section: 'recharge' | 'release' = 'release') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <TaskPolicySettings section={section} />
    </QueryClientProvider>
  )
  return { ...view, client }
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
    expect(quote).toHaveValue('300')
    expect(grace).toHaveValue('7')
    expect(
      screen.queryByLabelText('Paid points validity')
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        en.translation[
          'This is how long a customer can submit a task using a quoted price. After it expires, the system creates a new quote using the current price; the old quote is not extended.'
        ]
      )
    ).toBeVisible()
    expect(
      screen.getByText(
        en.translation[
          'This applies only when Bonus points were frozen before their original expiry and the task fails or times out after that expiry. The released points become grace Bonus for this many days from release. They are returned points, not extra points; successful tasks do not receive them.'
        ]
      )
    ).toBeVisible()

    fireEvent.change(quote, { target: { value: '600' } })
    fireEvent.change(grace, { target: { value: '14' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review settings change' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm change' })
    )

    await waitFor(() =>
      expect(
        apiMocks.publishConfirmedCanvasTaskPolicySettings
      ).toHaveBeenCalledWith({
        quoteTtlSeconds: 600,
        bonusFailureGraceDays: 14,
      })
    )
  })

  it('shows independent default/version labels without repeated policy or range help', async () => {
    const settings = await apiMocks.getCanvasTaskPolicySettings()
    apiMocks.getCanvasTaskPolicySettings.mockResolvedValue({
      ...settings,
      quoteTtlVersion: 4,
    })
    renderSettings()
    await screen.findByLabelText('Quote validity')
    expect(screen.getByText('v4')).toBeVisible()
    expect(screen.getByText('Default configuration')).toBeVisible()
    expect(
      screen.queryByText(/Published settings are versioned/)
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Whole seconds from/)).not.toBeInTheDocument()
    expect(screen.queryByText('—')).not.toBeInTheDocument()
    expect(screen.getByText('seconds')).toBeVisible()
    expect(screen.getByText('days')).toBeVisible()
  })

  it('rejects values outside the documented bounds', async () => {
    renderSettings()
    const quote = await screen.findByLabelText('Quote validity')
    const grace = screen.getByLabelText('Bonus failure grace')
    fireEvent.change(quote, { target: { value: '0' } })
    fireEvent.change(grace, { target: { value: '366' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review settings change' })
    )

    expect(
      await screen.findByText('Enter a whole number from 1 to 86400')
    ).toBeVisible()
    expect(screen.getByText('Enter a whole number from 1 to 365')).toBeVisible()
    expect(
      apiMocks.publishConfirmedCanvasTaskPolicySettings
    ).not.toHaveBeenCalled()
  })
  it('publishes only the edited field so unrelated settings cannot be overwritten', async () => {
    renderSettings()
    const quote = await screen.findByLabelText('Quote validity')
    fireEvent.change(quote, { target: { value: '600' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review settings change' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm change' })
    )
    await waitFor(() =>
      expect(
        apiMocks.publishConfirmedCanvasTaskPolicySettings
      ).toHaveBeenCalledWith({ quoteTtlSeconds: 600 })
    )
  })

  it('keeps recharge validity separate and reads the published version back', async () => {
    renderSettings('recharge')
    const paid = await screen.findByRole('textbox', {
      name: 'Paid points validity',
    })
    expect(paid).toHaveValue('90')
    expect(screen.queryByLabelText('Quote validity')).not.toBeInTheDocument()
    fireEvent.change(paid, { target: { value: '120' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review settings change' })
    )
    expect(await screen.findByText('90 → 120 days')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    await waitFor(() =>
      expect(
        apiMocks.publishConfirmedCanvasTaskPolicySettings
      ).toHaveBeenCalledWith({ paidExpiryDays: 120 })
    )
    expect(paid).toHaveValue('120')
    expect(screen.getByText('v1')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Review settings change' })
    ).toBeDisabled()
  })

  it('validates Paid boundaries after touch and clears corrected errors', async () => {
    renderSettings('recharge')
    const paid = await screen.findByRole('textbox', {
      name: 'Paid points validity',
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.change(paid, { target: { value: '3651' } })
    fireEvent.blur(paid)
    expect(
      await screen.findByText('Enter a whole number from 1 to 3650')
    ).toBeVisible()
    expect(paid).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(paid, { target: { value: '3650' } })
    await waitFor(() => expect(paid).toHaveAttribute('aria-invalid', 'false'))
  })

  it('preserves a draft across a query refresh and omits remotely changed fields', async () => {
    const { client } = renderSettings()
    const quote = await screen.findByLabelText('Quote validity')
    fireEvent.change(quote, { target: { value: '600' } })
    const settings = await apiMocks.getCanvasTaskPolicySettings()
    await act(async () => {
      client.setQueryData(['canvas-cloud', 'task-policy-settings'], {
        ...settings,
        bonusFailureGraceDays: 21,
        paidExpiryDays: 180,
      })
    })
    expect(quote).toHaveValue('600')
    await waitFor(() =>
      expect(screen.getByLabelText('Bonus failure grace')).toHaveValue('21')
    )
    expect(quote).toHaveValue('600')
    expect(
      screen.getByRole('button', { name: 'Review settings change' })
    ).toBeEnabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Review settings change' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm change' })
    )
    await waitFor(() =>
      expect(
        apiMocks.publishConfirmedCanvasTaskPolicySettings
      ).toHaveBeenCalledWith({ quoteTtlSeconds: 600 })
    )
  })

  it('does not publish a cancelled review and preserves the entered value', async () => {
    renderSettings()
    const quote = await screen.findByLabelText('Quote validity')
    fireEvent.change(quote, { target: { value: '600' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review settings change' })
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(
      apiMocks.publishConfirmedCanvasTaskPolicySettings
    ).not.toHaveBeenCalled()
    expect(quote).toHaveValue('600')
  })

  it('keeps failed publication editable and gives one error', async () => {
    apiMocks.publishConfirmedCanvasTaskPolicySettings.mockRejectedValueOnce(
      new Error('network')
    )
    renderSettings()
    const quote = await screen.findByLabelText('Quote validity')
    fireEvent.change(quote, { target: { value: '600' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review settings change' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm change' })
    )
    await waitFor(() => expect(toast.error).toHaveBeenCalledOnce())
    expect(quote).toHaveValue('600')
  })
})

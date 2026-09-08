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
import fr from '@/i18n/locales/fr.json'

import { PricingPointRules } from '../PricingPointRules'

const apiMocks = vi.hoisted(() => ({
  getCanvasPriceGroups: vi.fn(),
  publishConfirmedCanvasPriceGroup: vi.fn(),
  getCanvasPointIssuanceRates: vi.fn(),
  publishConfirmedCanvasPointIssuanceRate: vi.fn(),
  getCanvasTaskPolicySettings: vi.fn(),
  publishConfirmedCanvasTaskPolicySettings: vi.fn(),
}))
vi.mock('../../api', () => apiMocks)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderRules() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PricingPointRules />
    </QueryClientProvider>
  )
}

describe('Pricing and point rule sections', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
    i18next.addResourceBundle('fr', 'translation', fr.translation, true, true)
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasPriceGroups.mockResolvedValue([
      {
        id: 'plan-1',
        code: 'UAT-STANDARD',
        internalName: 'Manual UAT standard group',
        version: 1,
        status: 'PUBLISHED',
        createdAt: '2026-09-08T00:00:00.000Z',
        approvedAt: null,
        effectiveAt: null,
      },
    ])
    apiMocks.publishConfirmedCanvasPriceGroup.mockResolvedValue({
      id: 'plan-2',
    })
    apiMocks.getCanvasPointIssuanceRates.mockResolvedValue([])
    apiMocks.getCanvasTaskPolicySettings.mockResolvedValue({
      quoteTtlSeconds: 300,
      quoteTtlVersion: 2,
      quoteTtlEffectiveAt: '2026-09-08T00:00:00.000Z',
      paidExpiryDays: 90,
      paidExpiryVersion: null,
      paidExpiryEffectiveAt: null,
      bonusFailureGraceDays: 7,
      bonusFailureGraceVersion: null,
      bonusFailureGraceEffectiveAt: null,
    })
    apiMocks.publishConfirmedCanvasTaskPolicySettings.mockResolvedValue({
      quoteTtlSeconds: 300,
      quoteTtlVersion: 2,
      quoteTtlEffectiveAt: '2026-09-08T00:00:00.000Z',
      paidExpiryDays: 120,
      paidExpiryVersion: 1,
      paidExpiryEffectiveAt: '2026-09-08T00:00:00.000Z',
      bonusFailureGraceDays: 7,
      bonusFailureGraceVersion: null,
      bonusFailureGraceEffectiveAt: null,
    })
  })

  it('shows all three sections without field tabs and isolates recharge publication', async () => {
    renderRules()
    expect(screen.getByRole('region', { name: 'Price plans' })).toBeVisible()
    const recharge = screen.getByRole('region', { name: 'Recharge rules' })
    const release = screen.getByRole('region', {
      name: 'Quote and release rules',
    })
    const paid = await within(recharge).findByRole('textbox', {
      name: 'Paid points validity',
    })
    expect(within(release).getByLabelText('Quote validity')).toHaveValue('300')
    expect(
      within(recharge).queryByLabelText('Quote validity')
    ).not.toBeInTheDocument()
    expect(
      within(release).queryByRole('textbox', { name: 'Paid points validity' })
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    fireEvent.change(paid, { target: { value: '120' } })
    fireEvent.click(
      within(recharge).getByRole('button', { name: 'Review settings change' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm change' })
    )
    await waitFor(() =>
      expect(
        apiMocks.publishConfirmedCanvasTaskPolicySettings
      ).toHaveBeenCalledWith({ paidExpiryDays: 120 })
    )
    expect(
      apiMocks.publishConfirmedCanvasPointIssuanceRate
    ).not.toHaveBeenCalled()
    expect(apiMocks.publishConfirmedCanvasPriceGroup).not.toHaveBeenCalled()
  })

  it('retains confirmed price-plan creation with generated code and multilingual name', async () => {
    renderRules()
    const form = screen.getByRole('form', {
      name: en.translation['Create price group'],
    })
    fireEvent.submit(form)
    expect(apiMocks.publishConfirmedCanvasPriceGroup).not.toHaveBeenCalled()
    expect(within(form).getAllByText('This field is required')).toHaveLength(1)
    expect(
      within(form).queryByRole('textbox', {
        name: en.translation['Price group code'],
      })
    ).not.toBeInTheDocument()
    expect(
      within(form).queryByText(
        'A unique immutable code is generated automatically.'
      )
    ).not.toBeInTheDocument()
    fireEvent.change(
      within(form).getByRole('textbox', {
        name: new RegExp(en.translation['Price group name']),
      }),
      { target: { value: '测试客户・VIP' } }
    )
    fireEvent.submit(form)
    expect(screen.getByText('Generated automatically')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm change' }))
    await waitFor(() =>
      expect(apiMocks.publishConfirmedCanvasPriceGroup).toHaveBeenCalledWith({
        internalName: '测试客户・VIP',
      })
    )
    expect(await screen.findByText('Manual UAT standard group')).toBeVisible()
  })

  it('keeps historical plans read-only and preserves table controls', async () => {
    apiMocks.getCanvasPriceGroups.mockResolvedValue([
      {
        id: 'draft',
        code: 'VIP',
        internalName: 'VIP customers',
        version: 1,
        status: 'DRAFT',
        createdAt: '2026-09-08T00:00:00.000Z',
        approvedAt: null,
        effectiveAt: null,
      },
    ])
    renderRules()
    const section = screen.getByRole('region', { name: 'Price plans' })
    expect(await within(section).findByText('VIP customers')).toBeVisible()
    expect(
      within(section).queryByRole('button', { name: 'Approve' })
    ).not.toBeInTheDocument()
    expect(
      within(section).queryByRole('button', { name: 'Publish' })
    ).not.toBeInTheDocument()
    expect(
      within(section).getByRole('button', { name: /Column filters/ })
    ).toBeVisible()
    expect(within(section).getByRole('button', { name: /View/ })).toBeVisible()
  })

  it('renders nonempty configuration dates and section labels in French', async () => {
    await i18next.changeLanguage('fr')
    renderRules()
    const section = screen.getByRole('region', {
      name: fr.translation['Quote and release rules'],
    })
    await within(section).findByLabelText(fr.translation['Quote validity'])
    const formatted = new Intl.DateTimeFormat('fr', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date('2026-09-08T00:00:00.000Z'))
    expect(
      within(section).getByText((text) => text.includes(formatted))
    ).toBeVisible()
    expect(
      screen.getByRole('region', { name: fr.translation['Recharge rules'] })
    ).toBeVisible()
  })
})

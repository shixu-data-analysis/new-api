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

import { InviteActivation } from '../InviteActivation'
import { InviteCodeManagement } from '../InviteCodeManagement'

const apiMocks = vi.hoisted(() => ({
  activateCanvasInvite: vi.fn(),
  changeCanvasAdminInviteCodeStatus: vi.fn(),
  createCanvasAdminInviteCode: vi.fn(),
  getCanvasAdminInviteCodes: vi.fn(),
  getCanvasInviteCodeOptions: vi.fn(),
}))

vi.mock('../../api', () => apiMocks)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderWithClient(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>
  )
}

describe('Canvas invite code management', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue([])
    apiMocks.getCanvasInviteCodeOptions.mockResolvedValue({
      priceGroups: [
        { id: 'group-v1', code: 'STANDARD', internalName: 'Standard' },
      ],
      promotions: [],
    })
    apiMocks.activateCanvasInvite.mockResolvedValue({
      status: 'CONSUMED',
      customerId: 'customer-v1',
    })
  })

  it('renders compact accessible invite configuration fields', async () => {
    renderWithClient(<InviteCodeManagement />)

    expect(await screen.findByLabelText('Maximum registrations')).toHaveValue(
      '1'
    )
    expect(screen.getByLabelText('Initial price group')).toHaveValue('group-v1')
    expect(screen.getByLabelText('Valid from')).toHaveAttribute(
      'type',
      'datetime-local'
    )
    expect(screen.getByLabelText('Initial Bonus points')).toBeEnabled()
    expect(screen.getByText('Invite validity')).toBeVisible()
    expect(screen.getByText(/Uses your current time zone/)).toBeVisible()
    expect(screen.queryByLabelText('Bonus promotion')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Referral source')).not.toBeInTheDocument()
    expect(screen.getByText(/promotional points, not cash/)).toBeVisible()
  })

  it('shows field-level errors and blocks an invalid invite configuration', async () => {
    renderWithClient(<InviteCodeManagement />)

    const capacity = await screen.findByLabelText('Maximum registrations')
    const bonusPoints = screen.getByLabelText('Initial Bonus points')
    const expiresAt = screen.getByLabelText('Expires at')
    const submit = screen.getByRole('button', {
      name: 'Review and create invite',
    })

    fireEvent.change(capacity, { target: { value: '0' } })
    expect(
      screen.getByText(
        'Enter a positive whole number within the supported range'
      )
    ).toHaveAttribute('role', 'alert')
    expect(capacity).toHaveAttribute('aria-invalid', 'true')

    fireEvent.change(bonusPoints, { target: { value: '10' } })
    expect(
      screen.getAllByText('Enter both promotional points and validity days')
    ).toHaveLength(2)

    fireEvent.change(expiresAt, { target: { value: '2020-01-01T00:00' } })
    expect(
      screen.getByText('Expiry must be after the start time')
    ).toHaveAttribute('role', 'alert')
    expect(submit).toBeDisabled()
    fireEvent.click(submit)
    expect(apiMocks.createCanvasAdminInviteCode).not.toHaveBeenCalled()
  })

  it('labels invite status and requires confirmation before a status change', async () => {
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue([
      {
        id: 'invite-v1',
        maskedCode: 'CANVAS-U••••••••',
        status: 'ACTIVE',
        effectiveStatus: 'ACTIVE',
        maxRegistrations: '10',
        reservedCount: '0',
        consumedCount: '1',
        remainingCount: '9',
        validFrom: '2026-01-01T00:00:00.000Z',
        expiresAt: '2035-01-01T00:00:00.000Z',
        priceGroupId: 'group-v1',
        priceGroupCode: 'STANDARD',
        priceGroupName: 'Standard',
        initialBonusPoints: '500',
        initialBonusTtlDays: 30,
        promotionVersionId: null,
        referralSource: null,
        pausedAt: null,
        revokedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])

    renderWithClient(<InviteCodeManagement />)

    expect(await screen.findByText('Active')).toBeVisible()
    const pause = screen.getByRole('button', { name: 'Pause invite code' })
    expect(pause).toHaveTextContent('Pause invite code')
    expect(
      screen.getByRole('button', { name: 'Revoke invite code' })
    ).toHaveTextContent('Revoke invite code')

    fireEvent.click(pause)
    expect(
      screen.getByRole('alertdialog', { name: 'Pause this invite code?' })
    ).toBeVisible()
    expect(
      screen.getByText(
        'Pausing blocks new activations until you resume it. Customers who already activated are not affected.'
      )
    ).toBeVisible()
    expect(screen.getByText('Current status')).toBeVisible()
    expect(screen.getByText('New status')).toBeVisible()
    expect(apiMocks.changeCanvasAdminInviteCodeStatus).not.toHaveBeenCalled()
  })

  it('activates the signed-in customer with the entered invite code', async () => {
    renderWithClient(<InviteActivation />)
    fireEvent.change(screen.getByLabelText('Invite code'), {
      target: { value: 'canvas-test-code' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Activate Canvas access' })
    )

    await waitFor(() =>
      expect(apiMocks.activateCanvasInvite).toHaveBeenCalledWith(
        'CANVAS-TEST-CODE'
      )
    )
  })
})

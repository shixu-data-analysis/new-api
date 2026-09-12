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

import { InviteActivation } from '../InviteActivation'
import { InviteCodeManagement } from '../InviteCodeManagement'

const apiMocks = vi.hoisted(() => ({
  activateCanvasInvite: vi.fn(),
  changeCanvasAdminInviteCodeStatus: vi.fn(),
  createCanvasAdminInviteCode: vi.fn(),
  exportCanvasAdminInviteCodes: vi.fn(),
  getCanvasAdminInviteCodes: vi.fn(),
  getCanvasInviteCodeOptions: vi.fn(),
  revealCanvasCode: vi.fn(),
}))
const campaignMocks = vi.hoisted(() => ({
  getCanvasBindableBonusActivities: vi.fn(),
}))

vi.mock('../../api', () => apiMocks)
vi.mock('../../activity-api', () => campaignMocks)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderWithClient(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>
  )
}

async function renderInviteManagement() {
  const result = renderWithClient(<InviteCodeManagement />)
  fireEvent.click(
    await screen.findByRole('button', {
      name: i18next.t('Create invite code'),
    })
  )
  return result
}

describe('Canvas invite code management', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
    i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    apiMocks.getCanvasInviteCodeOptions.mockResolvedValue({
      priceGroups: [
        { id: 'group-v1', code: 'STANDARD', internalName: 'Standard' },
      ],
      promotions: [],
      agents: [],
    })
    apiMocks.activateCanvasInvite.mockResolvedValue({
      status: 'CONSUMED',
      customerId: 'customer-v1',
    })
    apiMocks.exportCanvasAdminInviteCodes.mockResolvedValue(
      new Blob(['maskedCode,effectiveStatus\n'], { type: 'text/csv' })
    )
    campaignMocks.getCanvasBindableBonusActivities.mockResolvedValue([])
  })

  it('renders compact accessible invite configuration fields', async () => {
    await renderInviteManagement()

    expect(await screen.findByLabelText('Maximum registrations')).toHaveValue(
      '1'
    )
    expect(screen.getByLabelText('Initial price group')).toHaveValue('')
    const validFrom = screen.getByRole('group', { name: 'Valid from' })
    const expiresAt = screen.getByRole('group', { name: 'Expires at' })
    expect(validFrom.querySelector('input[type="time"]')).toBeInTheDocument()
    expect(expiresAt.querySelector('input[type="time"]')).toBeInTheDocument()
    expect(
      validFrom.querySelector('input[type="datetime-local"]')
    ).not.toBeInTheDocument()
    expect(screen.getByText('Invite validity')).toBeVisible()
    expect(screen.getByText(/Time zone:/)).toBeVisible()
    expect(screen.getByLabelText('Invite bonus campaign')).toBeInTheDocument()
    expect(screen.queryByLabelText('Referral source')).not.toBeInTheDocument()
    const bonusBoundaryNote = screen.getByText(/promotional points, not cash/)
    expect(bonusBoundaryNote).toBeVisible()
    expect(bonusBoundaryNote).toHaveClass('text-muted-foreground', 'text-xs')
  })

  it('uses an active invite campaign bonus and promotion version', async () => {
    campaignMocks.getCanvasBindableBonusActivities.mockResolvedValue([
      {
        id: 'invite-v2',
        name: 'September invitation',
        version: 2,
        points: '250',
        ttlDays: 45,
      },
    ])
    apiMocks.createCanvasAdminInviteCode.mockResolvedValue({
      code: 'CANVAS-INVITE',
    })
    await renderInviteManagement()

    const campaign = await screen.findByLabelText('Invite bonus campaign')
    await screen.findByRole('option', { name: /September invitation/u })
    fireEvent.change(campaign, { target: { value: 'invite-v2' } })
    fireEvent.change(screen.getByLabelText('Initial price group'), {
      target: { value: 'group-v1' },
    })
    expect(screen.getByText('Bonus per new customer: 250 points')).toBeVisible()
    expect(
      screen.getByText(/Valid for 45 days after registration credit/u)
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Review and create invite' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm creation' })
    )
    await waitFor(() =>
      expect(apiMocks.createCanvasAdminInviteCode.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          initialBonusPoints: '250',
          initialBonusTtlDays: 45,
          promotionVersionId: 'invite-v2',
        })
      )
    )
  })

  it.each(['PROMOTION_UNAVAILABLE', 'PROMOTION_CHANGED'])(
    'keeps the selected invite promotion and shows its %s field error',
    async (code) => {
      campaignMocks.getCanvasBindableBonusActivities.mockResolvedValue([
        {
          id: 'invite-v2',
          name: 'September invitation',
          version: 2,
          points: '250',
          ttlDays: 45,
        },
      ])
      apiMocks.createCanvasAdminInviteCode.mockRejectedValue({
        response: { data: { code, details: { field: 'promotionVersionId' } } },
      })
      await renderInviteManagement()
      fireEvent.change(screen.getByLabelText('Invite bonus campaign'), {
        target: { value: 'invite-v2' },
      })
      fireEvent.change(screen.getByLabelText('Initial price group'), {
        target: { value: 'group-v1' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'Review and create invite' })
      )
      fireEvent.click(
        await screen.findByRole('button', { name: 'Confirm creation' })
      )
      expect(
        await screen.findAllByText(
          'The selected bonus campaign is no longer available.'
        )
      ).toHaveLength(2)
      expect(screen.getByLabelText('Invite bonus campaign')).toHaveValue(
        'invite-v2'
      )
      expect(apiMocks.createCanvasAdminInviteCode).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      )
    }
  )

  it('shows invite campaign query errors while preserving the rest of the drawer', async () => {
    campaignMocks.getCanvasBindableBonusActivities.mockRejectedValue(
      new Error('offline')
    )
    await renderInviteManagement()
    expect(
      await screen.findByText('Unable to load invite bonus campaigns')
    ).toBeInTheDocument()
  })

  it('shows field-level errors and blocks an invalid invite configuration', async () => {
    await renderInviteManagement()

    const capacity = await screen.findByLabelText('Maximum registrations')
    const expiresAt = screen.getByRole('group', { name: 'Expires at' })
    const submit = screen.getByRole('button', {
      name: 'Review and create invite',
    })

    fireEvent.change(capacity, { target: { value: '0' } })
    fireEvent.blur(capacity)
    expect(
      await screen.findByText(
        'Enter a positive whole number within the supported range'
      )
    ).toHaveAttribute('role', 'alert')
    expect(capacity).toHaveAttribute('aria-invalid', 'true')

    fireEvent.click(within(expiresAt).getByRole('button', { name: 'Clear' }))
    expect(
      await screen.findByText('Enter a valid expiry time')
    ).toHaveAttribute('role', 'alert')
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    expect(apiMocks.createCanvasAdminInviteCode).not.toHaveBeenCalled()
  })

  it('localizes the audited plaintext confirmation in Chinese', async () => {
    await i18next.changeLanguage('zh')
    await renderInviteManagement()

    fireEvent.change(screen.getByLabelText('初始价格方案'), {
      target: { value: 'group-v1' },
    })
    fireEvent.click(await screen.findByRole('button', { name: '复核并创建' }))

    expect(
      await screen.findByText(
        '创建后状态为“有效”，并从开始时间起允许注册。请核对以下内容：'
      )
    ).toBeVisible()
  })

  it('labels invite status and requires confirmation before a status change', async () => {
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'invite-v1',
          maskedCode: 'CANVAS-U••••••••CRET',
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
          agent: null,
          pausedAt: null,
          revokedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    renderWithClient(<InviteCodeManagement />)

    expect(await screen.findByText('Valid')).toBeVisible()
    const pause = screen.getByRole('button', { name: 'Pause invite code' })
    expect(pause).toHaveTextContent('Pause invite code')
    expect(screen.getByRole('button', { name: 'Revoke' })).toHaveTextContent(
      'Revoke'
    )

    fireEvent.click(pause)
    expect(
      screen.getByRole('alertdialog', { name: 'Pause this invite code?' })
    ).toBeVisible()
    expect(
      screen.getByText(
        'Pausing blocks new activations until you resume it. Customers who already activated are not affected.'
      )
    ).toBeVisible()
    const dialog = screen.getByRole('alertdialog', {
      name: 'Pause this invite code?',
    })
    expect(
      within(dialog).getByText('Current status:').parentElement
    ).toHaveTextContent('Valid')
    expect(
      within(dialog).getByText('New status:').parentElement
    ).toHaveTextContent('Paused')
    expect(apiMocks.changeCanvasAdminInviteCodeStatus).not.toHaveBeenCalled()
  })

  it('exports the complete current server result without paging through the browser', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const createObjectURL = vi.fn(() => 'blob:invite-codes')
    const revokeObjectURL = vi.fn()
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    })
    renderWithClient(<InviteCodeManagement />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Export current results' })
    )
    await waitFor(() =>
      expect(apiMocks.exportCanvasAdminInviteCodes).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'createdAt', sortOrder: 'desc' })
      )
    )
    const query = apiMocks.exportCanvasAdminInviteCodes.mock.calls[0]?.[0]
    expect(query).not.toHaveProperty('page')
    expect(query).not.toHaveProperty('pageSize')
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:invite-codes')
  })

  it('toggles a revealed invite code back to its mask and changes the icon', async () => {
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'invite-v1',
          maskedCode: 'CANVAS-U••••••••CRET',
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
          initialBonusPoints: null,
          initialBonusTtlDays: null,
          promotionVersionId: null,
          referralSource: null,
          agent: null,
          pausedAt: null,
          revokedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    apiMocks.revealCanvasCode.mockResolvedValue({ code: 'CANVAS-SECRET' })

    const { container } = renderWithClient(<InviteCodeManagement />)
    const show = await screen.findByRole('button', {
      name: 'Show invite code',
    })
    expect(show).toHaveAttribute('aria-pressed', 'false')
    expect(show).toHaveTextContent('')
    expect(show.closest('td')).toHaveTextContent('CANVAS-U••••••••CRET')
    expect(show.querySelector('.lucide-eye')).toBeInTheDocument()

    fireEvent.click(show)
    expect(await screen.findByText('CANVAS-SECRET')).toBeVisible()
    const hide = screen.getByRole('button', { name: 'Hide invite code' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
    expect(hide.querySelector('.lucide-eye-off')).toBeInTheDocument()

    fireEvent.click(hide)
    expect(await screen.findByText('CANVAS-U••••••••CRET')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Show invite code' })
    ).toHaveAttribute('aria-pressed', 'false')
    expect(apiMocks.revealCanvasCode).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.lucide-eye')).toBeInTheDocument()
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

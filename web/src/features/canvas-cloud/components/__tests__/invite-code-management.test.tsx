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

import type { CanvasAdminInviteCode } from '../../types'
import { InviteActivation } from '../InviteActivation'
import { InviteCodeManagement } from '../InviteCodeManagement'

const apiMocks = vi.hoisted(() => ({
  activateCanvasInvite: vi.fn(),
  changeCanvasAdminInviteCodeStatus: vi.fn(),
  checkCanvasInviteCodeAvailability: vi.fn(),
  createCanvasAdminInviteCode: vi.fn(),
  expandCanvasAdminInviteCodeCapacity: vi.fn(),
  extendCanvasAdminInviteCode: vi.fn(),
  exportCanvasAdminInviteCodes: vi.fn(),
  getCanvasAdminInviteCode: vi.fn(),
  getCanvasAdminInviteCodes: vi.fn(),
  searchCanvasAdminInviteCodes: vi.fn(),
  getCanvasInviteCodeOptions: vi.fn(),
  revealCanvasCode: vi.fn(),
  previewCanvasInviteCodeExtension: vi.fn(),
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
  return {
    ...render(
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    ),
    queryClient: client,
  }
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

function inviteFixture(
  overrides: Partial<CanvasAdminInviteCode> = {}
): CanvasAdminInviteCode {
  const expiry = new Date()
  expiry.setDate(expiry.getDate() + 1)
  expiry.setHours(10, 0, 0, 0)
  return {
    id: 'invite-extend',
    maskedCode: 'EXTEND••',
    status: 'ACTIVE',
    codeMode: 'CUSTOM',
    redeemable: true,
    unavailableReasons: [],
    allowedActions: ['EXTEND_EXPIRATION'],
    maxRegistrations: '10',
    reservedCount: '0',
    activeReservedCount: '0',
    consumedCount: '2',
    remainingCount: '8',
    activatedCustomers: '2',
    validFrom: '2026-01-01T00:00:00.000Z',
    expiresAt: expiry.toISOString(),
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
    ...overrides,
  }
}

async function openChangedExtensionDrawer(item = inviteFixture()) {
  apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
    page: 1,
    pageSize: 20,
    total: 1,
    items: [item],
  })
  renderWithClient(<InviteCodeManagement />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit invite code' })
  )
  const expiryGroup = screen.getByRole('group', {
    name: /New expiration time/u,
  })
  fireEvent.change(within(expiryGroup).getByDisplayValue('10:00'), {
    target: { value: '11:00' },
  })
  return { item, expiryGroup }
}

async function openInviteEditor(item: CanvasAdminInviteCode) {
  apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
    page: 1,
    pageSize: 20,
    total: 1,
    items: [item],
  })
  renderWithClient(<InviteCodeManagement />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Edit invite code' })
  )
  return item
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
      new Blob(['maskedCode,codeMode\n'], { type: 'text/csv' })
    )
    apiMocks.checkCanvasInviteCodeAvailability.mockResolvedValue({
      available: true,
      unavailableReasons: [],
    })
    campaignMocks.getCanvasBindableBonusActivities.mockResolvedValue([])
  })

  it('renders compact accessible invite configuration fields', async () => {
    await renderInviteManagement()

    expect(await screen.findByLabelText('Maximum registrations')).toHaveValue(
      '1'
    )
    expect(screen.getByLabelText('Initial price plan')).toHaveValue('')
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
    fireEvent.change(screen.getByLabelText('Initial price plan'), {
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
      fireEvent.change(screen.getByLabelText('Initial price plan'), {
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
      expect(
        screen.queryByRole('alertdialog', { name: 'Create invite code' })
      ).not.toBeInTheDocument()
      expect(screen.getByLabelText('Invite bonus campaign')).toHaveFocus()
      expect(screen.getByLabelText('Invite bonus campaign')).toHaveAttribute(
        'aria-invalid',
        'true'
      )
      expect(screen.getByLabelText('Invite bonus campaign')).toHaveAttribute(
        'aria-describedby',
        'invite-bonus-campaign-error'
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
          codeMode: 'GENERATED',
          redeemable: true,
          unavailableReasons: [],
          allowedActions: ['PAUSE', 'REVOKE'],
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

    expect(await screen.findByText('Redeemable')).toBeVisible()
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
    ).toHaveTextContent('Redeemable')
    expect(
      within(dialog).getByText('New status:').parentElement
    ).toHaveTextContent('Paused')
    expect(apiMocks.changeCanvasAdminInviteCodeStatus).not.toHaveBeenCalled()
  })

  it('labels an active invite with no remaining registrations as exhausted', async () => {
    await i18next.changeLanguage('zh')
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'invite-exhausted',
          maskedCode: 'CANVAS-E••••••••STED',
          status: 'ACTIVE',
          codeMode: 'GENERATED',
          redeemable: false,
          unavailableReasons: ['EXHAUSTED'],
          allowedActions: ['REVOKE'],
          maxRegistrations: '1',
          reservedCount: '0',
          consumedCount: '1',
          remainingCount: '0',
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

    renderWithClient(<InviteCodeManagement />)

    expect(await screen.findByText('已用尽')).toBeVisible()
    expect(screen.getByText('1 / 1')).toBeVisible()
  })

  it('translates each unavailable reason before joining paused and expired', async () => {
    await i18next.changeLanguage('zh')
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'invite-paused-expired',
          maskedCode: 'PART••00',
          status: 'PAUSED',
          codeMode: 'CUSTOM',
          redeemable: false,
          unavailableReasons: ['PAUSED', 'EXPIRED'],
          allowedActions: ['RESUME', 'EXTEND_EXPIRATION', 'REVOKE'],
          maxRegistrations: '10',
          reservedCount: '0',
          activeReservedCount: '0',
          consumedCount: '2',
          remainingCount: '8',
          validFrom: '2026-01-01T00:00:00.000Z',
          expiresAt: '2026-09-10T00:00:00.000Z',
          priceGroupId: 'group-v1',
          priceGroupCode: 'STANDARD',
          priceGroupName: 'Standard',
          initialBonusPoints: null,
          initialBonusTtlDays: null,
          promotionVersionId: null,
          referralSource: null,
          agent: null,
          pausedAt: '2026-09-01T00:00:00.000Z',
          revokedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    renderWithClient(<InviteCodeManagement />)

    expect(await screen.findByText('已暂停 · 已过期')).toBeVisible()
    expect(screen.getByRole('button', { name: '编辑邀请码' })).toBeVisible()
  })

  it('checks a normalized custom invite code without exposing it in the URL', async () => {
    await renderInviteManagement()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const code = screen.getByLabelText('Invite code')
    fireEvent.change(code, { target: { value: ' vip2026 ' } })
    fireEvent.blur(code)

    await waitFor(() =>
      expect(apiMocks.checkCanvasInviteCodeAvailability).toHaveBeenCalledWith(
        'VIP2026'
      )
    )
  })

  it.each(['VIP1', 'ABCDEFG8'])(
    'accepts the %s custom invite code boundary for availability checks',
    async (value) => {
      await renderInviteManagement()
      fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
      const code = screen.getByLabelText('Invite code')
      fireEvent.change(code, { target: { value } })
      fireEvent.blur(code)

      await waitFor(() =>
        expect(apiMocks.checkCanvasInviteCodeAvailability).toHaveBeenCalledWith(
          value
        )
      )
      expect(code).not.toHaveAttribute('aria-invalid', 'true')
    }
  )

  it.each(['ABC', 'ABCDEFGHI', 'AB-C', 'AB C', 'CANVAS-VIP1'])(
    'rejects invalid custom invite code %s without checking availability',
    async (value) => {
      await renderInviteManagement()
      fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
      const code = screen.getByLabelText('Invite code')
      fireEvent.change(code, { target: { value } })
      fireEvent.blur(code)

      await waitFor(() => expect(code).toHaveAttribute('aria-invalid', 'true'))
      const error = document.querySelector('#invite-custom-code-error')
      expect(error).toHaveTextContent(
        'Custom invite code must be 4–8 uppercase letters or digits'
      )
      expect(error).toHaveAttribute('role', 'alert')
      expect(code).toHaveAttribute('aria-invalid', 'true')
      expect(code).toHaveAttribute(
        'aria-describedby',
        'invite-custom-code-error'
      )
      expect(apiMocks.checkCanvasInviteCodeAvailability).not.toHaveBeenCalled()
    }
  )

  it('clears an invalid custom draft on mode changes and keeps generated mode code-free', async () => {
    await renderInviteManagement()
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/length/u)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const code = screen.getByLabelText('Invite code')
    fireEvent.change(code, { target: { value: 'ABC' } })
    fireEvent.blur(code)
    await waitFor(() => expect(code).toHaveAttribute('aria-invalid', 'true'))
    expect(
      document.querySelector('#invite-custom-code-error')
    ).toHaveTextContent(
      'Custom invite code must be 4–8 uppercase letters or digits'
    )

    fireEvent.click(screen.getByRole('radio', { name: 'System generated' }))
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    expect(screen.getByLabelText('Invite code')).toHaveValue('')
    expect(
      document.querySelector('#invite-custom-code-error')
    ).not.toBeInTheDocument()
  })

  it('focuses the invalid custom code on submit and recovers after editing', async () => {
    await renderInviteManagement()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const code = screen.getByLabelText('Invite code')
    fireEvent.change(code, { target: { value: 'ABC' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review and create invite' })
    )

    await waitFor(() => expect(code).toHaveFocus())
    expect(code).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(code, { target: { value: ' vip1 ' } })
    expect(code).toHaveValue('VIP1')
    expect(code).not.toHaveAttribute('aria-invalid', 'true')
    expect(code).not.toHaveAttribute('aria-describedby')
  })

  it('returns a create field error to the custom code while preserving the draft', async () => {
    apiMocks.createCanvasAdminInviteCode.mockRejectedValue({
      response: {
        data: {
          code: 'INVITE_CODE_UNAVAILABLE',
          details: { field: 'code' },
        },
      },
    })
    await renderInviteManagement()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const code = screen.getByLabelText('Invite code')
    fireEvent.change(code, { target: { value: 'VIP1' } })
    fireEvent.change(screen.getByLabelText('Initial price plan'), {
      target: { value: 'group-v1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review and create invite' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm creation' })
    )

    await waitFor(() => expect(code).toHaveFocus())
    expect(code).toHaveValue('VIP1')
    expect(code).toHaveAttribute('aria-invalid', 'true')
    expect(code).toHaveAttribute('aria-describedby', 'invite-custom-code-error')
    expect(
      screen.queryByRole('alertdialog', { name: 'Create invite code' })
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Initial price plan')).toHaveValue('group-v1')
  })

  it('ignores an older availability result after the custom code changes', async () => {
    const resolvers = new Map<
      string,
      (value: { available: boolean; unavailableReasons: string[] }) => void
    >()
    apiMocks.checkCanvasInviteCodeAvailability.mockImplementation(
      (code: string) =>
        new Promise((resolve) => {
          resolvers.set(code, resolve)
        })
    )
    await renderInviteManagement()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const code = screen.getByLabelText('Invite code')
    fireEvent.change(code, { target: { value: 'FIRST1' } })
    fireEvent.blur(code)
    fireEvent.change(code, { target: { value: 'SECOND2' } })
    fireEvent.blur(code)
    await waitFor(() => expect(resolvers.size).toBe(2))

    resolvers.get('SECOND2')?.({ available: true, unavailableReasons: [] })
    resolvers.get('FIRST1')?.({
      available: false,
      unavailableReasons: ['PERMANENTLY_OCCUPIED'],
    })

    await waitFor(() => expect(code).toHaveValue('SECOND2'))
    expect(
      screen.queryByText('Invite code is invalid or unavailable')
    ).not.toBeInTheDocument()
  })

  it('ignores an older preview error after a newer proposal succeeds', async () => {
    const { item, expiryGroup } = await openChangedExtensionDrawer()
    const requests: Array<{
      resolve: (value: unknown) => void
      reject: (error: unknown) => void
    }> = []
    apiMocks.previewCanvasInviteCodeExtension.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          requests.push({ resolve, reject })
        })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Preview extension' }))
    fireEvent.change(within(expiryGroup).getByDisplayValue('11:00'), {
      target: { value: '12:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview extension' }))
    await waitFor(() => expect(requests).toHaveLength(2))
    requests[1]?.resolve({
      item,
      expectedExpiresAt: item.expiresAt,
      currentExpiresAt: item.expiresAt,
      newExpiresAt: new Date(
        new Date(item.expiresAt).getTime() + 2 * 3_600_000
      ).toISOString(),
      redeemable: false,
      unavailableReasons: ['PAUSED'],
    })
    await screen.findByText('After extension: Paused')
    requests[0]?.reject({
      response: { status: 422, data: { details: { field: 'newExpiresAt' } } },
    })

    await waitFor(() =>
      expect(screen.getByText('After extension: Paused')).toBeVisible()
    )
    expect(expiryGroup).toHaveAttribute('aria-invalid', 'false')
    expect(
      screen.queryByText('Invite expiration preview could not be loaded')
    ).not.toBeInTheDocument()
  })

  it.each(['newExpiresAt', 'expectedExpiresAt'])(
    'keeps the extension draft and maps a preview %s error to the expiry field',
    async (field) => {
      apiMocks.previewCanvasInviteCodeExtension.mockRejectedValue({
        response: {
          status: field === 'expectedExpiresAt' ? 409 : 422,
          data: { details: { field } },
        },
      })
      const { expiryGroup } = await openChangedExtensionDrawer()
      fireEvent.change(screen.getByLabelText('Extension reason (Optional)'), {
        target: { value: 'Keep this context' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Preview extension' }))

      expect(
        await screen.findByText('Invite expiration preview could not be loaded')
      ).toHaveAttribute('role', 'alert')
      expect(expiryGroup).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Extension reason (Optional)')).toHaveValue(
        'Keep this context'
      )
      expect(apiMocks.extendCanvasAdminInviteCode).not.toHaveBeenCalled()
    }
  )

  it('reuses the commit key after a field failure and keeps the updated summary open on success', async () => {
    const { item } = await openChangedExtensionDrawer()
    const updated = inviteFixture({
      id: item.id,
      maskedCode: 'UPDATED••',
      expiresAt: new Date(
        new Date(item.expiresAt).getTime() + 3_600_000
      ).toISOString(),
    })
    apiMocks.previewCanvasInviteCodeExtension.mockResolvedValue({
      item,
      expectedExpiresAt: item.expiresAt,
      currentExpiresAt: item.expiresAt,
      newExpiresAt: updated.expiresAt,
      redeemable: true,
      unavailableReasons: [],
    })
    apiMocks.extendCanvasAdminInviteCode
      .mockRejectedValueOnce({
        response: { status: 422, data: { details: { field: 'reason' } } },
      })
      .mockResolvedValueOnce(updated)
    fireEvent.change(screen.getByLabelText('Extension reason (Optional)'), {
      target: { value: 'Campaign extension' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview extension' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm extension' })
    )

    expect(
      await screen.findByText('Invite expiration could not be extended')
    ).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Extension reason (Optional)')).toHaveValue(
      'Campaign extension'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm extension' }))

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Edit invite code' })
      ).toBeVisible()
    )
    expect(await screen.findByText('UPDATED••')).toBeVisible()
    const calls = apiMocks.extendCanvasAdminInviteCode.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0]?.[0].idempotencyKey).toBe(calls[1]?.[0].idempotencyKey)
    expect(apiMocks.expandCanvasAdminInviteCodeCapacity).not.toHaveBeenCalled()
  })

  it('blocks a duplicate extension commit while the first request is pending', async () => {
    const { item } = await openChangedExtensionDrawer()
    const updated = inviteFixture({
      id: item.id,
      expiresAt: new Date(
        new Date(item.expiresAt).getTime() + 3_600_000
      ).toISOString(),
    })
    apiMocks.previewCanvasInviteCodeExtension.mockResolvedValue({
      item,
      expectedExpiresAt: item.expiresAt,
      currentExpiresAt: item.expiresAt,
      newExpiresAt: updated.expiresAt,
      redeemable: true,
      unavailableReasons: [],
    })
    let resolveCommit: ((value: CanvasAdminInviteCode) => void) | undefined
    apiMocks.extendCanvasAdminInviteCode.mockImplementation(
      () =>
        new Promise<CanvasAdminInviteCode>((resolve) => {
          resolveCommit = resolve
        })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Preview extension' }))
    const confirm = await screen.findByRole('button', {
      name: 'Confirm extension',
    })
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Confirm extension' })
      ).toBeDisabled()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm extension' }))
    expect(apiMocks.extendCanvasAdminInviteCode).toHaveBeenCalledOnce()
    resolveCommit?.(updated)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Edit invite code' })
      ).toBeVisible()
    )
  })

  it('protects a changed extension draft when the drawer is cancelled', async () => {
    await openChangedExtensionDrawer()
    fireEvent.click(screen.getByText('Close'))

    expect(
      await screen.findByRole('alertdialog', { name: 'Discard this draft?' })
    ).toBeVisible()
    expect(
      screen.getByRole('heading', {
        name: 'Edit invite code',
        hidden: true,
      })
    ).toBeVisible()
  })

  it('registers a navigation guard for a changed capacity draft', async () => {
    const onNavigationGuardChange = vi.fn()
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        inviteFixture({
          allowedActions: ['EXPAND_CAPACITY'],
        }),
      ],
    })
    renderWithClient(
      <InviteCodeManagement onNavigationGuardChange={onNavigationGuardChange} />
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit invite code' })
    )
    fireEvent.change(screen.getByLabelText(/Additional registrations/u), {
      target: { value: '5' },
    })

    await waitFor(() =>
      expect(onNavigationGuardChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ when: true })
      )
    )
    onNavigationGuardChange.mock.lastCall?.[0].discard()

    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Edit invite code' })
      ).not.toBeInTheDocument()
    )
  })

  it.each([
    {
      actions: ['EXPAND_CAPACITY'] as CanvasAdminInviteCode['allowedActions'],
      capacity: true,
      expiration: false,
    },
    {
      actions: ['EXTEND_EXPIRATION'] as CanvasAdminInviteCode['allowedActions'],
      capacity: false,
      expiration: true,
    },
    {
      actions: [
        'EXPAND_CAPACITY',
        'EXTEND_EXPIRATION',
      ] as CanvasAdminInviteCode['allowedActions'],
      capacity: true,
      expiration: true,
    },
  ])(
    'shows only the editable sections allowed by $actions',
    async ({ actions, capacity, expiration }) => {
      await openInviteEditor(inviteFixture({ allowedActions: actions }))

      expect(
        screen.queryByRole('heading', { name: 'Increase capacity' }) !== null
      ).toBe(capacity)
      expect(
        screen.queryByRole('heading', { name: 'Extend expiration' }) !== null
      ).toBe(expiration)
    }
  )

  it('hides the edit action when neither editable action is allowed', async () => {
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [inviteFixture({ allowedActions: ['REVOKE'] })],
    })
    renderWithClient(<InviteCodeManagement />)

    await screen.findByText('EXTEND••')
    expect(
      screen.queryByRole('button', { name: 'Edit invite code' })
    ).not.toBeInTheDocument()
  })

  it('previews large integer capacity exactly and only explains paused or expired state', async () => {
    await openInviteEditor(
      inviteFixture({
        status: 'PAUSED',
        redeemable: false,
        unavailableReasons: ['PAUSED', 'EXPIRED', 'EXHAUSTED'],
        allowedActions: ['EXPAND_CAPACITY'],
        maxRegistrations: '9007199254740980',
        consumedCount: '9007199254740970',
        activeReservedCount: '5',
        remainingCount: '5',
      })
    )
    fireEvent.change(screen.getByLabelText(/Additional registrations/u), {
      target: { value: '11' },
    })

    expect(
      screen.getByText(
        'After expansion: total capacity 9007199254740991, remaining 16'
      )
    ).toBeVisible()
    expect(
      screen.getByText(/will remain paused after expansion/u)
    ).toBeVisible()
    expect(
      screen.getByText(/will remain expired after expansion/u)
    ).toBeVisible()
    expect(screen.queryByText(/exhausted after expansion/u)).toBeNull()
  })

  it.each(['', '0', '-1', '1.5', 'abc', '9007199254740992'])(
    'rejects invalid additional registration value %s without a request',
    async (value) => {
      await openInviteEditor(
        inviteFixture({ allowedActions: ['EXPAND_CAPACITY'] })
      )
      const input = screen.getByLabelText(/Additional registrations/u)
      fireEvent.change(input, { target: { value } })
      fireEvent.click(
        screen.getByRole('button', { name: 'Confirm capacity expansion' })
      )

      expect(
        await screen.findByText(
          'Enter a positive whole number within the supported range'
        )
      ).toHaveAttribute('role', 'alert')
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input).toHaveAttribute(
        'aria-describedby',
        expect.stringContaining('invite-additional-registrations-error')
      )
      expect(input).toHaveFocus()
      expect(
        apiMocks.expandCanvasAdminInviteCodeCapacity
      ).not.toHaveBeenCalled()
    }
  )

  it('submits one expansion, blocks duplicates, refreshes the list, and updates the open summary', async () => {
    const original = inviteFixture({
      allowedActions: ['EXPAND_CAPACITY', 'EXTEND_EXPIRATION'],
    })
    const updated = inviteFixture({
      allowedActions: ['EXPAND_CAPACITY', 'EXTEND_EXPIRATION'],
      maxRegistrations: '15',
      remainingCount: '13',
    })
    let resolveExpansion: ((value: CanvasAdminInviteCode) => void) | undefined
    apiMocks.expandCanvasAdminInviteCodeCapacity.mockImplementation(
      () =>
        new Promise<CanvasAdminInviteCode>((resolve) => {
          resolveExpansion = resolve
        })
    )
    await openInviteEditor(original)
    fireEvent.change(screen.getByLabelText('Extension reason (Optional)'), {
      target: { value: 'Keep expiration draft' },
    })
    fireEvent.change(screen.getByLabelText(/Additional registrations/u), {
      target: { value: '5' },
    })
    const submit = screen.getByRole('button', {
      name: 'Confirm capacity expansion',
    })
    fireEvent.click(submit)

    await waitFor(() => expect(submit).toBeDisabled())
    fireEvent.click(submit)
    expect(apiMocks.expandCanvasAdminInviteCodeCapacity).toHaveBeenCalledOnce()
    expect(
      apiMocks.expandCanvasAdminInviteCodeCapacity.mock.calls[0]?.[0]
    ).toEqual(
      expect.objectContaining({
        id: original.id,
        expectedMaxRegistrations: '10',
        additionalRegistrations: '5',
        confirmed: true,
      })
    )
    expect(apiMocks.extendCanvasAdminInviteCode).not.toHaveBeenCalled()
    resolveExpansion?.(updated)

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Edit invite code' })
      ).toBeVisible()
    )
    expect(
      screen.getByText('Current capacity').parentElement
    ).toHaveTextContent('15')
    expect(screen.getByLabelText(/Additional registrations/u)).toHaveValue('')
    expect(screen.getByLabelText('Extension reason (Optional)')).toHaveValue(
      'Keep expiration draft'
    )
    await waitFor(() =>
      expect(
        apiMocks.getCanvasAdminInviteCodes.mock.calls.length
      ).toBeGreaterThan(1)
    )
  })

  it('keeps the capacity draft when the expiration section succeeds', async () => {
    const original = inviteFixture({
      allowedActions: ['EXPAND_CAPACITY', 'EXTEND_EXPIRATION'],
    })
    const updated = inviteFixture({
      allowedActions: ['EXPAND_CAPACITY', 'EXTEND_EXPIRATION'],
      expiresAt: new Date(
        new Date(original.expiresAt).getTime() + 3_600_000
      ).toISOString(),
    })
    apiMocks.previewCanvasInviteCodeExtension.mockResolvedValue({
      item: original,
      expectedExpiresAt: original.expiresAt,
      currentExpiresAt: original.expiresAt,
      newExpiresAt: updated.expiresAt,
      redeemable: true,
      unavailableReasons: [],
    })
    apiMocks.extendCanvasAdminInviteCode.mockResolvedValue(updated)
    await openInviteEditor(original)
    const capacity = screen.getByLabelText(/Additional registrations/u)
    fireEvent.change(capacity, { target: { value: '5' } })
    const expiryGroup = screen.getByRole('group', {
      name: /New expiration time/u,
    })
    fireEvent.change(within(expiryGroup).getByDisplayValue('10:00'), {
      target: { value: '11:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview extension' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm extension' })
    )

    await waitFor(() =>
      expect(apiMocks.extendCanvasAdminInviteCode).toHaveBeenCalledOnce()
    )
    expect(capacity).toHaveValue('5')
    expect(apiMocks.expandCanvasAdminInviteCodeCapacity).not.toHaveBeenCalled()
  })

  it('reads a stale invite by id across capacity-sorted pages and retries with the latest expected value', async () => {
    const original = inviteFixture({
      allowedActions: ['EXPAND_CAPACITY'],
      maxRegistrations: '10',
      remainingCount: '8',
    })
    const refreshed = inviteFixture({
      allowedActions: ['EXPAND_CAPACITY'],
      maxRegistrations: '12',
      remainingCount: '10',
    })
    const expanded = inviteFixture({
      allowedActions: ['EXPAND_CAPACITY'],
      maxRegistrations: '17',
      remainingCount: '15',
    })
    apiMocks.expandCanvasAdminInviteCodeCapacity
      .mockReset()
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { details: { field: 'expectedMaxRegistrations' } },
        },
      })
      .mockResolvedValueOnce(expanded)
    await openInviteEditor(original)
    const listRequestCount =
      apiMocks.getCanvasAdminInviteCodes.mock.calls.length
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 2,
      items: [
        inviteFixture({
          id: 'higher-capacity-invite',
          maxRegistrations: '999',
        }),
      ],
    })
    apiMocks.getCanvasAdminInviteCode.mockResolvedValueOnce(refreshed)
    const input = screen.getByLabelText(/Additional registrations/u)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm capacity expansion' })
    )

    expect(
      await screen.findByText(
        'Invite capacity changed. The latest capacity is shown; review it and submit again.'
      )
    ).toHaveAttribute('role', 'alert')
    expect(apiMocks.getCanvasAdminInviteCode).toHaveBeenCalledWith(original.id)
    expect(apiMocks.getCanvasAdminInviteCodes).toHaveBeenCalledTimes(
      listRequestCount
    )
    expect(
      screen.getByText('Current capacity').parentElement
    ).toHaveTextContent('12')
    expect(input).toHaveValue('5')
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm capacity expansion' })
    )

    await waitFor(() =>
      expect(
        apiMocks.expandCanvasAdminInviteCodeCapacity
      ).toHaveBeenCalledTimes(2)
    )
    expect(
      apiMocks.expandCanvasAdminInviteCodeCapacity.mock.calls[1]?.[0]
    ).toEqual(
      expect.objectContaining({
        expectedMaxRegistrations: '12',
        additionalRegistrations: '5',
      })
    )
    await waitFor(() => expect(input).toHaveValue(''))
    expect(
      screen.getByText('Current capacity').parentElement
    ).toHaveTextContent('17')
  })

  it('keeps the capacity input with recoverable feedback when conflict refresh fails', async () => {
    apiMocks.expandCanvasAdminInviteCodeCapacity
      .mockReset()
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { details: { field: 'expectedMaxRegistrations' } },
        },
      })
    await openInviteEditor(
      inviteFixture({ allowedActions: ['EXPAND_CAPACITY'] })
    )
    apiMocks.getCanvasAdminInviteCode.mockRejectedValueOnce(
      Object.assign(new Error('not found'), { response: { status: 404 } })
    )
    const input = screen.getByLabelText(/Additional registrations/u)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm capacity expansion' })
    )

    expect(
      await screen.findByText(
        'Invite capacity changed, but the latest capacity could not be loaded. Submit again to retry the refresh.'
      )
    ).toHaveAttribute('role', 'alert')
    expect(input).toHaveValue('5')
  })

  it('ignores a stale conflict refresh after discarding A and opening B', async () => {
    const inviteA = inviteFixture({
      id: 'invite-a',
      maskedCode: 'INVITE-A••',
      allowedActions: ['EXPAND_CAPACITY'],
      maxRegistrations: '10',
    })
    const inviteB = inviteFixture({
      id: 'invite-b',
      maskedCode: 'INVITE-B••',
      allowedActions: ['EXPAND_CAPACITY'],
      maxRegistrations: '20',
      remainingCount: '18',
    })
    const refreshedA = inviteFixture({
      ...inviteA,
      maxRegistrations: '12',
      remainingCount: '10',
    })
    let resolveRefresh: ((value: CanvasAdminInviteCode) => void) | undefined
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 2,
      items: [inviteA, inviteB],
    })
    apiMocks.expandCanvasAdminInviteCodeCapacity
      .mockReset()
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { details: { field: 'expectedMaxRegistrations' } },
        },
      })
    apiMocks.getCanvasAdminInviteCode.mockReset().mockImplementationOnce(
      () =>
        new Promise<CanvasAdminInviteCode>((resolve) => {
          resolveRefresh = resolve
        })
    )
    renderWithClient(<InviteCodeManagement />)
    fireEvent.click(
      (
        await screen.findAllByRole('button', {
          name: 'Edit invite code',
        })
      )[0]
    )
    fireEvent.change(screen.getByLabelText(/Additional registrations/u), {
      target: { value: '5' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm capacity expansion' })
    )
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminInviteCode).toHaveBeenCalledWith(inviteA.id)
    )

    fireEvent.click(screen.getByText('Close'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Discard draft' })
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Edit invite code' })
      ).not.toBeInTheDocument()
    )
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Edit invite code' })[1]
    )
    const summary = await screen.findByLabelText('Current invite summary')
    expect(within(summary).getByText('INVITE-B••')).toBeVisible()
    const inviteBDraft = screen.getByLabelText(/Additional registrations/u)
    fireEvent.change(inviteBDraft, { target: { value: '7' } })

    resolveRefresh?.(refreshedA)

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Confirm capacity expansion' })
      ).toBeEnabled()
    )
    expect(inviteBDraft).toHaveValue('7')
    expect(within(summary).getByText('INVITE-B••')).toBeVisible()
    expect(
      within(summary).getByText('Current capacity').parentElement
    ).toHaveTextContent('20')
    expect(
      screen.queryByText(/latest capacity is shown/u)
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/latest capacity could not be loaded/u)
    ).not.toBeInTheDocument()
  })

  it('does not report unrelated 409 conflicts as a stale capacity', async () => {
    apiMocks.expandCanvasAdminInviteCodeCapacity
      .mockReset()
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { details: { field: 'idempotencyKey' } },
        },
      })
    await openInviteEditor(
      inviteFixture({ allowedActions: ['EXPAND_CAPACITY'] })
    )
    const input = screen.getByLabelText(/Additional registrations/u)
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm capacity expansion' })
    )

    expect(
      await screen.findByText('Invite capacity could not be expanded')
    ).toHaveAttribute('role', 'alert')
    expect(apiMocks.getCanvasAdminInviteCode).not.toHaveBeenCalled()
    expect(
      screen.queryByText(/latest capacity is shown/u)
    ).not.toBeInTheDocument()
  })

  it('keeps the responsive editor single-column, scrollable, and accessibly labelled', async () => {
    await openInviteEditor(
      inviteFixture({
        allowedActions: ['EXPAND_CAPACITY', 'EXTEND_EXPIRATION'],
      })
    )

    expect(screen.getByTestId('invite-edit-scroll-region')).toHaveClass(
      'overflow-y-auto'
    )
    expect(screen.getByLabelText(/Additional registrations/u)).toHaveAttribute(
      'inputmode',
      'numeric'
    )
    const expiryGroup = screen.getByRole('group', {
      name: /New expiration time/u,
    })
    expect(expiryGroup.firstElementChild).toHaveClass('grid-cols-1')
    expect(screen.getAllByRole('form')).toHaveLength(2)
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
          codeMode: 'GENERATED',
          redeemable: true,
          unavailableReasons: [],
          allowedActions: ['DISPLAY', 'COPY', 'PAUSE', 'REVOKE'],
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

  it('keeps concurrent row actions pending independently when they settle in reverse order', async () => {
    const resolvers = new Map<string, (value: { code: string }) => void>()
    apiMocks.revealCanvasCode.mockImplementation(
      (_kind: string, id: string, action: string) =>
        new Promise<{ code: string }>((resolve) => {
          resolvers.set(`${id}:${action}`, resolve)
        })
    )
    const first = {
      id: 'invite-one',
      maskedCode: 'FIRST••',
      status: 'ACTIVE',
      codeMode: 'CUSTOM',
      redeemable: true,
      unavailableReasons: [],
      allowedActions: ['DISPLAY', 'COPY'],
      maxRegistrations: '10',
      reservedCount: '0',
      activeReservedCount: '0',
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
    }
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 2,
      items: [first, { ...first, id: 'invite-two', maskedCode: 'SECOND••' }],
    })

    renderWithClient(<InviteCodeManagement />)
    const show = await screen.findAllByRole('button', {
      name: 'Show invite code',
    })
    const copy = screen.getAllByRole('button', { name: 'Copy invite code' })
    const firstShow = show[0]
    expect(firstShow).toBeDefined()
    expect(show[1]).toBeDefined()
    expect(copy[0]).toBeDefined()
    expect(copy[1]).toBeDefined()
    fireEvent.click(firstShow as HTMLElement)
    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'Copy invite code',
      })[1] as HTMLElement
    )

    await waitFor(() => expect(resolvers.size).toBe(2))
    let currentShow = screen.getAllByRole('button', {
      name: 'Show invite code',
    })
    let currentCopy = screen.getAllByRole('button', {
      name: 'Copy invite code',
    })
    expect(currentShow[0]).toBeDisabled()
    expect(currentShow[1]).toBeEnabled()
    expect(currentCopy[0]).toBeEnabled()
    expect(currentCopy[1]).toBeDisabled()

    resolvers.get('invite-two:COPY')?.({ code: 'SECOND02' })
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', { name: 'Copy invite code' })[1]
      ).toBeEnabled()
    )
    currentShow = screen.getAllByRole('button', { name: 'Show invite code' })
    expect(currentShow[0]).toBeDisabled()

    resolvers.get('invite-one:DISPLAY')?.({ code: 'FIRST01' })
    await waitFor(() => expect(screen.getByText('FIRST01')).toBeVisible())
    currentCopy = screen.getAllByRole('button', { name: 'Copy invite code' })
    expect(currentCopy[1]).toBeEnabled()
  })

  it('searches complete invite codes through the POST endpoint', async () => {
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
      exactFilter: null,
    })
    apiMocks.searchCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [],
      exactFilter: null,
    })

    const { queryClient } = renderWithClient(<InviteCodeManagement />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Column filters' })
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Invite code' }), {
      target: { value: ' first01 ' },
    })

    await waitFor(() =>
      expect(apiMocks.searchCanvasAdminInviteCodes).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: 'FIRST01' }),
        expect.any(AbortSignal)
      )
    )
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(
      'FIRST01'
    )
    expect(apiMocks.getCanvasAdminInviteCodes.mock.calls).not.toEqual(
      expect.arrayContaining([
        expect.arrayContaining([expect.objectContaining({ code: 'FIRST01' })]),
      ])
    )
  })

  it('treats a partial invite code as an empty exact result', async () => {
    apiMocks.getCanvasAdminInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
      exactFilter: null,
    })
    const { queryClient } = renderWithClient(<InviteCodeManagement />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Column filters' })
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Invite code' }), {
      target: { value: 'ABC' },
    })

    await waitFor(() =>
      expect(
        screen.getByText('No invite codes match current filters')
      ).toBeVisible()
    )
    expect(apiMocks.searchCanvasAdminInviteCodes).not.toHaveBeenCalled()
    expect(JSON.stringify(queryClient.getQueryCache().getAll())).not.toContain(
      'ABC'
    )
  })

  it('rejects a three-character activation code before calling Cloud', () => {
    renderWithClient(<InviteActivation />)
    fireEvent.change(screen.getByLabelText('Invite code'), {
      target: { value: 'abc' },
    })

    expect(
      screen.getByRole('button', { name: 'Activate Canvas access' })
    ).toBeDisabled()
    expect(apiMocks.activateCanvasInvite).not.toHaveBeenCalled()
  })

  it.each(['vip1', 'ABCDEFG8', 'canvas-abcd1234', 'legacy-invite-code-2025'])(
    'passes activation code %s to Cloud after safe client normalization',
    async (value) => {
      renderWithClient(<InviteActivation />)
      fireEvent.change(screen.getByLabelText('Invite code'), {
        target: { value: ` ${value} ` },
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'Activate Canvas access' })
      )

      await waitFor(() =>
        expect(apiMocks.activateCanvasInvite).toHaveBeenCalledWith(
          value.toUpperCase()
        )
      )
    }
  )
})

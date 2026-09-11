/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { ActivityManagement } from '../ActivityManagement'

const activityApi = vi.hoisted(() => ({
  cancelCanvasLimitedPricePromotion: vi.fn(),
  cancelCanvasManualBonusActivity: vi.fn(),
  createCanvasBonusActivity: vi.fn(),
  createCanvasLimitedPriceActivity: vi.fn(),
  createCanvasManualBonusActivity: vi.fn(),
  createCanvasManualBonusMemberSelection: vi.fn(),
  getCanvasActivities: vi.fn(),
  getCanvasActivity: vi.fn(),
  getCanvasCurrentManualGrantEligibilityBasis: vi.fn(),
  getCanvasEligibleActivityCustomers: vi.fn(),
  getCanvasInviteBonusGrants: vi.fn(),
  getCanvasLimitedPriceParticipationTasks: vi.fn(),
  getCanvasManualGrantEligibilityBasis: vi.fn(),
  getCanvasManualGrantMembers: vi.fn(),
  getCanvasRechargeBonusBindings: vi.fn(),
  resolveCanvasEligibleActivityCustomers: vi.fn(),
  retryCanvasManualGrantFailures: vi.fn(),
  stopCanvasBonusActivity: vi.fn(),
  updateCanvasManualBonusActivity: vi.fn(),
}))
const pricingApi = vi.hoisted(() => ({
  cancelCanvasLimitedPricePromotion: vi.fn(),
  getCanvasCustomerBusinessFacts: vi.fn(),
  getCanvasModelPricingModel: vi.fn(),
  getCanvasModelPricingWorkspace: vi.fn(),
}))

vi.mock('../../activity-api', () => activityApi)
vi.mock('../../api', () => pricingApi)
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function mount(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  )
}

async function chooseCreateType(value: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Create activity' }))
  await user.click(await screen.findByRole('option', { name: value }))
}

describe('ADMIN-REWORK-007 activity management', () => {
  beforeAll(() =>
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  )

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    await i18next.changeLanguage('en')
    activityApi.getCanvasActivities.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })
    activityApi.getCanvasEligibleActivityCustomers.mockResolvedValue({
      items: [
        {
          customerId: '85000000-0000-7000-8000-000000000001',
          customer: 'alice',
          qualifyingAmountMinor: '10000',
          currency: 'CNY',
          eligible: true,
          selected: false,
        },
      ],
      total: 1001,
      page: 1,
      pageSize: 20,
      checkedAt: '2026-09-12T00:00:00.000Z',
    })
    activityApi.resolveCanvasEligibleActivityCustomers.mockResolvedValue({
      selectionToken: '85000000-0000-7000-8000-000000000099',
      count: 1001,
      expiresAt: '2026-09-12T00:10:00.000Z',
    })
    activityApi.createCanvasManualBonusMemberSelection.mockResolvedValue({
      selectionToken: '85000000-0000-7000-8000-000000000098',
      count: 1,
      expiresAt: '2026-09-12T00:10:00.000Z',
    })
    pricingApi.getCanvasModelPricingWorkspace.mockResolvedValue({ models: [] })
    pricingApi.getCanvasModelPricingModel.mockResolvedValue({
      pricingScopes: [],
    })
    pricingApi.getCanvasCustomerBusinessFacts.mockResolvedValue({
      fact: undefined,
      items: [],
    })
  })

  it('offers each of the four creation paths', async () => {
    const { unmount } = mount(<ActivityManagement />)
    await chooseCreateType('Manual bonus')
    expect(await screen.findByText('Points per customer')).toBeVisible()
    unmount()

    mount(<ActivityManagement />)
    await chooseCreateType('Recharge bonus')
    expect(await screen.findByText('Recharge bonus')).toBeVisible()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Cancel' }))

    await chooseCreateType('Invite bonus')
    expect(await screen.findByText('Invite bonus')).toBeVisible()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Cancel' }))

    await chooseCreateType('Task price special')
    expect(await screen.findByLabelText('Source model')).toBeVisible()
  })

  it('uses a token only after every selected page is explicit and clears it when criteria change', async () => {
    activityApi.getCanvasEligibleActivityCustomers.mockImplementation(
      (query: { page: number; pageSize: number }) =>
        Promise.resolve({
          items: [
            query.page === 1
              ? {
                  customerId: '85000000-0000-7000-8000-000000000001',
                  customer: 'alice',
                  qualifyingAmountMinor: '10000',
                  currency: 'CNY',
                  eligible: true,
                  selected: false,
                }
              : {
                  customerId: '85000000-0000-7000-8000-000000000002',
                  customer: 'bob',
                  qualifyingAmountMinor: '10000',
                  currency: 'CNY',
                  eligible: true,
                  selected: false,
                },
          ],
          total: 1001,
          page: query.page,
          pageSize: query.pageSize,
          checkedAt: '2026-09-12T00:00:00.000Z',
        })
    )
    mount(<ActivityManagement />)
    await chooseCreateType('Manual bonus')
    fireEvent.click(
      await screen.findByRole('combobox', { name: 'Customer scope' })
    )
    await userEvent
      .setup()
      .click(await screen.findByRole('option', { name: 'Recharge threshold' }))
    await userEvent
      .setup()
      .type(screen.getByLabelText('Minimum recharge amount (CNY)'), '100')
    await waitFor(() =>
      expect(
        activityApi.getCanvasEligibleActivityCustomers
      ).toHaveBeenCalledWith(
        expect.objectContaining({ minimumRechargeAmountMinor: '10000' }),
        expect.anything()
      )
    )
    await userEvent
      .setup()
      .click(
        await screen.findByRole('checkbox', { name: 'Select current page' })
      )
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Select all 1001 matching customers',
        })
      ).toBeVisible()
    )
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(await screen.findByText('bob')).toBeVisible()
    await userEvent
      .setup()
      .click(
        await screen.findByRole('checkbox', { name: 'Select current page' })
      )
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Select all 1001 matching customers',
        })
      ).toBeVisible()
    )
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Select all 1001 matching customers',
      })
    )
    expect(await screen.findByText(/Selected 1001 customers/)).toBeVisible()
    expect(
      activityApi.resolveCanvasEligibleActivityCustomers
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        minimumRechargeAmountMinor: '10000',
        currency: 'CNY',
      })
    )

    await userEvent
      .setup()
      .clear(screen.getByLabelText('Minimum recharge amount (CNY)'))
    await userEvent
      .setup()
      .type(screen.getByLabelText('Minimum recharge amount (CNY)'), '200')
    await waitFor(() =>
      expect(screen.getByText(/Selected 0 customers/)).toBeVisible()
    )
  })

  it('edits a scheduled grant through its member-selection baseline and sends only membership deltas', async () => {
    const activityId = '85000000-0000-7000-8000-000000000030'
    const plan = {
      activityId,
      version: 1,
      type: 'MANUAL_BONUS' as const,
      name: 'Editable members',
      points: '50',
      ttlDays: 30,
      reason: 'September',
      scope: { type: 'SELECTED' as const, selectedCustomerCount: 1 },
      status: 'WAITING' as const,
      schedule: {
        mode: 'SCHEDULED' as const,
        scheduledAt: '2026-09-13T00:00:00.000Z',
      },
      memberCount: 1,
      successCount: 0,
      failureCount: 0,
      issuedPoints: '0',
      createdAt: '2026-09-12T00:00:00.000Z',
      publisher: null,
      publishedAt: null,
      actualStartedAt: null,
      cancelledAt: null,
      cancelledByPrincipalId: null,
      cancelledBy: null,
      stoppedAt: null,
      stoppedBy: null,
    }
    activityApi.getCanvasActivities.mockResolvedValue({
      items: [
        {
          id: activityId,
          promotionId: activityId,
          version: 1,
          name: plan.name,
          type: plan.type,
          status: plan.status,
          createdAt: plan.createdAt,
          startsAt: plan.schedule.scheduledAt,
          endsAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    activityApi.getCanvasActivity.mockResolvedValue(plan)
    activityApi.getCanvasManualGrantMembers.mockResolvedValue({
      items: [],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    activityApi.getCanvasEligibleActivityCustomers.mockResolvedValue({
      items: [
        {
          customerId: '85000000-0000-7000-8000-000000000031',
          customer: 'alice',
          qualifyingAmountMinor: '0',
          currency: 'CNY',
          eligible: true,
          selected: true,
        },
        {
          customerId: '85000000-0000-7000-8000-000000000032',
          customer: 'bob',
          qualifyingAmountMinor: '0',
          currency: 'CNY',
          eligible: true,
          selected: false,
        },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
      checkedAt: '2026-09-12T00:00:00.000Z',
    })
    activityApi.updateCanvasManualBonusActivity.mockResolvedValue(plan)

    mount(<ActivityManagement />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: plan.name }))
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Edit' }))
    const activityName = screen.getByLabelText('Activity name')
    expect(activityName).toHaveValue(plan.name)
    expect(activityName).toBeDisabled()
    await waitFor(() =>
      expect(
        activityApi.createCanvasManualBonusMemberSelection
      ).toHaveBeenCalledWith(activityId)
    )
    const alice = await screen.findByRole('checkbox', {
      name: 'Select customer alice',
    })
    expect(alice).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Select customer bob' })
    ).not.toBeChecked()

    await userEvent.setup().click(alice)
    await userEvent
      .setup()
      .click(
        await screen.findByRole('checkbox', { name: 'Select customer bob' })
      )
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Confirm update' }))

    await waitFor(() =>
      expect(activityApi.updateCanvasManualBonusActivity).toHaveBeenCalledWith(
        activityId,
        expect.objectContaining({
          scope: {
            type: 'SELECTED',
            selectionToken: '85000000-0000-7000-8000-000000000098',
            addedCustomerIds: ['85000000-0000-7000-8000-000000000032'],
            removedCustomerIds: ['85000000-0000-7000-8000-000000000031'],
          },
        })
      )
    )
    expect(
      activityApi.updateCanvasManualBonusActivity.mock.calls.at(-1)?.[1]
    ).not.toHaveProperty('name')
  })

  it('bounds an eligibility conflict to the API summary and names the omitted customer count', async () => {
    activityApi.createCanvasManualBonusActivity.mockRejectedValue({
      response: {
        status: 409,
        data: {
          message: 'Eligibility changed',
          affectedCustomerTotal: 145,
          affectedCustomers: Array.from({ length: 100 }, (_, index) => ({
            customerId: `85000000-0000-7000-8000-${String(index).padStart(12, '0')}`,
            customer: `customer-${index + 1}`,
            reason: 'No longer eligible',
          })),
        },
      },
    })

    mount(<ActivityManagement />)
    await chooseCreateType('Manual bonus')
    await userEvent
      .setup()
      .click(
        await screen.findByRole('checkbox', { name: 'Select customer alice' })
      )
    await userEvent
      .setup()
      .type(screen.getByLabelText('Activity name'), 'Conflict fixture')
    await userEvent
      .setup()
      .type(screen.getByLabelText('Points per customer'), '50')
    await userEvent
      .setup()
      .type(screen.getByLabelText('Reason'), 'Conflict fixture')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Confirm grant' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '45 more affected customers are not shown.'
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(100)
  })

  it('keeps recharge binding records to the approved columns and exposes only the redeemed order link', async () => {
    const customerId = '85000000-0000-7000-8000-000000000001'
    const activityId = '85000000-0000-7000-8000-000000000002'
    const pointLotId = '85000000-0000-7000-8000-000000000003'
    activityApi.getCanvasActivities.mockResolvedValue({
      items: [
        {
          id: activityId,
          promotionId: activityId,
          version: 1,
          name: 'Recharge autumn bonus',
          type: 'RECHARGE_BONUS',
          status: 'ACTIVE',
          createdAt: '2026-09-12T00:00:00.000Z',
          startsAt: null,
          endsAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    activityApi.getCanvasActivity.mockResolvedValue({
      id: activityId,
      promotionId: activityId,
      version: 1,
      type: 'RECHARGE_BONUS',
      status: 'ACTIVE',
      name: 'Recharge autumn bonus',
      points: '50',
      ttlDays: 30,
      reason: 'Seasonal',
      createdAt: '2026-09-12T00:00:00.000Z',
      stoppedAt: null,
    })
    activityApi.getCanvasRechargeBonusBindings.mockResolvedValue({
      items: [
        {
          participationId: 'participation-1',
          rechargeOrderId: '85000000-0000-7000-8000-000000000004',
          rechargeOrderNumber: 'CANVAS-001',
          rechargeCodeId: null,
          redemptionStatus: 'REDEEMED',
          customerId,
          customer: 'alice',
          amountMinor: '10000',
          currency: 'CNY',
          bonusPoints: '50',
          pointLotId,
          boundAt: '2026-09-12T00:00:00.000Z',
          redeemedAt: '2026-09-12T01:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    mount(<ActivityManagement />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Recharge autumn bonus' })
    )
    await screen.findByText('Binding records')
    await waitFor(() =>
      expect(activityApi.getCanvasRechargeBonusBindings).toHaveBeenCalled()
    )

    const headers = screen
      .getAllByRole('columnheader')
      .map((header) => header.textContent)
    expect(headers).toEqual(
      expect.arrayContaining([
        'Recharge order',
        'Recharge amount',
        'Bonus points',
        'Customer',
        'Status',
        'Redeemed at',
      ])
    )
    expect(headers).not.toContain('Bound')

    expect(screen.getByRole('link', { name: 'CANVAS-001' })).toHaveAttribute(
      'href',
      `/canvas-cloud/customers?customerId=${customerId}&orderId=85000000-0000-7000-8000-000000000004`
    )
    expect(screen.getByText('alice').closest('a')).toBeNull()
    expect(screen.getByText('50').closest('a')).toBeNull()
  })

  it('opens an invite credit time in a lot-details sheet and restores its button focus', async () => {
    const customerId = '85000000-0000-7000-8000-000000000020'
    const activityId = '85000000-0000-7000-8000-000000000021'
    const pointLotId = '85000000-0000-7000-8000-000000000022'
    activityApi.getCanvasActivities.mockResolvedValue({
      items: [
        {
          id: activityId,
          promotionId: activityId,
          version: 1,
          name: 'Invite autumn bonus',
          type: 'INVITE_BONUS',
          status: 'ACTIVE',
          createdAt: '2026-09-12T00:00:00.000Z',
          startsAt: null,
          endsAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    activityApi.getCanvasActivity.mockResolvedValue({
      id: activityId,
      promotionId: activityId,
      version: 1,
      type: 'INVITE_BONUS',
      status: 'ACTIVE',
      name: 'Invite autumn bonus',
      points: '50',
      ttlDays: 30,
      reason: 'Seasonal',
      createdAt: '2026-09-12T00:00:00.000Z',
      publisher: null,
      publishedAt: null,
      stoppedAt: null,
      stoppedBy: null,
    })
    activityApi.getCanvasInviteBonusGrants.mockResolvedValue({
      items: [
        {
          participationId: 'participation-1',
          inviteClaimId: 'claim-1',
          inviteCodeId: 'code-1',
          inviteCodePrefix: 'INVITE',
          customerId,
          customer: 'alice',
          bonusPoints: '50',
          pointLotId,
          reservedAt: '2026-09-12T00:00:00.000Z',
          issuedAt: '2026-09-12T01:00:00.000Z',
          expiresAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })

    mount(<ActivityManagement />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Invite autumn bonus' }))
    await screen.findByText('Grant records')
    const issuedAtButton = screen
      .getAllByRole('button')
      .find((button) => button.textContent?.includes('2026'))
    expect(issuedAtButton).toBeDefined()
    await userEvent.setup().click(issuedAtButton as HTMLButtonElement)
    expect(await screen.findByText('Point lot details')).toBeVisible()

    await userEvent.setup().keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen
          .getAllByRole('button')
          .find((button) => button.textContent?.includes('2026'))
      ).toHaveFocus()
    )
  })

  it('shows a fixed-member snapshot without execution fields before a grant runs', async () => {
    const activityId = '85000000-0000-7000-8000-000000000010'
    activityApi.getCanvasActivities.mockResolvedValue({
      items: [
        {
          id: activityId,
          promotionId: activityId,
          version: 1,
          name: 'Scheduled threshold grant',
          type: 'MANUAL_BONUS',
          status: 'WAITING',
          createdAt: '2026-09-12T00:00:00.000Z',
          startsAt: '2026-09-13T00:00:00.000Z',
          endsAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    activityApi.getCanvasActivity.mockResolvedValue({
      activityId,
      version: 1,
      type: 'MANUAL_BONUS',
      name: 'Scheduled threshold grant',
      points: '50',
      ttlDays: 30,
      reason: 'September',
      scope: {
        type: 'RECHARGE_THRESHOLD',
        selectedCustomerCount: 2,
        minimumRechargeAmountMinor: '10000',
        currency: 'CNY',
      },
      status: 'WAITING',
      schedule: { mode: 'SCHEDULED', scheduledAt: '2026-09-13T00:00:00.000Z' },
      memberCount: 2,
      successCount: 0,
      failureCount: 0,
      issuedPoints: '0',
      createdAt: '2026-09-12T00:00:00.000Z',
      publisher: null,
      publishedAt: null,
      actualStartedAt: null,
      cancelledAt: null,
      cancelledByPrincipalId: null,
      cancelledBy: null,
      stoppedAt: null,
      stoppedBy: null,
    })
    activityApi.getCanvasManualGrantMembers.mockResolvedValue({
      items: [
        {
          customerId: 'customer-1',
          customer: 'alice',
          status: 'PENDING',
          qualifyingAmountMinor: '10000',
          attemptCount: 0,
          creditedAt: null,
          expiresAt: null,
          pointLotId: null,
          failureReason: null,
        },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    })

    mount(<ActivityManagement />)
    await userEvent
      .setup()
      .click(
        await screen.findByRole('button', { name: 'Scheduled threshold grant' })
      )
    expect(
      await screen.findByText(/Fixed membership 2 customers/)
    ).toBeVisible()
    expect(screen.getByRole('columnheader', { name: 'Customer' })).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Qualifying recharge amount' })
    ).toBeVisible()
    expect(screen.queryByRole('columnheader', { name: 'Result' })).toBeNull()
    expect(
      screen.queryByRole('columnheader', { name: 'Credited at' })
    ).toBeNull()

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Cancel plan' }))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Uses your current time zone'
    )
    expect(screen.getAllByText(/Fixed membership 2 customers/)).toHaveLength(2)
  })

  it('shows execution fields and actual results after a grant starts', async () => {
    const activityId = '85000000-0000-7000-8000-000000000011'
    activityApi.getCanvasActivities.mockResolvedValue({
      items: [
        {
          id: activityId,
          promotionId: activityId,
          version: 1,
          name: 'Running selected grant',
          type: 'MANUAL_BONUS',
          status: 'RUNNING',
          createdAt: '2026-09-12T00:00:00.000Z',
          startsAt: null,
          endsAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    activityApi.getCanvasActivity.mockResolvedValue({
      activityId,
      version: 1,
      type: 'MANUAL_BONUS',
      name: 'Running selected grant',
      points: '50',
      ttlDays: 30,
      reason: 'September',
      scope: { type: 'SELECTED', selectedCustomerCount: 1 },
      status: 'RUNNING',
      schedule: { mode: 'IMMEDIATE' },
      memberCount: 3,
      pendingCount: 1,
      processingCount: 1,
      successCount: 1,
      failureCount: 0,
      issuedPoints: '50',
      createdAt: '2026-09-12T00:00:00.000Z',
      publisher: null,
      publishedAt: null,
      actualStartedAt: '2026-09-12T00:00:01.000Z',
      cancelledAt: null,
      cancelledByPrincipalId: null,
      cancelledBy: null,
      stoppedAt: null,
      stoppedBy: null,
    })
    activityApi.getCanvasManualGrantMembers.mockResolvedValue({
      items: [
        {
          customerId: 'customer-1',
          customer: 'alice',
          status: 'SUCCEEDED',
          attemptCount: 1,
          creditedAt: '2026-09-12T00:00:01.000Z',
          expiresAt: null,
          pointLotId: 'lot-1',
          failureReason: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })

    mount(<ActivityManagement />)
    await userEvent
      .setup()
      .click(
        await screen.findByRole('button', { name: 'Running selected grant' })
      )
    expect(
      await screen.findByRole('columnheader', { name: 'Result' })
    ).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Credited at' })
    ).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Record or reason' })
    ).toBeVisible()
    expect(
      screen.queryByRole('columnheader', { name: 'Qualifying recharge amount' })
    ).toBeNull()
    expect(
      screen.getByText('Pending 1 · Processing 1 · Succeeded 1')
    ).toBeVisible()
    expect(screen.queryByText('Failed 0')).toBeNull()
  })

  it('recalculates every Token category from the published risk basis and keeps zero as a price', async () => {
    pricingApi.getCanvasModelPricingWorkspace.mockResolvedValue({
      models: [
        {
          id: 'model-token',
          name: 'Canvas Token',
          modelKey: 'canvas.token',
          hasPublishedPricing: true,
        },
      ],
    })
    pricingApi.getCanvasModelPricingModel.mockResolvedValue({
      pricingScopes: [
        {
          combinationKey: 'default',
          prices: [
            {
              priceGroupName: 'Standard',
              current: {
                id: 'price-token',
                status: 'PUBLISHED',
                billingUnit: 'MILLION_TOKENS',
                points: '10',
                tokenRates: { input: '10', output: '20', cacheRead: '1' },
                calculation: {
                  baseRatePointsPerRmb: '100',
                  kPricingRmb: '0.1',
                },
                assumptions: {
                  tokenCategoryRisks: [
                    {
                      category: 'input',
                      customerRatePoints: '10',
                      kPricingRmb: '0.05',
                    },
                    {
                      category: 'output',
                      customerRatePoints: '20',
                    },
                  ],
                },
              },
            },
          ],
        },
      ],
    })

    mount(<ActivityManagement />)
    await chooseCreateType('Task price special')
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Source model' }))
    await user.click(
      await screen.findByRole('option', { name: 'Canvas Token · canvas.token' })
    )
    await user.click(
      await screen.findByRole('combobox', { name: 'Source price version' })
    )
    await user.click(
      await screen.findByRole('option', { name: 'Standard · default' })
    )
    await user.type(screen.getByLabelText('Special input token rate'), '0')
    await user.type(screen.getByLabelText('Special output token rate'), '10')

    expect(await screen.findByText('10 → 0')).toBeVisible()
    expect(screen.getByText('¥0')).toBeVisible()
    expect(screen.getByText('¥-0.05')).toBeVisible()
    expect(screen.getByText('Yes')).toBeVisible()
    expect(screen.getByText('— → —')).toBeVisible()
    expect(
      screen.getAllByText('This category cannot be evaluated yet.')
    ).toHaveLength(2)

    await user.clear(screen.getByLabelText('Special input token rate'))
    await user.type(screen.getByLabelText('Special input token rate'), '1')
    expect(await screen.findByText('¥0.01')).toBeVisible()
  })

  it('renders the frozen Token-category cost snapshot without using current pricing facts', async () => {
    const activityId = '85000000-0000-7000-8000-000000000013'
    activityApi.getCanvasActivities.mockResolvedValue({
      items: [
        {
          id: activityId,
          promotionId: activityId,
          version: 1,
          name: 'Frozen Token special',
          type: 'TASK_PRICE_SPECIAL',
          status: 'ACTIVE',
          createdAt: '2026-09-12T00:00:00.000Z',
          startsAt: '2026-09-13T00:00:00.000Z',
          endsAt: '2026-09-14T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    activityApi.getCanvasActivity.mockResolvedValue({
      id: activityId,
      promotionId: activityId,
      version: 1,
      type: 'TASK_PRICE_SPECIAL',
      name: 'Frozen Token special',
      reason: 'Frozen approval facts',
      status: 'ACTIVE',
      publisher: null,
      publishedAt: '2026-09-12T00:00:00.000Z',
      stoppedAt: null,
      stoppedBy: null,
      sourcePriceVersionId: 'price-token',
      target: {
        customerModel: { id: 'model-token', label: 'Canvas Token' },
        priceGroup: { id: 'group-standard', label: 'Standard' },
        parameterCombination: {
          id: 'default',
          label: 'default',
          parameters: {},
        },
      },
      sourcePriceSnapshot: {
        sourcePriceVersionId: 'price-token',
        billingUnit: 'MILLION_TOKENS',
        basePoints: null,
        baseRatePointsPerRmb: '100',
        kPricingRmb: null,
        baseTokenRates: { input: '10', output: '20' },
        tokenCategoryCostReferences: [
          {
            category: 'input',
            basePoints: '10',
            specialPoints: '0',
            baseRatePointsPerRmb: '100',
            kPricingRmb: '0.05',
            specialPriceRmb: '0',
            differenceRmb: '-0.05',
            belowCostReference: true,
          },
        ],
      },
      billingUnit: 'MILLION_TOKENS',
      basePoints: null,
      specialPoints: null,
      baseTokenRates: { input: '10', output: '20' },
      specialTokenRates: { input: '0', output: '10' },
      tokenCategoryCostReferences: [
        {
          category: 'input',
          basePoints: '10',
          specialPoints: '0',
          baseRatePointsPerRmb: '100',
          kPricingRmb: '0.05',
          specialPriceRmb: '0',
          differenceRmb: '-0.05',
          belowCostReference: true,
        },
        {
          category: 'output',
          basePoints: '20',
          specialPoints: '10',
          baseRatePointsPerRmb: '100',
          kPricingRmb: null,
          specialPriceRmb: '0.1',
          differenceRmb: null,
          belowCostReference: null,
        },
      ],
      discountPoints: null,
      expectedContributionRate: null,
      budgetConsumedMinor: null,
      expectedLossMinor: null,
      startsAt: '2026-09-13T00:00:00.000Z',
      endsAt: '2026-09-14T00:00:00.000Z',
    })
    activityApi.getCanvasLimitedPriceParticipationTasks.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })

    mount(<ActivityManagement />)
    await userEvent
      .setup()
      .click(
        await screen.findByRole('button', { name: 'Frozen Token special' })
      )

    expect(await screen.findByText('10 → 0')).toBeVisible()
    expect(screen.getByText('¥-0.05')).toBeVisible()
    expect(screen.getByText('¥0.1')).toBeVisible()
    expect(
      screen.getByText(
        'Historical pricing facts are frozen at publication and may differ from current pricing.'
      )
    ).toBeVisible()
    expect(
      screen.getByText('This category cannot be evaluated yet.')
    ).toBeVisible()
  })

  it('restores stable list focus after returning from detail and cancelling creation', async () => {
    const activityId = '85000000-0000-7000-8000-000000000012'
    activityApi.getCanvasActivities.mockResolvedValue({
      items: [
        {
          id: activityId,
          promotionId: activityId,
          version: 1,
          name: 'Focusable activity',
          type: 'INVITE_BONUS',
          status: 'ACTIVE',
          createdAt: '2026-09-12T00:00:00.000Z',
          startsAt: null,
          endsAt: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    activityApi.getCanvasActivity.mockResolvedValue({
      id: activityId,
      promotionId: activityId,
      version: 1,
      type: 'INVITE_BONUS',
      status: 'ACTIVE',
      name: 'Focusable activity',
      points: '50',
      ttlDays: 30,
      reason: 'September',
      createdAt: '2026-09-12T00:00:00.000Z',
      publisher: null,
      publishedAt: null,
      stoppedAt: null,
      stoppedBy: null,
    })
    activityApi.getCanvasInviteBonusGrants.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })

    const first = mount(<ActivityManagement />)
    const activityButton = await screen.findByRole('button', {
      name: 'Focusable activity',
    })
    await userEvent.setup().click(activityButton)
    await userEvent.setup().click(
      await screen.findByRole('button', {
        name: 'Back to activity management',
      })
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Focusable activity' })
      ).toHaveFocus()
    )
    first.unmount()

    mount(<ActivityManagement />)
    await chooseCreateType('Manual bonus')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Create activity' })
      ).toHaveFocus()
    )
  })
})

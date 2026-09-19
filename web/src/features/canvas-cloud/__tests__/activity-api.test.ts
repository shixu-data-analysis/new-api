/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it, vi } from 'vitest'

import {
  createCanvasBonusActivity,
  createCanvasLimitedPriceActivity,
  createCanvasManualBonusActivity,
  createCanvasManualBonusMemberSelection,
  getCanvasActivities,
  getCanvasBindableBonusActivities,
  getCanvasCurrentManualGrantEligibilityBasis,
  getCanvasRechargeBonusBindings,
  getCanvasEligibleActivityCustomers,
  resolveCanvasEligibleActivityCustomers,
  retryCanvasManualGrantFailures,
  updateCanvasManualBonusActivity,
} from '../activity-api'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}))
vi.mock('@/lib/api', () => ({ api: mocks }))

describe('activity API boundary', () => {
  it('uses the unified list and bindable endpoints without a legacy campaign projection', async () => {
    mocks.get.mockResolvedValue({ data: { items: [], total: 0 } })
    await getCanvasActivities({
      page: 1,
      pageSize: 20,
      type: 'MANUAL_BONUS',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
    await getCanvasEligibleActivityCustomers({
      page: 1,
      pageSize: 20,
      minimumRechargeAmountMinor: '10000',
      currency: 'CNY',
    })
    await getCanvasBindableBonusActivities('RECHARGE_BONUS')

    expect(mocks.get.mock.calls.map((call) => call[0])).toEqual([
      '/canvas-api/v1/web/admin/activities',
      '/canvas-api/v1/web/admin/activities/eligible-customers',
      '/canvas-api/v1/web/admin/activities/bindable',
    ])
    expect(mocks.get.mock.calls.at(-1)?.[1]).toEqual({
      params: { type: 'RECHARGE_BONUS' },
      signal: undefined,
    })
  })

  it('confirms one fixed recipient set and never derives a recharge bonus from code amount', async () => {
    mocks.post.mockResolvedValue({ data: {} })
    mocks.patch.mockResolvedValue({ data: {} })
    await createCanvasManualBonusActivity({
      name: 'September thanks',
      points: '100',
      ttlDays: 30,
      reason: 'Campaign',
      scope: { type: 'SELECTED', customerIds: ['customer-a'] },
      schedule: { mode: 'IMMEDIATE' },
    })
    await createCanvasBonusActivity('RECHARGE_BONUS', {
      name: 'Recharge bonus',
      points: '50',
      ttlDays: 30,
      reason: 'Campaign',
    })
    await retryCanvasManualGrantFailures('activity-id')
    await updateCanvasManualBonusActivity('activity-id', {
      expectedVersion: 3,
      points: '120',
      ttlDays: 30,
      reason: 'Adjusted',
      scope: { type: 'SELECTED', selectionToken: 'member-selection-id' },
      schedule: { mode: 'SCHEDULED', scheduledAt: '2026-10-01T00:00:00Z' },
    })

    expect(mocks.post.mock.calls.map((call) => call[0])).toEqual([
      '/canvas-api/v1/web/admin/activities/manual-bonuses',
      '/canvas-api/v1/web/admin/activities/recharge-bonuses',
      '/canvas-api/v1/web/admin/activities/activity-id/manual-bonus/retry-failures',
    ])
    expect(mocks.post.mock.calls[0]?.[1]).toMatchObject({
      confirmed: true,
      scope: { type: 'SELECTED', customerIds: ['customer-a'] },
    })
    expect(mocks.post.mock.calls[1]?.[1]).toEqual({
      name: 'Recharge bonus',
      points: '50',
      ttlDays: 30,
      reason: 'Campaign',
      confirmed: true,
    })
    expect(mocks.patch).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/activities/activity-id/manual-bonus',
      {
        expectedVersion: 3,
        points: '120',
        ttlDays: 30,
        reason: 'Adjusted',
        scope: { type: 'SELECTED', selectionToken: 'member-selection-id' },
        schedule: { mode: 'SCHEDULED', scheduledAt: '2026-10-01T00:00:00Z' },
        confirmed: true,
      },
      expect.any(Object)
    )
    expect(mocks.patch.mock.calls.at(-1)?.[1]).not.toHaveProperty('name')
  })

  it('creates a limited-time special only from a source PriceVersion with one pricing shape', async () => {
    mocks.post.mockResolvedValue({ data: {} })

    await createCanvasLimitedPriceActivity({
      name: 'Autumn special',
      sourcePriceVersionId: 'price-version-id',
      specialTokenRates: { input: '20', output: '30' },
      startsAt: '2026-10-01T00:00:00.000Z',
      endsAt: '2026-10-02T00:00:00.000Z',
      approvalReason: 'Approved temporary offer',
    })

    expect(mocks.post).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/limited-price-promotions',
      {
        name: 'Autumn special',
        sourcePriceVersionId: 'price-version-id',
        specialTokenRates: { input: '20', output: '30' },
        startsAt: '2026-10-01T00:00:00.000Z',
        endsAt: '2026-10-02T00:00:00.000Z',
        approvalReason: 'Approved temporary offer',
        confirmed: true,
      },
      expect.any(Object)
    )
  })

  it('resolves an actor-bound threshold selection token only after an explicit all-matching action', async () => {
    mocks.post.mockResolvedValue({
      data: {
        selectionToken: 'selection-id',
        count: 1001,
        expiresAt: '2026-09-12T00:10:00Z',
      },
    })

    await resolveCanvasEligibleActivityCustomers({
      minimumRechargeAmountMinor: '10000',
      currency: 'CNY',
    })

    expect(mocks.post).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/activities/eligible-customers/selection',
      {
        minimumRechargeAmountMinor: '10000',
        currency: 'CNY',
        confirmed: true,
      },
      expect.any(Object)
    )
  })

  it('creates an actor- and version-bound member baseline with explicit confirmation', async () => {
    mocks.post.mockResolvedValue({
      data: {
        selectionToken: 'selection-id',
        count: 2,
        expiresAt: '2026-09-12T00:10:00Z',
      },
    })

    await createCanvasManualBonusMemberSelection('activity-id')

    expect(mocks.post).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/activities/activity-id/manual-bonus/member-selection',
      { confirmed: true },
      expect.any(Object)
    )
  })

  it('sends only strict eligibility-basis query fields', async () => {
    mocks.get.mockResolvedValue({ data: { orders: [] } })

    await getCanvasCurrentManualGrantEligibilityBasis('customer-id', {
      minimumRechargeAmountMinor: '10000',
      currency: 'CNY',
      redeemedFrom: '2026-09-01T00:00:00.000Z',
      redeemedTo: '2026-09-12T00:00:00.000Z',
    })

    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/activities/eligible-customers/customer-id/eligibility-basis',
      {
        params: {
          minimumRechargeAmountMinor: '10000',
          currency: 'CNY',
          redeemedFrom: '2026-09-01T00:00:00.000Z',
          redeemedTo: '2026-09-12T00:00:00.000Z',
        },
        signal: undefined,
      }
    )
    expect(mocks.get.mock.calls.at(-1)?.[1]?.params).not.toHaveProperty(
      'sortBy'
    )
    expect(mocks.get.mock.calls.at(-1)?.[1]?.params).not.toHaveProperty(
      'sortOrder'
    )
  })

  it('forwards only the approved recharge-record sort fields', async () => {
    mocks.get.mockResolvedValue({ data: { items: [], total: 0 } })

    await getCanvasRechargeBonusBindings('activity-id', {
      page: 2,
      pageSize: 20,
      redemptionStatus: 'REDEEMED',
      sortBy: 'redeemedAt',
      sortOrder: 'desc',
    })

    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/activities/activity-id/recharge-bindings',
      {
        params: {
          page: 2,
          pageSize: 20,
          redemptionStatus: 'REDEEMED',
          sortBy: 'redeemedAt',
          sortOrder: 'desc',
        },
        signal: undefined,
      }
    )
  })
})

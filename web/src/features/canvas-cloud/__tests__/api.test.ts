/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  activateCanvasInvite,
  cancelCanvasLimitedPricePromotion,
  cancelScheduledCanvasPrice,
  approveCanvasPriceDraft,
  approveCanvasPointIssuanceRate,
  createCanvasPointIssuanceRateDraft,
  createCanvasLimitedPricePromotion,
  createCanvasAdminInviteCode,
  createCanvasPriceDraft,
  approveCanvasPriceGroup,
  createCanvasPriceGroupDraft,
  getCanvasPriceGroups,
  publishCanvasPriceGroup,
  getCanvasAdminRechargeCodes,
  getCanvasAdminInviteCodes,
  getCanvasInviteCodeOptions,
  getCanvasAdminWorkspace,
  getCanvasAuditEvents,
  getCanvasAdminTestingModels,
  getCanvasCustomerWorkspace,
  getCanvasPointIssuanceRates,
  getCanvasTaskPolicySettings,
  getCanvasRechargePurchaseLink,
  issueCanvasAdminRechargeCodes,
  changeCanvasAdminInviteCodeStatus,
  normalizeCanvasRechargePurchaseLink,
  planCanvasModelCatalogBundle,
  publishCanvasPriceVersion,
  publishConfirmedCanvasPriceChange,
  publishConfirmedCanvasInitialPrice,
  publishConfirmedCanvasPointIssuanceRate,
  publishConfirmedCanvasPriceGroup,
  publishConfirmedCanvasTaskPolicySettings,
  publishCanvasPointIssuanceRate,
  publishCanvasModelCatalogBundle,
  publishCanvasModelPresentation,
  redeemCanvasRechargeCode,
} from '../api'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('@/lib/api', () => ({ api: mocks }))

describe('Canvas Cloud API boundary', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.post.mockReset()
  })

  it('keeps Canvas customer and administrator reads under the isolated proxy prefix', async () => {
    mocks.get.mockResolvedValue({
      data: { wallet: {}, rechargeOrders: [], tasks: [], ledger: [] },
    })
    await getCanvasCustomerWorkspace()
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/customer/workspace'
    )
    mocks.get.mockResolvedValue({
      data: { channels: [], prices: [], refunds: [], reconciliationTasks: [] },
    })
    await getCanvasAdminWorkspace()
    expect(mocks.get).toHaveBeenCalledWith('/canvas-api/v1/web/admin/workspace')
  })

  it('reads filtered Cloud audit facts without a mutation or mode parameter', async () => {
    mocks.get.mockResolvedValue({
      data: { page: 1, pageSize: 50, total: 0, items: [] },
    })
    const query = {
      page: 1 as const,
      pageSize: 50 as const,
      outcome: 'FAILURE' as const,
      action: 'task.execution',
      resourceId: '85000000-0000-7000-8000-000000000002',
    }
    await getCanvasAuditEvents(query)
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/audit-events',
      { params: query }
    )
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('uses protected administrator routes for testing models and initial pricing', async () => {
    mocks.get.mockResolvedValue({ data: [] })
    await getCanvasAdminTestingModels()
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/testing-models'
    )

    const input = {
      customerModelId: 'model-id',
      priceGroupId: 'group-id',
      parameterCombinationId: 'combination-id',
      points: '20',
      targetMarginRate: '0.4',
      successProbability: '0.9',
      successfulTaskCostRmb: '0.16',
      failedUnrecoverableCostRmb: '0.18',
      otherVariableCostRmb: '0',
      riskBufferRmb: '0.02',
    }
    mocks.post.mockResolvedValue({ data: { status: 'PUBLISHED' } })
    await publishConfirmedCanvasInitialPrice(input)
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/price-versions/initial-publications',
      { ...input, confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('uses the confirmed administrator Bundle planning and publication routes', async () => {
    const bundle = {
      schemaVersion: 2 as const,
      bundleId: 'catalog',
      bundleVersion: '1',
      providers: [],
      channels: [],
      models: [],
      openapiContracts: [],
      adapterProfiles: [],
    }
    mocks.post.mockResolvedValue({ data: { blocking: false, changes: [] } })
    await planCanvasModelCatalogBundle(bundle)
    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
      '/canvas-api/v1/web/admin/model-catalog-bundles/plan',
      bundle,
      expect.objectContaining({ skipErrorHandler: true })
    )
    await publishCanvasModelCatalogBundle(bundle)
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      '/canvas-api/v1/web/admin/model-catalog-bundles/publications',
      { confirmed: true, bundle },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('publishes model presentation separately from Bundle definitions', async () => {
    mocks.post.mockResolvedValue({ data: { status: 'PUBLISHED' } })
    const input = {
      modelKey: 'canvas.image.test',
      displayName: '测试模型',
      description: '客户端说明',
      enabled: false,
    }
    await publishCanvasModelPresentation(input)
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/model-presentations/publications',
      { ...input, confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('sends publication through the role-authenticated Web route with an idempotency key', async () => {
    mocks.post.mockResolvedValue({ data: { status: 'PUBLISHED' } })
    await publishCanvasPriceVersion('price-version-id')
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/price-versions/price-version-id/publish',
      undefined,
      { headers: { 'Idempotency-Key': expect.stringMatching(/^web-price-/) } }
    )
  })

  it('keeps price draft creation and PLATFORM_ADMIN approval on distinct protected calls', async () => {
    mocks.post.mockResolvedValue({ data: { status: 'DRAFT' } })
    const input = {
      sourcePriceVersionId: 'published-price-id',
      points: '20',
      targetMarginRate: '0.4',
      successProbability: '0.9',
      successfulTaskCostRmb: '0.16',
      failedUnrecoverableCostRmb: '0.18',
      otherVariableCostRmb: '0',
      riskBufferRmb: '0.02',
    }
    await createCanvasPriceDraft(input)
    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
      '/canvas-api/v1/web/admin/price-versions/drafts',
      input,
      {
        headers: {
          'Idempotency-Key': expect.stringMatching(/^web-price-draft-/),
        },
        skipErrorHandler: true,
      }
    )

    mocks.post.mockResolvedValue({ data: { status: 'APPROVED' } })
    await approveCanvasPriceDraft('draft-price-id', 'Reviewed frozen formula')
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      '/canvas-api/v1/web/admin/price-versions/draft-price-id/approve',
      { reason: 'Reviewed frozen formula' },
      {
        headers: {
          'Idempotency-Key': expect.stringMatching(/^web-price-approve-/),
        },
        skipErrorHandler: true,
      }
    )
  })

  it('uses confirmed publication routes for the single-administrator pricing workflow', async () => {
    mocks.post.mockResolvedValue({ data: { status: 'PUBLISHED' } })
    const price = {
      sourcePriceVersionId: 'published-price-id',
      points: '20',
      targetMarginRate: '0.250000',
      successProbability: '0.9',
      successfulTaskCostRmb: '0.16',
      failedUnrecoverableCostRmb: '0.18',
      otherVariableCostRmb: '0',
      riskBufferRmb: '0.02',
    }
    await publishConfirmedCanvasPriceChange(price)
    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
      '/canvas-api/v1/web/admin/price-versions/publications',
      { ...price, confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
    await publishConfirmedCanvasPointIssuanceRate({ pointsPerRmb: '60' })
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      '/canvas-api/v1/web/admin/point-issuance-rates/publications',
      { pointsPerRmb: '60', confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
    await publishConfirmedCanvasPriceGroup({ internalName: '测试客户' })
    expect(mocks.post).toHaveBeenNthCalledWith(
      3,
      '/canvas-api/v1/web/admin/price-groups/publications',
      { internalName: '测试客户', confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('reads and publishes administrator task policy settings', async () => {
    mocks.get.mockResolvedValue({
      data: { quoteTtlSeconds: 300, bonusFailureGraceDays: 7 },
    })
    mocks.post.mockResolvedValue({
      data: { quoteTtlSeconds: 600, bonusFailureGraceDays: 14 },
    })

    await getCanvasTaskPolicySettings()
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/task-policy-settings'
    )

    await publishConfirmedCanvasTaskPolicySettings({
      quoteTtlSeconds: 600,
      bonusFailureGraceDays: 14,
    })
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/task-policy-settings/publications',
      { quoteTtlSeconds: 600, bonusFailureGraceDays: 14, confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('sends the future timestamp and protects scheduled cancellation', async () => {
    mocks.post.mockResolvedValue({ data: { status: 'APPROVED' } })
    const effectiveAt = '2026-08-29T00:00:00.000Z'
    await publishConfirmedCanvasPriceChange({
      sourcePriceVersionId: 'published-price-id',
      points: '20',
      targetMarginRate: '0.25',
      successProbability: '0.9',
      successfulTaskCostRmb: '0.16',
      failedUnrecoverableCostRmb: '0.18',
      otherVariableCostRmb: '0',
      riskBufferRmb: '0.02',
      effectiveAt,
    })
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/price-versions/publications',
      expect.objectContaining({ effectiveAt, confirmed: true }),
      expect.objectContaining({ skipErrorHandler: true })
    )
    await cancelScheduledCanvasPrice('scheduled-price-id')
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/price-versions/scheduled-price-id/cancel-schedule',
      { confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('keeps limited-time specials on confirmed administrator-only routes', async () => {
    mocks.post.mockResolvedValue({ data: { status: 'APPROVED' } })
    const input = {
      sourcePriceVersionId: 'published-price-id',
      specialPoints: '15',
      startsAt: '2026-08-29T00:00:00.000Z',
      endsAt: '2026-08-30T00:00:00.000Z',
      campaignBudgetMinor: '10000',
      maxParticipants: '100',
      approvalReason: 'Approved launch promotion',
    }
    await createCanvasLimitedPricePromotion(input)
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/limited-price-promotions',
      { ...input, confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
    await cancelCanvasLimitedPricePromotion('promotion-version-id')
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/limited-price-promotions/promotion-version-id/cancel',
      { confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('keeps issuance-rate reads and controlled transitions on dedicated Web routes', async () => {
    mocks.get.mockResolvedValue({ data: [] })
    await getCanvasPointIssuanceRates()
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/point-issuance-rates'
    )
    const input = {
      pointsPerRmb: '60',
    }
    mocks.post.mockResolvedValue({ data: { status: 'DRAFT' } })
    await createCanvasPointIssuanceRateDraft(input)
    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
      '/canvas-api/v1/web/admin/point-issuance-rates/drafts',
      input,
      expect.objectContaining({ skipErrorHandler: true })
    )
    await approveCanvasPointIssuanceRate('rate-v2', 'Reviewed and approved')
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      '/canvas-api/v1/web/admin/point-issuance-rates/rate-v2/approve',
      { reason: 'Reviewed and approved' },
      expect.objectContaining({ skipErrorHandler: true })
    )
    await publishCanvasPointIssuanceRate('rate-v2')
    expect(mocks.post).toHaveBeenNthCalledWith(
      3,
      '/canvas-api/v1/web/admin/point-issuance-rates/rate-v2/publish',
      undefined,
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('keeps PriceGroup reads and governed transitions on dedicated Web routes', async () => {
    mocks.get.mockResolvedValue({ data: [] })
    await getCanvasPriceGroups()
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/price-groups'
    )
    mocks.post.mockResolvedValue({ data: { status: 'DRAFT' } })
    await createCanvasPriceGroupDraft({
      internalName: '测试客户',
    })
    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
      '/canvas-api/v1/web/admin/price-groups/drafts',
      { internalName: '测试客户' },
      expect.objectContaining({ skipErrorHandler: true })
    )
    await approveCanvasPriceGroup('group-v1', 'Reviewed and approved')
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      '/canvas-api/v1/web/admin/price-groups/group-v1/approve',
      { reason: 'Reviewed and approved' },
      expect.objectContaining({ skipErrorHandler: true })
    )
    await publishCanvasPriceGroup('group-v1')
    expect(mocks.post).toHaveBeenNthCalledWith(
      3,
      '/canvas-api/v1/web/admin/price-groups/group-v1/publish',
      undefined,
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('uses one Canvas endpoint for administrator code inventory and issuance', async () => {
    mocks.get.mockResolvedValue({
      data: { items: [], total: 0, page: 1, pageSize: 20 },
    })
    await getCanvasAdminRechargeCodes({
      page: 1,
      pageSize: 20,
      search: 'CANVAS-ABCDEFGHIJKLMNOPQRSTUVWX',
      status: 'ACTIVE',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/recharge-codes',
      {
        params: {
          page: 1,
          pageSize: 20,
          search: undefined,
          status: 'ACTIVE',
          sortBy: 'createdAt',
          sortOrder: 'desc',
          codePrefix: 'CANVAS-A',
          codeSuffix: 'UVWX',
        },
      }
    )

    mocks.post.mockResolvedValue({
      data: { created: true, codes: [], items: [] },
    })
    await issueCanvasAdminRechargeCodes({
      name: 'CNY 10',
      amountMinor: '1000',
      count: 1,
    })
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/recharge-codes',
      { name: 'CNY 10', amountMinor: '1000', count: 1 },
      {
        headers: {
          'Idempotency-Key': expect.stringMatching(/^web-issue-code-/),
        },
        skipErrorHandler: true,
      }
    )

    mocks.post.mockResolvedValue({ data: { redeemed: true } })
    await redeemCanvasRechargeCode('CANVAS-TEST-CODE')
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/recharge-code-redemptions',
      { code: 'CANVAS-TEST-CODE' },
      {
        headers: {
          'Idempotency-Key': expect.stringMatching(/^web-redeem-/),
        },
        skipErrorHandler: true,
      }
    )
  })

  it('uses protected Canvas endpoints for invite activation and lifecycle management', async () => {
    mocks.get.mockResolvedValue({ data: [] })
    await getCanvasAdminInviteCodes()
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/invite-codes'
    )
    mocks.get.mockResolvedValue({ data: { priceGroups: [], promotions: [] } })
    await getCanvasInviteCodeOptions()
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/invite-code-options'
    )

    mocks.post.mockResolvedValue({ data: { item: {}, code: 'CANVAS-TEST' } })
    const input = {
      maxRegistrations: '10',
      validFrom: '2026-08-29T00:00:00.000Z',
      expiresAt: '2026-09-29T00:00:00.000Z',
      priceGroupId: 'group-v1',
      initialBonusPoints: '500',
      initialBonusTtlDays: 30,
      promotionVersionId: null,
      referralSource: 'launch',
    }
    await createCanvasAdminInviteCode(input)
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/invite-codes',
      { ...input, confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
    await changeCanvasAdminInviteCodeStatus('invite-v1', 'pause')
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/invite-codes/invite-v1/pause',
      { confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
    await activateCanvasInvite('CANVAS-TEST')
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/invite-registration',
      { code: 'CANVAS-TEST' },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('reuses only safe administrator-configured purchase links', async () => {
    mocks.get.mockResolvedValue({
      data: {
        success: true,
        data: { topup_link: 'https://shop.example.com/canvas-codes' },
      },
    })

    await expect(getCanvasRechargePurchaseLink()).resolves.toBe(
      'https://shop.example.com/canvas-codes'
    )
    expect(mocks.get).toHaveBeenCalledWith('/api/user/topup/info')
    expect(normalizeCanvasRechargePurchaseLink('/store/canvas')).toBe(
      '/store/canvas'
    )
    expect(
      normalizeCanvasRechargePurchaseLink('javascript:alert(1)')
    ).toBeNull()
    expect(
      normalizeCanvasRechargePurchaseLink('//untrusted.example.com')
    ).toBeNull()
  })
})

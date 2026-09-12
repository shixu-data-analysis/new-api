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
  exportCanvasAdminInviteCodes,
  getCanvasInviteCodeOptions,
  getCanvasAdminWorkspace,
  getCanvasAuditEvents,
  getCanvasAdminTestingModels,
  getCanvasCustomerWorkspace,
  getCanvasSession,
  getCanvasPointIssuanceRates,
  getCanvasTaskPolicySettings,
  getCanvasRechargePurchaseLink,
  issueCanvasAdminRechargeCodes,
  isCanvasInviteRegistrationRequired,
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
  publishCanvasExecutionTargetPresentation,
  getCanvasModelMonitoring,
  getCanvasModelMonitoringControls,
  getCanvasModelMonitoringTargets,
  controlCanvasModelMonitoring,
  redeemCanvasRechargeCode,
  getCanvasAgents,
  getCanvasAgentWorkspace,
  getCanvasAgentInviteCodes,
  getCanvasAgentCustomers,
  getCanvasProviderPricingMatrix,
  provisionCanvasAgent,
  publishCanvasProviderRate,
  resolveCanvasProviderRateRisk,
  revealCanvasCode,
  deductCanvasPointLot,
  getCanvasAdminCustomerPointLots,
  getCanvasAdminCustomerPointLedger,
  getCanvasAdminCustomerTasks,
  getCanvasAdminTaskLogs,
  getCanvasAdminTaskRecord,
  getCanvasAdminRechargeOrders,
  getCanvasOrderPointReturns,
  getCanvasTaskLogOptions,
  getCanvasTaskPointLedger,
  getCanvasTaskPointLedgerDetail,
  grantCanvasManualBonus,
  grantCanvasPaidCorrection,
  previewCanvasOrderPointReturn,
  createCanvasOrderPointReturn,
} from '../api'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))

vi.mock('@/lib/api', () => ({ api: mocks }))

describe('Canvas Cloud API boundary', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.post.mockReset()
  })

  it('keeps invite registration pending inside the Canvas activation flow', async () => {
    mocks.get.mockResolvedValue({ data: { principalType: 'CUSTOMER' } })
    await getCanvasSession()
    expect(mocks.get).toHaveBeenCalledWith('/canvas-api/v1/web/session', {
      skipErrorHandler: true,
    })

    expect(
      isCanvasInviteRegistrationRequired({
        response: {
          status: 403,
          data: { code: 'INVITE_REGISTRATION_REQUIRED' },
        },
      })
    ).toBe(true)
    expect(
      isCanvasInviteRegistrationRequired({
        response: { status: 403, data: { code: 'UNAUTHORIZED' } },
      })
    ).toBe(false)
    expect(
      isCanvasInviteRegistrationRequired({
        response: {
          status: 401,
          data: { code: 'INVITE_REGISTRATION_REQUIRED' },
        },
      })
    ).toBe(false)
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

  it('keeps point-return calculation server-owned and routes governed Lot adjustments', async () => {
    mocks.get.mockResolvedValue({ data: { items: [] } })
    await getCanvasAdminRechargeOrders({
      orderNumber: 'CANVAS-001',
      customerId: 'customer-id',
      status: 'CODE_ACTIVATED',
      timeField: 'redeemedAt',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.000Z',
      sortBy: 'redeemedAt',
      sortOrder: 'desc',
    })
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/recharge-orders',
      {
        params: {
          page: 1,
          pageSize: 20,
          orderNumber: 'CANVAS-001',
          customerId: 'customer-id',
          status: 'CODE_ACTIVATED',
          timeField: 'redeemedAt',
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-30T23:59:59.000Z',
          sortBy: 'redeemedAt',
          sortOrder: 'desc',
        },
      }
    )
    await getCanvasAdminCustomerPointLots('customer-id')
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/customers/customer-id/point-lots',
      { params: { page: 1, pageSize: 20 } }
    )
    await getCanvasAdminCustomerPointLedger('customer-id', {
      eventType: 'CONSUME',
    })
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/customers/customer-id/point-ledger',
      {
        params: { page: 1, pageSize: 20, eventType: 'CONSUME' },
        signal: undefined,
      }
    )
    await getCanvasAdminCustomerTasks('customer-id', {
      model: 'image',
      sortBy: 'settledPoints',
    })
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/customers/customer-id/tasks',
      {
        params: {
          page: 1,
          pageSize: 20,
          model: 'image',
          sortBy: 'settledPoints',
        },
        signal: undefined,
      }
    )
    const logQuery = {
      page: 2,
      pageSize: 20 as const,
      customer: 'uatcustomer',
      modelId: 'model-id',
      sortBy: 'acceptedAt' as const,
      sortOrder: 'desc' as const,
    }
    await getCanvasAdminTaskLogs(logQuery)
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/task-logs',
      { params: logQuery, signal: undefined }
    )
    await getCanvasTaskLogOptions()
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/task-log-options',
      { signal: undefined }
    )
    await getCanvasAdminTaskRecord('task-id')
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/tasks/task-id',
      { signal: undefined, skipErrorHandler: true }
    )
    await getCanvasTaskPointLedger('task-id', {
      changeType: 'SETTLE',
      lotType: 'PAID',
      page: 1,
      pageSize: 20,
    })
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/tasks/task-id/point-ledger',
      {
        params: {
          changeType: 'SETTLE',
          lotType: 'PAID',
          page: 1,
          pageSize: 20,
        },
        signal: undefined,
        skipErrorHandler: true,
      }
    )
    await getCanvasTaskPointLedgerDetail('task-id', 'ledger-id')
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/tasks/task-id/point-ledger/ledger-id',
      { signal: undefined, skipErrorHandler: true }
    )

    await getCanvasOrderPointReturns('customer-id', 'order-id', {
      operator: 'Canvas Admin',
      reason: 'offline refund',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.000Z',
      sortOrder: 'asc',
    })
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/customers/customer-id/recharge-orders/order-id/point-returns',
      {
        params: {
          page: 1,
          pageSize: 20,
          operator: 'Canvas Admin',
          reason: 'offline refund',
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-30T23:59:59.000Z',
          sortOrder: 'asc',
        },
        signal: undefined,
      }
    )

    mocks.post.mockResolvedValue({ data: { id: 'point-return' } })
    await previewCanvasOrderPointReturn({
      rechargeOrderId: 'order-id',
      points: '10',
    })
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/point-returns/preview',
      { rechargeOrderId: 'order-id', points: '10' },
      { skipErrorHandler: true }
    )
    const returnInput = {
      rechargeOrderId: 'order-id',
      points: '10',
      reason: 'offline refund reference',
      expectedAvailablePaidPoints: '100',
      expectedCumulativeReturnedPoints: '0',
      expectedReferenceAmountMinor: '20',
    }
    await createCanvasOrderPointReturn(returnInput, 'point-return-request')
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/point-returns',
      { ...returnInput, confirmed: true },
      {
        headers: { 'Idempotency-Key': 'point-return-request' },
        skipErrorHandler: true,
      }
    )
    expect(JSON.stringify(mocks.post.mock.calls.at(-1))).not.toContain(
      'confirmedRefundAmountMinor'
    )

    await grantCanvasManualBonus({
      customerId: 'customer-id',
      points: '10',
      expiresAt: '2026-12-01T00:00:00.000Z',
      reason: 'gift',
    })
    await grantCanvasPaidCorrection({
      rechargeOrderId: 'order-id',
      points: '10',
      reason: 'correction',
    })
    await deductCanvasPointLot({
      pointLotId: 'lot-id',
      points: '10',
      reason: 'deduction',
    })
    expect(mocks.post.mock.calls.slice(-3).map((call) => call[0])).toEqual([
      '/canvas-api/v1/web/admin/point-adjustments/manual-bonus',
      '/canvas-api/v1/web/admin/point-adjustments/paid-corrections',
      '/canvas-api/v1/web/admin/point-adjustments/deductions',
    ])
    for (const call of mocks.post.mock.calls.slice(-3)) {
      expect(call[1]).toMatchObject({ confirmed: true })
    }
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
    mocks.get.mockResolvedValue({
      data: [
        {
          executionTargets: [
            {
              providerEnabled: true,
              channelEnabled: true,
              effectiveEnabled: true,
            },
          ],
        },
      ],
    })
    const models = await getCanvasAdminTestingModels()
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/testing-models'
    )
    expect(models[0].executionTargets[0]).toMatchObject({
      providerEnabled: true,
      channelEnabled: true,
      effectiveEnabled: true,
    })

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
    }
    await publishCanvasModelPresentation(input)
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/model-presentations/publications',
      { ...input, confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('keeps execution-target monitoring and display updates target-scoped', async () => {
    mocks.get.mockResolvedValue({ data: {} })
    mocks.post.mockResolvedValue({ data: { status: 'PUBLISHED' } })
    const targetId = '85000000-0000-7000-8000-000000000002'
    const modelId = '85000000-0000-7000-8000-000000000001'

    await getCanvasModelMonitoringTargets(modelId)
    await getCanvasModelMonitoring(modelId, targetId, {
      window: 'day',
      origin: 'REAL',
    })
    await getCanvasModelMonitoringControls(modelId, targetId, {
      page: 1,
      pageSize: 20,
      sortBy: 'occurredAt',
      sortOrder: 'desc',
    })
    await controlCanvasModelMonitoring(modelId, targetId, {
      enabled: false,
      expectedVersion: 4,
      reasonCode: 'OTHER',
      note: 'target review',
      confirmed: true,
    })
    await publishCanvasExecutionTargetPresentation({
      executionTargetId: targetId,
      enabled: false,
      expectedVersion: 3,
    })

    expect(mocks.get).toHaveBeenNthCalledWith(
      1,
      `/canvas-api/v1/web/admin/model-monitoring/models/${modelId}/targets`,
      expect.objectContaining({ skipErrorHandler: true })
    )
    expect(mocks.get).toHaveBeenNthCalledWith(
      2,
      `/canvas-api/v1/web/admin/models/${modelId}/monitoring/targets/${targetId}`,
      expect.objectContaining({ params: { window: 'day', origin: 'REAL' } })
    )
    expect(mocks.get).toHaveBeenNthCalledWith(
      3,
      `/canvas-api/v1/web/admin/models/${modelId}/monitoring/targets/${targetId}/controls`,
      expect.objectContaining({
        params: {
          page: 1,
          pageSize: 20,
          sortBy: 'occurredAt',
          sortOrder: 'desc',
        },
      })
    )
    expect(mocks.post).toHaveBeenNthCalledWith(
      1,
      `/canvas-api/v1/web/admin/models/${modelId}/monitoring/targets/${targetId}/control`,
      {
        enabled: false,
        expectedVersion: 4,
        reasonCode: 'OTHER',
        note: 'target review',
        confirmed: true,
      },
      expect.objectContaining({ skipErrorHandler: true })
    )
    expect(mocks.post).toHaveBeenNthCalledWith(
      2,
      `/canvas-api/v1/web/admin/model-execution-targets/${targetId}/presentation`,
      { enabled: false, expectedVersion: 3, confirmed: true },
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
      data: {
        quoteTtlSeconds: 300,
        bonusFailureGraceDays: 7,
        paidExpiryDays: 90,
      },
    })
    mocks.post.mockResolvedValue({
      data: {
        quoteTtlSeconds: 600,
        bonusFailureGraceDays: 14,
        paidExpiryDays: 120,
      },
    })

    await getCanvasTaskPolicySettings()
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/task-policy-settings'
    )

    await publishConfirmedCanvasTaskPolicySettings({
      quoteTtlSeconds: 600,
      bonusFailureGraceDays: 14,
      paidExpiryDays: 120,
    })
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/task-policy-settings/publications',
      {
        quoteTtlSeconds: 600,
        bonusFailureGraceDays: 14,
        paidExpiryDays: 120,
        confirmed: true,
      },
      expect.objectContaining({ skipErrorHandler: true })
    )
  })

  it('posts only the reviewed policy field with confirmation and idempotency', async () => {
    mocks.post.mockResolvedValue({ data: {} })
    await publishConfirmedCanvasTaskPolicySettings({ paidExpiryDays: 120 })
    expect(mocks.post).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/task-policy-settings/publications',
      { paidExpiryDays: 120, confirmed: true },
      expect.objectContaining({
        headers: { 'Idempotency-Key': expect.any(String) },
        skipErrorHandler: true,
      })
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
      code: 'CANVAS-ABCDEFGHIJKLMNOPQRSTUVWX',
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
          code: undefined,
          status: 'ACTIVE',
          sortBy: 'createdAt',
          sortOrder: 'desc',
          codePrefix: 'CANVAS-A',
          codeSuffix: 'UVWX',
        },
        signal: undefined,
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
    const inviteQuery = {
      page: 2,
      pageSize: 20 as const,
      inviter: 'partner',
      status: 'ACTIVE' as const,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
      inviterPrincipalId: '11111111-1111-4111-8111-111111111111',
    }
    await getCanvasAdminInviteCodes(inviteQuery)
    expect(mocks.get).toHaveBeenCalledWith(
      '/canvas-api/v1/web/admin/invite-codes',
      { params: inviteQuery, signal: undefined }
    )
    await exportCanvasAdminInviteCodes({
      code: 'CANVAS-A',
      inviterPrincipalId: '11111111-1111-4111-8111-111111111111',
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/invite-codes/export',
      {
        params: {
          code: 'CANVAS-A',
          inviterPrincipalId: '11111111-1111-4111-8111-111111111111',
          sortBy: 'createdAt',
          sortOrder: 'desc',
        },
        responseType: 'blob',
      }
    )
    mocks.get.mockResolvedValue({
      data: { agents: [], priceGroups: [], promotions: [] },
    })
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
      referralPrincipalId: null,
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

  it('never degrades an incomplete recharge-code lookup into an inventory request', async () => {
    await expect(
      getCanvasAdminRechargeCodes({
        page: 1,
        pageSize: 20,
        code: 'CANVAS-TOO-SHORT',
        sortBy: 'createdAt',
        sortOrder: 'desc',
      })
    ).rejects.toThrow('Invalid recharge-code inventory search')
    expect(mocks.get).not.toHaveBeenCalled()
  })

  it('uses explicit role-scoped Agent and provider-rate endpoints', async () => {
    mocks.get.mockResolvedValue({ data: [] })
    const agentQuery = {
      page: 1,
      pageSize: 20 as const,
      search: 'tester',
      status: 'ACTIVE' as const,
      sortBy: 'username' as const,
      sortOrder: 'asc' as const,
      principalId: '22222222-2222-4222-8222-222222222222',
    }
    await getCanvasAgents(agentQuery)
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/agents',
      { params: agentQuery, signal: undefined }
    )
    await getCanvasAgentWorkspace()
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/agent/workspace'
    )
    const agentInviteQuery = {
      page: 1,
      pageSize: 20 as const,
      search: 'CANVAS-A',
      status: 'ACTIVE' as const,
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
    }
    await getCanvasAgentInviteCodes(agentInviteQuery)
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/agent/invite-codes',
      { params: agentInviteQuery, signal: undefined }
    )
    const agentCustomerQuery = {
      page: 1,
      pageSize: 20 as const,
      username: 'customer',
      status: 'ACTIVE' as const,
      sortBy: 'activatedAt' as const,
      sortOrder: 'desc' as const,
    }
    await getCanvasAgentCustomers(agentCustomerQuery)
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/agent/customers',
      { params: agentCustomerQuery, signal: undefined }
    )
    await getCanvasProviderPricingMatrix()
    expect(mocks.get).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/provider-pricing-matrix'
    )

    mocks.post.mockResolvedValue({ data: {} })
    await provisionCanvasAgent({
      username: 'canvas-user',
      status: 'ACTIVE',
      reason: 'Approved customer inviter',
    })
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/agents',
      expect.objectContaining({ confirmed: true }),
      expect.objectContaining({ skipErrorHandler: true })
    )
    await revealCanvasCode('agent-invite', 'invite-v1', 'COPY')
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/agent/invite-codes/invite-v1/reveal',
      { action: 'COPY', confirmed: true },
      expect.objectContaining({ skipErrorHandler: true })
    )
    await publishCanvasProviderRate({
      customerModelId: 'model-v1',
      parameterCombinationId: 'quality-4k',
      billingUnit: 'REQUEST',
      nativeAmount: '0.40',
      currency: 'CNY',
      exchangeRateSnapshot: {
        rate: '1',
        source: 'contract',
        asOf: '2026-08-30T00:00:00.000Z',
      },
      normalizedAmountMinor: '0.40',
      failureChargePolicy: { mode: 'NONE' },
      decisionSummary: 'Approved contract update',
    })
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/provider-rate-versions/publications',
      expect.objectContaining({ billingUnit: 'REQUEST', confirmed: true }),
      expect.objectContaining({ skipErrorHandler: true })
    )
    await resolveCanvasProviderRateRisk({
      providerRateVersionId: 'rate-v1',
      decisionType: 'TEMPORARY_LOSS',
      lossEndsAt: '2026-09-01T00:00:00.000Z',
      maxExpectedLossPoints: '100',
      reason: 'Approved transition loss',
    })
    expect(mocks.post).toHaveBeenLastCalledWith(
      '/canvas-api/v1/web/admin/provider-rate-risk-decisions',
      expect.objectContaining({
        confirmed: true,
        decisionType: 'TEMPORARY_LOSS',
      }),
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

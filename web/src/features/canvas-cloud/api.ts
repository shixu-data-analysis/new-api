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
import { api } from '@/lib/api'

import type {
  CanvasAdminWorkspace,
  CanvasAuditEventPage,
  CanvasAuditEventQuery,
  CanvasAdminTestingModel,
  CanvasAdminRechargeCodePage,
  CanvasAdminRechargeCodeQuery,
  CanvasCatalogModel,
  CanvasContributionReport,
  CanvasCustomerWorkspace,
  CanvasSession,
  CanvasIssuedRechargeCodes,
  CanvasModelCatalogBundle,
  CanvasModelCatalogPlan,
} from './types'

const webBase = '/canvas-api/v1/web'

interface TopupLinkResponse {
  success?: boolean
  data?: { topup_link?: unknown }
}

export function normalizeCanvasRechargePurchaseLink(
  value: unknown
): string | null {
  if (typeof value !== 'string') return null
  const link = value.trim()
  if (!link) return null

  for (const character of link) {
    const codePoint = character.codePointAt(0)
    if (
      character === '\\' ||
      codePoint === undefined ||
      codePoint <= 0x1f ||
      codePoint === 0x7f
    ) {
      return null
    }
  }
  if (link.startsWith('/') && !link.startsWith('//')) return link

  try {
    const url = new URL(link)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (url.username || url.password) return null
    return link
  } catch {
    return null
  }
}

export async function getCanvasSession(): Promise<CanvasSession> {
  return (await api.get<CanvasSession>(`${webBase}/session`)).data
}

export async function getCanvasCustomerWorkspace(): Promise<CanvasCustomerWorkspace> {
  return (
    await api.get<CanvasCustomerWorkspace>(`${webBase}/customer/workspace`)
  ).data
}

export async function getCanvasCatalog(): Promise<CanvasCatalogModel[]> {
  return (await api.get<CanvasCatalogModel[]>('/canvas-api/v1/catalog')).data
}

export async function getCanvasRechargePurchaseLink(): Promise<string | null> {
  const response = (await api.get<TopupLinkResponse>('/api/user/topup/info'))
    .data
  if (response.success !== true) return null
  return normalizeCanvasRechargePurchaseLink(response.data?.topup_link)
}

export async function getCanvasAdminWorkspace(): Promise<CanvasAdminWorkspace> {
  return (await api.get<CanvasAdminWorkspace>(`${webBase}/admin/workspace`))
    .data
}

export async function getCanvasAuditEvents(
  query: CanvasAuditEventQuery
): Promise<CanvasAuditEventPage> {
  return (
    await api.get<CanvasAuditEventPage>(`${webBase}/admin/audit-events`, {
      params: query,
    })
  ).data
}

export async function getCanvasAdminTestingModels(): Promise<
  CanvasAdminTestingModel[]
> {
  return (
    await api.get<CanvasAdminTestingModel[]>(`${webBase}/admin/testing-models`)
  ).data
}

export async function getCanvasAdminRechargeCodes(
  query: CanvasAdminRechargeCodeQuery
): Promise<CanvasAdminRechargeCodePage> {
  const normalizedSearch = query.search?.trim().toUpperCase()
  let codeSearch: {
    codePrefix?: string
    codeSuffix?: string
    search?: string
  } = {}
  if (normalizedSearch?.startsWith('CANVAS-') && normalizedSearch.length >= 8) {
    codeSearch = { codePrefix: normalizedSearch.slice(0, 8) }
    if (normalizedSearch.length >= 12) {
      codeSearch.codeSuffix = normalizedSearch.slice(-4)
    }
  } else if (query.search?.trim()) {
    codeSearch = { search: query.search.trim() }
  }
  return (
    await api.get<CanvasAdminRechargeCodePage>(
      `${webBase}/admin/recharge-codes`,
      {
        params: { ...query, search: undefined, ...codeSearch },
      }
    )
  ).data
}

export async function issueCanvasAdminRechargeCodes(input: {
  name: string
  amountMinor: string
  count: number
}): Promise<CanvasIssuedRechargeCodes> {
  return (
    await api.post<CanvasIssuedRechargeCodes>(
      `${webBase}/admin/recharge-codes`,
      input,
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-issue-code') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasContributionReport(
  from: string,
  to: string
): Promise<CanvasContributionReport> {
  return (
    await api.get<CanvasContributionReport>(
      `${webBase}/admin/reports/contribution`,
      { params: { from, to } }
    )
  ).data
}

function idempotencyKey(scope: string): string {
  return `${scope}-${crypto.randomUUID()}`
}

export async function planCanvasModelCatalogBundle(
  bundle: CanvasModelCatalogBundle
): Promise<CanvasModelCatalogPlan> {
  return (
    await api.post<CanvasModelCatalogPlan>(
      `${webBase}/admin/model-catalog-bundles/plan`,
      bundle,
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-catalog-plan') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function publishCanvasModelCatalogBundle(
  bundle: CanvasModelCatalogBundle
) {
  return (
    await api.post(
      `${webBase}/admin/model-catalog-bundles/publications`,
      { confirmed: true, bundle },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-catalog-publish') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function publishCanvasModelPresentation(input: {
  modelKey: string
  displayName: string
  description: string
  enabled: boolean
}) {
  return (
    await api.post(
      `${webBase}/admin/model-presentations/publications`,
      { ...input, confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-model-presentation'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function redeemCanvasRechargeCode(code: string) {
  return (
    await api.post(
      '/canvas-api/v1/recharge-code-redemptions',
      { code },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-redeem') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function publishCanvasPriceVersion(priceVersionId: string) {
  return (
    await api.post(
      `${webBase}/admin/price-versions/${priceVersionId}/publish`,
      undefined,
      { headers: { 'Idempotency-Key': idempotencyKey('web-price') } }
    )
  ).data
}

export interface CanvasPriceDraftInput {
  sourcePriceVersionId: string
  points: string
  targetMarginRate: string
  successProbability: string
  successfulTaskCostRmb: string
  failedUnrecoverableCostRmb: string
  otherVariableCostRmb: string
  riskBufferRmb: string
  decisionSummary?: string
  effectiveAt?: string
}

export async function cancelScheduledCanvasPrice(priceVersionId: string) {
  return (
    await api.post(
      `${webBase}/admin/price-versions/${priceVersionId}/cancel-schedule`,
      { confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-price-cancel') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export interface CanvasLimitedPricePromotionInput {
  sourcePriceVersionId: string
  specialPoints: string
  startsAt: string
  endsAt: string
  campaignBudgetMinor?: string
  maxExpectedLossMinor?: string
  maxParticipants?: string
  approvalReason: string
}

export async function createCanvasLimitedPricePromotion(
  input: CanvasLimitedPricePromotionInput
) {
  return (
    await api.post(
      `${webBase}/admin/limited-price-promotions`,
      { ...input, confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-limited-special') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function cancelCanvasLimitedPricePromotion(
  promotionVersionId: string
) {
  return (
    await api.post(
      `${webBase}/admin/limited-price-promotions/${promotionVersionId}/cancel`,
      { confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-limited-special-cancel'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function createCanvasPriceDraft(input: CanvasPriceDraftInput) {
  return (
    await api.post(`${webBase}/admin/price-versions/drafts`, input, {
      headers: { 'Idempotency-Key': idempotencyKey('web-price-draft') },
      skipErrorHandler: true,
    })
  ).data
}

export async function publishConfirmedCanvasPriceChange(
  input: CanvasPriceDraftInput
) {
  return (
    await api.post(
      `${webBase}/admin/price-versions/publications`,
      { ...input, confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-price-confirmed') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function publishConfirmedCanvasInitialPrice(
  input: Omit<CanvasPriceDraftInput, 'sourcePriceVersionId'> & {
    customerModelId: string
    priceGroupId: string
    parameterCombinationId: string
  }
) {
  return (
    await api.post(
      `${webBase}/admin/price-versions/initial-publications`,
      { ...input, confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-initial-price') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function approveCanvasPriceDraft(
  priceVersionId: string,
  reason: string
) {
  return (
    await api.post(
      `${webBase}/admin/price-versions/${priceVersionId}/approve`,
      { reason },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-price-approve') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasPointIssuanceRates() {
  return (
    await api.get<import('./types').CanvasPointIssuanceRateVersion[]>(
      `${webBase}/admin/point-issuance-rates`
    )
  ).data
}

export async function getCanvasTaskPolicySettings() {
  return (
    await api.get<import('./types').CanvasTaskPolicySettings>(
      `${webBase}/admin/task-policy-settings`
    )
  ).data
}

export async function publishConfirmedCanvasTaskPolicySettings(input: {
  quoteTtlSeconds: number
  bonusFailureGraceDays: number
}) {
  return (
    await api.post<import('./types').CanvasTaskPolicySettings>(
      `${webBase}/admin/task-policy-settings/publications`,
      { ...input, confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-task-policy') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function createCanvasPointIssuanceRateDraft(input: {
  pointsPerRmb: string
  decisionSummary?: string
}) {
  return (
    await api.post(`${webBase}/admin/point-issuance-rates/drafts`, input, {
      headers: { 'Idempotency-Key': idempotencyKey('web-rate-draft') },
      skipErrorHandler: true,
    })
  ).data
}

export async function publishConfirmedCanvasPointIssuanceRate(input: {
  pointsPerRmb: string
  decisionSummary?: string
}) {
  return (
    await api.post(
      `${webBase}/admin/point-issuance-rates/publications`,
      { ...input, confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-rate-confirmed') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function approveCanvasPointIssuanceRate(
  rateId: string,
  reason: string
) {
  return (
    await api.post(
      `${webBase}/admin/point-issuance-rates/${rateId}/approve`,
      { reason },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-rate-approve') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function publishCanvasPointIssuanceRate(rateId: string) {
  return (
    await api.post(
      `${webBase}/admin/point-issuance-rates/${rateId}/publish`,
      undefined,
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-rate-publish') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasPriceGroups() {
  return (
    await api.get<import('./types').CanvasPriceGroupVersion[]>(
      `${webBase}/admin/price-groups`
    )
  ).data
}

export async function createCanvasPriceGroupDraft(input: {
  internalName: string
}) {
  return (
    await api.post(`${webBase}/admin/price-groups/drafts`, input, {
      headers: { 'Idempotency-Key': idempotencyKey('web-price-group-draft') },
      skipErrorHandler: true,
    })
  ).data
}

export async function publishConfirmedCanvasPriceGroup(input: {
  internalName: string
}) {
  return (
    await api.post(
      `${webBase}/admin/price-groups/publications`,
      { ...input, confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-price-group-confirmed'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function approveCanvasPriceGroup(
  priceGroupId: string,
  reason: string
) {
  return (
    await api.post(
      `${webBase}/admin/price-groups/${priceGroupId}/approve`,
      { reason },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-price-group-approve'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function publishCanvasPriceGroup(priceGroupId: string) {
  return (
    await api.post(
      `${webBase}/admin/price-groups/${priceGroupId}/publish`,
      undefined,
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-price-group-publish'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function reconcileCanvasTask(
  taskId: string,
  status: 'RECONCILED' | 'DISPUTED',
  reason: string
) {
  return (
    await api.post(
      `${webBase}/admin/tasks/${taskId}/reconciliation`,
      { status, reason },
      { headers: { 'Idempotency-Key': idempotencyKey('web-reconcile') } }
    )
  ).data
}

export async function createCanvasRefund(input: {
  rechargeOrderId: string
  cashAmountMinor: string
  pointsRequested: string
  reason: string
}) {
  return (
    await api.post(
      `${webBase}/admin/refunds`,
      { ...input, refundReference: `web-${crypto.randomUUID()}` },
      { headers: { 'Idempotency-Key': idempotencyKey('web-refund') } }
    )
  ).data
}

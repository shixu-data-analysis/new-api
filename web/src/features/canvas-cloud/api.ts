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
  CanvasCatalogModel,
  CanvasContributionReport,
  CanvasCustomerWorkspace,
  CanvasModelReleaseManifest,
  CanvasModelReleasePlan,
  CanvasModelReleaseResult,
  CanvasModelReleaseSummary,
  CanvasRechargeOffer,
  CanvasSession,
} from './types'

const webBase = '/canvas-api/v1/web'

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

export async function getCanvasRechargeOffers(): Promise<
  CanvasRechargeOffer[]
> {
  return (
    await api.get<CanvasRechargeOffer[]>('/canvas-api/v1/recharge-offers')
  ).data
}

export async function getCanvasAdminWorkspace(): Promise<CanvasAdminWorkspace> {
  return (await api.get<CanvasAdminWorkspace>(`${webBase}/admin/workspace`))
    .data
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

export async function createCanvasRechargeOrder(offerVersionId: string) {
  return (
    await api.post(
      '/canvas-api/v1/recharge-orders',
      { offerVersionId },
      { headers: { 'Idempotency-Key': idempotencyKey('web-order') } }
    )
  ).data
}

export async function redeemCanvasRechargeCode(code: string) {
  return (
    await api.post(
      '/canvas-api/v1/recharge-code-redemptions',
      { code },
      { headers: { 'Idempotency-Key': idempotencyKey('web-redeem') } }
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

export async function getCanvasModelReleases(): Promise<
  CanvasModelReleaseSummary[]
> {
  return (
    await api.get<CanvasModelReleaseSummary[]>(
      `${webBase}/admin/model-releases`
    )
  ).data
}

function modelReleasePost<T>(
  path: string,
  manifest: CanvasModelReleaseManifest
) {
  return api.post<T>(`${webBase}/admin/model-releases${path}`, manifest, {
    headers: { 'Idempotency-Key': idempotencyKey('web-model-release') },
  })
}

export async function planCanvasModelRelease(
  manifest: CanvasModelReleaseManifest
): Promise<CanvasModelReleasePlan> {
  return (await modelReleasePost<CanvasModelReleasePlan>('/plan', manifest))
    .data
}

export async function createCanvasModelReleaseDraft(
  manifest: CanvasModelReleaseManifest
): Promise<CanvasModelReleaseResult> {
  return (await modelReleasePost<CanvasModelReleaseResult>('/drafts', manifest))
    .data
}

export async function approveCanvasModelRelease(
  manifest: CanvasModelReleaseManifest
): Promise<CanvasModelReleaseResult> {
  return (
    await modelReleasePost<CanvasModelReleaseResult>(
      `/${encodeURIComponent(manifest.changeId)}/approve`,
      manifest
    )
  ).data
}

export async function publishCanvasModelRelease(
  manifest: CanvasModelReleaseManifest
): Promise<CanvasModelReleaseResult> {
  return (
    await modelReleasePost<CanvasModelReleaseResult>(
      `/${encodeURIComponent(manifest.changeId)}/publish`,
      manifest
    )
  ).data
}

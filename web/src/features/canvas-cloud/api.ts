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
  CanvasAdminModelTag,
  CanvasAdminRechargeCodePage,
  CanvasAdminRechargeCodeBatchItems,
  CanvasAdminRechargeCodeBatchItem,
  CanvasAdminRechargeCodeExactSearch,
  CanvasAdminRechargeCodeExactSearchPage,
  CanvasAdminRechargeCodeQuery,
  CanvasCatalogModel,
  CanvasContributionReport,
  CanvasCustomerWorkspace,
  CanvasSession,
  CanvasIssuedRechargeCodes,
  CanvasAdminInviteCode,
  CanvasAdminInviteCodePage,
  CanvasAdminInviteCodeQuery,
  CanvasCreatedInviteCode,
  CanvasInviteCodeOptions,
  CanvasInviteCodeAvailability,
  CanvasInviteCodeExtensionPreview,
  CanvasModelCatalogBundle,
  CanvasModelCatalogPlan,
  CanvasAgentProfile,
  CanvasAdminAgentPage,
  CanvasAdminAgentQuery,
  CanvasAgentWorkspace,
  CanvasAgentInviteCodePage,
  CanvasAgentInviteCodeQuery,
  CanvasAgentCustomer,
  CanvasAgentCustomerQuery,
  CanvasAgentModelUsageRow,
  CanvasAdminAgentModelUsageRow,
  CanvasAgentModelPricePage,
  CanvasAdminAgentCustomer,
  CanvasAdminAgentStatistics,
  CanvasProviderPricingRow,
  CanvasAdminPointLot,
  CanvasAdminRechargeOrder,
  CanvasAdminCustomerPointBalance,
  CanvasAdminCustomerTask,
  CanvasAdminTaskLog,
  CanvasAdminTaskLogQuery,
  CanvasAdminTaskInputAsset,
  CanvasAdminTaskRecordDetail,
  CanvasTaskLogOptions,
  CanvasAdminTaskPointRecord,
  CanvasCustomerPointSummary,
  CanvasCustomerRechargeRedemption,
  CanvasCustomerTask,
  CanvasTaskAssetDownload,
  CanvasTaskPointLedgerDetail,
  CanvasAdminRefund,
  CanvasPage,
  CanvasPointLedgerItem,
  CanvasOrderPointReturn,
  CanvasOrderPointReturnPreview,
  CanvasOrderPointReturnRecord,
  CanvasRuntimeConfiguration,
  CanvasProviderConfiguration,
  CanvasProviderCredentialGroupChange,
  CanvasProviderConfigurationQuery,
  CanvasProviderCredentialVersion,
  CanvasProviderCredentialHistoryQuery,
  CanvasCredentialVersionAffectedModels,
  CanvasModelCredentialBindingVersion,
  CanvasCredentialRotationPreview,
  CanvasModelBindingPreview,
  CanvasModelPricingHistory,
  CanvasModelPricingDetail,
  CanvasModelPricingPreview,
  CanvasModelPricingPublication,
  CanvasModelPricingPublicationResult,
  CanvasModelPricingCnyScope,
  CanvasModelPricingCnyCalculation,
  CanvasModelPricingCnyCalculationIdentity,
  CanvasModelPricingWorkspace,
  CanvasModelMonitoring,
  CanvasModelMonitoringTargets,
  CanvasModelMonitoringControlQuery,
  CanvasModelMonitoringControlRecord,
  CanvasModelMonitoringControlResult,
  CanvasModelMonitoringQuery,
  CanvasModelMonitoringOverview,
  CanvasModelMonitoringOverviewQuery,
} from './types'

const webBase = '/canvas-api/v1/web'

function expectedCanvasTaskAssetPath(taskId: string, assetId: string): string {
  return `/v1/tasks/${taskId}/assets/${assetId}`
}

function assertCanvasTaskAssetPath(
  path: string,
  taskId: string,
  assetId: string,
  download: boolean
): void {
  const expected = `${expectedCanvasTaskAssetPath(taskId, assetId)}${download ? '/download' : ''}`
  if (path !== expected) throw new Error('Unexpected Canvas task asset path')
}

interface TopupLinkResponse {
  success?: boolean
  data?: { canvas_recharge_purchase_url?: unknown }
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
  return (
    await api.get<CanvasSession>(`${webBase}/session`, {
      skipErrorHandler: true,
    })
  ).data
}

export function isCanvasInviteRegistrationRequired(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return false
  }
  const response = (
    error as { response?: { status?: unknown; data?: { code?: unknown } } }
  ).response
  return (
    response?.status === 403 &&
    response.data?.code === 'INVITE_REGISTRATION_REQUIRED'
  )
}

export function getCanvasSessionFailureRoute(error: unknown): '/403' | '/503' {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return '/503'
  }
  const status = (error as { response?: { status?: unknown } }).response?.status
  return status === 401 || status === 403 ? '/403' : '/503'
}

export async function getCanvasCustomerWorkspace(): Promise<CanvasCustomerWorkspace> {
  return (
    await api.get<CanvasCustomerWorkspace>(`${webBase}/customer/workspace`)
  ).data
}

export async function getCanvasCustomerPointSummary(
  signal?: AbortSignal
): Promise<CanvasCustomerPointSummary> {
  return (
    await api.get<CanvasCustomerPointSummary>(
      `${webBase}/customer/point-summary`,
      {
        signal,
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasCustomerRechargeRedemptions(
  query: {
    rechargeOrderNumber?: string
    page?: number
    pageSize?: 10 | 20 | 30 | 40 | 50 | 100
    sortOrder?: 'asc' | 'desc'
  } = {},
  signal?: AbortSignal
): Promise<CanvasPage<CanvasCustomerRechargeRedemption>> {
  return (
    await api.get(`${webBase}/customer/recharge-redemptions`, {
      params: { page: 1, pageSize: 20, sortOrder: 'desc', ...query },
      signal,
      skipErrorHandler: true,
    })
  ).data
}

export async function getCanvasCustomerTasks(
  query: {
    taskId?: string
    model?: string
    derivedExecutionStatus?: string
    settlementProgress?: 'PENDING' | 'PROCESSING' | 'COMPLETED'
    from?: string
    to?: string
    sortBy?: 'taskId' | 'model' | 'derivedExecutionStatus' | 'acceptedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: 10 | 20 | 30 | 40 | 50 | 100
  } = {},
  signal?: AbortSignal
): Promise<CanvasPage<CanvasCustomerTask>> {
  return (
    await api.get(`${webBase}/customer/tasks`, {
      params: {
        sortBy: 'acceptedAt',
        sortOrder: 'desc',
        page: 1,
        pageSize: 20,
        ...query,
      },
      signal,
      skipErrorHandler: true,
    })
  ).data
}

export async function getCanvasTaskAssetDownload(
  downloadPath: string,
  taskId: string,
  assetId: string
): Promise<CanvasTaskAssetDownload> {
  assertCanvasTaskAssetPath(downloadPath, taskId, assetId, true)
  return (
    await api.get<CanvasTaskAssetDownload>(`/canvas-api${downloadPath}`, {
      skipErrorHandler: true,
    })
  ).data
}

export async function getCanvasTaskAssetBlob(
  assetPath: string,
  taskId: string,
  assetId: string
): Promise<Blob> {
  assertCanvasTaskAssetPath(assetPath, taskId, assetId, false)
  return (
    await api.get<Blob>(`/canvas-api${assetPath}`, {
      responseType: 'blob',
      skipErrorHandler: true,
    })
  ).data
}

export async function getCanvasCatalog(): Promise<CanvasCatalogModel[]> {
  return (await api.get<CanvasCatalogModel[]>('/canvas-api/v1/catalog')).data
}

export async function getCanvasRechargePurchaseLink(): Promise<string | null> {
  const response = (await api.get<TopupLinkResponse>('/api/user/topup/info'))
    .data
  if (response.success !== true) return null
  return normalizeCanvasRechargePurchaseLink(
    response.data?.canvas_recharge_purchase_url
  )
}

export async function getCanvasAdminWorkspace(): Promise<CanvasAdminWorkspace> {
  return (await api.get<CanvasAdminWorkspace>(`${webBase}/admin/workspace`))
    .data
}

export async function getCanvasAuditEvents(
  query: CanvasAuditEventQuery,
  signal?: AbortSignal
): Promise<CanvasAuditEventPage> {
  return (
    await api.get<CanvasAuditEventPage>(`${webBase}/admin/audit-events`, {
      params: query,
      signal,
    })
  ).data
}

export async function getCanvasAdminTaskLogs(
  query: CanvasAdminTaskLogQuery,
  signal?: AbortSignal
): Promise<CanvasPage<CanvasAdminTaskLog>> {
  return (
    await api.get<CanvasPage<CanvasAdminTaskLog>>(
      `${webBase}/admin/task-logs`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasModelMonitoring(
  customerModelId: string,
  executionTargetId: string,
  query: CanvasModelMonitoringQuery,
  signal?: AbortSignal
): Promise<CanvasModelMonitoring> {
  return (
    await api.get<CanvasModelMonitoring>(
      `${webBase}/admin/models/${encodeURIComponent(customerModelId)}/monitoring/targets/${encodeURIComponent(executionTargetId)}`,
      { params: query, signal, skipErrorHandler: true }
    )
  ).data
}

export async function getCanvasModelMonitoringOverview(
  query: CanvasModelMonitoringOverviewQuery,
  signal?: AbortSignal
): Promise<CanvasModelMonitoringOverview> {
  return (
    await api.get<CanvasModelMonitoringOverview>(
      `${webBase}/admin/model-monitoring`,
      { params: query, signal, skipErrorHandler: true }
    )
  ).data
}

export async function controlCanvasLogicalModel(
  modelKey: string,
  input: {
    enabled: boolean
    expectedVersion: number
    reasonCode: string
    note: string
    confirmed: true
  }
): Promise<CanvasModelMonitoringControlResult> {
  return (
    await api.post<CanvasModelMonitoringControlResult>(
      `${webBase}/admin/model-monitoring/models/${encodeURIComponent(modelKey)}/control`,
      input,
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-model-control') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasModelMonitoringTargets(
  customerModelId: string,
  signal?: AbortSignal
): Promise<CanvasModelMonitoringTargets> {
  return (
    await api.get<CanvasModelMonitoringTargets>(
      `${webBase}/admin/model-monitoring/models/${encodeURIComponent(customerModelId)}/targets`,
      { signal, skipErrorHandler: true }
    )
  ).data
}

export async function getCanvasModelMonitoringControls(
  customerModelId: string,
  executionTargetId: string,
  query: CanvasModelMonitoringControlQuery,
  signal?: AbortSignal
): Promise<CanvasPage<CanvasModelMonitoringControlRecord>> {
  return (
    await api.get<CanvasPage<CanvasModelMonitoringControlRecord>>(
      `${webBase}/admin/models/${encodeURIComponent(customerModelId)}/monitoring/targets/${encodeURIComponent(executionTargetId)}/controls`,
      { params: query, signal, skipErrorHandler: true }
    )
  ).data
}

export async function controlCanvasModelMonitoring(
  customerModelId: string,
  executionTargetId: string,
  input: {
    enabled: boolean
    expectedVersion: number
    reasonCode: string
    note: string
    confirmed: true
  }
): Promise<CanvasModelMonitoringControlResult> {
  return (
    await api.post<CanvasModelMonitoringControlResult>(
      `${webBase}/admin/models/${encodeURIComponent(customerModelId)}/monitoring/targets/${encodeURIComponent(executionTargetId)}/control`,
      input,
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-model-control') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasTaskLogOptions(
  signal?: AbortSignal
): Promise<CanvasTaskLogOptions> {
  return (
    await api.get<CanvasTaskLogOptions>(`${webBase}/admin/task-log-options`, {
      signal,
    })
  ).data
}

export async function getCanvasAdminTaskRecord(
  taskId: string,
  signal?: AbortSignal
): Promise<CanvasAdminTaskRecordDetail> {
  return (
    await api.get<CanvasAdminTaskRecordDetail>(
      `${webBase}/admin/tasks/${encodeURIComponent(taskId)}`,
      { signal, skipErrorHandler: true }
    )
  ).data
}

export interface CanvasAdminTaskInputDownload {
  url: string
  expiresAt: string
  inputIndex: number
  inputRole: string
  mediaType: CanvasAdminTaskInputAsset['mediaType']
  mimeType: string
  sizeBytes: string
  sha256: string
}

function assertCanvasAdminTaskInputPath(
  path: string,
  taskId: string,
  assetId: string,
  suffix: 'download' | 'content'
) {
  const expected = `/v1/web/admin/tasks/${encodeURIComponent(taskId)}/inputs/${encodeURIComponent(assetId)}/${suffix}`
  if (path !== expected) throw new Error('Task input asset path is invalid')
}

export async function getCanvasAdminTaskInputDownload(
  downloadPath: string,
  taskId: string,
  assetId: string
): Promise<CanvasAdminTaskInputDownload> {
  assertCanvasAdminTaskInputPath(downloadPath, taskId, assetId, 'download')
  return (
    await api.get<CanvasAdminTaskInputDownload>(`/canvas-api${downloadPath}`, {
      skipErrorHandler: true,
    })
  ).data
}

export async function getCanvasAdminTaskInputBlob(
  contentPath: string,
  taskId: string,
  assetId: string
): Promise<Blob> {
  assertCanvasAdminTaskInputPath(contentPath, taskId, assetId, 'content')
  return (
    await api.get<Blob>(`/canvas-api${contentPath}`, {
      responseType: 'blob',
      skipErrorHandler: true,
    })
  ).data
}

export async function getCanvasTaskPointLedger(
  taskId: string,
  query: {
    page: number
    pageSize: 10 | 20 | 30 | 40 | 50 | 100
  },
  signal?: AbortSignal
): Promise<CanvasPage<CanvasAdminTaskPointRecord>> {
  return (
    await api.get<CanvasPage<CanvasAdminTaskPointRecord>>(
      `${webBase}/admin/tasks/${encodeURIComponent(taskId)}/point-ledger`,
      { params: query, signal, skipErrorHandler: true }
    )
  ).data
}

/** @deprecated Kept for callers outside the UAT-018 task-details slice. */
export async function getCanvasTaskPointLedgerDetail(
  taskId: string,
  ledgerId: string,
  signal?: AbortSignal
): Promise<CanvasTaskPointLedgerDetail> {
  return (
    await api.get<CanvasTaskPointLedgerDetail>(
      `${webBase}/admin/tasks/${encodeURIComponent(taskId)}/point-ledger/${encodeURIComponent(ledgerId)}`,
      { signal, skipErrorHandler: true }
    )
  ).data
}

export async function getCanvasAdminTestingModels(): Promise<
  CanvasAdminTestingModel[]
> {
  return (
    await api.get<CanvasAdminTestingModel[]>(`${webBase}/admin/testing-models`)
  ).data
}

export async function getCanvasModelPricingWorkspace(): Promise<CanvasModelPricingWorkspace> {
  return (await api.get(`${webBase}/admin/model-pricing/models`)).data
}

export async function getCanvasModelPricingModel(
  modelId: string
): Promise<CanvasModelPricingDetail> {
  return (await api.get(`${webBase}/admin/model-pricing/models/${modelId}`))
    .data
}

export async function getCanvasModelPricingPublication(
  publicationId: string
): Promise<CanvasModelPricingPublication> {
  return (
    await api.get(
      `${webBase}/admin/model-pricing/publications/${publicationId}`
    )
  ).data
}

export async function previewCanvasModelPricing(input: {
  customerModelId: string
  billingUnit: import('./types').CanvasBillingUnit
  inputMode: 'CNY'
  calculationIdentity: CanvasModelPricingCnyCalculationIdentity
  effectiveMode: 'IMMEDIATE' | 'SCHEDULED'
  effectiveAt?: string
  decisionSummary?: string
  scopes: CanvasModelPricingCnyScope[]
}): Promise<CanvasModelPricingPreview> {
  return (
    await api.post(`${webBase}/admin/model-pricing/previews`, input, {
      skipErrorHandler: true,
    })
  ).data
}

export async function calculateCanvasModelPricingCny(input: {
  customerModelId: string
  billingUnit: import('./types').CanvasBillingUnit
  scopes: CanvasModelPricingCnyScope[]
}): Promise<CanvasModelPricingCnyCalculation> {
  return (
    await api.post(`${webBase}/admin/model-pricing/cny-calculations`, input, {
      skipErrorHandler: true,
    })
  ).data
}

export async function publishCanvasModelPricing(
  previewId: string,
  publishIdempotencyKey: string
): Promise<CanvasModelPricingPublicationResult> {
  return (
    await api.post(
      `${webBase}/admin/model-pricing/publications`,
      { previewId, confirmed: true },
      {
        headers: { 'Idempotency-Key': publishIdempotencyKey },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasModelPricingHistory(
  modelId: string,
  query: {
    page: number
    pageSize: number
    sortBy?: 'effectiveAt'
    sortDirection?: 'asc' | 'desc'
    combinationId?: string
    priceGroupId?: string
    change?: 'INITIAL' | 'COST' | 'PRICE' | 'COST_AND_PRICE' | 'UNIT'
    status?:
      | 'SCHEDULED'
      | 'CANCELLED'
      | 'CURRENT'
      | 'PARTIALLY_CURRENT'
      | 'SUPERSEDED'
    from?: string
    to?: string
  }
): Promise<CanvasModelPricingHistory> {
  return (
    await api.get(`${webBase}/admin/model-pricing/models/${modelId}/history`, {
      params: query,
    })
  ).data
}

export async function cancelCanvasModelPricingSchedule(
  publicationId: string,
  reason?: string
): Promise<CanvasModelPricingPublicationResult> {
  return (
    await api.post(
      `${webBase}/admin/model-pricing/publications/${publicationId}/cancel-schedule`,
      { confirmed: true, reason },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-model-pricing-cancel'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasAdminRechargeCodes(
  query: CanvasAdminRechargeCodeQuery,
  signal?: AbortSignal
): Promise<CanvasAdminRechargeCodePage> {
  return (
    await api.get<CanvasAdminRechargeCodePage>(
      `${webBase}/admin/recharge-codes`,
      {
        params: query,
        signal,
      }
    )
  ).data
}

export async function searchCanvasAdminRechargeCodeBatch(
  input: CanvasAdminRechargeCodeExactSearch,
  signal?: AbortSignal
): Promise<CanvasAdminRechargeCodeExactSearchPage> {
  return (
    await api.post<CanvasAdminRechargeCodeExactSearchPage>(
      `${webBase}/admin/recharge-code-batch-searches`,
      input,
      { signal, skipErrorHandler: true }
    )
  ).data
}

export async function issueCanvasAdminRechargeCodes(input: {
  promotionVersionId?: string
  remark?: string
  amountMinor: string
  count: number
  idempotencyKey?: string
}): Promise<CanvasIssuedRechargeCodes> {
  const { idempotencyKey: requestKey, ...body } = input
  return (
    await api.post<CanvasIssuedRechargeCodes>(
      `${webBase}/admin/recharge-codes`,
      body,
      {
        headers: {
          'Idempotency-Key': requestKey ?? idempotencyKey('web-issue-code'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function downloadCanvasUnusedRechargeCodes(batchId: string) {
  const response = await api.post<string>(
    `${webBase}/admin/recharge-code-batches/${encodeURIComponent(batchId)}/unused-downloads`,
    undefined,
    {
      headers: { 'Idempotency-Key': idempotencyKey('web-recharge-download') },
      responseType: 'text',
      skipErrorHandler: true,
    }
  )
  return {
    content: response.data,
    downloadCount: Number(response.headers['x-canvas-download-count'] ?? 0),
  }
}

export async function getCanvasAdminRechargeCodeBatchItems(
  batchId: string,
  status?: CanvasAdminRechargeCodeBatchItem['status'],
  signal?: AbortSignal
): Promise<CanvasAdminRechargeCodeBatchItems> {
  return (
    await api.get<CanvasAdminRechargeCodeBatchItems>(
      `${webBase}/admin/recharge-code-batches/${encodeURIComponent(batchId)}/codes`,
      {
        params: status ? { status } : undefined,
        signal,
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function activateCanvasInvite(code: string): Promise<{
  status: 'CONSUMED'
  customerId: string
  bonusPoints: string
}> {
  return (
    await api.post(
      `${webBase}/invite-registration`,
      { code },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-invite-activate') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasAdminInviteCodes(
  query: CanvasAdminInviteCodeQuery,
  signal?: AbortSignal
): Promise<CanvasAdminInviteCodePage> {
  return (
    await api.get<CanvasAdminInviteCodePage>(`${webBase}/admin/invite-codes`, {
      params: query,
      signal,
    })
  ).data
}

export async function searchCanvasAdminInviteCodes(
  input: { code: string } & Partial<CanvasAdminInviteCodeQuery>,
  signal?: AbortSignal
): Promise<CanvasAdminInviteCodePage> {
  return (
    await api.post<CanvasAdminInviteCodePage>(
      `${webBase}/admin/invite-code-searches`,
      input,
      { signal }
    )
  ).data
}

export async function exportCanvasAdminInviteCodes(
  query: Omit<CanvasAdminInviteCodeQuery, 'page' | 'pageSize'>
): Promise<Blob> {
  return (
    await api.get<Blob>(`${webBase}/admin/invite-codes/export`, {
      params: query,
      responseType: 'blob',
    })
  ).data
}

export async function getCanvasInviteCodeOptions(): Promise<CanvasInviteCodeOptions> {
  return (await api.get(`${webBase}/admin/invite-code-options`)).data
}

export async function createCanvasAdminInviteCode(input: {
  codeMode: 'GENERATED' | 'CUSTOM'
  code?: string
  maxRegistrations: string
  validFrom: string
  expiresAt: string
  priceGroupId: string
  initialBonusPoints: string | null
  initialBonusTtlDays: number | null
  promotionVersionId: string | null
  referralSource: string | null
  referralPrincipalId: string | null
  idempotencyKey?: string
}): Promise<CanvasCreatedInviteCode> {
  const { idempotencyKey: requestKey, ...body } = input
  return (
    await api.post(
      `${webBase}/admin/invite-codes`,
      { ...body, confirmed: true },
      {
        headers: {
          'Idempotency-Key': requestKey ?? idempotencyKey('web-invite-create'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function checkCanvasInviteCodeAvailability(
  code: string,
  signal?: AbortSignal
): Promise<CanvasInviteCodeAvailability> {
  return (
    await api.post<CanvasInviteCodeAvailability>(
      `${webBase}/admin/invite-codes/availability`,
      { code },
      { signal, skipErrorHandler: true }
    )
  ).data
}

export async function previewCanvasInviteCodeExtension(input: {
  id: string
  expectedExpiresAt: string
  newExpiresAt: string
}): Promise<CanvasInviteCodeExtensionPreview> {
  return (
    await api.post<CanvasInviteCodeExtensionPreview>(
      `${webBase}/admin/invite-codes/${input.id}/extend/preview`,
      {
        expectedExpiresAt: input.expectedExpiresAt,
        newExpiresAt: input.newExpiresAt,
      },
      { skipErrorHandler: true }
    )
  ).data
}

export async function extendCanvasAdminInviteCode(input: {
  id: string
  expectedExpiresAt: string
  newExpiresAt: string
  reason?: string
  confirmed: true
  idempotencyKey?: string
}): Promise<CanvasAdminInviteCode> {
  return (
    await api.post<CanvasAdminInviteCode>(
      `${webBase}/admin/invite-codes/${input.id}/extend`,
      {
        expectedExpiresAt: input.expectedExpiresAt,
        newExpiresAt: input.newExpiresAt,
        reason: input.reason ?? null,
        confirmed: true,
      },
      {
        headers: {
          'Idempotency-Key':
            input.idempotencyKey ?? idempotencyKey('web-invite-extend'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function revealCanvasCode(
  kind: 'admin-invite' | 'agent-invite' | 'admin-recharge',
  id: string,
  action: 'DISPLAY' | 'COPY'
): Promise<{ code: string }> {
  let path = `admin/recharge-codes/${id}`
  if (kind === 'admin-invite') path = `admin/invite-codes/${id}`
  if (kind === 'agent-invite') path = `agent/invite-codes/${id}`
  return (
    await api.post(
      `${webBase}/${path}/reveal`,
      { action, confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-reveal-code') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasAgents(
  query: CanvasAdminAgentQuery,
  signal?: AbortSignal
): Promise<CanvasAdminAgentPage> {
  return (
    await api.get<CanvasAdminAgentPage>(`${webBase}/admin/agents`, {
      params: query,
      signal,
    })
  ).data
}

export async function provisionCanvasAgent(input: {
  username: string
  status: 'ACTIVE'
  reason: string
  idempotencyKey?: string
}): Promise<CanvasAgentProfile> {
  const { idempotencyKey: requestKey, ...body } = input
  return (
    await api.post(
      `${webBase}/admin/agents`,
      { ...body, confirmed: true },
      {
        headers: {
          'Idempotency-Key': requestKey ?? idempotencyKey('web-agent-create'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasAgentWorkspace(): Promise<CanvasAgentWorkspace> {
  return (await api.get(`${webBase}/agent/workspace`)).data
}

export async function getCanvasAgentInviteCodes(
  query: CanvasAgentInviteCodeQuery,
  signal?: AbortSignal
): Promise<CanvasAgentInviteCodePage> {
  return (
    await api.get<CanvasAgentInviteCodePage>(`${webBase}/agent/invite-codes`, {
      params: query,
      signal,
    })
  ).data
}

export async function searchCanvasAgentInviteCodes(
  input: {
    code: string
    status?: CanvasAgentInviteCodeQuery['status']
    priceGroupId?: string
    page?: number
    pageSize?: CanvasAgentInviteCodeQuery['pageSize']
    sortBy?: CanvasAgentInviteCodeQuery['sortBy']
    sortOrder?: CanvasAgentInviteCodeQuery['sortOrder']
  },
  signal?: AbortSignal
): Promise<CanvasAgentInviteCodePage> {
  return (
    await api.post<CanvasAgentInviteCodePage>(
      `${webBase}/agent/invite-code-searches`,
      input,
      { signal }
    )
  ).data
}

export async function getCanvasAgentCustomers(
  query: CanvasAgentCustomerQuery,
  signal?: AbortSignal
): Promise<CanvasPage<CanvasAgentCustomer>> {
  return (
    await api.get<CanvasPage<CanvasAgentCustomer>>(
      `${webBase}/agent/customers`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasAgentModelPrices(
  query: {
    capability?: string
    tagId?: string
    search?: string
    page: number
    pageSize: 10 | 20 | 30 | 40 | 50 | 100
  },
  signal?: AbortSignal
): Promise<CanvasAgentModelPricePage> {
  return (
    await api.get<CanvasAgentModelPricePage>(`${webBase}/agent/model-prices`, {
      params: query,
      signal,
    })
  ).data
}

export async function getCanvasAdminAgentModelPrices(
  customerId: string,
  query: {
    capability?: string
    tagId?: string
    search?: string
    page: number
    pageSize: 10 | 20 | 30 | 40 | 50 | 100
  },
  signal?: AbortSignal
): Promise<CanvasAgentModelPricePage> {
  return (
    await api.get<CanvasAgentModelPricePage>(
      `${webBase}/admin/customers/${customerId}/agent-model-prices`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasAgentCustomerModelUsage(
  customerId: string,
  query: { page: number; pageSize: 10 | 20 | 30 | 40 | 50 | 100 },
  signal?: AbortSignal
): Promise<CanvasPage<CanvasAgentModelUsageRow>> {
  return (
    await api.get<CanvasPage<CanvasAgentModelUsageRow>>(
      `${webBase}/agent/customers/${customerId}/model-usage`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasAdminAgentStatistics(
  customerId: string,
  signal?: AbortSignal
): Promise<CanvasAdminAgentStatistics> {
  return (
    await api.get<CanvasAdminAgentStatistics>(
      `${webBase}/admin/customers/${customerId}/agent-statistics`,
      { signal }
    )
  ).data
}

export async function getCanvasAdminAgentCustomers(
  customerId: string,
  query: CanvasAgentCustomerQuery,
  signal?: AbortSignal
): Promise<CanvasPage<CanvasAdminAgentCustomer>> {
  return (
    await api.get<CanvasPage<CanvasAdminAgentCustomer>>(
      `${webBase}/admin/customers/${customerId}/agent-customers`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasAdminAgentCustomerModelUsage(
  customerId: string,
  referredCustomerId: string,
  query: { page: number; pageSize: 10 | 20 | 30 | 40 | 50 | 100 },
  signal?: AbortSignal
): Promise<CanvasPage<CanvasAdminAgentModelUsageRow>> {
  return (
    await api.get<CanvasPage<CanvasAdminAgentModelUsageRow>>(
      `${webBase}/admin/customers/${customerId}/agent-customers/${referredCustomerId}/model-usage`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasProviderPricingMatrix(): Promise<
  CanvasProviderPricingRow[]
> {
  return (await api.get(`${webBase}/admin/provider-pricing-matrix`)).data
}

export async function publishCanvasProviderRate(input: {
  customerModelId: string
  parameterCombinationId: string
  billingUnit: import('./types').CanvasBillingUnit
  nativeAmount: string
  tokenRates?: import('./types').CanvasTokenRateVector
  currency: string
  exchangeRateSnapshot: { rate: string; source: string; asOf: string }
  normalizedAmountMinor: string
  normalizedTokenRates?: import('./types').CanvasTokenRateVector
  failureChargePolicy:
    | { mode: 'NONE' }
    | { mode: 'SAME_AS_SUCCESS' }
    | { mode: 'FIXED'; normalizedAmountMinor: string }
  decisionSummary: string
  effectiveAt?: string
}): Promise<{ id: string; version: number; status: string }> {
  return (
    await api.post(
      `${webBase}/admin/provider-rate-versions/publications`,
      { ...input, confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-provider-rate') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function resolveCanvasProviderRateRisk(input: {
  providerRateVersionId: string
  decisionType: 'REPRICE_SCHEDULED' | 'MANUAL_PAUSE' | 'TEMPORARY_LOSS'
  scheduledPriceVersionIds?: string[]
  lossEndsAt?: string
  maxExpectedLossPoints?: string
  reason: string
}) {
  return (
    await api.post(
      `${webBase}/admin/provider-rate-risk-decisions`,
      { ...input, confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-provider-rate-risk'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function changeCanvasAdminInviteCodeStatus(
  inviteCodeId: string,
  action: 'pause' | 'resume' | 'revoke'
): Promise<CanvasAdminInviteCode> {
  return (
    await api.post(
      `${webBase}/admin/invite-codes/${inviteCodeId}/${action}`,
      { confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey(`web-invite-${action}`),
        },
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

export async function publishCanvasModelCatalogBundle(input: {
  bundle: CanvasModelCatalogBundle
  expectedPlanToken: string
}) {
  return (
    await api.post(
      `${webBase}/admin/model-catalog-bundles/publications`,
      { confirmed: true, ...input },
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
  expectedVersion?: number
  tagIds?: string[]
  expectedTagIds?: string[]
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

export async function getCanvasAdminModelTags(): Promise<
  CanvasAdminModelTag[]
> {
  return (await api.get<CanvasAdminModelTag[]>(`${webBase}/admin/model-tags`))
    .data
}

export async function createCanvasAdminModelTag(name: string) {
  return (
    await api.post(
      `${webBase}/admin/model-tags`,
      { name, confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-model-tag-create') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function renameCanvasAdminModelTag(input: {
  id: string
  name: string
  expectedName: string
}) {
  return (
    await api.patch(
      `${webBase}/admin/model-tags/${encodeURIComponent(input.id)}`,
      {
        name: input.name,
        expectedName: input.expectedName,
        confirmed: true,
      },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-model-tag-rename') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function deleteCanvasAdminModelTag(input: {
  id: string
  expectedModelKeys: string[]
}) {
  return (
    await api.delete(
      `${webBase}/admin/model-tags/${encodeURIComponent(input.id)}`,
      {
        data: { expectedModelKeys: input.expectedModelKeys, confirmed: true },
        headers: { 'Idempotency-Key': idempotencyKey('web-model-tag-delete') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function setCanvasAdminModelTagModels(input: {
  id: string
  modelKeys: string[]
  expectedModelKeys: string[]
}) {
  return (
    await api.put(
      `${webBase}/admin/model-tags/${encodeURIComponent(input.id)}/models`,
      {
        modelKeys: input.modelKeys,
        expectedModelKeys: input.expectedModelKeys,
        confirmed: true,
      },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-model-tag-models') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function publishCanvasExecutionTargetPresentation(input: {
  executionTargetId: string
  enabled: boolean
  expectedVersion: number
}) {
  const { executionTargetId, enabled, expectedVersion } = input
  return (
    await api.post(
      `${webBase}/admin/model-execution-targets/${encodeURIComponent(executionTargetId)}/presentation`,
      { enabled, expectedVersion, confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey(
            'web-execution-target-presentation'
          ),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function redeemCanvasRechargeCode(code: string): Promise<{
  rechargeCodeId: string
  orderNumber: string
  redeemedAt: string
  purchasedPoints: string
  bonusPoints: string
  issuedLots: Array<{ id: string }>
}> {
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
  billingUnit?: import('./types').CanvasBillingUnit
  tokenRates?: import('./types').CanvasTokenRateVector
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
  pointBudget?: string
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

export async function getCanvasRuntimeConfiguration(): Promise<CanvasRuntimeConfiguration> {
  return (
    await api.get<CanvasRuntimeConfiguration>(
      `${webBase}/admin/runtime-configuration`
    )
  ).data
}

export async function getCanvasProviderConfiguration(
  query: CanvasProviderConfigurationQuery,
  signal?: AbortSignal
): Promise<CanvasProviderConfiguration> {
  return (
    await api.get<CanvasProviderConfiguration>(
      `${webBase}/admin/provider-configuration`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasProviderCredentialHistory(
  credentialGroupId: string,
  query: CanvasProviderCredentialHistoryQuery,
  signal?: AbortSignal
): Promise<CanvasPage<CanvasProviderCredentialVersion>> {
  return (
    await api.get<CanvasPage<CanvasProviderCredentialVersion>>(
      `${webBase}/admin/provider-credential-groups/${encodeURIComponent(credentialGroupId)}/versions`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasProviderCredentialGroupChanges(
  credentialGroupId: string,
  query: { page: number; pageSize: 10 | 20 | 30 | 40 | 50 | 100 },
  signal?: AbortSignal
): Promise<CanvasPage<CanvasProviderCredentialGroupChange>> {
  return (
    await api.get<CanvasPage<CanvasProviderCredentialGroupChange>>(
      `${webBase}/admin/provider-credential-groups/${encodeURIComponent(credentialGroupId)}/changes`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasCredentialVersionAffectedModels(
  credentialGroupVersionId: string,
  query: { page: number; pageSize: number },
  signal?: AbortSignal
): Promise<CanvasCredentialVersionAffectedModels> {
  return (
    await api.get<CanvasCredentialVersionAffectedModels>(
      `${webBase}/admin/provider-credential-group-versions/${encodeURIComponent(credentialGroupVersionId)}/affected-models`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasModelCredentialBindingHistory(
  customerModelId: string,
  query: { page: number; pageSize: number },
  signal?: AbortSignal
): Promise<CanvasPage<CanvasModelCredentialBindingVersion>> {
  return (
    await api.get<CanvasPage<CanvasModelCredentialBindingVersion>>(
      `${webBase}/admin/provider-models/${encodeURIComponent(customerModelId)}/credential-bindings`,
      { params: query, signal }
    )
  ).data
}

export async function getCanvasCredentialRotationPreview(
  credentialGroupId: string,
  signal?: AbortSignal
): Promise<CanvasCredentialRotationPreview> {
  return (
    await api.get<CanvasCredentialRotationPreview>(
      `${webBase}/admin/provider-credential-groups/${encodeURIComponent(credentialGroupId)}/rotation-preview`,
      { signal }
    )
  ).data
}

export async function previewCanvasProviderCredentialBindings(input: {
  credentialGroupVersionId: string
  customerModelIds: string[]
}): Promise<CanvasModelBindingPreview> {
  return (
    await api.post<CanvasModelBindingPreview>(
      `${webBase}/admin/provider-credential-bindings/preview`,
      input,
      { skipErrorHandler: true }
    )
  ).data
}

export async function publishCanvasTaskMediaStorage(input: {
  endpoint?: string
  mediaBucket?: string
  mediaCredentials?: { accessKeyId: string; secretAccessKey: string }
  inputRetentionHours?: number
  outputRetentionHours?: number
  downloadUrlTtlSeconds?: number
  reason?: string
}) {
  return (
    await api.post(
      `${webBase}/admin/runtime-storage/task-media/publications`,
      { ...input, confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-task-media-storage'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function publishCanvasDatabaseBackupStorage(input: {
  endpoint?: string
  backupBucket?: string
  backupCredentials?: { accessKeyId: string; secretAccessKey: string }
  backupRetentionHours?: number
  downloadUrlTtlSeconds?: number
  reason?: string
}) {
  return (
    await api.post(
      `${webBase}/admin/runtime-storage/database-backup/publications`,
      { ...input, confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-database-backup-storage'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function publishCanvasProviderCredentialGroup(input: {
  providerId: string
  credentialGroupId?: string
  name: string
  apiKey: string
  expectedCredentialGroupVersionId?: string
  expectedBindings?: Array<{
    customerModelId: string
    bindingId: string
    bindingVersion: number
  }>
  reason?: string | null
}) {
  return (
    await api.post(
      `${webBase}/admin/provider-credential-groups/publications`,
      { ...input, confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-provider-credentials'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function bindCanvasProviderCredentials(input: {
  credentialGroupVersionId: string
  customerModelIds: string[]
  expectedBindings: Array<{
    customerModelId: string
    bindingId: string | null
    bindingVersion: number | null
  }>
  reason?: string | null
}) {
  return (
    await api.post(
      `${webBase}/admin/provider-credential-bindings/publications`,
      { ...input, confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-provider-bindings') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function publishCanvasCredentialGroupManagement(input: {
  credentialGroupId: string
  expectedCredentialGroupVersionId: string
  name: string
  apiKey?: string
  customerModelIds: string[]
  expectedBindings: Array<{
    customerModelId: string
    bindingId: string | null
    bindingVersion: number | null
  }>
  reason?: string | null
}) {
  const { credentialGroupId, ...body } = input
  return (
    await api.post(
      `${webBase}/admin/provider-credential-groups/${encodeURIComponent(credentialGroupId)}/management-publications`,
      { ...body, confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-provider-group-management'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function archiveCanvasCredentialGroup(input: {
  credentialGroupId: string
  expectedCredentialGroupVersionId: string
  reason?: string | null
}) {
  const { credentialGroupId, ...body } = input
  return (
    await api.post(
      `${webBase}/admin/provider-credential-groups/${encodeURIComponent(credentialGroupId)}/archive`,
      { ...body, confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-provider-group-archive'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function restoreCanvasCredentialGroup(input: {
  credentialGroupId: string
  expectedCredentialGroupVersionId: string
  reason?: string | null
}) {
  const { credentialGroupId, ...body } = input
  return (
    await api.post(
      `${webBase}/admin/provider-credential-groups/${encodeURIComponent(credentialGroupId)}/restore`,
      { ...body, confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-provider-group-restore'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function checkCanvasTaskMediaStorage(
  storageConfigVersionId: string
) {
  return (
    await api.post<import('./types').CanvasRuntimeConnectionCheck>(
      `${webBase}/admin/runtime-storage/task-media/${storageConfigVersionId}/checks`,
      undefined,
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-storage-check') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function checkCanvasDatabaseBackupStorage(
  backupConfigVersionId: string
) {
  return (
    await api.post<import('./types').CanvasRuntimeConnectionCheck>(
      `${webBase}/admin/runtime-storage/database-backup/${backupConfigVersionId}/checks`,
      undefined,
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-database-backup-check'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function checkCanvasCustomerModelAccessPermission(
  customerModelId: string
) {
  return (
    await api.post<import('./types').CanvasModelAccessPermissionCheck>(
      `${webBase}/admin/customer-models/${customerModelId}/access-permission-checks`,
      undefined,
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-model-access-check'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function publishConfirmedCanvasTaskPolicySettings(input: {
  quoteTtlSeconds?: number
  bonusFailureGraceDays?: number
  paidExpiryDays?: number
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

export async function getCanvasAdminRechargeOrders(
  input: {
    orderId?: string
    orderNumber?: string
    customer?: string
    customerId?: string
    page?: number
    pageSize?: 10 | 20 | 30 | 40 | 50 | 100
    eligibleForPaidCorrection?: boolean
    status?:
      | 'CREATED'
      | 'PAYMENT_PENDING'
      | 'PAID'
      | 'CODE_ACTIVATED'
      | 'CANCELLED'
    timeField?: 'createdAt' | 'redeemedAt'
    from?: string
    to?: string
    createdFrom?: string
    createdTo?: string
    redeemedFrom?: string
    redeemedTo?: string
    sortBy?:
      | 'orderNumber'
      | 'customer'
      | 'status'
      | 'amount'
      | 'purchasedPoints'
      | 'issuedBonusPoints'
      | 'availablePaidPoints'
      | 'availableBonusPoints'
      | 'remainingCorrectionPoints'
      | 'createdAt'
      | 'redeemedAt'
    sortOrder?: 'asc' | 'desc'
  },
  signal?: AbortSignal
): Promise<CanvasPage<CanvasAdminRechargeOrder>> {
  return (
    await api.get(`${webBase}/admin/recharge-orders`, {
      params: { page: 1, pageSize: 20, ...input },
      signal,
    })
  ).data
}

export async function getCanvasAdminCustomerPointLots(
  customerId: string,
  query: {
    lotId?: string
    rechargeOrderNumber?: string
    type?: 'PAID' | 'BONUS' | 'GRACE_BONUS'
    sourceType?:
      | 'RECHARGE_CODE'
      | 'REGISTRATION_BONUS'
      | 'INVITE_BONUS'
      | 'PROMOTION'
      | 'CUSTOMER_SERVICE'
      | 'MANUAL_GRANT'
      | 'GRACE_TRANSFER'
    availableOnly?: boolean
    from?: string
    to?: string
    expiresFrom?: string
    expiresTo?: string
    sortBy?:
      | 'type'
      | 'source'
      | 'availablePoints'
      | 'reservedPoints'
      | 'expiresAt'
      | 'issuedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: 10 | 20 | 30 | 40 | 50 | 100
  } = {},
  signal?: AbortSignal
): Promise<CanvasPage<CanvasAdminPointLot>> {
  return (
    await api.get(`${webBase}/admin/customers/${customerId}/point-lots`, {
      params: { page: 1, pageSize: 20, ...query },
      signal,
    })
  ).data
}

export async function getCanvasAdminCustomerPointLedger(
  customerId: string,
  query: {
    relatedRecord?: string
    reason?: string
    taskId?: string
    refundId?: string
    pointReturnId?: string
    eventType?: string
    from?: string
    to?: string
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: 10 | 20 | 30 | 40 | 50 | 100
  } = {},
  signal?: AbortSignal
): Promise<CanvasPage<CanvasPointLedgerItem>> {
  return (
    await api.get(`${webBase}/admin/customers/${customerId}/point-ledger`, {
      params: { page: 1, pageSize: 20, ...query },
      signal,
    })
  ).data
}

export async function getCanvasAdminCustomerTasks(
  customerId: string,
  query: {
    taskId?: string
    model?: string
    upstreamTaskId?: string
    executionStatus?: string
    billingStatus?: string
    from?: string
    to?: string
    sortBy?:
      | 'taskId'
      | 'model'
      | 'quotedPoints'
      | 'settledPoints'
      | 'executionStatus'
      | 'billingStatus'
      | 'acceptedAt'
      | 'completedAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: 10 | 20 | 30 | 40 | 50 | 100
  } = {},
  signal?: AbortSignal
): Promise<CanvasPage<CanvasAdminCustomerTask>> {
  return (
    await api.get(`${webBase}/admin/customers/${customerId}/tasks`, {
      params: { page: 1, pageSize: 20, ...query },
      signal,
    })
  ).data
}

export async function getCanvasAdminCustomers(
  query: {
    username?: string
    email?: string
    status?: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
    agentIdentity?: 'ALL' | 'AGENT' | 'CUSTOMER'
    sortBy?: 'customer' | 'status' | 'availablePoints' | 'createdAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: 10 | 20 | 30 | 40 | 50 | 100
  } = {},
  signal?: AbortSignal
): Promise<CanvasPage<CanvasAdminCustomerPointBalance>> {
  return (
    await api.get(`${webBase}/admin/customers`, {
      params: { page: 1, pageSize: 20, ...query },
      signal,
    })
  ).data
}

export async function getCanvasAdminCustomer(
  customerId: string,
  signal?: AbortSignal
): Promise<CanvasAdminCustomerPointBalance> {
  return (
    await api.get<CanvasAdminCustomerPointBalance>(
      `${webBase}/admin/customers/${customerId}`,
      { signal }
    )
  ).data
}

export async function getCanvasOrderPointReturns(
  customerId: string,
  rechargeOrderId: string,
  query: {
    page?: number
    pageSize?: 10 | 20 | 30 | 40 | 50 | 100
    operator?: string
    reason?: string
    from?: string
    to?: string
    sortOrder?: 'asc' | 'desc'
  } = {},
  signal?: AbortSignal
): Promise<CanvasPage<CanvasOrderPointReturnRecord>> {
  return (
    await api.get(
      `${webBase}/admin/customers/${customerId}/recharge-orders/${rechargeOrderId}/point-returns`,
      { params: { page: 1, pageSize: 20, ...query }, signal }
    )
  ).data
}

export async function previewCanvasOrderPointReturn(input: {
  rechargeOrderId: string
  points: string
}): Promise<CanvasOrderPointReturnPreview> {
  return (
    await api.post(`${webBase}/admin/point-returns/preview`, input, {
      skipErrorHandler: true,
    })
  ).data
}

export async function createCanvasOrderPointReturn(
  input: {
    rechargeOrderId: string
    points: string
    reason: string
    expectedAvailablePaidPoints: string
    expectedCumulativeReturnedPoints: string
    expectedReferenceAmountMinor: string
  },
  requestKey = idempotencyKey('web-point-return')
): Promise<CanvasOrderPointReturn> {
  return (
    await api.post(
      `${webBase}/admin/point-returns`,
      { ...input, confirmed: true },
      {
        headers: { 'Idempotency-Key': requestKey },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasAdminRefunds(
  query: {
    refundReference?: string
    orderNumber?: string
    customerConfirmation?: string
    customerId?: string
    status?: string
    from?: string
    to?: string
    sortBy?: 'orderNumber' | 'status' | 'amount' | 'createdAt'
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: 10 | 20 | 30 | 40 | 50 | 100
  } = {},
  signal?: AbortSignal
): Promise<CanvasPage<CanvasAdminRefund>> {
  return (
    await api.get(`${webBase}/admin/refunds`, {
      params: { page: 1, pageSize: 20, ...query },
      signal,
    })
  ).data
}

export async function getCanvasCustomerPointLots(
  query: Parameters<typeof getCanvasAdminCustomerPointLots>[1] = {},
  signal?: AbortSignal
): Promise<CanvasPage<CanvasAdminPointLot>> {
  return (
    await api.get(`${webBase}/customer/point-lots`, {
      params: { page: 1, pageSize: 20, ...query },
      signal,
    })
  ).data
}

export async function getCanvasCustomerPointLedger(
  query: {
    relatedRecord?: string
    reason?: string
    taskId?: string
    refundId?: string
    pointReturnId?: string
    eventType?: string
    from?: string
    to?: string
    sortOrder?: 'asc' | 'desc'
    page?: number
    pageSize?: 10 | 20 | 30 | 40 | 50 | 100
  } = {},
  signal?: AbortSignal
): Promise<CanvasPage<CanvasPointLedgerItem>> {
  return (
    await api.get(`${webBase}/customer/point-ledger`, {
      params: { page: 1, pageSize: 20, ...query },
      signal,
    })
  ).data
}

export async function grantCanvasManualBonus(input: {
  customerId: string
  points: string
  expiresAt: string
  reason: string
}) {
  return (
    await api.post(
      `${webBase}/admin/point-adjustments/manual-bonus`,
      { ...input, confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-manual-bonus') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function grantCanvasPaidCorrection(input: {
  rechargeOrderId: string
  points: string
  reason: string
}) {
  return (
    await api.post(
      `${webBase}/admin/point-adjustments/paid-corrections`,
      { ...input, confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('web-paid-correction'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function deductCanvasPointLot(input: {
  pointLotId: string
  points: string
  reason: string
}) {
  return (
    await api.post(
      `${webBase}/admin/point-adjustments/deductions`,
      { ...input, confirmed: true },
      {
        headers: { 'Idempotency-Key': idempotencyKey('web-point-deduction') },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getCanvasCustomerPriceAssignments(
  customerId: string,
  query: {
    page: number
    pageSize: number
    group?: string
    sortOrder: 'asc' | 'desc'
  },
  signal?: AbortSignal
): Promise<import('./types').CanvasCustomerPriceAssignments> {
  return (
    await api.get<import('./types').CanvasCustomerPriceAssignments>(
      `${webBase}/admin/customers/${encodeURIComponent(customerId)}/price-group-assignments`,
      { params: query, signal }
    )
  ).data
}

export async function assignCanvasCustomerPriceGroup(
  customerId: string,
  input: { priceGroupId: string; reason: string },
  key: string
) {
  return (
    await api.post(
      `${webBase}/admin/customers/${encodeURIComponent(customerId)}/price-group-assignments`,
      { ...input, confirmed: true },
      { headers: { 'Idempotency-Key': key }, skipErrorHandler: true }
    )
  ).data
}

export async function getCanvasCustomerBusinessFacts(
  customerId: string,
  query: {
    page: number
    pageSize: number
    sortOrder: 'asc' | 'desc'
    kind?: import('./types').CanvasBusinessFactKind
    name?: string
    status?: string
    from?: string
    to?: string
  },
  root?: { kind: import('./types').CanvasBusinessFactKind; id: string },
  signal?: AbortSignal
): Promise<import('./types').CanvasBusinessFactPage> {
  const suffix = root
    ? `/${encodeURIComponent(root.kind)}/${encodeURIComponent(root.id)}`
    : ''
  return (
    await api.get<import('./types').CanvasBusinessFactPage>(
      `${webBase}/admin/customers/${encodeURIComponent(customerId)}/business-facts${suffix}`,
      { params: query, signal }
    )
  ).data
}

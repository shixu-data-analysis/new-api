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
  AdminAgentEarningsSummary,
  AdminAgentSettlementPolicy,
  AdminAgentStatementQuery,
  AdminAgentWithdrawal,
  AdminAgentWithdrawalDetail,
  AdminAgentWithdrawalQuery,
  AgentEarningsSummary,
  AgentMonthlyStatementPage,
  AgentPageSize,
  AgentPaymentQrResult,
  AgentStatementCustomerList,
  AgentStatusChangeResult,
  AgentStatusPreview,
  AgentWithdrawal,
  AgentWithdrawalDetail,
  AgentWithdrawalFile,
} from './agent-earnings-types'
import type { CanvasPage } from './types'

const webBase = '/canvas-api/v1/web'

function idempotencyKey(scope: string): string {
  return `${scope}-${crypto.randomUUID()}`
}

export const agentEarningsQueryKeys = {
  all: ['canvas-cloud', 'agent-earnings'] as const,
  unreadCount: ['canvas-cloud', 'agent-earnings', 'unread-count'] as const,
  pendingCount: ['canvas-cloud', 'agent-withdrawals', 'pending-count'] as const,
  admin: ['canvas-cloud', 'agent-withdrawals'] as const,
}

// ---- Agent ----

export async function getAgentEarningsSummary(
  signal?: AbortSignal
): Promise<AgentEarningsSummary> {
  return (
    await api.get<AgentEarningsSummary>(`${webBase}/agent/earnings/summary`, {
      signal,
    })
  ).data
}

export async function getAgentStatements(
  query: { page: number; pageSize: AgentPageSize; month?: string },
  signal?: AbortSignal
): Promise<AgentMonthlyStatementPage> {
  return (
    await api.get<AgentMonthlyStatementPage>(
      `${webBase}/agent/earnings/statements`,
      { params: query, signal }
    )
  ).data
}

export async function getAgentStatementCustomers(
  month: string,
  signal?: AbortSignal
): Promise<AgentStatementCustomerList> {
  return (
    await api.get<AgentStatementCustomerList>(
      `${webBase}/agent/earnings/statements/${encodeURIComponent(month)}/customers`,
      { signal }
    )
  ).data
}

export async function getAgentWithdrawals(
  query: { page: number; pageSize: AgentPageSize },
  signal?: AbortSignal
): Promise<CanvasPage<AgentWithdrawal>> {
  return (
    await api.get<CanvasPage<AgentWithdrawal>>(`${webBase}/agent/withdrawals`, {
      params: query,
      signal,
    })
  ).data
}

export async function getAgentWithdrawal(
  withdrawalId: string,
  signal?: AbortSignal
): Promise<AgentWithdrawalDetail> {
  return (
    await api.get<AgentWithdrawalDetail>(
      `${webBase}/agent/withdrawals/${encodeURIComponent(withdrawalId)}`,
      { signal }
    )
  ).data
}

export async function getAgentUnreadWithdrawalCount(
  signal?: AbortSignal
): Promise<number> {
  return (
    await api.get<{ count: number }>(
      `${webBase}/agent/withdrawals/unread-count`,
      { signal }
    )
  ).data.count
}

export async function markAgentWithdrawalsSeen(): Promise<void> {
  await api.post(`${webBase}/agent/withdrawals/mark-seen`, undefined, {
    headers: { 'Idempotency-Key': idempotencyKey('agent-withdrawals-seen') },
  })
}

/** `amount` is RMB with at most two decimals; the request is paid to the agent's current QR code. */
export async function submitAgentWithdrawal(
  input: { amount: string },
  key: string
): Promise<AgentWithdrawal> {
  return (
    await api.post<AgentWithdrawal>(`${webBase}/agent/withdrawals`, input, {
      headers: { 'Idempotency-Key': key },
      skipErrorHandler: true,
    })
  ).data
}

export function newWithdrawalIdempotencyKey(): string {
  return idempotencyKey('agent-withdrawal')
}

/** Uploads the agent's payment QR code (base64), replacing the current one for every requested withdrawal. */
export async function replaceAgentPaymentQr(
  image: string,
  key: string
): Promise<AgentPaymentQrResult> {
  return (
    await api.put<AgentPaymentQrResult>(
      `${webBase}/agent/payment-qr`,
      { image },
      { headers: { 'Idempotency-Key': key }, skipErrorHandler: true }
    )
  ).data
}

export function newPaymentQrIdempotencyKey(): string {
  return idempotencyKey('agent-payment-qr')
}

// ---- Administrator ----

export async function getAdminAgentStatements(
  query: AdminAgentStatementQuery,
  signal?: AbortSignal
): Promise<AgentMonthlyStatementPage> {
  return (
    await api.get<AgentMonthlyStatementPage>(
      `${webBase}/admin/agent-statements`,
      { params: query, signal }
    )
  ).data
}

export async function getAdminAgentStatementCustomers(
  statementId: string,
  signal?: AbortSignal
): Promise<AgentStatementCustomerList> {
  return (
    await api.get<AgentStatementCustomerList>(
      `${webBase}/admin/agent-statements/${encodeURIComponent(statementId)}/customers`,
      { signal }
    )
  ).data
}

export async function getAdminAgentWithdrawals(
  query: AdminAgentWithdrawalQuery,
  signal?: AbortSignal
): Promise<CanvasPage<AdminAgentWithdrawal>> {
  return (
    await api.get<CanvasPage<AdminAgentWithdrawal>>(
      `${webBase}/admin/agent-withdrawals`,
      { params: query, signal }
    )
  ).data
}

export async function getAdminAgentWithdrawal(
  withdrawalId: string,
  signal?: AbortSignal
): Promise<AdminAgentWithdrawalDetail> {
  return (
    await api.get<AdminAgentWithdrawalDetail>(
      `${webBase}/admin/agent-withdrawals/${encodeURIComponent(withdrawalId)}`,
      { signal }
    )
  ).data
}

export async function getAdminPendingWithdrawalCount(
  signal?: AbortSignal
): Promise<number> {
  return (
    await api.get<{ count: number }>(
      `${webBase}/admin/agent-withdrawals/pending-count`,
      { signal }
    )
  ).data.count
}

/** `qrUploadId` is the QR code the administrator paid to; Cloud refuses it with QR_CODE_CHANGED once replaced. */
export async function payAgentWithdrawal(
  withdrawalId: string,
  proofImage: string,
  qrUploadId: string,
  key: string
): Promise<AgentWithdrawal> {
  return (
    await api.post<AgentWithdrawal>(
      `${webBase}/admin/agent-withdrawals/${encodeURIComponent(withdrawalId)}/pay`,
      { proofImage, qrUploadId },
      {
        headers: { 'Idempotency-Key': key },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function rejectAgentWithdrawal(
  withdrawalId: string,
  reason: string,
  key: string
): Promise<AgentWithdrawal> {
  return (
    await api.post<AgentWithdrawal>(
      `${webBase}/admin/agent-withdrawals/${encodeURIComponent(withdrawalId)}/reject`,
      { reason },
      {
        headers: { 'Idempotency-Key': key },
        skipErrorHandler: true,
      }
    )
  ).data
}

export function newAdminWithdrawalIdempotencyKey(
  action: 'pay' | 'reject'
): string {
  return idempotencyKey(`agent-withdrawal-${action}`)
}

export async function getAgentSettlementPolicy(
  signal?: AbortSignal
): Promise<AdminAgentSettlementPolicy> {
  return (
    await api.get<AdminAgentSettlementPolicy>(
      `${webBase}/admin/agent-settlement-policy`,
      { signal }
    )
  ).data
}

/** Amounts are RMB and rates are percentages, each with at most two decimals. */
export async function publishAgentSettlementPolicy(input: {
  minWithdrawal: string
  maxWithdrawal: string
  taxRatePercent: string
  expirySharePercent: string
}): Promise<AdminAgentSettlementPolicy> {
  return (
    await api.post<AdminAgentSettlementPolicy>(
      `${webBase}/admin/agent-settlement-policy`,
      { ...input, confirmed: true },
      {
        headers: {
          'Idempotency-Key': idempotencyKey('agent-settlement-policy'),
        },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function getAdminAgentEarningsSummary(
  principalId: string,
  signal?: AbortSignal
): Promise<AdminAgentEarningsSummary> {
  return (
    await api.get<AdminAgentEarningsSummary>(
      `${webBase}/admin/agents/${encodeURIComponent(principalId)}/earnings-summary`,
      { signal }
    )
  ).data
}

export async function getAgentStatusPreview(
  principalId: string,
  signal?: AbortSignal
): Promise<AgentStatusPreview> {
  return (
    await api.get<AgentStatusPreview>(
      `${webBase}/admin/agents/${encodeURIComponent(principalId)}/status-preview`,
      { signal }
    )
  ).data
}

export async function changeAgentStatus(
  principalId: string,
  action: 'disable' | 'enable',
  reason: string,
  key: string
): Promise<AgentStatusChangeResult> {
  return (
    await api.post<AgentStatusChangeResult>(
      `${webBase}/admin/agents/${encodeURIComponent(principalId)}/${action}`,
      { reason },
      {
        headers: { 'Idempotency-Key': key },
        skipErrorHandler: true,
      }
    )
  ).data
}

export function newAgentStatusIdempotencyKey(
  action: 'disable' | 'enable'
): string {
  return idempotencyKey(`agent-${action}`)
}

/**
 * A local store returns an authenticated Cloud content path that must be read through the Canvas proxy; object storage
 * returns a short-lived signed URL the browser opens directly.
 */
export async function resolveAgentWithdrawalImage(
  file: AgentWithdrawalFile,
  signal?: AbortSignal
): Promise<{ kind: 'remote'; url: string } | { kind: 'blob'; blob: Blob }> {
  if (!file.url.startsWith('/v1/web/')) return { kind: 'remote', url: file.url }
  const blob = (
    await api.get<Blob>(`/canvas-api${file.url}`, {
      responseType: 'blob',
      signal,
      skipErrorHandler: true,
    })
  ).data
  return { kind: 'blob', blob }
}

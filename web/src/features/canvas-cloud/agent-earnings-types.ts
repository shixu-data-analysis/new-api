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
import type { CanvasPage } from './types'

export type AgentPageSize = 10 | 20 | 30 | 40 | 50 | 100

/** Rates are basis points (1/10000); amounts are RMB minor units (fen). */
export interface AgentSettlementPolicy {
  minWithdrawalMinor: number
  maxWithdrawalMinor: number
  taxRateBasisPoints: number
  expiryShareRateBasisPoints: number
}

export interface AdminAgentSettlementPolicy extends AgentSettlementPolicy {
  version: number | null
  effectiveAt: string | null
}

export interface AgentWithdrawalFile {
  url: string
  expiresAt: string
}

/** The agent's one current payment QR code; it does not expire. `expiresAt` is when the URL expires. */
export interface AgentPaymentQr extends AgentWithdrawalFile {
  /** Changes with every upload; a payment confirms the upload it was paid to. */
  uploadId: string
  uploadedAt: string
}

export interface AgentPaymentQrResult {
  uploadId: string
  uploadedAt: string
  /** Requested withdrawals now paid to the new code. */
  pendingWithdrawalCount: number
}

export interface AgentEarningsSummary {
  status: 'ACTIVE' | 'DISABLED'
  periodMonth: string
  /** RMB yuan with 12 decimals. */
  unsettledAmount: string
  availableMinor: string
  paidMinor: string
  policy: AgentSettlementPolicy
  /** Null before the first upload. */
  paymentQr: AgentPaymentQr | null
}

export interface AdminAgentEarningsSummary {
  agentPrincipalId: string
  status: 'ACTIVE' | 'DISABLED'
  periodMonth: string
  unsettledAmount: string
  availableMinor: string
  paidMinor: string
}

export interface AgentMonthlyStatement {
  id: string
  periodMonth: string
  consumptionMinor: string
  expiryShareMinor: string
  totalMinor: string
  settledAt: string
  agentPrincipalId?: string
  agentUsername?: string | null
}

export interface AgentMonthlyStatementPage extends CanvasPage<AgentMonthlyStatement> {
  months: string[]
}

/** Amounts are RMB yuan with 12 decimals. */
export interface AgentStatementCustomer {
  customerId: string
  username: string | null
  settledPoints: string
  paidPoints: string
  customerPaidAmount: string
  modelFeeAmount: string
  consumptionEarning: string
  expiredPoints: string
  expiryShare: string
  total: string
}

export interface AgentStatementCustomerList {
  periodMonth: string
  items: AgentStatementCustomer[]
}

export type AgentWithdrawalStatus = 'REQUESTED' | 'PAID' | 'REJECTED'

export interface AgentWithdrawal {
  id: string
  amountMinor: string
  taxMinor: string
  netMinor: string
  taxRateBasisPoints: number
  status: AgentWithdrawalStatus
  requestedAt: string
  processedAt: string | null
  rejectReason: string | null
  /** Requested while the agent was DISABLED: the whole available balance, outside the min and max. */
  fullBalance: boolean
  /** Null until a payment proof exists. */
  proofExpired: boolean | null
  proofRetentionDays: number | null
  unread: boolean
}

export interface AgentWithdrawalDetail extends AgentWithdrawal {
  proof: AgentWithdrawalFile | null
}

export interface AdminAgentWithdrawal extends AgentWithdrawal {
  agentPrincipalId: string
  agentUsername: string | null
  processedByUsername: string | null
  overdue: boolean
}

export interface AdminAgentWithdrawalDetail extends AdminAgentWithdrawal {
  /** The agent's current QR code while the request is pending. */
  qr: AgentPaymentQr | null
  proof: AgentWithdrawalFile | null
}

export interface AgentStatusPreview {
  agentPrincipalId: string
  username: string | null
  status: 'ACTIVE' | 'DISABLED'
  customerCount: number
  inviteCodeCount: number
  availableMinor: string
}

export interface AgentStatusChangeResult {
  agentPrincipalId: string
  status: 'ACTIVE' | 'DISABLED'
  pausedInviteCodeCount?: number
  resumedInviteCodeCount?: number
}

export interface AdminAgentStatementQuery {
  page: number
  pageSize: AgentPageSize
  agentPrincipalId?: string
  agentUsername?: string
  month?: string
}

export interface AdminAgentWithdrawalQuery {
  page: number
  pageSize: AgentPageSize
  agentPrincipalId?: string
  agentUsername?: string
  status?: AgentWithdrawalStatus
  requestedFrom?: string
  requestedTo?: string
}

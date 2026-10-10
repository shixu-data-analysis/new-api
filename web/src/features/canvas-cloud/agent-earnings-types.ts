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

export interface AgentEarningsSummary {
  status: 'ACTIVE' | 'DISABLED'
  periodMonth: string
  /** RMB yuan with 12 decimals. */
  unsettledAmount: string
  availableMinor: string
  paidMinor: string
  policy: AgentSettlementPolicy
  previousQr: {
    withdrawalId: string
    expired: boolean
    retentionDays: number
    file: AgentWithdrawalFile | null
  } | null
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
  returnedToBalance: boolean
  qrExpired: boolean
  /** Null until a payment proof exists. */
  proofExpired: boolean | null
  qrRetentionDays: number
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
  qr: AgentWithdrawalFile | null
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
  forfeitedMinor: string
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

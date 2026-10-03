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
export type DashboardPeriodType =
  | 'MONTH'
  | 'LAST_MONTH'
  | 'LAST_30_DAYS'
  | 'CUSTOM'
export type DashboardGroupBy =
  | 'MODEL'
  | 'PROVIDER'
  | 'TAG'
  | 'CAPABILITY'
  | 'AGENT'
  | 'CUSTOMER'
export type DashboardGroupSort =
  | 'consumedPoints'
  | 'listAmount'
  | 'giftAmount'
  | 'cashSupport'
  | 'recordedCost'
  | 'contribution'
  | 'listContribution'
export type PointSourceCategory =
  | 'PURCHASED'
  | 'RECHARGE_BONUS'
  | 'INDEPENDENT_BONUS'
export type ProviderCostIncompleteReason =
  | 'MISSING_USAGE'
  | 'MISSING_RATE'
  | 'UNKNOWN_RESULT'
  | 'UNCLASSIFIED'
export type DashboardFlowType =
  | 'ISSUED'
  | 'CONSUMED'
  | 'EXPIRED'
  | 'OTHER_DECREASE'
export type DashboardFlowSubType =
  | 'RECHARGE_PURCHASE'
  | 'RECHARGE_BONUS'
  | 'MANUAL_OR_CAMPAIGN'
  | 'INVITE_BONUS'
  | 'REISSUE'
  | 'TASK_SETTLE'
  | 'DEBT_REPAYMENT'
  | 'EXPIRED_AT_DEADLINE'
  | 'EXPIRED_AFTER_RELEASE'
  | 'POINT_RETURN'
  | 'MANUAL_DEDUCTION'
  | 'CLAWBACK'
export type DashboardBalanceState =
  | 'AVAILABLE'
  | 'RESERVED_VALID'
  | 'RESERVED_EXPIRED'
export type DashboardReconciliationStatus =
  | 'BALANCED'
  | 'UNBALANCED'
  | 'DATA_INCOMPLETE'
export type DashboardIssueType =
  | 'STATE_UNRECONSTRUCTABLE'
  | 'SOURCE_UNRESOLVED'
  | 'FLOW_UNCLASSIFIED'
  | 'TRANSFER_UNPAIRED'
  | 'DEBT_REPAYMENT_UNLINKED'
  | 'POINT_RETURN_UNLINKED'

/** Customer scope shared by the page and its drawers; agentPrincipalId and noAgent exclude each other. */
export interface DashboardScopeQuery {
  from: string
  timeZone: string
  agentPrincipalId?: string
  noAgent?: boolean
  customerId?: string
}

export interface DashboardSummaryQuery extends DashboardScopeQuery {
  to?: string
  periodType: DashboardPeriodType
  groupBy: DashboardGroupBy
  groupPage: number
  groupPageSize: 10 | 20 | 30 | 40 | 50 | 100
  groupSortBy: DashboardGroupSort
  groupSortOrder: 'asc' | 'desc'
  issuePage?: number
}

export interface DashboardIssue {
  type: DashboardIssueType
  customerId: string | null
  customerName: string | null
  relatedKind: 'LOT' | 'LEDGER'
  relatedId: string
  impactPoints: string | null
}

export interface DashboardGroupRow {
  key: string | null
  name: string | null
  modelStatus: string | null
  consumedPoints: string
  listAmountRmb: string
  cashSupportRmb: string
  recordedCostRmb: string
  incompleteCostTaskCount: number
  modelCount: number
}

/** Amounts are unrounded RMB decimal strings; rates are null when their denominator is zero. */
export interface DashboardSummary {
  asOf: string
  period: {
    from: string
    to: string
    timeZone: string
    periodType: DashboardPeriodType
  }
  scope: {
    agentPrincipalId: string | null
    noAgent: boolean
    customerId: string | null
  }
  points: {
    opening: string
    issued: string
    consumed: string
    expired: string
    otherDecrease: string
    closing: string
    available: string
    expiringWithin7Days: string
    reservedValid: string
    reservedExpired: string
    outstandingTaskDebt: string
  }
  cashSupportRmb: {
    opening: string
    issued: string
    consumed: string
    expired: string
    otherDecrease: string
    closing: string
  }
  cashSupportPerPoint: { closing: string | null; consumed: string | null }
  reconciliation: {
    status: DashboardReconciliationStatus
    differencePoints: string
    differenceCashSupportRmb: string
    locatedImpactPoints: string
    unlocatedDifferencePoints: string
    issues: {
      items: DashboardIssue[]
      total: number
      page: number
      pageSize: number
    }
  }
  consumption: {
    consumedPoints: string
    listAmountRmb: string
    cashSupportRmb: string
    recordedCostRmb: string
    contributionRmb: string
    contributionRate: string | null
    giftShare: string | null
    incompleteCostTaskCount: number
    unknownResultTaskCount: number
    provisional: boolean
  }
  sources: {
    items: Array<{
      category: PointSourceCategory
      points: string
      cashSupportRmb: string
    }>
    graceConvertedPoints: string
  }
  groups: {
    groupBy: DashboardGroupBy
    items: DashboardGroupRow[]
    total: number
    page: number
    pageSize: number
    sortBy: DashboardGroupSort
    sortOrder: 'asc' | 'desc'
  }
  previous: {
    from: string
    to: string
    issuedPoints: string
    consumedPoints: string
    expiredPoints: string
    otherDecreasePoints: string
    listAmountRmb: string
    cashSupportRmb: string
    recordedCostRmb: string
    contributionRmb: string
    contributionRate: string | null
  }
}

/** Narrows drawer facts to one row of the grouped table. */
export interface DashboardGroupRowFilter {
  modelKey?: string
  providerId?: string
  tagId?: string
  untagged?: boolean
  capability?: string
  untypedCapability?: boolean
  taskId?: string
}

interface DashboardDrawerQuery extends DashboardScopeQuery {
  to: string
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  sortOrder: 'asc' | 'desc'
}

export interface DashboardBalanceQuery extends DashboardDrawerQuery {
  at: 'OPENING' | 'CLOSING'
  state?: DashboardBalanceState
  sourceCategory?: PointSourceCategory
  expiringWithinDays?: number
  expiresFrom?: string
  expiresTo?: string
  sortBy: 'points' | 'cashSupport' | 'expiresAt' | 'customer'
}

export interface DashboardBalanceRow {
  lotId: string
  customerId: string
  customerName: string | null
  sourceCategory: PointSourceCategory | null
  graceConverted: boolean
  state: DashboardBalanceState
  points: string
  cashSupportRmb: string
  expiresAt: string | null
}

export interface DashboardBalancePage {
  asOf: string
  at: string
  summary: {
    points: string
    cashSupportRmb: string
    available: string
    reservedValid: string
    reservedExpired: string
  }
  items: DashboardBalanceRow[]
  total: number
  page: number
  pageSize: number
}

export interface DashboardFlowQuery
  extends DashboardDrawerQuery, DashboardGroupRowFilter {
  flowType: DashboardFlowType
  subType?: DashboardFlowSubType
  sourceCategory?: PointSourceCategory
  graceOnly?: boolean
  sortBy: 'occurredAt' | 'points'
}

export interface DashboardFlowRow {
  id: string
  occurredAt: string
  customerId: string
  customerName: string | null
  flowType: DashboardFlowType
  subType: DashboardFlowSubType
  points: string
  cashSupportRmb: string
  sourceCategory: PointSourceCategory | null
  graceConverted: boolean
  lotId: string
  taskId: string | null
  modelName: string | null
  modelKey: string | null
  modelVersion: number | null
  rechargeOrderNumber: string | null
  pointReturnId: string | null
  refundReferenceAmountMinor: string | null
  reason: string | null
  operatorName: string | null
  lotExpiresAt: string | null
}

export interface DashboardFlowPage {
  asOf: string
  summary: {
    flowType: DashboardFlowType
    points: string
    cashSupportRmb: string
  }
  items: DashboardFlowRow[]
  total: number
  page: number
  pageSize: number
}

export interface DashboardCostQuery
  extends DashboardDrawerQuery, DashboardGroupRowFilter {
  costState: 'ALL' | 'RECORDED' | 'INCOMPLETE'
  incompleteReason?: ProviderCostIncompleteReason
  costEvent?: 'CHARGE' | 'REFUND' | 'ADJUSTMENT'
  sortBy: 'occurredAt' | 'amount'
}

export interface DashboardCostRow {
  id: string
  occurredAt: string
  taskId: string
  customerId: string
  customerName: string | null
  modelName: string | null
  modelKey: string
  modelVersion: number
  costState: 'RECORDED' | 'SETTLED' | 'INCOMPLETE'
  amountRmb: string | null
  incompleteReason: ProviderCostIncompleteReason | null
  costId: string | null
  callId: string | null
  classification: string | null
  costEvent: string | null
  signedAmount: string | null
  currency: string | null
  exchangeRate: string | null
  providerName: string | null
  channelCode: string | null
  upstreamTaskId: string | null
  upstreamRequestId: string | null
  costSource: 'SYSTEM' | 'MANUAL_SETTLEMENT' | null
  settledBy: string | null
  settlementReason: string | null
  canSettle: boolean
  canRevoke: boolean
}

export interface DashboardCostPage {
  asOf: string
  summary: {
    recordedCostRmb: string
    incompleteCostTaskCount: number
    unknownResultTaskCount: number
  }
  items: DashboardCostRow[]
  total: number
  page: number
  pageSize: number
}

export interface ProviderBalanceRow {
  providerId: string
  code: string
  name: string
  websiteUrl: string | null
  lastBalanceRmb: string | null
  lastBalanceAt: string | null
  topUpsAfterRmb: string | null
  costAfterRmb: string | null
  estimatedBalanceRmb: string | null
  /** The provider's own alert threshold; null uses the default threshold. */
  alertThresholdRmb: string | null
  /** The threshold in force; null when neither the provider nor the default sets one. */
  effectiveAlertThresholdRmb: string | null
  /** The estimate is negative or below the threshold in force. */
  belowAlertThreshold: boolean
  /** Tasks with incomplete cost data attributed to the provider after its last balance. */
  incompleteCostTaskCount: number
  balanceAgeDays: number | null
  /** The last back-office balance is older than seven days. */
  balanceStale: boolean
}

export interface ProviderBalanceAlerts {
  asOf: string
  alertCount: number
}

export interface ProviderBalancePage {
  asOf: string
  defaultAlertThresholdRmb: string | null
  /** Providers below their alert threshold across all pages. */
  alertCount: number
  items: ProviderBalanceRow[]
  total: number
  page: number
  pageSize: number
}

export interface ProviderBalanceRecord {
  id: string
  recordType: 'BALANCE' | 'TOP_UP'
  amountRmb: string
  recordedAt: string
  note: string | null
  createdBy: string | null
  createdAt: string
}

export interface ProviderBalanceRecordPage {
  asOf: string
  summary: ProviderBalanceRow
  items: ProviderBalanceRecord[]
  total: number
  page: number
  pageSize: number
}

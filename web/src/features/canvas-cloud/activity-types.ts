/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

export type CanvasActivityType =
  | 'MANUAL_BONUS'
  | 'RECHARGE_BONUS'
  | 'INVITE_BONUS'
  | 'TASK_PRICE_SPECIAL'

export type CanvasActivityStatus =
  | 'WAITING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL_FAILED'
  | 'FAILED'
  | 'CANCELLED'
  | 'NOT_STARTED'
  | 'ACTIVE'
  | 'ENDED'
  | 'STOPPED'

export interface CanvasActivityActor {
  principalId: string
  displayName: string | null
}

export interface CanvasActivity {
  id: string
  promotionId: string
  version: number
  name: string
  type: CanvasActivityType
  status: CanvasActivityStatus
  createdAt: string
  startsAt: string | null
  endsAt: string | null
}

export interface CanvasActivityPage {
  items: CanvasActivity[]
  total: number
  page: number
  pageSize: number
}

export type CanvasManualGrantScope =
  | { type: 'SELECTED'; customerIds: string[] }
  | {
      type: 'RECHARGE_THRESHOLD'
      minimumRechargeAmountMinor: string
      currency: 'CNY'
      redeemedFrom?: string
      redeemedTo?: string
      customerIds?: string[]
      selectionToken?: string
    }

export type CanvasManualGrantScopeSummary =
  | { type: 'SELECTED'; selectedCustomerCount: number }
  | {
      type: 'RECHARGE_THRESHOLD'
      selectedCustomerCount: number
      minimumRechargeAmountMinor: string
      currency: 'CNY'
      redeemedFrom?: string
      redeemedTo?: string
    }

export type CanvasManualGrantUpdateScope =
  | {
      type: 'SELECTED'
      selectionToken: string
      addedCustomerIds?: string[]
      removedCustomerIds?: string[]
      clearBaseline?: true
    }
  | {
      type: 'RECHARGE_THRESHOLD'
      minimumRechargeAmountMinor: string
      currency: 'CNY'
      selectionToken: string
      redeemedFrom?: string
      redeemedTo?: string
      addedCustomerIds?: string[]
      removedCustomerIds?: string[]
      clearBaseline?: true
    }

export type CanvasManualGrantSchedule =
  | { mode: 'IMMEDIATE' }
  | { mode: 'SCHEDULED'; scheduledAt: string }

export interface CanvasManualGrantPlan {
  activityId: string
  version: number
  type: 'MANUAL_BONUS'
  name: string
  points: string
  ttlDays: number
  reason: string
  scope: CanvasManualGrantScopeSummary
  status: CanvasActivityStatus
  schedule: CanvasManualGrantSchedule
  memberCount: number
  pendingCount: number
  processingCount: number
  successCount: number
  failureCount: number
  issuedPoints: string
  createdAt: string
  publisher: CanvasActivityActor | null
  publishedAt: string | null
  actualStartedAt: string | null
  cancelledAt: string | null
  cancelledByPrincipalId: string | null
  cancelledBy: CanvasActivityActor | null
  stoppedAt: null
  stoppedBy: null
}

export type CanvasManualGrantMemberStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'

export interface CanvasManualGrantMember {
  customerId: string
  customer: string
  status: CanvasManualGrantMemberStatus
  qualifyingAmountMinor?: string | null
  qualifyingCurrency?: 'CNY' | null
  attemptCount: number
  creditedAt: string | null
  expiresAt: string | null
  pointLotId: string | null
  failureReason: string | null
}

export interface CanvasManualGrantMemberPage {
  items: CanvasManualGrantMember[]
  total: number
  page: number
  pageSize: number
}

export interface CanvasActivityEligibleCustomer {
  customerId: string
  customer: string
  qualifyingAmountMinor: string
  currency: string
  eligible: boolean
  selected: boolean
}

export interface CanvasActivityEligibleCustomerPage {
  items: CanvasActivityEligibleCustomer[]
  total: number
  page: number
  pageSize: number
  checkedAt: string
}

export interface CanvasEligibilityBasis {
  customerId: string
  currency: string
  checkedAt: string
  qualifyingAmountMinor: string
  orders: Array<{
    rechargeOrderId: string
    orderNumber: string
    originalAmountMinor: string
    returnedReferenceAmountMinor: string
    qualifyingAmountMinor: string
    redeemedAt: string
  }>
}

export interface CanvasBonusActivity {
  id: string
  promotionId: string
  version: number
  type: 'RECHARGE_BONUS' | 'INVITE_BONUS'
  status: 'ACTIVE' | 'STOPPED'
  name: string
  points: string
  ttlDays: number
  reason: string
  createdAt: string
  publisher: CanvasActivityActor | null
  publishedAt: string | null
  stoppedAt: string | null
  stoppedBy: CanvasActivityActor | null
}

export interface CanvasLimitedPriceActivity {
  id: string
  promotionId: string
  version: number
  type: 'TASK_PRICE_SPECIAL'
  name: string
  reason: string
  status: 'NOT_STARTED' | 'ACTIVE' | 'ENDED' | 'STOPPED'
  publisher: { principalId: string; displayName: string | null } | null
  publishedAt: string | null
  stoppedAt: string | null
  stoppedBy: { principalId: string; displayName: string | null } | null
  sourcePriceVersionId: string
  target: {
    customerModel: { id: string; label: string | null }
    priceGroup: { id: string; label: string | null }
    parameterCombination: {
      id: string
      label: string | null
      parameters: Record<string, unknown> | null
    }
  }
  sourcePriceSnapshot: {
    sourcePriceVersionId: string
    billingUnit: 'REQUEST' | 'SECOND' | 'MILLION_TOKENS'
    basePoints: string | null
    baseRatePointsPerRmb: string | null
    kPricingRmb: string | null
    baseTokenRates: CanvasTokenRateVector | null
    tokenCategoryCostReferences: CanvasTokenCategoryCostReference[] | null
  }
  billingUnit: 'REQUEST' | 'SECOND' | 'MILLION_TOKENS'
  basePoints: string | null
  specialPoints: string | null
  baseTokenRates: CanvasTokenRateVector | null
  specialTokenRates: CanvasTokenRateVector | null
  tokenCategoryCostReferences: CanvasTokenCategoryCostReference[] | null
  discountPoints: string | null
  expectedContributionRate: string | null
  budgetConsumedMinor: string | null
  expectedLossMinor: string | null
  startsAt: string
  endsAt: string
}

export type CanvasTokenRateVector = {
  input: string
  output: string
  cacheRead?: string
  cacheWrite?: string
}

export interface CanvasTokenCategoryCostReference {
  category: 'input' | 'output' | 'cacheRead' | 'cacheWrite'
  basePoints: string
  specialPoints: string
  baseRatePointsPerRmb: string | null
  kPricingRmb: string | null
  specialPriceRmb: string | null
  differenceRmb: string | null
  belowCostReference: boolean | null
}

export interface CanvasRechargeBonusBindingRecord {
  participationId: string
  rechargeOrderId: string
  rechargeOrderNumber: string
  rechargeCodeId: string | null
  redemptionStatus: 'UNREDEEMED' | 'REDEEMED'
  customerId: string | null
  customer: string | null
  amountMinor: string
  currency: 'CNY'
  bonusPoints: string
  pointLotId: string | null
  boundAt: string
  redeemedAt: string | null
}

export interface CanvasInviteBonusGrantRecord {
  participationId: string
  inviteClaimId: string
  inviteCodeId: string
  inviteCodePrefix: string
  customerId: string | null
  customer: string | null
  bonusPoints: string
  pointLotId: string
  reservedAt: string
  issuedAt: string
  expiresAt: string | null
}

export interface CanvasLimitedPriceParticipationTaskRecord {
  participationId: string
  quoteId: string
  taskId: string | null
  customerId: string
  customer: string | null
  customerModelId: string
  modelName: string | null
  quoteStatus:
    | 'ACTIVE'
    | 'CONSUMED'
    | 'EXPIRED'
    | 'REPLACED_SAME_PRICE'
    | 'REPLACED_LOWER_PRICE'
    | 'REPLACED_HIGHER_PRICE'
  executionStatus:
    | 'ACCEPTED'
    | 'PROCESSING'
    | 'SUCCEEDED'
    | 'CONFIRMED_FAILED'
    | 'UNKNOWN'
    | null
  billingStatus:
    | 'FROZEN'
    | 'SETTLED'
    | 'RELEASED_FAILED'
    | 'RELEASED_TIMEOUT'
    | null
  basePoints: string
  specialPoints: string
  discountPoints: string
  costReferenceMinor: string
  expectedLossMinor: string
  settledPoints: string | null
  participatedAt: string
}

export interface CanvasActivityRecordPage<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type CanvasActivityDetail =
  | CanvasManualGrantPlan
  | CanvasBonusActivity
  | CanvasLimitedPriceActivity

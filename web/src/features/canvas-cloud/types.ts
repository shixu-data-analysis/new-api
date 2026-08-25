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
export type CanvasPrincipalType = 'CUSTOMER' | 'PLATFORM_ADMIN' | 'BOSS'

export interface CanvasSession {
  principalId: string
  principalType: CanvasPrincipalType
  displayName: string
  emailMasked: string | null
}

export interface CanvasAdminRechargeCode {
  id: string
  name: string
  status: 'ACTIVE' | 'REDEEMED' | 'VOID' | 'EXPIRED'
  maskedCode: string
  currency: 'CNY'
  amountMinor: string
  points: string
  createdAt: string
  expiresAt: string
  redeemedAt: string | null
}

export interface CanvasIssuedRechargeCodes {
  created: boolean
  codes: Array<{ id: string; code: string }>
  items: CanvasAdminRechargeCode[]
}

export interface CanvasCustomerWorkspace {
  wallet: {
    availablePoints: string
    paidAvailablePoints: string
    bonusAvailablePoints: string
    lots: Array<{
      id: string
      type: string
      availablePoints: string
      remainingPoints: string
      reservedPoints: string
      expiresAt: string | null
      issuedAt: string
    }>
  }
  rechargeOrders: Array<{
    id: string
    orderNumber: string
    status: string
    currency: string
    listedAmountMinor: string
    createdAt: string
  }>
  tasks: Array<{
    id: string
    modelName: string
    quotedPoints: string
    executionStatus: string
    customerBillingStatus: string
    providerReconcileStatus: string
    acceptedAt: string
    completedAt: string | null
  }>
  ledger: Array<{
    id: string
    eventType: string
    eventPoints: string
    remainingDelta: string
    reservedDelta: string
    taskId: string | null
    refundLinkId: string | null
    reason: string | null
    occurredAt: string
  }>
}

export interface CanvasCatalogModel {
  id: string
  name: string
  catalog: Record<string, unknown>
  parameterCombinations: Array<{
    id: string
    parameters: Record<string, unknown>
    billingDimensions: Record<string, unknown>
    points: string
  }>
}

export interface CanvasAdminWorkspace {
  principal: { principalId: string; principalType: 'PLATFORM_ADMIN' | 'BOSS' }
  customers: CanvasAdminCustomerPointBalance[]
  channels: Array<{
    id: string
    providerName: string
    code: string
    version: number
    status: string
    protocolAdapter: string
    upstreamModel: string
    effectiveAt: string | null
  }>
  prices: Array<{
    id: string
    modelName: string
    priceGroup: string
    version: number
    status: string
    points: string
    breakEvenPoints: string
    targetMarginPoints: string
    effectiveAt: string | null
  }>
  refunds: Array<{
    id: string
    refundReference: string
    orderNumber: string
    status: string
    cashAmountMinor: string
    pointsRequested: string
    pointsClawedBack: string
    pointsOutstanding: string
    recoveryStatus: string | null
    createdAt: string
  }>
  reconciliationTasks: Array<{
    id: string
    modelName: string
    executionStatus: string
    customerBillingStatus: string
    providerReconcileStatus: string
    upstreamTaskId: string | null
    acceptedAt: string
  }>
}

export interface CanvasAdminCustomerPointBalance {
  customerId: string
  newApiUserId: string
  username: string | null
  emailMasked: string | null
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
  availablePoints: string
  paidAvailablePoints: string
  bonusAvailablePoints: string
}

export interface CanvasContributionReport {
  originalBatchContributionMinor: string
  refundAndChargebackAdjustmentsMinor: string
  adjustedContributionMinor: string
  reconciliationTimeoutLossMinor: string
  disclaimer: string
}

export interface CanvasModelReleaseManifest {
  schemaVersion: 1
  changeId: string
  review: {
    sourceRef: string
    decisionSummary: string
    evidenceRefs: string[]
  }
  provider: { code: string; internalName: string }
  channel: {
    code: string
    version: number
    protocolAdapter: string
    upstreamModel: string
    executionSnapshot: Record<string, unknown>
  }
  model: {
    modelKey: string
    version: number
    publicName: string
    publicCatalogSnapshot: Record<string, unknown>
    privateExecutionSnapshot: Record<string, unknown>
  }
  combinations: Array<{
    key: string
    normalizedParameters: Record<string, unknown>
    billingDimensionsSnapshot: Record<string, unknown>
  }>
  prices: Array<{
    priceGroupCode: string
    combinationKey: string
    version: number
    points: string
    baseRateSnapshot: string
    targetMarginRate: string
    successProbability: string
    kTheoryMinor: string
    kActualMinor: string | null
    kPricingMinor: string
    riskBufferMinor: string
    breakEvenPointsCeil: string
    targetMarginPointsCeil: string
    pricingAssumptionsSnapshot: Record<string, unknown>
  }>
}

export interface CanvasModelReleasePlan {
  changeId: string
  manifestSha256: string
  target: 'local' | 'stg'
  action: 'CREATE_DRAFT' | 'REPLAY'
  existingStatus: string | null
  providerAction: 'CREATE' | 'REUSE'
  priceGroups: string[]
  publicationOrder: [
    'PROVIDER_CHANNEL',
    'CUSTOMER_MODEL',
    'PRICE_VERSION',
    'MODEL_RELEASE',
  ]
  changes: Array<{
    resourceType:
      | 'PROVIDER'
      | 'PROVIDER_CHANNEL'
      | 'CUSTOMER_MODEL'
      | 'PARAMETER_COMBINATION'
      | 'PRICE_VERSION'
    key: string
    action: 'CREATE' | 'REUSE' | 'CREATE_VERSION' | 'REPLACE' | 'REPLAY'
    current: Record<string, unknown> | null
    proposed: Record<string, unknown>
  }>
}

export interface CanvasModelReleaseSummary {
  changeId: string
  manifestSha256: string
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED'
  target: 'local' | 'stg'
  sourceRef: string
  decisionSummary: string
  manifest: CanvasModelReleaseManifest
  createdAt: string
  approvedAt: string | null
  effectiveAt: string | null
}

export interface CanvasModelReleaseResult {
  changeId: string
  manifestSha256: string
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED'
}

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

export interface CanvasAdminRechargeCodePage {
  items: CanvasAdminRechargeCode[]
  total: number
  page: number
  pageSize: 20 | 50 | 100
}

export interface CanvasAdminRechargeCodeQuery {
  page: number
  pageSize: 20 | 50 | 100
  search?: string
  status?: CanvasAdminRechargeCode['status']
  createdFrom?: string
  createdTo?: string
  sortBy:
    | 'name'
    | 'status'
    | 'amount'
    | 'points'
    | 'createdAt'
    | 'expiresAt'
    | 'redeemedAt'
  sortOrder: 'asc' | 'desc'
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
    modelKey: string
    modelName: string
    priceGroupCode: string
    priceGroup: string
    combinationKey: string
    normalizedParameters: Record<string, unknown>
    version: number
    status: string
    points: string
    baseRatePointsPerRmb: string
    targetMarginRate: string
    successProbability: string
    kTheoryRmb: string
    kActualRmb: string | null
    kPricingRmb: string
    riskBufferRmb: string
    breakEvenPoints: string
    targetMarginPoints: string
    pricingAssumptionsSnapshot: Record<string, unknown>
    createdByPrincipalId: string
    approvedByPrincipalId: string | null
    createdAt: string
    approvedAt: string | null
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

export interface CanvasPointIssuanceRateVersion {
  id: string
  version: number
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'RETIRED'
  pointsPerRmb: string
  decisionSummary: string
  evidenceRefs: string[]
  createdByPrincipalId: string
  approvedByPrincipalId: string | null
  createdAt: string
  approvedAt: string | null
  effectiveAt: string | null
}

export interface CanvasAdminTestingModel {
  id: string
  modelKey: string
  version: number
  name: string
  description: string
  enabled: boolean
  resourceEnabled: boolean
  presentationVersion: number | null
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED'
  customerVisible: boolean
  pricedTargets: number
  totalTargets: number
  provider: { code: string; name: string }
  channel: {
    code: string
    version: number
    status: string
    protocolAdapter: string
    upstreamModel: string
    executionSnapshot: Record<string, unknown>
  }
  publicCatalogSnapshot: Record<string, unknown>
  parameterCombinations: Array<{
    id: string
    key: string
    enabled: boolean
    normalizedParameters: Record<string, unknown>
    billingDimensionsSnapshot: Record<string, unknown>
  }>
  pricingTargets: Array<{
    priceGroupId: string
    priceGroupCode: string
    priceGroupName: string
    priceGroupVersion: number
    parameterCombinationId: string
    combinationKey: string
    priced: boolean
    priceVersionId: string | null
    priceVersion: number | null
    points: string | null
  }>
  createdAt: string
  effectiveAt: string | null
}

export interface CanvasPriceGroupVersion {
  id: string
  code: string
  internalName: string
  version: number
  status: 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'RETIRED'
  createdAt: string
  approvedAt: string | null
  effectiveAt: string | null
}

export interface CanvasModelCatalogBundle {
  schemaVersion: 2
  bundleId: string
  bundleVersion: string
  providers: Array<Record<string, unknown>>
  channels: Array<Record<string, unknown>>
  models: Array<Record<string, unknown>>
  openapiContracts: Array<{ path: string; document: Record<string, unknown> }>
  adapterProfiles: Array<{ path: string; profile: Record<string, unknown> }>
}

export interface CanvasModelCatalogPlanChange {
  resourceType: string
  key: string
  action: 'CREATE' | 'REUSE' | 'CREATE_VERSION' | 'NO_OP' | 'CONFLICT'
  currentVersion: number | null
  proposedVersion: number | null
  detail: Record<string, unknown>
}

export interface CanvasModelCatalogPlanModel {
  productKey: string
  displayName: string
  capability: 'chat.generate' | 'image.generate' | 'video.generate'
  action: CanvasModelCatalogPlanChange['action']
  currentVersion: number | null
  proposedVersion: number | null
  customerVisibleAfterPublish: false
  publicInteraction: {
    defaultParams: Record<string, unknown>
    paramSchema: Record<string, unknown>
    referenceLimits: Record<string, unknown>
  }
}

export interface CanvasModelCatalogPlan {
  bundleId: string
  bundleVersion: string
  manifestSha256: string
  action: 'PUBLISH' | 'REPLAY' | 'NO_CHANGES' | 'CONFLICT'
  blocking: boolean
  diagnostics: Array<{
    code: string
    sourceFile: string
    jsonPath: string
    recommendation: string
  }>
  changes: CanvasModelCatalogPlanChange[]
  models: CanvasModelCatalogPlanModel[]
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

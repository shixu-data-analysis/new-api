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
export type CanvasPrincipalType = 'CUSTOMER' | 'PLATFORM_ADMIN' | 'SUPER_ADMIN'

export interface CanvasSession {
  principalId: string
  principalType: CanvasPrincipalType
  displayName: string
  emailMasked: string | null
  inviterEnabled: boolean
}

export interface CanvasRuntimeConfiguration {
  environment: 'UAT' | 'STG' | 'PROD'
  taskMedia: CanvasRuntimeTaskMediaConfiguration | null
  databaseBackup: CanvasRuntimeDatabaseBackupConfiguration | null
}

export interface CanvasRuntimeTaskMediaConfiguration {
  id: string
  version: number
  status: string
  endpoint: string
  bucket: string
  inputRetentionHours: number
  outputRetentionHours: number
  downloadUrlTtlSeconds: number
  reason: string
  effectiveAt: string | null
  createdByPrincipalId: string
  updatedBy: string
  createdAt: string
  latestCheck: CanvasRuntimeConnectionCheck | null
}

export interface CanvasRuntimeDatabaseBackupConfiguration {
  id: string
  version: number
  status: string
  endpoint: string
  bucket: string
  reason: string
  effectiveAt: string | null
  createdByPrincipalId: string
  updatedBy: string
  createdAt: string
  latestCheck: CanvasRuntimeConnectionCheck | null
}

export interface CanvasProviderConfigurationQuery {
  providerId?: string
  credentialGroupId?: string
  credentialGroupVersionId?: string
  modelId?: string
  modelScope: 'BOUND_TO_GROUP' | 'ELIGIBLE'
  modelName?: string
  modelKey?: string
  modelStatus?: string
  credentialGroup?: string
  bindingStatus?: 'BOUND' | 'UNBOUND'
  sortBy: 'publicName' | 'modelKey' | 'status' | 'credentialGroup'
  sortOrder: 'asc' | 'desc'
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
}

export interface CanvasProviderConfiguration {
  environment: 'UAT' | 'STG' | 'PROD'
  selectedProviderId: string | null
  selectedCredentialGroupId: string | null
  navigationTarget: {
    modelId: string
    bindingStatus: 'BOUND' | 'UNBOUND'
  } | null
  providers: Array<{
    id: string
    code: string
    name: string
    credentialSchemes: string[]
  }>
  credentialGroups: Array<{
    id: string
    credentialGroupId: string
    providerId: string
    providerCode: string
    name: string
    version: number
    status: string
    schemeNames: string[]
    reason: string
    effectiveAt: string | null
    createdByPrincipalId: string
    updatedBy: string
    createdAt: string
    boundModelCount: number
    versionCount: number
  }>
  models: CanvasPage<CanvasProviderModel>
}

export interface CanvasProviderModel {
  id: string
  modelKey: string
  publicName: string
  status: string
  providerId: string
  providerCode: string
  providerChannelId: string
  credentialBindingId: string | null
  credentialBindingVersion: number | null
  credentialBindingEffectiveAt: string | null
  credentialGroupId: string | null
  credentialGroupName: string | null
  credentialGroupVersionId: string | null
  credentialGroupVersion: number | null
  latestAccessCheck: CanvasModelAccessPermissionCheck | null
}

export interface CanvasProviderCredentialVersion {
  id: string
  credentialGroupId: string
  providerId: string
  providerCode: string
  name: string
  version: number
  status: string
  schemeNames: string[]
  reason: string
  effectiveAt: string | null
  createdByPrincipalId: string
  updatedBy: string
  affectedModelCount: number | null
  createdAt: string
}

export interface CanvasProviderCredentialHistoryQuery {
  targetVersionId?: string
  version?: number
  operator?: string
  reason?: string
  sortBy: 'version' | 'effectiveAt' | 'updatedBy' | 'reason'
  sortOrder: 'asc' | 'desc'
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
}

export interface CanvasCredentialVersionAffectedModels extends CanvasPage<{
  id: string
  publicName: string
}> {
  factAvailable: boolean
}

export interface CanvasModelCredentialBindingVersion {
  id: string
  version: number
  status: string
  credentialGroupId: string
  credentialGroupVersionId: string
  credentialGroupVersion: number
  credentialGroupName: string
  reason: string | null
  effectiveAt: string | null
  updatedBy: string
  createdAt: string
}

export interface CanvasCredentialRotationPreview {
  credentialGroupId: string
  providerId: string
  name: string
  currentCredentialGroupVersionId: string
  currentVersion: number
  nextVersion: number
  affectedModels: Array<{
    customerModelId: string
    publicName: string
    bindingId: string
    bindingVersion: number
  }>
}

export interface CanvasModelBindingPreview {
  credentialGroupVersionId: string
  targetCredentialGroupName: string
  targetCredentialGroupVersion: number
  models: Array<{
    customerModelId: string
    publicName: string
    currentCredentialGroupName: string | null
    currentCredentialGroupVersion: number | null
    bindingId: string | null
    bindingVersion: number | null
  }>
}

export interface CanvasRuntimeConnectionCheck {
  outcome: 'PASSED' | 'FAILED'
  reasonCode: string | null
  checkedBy?: string
  checkedAt: string
}

export interface CanvasModelAccessPermissionCheck {
  outcome: 'PASSED' | 'FAILED' | 'UNVERIFIABLE'
  reasonCode: string | null
  checkedBy?: string
  checkedAt: string
}

export interface CanvasAdminRechargeCode {
  id: string
  name: string
  status: 'ACTIVE' | 'REDEEMED' | 'VOID' | 'EXPIRED'
  maskedCode: string
  currency: 'CNY'
  amountMinor: string
  points: string
  bonusPoints: string
  createdAt: string
  expiresAt: string
  redeemedAt: string | null
}

export interface CanvasAdminRechargeCodePage {
  items: CanvasAdminRechargeCode[]
  total: number
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
}

export interface CanvasAdminRechargeCodeQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  name?: string
  code?: string
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

export type CanvasInviteCodeStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'REVOKED'
  | 'EXPIRED'

export interface CanvasAdminInviteCode {
  id: string
  maskedCode: string
  status: CanvasInviteCodeStatus
  effectiveStatus: CanvasInviteCodeStatus
  maxRegistrations: string
  reservedCount: string
  consumedCount: string
  remainingCount: string
  validFrom: string
  expiresAt: string
  priceGroupId: string
  priceGroupCode: string
  priceGroupName: string
  initialBonusPoints: string | null
  initialBonusTtlDays: number | null
  promotionVersionId: string | null
  referralSource: string | null
  agent: CanvasAgentReference | null
  pausedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface CanvasInviteCodeOptions {
  agents: CanvasAgentReference[]
  priceGroups: Array<{ id: string; code: string; internalName: string }>
  promotions: Array<{
    id: string
    code: string
    internalName: string
    version: number
    status: string
    bonusPoints: string
    bonusTtlDays: number
  }>
}

export interface CanvasAgentReference {
  principalId: string
  username: string
}

export interface CanvasAgentProfile {
  principalId: string
  username: string
  status: 'ACTIVE' | 'DISABLED'
  createdAt: string
}

export interface CanvasAdminAgentQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  search?: string
  status?: CanvasAgentProfile['status']
  sortBy: 'username' | 'status' | 'createdAt'
  sortOrder: 'asc' | 'desc'
}

export interface CanvasAdminInviteCodeQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  code?: string
  priceGroup?: string
  inviter?: string
  status?: CanvasInviteCodeStatus
  sortBy:
    | 'code'
    | 'status'
    | 'priceGroup'
    | 'inviter'
    | 'capacity'
    | 'validFrom'
    | 'expiresAt'
    | 'createdAt'
  sortOrder: 'asc' | 'desc'
}

export interface CanvasAgentWorkspace {
  profile: {
    principalId: string
    username: string
    status: 'ACTIVE'
  }
}

export interface CanvasAgentInviteCode {
  id: string
  maskedCode: string
  status: CanvasInviteCodeStatus
  maxRegistrations: string
  reservedCount: string
  consumedCount: string
  remainingCount: string
  validFrom: string
  expiresAt: string
  activatedCustomers: string
  createdAt: string
}

export interface CanvasAgentCustomer {
  id: string
  username: string | null
  emailMasked: string | null
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
  activatedAt: string | null
}

export interface CanvasAgentInviteCodeQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  search?: string
  status?: CanvasInviteCodeStatus
  sortBy:
    | 'code'
    | 'status'
    | 'capacity'
    | 'activatedCustomers'
    | 'expiresAt'
    | 'createdAt'
  sortOrder: 'asc' | 'desc'
}

export interface CanvasAgentCustomerQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  username?: string
  email?: string
  status?: CanvasAgentCustomer['status']
  sortBy: 'customer' | 'status' | 'activatedAt'
  sortOrder: 'asc' | 'desc'
}

export type CanvasBillingUnit = 'REQUEST' | 'SECOND' | 'MILLION_TOKENS'
export type CanvasTokenCategory =
  | 'input'
  | 'output'
  | 'cacheRead'
  | 'cacheWrite'
export type CanvasTokenRateVector = Record<CanvasTokenCategory, string>
export type CanvasModelPricingTokenRateVector = {
  input: string
  output: string
  cacheRead?: string
  cacheWrite?: string
}
export interface CanvasTokenCategoryRisk {
  category: CanvasTokenCategory
  providerRateRmb: string
  customerRatePoints: string
  breakEvenPointsCeil: string
  belowBreakEven: boolean
  otherVariableCostRmb?: string
  failedUnrecoverableCostRmb?: string
  riskBufferRmb?: string
  kTheoryRmb?: string
  kPricingRmb?: string
  pricingBreakEvenPointsCeil?: string
  targetMarginPointsCeil?: string
  recommendedCustomerRatePoints?: string
  belowPricingBreakEven?: boolean
  belowTargetMargin?: boolean
}

export interface CanvasProviderPricingRow {
  providerId: string
  providerCode: string
  providerName: string
  channelId: string
  channelCode: string
  customerModelId: string
  modelKey: string
  modelName: string
  combinationId: string
  combinationKey: string
  parameters: Record<string, unknown>
  billingDimensions: Record<string, unknown>
  resolvedProviderModelId: string
  rateId: string | null
  rateVersion: number | null
  rateStatus: string | null
  billingUnit: CanvasBillingUnit | null
  nativeAmount: string | null
  tokenRates: CanvasTokenRateVector | null
  currency: string | null
  normalizedAmountMinor: string | null
  normalizedTokenRates: CanvasTokenRateVector | null
  failureChargePolicy:
    | { mode: 'NONE' }
    | { mode: 'SAME_AS_SUCCESS' }
    | { mode: 'FIXED'; normalizedAmountMinor: string }
    | null
  rateEffectiveAt: string | null
  prices: Array<{
    id: string
    groupId: string
    groupName: string
    billingUnit: CanvasBillingUnit
    points: string
    tokenRates: CanvasTokenRateVector | null
    version: number
    status: string
    providerRateVersionId: string | null
    effectiveAt: string | null
    breakEvenPoints: string
    newBreakEvenPoints: string | null
    belowBreakEven: boolean
    categoryRisks: CanvasTokenCategoryRisk[]
    success_probability?: string
    risk_buffer_minor?: string
    pricing_assumptions_snapshot?: Record<string, unknown>
  }>
  riskDecision: {
    id: string
    decisionType: 'REPRICE_SCHEDULED' | 'MANUAL_PAUSE' | 'TEMPORARY_LOSS'
    lossEndsAt: string | null
    maxExpectedLossPoints: string | null
    consumedExpectedLossPoints: string
    reason: string
  } | null
}

export interface CanvasCreatedInviteCode {
  item: CanvasAdminInviteCode
  code: string | null
}

export interface CanvasCustomerWorkspace {
  wallet: {
    debtPoints?: string
    netAvailablePoints?: string
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
    settledPoints?: string
    outstandingDebtPoints?: string
    outputSummaries?: Array<{
      outputIndex: number
      executionStatus: string
      billingStatus: string
      quotedPoints: string
      settledPoints: string | null
      error?: {
        code: string | null
        messages: Record<string, string> | null
      } | null
    }>
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
  principal: { principalId: string; principalType: 'PLATFORM_ADMIN' }
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
  pricePromotions: Array<{
    id: string
    version: number
    status: 'APPROVED' | 'ACTIVE' | 'STOPPED' | 'EXPIRED'
    sourcePriceVersionId: string
    modelKey: string
    modelName: string
    priceGroupCode: string
    priceGroup: string
    combinationKey: string
    basePoints: string
    specialPoints: string
    expectedContributionRate: string
    campaignBudgetMinor: string | null
    maxExpectedLossMinor: string | null
    maxParticipants: string | null
    usedBudgetMinor: string
    usedExpectedLossMinor: string
    participants: string
    approvalReason: string
    startsAt: string
    endsAt: string
    createdAt: string
    approvedAt: string | null
    effectiveAt: string | null
  }>
  refunds: Array<{
    id: string
    refundReference: string
    customerConfirmationReference: string | null
    orderNumber: string
    status: string
    cashAmountMinor: string
    pointsRequested: string
    pointsClawedBack: string
    pointsOutstanding: string
    recoveryStatus: string | null
    createdAt: string
  }>
  executorWorkers: Array<{
    queueName: string
    mode: 'MOCK' | 'REAL'
    workerId: string
    status: 'RUNNING' | 'STOPPING' | 'STOPPED'
    credentialsConfigured: boolean
    startedAt: string
    heartbeatAt: string
    leaseExpiresAt: string
  }>
  reconciliationTasks: Array<{
    id: string
    modelName: string
    executionStatus: string
    customerBillingStatus: string
    providerReconcileStatus: string
    executionOrigin: 'MOCK' | 'REAL' | null
    upstreamTaskId: string | null
    acceptedAt: string
  }>
  recentTasks: Array<{
    id: string
    customerId: string
    customerName: string
    modelName: string
    quotedPoints: string
    settledPoints?: string
    executionStatus: string
    customerBillingStatus: string
    providerReconcileStatus: string
    executionOrigin: 'MOCK' | 'REAL' | null
    upstreamTaskId: string | null
    acceptedAt: string
    completedAt: string | null
  }>
}

export interface CanvasAuditEventPage {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  total: number
  items: Array<{
    id: string
    occurredAt: string
    service: string
    environment: string
    category: string
    action: string
    outcome: 'SUCCESS' | 'FAILURE' | 'DEFERRED'
    severity: 'INFO' | 'WARN' | 'ERROR'
    actorPrincipalId: string | null
    actorType: string
    actorUsername: string | null
    requestId: string | null
    traceId: string | null
    resourceType: string
    resourceId: string | null
    resourceKey: string | null
    reasonCode: string | null
    publicMetadata: Record<string, unknown>
  }>
}

export interface CanvasAuditEventQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  resource?: string
  reason?: string
  category?: string
  action?: string
  outcome?: CanvasAuditEventPage['items'][number]['outcome']
  actorPrincipalId?: string
  resourceType?: string
  resourceId?: string
  customerId?: string
  from?: string
  to?: string
  sortOrder?: 'asc' | 'desc'
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

export interface CanvasTaskPolicySettings {
  quoteTtlSeconds: number
  quoteTtlVersion: number | null
  quoteTtlEffectiveAt: string | null
  bonusFailureGraceDays: number
  bonusFailureGraceVersion: number | null
  bonusFailureGraceEffectiveAt: string | null
  paidExpiryDays: number
  paidExpiryVersion: number | null
  paidExpiryEffectiveAt: string | null
}

export interface CanvasAdminTestingModel {
  id: string
  modelKey: string
  modelIds: Array<{ quality: string | null; modelId: string }>
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
  provider: { id: string; code: string; name: string }
  binding: {
    status: 'BOUND' | 'UNBOUND'
    credentialGroupId: string | null
    credentialGroupName: string | null
    credentialGroupVersionId: string | null
    credentialGroupVersion: number | null
  }
  billingUnit: CanvasBillingUnit | null
  billingUnits: CanvasBillingUnit[]
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

export type CanvasModelPricingFailureChargePolicy =
  | { mode: 'NONE' }
  | { mode: 'SAME_AS_SUCCESS' }
  | { mode: 'FIXED'; nativeAmount: string; normalizedAmountMinor?: string }

export type CanvasTokenCategoryAssumptions = Partial<
  Record<
    CanvasTokenCategory,
    {
      otherVariableCostRmb: string
      riskBufferRmb: string
    }
  >
>

export interface CanvasModelPricingQuestionnaire {
  targetMarginRate: string
  successProbability: string
  successfulTaskCostRmb: string | null
  failedUnrecoverableCostRmb: string | null
  otherVariableCostRmb: string | null
  riskBufferRmb: string
  decisionSummary: string
  evidenceRefs: string[]
  tokenCategoryAssumptions?: CanvasTokenCategoryAssumptions | null
}

export interface CanvasModelPricingCalculation {
  baseRatePointsPerRmb: string
  kTheoryRmb: string
  kPricingRmb: string
  breakEvenPointsCeil: string
  targetMarginPointsCeil: string
}

export interface CanvasModelPricingProviderRate {
  billingUnit: CanvasBillingUnit
  nativeAmount: string
  tokenRates: CanvasModelPricingTokenRateVector | null
  currency: string
  exchangeRateSnapshot: { rate: string; source: string; asOf: string }
  normalizedAmountMinor: string
  normalizedTokenRates: CanvasModelPricingTokenRateVector | null
  failureChargePolicy: CanvasModelPricingFailureChargePolicy
  id?: string
  version?: number
  status?: string
  decisionSummary?: string
  effectiveAt?: string | null
}

export interface CanvasModelPricingPriceSnapshot {
  billingUnit: CanvasBillingUnit
  points: string
  tokenRates: CanvasModelPricingTokenRateVector | null
  questionnaire: CanvasModelPricingQuestionnaire
  calculation?: CanvasModelPricingCalculation
  id?: string
  version?: number
  status?: string
  effectiveAt?: string | null
  providerRateVersionId?: string | null
  assumptions?: {
    schemaVersion: number
    billingContractVersion: number
    billingUnit: CanvasBillingUnit
    tokenRates: CanvasModelPricingTokenRateVector | null
    tokenCategoryRisks: CanvasTokenCategoryRisk[]
    tokenCategoryAssumptions?: CanvasTokenCategoryAssumptions | null
    sourcePriceVersionId: string | null
    pointIssuanceRateConfigVersionId: string
    pointIssuanceRateVersion: number
    targetMarginRate: string
    successfulTaskCostRmb: string
    failedUnrecoverableCostRmb: string
    otherVariableCostRmb: string
    decisionSummary: string
    evidenceRefs: string[]
  }
}

export interface CanvasModelPricingScope {
  parameterCombinationId: string
  providerRate:
    | {
        action?: 'SET'
        nativeAmount: string
        currency: string
        exchangeRateSnapshot: { rate: string; source: string; asOf: string }
        tokenRates?: CanvasModelPricingTokenRateVector
        failureChargePolicy: CanvasModelPricingFailureChargePolicy
      }
    | {
        action: 'KEEP'
        sourceProviderRateVersionId: string
      }
  prices: Array<{
    priceGroupId: string
    action: 'KEEP' | 'SET'
    sourcePriceVersionId?: string
    points?: string
    tokenRates?: CanvasModelPricingTokenRateVector
    targetMarginRate?: string
    tokenCategoryAssumptions?: CanvasTokenCategoryAssumptions
    successProbability?: string
    otherVariableCostRmb?: string
    riskBufferRmb?: string
    decisionSummary?: string
    evidenceRefs?: string[]
  }>
}

export interface CanvasModelPricingModel {
  id: string
  modelKey: string
  name: string
  capability: string
  status: string
  billingUnit: CanvasBillingUnit | null
  allowedBillingUnits: CanvasBillingUnit[]
  tokenCategories: CanvasTokenCategory[]
  combinations: Array<{
    id: string
    key: string
    parameters: Record<string, unknown>
    enabled: boolean
  }>
  hasPublishedPricing: boolean
}

export interface CanvasModelPricingWorkspace {
  models: CanvasModelPricingModel[]
  priceGroups: Array<{ id: string; code: string; internalName: string }>
}

export interface CanvasModelPricingDetail {
  model: CanvasModelPricingModel
  priceGroups: CanvasModelPricingWorkspace['priceGroups']
  pricingScopes: Array<{
    parameterCombinationId: string
    combinationKey: string
    parameters: Record<string, unknown>
    enabled: boolean
    currentProviderRate: CanvasModelPricingProviderRate | null
    prices: Array<{
      priceGroupId: string
      priceGroupCode: string
      priceGroupName: string
      current: CanvasModelPricingPriceSnapshot | null
    }>
  }>
}

export interface CanvasModelPricingPreviewPrice {
  priceGroupId: string
  action: 'KEEP' | 'SET'
  current: CanvasModelPricingPriceSnapshot | null
  proposed: CanvasModelPricingPriceSnapshot | null
  calculation: CanvasModelPricingCalculation | null
  changed: boolean
}

export interface CanvasModelPricingPreview {
  id: string
  expiresAt: string
  customerModelId: string
  billingUnit: CanvasBillingUnit
  effectiveAt: string
  pointIssuanceRate: { id: string; version: number; pointsPerRmb: string }
  unitChange: {
    from: CanvasBillingUnit | null
    to: CanvasBillingUnit
    changed: boolean
  }
  scopes: Array<{
    parameterCombinationId: string
    combinationKey: string
    parameters: Record<string, unknown>
    currentProviderRate: CanvasModelPricingProviderRate | null
    proposedProviderRate: CanvasModelPricingProviderRate
    costChanged: boolean
    prices: CanvasModelPricingPreviewPrice[]
  }>
  conflicts: Array<{
    code: string
    parameterCombinationId?: string
    priceGroupId?: string
    message: string
  }>
  canPublish: boolean
}

export interface CanvasModelPricingLegacyFacts {
  id: string
  version: number
  status: string
  billingUnit: CanvasBillingUnit
  nativeAmount?: string
  tokenRates: CanvasModelPricingTokenRateVector | null
  currency?: string
  exchangeRateSnapshot?: { rate: string; source: string; asOf: string }
  normalizedAmountMinor?: string
  normalizedTokenRates?: CanvasModelPricingTokenRateVector | null
  failureChargePolicy?: CanvasModelPricingFailureChargePolicy
  points?: string
  questionnaire?: CanvasModelPricingQuestionnaire
  calculation?: CanvasModelPricingCalculation
  effectiveAt: string
  providerRateVersionId?: string | null
}

export interface CanvasModelPricingPublicationResult {
  id: string
  customerModelId: string
  version: number
  status: 'APPROVED' | 'PUBLISHED' | 'CANCELLED'
  effectiveAt: string
  billingUnit: CanvasBillingUnit
  providerRateVersionIds: string[]
  priceVersionIds: string[]
  changed: { cost: boolean; price: boolean }
}

export interface CanvasModelPricingPublication {
  id: string
  customerModelId: string
  version: number
  source: 'UNIFIED' | 'LEGACY_PROVIDER_RATE' | 'LEGACY_PRICE'
  status:
    | 'SCHEDULED'
    | 'CANCELLED'
    | 'CURRENT'
    | 'PARTIALLY_CURRENT'
    | 'SUPERSEDED'
  change: 'INITIAL' | 'COST' | 'PRICE' | 'COST_AND_PRICE' | 'UNIT'
  effectiveAt: string
  billingUnit: CanvasBillingUnit
  createdAt: string
  decisionSummary: string
  scopeSummary: Array<{
    combinationId: string
    priceGroupId: string | null
    changeKind: string
    providerRateVersionId: string | null
    priceVersionId: string | null
    rateCurrent: boolean | null
    priceCurrent: boolean | null
  }>
  preview: CanvasModelPricingPreview | null
  before?: CanvasModelPricingLegacyFacts | null
  after?: CanvasModelPricingLegacyFacts | null
  beforeUnavailableReason?:
    | 'LEGACY_SOURCE_NOT_RECORDED'
    | 'SOURCE_PRICE_VERSION_UNAVAILABLE'
  actor: { principalId: string; displayName: string; principalType: string }
}

export interface CanvasModelPricingHistory extends CanvasPage<CanvasModelPricingPublication> {}

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
  username: string | null
  emailMasked: string | null
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
  availablePoints: string
  paidAvailablePoints: string
  bonusAvailablePoints: string
  createdAt?: string
}

export interface CanvasAdminRechargeOrder {
  id: string
  orderNumber: string
  customerId: string | null
  customerName: string | null
  customerEmailMasked: string | null
  status: string
  currency: string
  listedAmountMinor: string
  rechargeCodeMask: string | null
  rechargeCodeStatus: string | null
  expectedPaidPoints: string
  originalPaidPoints: string
  correctedPaidPoints: string
  issuedPaidPoints: string
  availablePaidPoints: string
  availableBonusPoints: string
  remainingCorrectionPoints: string
  eligibleForPaidCorrection: boolean
  paidCorrectionIneligibleReason: string | null
  createdAt: string
  redeemedAt: string | null
}

export interface CanvasPage<T> {
  page: number
  pageSize: number
  total: number
  items: T[]
}

export interface CanvasAdminRefund {
  id: string
  refundReference: string
  customerConfirmationReference: string | null
  orderNumber: string
  status: string
  cashAmountMinor: string
  pointsRequested: string
  pointsClawedBack: string
  pointsOutstanding: string
  recoveryStatus: string | null
  createdAt: string
}

export interface CanvasPointLedgerItem {
  id: string
  pointLotId: string
  eventType: string
  eventPoints: string
  remainingDelta: string
  reservedDelta: string
  taskId: string | null
  refundLinkId: string | null
  reason: string | null
  occurredAt: string
}

export interface CanvasAdminCustomerTask {
  id: string
  modelName: string
  quotedPoints: string
  allocatedPoints: string
  settledPoints: string
  releasedPoints: string
  executionStatus: string
  customerBillingStatus: string
  providerReconcileStatus: string
  upstreamTaskId: string | null
  acceptedAt: string
  completedAt: string | null
}

export interface CanvasAdminTaskLog {
  id: string
  customerId: string
  customerName: string
  modelName: string
  quotedPoints: string
  settledPoints?: string
  outstandingDebtPoints?: string
  outputSummaries?: Array<{
    outputIndex: number
    executionStatus: string
    billingStatus: string
    quotedPoints: string
    settledPoints: string | null
  }>
  executionStatus: string
  customerBillingStatus: string
  providerReconcileStatus: string
  executionOrigin: 'MOCK' | 'REAL' | null
  upstreamTaskId: string | null
  acceptedAt: string
  completedAt: string | null
}

export interface CanvasAdminTaskLogQuery {
  customer?: string
  model?: string
  executionStatus?: string
  billingStatus?: string
  reconciliationStatus?: string
  executionOrigin?: 'MOCK' | 'REAL'
  from?: string
  to?: string
  sortBy:
    | 'customer'
    | 'model'
    | 'quotedPoints'
    | 'executionStatus'
    | 'billingStatus'
    | 'reconciliationStatus'
    | 'source'
    | 'acceptedAt'
    | 'completedAt'
  sortOrder: 'asc' | 'desc'
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
}

export interface CanvasAdminPointLot {
  id: string
  type: string
  sourceType: string
  rechargeOrderId: string | null
  rechargeOrderNumber: string | null
  initialPoints: string
  remainingPoints: string
  reservedPoints: string
  availablePoints: string
  expiresAt: string | null
  issuedAt: string
}

export interface CanvasContributionReport {
  originalBatchContributionMinor: string
  refundAndChargebackAdjustmentsMinor: string
  adjustedContributionMinor: string
  reconciliationTimeoutLossMinor: string
  disclaimer: string
}

export interface ChannelHealthStats {
  succeeded: number
  failed: number
  unknown: number
  processing: number
  sampleCount: number
  successRate: number | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
}
export type ChannelHealthWindow =
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'custom'
  | 'round'
export interface ChannelHealthQuery {
  window: ChannelHealthWindow
  origin: 'REAL' | 'MOCK'
  from?: string
  to?: string
  channelId?: string
  provider?: string
  channel?: string
  enabled?: 'true' | 'false'
  sortBy?:
    | 'providerName'
    | 'code'
    | 'enabled'
    | 'successRate'
    | 'failed'
    | 'unknown'
    | 'lastFailureAt'
  sortOrder?: 'asc' | 'desc'
  page?: number
  pageSize?: number
}
export interface ChannelHealthItem extends ChannelHealthStats {
  id: string
  code: string
  version: number
  providerName: string
  enabled: boolean
  providerEnabled: boolean
  controlVersion: number
  roundStartedAt: string
  affectedModels: Array<{ id: string; name: string }>
}
export interface ChannelHealthReport {
  window: ChannelHealthWindow
  origin: 'REAL' | 'MOCK'
  from: string | null
  to: string
  page: number
  pageSize: number
  total: number
  summary: ChannelHealthStats
  items: ChannelHealthItem[]
  detail: {
    from: string
    to: string
    bucketSeconds: number
    buckets: Array<ChannelHealthStats & { at: string }>
    failures: Array<{ category: string; count: number }>
    operations: Array<{
      id: string
      version: number
      enabled: boolean
      previousEnabled: boolean | null
      reasonCode: string | null
      note: string | null
      legacyReason: string | null
      at: string
      actorName: string
      actorPrincipalId: string
      actorUserId: string | null
    }>
    tasks: Array<{
      id: string
      status: string
      acceptedAt: string
      completedAt: string | null
      failureCategory: string | null
    }>
  } | null
}

export interface CanvasCustomerPriceAssignment {
  id: string
  priceGroupId: string
  internalName: string
  version: number
  reason: string
  actorName: string | null
  effectiveAt: string
  endedAt: string | null
}

export interface CanvasCustomerPriceAssignments extends CanvasPage<CanvasCustomerPriceAssignment> {
  customerId: string
  customerName: string | null
  currentGroup: Pick<
    CanvasPriceGroupVersion,
    'id' | 'internalName' | 'version' | 'status'
  >
}

export type CanvasBusinessFactKind =
  | 'task'
  | 'quote'
  | 'lot'
  | 'ledger'
  | 'allocation'
  | 'order'
  | 'payment'
  | 'refund'
  | 'recovery'
  | 'cost'
  | 'reconciliation'
export interface CanvasBusinessFact {
  id: string
  kind: CanvasBusinessFactKind
  name: string
  status: string
  at: string
}
export interface CanvasBusinessFactDetail extends CanvasBusinessFact {
  fields: Record<string, string | null>
}
export interface CanvasBusinessFactPage extends CanvasPage<CanvasBusinessFact> {
  fact?: CanvasBusinessFactDetail
}

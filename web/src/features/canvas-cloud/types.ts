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
  /** A DISABLED inviter keeps its earnings; each withdrawal request takes the whole available balance at that time. */
  inviterStatus: 'ACTIVE' | 'DISABLED' | null
}

export interface CanvasProvisionedAdministrator {
  principalId: string
  principalType: 'SUPER_ADMIN' | 'PLATFORM_ADMIN'
  externalId: string
  displayName: string | null
  createdAt: string
}

export interface CanvasAdminProvisioningStatus {
  bootstrapStatus: 'REQUIRED' | 'COMPLETE' | 'CONFLICT'
  currentRootExternalId: string
  superAdminExternalId: string | null
}

export interface CanvasAdminProvisioningPrincipals {
  items: CanvasProvisionedAdministrator[]
}

export interface CanvasRuntimeConfiguration {
  environment: 'UAT' | 'STG' | 'PROD'
  taskMedia: CanvasRuntimeTaskMediaConfiguration | null
}

export interface CanvasRuntimeTaskMediaConfiguration {
  id: string
  version: number
  status: string
  endpoint: string
  bucket: string
  accessKeyId: string | null
  credentialsConfigured: boolean
  inputRetentionHours: number
  outputRetentionHours: number
  agentFileRetentionHours: number
  downloadUrlTtlSeconds: number
  reason: string
  effectiveAt: string | null
  createdByPrincipalId: string
  updatedBy: string
  createdAt: string
  latestCheck: CanvasRuntimeConnectionCheck | null
}

export interface CanvasProviderConfigurationQuery {
  credentialGroupStatus?: 'ACTIVE' | 'ARCHIVED'
  providerId?: string
  credentialGroupId?: string
  modelScope: 'BOUND_TO_GROUP' | 'GROUP_MANAGEMENT'
  search?: string
  modelKey?: string
  modelStatus?: string
  sortBy: 'effectiveDisplayName' | 'modelKey' | 'status'
  sortOrder: 'asc' | 'desc'
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
}

export interface CanvasProviderConfiguration {
  environment: 'UAT' | 'STG' | 'PROD'
  selectedProviderId: string | null
  selectedCredentialGroupId: string | null
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
    lifecycleStatus: 'ACTIVE' | 'ARCHIVED'
    archivedAt: string | null
    schemeNames: string[]
    reason: string | null
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
  modelVersion: number
  channelCode: string
  isLatestVersion: boolean
  isSelectable: boolean
  isHistoricalBinding: boolean
  effectiveDisplayName: string
  catalogDefaultName: string
  executionTargets: Array<{ id: string; upstreamModelId: string }>
  capability: 'chat.generate' | 'image.generate' | 'video.generate'
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
}

export interface CanvasProviderCredentialGroupChange {
  id: string
  occurredAt: string
  operator: string | null
  type:
    | 'GROUP_CREATED'
    | 'GROUP_RENAMED'
    | 'KEY_REPLACED'
    | 'MODEL_BINDING_CHANGED'
    | 'MODEL_REBOUND'
    | 'GROUP_ARCHIVED'
    | 'GROUP_RESTORED'
    | 'GROUP_UPDATED'
  outcome: 'SUCCESS'
  reason: string | null
  changes: Array<{
    type?: string
    before?: string | null
    after?: string | null
    groupName?: string
    displayNameSnapshot?: string
    fromGroup?: string | null
    toGroup?: string | null
  }>
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
    modelKey: string
    effectiveDisplayName: string
    catalogDefaultName: string
    bindingId: string
    bindingVersion: number
  }>
}

export interface CanvasRuntimeConnectionCheck {
  outcome: 'PASSED' | 'FAILED'
  reasonCode: string | null
  checkedBy?: string
  checkedAt: string
}

export interface CanvasAdminRechargeCode {
  id: string
  remark: string | null
  currency: 'CNY'
  amountMinor: string
  points: string
  bonusPoints: string
  bonusTtlDays: number | null
  createdAt: string
  expiresAt: string
  totalCount: number
  availableCount: number
  redeemedCount: number
  expiredCount: number
  voidCount: number
}

export interface CanvasAdminRechargeCodePage {
  items: CanvasAdminRechargeCode[]
  matchedCode: CanvasAdminRechargeCodeBatchItem | null
  total: number
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
}

export interface CanvasAdminRechargeCodeBatchItem {
  maskedCode: string
  status: 'ACTIVE' | 'REDEEMED' | 'VOID' | 'EXPIRED'
  redeemedAt: string | null
}

export interface CanvasAdminRechargeCodeBatchItems {
  items: CanvasAdminRechargeCodeBatchItem[]
  matchedCount: number
  totalCount: number
}

export type CanvasAdminRechargeCodeExactSearchPage = CanvasAdminRechargeCodePage

export interface CanvasAdminRechargeCodeQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  status?: 'ACTIVE' | 'REDEEMED' | 'VOID' | 'EXPIRED'
  createdFrom?: string
  createdTo?: string
  sortBy: 'remark' | 'status' | 'amount' | 'points' | 'createdAt' | 'expiresAt'
  sortOrder: 'asc' | 'desc'
}

export interface CanvasAdminRechargeCodeExactSearch extends CanvasAdminRechargeCodeQuery {
  code: string
}

export interface CanvasIssuedRechargeCodes {
  created: boolean
  codes: Array<{ id: string; code: string }>
  batch: CanvasAdminRechargeCode
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
  codeMode: 'GENERATED' | 'CUSTOM'
  status: CanvasInviteCodeStatus
  redeemable: boolean
  unavailableReasons: Array<
    | 'DRAFT'
    | 'NOT_STARTED'
    | 'PAUSED'
    | 'EXPIRED'
    | 'TEMPORARILY_FULL'
    | 'EXHAUSTED'
    | 'REVOKED'
  >
  allowedActions: Array<
    | 'DISPLAY'
    | 'COPY'
    | 'PAUSE'
    | 'RESUME'
    | 'EXTEND_EXPIRATION'
    | 'EXPAND_CAPACITY'
    | 'REVOKE'
  >
  maxRegistrations: string
  reservedCount: string
  activeReservedCount: string
  consumedCount: string
  activatedCustomers: string
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
  principalId?: string
  sortBy: 'username' | 'status' | 'createdAt'
  sortOrder: 'asc' | 'desc'
}

export interface CanvasInvitationExactFilter {
  username: string
  status: CanvasAgentProfile['status']
}

export interface CanvasAdminAgentPage extends CanvasPage<CanvasAgentProfile> {
  exactFilter: CanvasInvitationExactFilter | null
}

export interface CanvasAdminInviteCodeQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  priceGroup?: string
  inviter?: string
  inviterPrincipalId?: string
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

export interface CanvasAdminInviteCodePage extends CanvasPage<CanvasAdminInviteCode> {
  exactFilter: CanvasInvitationExactFilter | null
}

export interface CanvasAgentWorkspace {
  profile: {
    principalId: string
    username: string
    status: 'ACTIVE'
  }
  summary: CanvasAgentCustomerSummary
}

/** The overview of an agent's customers, the same for the agent and the administrator. */
export interface CanvasAgentCustomerSummary {
  activatedCustomers: number
  customersWithConsumption: number
  rechargedPoints: string
  consumedPoints: string
}

/** A current price group of the agent's customers: an option of the administrator's customer filter. */
export interface CanvasAgentPriceGroupSummary {
  priceGroupId: string
  priceGroupName: string
  currentCustomers: number
}

export interface CanvasAgentModelUsageRow {
  priceGroupId: string
  priceGroupName: string
  customerModelId: string
  modelKey: string
  effectiveDisplayName: string
  combinationKey: string
  parameters: Record<string, unknown>
  billingUnit: CanvasBillingUnit
  usage: {
    requests: string
    seconds: string
    inputTokens: string | null
    outputTokens: string | null
    cacheReadTokens: string | null
    cacheWriteTokens: string | null
  }
  successfulTasks: number
  settledPoints: string
  agentPriceSnapshot: string | Partial<CanvasTokenRateVector> | null
  agentPriceSnapshotStatus: 'MISSING' | 'SINGLE' | 'VARIES'
}

export interface CanvasAdminAgentModelUsageRow extends CanvasAgentModelUsageRow {
  modelUsageAmount: string | null
  amountIncomplete: boolean
}

export interface CanvasAgentModelPrice {
  customerModelId: string
  modelKey: string
  effectiveDisplayName: string
  catalogDefaultName: string
  description: string | null
  capability: string
  tags: Array<{ id: string; name: string }>
  iconKey: string | null
  iconColor: string | null
  badges: CanvasCatalogModelBadge[]
  priceGroups: Array<{
    priceGroupId: string
    priceGroupName: string
    prices: Array<{
      combinationKey: string
      parameters: Record<string, unknown>
      billingUnit: CanvasBillingUnit
      customerPoints: string
      customerTokenRates: Partial<CanvasTokenRateVector> | null
      modelPriceCny: string | Partial<CanvasTokenRateVector> | null
    }>
  }>
}

export interface CanvasAgentInviteCode {
  id: string
  maskedCode: string
  status: CanvasInviteCodeStatus
  priceGroupId: string
  priceGroupName: string
  maxRegistrations: string
  reservedCount: string
  consumedCount: string
  remainingCount: string
  validFrom: string
  expiresAt: string
  activatedCustomers: string
  createdAt: string
}

export interface CanvasAgentInviteCodePage extends CanvasPage<CanvasAgentInviteCode> {
  filters: { priceGroups: Array<{ id: string; name: string }> }
}

export interface CanvasAgentCustomer {
  id: string
  username: string | null
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
  activatedAt: string | null
  currentPriceGroup: { id: string; name: string }
  /** Counted for the returned page only, so the column cannot be sorted. */
  successfulTasks: number
  rechargedPoints: string
  consumedPoints: string
  /** Dates within the page's `recentDays` on which the customer submitted a task. */
  activeDays: string[]
}

export interface CanvasAgentCustomerPage extends CanvasPage<CanvasAgentCustomer> {
  /** Today and the six days before it as Beijing dates, oldest first. */
  recentDays: string[]
}

export interface CanvasAgentInviteCodeQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  status?: CanvasInviteCodeStatus
  priceGroupId?: string
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
  status?: CanvasAgentCustomer['status']
  sortBy:
    | 'customer'
    | 'status'
    | 'rechargedPoints'
    | 'consumedPoints'
    | 'activeDays'
    | 'activatedAt'
    | 'currentPriceGroup'
  sortOrder: 'asc' | 'desc'
}

/** The administrator's row of an agent's customer: the agent's row plus the masked email and the agent display amount. */
export interface CanvasAdminAgentCustomer extends CanvasAgentCustomer {
  emailMasked: string | null
  modelUsageAmount: string | null
  amountIncomplete: boolean
}

export interface CanvasAdminAgentCustomerPage extends CanvasPage<CanvasAdminAgentCustomer> {
  recentDays: string[]
}

/** The administrator's customer list also filters by email and by the customers currently on one price group. */
export interface CanvasAdminAgentCustomerQuery extends CanvasAgentCustomerQuery {
  email?: string
  priceGroupId?: string
}

export interface CanvasAdminAgentStatistics {
  profile: CanvasAgentProfile
  summary: CanvasAgentCustomerSummary
  /** Options of the customer filter by current price group. */
  priceGroups: CanvasAgentPriceGroupSummary[]
}

export interface CanvasAgentModelPricePage extends CanvasPage<CanvasAgentModelPrice> {
  /** Categories of the selected type in its administrator order; every count follows the type and the search. */
  filters: {
    capabilities: string[]
    tags: Array<{ id: string; name: string; count: number }>
    totalCount: number
    untaggedCount: number
    /** The generation type applied; with DEFAULT and no type, the first type with models in client order. */
    selectedCapability: string | null
    /** The category filter applied: a category id, UNTAGGED, or null for all; DEFAULT is resolved here. */
    selectedTagId: string | null
  }
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

export interface CanvasCreatedInviteCode {
  item: CanvasAdminInviteCode
  code: string | null
}

export interface CanvasInviteCodeAvailability {
  available: boolean
  unavailableReasons: string[]
}

export interface CanvasInviteCodeExtensionPreview {
  item: CanvasAdminInviteCode
  expectedExpiresAt: string
  currentExpiresAt: string
  newExpiresAt: string
  redeemable: boolean
  unavailableReasons: CanvasAdminInviteCode['unavailableReasons']
}

export type CanvasAnnouncementStatus = 'PUBLISHED' | 'SCHEDULED' | 'OFFLINE'

export interface CanvasAnnouncementTag {
  id: string
  name: string
  color: string
  defaultAutoPopup: boolean
}

export interface CanvasAdminAnnouncement {
  id: string
  title: string
  body: string
  tag: Omit<CanvasAnnouncementTag, 'defaultAutoPopup'> | null
  autoPopup: boolean
  publishedAt: string
  status: CanvasAnnouncementStatus
}

export interface CanvasAdminAnnouncementQuery {
  status?: string
  tagId?: string
  search?: string
  sortBy: 'publishedAt' | 'status'
  sortOrder: 'asc' | 'desc'
  page: number
  pageSize: number
}

export interface CanvasAnnouncementInput {
  title: string
  body: string
  tagId: string | null
  autoPopup: boolean
  /** null publishes now; a future time schedules it; omitted on edit keeps the time. */
  publishAt?: string | null
}

export interface CanvasAnnouncementRetention {
  visibleDays: number
  deleteAfterOfflineDays: 30 | 90 | null
  version: number | null
  effectiveAt: string | null
}

export interface CanvasCustomerPointSummary {
  availablePoints: string
  paidAvailablePoints: string
  bonusAvailablePoints: string
  debtPoints: string
  paidExpiryDays: number
  /** Usable points whose lots expire within 30 days, computed by Cloud. */
  expiringSoonPoints: string
}

export interface CanvasRechargeCodeRedemptionResult {
  rechargeCodeId: string
  orderNumber: string
  redeemedAt: string
  purchasedPoints: string
  bonusPoints: string
  issuedLots: Array<{
    id: string
    type: 'PAID' | 'BONUS' | 'GRACE_BONUS'
    expiresAt: string | null
  }>
}

export interface CanvasCustomerRechargeRedemption {
  redeemedAt: string
  orderNumber: string
  currency: string
  listedAmountMinor: string
  issuedPaidPoints: string
  issuedBonusPoints: string
  status: 'REDEEMED'
}

export interface CanvasCustomerTaskOutputSummary {
  outputIndex: number
  executionStatus: string
  error: {
    code: string | null
    messages: Record<string, string> | null
    upstreamReason?: string | null
  } | null
}

export interface CanvasCustomerTaskAsset {
  assetId: string
  outputIndex: number
  mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO'
  mimeType: string
  sizeBytes: string
  availableUntil: string | null
  downloadPath: string
}

export interface CanvasCustomerTask {
  id: string
  displayNameSnapshot: string
  derivedExecutionStatus: string
  executionSummary: {
    expectedResults: number
    recordedResults: number
    acceptedResults: number
    processingResults: number
    succeededResults: number
    failedResults: number
    unknownResults: number
    resultsIncomplete: boolean
  }
  outputSummaries: CanvasCustomerTaskOutputSummary[]
  assets: CanvasCustomerTaskAsset[]
  settlementProgress: 'PENDING' | 'PROCESSING' | 'COMPLETED'
  customerBillingStatus: string
  allocatedPoints: string
  deductedPoints: string
  releasedPoints: string
  outstandingDebtPoints: string
  acceptedAt: string
}

export interface CanvasTaskAssetDownload {
  url: string
  expiresAt: string
  outputIndex: number
  mimeType: string
  sizeBytes: string
  sha256: string
}

export interface CanvasCatalogModel {
  id: string
  modelKey: string
  effectiveDisplayName: string
  catalogDefaultName: string
  catalog: Record<string, unknown>
  tags: CanvasModelTag[]
  iconKey: string | null
  iconColor: string | null
  badges: CanvasCatalogModelBadge[]
  parameterCombinations: Array<{
    id: string
    executionTargetId: string
    parameters: Record<string, unknown>
    billingDimensions: Record<string, unknown>
    billingUnit: CanvasBillingUnit
    tokenRates: Partial<CanvasTokenRateVector> | null
    points: string
  }>
}

export interface CanvasCatalogModelBadge {
  name: string
  color: string
}

export interface CanvasClientPresentationBadge {
  id: string
  name: string
  color: string
}

export interface CanvasClientPresentationModel {
  modelKey: string
  capability: 'image.generate' | 'video.generate' | 'chat.generate'
  providerName: string
  displayName: string
  description: string
  tags: CanvasModelCategory[]
  customerVisible: boolean
  iconKey: string | null
  iconColor: string | null
  badgeIds: string[]
  /** null when the model has never been ordered. */
  position: number | null
}

export interface CanvasClientPresentationCategoryDefault {
  capability: CanvasClientPresentationModel['capability']
  /** null with untagged false means no default is set. */
  tagId: string | null
  /** The default is "no category". */
  untagged: boolean
}

export interface CanvasClientPresentation {
  revision: number
  badges: CanvasClientPresentationBadge[]
  /** Every category by name, including categories without models. */
  categories: CanvasModelCategory[]
  categoryOrders: Array<{
    capability: CanvasClientPresentationModel['capability']
    tagIds: string[]
  }>
  categoryDefaults: CanvasClientPresentationCategoryDefault[]
  models: CanvasClientPresentationModel[]
}

/** Category fields a publication creates or updates; an empty description clears it. */
export interface CanvasClientPresentationCategoryInput {
  name: string
  iconKey: string | null
  iconColor: string
  description: string | null
}

export interface CanvasClientPresentationPublicationRequest {
  expectedRevision: number
  models: Array<{
    modelKey: string
    /** Sent only when changed; omitted keeps the current name. */
    displayName?: string
    /** Sent only when changed; omitted keeps the current description. */
    description?: string
    iconKey: string | null
    iconColor: string | null
    badges: string[]
    /** The complete category list: category ids or new-category refs; omitted keeps the current categories. */
    tags?: string[]
  }>
  orders: Array<{
    capability: CanvasClientPresentationModel['capability']
    modelKeys: string[]
  }>
  badges: {
    created: Array<{ ref: string; name: string; color: string }>
    updated: CanvasClientPresentationBadge[]
    deletedIds: string[]
  }
  categories?: {
    created: Array<CanvasClientPresentationCategoryInput & { ref: string }>
    updated: Array<CanvasClientPresentationCategoryInput & { id: string }>
    deletedIds: string[]
  }
  categoryOrders?: Array<{
    capability: CanvasClientPresentationModel['capability']
    tagIds: string[]
  }>
  categoryDefaults?: CanvasClientPresentationCategoryDefault[]
}

export interface CanvasModelTag {
  id: string
  name: string
}

/** A model category with its client presentation. */
export interface CanvasModelCategory extends CanvasModelTag {
  /** null shows the default category icon. */
  iconKey: string | null
  iconColor: string
  /** Shown when the category is hovered, focused or selected. */
  description: string | null
}

/** Category presentation of the customer-visible models, given once beside the models. */
export interface CanvasCatalogCategories {
  categories: CanvasModelCategory[]
  /** Category ids of each generation type in the administrator order. */
  orders: Record<string, string[]>
  /** The category each generation type opens on: a category id or UNTAGGED. */
  defaults: Record<string, string>
}

/** Cloud `GET /v1/catalog/snapshot`: the models of `/v1/catalog` and their category presentation. */
export interface CanvasCatalogSnapshot {
  models: CanvasCatalogModel[]
  categories: CanvasCatalogCategories
}

export interface CanvasAdminModelTag extends CanvasModelTag {
  modelCount: number
  modelKeys: string[]
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
    displayNameSnapshot: string
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
    displayNameSnapshot: string
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
    displayNameSnapshot: string
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
    displayNameSnapshot: string
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
  resolvedNames: CanvasAuditResolvedNames
}

type CanvasAuditNameMap = Record<string, string>

/** Readable names for the IDs on one page, keyed by ID; IDs whose rows no longer exist are absent. */
export interface CanvasAuditResolvedNames {
  customers: CanvasAuditNameMap
  customerModels: CanvasAuditNameMap
  agents: CanvasAuditNameMap
  rechargeOrders: CanvasAuditNameMap
  priceGroups: CanvasAuditNameMap
  modelTags: CanvasAuditNameMap
  promotionVersions: Record<
    string,
    { activityName: string | null; modelName: string | null }
  >
  campaignGrantPlans: Record<string, { activityName: string | null }>
  priceVersions: Record<
    string,
    { modelName: string | null; priceGroupName: string | null }
  >
  providerRateVersions: CanvasAuditNameMap
  providers: CanvasAuditNameMap
  inviteCodes: CanvasAuditNameMap
  rechargeCodes: CanvasAuditNameMap
  rechargeCodeBatches: CanvasAuditNameMap
  principals: CanvasAuditNameMap
}

export type CanvasAuditActorScope = 'ADMIN' | 'SYSTEM' | 'CUSTOMER' | 'ALL'

export interface CanvasAuditEventQuery {
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
  actorScope?: CanvasAuditActorScope
  action?: string
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

export interface CanvasExecutionTargetPricingCoverage {
  priceGroupId: string
  priceGroupCode: string
  priceGroupName: string
  requiredCount: number
  pricedCount: number
  complete: boolean
  customerVisible: boolean
  invisibleReasons: string[]
  pricedCombinationIds: string[]
  missingCombinationIds: string[]
}

export interface CanvasAdminTestingModel {
  id: string
  modelKey: string
  tags: CanvasModelTag[]
  executionTargets: Array<{
    id: string
    upstreamModelId: string
    enabled: boolean
    presentationVersion: number | null
    effectiveEnabled: boolean
    blockingReasons: string[]
    customerVisible: boolean
    pricingComplete: boolean
    pricingCoverage: CanvasExecutionTargetPricingCoverage[]
    parameterCombinations: Array<{
      id: string
      key: string
      label: string
      normalizedParameters: Record<string, unknown>
      enabled: boolean
      /** False when an administrator disabled this specification. */
      controlEnabled: boolean
    }>
  }>
  version: number
  effectiveDisplayName: string
  catalogDefaultName: string
  description: string
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
  publicCatalogSnapshot: Record<string, unknown>
  parameterCombinations: Array<{
    id: string
    key: string
    enabled: boolean
    controlEnabled: boolean
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
  targetMarginRate: string | null
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
  actualMarginRate?: string | null
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
  /** Unified publication of a scheduled cost; null for a legacy schedule. */
  publicationId?: string | null
}

export interface CanvasModelPricingPriceSnapshot {
  inputMode: 'POINTS' | 'CNY' | null
  billingUnit: CanvasBillingUnit
  points: string
  tokenRates: CanvasModelPricingTokenRateVector | null
  questionnaire: CanvasModelPricingQuestionnaire
  calculation?: CanvasModelPricingCalculation
  cnyCalculation?: {
    providerSuccessPriceCny: CanvasModelPricingCnyValue
    inviterDisplayPriceCny?: CanvasModelPricingCnyValue
    customerPriceCny: CanvasModelPricingCnyValue
    inviterMinusProviderCny?: CanvasModelPricingCnyValue
    customerMinusInviterCny?: CanvasModelPricingCnyValue
    actualMarginRate: CanvasModelPricingCnyValue
    fullCostCny: CanvasModelPricingCnyValue
    canPublish: boolean
  }
  originalCnyValues?: {
    providerSuccessPriceCny: CanvasModelPricingCnyValue | null
    inviterDisplayPriceCny: CanvasModelPricingCnyValue | null
    customerPriceCny: CanvasModelPricingCnyValue | null
  }
  id?: string
  version?: number
  status?: string
  effectiveAt?: string | null
  providerRateVersionId?: string | null
  /** Unified publication of a scheduled price; null for a legacy schedule. */
  publicationId?: string | null
  originalInput:
    | {
        inputMode: 'POINTS'
        billingUnit: CanvasBillingUnit
        priceVersionId: string
        priceVersion: number
        providerRateVersionId: string
        providerRateVersion: number
        providerRate: {
          nativeAmount: string
          tokenRates: CanvasModelPricingTokenRateVector | null
          currency: string
          exchangeRateSnapshot: { rate: string; source: string; asOf: string }
          failureChargePolicy: CanvasModelPricingFailureChargePolicy
        }
        points: string
        tokenRates: CanvasModelPricingTokenRateVector | null
        targetMarginRate: string
        successProbability: string
        otherVariableCostRmb: string
        riskBufferRmb: string
        tokenCategoryAssumptions: CanvasTokenCategoryAssumptions | null
      }
    | {
        inputMode: 'CNY'
        billingUnit: CanvasBillingUnit
        priceVersionId: string
        priceVersion: number
        providerRateVersionId: string
        providerRateVersion: number
        providerSuccessPriceCny: CanvasModelPricingCnyValue
        inviterDisplayPriceCny?: CanvasModelPricingCnyValue
        customerPriceCny: CanvasModelPricingCnyValue
      }
    | null
  restorationError: {
    code: 'INCOMPLETE_PRICING_INPUT_SNAPSHOT' | 'INVALID_PRICING_INPUT_MODE'
    missingFields: string[]
  } | null
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

export type CanvasModelPricingCnyValue =
  | string
  | CanvasModelPricingTokenRateVector

export interface CanvasModelPricingCnyScope {
  parameterCombinationId: string
  providerSuccessPriceCny: CanvasModelPricingCnyValue
  prices: Array<{
    priceGroupId: string
    sourcePriceVersionId?: string
    inviterDisplayPriceCny: CanvasModelPricingCnyValue
    customerPriceCny: CanvasModelPricingCnyValue
  }>
}

export interface CanvasModelPricingModel {
  id: string
  modelKey: string
  effectiveDisplayName: string
  catalogDefaultName: string
  capability: string
  status: string
  billingUnit: CanvasBillingUnit | null
  billingUnitState: 'UNPRICED' | 'CONSISTENT' | 'MIXED'
  publishedBillingUnits: CanvasBillingUnit[]
  allowedBillingUnits: CanvasBillingUnit[]
  // Set when one Provider call always returns this many results; a REQUEST
  // price then covers the whole batch.
  fixedRequestBatchSize?: number | null
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
    /** False when an administrator disabled this specification; it stays priceable. */
    controlEnabled: boolean
    currentProviderRate: CanvasModelPricingProviderRate | null
    scheduledProviderRate: CanvasModelPricingProviderRate | null
    originalProviderSuccessPriceCny?: CanvasModelPricingCnyValue | null
    prices: Array<{
      priceGroupId: string
      priceGroupCode: string
      priceGroupName: string
      current: CanvasModelPricingPriceSnapshot | null
      scheduled: CanvasModelPricingPriceSnapshot | null
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
  inputMode: 'POINTS' | 'CNY'
  effectiveMode: 'IMMEDIATE' | 'SCHEDULED'
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
    categories?: CanvasTokenCategory[]
    message: string
  }>
  canPublish: boolean
}

export interface CanvasModelPricingCnyCalculationIdentity {
  requestHash: string
  calculationVersion: string
  customerModelId: string
  customerModelVersion: number
  pointIssuanceRateConfigVersionId: string
  pointIssuanceRateVersion: number
  scopes: Array<{
    parameterCombinationId: string
    providerRateVersionId: string | null
    providerRateVersion: number | null
    prices: Array<{
      priceGroupId: string
      sourcePriceVersionId: string | null
      sourcePriceVersion: number | null
    }>
  }>
}

export type CanvasModelPricingCnyCalculation = Omit<
  CanvasModelPricingPreview,
  'id' | 'expiresAt' | 'scopes'
> & {
  calculatedAt: string
  inputIdentity: CanvasModelPricingCnyCalculationIdentity
  scopes: Array<{
    parameterCombinationId: string
    providerRateVersionId: string | null
    providerRateVersion: number | null
    prices: Array<{
      priceGroupId: string
      sourcePriceVersionId: string | null
      sourcePriceVersion: number | null
      normalizedPoints: string
      normalizedTokenRates: CanvasModelPricingTokenRateVector | null
      inviterMinusProviderCny: CanvasModelPricingCnyValue
      customerMinusInviterCny: CanvasModelPricingCnyValue
      fullCostCny: CanvasModelPricingCnyValue
      actualMarginRate: CanvasModelPricingCnyValue
      canPublish: boolean
      fieldErrors: Array<{
        field: 'inviterDisplayPriceCny' | 'customerPriceCny'
        reason: string
        parameterCombinationId: string
        priceGroupId: string
        tokenCategories?: CanvasTokenCategory[]
      }>
    }>
  }>
  fieldErrors: Array<{
    field: 'inviterDisplayPriceCny' | 'customerPriceCny'
    reason: string
    parameterCombinationId: string
    priceGroupId: string
    tokenCategories?: CanvasTokenCategory[]
  }>
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
  inputMode: 'POINTS' | 'CNY'
  effectiveMode: 'IMMEDIATE' | 'SCHEDULED'
  billingUnit: CanvasBillingUnit
  providerRateVersionIds: string[]
  priceVersionIds: string[]
  changed: { cost: boolean; price: boolean }
}

export interface CanvasModelPricingPublication {
  id: string
  customerModelId: string
  customerModelVersion: number
  modelKey: string
  displayNameSnapshot: string
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
    combinationKey: string
    parameters: Record<string, unknown>
    priceGroupId: string | null
    changeKind: string
    providerRateVersionId: string | null
    priceVersionId: string | null
    rateCurrent: boolean | null
    priceCurrent: boolean | null
    /** Unified entries: the item's own status; CANCELLED once its scope or the publication was cancelled. */
    status?: 'SCHEDULED' | 'CANCELLED' | 'CURRENT' | 'SUPERSEDED' | null
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

export interface CanvasAdminCustomerPointBalance {
  customerId: string
  username: string | null
  emailMasked: string | null
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
  isAgent: boolean
  agentStatus: 'ACTIVE' | 'DISABLED' | null
  availablePoints: string
  paidAvailablePoints: string
  bonusAvailablePoints: string
  debtPoints?: string
  netAvailablePoints?: string
  currentPriceGroupId?: string | null
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
  purchasedPoints: string
  originalPaidPoints: string
  correctedPaidPoints: string
  issuedPaidPoints: string
  issuedBonusPoints: string
  availablePaidPoints: string
  availableBonusPoints: string
  pointReturnCount: number
  returnedPoints: string
  returnedReferenceAmountMinor: string
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

export interface CanvasPointLedgerItem {
  id: string
  pointLotId: string
  eventType:
    | 'ISSUE'
    | 'FREEZE'
    | 'SETTLE'
    | 'RELEASE'
    | 'EXPIRE'
    | 'CLAWBACK'
    | 'ADJUSTMENT_DEBIT'
    | 'POINT_RETURN'
    | 'TRANSFER_OUT'
    | 'TRANSFER_IN'
    | 'DEBT_REPAYMENT'
  eventPoints: string
  remainingDelta: string
  reservedDelta: string
  availableDelta: string
  taskId: string | null
  taskOutputId: string | null
  outputIndex: number | null
  refundLinkId: string | null
  pointReturnId: string | null
  rechargeOrderId: string | null
  rechargeOrderNumber: string | null
  reason: string | null
  occurredAt: string
}

export interface CanvasOrderPointReturnPreview {
  rechargeOrderId: string
  orderNumber: string
  customerId: string
  currency: string
  originalOrderAmountMinor: string
  originalPurchasedPoints: string
  availablePaidPoints: string
  cumulativeReturnedPoints: string
  cumulativeReferenceAmountMinor: string
  returnPoints: string
  referenceAmountMinor: string
  remainingAvailablePaidPoints: string
}

export interface CanvasOrderPointReturnRecord {
  id: string
  rechargeOrderId: string
  customerId: string
  points: string
  referenceAmountMinor: string
  currency: string
  actorName: string | null
  reason: string
  createdAt: string
}

export interface CanvasOrderPointReturn extends CanvasOrderPointReturnPreview {
  id: string
  ledgerGroupId: string
  createdAt: string
  allocations: Array<{
    pointLotId: string
    pointLedgerId: string
    points: string
    expiresAt: string | null
  }>
}

export interface CanvasAdminCustomerTask {
  id: string
  displayNameSnapshot: string
  quotedPoints: string
  allocatedPoints: string
  settledPoints: string
  releasedPoints: string
  executionStatus: string
  customerBillingStatus: string
  providerReconcileStatus: string
  debtPoints?: string
  repaidDebtPoints?: string
  outstandingDebtPoints?: string
  outputSummaries?: Array<{
    id?: string
    outputIndex: number
    executionStatus: string
    billingStatus: string
    quotedPoints: string
    settledPoints: string | null
    completedAt?: string | null
    billingFinalizedAt?: string | null
    error?: {
      code?: string | null
      messages?: Record<string, string> | null
      upstreamReason?: string | null
    } | null
  }>
  upstreamTaskId: string | null
  acceptedAt: string
  completedAt: string | null
}

export interface CanvasAdminTaskLog {
  id: string
  customerId: string
  customerName: string | null
  customerModelId: string
  displayNameSnapshot: string
  outputSummaries: CanvasTaskOutputSummary[]
  derivedExecutionStatus: string
  executionSummary: CanvasTaskExecutionSummary
  settlementProgress: string
  customerBillingStatus: string
  settledPoints: string | null
  outstandingDebtPoints: string | null
  acceptedAt: string
  completedAt: string | null
}

export interface CanvasTaskOutputSummary {
  id: string
  outputIndex: number
  quotedPoints: string
  settledPoints: string | null
  executionStatus: string
  billingStatus: string
  error: {
    code?: string | null
    messages?: Record<string, string> | null
    upstreamReason?: string | null
  } | null
  completedAt: string | null
  billingFinalizedAt: string | null
}

export type CanvasAdminTaskUpstreamFilter = 'present' | 'absent'
export type CanvasAdminTaskFailureReason =
  | 'PROVIDER_OUTPUT_TOO_LARGE'
  | 'RETRY_EXHAUSTED'

export interface CanvasAdminTaskLogQuery {
  taskId?: string
  customer?: string
  modelId?: string
  derivedExecutionStatus?: string
  settlementProgress?: string
  upstreamTaskId?: string
  /** A result still running or of unknown outcome was submitted with (present) or without (absent) a provider task ID. */
  upstreamTask?: CanvasAdminTaskUpstreamFilter
  /** Only tasks with an unfinished result still frozen; with `upstreamTask`, both apply to the same result. */
  frozenResultsOnly?: boolean
  credentialGroupId?: string
  failureReason?: CanvasAdminTaskFailureReason
  /** Tasks with a provider call that received a status the interface template does not list. */
  unrecognizedStatus?: 'present'
  billingStatus?: string
  executionOrigin?: 'REAL' | 'MOCK'
  from?: string
  to?: string
  sortBy:
    | 'customer'
    | 'taskId'
    | 'derivedExecutionStatus'
    | 'settledPoints'
    | 'acceptedAt'
    | 'completedAt'
  sortOrder: 'asc' | 'desc'
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
}

export type CanvasModelMonitoringWindow =
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'custom'
  | 'round'

export interface CanvasModelMonitoringStats {
  succeeded: number
  failed: number
  unknown: number
  processing: number
  resultCount: number
  sampleCount: number
  successRate: number | null
}

export interface CanvasModelMonitoringOverviewQuery {
  window: CanvasModelMonitoringWindow
  origin: 'REAL' | 'MOCK'
  from?: string
  to?: string
  capability?: string
  providerId?: string
  tagId?: string
  untagged?: true
  search?: string
  page: number
  pageSize: 5 | 10 | 20 | 30 | 40 | 50 | 100
}

export interface CanvasModelMonitoringOverview {
  window: CanvasModelMonitoringWindow
  origin: 'REAL' | 'MOCK'
  from: string
  to: string
  bucketSeconds: number
  page: number
  pageSize: number
  total: number
  capabilities: Array<{ value: string; count: number }>
  providers: Array<{ id: string; name: string; count: number }>
  preTagTotal: number
  tags: Array<{ id: string; name: string; count: number }>
  untaggedCount: number
  rows: Array<{
    modelKey: string
    effectiveDisplayName: string
    catalogDefaultName: string
    capability: string | null
    provider: { id: string; name: string }
    tags: CanvasModelTag[]
    manualEnabled: boolean
    controlVersion: number
    summary: CanvasModelMonitoringStats
    trend: Array<CanvasModelMonitoringStats & { from: string; to: string }>
  }>
}

export interface CanvasModelMonitoringControlResult {
  id: string
  version: number
  status: 'PUBLISHED'
  effectiveAt: string
}

export interface CanvasTaskLogOptions {
  models: Array<{
    customerModelId: string
    displayNameSnapshot: string
  }>
  credentialGroups: Array<{ id: string; name: string; providerName: string }>
}

export interface CanvasTaskExecutionSummary {
  expectedResults: number | null
  recordedResults: number
  acceptedResults: number
  processingResults: number
  succeededResults: number
  failedResults: number
  unknownResults: number
  resultsIncomplete: boolean
}

export interface CanvasAdminTaskRecordOutput {
  id: string | null
  outputIndex: number
  quotedPoints: string
  settledPoints: string | null
  executionStatus: string
  billingStatus: string
  /** Unfinished and not handed to the Provider yet; the customer sees it as queued. */
  queued?: boolean
  error: {
    code?: string | null
    messages?: Record<string, string> | null
    upstreamReason?: string | null
    sanitizedMessage?: string | null
  } | null
  usageSnapshot: Record<string, string | number | boolean | null> | null
  completedAt: string | null
  billingFinalizedAt: string | null
  customerSafeErrorDetail: string | null
}

export interface CanvasAdminTaskInputAsset {
  assetId: string
  inputIndex: number
  inputRole: string
  mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO'
  mimeType: string
  sizeBytes: string
  sha256: string
  availableUntil: string | null
  downloadPath: string
}

/** Provider cost completeness of one Task; incomplete calls can be settled by an administrator. */
export interface CanvasAdminTaskProviderCost {
  completeness: 'NOT_REQUIRED' | 'COMPLETE' | 'INCOMPLETE'
  incompleteCalls: Array<{
    callId: string | null
    reason: 'MISSING_USAGE' | 'MISSING_RATE' | 'UNKNOWN_RESULT' | 'UNCLASSIFIED'
    canSettle: boolean
  }>
  manualSettlements: Array<{
    providerCostId: string
    callId: string | null
    status: 'CONFIRMED' | 'VOID'
    amountRmb: string
    settledAt: string
    settledBy: string | null
    reason: string | null
    canRevoke: boolean
  }>
}

/** An administrator's manual result for one UNKNOWN output with frozen points, applied by the Executor that next claims the task. */
export interface CanvasAdminTaskManualResult {
  id: string
  outputIndex: number
  upstreamTaskId: string | null
  status: 'PENDING' | 'APPLIED' | 'FAILED'
  resultUrl: string
  reason: string | null
  failureReasonCode: string | null
  requestedBy: { principalId: string; displayName: string | null }
  createdAt: string
  completedAt: string | null
}

export interface CanvasAdminTaskRecordDetail {
  id: string
  customerId: string
  customerName: string | null
  customerModelId: string
  displayNameSnapshot: string
  quotedPoints: string
  settledPoints: string | null
  deductedPoints: string | null
  releasedPoints: string | null
  outstandingDebtPoints: string | null
  derivedExecutionStatus: string
  executionSummary: CanvasTaskExecutionSummary
  settlementProgress: string
  executionStatus: string
  customerBillingStatus: string
  billingUnit: string | null
  billingFinalizedAt: string | null
  unknownDeadlineAt: string | null
  earlyReleaseAllowed: boolean
  earlyReleaseBlockedReason:
    | 'TASK_NOT_ELIGIBLE'
    | 'MANUAL_RESULT_PENDING'
    | 'ACTIVE_EXECUTOR_CLAIM'
    | 'ACTIVE_REQUEST_LEASE'
    | null
  /** Results an administrator may enter a manual result for, with the Provider task that covers each. */
  manualResultTargets: Array<{
    outputIndex: number
    upstreamTaskId: string | null
  }>
  manualResults: CanvasAdminTaskManualResult[]
  providerCost?: CanvasAdminTaskProviderCost
  parameters: Record<string, string | number | boolean | null> | null
  multiResultMode: 'NATIVE' | 'FANOUT'
  failureLocation:
    | 'EXECUTOR_PREFLIGHT'
    | 'PROVIDER_NETWORK'
    | 'PROVIDER_RESPONSE'
    | 'OUTPUT_DOWNLOAD'
    | 'RESPONSE_PROCESSING'
    | 'STORAGE'
    | null
  preflightDiagnostic: {
    stage: string
    reason: string
    field?: string
    rule?: string
    detail?: string
  } | null
  outputs: CanvasAdminTaskRecordOutput[]
  inputAssets: CanvasAdminTaskInputAsset[]
  upstreamTaskId: string | null
  taskError: {
    code?: string | null
    messages?: Record<string, string> | null
    upstreamReason?: string | null
  } | null
  acceptedAt: string
  completedAt: string | null
}

export interface CanvasAdminTaskPointRecord {
  id: string
  occurredAt: string
  eventType: string
  outputIndex: number | null
  points: string
  lotType: string | null
  sourceLotType: string | null
  targetLotType: string | null
  ledgerId: string | null
  sourceLedgerId: string | null
  targetLedgerId: string | null
  pointLotId: string | null
  sourceLotId: string | null
  targetLotId: string | null
  allocationId: string | null
  debtId: string | null
  remainingBefore: string | null
  remainingAfter: string | null
  reservedBefore: string | null
  reservedAfter: string | null
  sourceRemainingBefore: string | null
  sourceRemainingAfter: string | null
  sourceReservedBefore: string | null
  sourceReservedAfter: string | null
  targetRemainingBefore: string | null
  targetRemainingAfter: string | null
  targetReservedBefore: string | null
  targetReservedAfter: string | null
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
  | 'output'
  | 'debt'
  | 'repayment'
  | 'quote'
  | 'lot'
  | 'ledger'
  | 'allocation'
  | 'order'
  | 'payment'
  | 'pointReturn'
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
  fields: Record<
    string,
    | string
    | null
    | Array<{
        pointLotId: string
        pointLedgerId: string
        points: string
        expiresAt: string | null
      }>
  >
}
export interface CanvasBusinessFactPage extends CanvasPage<CanvasBusinessFact> {
  fact?: CanvasBusinessFactDetail
}

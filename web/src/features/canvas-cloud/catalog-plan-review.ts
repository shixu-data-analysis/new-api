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
import type {
  ModelCatalogChange,
  ModelCatalogDiagnostic,
  ModelCatalogPlan,
} from './generated/model-catalog-import'

export type CatalogPlanModel = ModelCatalogPlan['models'][number]
export type CatalogPricingItem = CatalogPlanModel['pricing'][number]

export type CatalogModelChangeKind =
  | 'CREATE'
  | 'NEW_VERSION'
  | 'DESCRIPTION'
  | 'UNCHANGED'

export type CatalogSharedChangeKind =
  | 'CREATE'
  | 'NEW_VERSION'
  | 'CONFLICT'
  | 'UNCHANGED'

export type CatalogModelBlocker = {
  source: 'credential' | 'pricing'
  reasonCode: string
}

export type CatalogModelReview = {
  model: CatalogPlanModel
  kind: CatalogModelChangeKind
  /** Price items (specification × price plan) that need pricing, price conflicts excluded. */
  pricingCount: number
  needsBinding: boolean
  blockers: CatalogModelBlocker[]
}

export const catalogPriceConflictReasons: ReadonlySet<string> = new Set([
  'SCHEDULED_PRICE_CONFLICT',
  'SCHEDULED_COST_CONFLICT',
  'PROMOTION_CONFLICT',
  'PUBLISHED_PRICE_CONFLICT',
])

export const catalogSharedResourceTypes = [
  'PROVIDER',
  'PROVIDER_CHANNEL',
  'MODEL_DEFINITION_ARTIFACT',
] as const

export type CatalogSharedResourceType =
  (typeof catalogSharedResourceTypes)[number]

export type CatalogSharedChange = ModelCatalogChange & {
  resourceType: CatalogSharedResourceType
}

export function catalogModelName(model: CatalogPlanModel): string {
  return model.presentationDisplayName ?? model.displayName
}

export function reviewCatalogModel(
  model: CatalogPlanModel,
  changes: ModelCatalogChange[]
): CatalogModelReview {
  let kind: CatalogModelChangeKind = 'UNCHANGED'
  if (model.action === 'CREATE') kind = 'CREATE'
  else if (model.action === 'CREATE_VERSION') kind = 'NEW_VERSION'
  else if (
    changes.some(
      (change) =>
        change.resourceType === 'MODEL_DESCRIPTION_DEFAULT' &&
        change.key === model.productKey
    )
  ) {
    kind = 'DESCRIPTION'
  }
  const blockers: CatalogModelBlocker[] = []
  if (model.credential.status === 'BLOCKED') {
    blockers.push({
      source: 'credential',
      reasonCode: model.credential.reasonCode,
    })
  }
  for (const reasonCode of new Set(
    model.pricing
      .map((price) => price.reasonCode)
      .filter((reasonCode) => catalogPriceConflictReasons.has(reasonCode))
  )) {
    blockers.push({ source: 'pricing', reasonCode })
  }
  return {
    model,
    kind,
    pricingCount: model.pricing.filter(
      (price) =>
        price.status === 'NEEDS_PRICING' &&
        !catalogPriceConflictReasons.has(price.reasonCode)
    ).length,
    needsBinding: model.credential.status === 'NEEDS_BINDING',
    blockers,
  }
}

export function catalogModelHasPending(review: CatalogModelReview): boolean {
  return (
    review.pricingCount > 0 || review.needsBinding || review.blockers.length > 0
  )
}

export function catalogModelHasChange(review: CatalogModelReview): boolean {
  return review.kind !== 'UNCHANGED'
}

/** Counts shown next to the "Models" tab. */
export function catalogModelTabCounts(reviews: CatalogModelReview[]) {
  return {
    changed: reviews.filter(catalogModelHasChange).length,
    pending: reviews.filter(catalogModelHasPending).length,
  }
}

const modelKindRank: Record<CatalogModelChangeKind, number> = {
  CREATE: 2,
  NEW_VERSION: 3,
  DESCRIPTION: 4,
  UNCHANGED: 5,
}

function modelRank(review: CatalogModelReview): number {
  if (review.blockers.length > 0) return 0
  if (catalogModelHasPending(review)) return 1
  return modelKindRank[review.kind]
}

function compareText(left: string, right: string): number {
  if (left < right) return -1
  return left > right ? 1 : 0
}

/** Blocked, then pending, then new, new version, description update and unchanged; then model key. */
export function sortCatalogModelReviews(
  reviews: CatalogModelReview[]
): CatalogModelReview[] {
  return [...reviews].sort(
    (left, right) =>
      modelRank(left) - modelRank(right) ||
      compareText(left.model.productKey, right.model.productKey)
  )
}

export type CatalogModelChangeFilter =
  | 'ALL'
  | 'CHANGED'
  | CatalogModelChangeKind
export type CatalogModelPendingFilter =
  | 'ALL'
  | 'PRICING'
  | 'BINDING'
  | 'BLOCKED'
  | 'NONE'

export type CatalogModelFilters = {
  capability: string
  providerId: string
  change: CatalogModelChangeFilter
  pending: CatalogModelPendingFilter
}

export const emptyCatalogModelFilters: CatalogModelFilters = {
  capability: 'ALL',
  providerId: 'ALL',
  change: 'ALL',
  pending: 'ALL',
}

export function matchesCatalogModelFilters(
  review: CatalogModelReview,
  filters: CatalogModelFilters
): boolean {
  if (
    filters.capability !== 'ALL' &&
    review.model.capability !== filters.capability
  ) {
    return false
  }
  if (
    filters.providerId !== 'ALL' &&
    review.model.providerId !== filters.providerId
  ) {
    return false
  }
  if (filters.change === 'CHANGED' && !catalogModelHasChange(review)) {
    return false
  }
  if (
    filters.change !== 'ALL' &&
    filters.change !== 'CHANGED' &&
    review.kind !== filters.change
  ) {
    return false
  }
  switch (filters.pending) {
    case 'PRICING':
      return review.pricingCount > 0
    case 'BINDING':
      return review.needsBinding
    case 'BLOCKED':
      return review.blockers.length > 0
    case 'NONE':
      return !catalogModelHasPending(review)
    default:
      return true
  }
}

export function catalogSharedChanges(
  changes: ModelCatalogChange[]
): CatalogSharedChange[] {
  return changes.filter((change): change is CatalogSharedChange =>
    (catalogSharedResourceTypes as readonly string[]).includes(
      change.resourceType
    )
  )
}

export function catalogSharedChangeKind(
  change: ModelCatalogChange
): CatalogSharedChangeKind {
  if (change.action === 'CREATE') return 'CREATE'
  if (change.action === 'CREATE_VERSION') return 'NEW_VERSION'
  if (change.action === 'CONFLICT') return 'CONFLICT'
  return 'UNCHANGED'
}

const sharedKindRank: Record<CatalogSharedChangeKind, number> = {
  CONFLICT: 0,
  NEW_VERSION: 1,
  CREATE: 2,
  UNCHANGED: 3,
}

/** Conflicts, then new versions, new and unchanged; then resource type and key. */
export function sortCatalogSharedChanges(
  changes: CatalogSharedChange[]
): CatalogSharedChange[] {
  return [...changes].sort(
    (left, right) =>
      sharedKindRank[catalogSharedChangeKind(left)] -
        sharedKindRank[catalogSharedChangeKind(right)] ||
      catalogSharedResourceTypes.indexOf(left.resourceType) -
        catalogSharedResourceTypes.indexOf(right.resourceType) ||
      compareText(left.key, right.key)
  )
}

export type CatalogSharedImpact =
  | { kind: 'CONFLICT'; diagnostic: ModelCatalogDiagnostic | undefined }
  | { kind: 'CHANNEL'; newVersions: string[]; newModels: string[] }
  | { kind: 'PROFILE'; channels: string[] }
  | { kind: 'OPENAPI'; profiles: string[] }
  | { kind: 'NONE' }

/** The diagnostic that blocks a shared resource row, if any. */
export function catalogSharedDiagnostic(
  change: CatalogSharedChange,
  diagnostics: ModelCatalogDiagnostic[]
): ModelCatalogDiagnostic | undefined {
  return diagnostics.find(
    (diagnostic) =>
      (change.resourceType === 'PROVIDER' &&
        diagnostic.code === 'PROVIDER_CONFLICT' &&
        diagnostic.params.providerId === change.key) ||
      (change.resourceType === 'MODEL_DEFINITION_ARTIFACT' &&
        diagnostic.code === 'ARTIFACT_VERSION_CONFLICT' &&
        diagnostic.params.artifactKey === change.key)
  )
}

export function catalogSharedImpact(
  change: CatalogSharedChange,
  plan: Pick<ModelCatalogPlan, 'changes' | 'models' | 'diagnostics'>,
  reviews: CatalogModelReview[]
): CatalogSharedImpact {
  const kind = catalogSharedChangeKind(change)
  if (kind === 'CONFLICT') {
    return {
      kind: 'CONFLICT',
      diagnostic: catalogSharedDiagnostic(change, plan.diagnostics),
    }
  }
  if (kind === 'UNCHANGED') return { kind: 'NONE' }
  if (change.resourceType === 'PROVIDER_CHANNEL') {
    const using = reviews.filter(
      (review) => review.model.channelId === change.key
    )
    const newVersions = using
      .filter((review) => review.kind === 'NEW_VERSION')
      .map((review) => catalogModelName(review.model))
    const newModels = using
      .filter((review) => review.kind === 'CREATE')
      .map((review) => catalogModelName(review.model))
    return newVersions.length || newModels.length
      ? { kind: 'CHANNEL', newVersions, newModels }
      : { kind: 'NONE' }
  }
  if (change.resourceType !== 'MODEL_DEFINITION_ARTIFACT') {
    return { kind: 'NONE' }
  }
  if (change.detail.kind === 'ADAPTER_PROFILE') {
    const channels = plan.changes
      .filter(
        (entry) =>
          entry.resourceType === 'PROVIDER_CHANNEL' &&
          entry.detail.adapterProfile === change.key
      )
      .map((entry) => entry.key)
    return channels.length ? { kind: 'PROFILE', channels } : { kind: 'NONE' }
  }
  const profiles = plan.changes
    .filter(
      (entry) =>
        entry.resourceType === 'MODEL_DEFINITION_ARTIFACT' &&
        entry.detail.kind === 'ADAPTER_PROFILE' &&
        entry.definition?.proposed.api === change.key
    )
    .map((entry) => entry.key)
  return profiles.length ? { kind: 'OPENAPI', profiles } : { kind: 'NONE' }
}

/** key@version of the earlier file version a new model definition file is compared with. */
export function catalogPreviousArtifactKey(
  change: ModelCatalogChange
): string | null {
  const current = change.definition?.current
  if (!current) return null
  const name = change.key.split('@')[0]
  const version =
    change.detail.kind === 'OPENAPI'
      ? (current.info as { version?: unknown } | undefined)?.version
      : current.version
  return typeof version === 'string' ? `${name}@${version}` : null
}

export type CatalogDiagnosticTarget =
  | { tab: 'models'; key: string }
  | { tab: 'shared'; resourceType: CatalogSharedResourceType; key: string }

/** Where a plan diagnostic can be shown in detail; null when it has no single row. */
export function catalogDiagnosticTarget(
  diagnostic: ModelCatalogDiagnostic
): CatalogDiagnosticTarget | null {
  const { params } = diagnostic
  if (
    (diagnostic.code === 'CREDENTIAL_BINDING_BLOCKED' ||
      diagnostic.code === 'PRICING_SOURCE_CONFLICT') &&
    typeof params.modelKey === 'string'
  ) {
    return { tab: 'models', key: params.modelKey }
  }
  if (
    diagnostic.code === 'PROVIDER_CONFLICT' &&
    typeof params.providerId === 'string'
  ) {
    return { tab: 'shared', resourceType: 'PROVIDER', key: params.providerId }
  }
  if (
    diagnostic.code === 'ARTIFACT_VERSION_CONFLICT' &&
    typeof params.artifactKey === 'string'
  ) {
    return {
      tab: 'shared',
      resourceType: 'MODEL_DEFINITION_ARTIFACT',
      key: params.artifactKey,
    }
  }
  return null
}

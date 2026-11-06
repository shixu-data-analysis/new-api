/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { referenceVideoTiersIssue } from '@pixmiao/model-catalog/request-validator'

import type {
  CanvasInputSurchargeSetting,
  CanvasReferenceVideoTier,
} from '../types'
import { isSurchargeField, type PricingDrafts } from './model-pricing-editor'

// INPUT-ASSET-BILLING-001: how the pricing page charges reference materials: the setting, its tiers and the drafts of
// their prices.

/** Whether two settings charge the same items: basis, tiers in order and the free count. */
export function sameInputSurcharge(
  left: CanvasInputSurchargeSetting | null | undefined,
  right: CanvasInputSurchargeSetting | null | undefined
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

const withoutSurcharge = (values: Record<string, string> = {}) =>
  Object.fromEntries(
    Object.entries(values).filter(
      ([field]) => !isSurchargeField(field as never)
    )
  )
const surchargeOnly = (values: Record<string, string> = {}) =>
  Object.fromEntries(
    Object.entries(values).filter(([field]) => isSurchargeField(field as never))
  )

/** The drafts with their surcharge prices replaced by those of `source` (empty to ask for them again). */
export function withSurchargeDrafts(
  drafts: PricingDrafts,
  source: PricingDrafts
): PricingDrafts {
  const scopeIds = new Set([...Object.keys(drafts), ...Object.keys(source)])
  const merge = (
    current: Record<string, Record<string, string>> = {},
    from: Record<string, Record<string, string>> = {}
  ) =>
    Object.fromEntries(
      [...new Set([...Object.keys(current), ...Object.keys(from)])].map(
        (groupId) => [
          groupId,
          {
            ...withoutSurcharge(current[groupId]),
            ...surchargeOnly(from[groupId]),
          },
        ]
      )
    )
  return Object.fromEntries(
    [...scopeIds].map((scopeId) => {
      const draft = drafts[scopeId] ?? {
        provider: {},
        inviters: {},
        customers: {},
      }
      const from = source[scopeId]
      return [
        scopeId,
        {
          provider: {
            ...withoutSurcharge(draft.provider),
            ...surchargeOnly(from?.provider),
          },
          inviters: merge(draft.inviters, from?.inviters),
          customers: merge(draft.customers, from?.customers),
        },
      ]
    })
  )
}

/**
 * The drafts without the prices of each charging group the next setting changes: the reference video group when its
 * basis or any tier changes, the reference image group when it is switched on or off. Every price of a changed group is
 * entered again, as after a billing-unit switch; a free-count change keeps the per-image prices.
 */
export function withoutChangedSurchargeGroups(
  drafts: PricingDrafts,
  previous: CanvasInputSurchargeSetting | null,
  next: CanvasInputSurchargeSetting | null
): PricingDrafts {
  const changedGroups = [
    ...(JSON.stringify(previous?.video ?? null) ===
    JSON.stringify(next?.video ?? null)
      ? []
      : ['surcharge:video']),
    ...(Boolean(previous?.image) === Boolean(next?.image)
      ? []
      : ['surcharge:image']),
  ]
  const keep = (values: Record<string, string> = {}) =>
    Object.fromEntries(
      Object.entries(values).filter(
        ([field]) =>
          !changedGroups.some(
            (group) => field === group || field.startsWith(`${group}:`)
          )
      )
    )
  const keepGroups = (groups: Record<string, Record<string, string>>) =>
    Object.fromEntries(
      Object.entries(groups).map(([id, values]) => [id, keep(values)])
    )
  return Object.fromEntries(
    Object.entries(drafts).map(([scopeId, draft]) => [
      scopeId,
      {
        provider: keep(draft.provider),
        inviters: keepGroups(draft.inviters),
        customers: keepGroups(draft.customers),
      },
    ])
  )
}

/** Whether `next` changes only the reference video tiers of `published`, both charging by the reference video's own quality. */
export function onlyTiersChanged(
  published: CanvasInputSurchargeSetting | null,
  next: CanvasInputSurchargeSetting | null
): boolean {
  if (
    published?.video?.basis !== 'INPUT_TIER' ||
    next?.video?.basis !== 'INPUT_TIER'
  ) {
    return false
  }
  return (
    !sameInputSurcharge(published, next) &&
    sameInputSurcharge({ ...next, video: published.video }, published)
  )
}

const wholePixels = (value: number) => Number.isSafeInteger(value) && value > 0

/** The tiers by short edge, smallest first; a tier still without a valid short edge stays at the end. */
export function sortedTiers(
  tiers: CanvasReferenceVideoTier[]
): CanvasReferenceVideoTier[] {
  return [...tiers].sort((left, right) => {
    if (!wholePixels(left.maxShortEdgePx)) {
      return wholePixels(right.maxShortEdgePx) ? 1 : 0
    }
    if (!wholePixels(right.maxShortEdgePx)) return -1
    return left.maxShortEdgePx - right.maxShortEdgePx
  })
}

/**
 * The shared validator's tier issue as a localized message; undefined for valid tiers. The editor sorts the tiers, so
 * their order is never the issue: after sorting, a short edge out of order can only repeat another.
 */
export function tierIssueKey(tiers: CanvasReferenceVideoTier[]) {
  const issue = referenceVideoTiersIssue(sortedTiers(tiers))
  if (!issue) return undefined
  if (issue.includes('at least one')) return 'Add at least one tier'
  if (issue.includes('needs a name')) return 'Each tier needs a name'
  if (issue.includes('repeated')) return 'Tier names must differ'
  if (issue.includes('positive whole')) {
    return 'Each short edge must be a whole number of pixels'
  }
  return 'Short edges must differ'
}

/** The cells to mark: a missing or repeated name, a missing, partial or repeated short edge. */
export function invalidTierCells(tiers: CanvasReferenceVideoTier[]) {
  const count = <T>(value: T, of: (tier: CanvasReferenceVideoTier) => T) =>
    tiers.filter((tier) => of(tier) === value).length
  return tiers.map((tier) => ({
    name: tier.name === '' || count(tier.name, (item) => item.name) > 1,
    shortEdge:
      !wholePixels(tier.maxShortEdgePx) ||
      count(tier.maxShortEdgePx, (item) => item.maxShortEdgePx) > 1,
  }))
}

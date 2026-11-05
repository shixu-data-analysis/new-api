/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { pricingScopeLabel, videoTotalPricing } from '../pricing-scope-label'
import type {
  CanvasInputSurchargeSetting,
  CanvasModelPricingDetail,
  CanvasTokenCategory,
} from '../types'
import {
  isSurchargeField,
  sharedTokenPrice,
  type PricingEditorRow,
} from './model-pricing-editor'
import { tokenCategoryLabelKey } from './token-rate-summary'

type Translate = (key: string, options?: Record<string, unknown>) => string

export interface PricingRowLabeling {
  /** Text models: rows are Token categories. */
  token: boolean
  /** Every scope is a quality only, so the quality value names it. */
  qualityOnly: boolean
  multipleScopes: boolean
  multiplePlans: boolean
  /** The categories the model is priced by, which name its text input apart from image input. */
  tokenCategories: CanvasTokenCategory[]
  /** How reference materials are charged, which names the surcharge rows (INPUT-ASSET-BILLING-001). */
  inputSurcharge: CanvasInputSurchargeSetting | null
}

export function pricingRowLabeling(
  detail: CanvasModelPricingDetail,
  token: boolean,
  inputSurcharge: CanvasInputSurchargeSetting | null = null
): PricingRowLabeling {
  return {
    token,
    inputSurcharge,
    qualityOnly:
      detail.pricingScopes.length > 0 &&
      detail.pricingScopes.every((scope) => {
        const keys = Object.keys(scope.parameters)
        return keys.length === 1 && keys[0] === 'quality'
      }),
    // A Token-billed image has one price for the whole model, so its rows name no spec (IMAGE-TOKEN-BILLING-001).
    multipleScopes:
      detail.pricingScopes.length > 1 && !(token && sharedTokenPrice(detail)),
    tokenCategories: detail.model.tokenCategories,
    multiplePlans: detail.priceGroups.length > 1,
  }
}

/** The first-column name: the Token category, quality or parameter combination. */
export function pricingRowCombination(
  row: PricingEditorRow,
  labeling: PricingRowLabeling,
  t: Translate
): string {
  const scope = labeling.qualityOnly
    ? String(row.scope.parameters.quality)
    : pricingScopeLabel(
        { key: row.scope.combinationKey, parameters: row.scope.parameters },
        t
      )
  if (isSurchargeField(row.field)) {
    return surchargeRowCombination(row, labeling, scope, t)
  }
  if (!labeling.token) return scope
  // A video's rows are its pricing scopes: "720p · 不含视频输入" (VIDEO-TOKEN-BILLING-001).
  if (videoTotalPricing(labeling.tokenCategories)) {
    return labeling.tokenCategories.length > 1
      ? `${scope} · ${t(tokenCategoryLabelKey(row.field as CanvasTokenCategory, labeling.tokenCategories))}`
      : scope
  }
  const category = t(
    tokenCategoryLabelKey(
      row.field as CanvasTokenCategory,
      labeling.tokenCategories
    )
  )
  return labeling.multipleScopes ? `${scope} · ${category}` : category
}

// "参考视频 · 生成 720P 时", "参考视频 · 720P（短边 ≤ 720）" or "参考图 · 1 张以内免费，超出部分". Tier and image prices
// are one price of the model, so they name no spec.
function surchargeRowCombination(
  row: PricingEditorRow,
  labeling: PricingRowLabeling,
  scope: string,
  t: Translate
): string {
  if (row.field === 'surcharge:image') {
    const free = labeling.inputSurcharge?.image?.freeCount ?? 0
    return `${t('Reference images')} · ${free ? t('Up to {{count}} free, beyond that', { count: free }) : t('Each image')}`
  }
  if (row.field === 'surcharge:video') {
    return `${t('Reference video')} · ${t('At generated {{quality}}', { quality: scope })}`
  }
  const name = row.field.slice('surcharge:video:'.length)
  const video = labeling.inputSurcharge?.video
  const tier =
    video?.basis === 'INPUT_TIER'
      ? video.tiers.find((item) => item.name === name)
      : undefined
  return `${t('Reference video')} · ${tier ? t('{{name}} (short edge ≤ {{px}})', { name, px: tier.maxShortEdgePx }) : name}`
}

/** "范围 · 方案", or the scope alone when the model has one price plan. */
export function pricingRowLabel(
  row: PricingEditorRow,
  labeling: PricingRowLabeling,
  t: Translate
): string {
  const combination = pricingRowCombination(row, labeling, t)
  return labeling.multiplePlans
    ? `${combination} · ${row.price.priceGroupName}`
    : combination
}

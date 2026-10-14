/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { pricingScopeLabel } from '../pricing-scope-label'
import type { CanvasModelPricingDetail } from '../types'
import type { PricingEditorRow } from './model-pricing-editor'

type Translate = (key: string, options?: Record<string, unknown>) => string

export interface PricingRowLabeling {
  /** Text models: rows are Token categories. */
  token: boolean
  /** Every scope is a quality only, so the quality value names it. */
  qualityOnly: boolean
  multipleScopes: boolean
  multiplePlans: boolean
}

export function pricingRowLabeling(
  detail: CanvasModelPricingDetail,
  token: boolean
): PricingRowLabeling {
  return {
    token,
    qualityOnly:
      detail.pricingScopes.length > 0 &&
      detail.pricingScopes.every((scope) => {
        const keys = Object.keys(scope.parameters)
        return keys.length === 1 && keys[0] === 'quality'
      }),
    multipleScopes: detail.pricingScopes.length > 1,
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
  if (!labeling.token) return scope
  return labeling.multipleScopes ? `${scope} · ${t(row.field)}` : t(row.field)
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

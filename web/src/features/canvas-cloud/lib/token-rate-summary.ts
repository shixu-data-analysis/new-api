/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import { categoryTier } from '@pixmiao/model-catalog/request-validator'

import type { CanvasTokenCategory, CanvasTokenRateKey } from '../types'

/** Token categories in display order, with their translation keys. */
export const tokenCategoryLabel: Record<CanvasTokenCategory, string> = {
  input: 'Input',
  imageInput: 'Image input',
  output: 'Output',
  cacheRead: 'Cache read',
  cacheWrite: 'Cache write',
  cacheWrite1h: 'Cache write (1 hour)',
  // A video's two totals are named by the video input wherever they show (VIDEO-TOKEN-BILLING-001).
  total: 'Without video input',
  totalWithVideoInput: 'With video input',
}

/** Every category in display order, from the labels the compiler checks for completeness. */
export const tokenCategoryOrder = Object.keys(
  tokenCategoryLabel
) as CanvasTokenCategory[]

/**
 * The translation key of a category among those a model is priced by: a model that prices image input apart calls its
 * text input "Text input" (IMAGE-TOKEN-BILLING-001), and one that prices the one-hour cache write apart calls its other
 * cache write the 5-minute one (Cloud rules 4).
 */
export function tokenCategoryLabelKey(
  category: CanvasTokenCategory,
  priced: readonly string[]
): string {
  if (isTextInput(category, priced)) return 'Text input'
  if (category === 'cacheWrite' && priced.includes('cacheWrite1h')) {
    return 'Cache write (5 minutes)'
  }
  return tokenCategoryLabel[category]
}

/** Whether a category is the text input of a model that prices image input apart, and is named so. */
export function isTextInput(
  category: CanvasTokenCategory,
  priced: readonly string[]
): boolean {
  return category === 'input' && priced.includes('imageInput')
}

export type { CanvasTokenRateKey }

/** The priced keys in display order: tier by tier, each in category order. */
export function tokenRateKeyOrder(
  keys: Iterable<string>
): CanvasTokenRateKey[] {
  const position = (key: string) => {
    const { category, tierIndex } = categoryTier(key)
    return (
      tierIndex * tokenCategoryOrder.length +
      tokenCategoryOrder.indexOf(category as CanvasTokenCategory)
    )
  }
  return [...new Set(keys)]
    .filter((key) =>
      tokenCategoryOrder.includes(
        categoryTier(key).category as CanvasTokenCategory
      )
    )
    .sort((a, b) => position(a) - position(b)) as CanvasTokenRateKey[]
}

/** Whether a price lists further input tiers. */
export function hasInputTiers(priced: readonly string[]): boolean {
  return priced.some((key) => categoryTier(key).tierIndex > 0)
}

/**
 * The name of a priced key: its category, named by the first tier's categories, after its tier when the price has
 * tiers ("第 2 档 · 输入").
 */
export function tokenRateKeyName(
  key: string,
  priced: readonly string[],
  t: (value: string, options?: Record<string, unknown>) => string
): string {
  const { category, tierIndex } = categoryTier(key)
  const firstTier = priced.filter((item) => categoryTier(item).tierIndex === 0)
  const name = t(
    tokenCategoryLabelKey(category as CanvasTokenCategory, firstTier)
  )
  return hasInputTiers(priced)
    ? `${t('Input tier {{tier}}', { tier: tierIndex + 1 })} · ${name}`
    : name
}

/** "单次输入 ≤ 272,000 Token；单次输入 > 272,000 Token": what each input tier covers. */
export function inputTiersSummary(
  bounds: readonly number[],
  t: (value: string, options?: Record<string, unknown>) => string
): string {
  const tokens = (value: number) => value.toLocaleString('en-US')
  const last = bounds.at(-1)
  if (last === undefined) return ''
  return [
    ...bounds.map((bound) =>
      t('Input up to {{tokens}} Tokens', { tokens: tokens(bound) })
    ),
    t('Input over {{tokens}} Tokens', { tokens: tokens(last) }),
  ].join('; ')
}

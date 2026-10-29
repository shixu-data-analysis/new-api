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
import type { TFunction } from 'i18next'

import {
  tokenCategoryLabel,
  tokenCategoryLabelKey,
} from './lib/token-rate-summary'
import {
  formatExactPointQuantity,
  formatExactRmbReference,
} from './number-format'
import type {
  CanvasAgentModelUsageRow,
  CanvasBillingUnit,
  CanvasTokenCategory as TokenCategory,
} from './types'

type PriceSnapshot = CanvasAgentModelUsageRow['agentPriceSnapshot']

// Categories in display order, from the shared labels.
const tokenCategories = Object.keys(tokenCategoryLabel) as TokenCategory[]
const usageFields: Record<
  TokenCategory,
  keyof CanvasAgentModelUsageRow['usage']
> = {
  input: 'inputTokens',
  imageInput: 'imageInputTokens',
  output: 'outputTokens',
  cacheRead: 'cacheReadTokens',
  cacheWrite: 'cacheWriteTokens',
}

// A Token model lists only the categories it prices; without one frozen price, the measured categories stand in.
function supportedCategories(
  row: CanvasAgentModelUsageRow,
  price: PriceSnapshot
): TokenCategory[] {
  if (price && typeof price === 'object') {
    return tokenCategories.filter((category) => price[category] !== undefined)
  }
  return tokenCategories.filter(
    (category) =>
      category === 'input' ||
      category === 'output' ||
      (row.usage[usageFields[category]] ?? '0') !== '0'
  )
}

const unitKey: Record<Exclude<CanvasBillingUnit, 'MILLION_TOKENS'>, string> = {
  REQUEST: 'times',
  SECOND: 'seconds',
}

/** Usage with its unit, for example "2,200 times", "300 seconds" or "Input 12,000 · Output 3,400 Tokens". */
export function formatAgentUsage(
  row: CanvasAgentModelUsageRow,
  price: PriceSnapshot,
  t: TFunction,
  locale?: string
): string {
  const quantity = (value: string | null) =>
    value === null ? '—' : formatExactPointQuantity(value, locale)
  if (row.billingUnit === 'MILLION_TOKENS') {
    const categories = supportedCategories(row, price)
    const parts = categories.map(
      (category) =>
        `${t(tokenCategoryLabelKey(category, categories))} ${quantity(row.usage[usageFields[category]])}`
    )
    return `${parts.join(' · ')} ${t('Tokens')}`
  }
  const value =
    row.billingUnit === 'SECOND' ? row.usage.seconds : row.usage.requests
  return `${quantity(value)} ${t(unitKey[row.billingUnit])}`
}

/** The task-time price with its unit, for example "¥0.8 / times"; a repriced period says so. */
export function formatAgentTaskTimePrice(
  row: CanvasAgentModelUsageRow,
  price: PriceSnapshot,
  status: CanvasAgentModelUsageRow['agentPriceSnapshotStatus'],
  t: TFunction,
  locale?: string
): string {
  if (status === 'VARIES') {
    return t('Multiple prices (repriced during the period)')
  }
  if (price === null) return '—'
  const rmb = (value: string) => `¥${formatExactRmbReference(value, locale)}`
  if (typeof price === 'string') {
    if (row.billingUnit === 'MILLION_TOKENS') return rmb(price)
    return `${rmb(price)} / ${t(unitKey[row.billingUnit])}`
  }
  const priced = tokenCategories.filter(
    (category) => price[category] !== undefined
  )
  const parts = priced.flatMap((category) => {
    const value = price[category]
    return value === undefined
      ? []
      : [`${t(tokenCategoryLabelKey(category, priced))} ${rmb(value)}`]
  })
  return `${parts.join(' · ')} / ${t('million Tokens')}`
}

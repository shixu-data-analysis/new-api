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
import { useCallback, useState } from 'react'

import { useAuthStore } from '@/stores/auth-store'

import type { PricingEditorRow } from './model-pricing-editor'

export type PricingStatusFilter = 'ALL' | 'PRICED' | 'UNPRICED'

/**
 * The price plans and pricing status the current-pricing table shows. Price plans are platform-wide, so the choice
 * holds for every model's pricing page; it is the administrator's own view, kept in this browser only.
 */
export interface PricingPlanFilter {
  priceGroupIds: string[]
  status: PricingStatusFilter
}

export const ALL_PRICING_PLANS: PricingPlanFilter = {
  priceGroupIds: [],
  status: 'ALL',
}

const STATUSES: ReadonlySet<string> = new Set(['ALL', 'PRICED', 'UNPRICED'])

function storageKey(userId: number | undefined) {
  return `canvas-cloud.pricing-plan-filter.${userId ?? 'anonymous'}`
}

// Storage that is unavailable or holds something else leaves the table unfiltered.
export function readPricingPlanFilter(
  userId: number | undefined
): PricingPlanFilter {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(storageKey(userId)) ?? 'null'
    ) as Partial<PricingPlanFilter> | null
    const ids = Array.isArray(parsed?.priceGroupIds)
      ? parsed.priceGroupIds.filter(
          (id): id is string => typeof id === 'string'
        )
      : []
    const saved = parsed?.status
    const status: PricingStatusFilter =
      typeof saved === 'string' && STATUSES.has(saved) ? saved : 'ALL'
    return { priceGroupIds: [...new Set(ids)], status }
  } catch {
    return ALL_PRICING_PLANS
  }
}

function writePricingPlanFilter(
  userId: number | undefined,
  filter: PricingPlanFilter
) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(filter))
  } catch {
    // The choice then lasts for this page only.
  }
}

export function usePricingPlanFilter(): [
  PricingPlanFilter,
  (next: PricingPlanFilter) => void,
] {
  const userId = useAuthStore((state) => state.auth.user?.id)
  const [filter, setFilter] = useState(() => readPricingPlanFilter(userId))
  const update = useCallback(
    (next: PricingPlanFilter) => {
      setFilter(next)
      writePricingPlanFilter(userId, next)
    },
    [userId]
  )
  return [filter, update]
}

/** A plan is priced when it has a published customer price, as the table's "Not priced" shows; drafts do not count. */
export function isPricedRow(row: PricingEditorRow): boolean {
  return Boolean(row.price.current)
}

/** The saved plans this model has; a plan the model does not price under is ignored. */
export function effectivePriceGroupIds(
  filter: PricingPlanFilter,
  priceGroupIds: readonly string[]
): string[] {
  return filter.priceGroupIds.filter((id) => priceGroupIds.includes(id))
}

export function matchesPricingPlanFilter(
  row: PricingEditorRow,
  filter: PricingPlanFilter,
  planIds: readonly string[]
): boolean {
  if (planIds.length && !planIds.includes(row.price.priceGroupId)) return false
  if (filter.status === 'PRICED') return isPricedRow(row)
  if (filter.status === 'UNPRICED') return !isPricedRow(row)
  return true
}

/**
 * Pages of whole groups: the rows of one pricing scope (or Token category) stay on one page, so the merged provider
 * cost is never split. A page takes groups while they fit its size; a group larger than a page has a page of its own.
 */
export function pagesByGroup<T>(
  rows: readonly T[],
  groupKey: (row: T) => string,
  pageSize: number
): T[][] {
  const pages: T[][] = []
  let page: T[] = []
  let group: T[] = []
  const close = () => {
    if (page.length && page.length + group.length > pageSize) {
      pages.push(page)
      page = []
    }
    page.push(...group)
    group = []
  }
  for (const row of rows) {
    if (group.length && groupKey(group[0] as T) !== groupKey(row)) close()
    group.push(row)
  }
  if (group.length) close()
  if (page.length) pages.push(page)
  return pages
}

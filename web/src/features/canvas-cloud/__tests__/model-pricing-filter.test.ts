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
import { afterEach, describe, expect, it } from 'vitest'

import type { PricingEditorRow } from '../lib/model-pricing-editor'
import {
  effectivePriceGroupIds,
  matchesPricingPlanFilter,
  pagesByGroup,
  readPricingPlanFilter,
} from '../lib/model-pricing-filter'

const row = (priceGroupId: string, priced: boolean) =>
  ({
    price: { priceGroupId, current: priced ? { id: 'p' } : null },
  }) as unknown as PricingEditorRow

afterEach(() => window.localStorage.clear())

describe('pricing plan filter', () => {
  it('keeps several plans and the pricing status, judged by the published price', () => {
    const filter = {
      priceGroupIds: ['vip', 'enterprise'],
      status: 'UNPRICED' as const,
    }
    expect(
      matchesPricingPlanFilter(row('vip', false), filter, filter.priceGroupIds)
    ).toBe(true)
    expect(
      matchesPricingPlanFilter(row('vip', true), filter, filter.priceGroupIds)
    ).toBe(false)
    expect(
      matchesPricingPlanFilter(
        row('standard', false),
        filter,
        filter.priceGroupIds
      )
    ).toBe(false)
    expect(
      matchesPricingPlanFilter(
        row('standard', true),
        { priceGroupIds: [], status: 'PRICED' },
        []
      )
    ).toBe(true)
  })

  it('ignores a saved plan the model does not price under', () => {
    expect(
      effectivePriceGroupIds(
        { priceGroupIds: ['vip', 'gone'], status: 'ALL' },
        ['standard', 'vip']
      )
    ).toEqual(['vip'])
  })

  it('reads the administrator’s saved choice and falls back to every plan', () => {
    window.localStorage.setItem(
      'canvas-cloud.pricing-plan-filter.7',
      JSON.stringify({ priceGroupIds: ['vip', 1, 'vip'], status: 'PRICED' })
    )
    expect(readPricingPlanFilter(7)).toEqual({
      priceGroupIds: ['vip'],
      status: 'PRICED',
    })
    expect(readPricingPlanFilter(8)).toEqual({
      priceGroupIds: [],
      status: 'ALL',
    })
    window.localStorage.setItem('canvas-cloud.pricing-plan-filter.9', '{broken')
    expect(readPricingPlanFilter(9)).toEqual({
      priceGroupIds: [],
      status: 'ALL',
    })
  })
})

describe('pages by group', () => {
  const rows = (groups: Array<[string, number]>) =>
    groups.flatMap(([key, size]) =>
      Array.from({ length: size }, (_, index) => ({ key, index }))
    )

  it('never splits a group across pages', () => {
    const pages = pagesByGroup(
      rows([
        ['a', 6],
        ['b', 6],
        ['c', 6],
        ['d', 6],
      ]),
      (item) => item.key,
      20
    )
    expect(pages.map((page) => page.length)).toEqual([18, 6])
    expect(pages[1]?.every((item) => item.key === 'd')).toBe(true)
  })

  it('gives a group larger than a page a page of its own', () => {
    const pages = pagesByGroup(
      rows([
        ['a', 2],
        ['b', 25],
        ['c', 3],
      ]),
      (item) => item.key,
      20
    )
    expect(pages.map((page) => page.length)).toEqual([2, 25, 3])
  })
})

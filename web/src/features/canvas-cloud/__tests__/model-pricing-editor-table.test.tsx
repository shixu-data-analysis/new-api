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
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ModelPricingEditorTable } from '../components/ModelPricingEditorTable'
import {
  originalPricingDrafts,
  pricingEditorRows,
  pricingFields,
  type PricingEditorState,
} from '../lib/model-pricing-editor'
import { usePricingPlanFilter } from '../lib/model-pricing-filter'
import type { CanvasModelPricingDetail } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key.replaceAll(/\{\{(\w+)\}\}/g, (_, name) =>
        String(values?.[name] ?? '')
      ),
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))

const PLANS = ['standard', 'vip', 'enterprise', 'agentA', 'agentB', 'beta']

// Four qualities, six plans each: 24 rows, so a page of 20 rows holds three whole groups.
function detail(): CanvasModelPricingDetail {
  const price = (groupId: string, priced: boolean) => ({
    priceGroupId: groupId,
    priceGroupCode: groupId,
    priceGroupName: groupId,
    current: priced
      ? {
          id: `price-${groupId}`,
          inputMode: 'CNY',
          billingUnit: 'REQUEST',
          points: '10',
          tokenRates: null,
          questionnaire: {},
          originalCnyValues: {
            providerSuccessPriceCny: '0.1000',
            inviterDisplayPriceCny: '0.1200',
            customerPriceCny: '0.1500',
          },
          originalInput: null,
          restorationError: null,
        }
      : null,
    scheduled: null,
  })
  const scope = (id: string) => ({
    parameterCombinationId: id,
    combinationKey: id,
    parameters: { quality: id },
    enabled: true,
    controlEnabled: true,
    currentProviderRate: { id: `rate-${id}` },
    scheduledProviderRate: null,
    originalProviderSuccessPriceCny: '0.1000',
    prices: PLANS.map((plan) => price(plan, plan !== 'beta')),
  })
  return {
    model: {
      billingUnit: 'REQUEST',
      billingUnitState: 'CONSISTENT',
      tokenCategories: [],
    },
    priceGroups: PLANS.map((plan) => ({
      id: plan,
      code: plan,
      internalName: plan,
    })),
    pricingScopes: ['1K', '2K', '3K', '4K'].map(scope),
  } as unknown as CanvasModelPricingDetail
}

function state(value: CanvasModelPricingDetail): PricingEditorState {
  const fields = pricingFields('REQUEST', [])
  const originals = originalPricingDrafts(value)
  return {
    rows: pricingEditorRows(value, fields),
    drafts: originals,
    originals,
    fields,
    billingUnit: 'REQUEST',
    tokenCategories: [],
    unitChange: false,
    unitPending: false,
  }
}

// The page owns the shared filter, as UnifiedModelPricing does.
function Page() {
  const value = detail()
  const [planFilter, setPlanFilter] = usePricingPlanFilter()
  return (
    <ModelPricingEditorTable
      detail={value}
      state={state(value)}
      attempted={false}
      calculation={null}
      conflicts={new Map()}
      onChange={() => undefined}
      onCancelSchedule={() => undefined}
      reveal={null}
      planFilter={planFilter}
      onPlanFilterChange={setPlanFilter}
    />
  )
}

function table() {
  return render(<Page />)
}

const planCells = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('[data-column-id="plan"]')?.textContent)

afterEach(() => window.localStorage.clear())

describe('current-pricing table filters', () => {
  it('pages whole groups so the merged provider cost is not split', () => {
    table()
    expect(planCells()).toHaveLength(18)
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .filter((row) => row.querySelector('[data-column-id="cost"]'))
    ).toHaveLength(3)
  })

  it('shows only the saved plans and status, on every model, and counts the visible rows', () => {
    window.localStorage.setItem(
      'canvas-cloud.pricing-plan-filter.anonymous',
      JSON.stringify({ priceGroupIds: ['vip', 'enterprise'], status: 'PRICED' })
    )
    table()
    expect(planCells()).toEqual([
      'vip',
      'enterprise',
      'vip',
      'enterprise',
      'vip',
      'enterprise',
      'vip',
      'enterprise',
    ])
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .filter((row) => row.querySelector('[data-column-id="cost"]'))
    ).toHaveLength(4)
    expect(screen.getByText('8')).toBeTruthy()
  })

  it('finds the unpriced rows and says when nothing matches', () => {
    window.localStorage.setItem(
      'canvas-cloud.pricing-plan-filter.anonymous',
      JSON.stringify({ priceGroupIds: [], status: 'UNPRICED' })
    )
    const first = table()
    expect(planCells()).toEqual(['beta', 'beta', 'beta', 'beta'])
    first.unmount()
    window.localStorage.setItem(
      'canvas-cloud.pricing-plan-filter.anonymous',
      JSON.stringify({ priceGroupIds: ['vip'], status: 'UNPRICED' })
    )
    table()
    const empty = screen.getByText('No prices match the filters')
    expect(
      within(empty.closest('td') as HTMLElement).getByRole('button', {
        name: 'Clear filters',
      })
    ).toBeTruthy()
  })
})

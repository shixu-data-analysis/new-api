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
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ModelPricingEditorTable } from '../components/ModelPricingEditorTable'
import {
  calculatedRowFigures,
  originalPricingDrafts,
  pricingEditorRows,
  pricingFields,
  publishedRowFigures,
  type PricingEditorState,
  type PricingField,
} from '../lib/model-pricing-editor'
import { ALL_PRICING_PLANS } from '../lib/model-pricing-filter'
import type {
  CanvasInputSurchargeSetting,
  CanvasModelPricingCnyCalculation,
  CanvasModelPricingDetail,
  CanvasModelPricingPriceSnapshot,
} from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      key.replaceAll(/\{\{(\w+)\}\}/g, (_, name) =>
        String(values?.[name] ?? '')
      ),
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))

type CalculatedPrice =
  CanvasModelPricingCnyCalculation['scopes'][number]['prices'][number]

// A per-second price with a reference video surcharge by generated quality and a reference image surcharge.
const qualitySnapshot = {
  billingUnit: 'SECOND',
  points: '42',
  tokenRates: null,
  inputSurcharge: {
    video: { basis: 'OUTPUT_QUALITY', points: '32' },
    image: { freeCount: 1, points: '5' },
  },
  originalCnyValues: {
    providerSuccessPriceCny: '0.35',
    inviterDisplayPriceCny: '0.37',
    customerPriceCny: '0.42',
  },
  originalSurchargeCny: {
    setting: { video: { basis: 'OUTPUT_QUALITY' }, image: { freeCount: 1 } },
    providerCny: { video: '0.30', image: '0.03' },
    inviterDisplayPriceCny: { video: '0.31', image: '0.04' },
    customerPriceCny: { video: '0.32', image: '0.05' },
  },
} as unknown as CanvasModelPricingPriceSnapshot

// The same price with reference video tiers by short edge instead.
const tierSnapshot = {
  ...qualitySnapshot,
  inputSurcharge: {
    video: {
      basis: 'INPUT_TIER',
      tiers: [
        { name: 'sd', maxShortEdgePx: 720, points: '20' },
        { name: 'hd', maxShortEdgePx: 1080, points: '30' },
      ],
    },
  },
  originalSurchargeCny: {
    setting: { video: { basis: 'INPUT_TIER', tiers: [] } },
    providerCny: { video: { sd: '0.18', hd: '0.27' } },
    inviterDisplayPriceCny: { video: { sd: '0.19', hd: '0.28' } },
    customerPriceCny: { video: { sd: '0.20', hd: '0.30' } },
  },
} as unknown as CanvasModelPricingPriceSnapshot

const tokenSnapshot = {
  billingUnit: 'MILLION_TOKENS',
  points: '300',
  tokenRates: { input: '100', output: '400' },
  originalCnyValues: {
    providerSuccessPriceCny: { input: '0.8', output: '3.2' },
    inviterDisplayPriceCny: { input: '0.9', output: '3.6' },
    customerPriceCny: { input: '1', output: '4' },
  },
} as unknown as CanvasModelPricingPriceSnapshot

describe('publishedRowFigures', () => {
  it.each<[string, CanvasModelPricingPriceSnapshot, PricingField, string[]]>([
    ['the whole price', qualitySnapshot, 'scalar', ['42', '0.37', '0.42']],
    [
      'a reference video by quality',
      qualitySnapshot,
      'surcharge:video',
      ['32', '0.31', '0.32'],
    ],
    [
      'reference images',
      qualitySnapshot,
      'surcharge:image',
      ['5', '0.04', '0.05'],
    ],
    [
      'a reference video tier',
      tierSnapshot,
      'surcharge:video:hd',
      ['30', '0.28', '0.30'],
    ],
    ['a Token category', tokenSnapshot, 'output', ['400', '3.6', '4']],
  ])('reads %s from its own values', (_, price, field, expected) => {
    const figures = publishedRowFigures(price, field)
    expect([
      figures.points,
      figures.inviterDisplayPriceCny,
      figures.customerPriceCny,
    ]).toEqual(expected)
  })

  it('reads nothing for an item the price does not charge, never the whole price', () => {
    expect(publishedRowFigures(tierSnapshot, 'surcharge:video')).toEqual({
      points: '',
      inviterDisplayPriceCny: '',
      customerPriceCny: '',
    })
    expect(publishedRowFigures(qualitySnapshot, 'surcharge:video:hd')).toEqual({
      points: '',
      inviterDisplayPriceCny: '',
      customerPriceCny: '',
    })
    expect(publishedRowFigures(null, 'scalar').points).toBe('')
  })
})

describe('calculatedRowFigures', () => {
  const result = {
    normalizedPoints: '42',
    normalizedTokenRates: null,
    inviterMinusProviderCny: '0.02000000',
    customerMinusInviterCny: '0.05000000',
    surchargeCalculations: {
      video: {
        points: '32',
        inviterMinusProviderCny: '0.01000000',
        customerMinusInviterCny: '0.01000000',
      },
      'video:hd': {
        points: '30',
        inviterMinusProviderCny: '0.01000000',
        customerMinusInviterCny: '0.02000000',
      },
      image: {
        points: '5',
        inviterMinusProviderCny: '0.01000000',
        customerMinusInviterCny: '0.01000000',
      },
    },
  } as unknown as CalculatedPrice

  it.each<[PricingField, string[]]>([
    ['scalar', ['42', '0.02000000', '0.05000000']],
    ['surcharge:video', ['32', '0.01000000', '0.01000000']],
    ['surcharge:video:hd', ['30', '0.01000000', '0.02000000']],
    ['surcharge:image', ['5', '0.01000000', '0.01000000']],
  ])('gives %s its own points and differences', (field, expected) => {
    const figures = calculatedRowFigures(result, field)
    expect([
      figures.points,
      figures.inviterMinusProviderCny,
      figures.customerMinusInviterCny,
    ]).toEqual(expected)
  })

  it('reads a Token category from the rate vectors', () => {
    const tokenResult = {
      normalizedPoints: '250',
      normalizedTokenRates: { input: '100', output: '400' },
      inviterMinusProviderCny: { input: '0.1', output: '0.4' },
      customerMinusInviterCny: { input: '0.1', output: '0.4' },
      surchargeCalculations: null,
    } as unknown as CalculatedPrice
    expect(calculatedRowFigures(tokenResult, 'output')).toEqual({
      points: '400',
      inviterMinusProviderCny: '0.4',
      customerMinusInviterCny: '0.4',
    })
  })
})

describe('surcharge rows in the current-pricing table', () => {
  const setting = {
    video: { basis: 'OUTPUT_QUALITY' },
  } as CanvasInputSurchargeSetting

  function detail(
    scheduled: CanvasModelPricingPriceSnapshot | null
  ): CanvasModelPricingDetail {
    const current = {
      ...qualitySnapshot,
      id: 'price-720p',
      inputMode: 'CNY',
      questionnaire: {},
      inputSurcharge: { video: { basis: 'OUTPUT_QUALITY', points: '32' } },
      originalSurchargeCny: {
        setting,
        providerCny: { video: '0.30' },
        inviterDisplayPriceCny: { video: '0.31' },
        customerPriceCny: { video: '0.32' },
      },
    }
    return {
      model: {
        billingUnit: 'SECOND',
        billingUnitState: 'CONSISTENT',
        tokenCategories: [],
      },
      priceGroups: [{ id: 'standard', code: 'standard', internalName: 'std' }],
      pricingScopes: [
        {
          parameterCombinationId: '720p',
          combinationKey: '720p',
          parameters: { quality: '720P' },
          enabled: true,
          controlEnabled: true,
          currentProviderRate: { id: 'rate-720p' },
          scheduledProviderRate: null,
          originalProviderSuccessPriceCny: '0.35',
          prices: [
            {
              priceGroupId: 'standard',
              priceGroupCode: 'standard',
              priceGroupName: 'Standard',
              current,
              scheduled,
            },
          ],
        },
      ],
    } as unknown as CanvasModelPricingDetail
  }

  function renderTable(
    value: CanvasModelPricingDetail,
    calculation: CanvasModelPricingCnyCalculation | null
  ) {
    const fields = pricingFields('SECOND', [], setting)
    const originals = originalPricingDrafts(value)
    const state: PricingEditorState = {
      rows: pricingEditorRows(value, fields),
      drafts: originals,
      originals,
      fields,
      billingUnit: 'SECOND',
      tokenCategories: [],
      unitChange: false,
      unitPending: false,
      inputSurcharge: setting,
    }
    return render(
      <ModelPricingEditorTable
        detail={value}
        state={state}
        attempted={false}
        calculation={calculation}
        conflicts={new Map()}
        onChange={() => undefined}
        onCancelSchedule={() => undefined}
        reveal={null}
        planFilter={ALL_PRICING_PLANS}
        onPlanFilterChange={() => undefined}
      />
    )
  }

  it('shows a reference video row its own differences, not the generated video price', () => {
    const calculation = {
      scopes: [
        {
          parameterCombinationId: '720p',
          prices: [
            {
              priceGroupId: 'standard',
              normalizedPoints: '42',
              normalizedTokenRates: null,
              inviterMinusProviderCny: '0.02000000',
              customerMinusInviterCny: '0.05000000',
              surchargeCalculations: {
                video: {
                  points: '32',
                  inviterMinusProviderCny: '0.01000000',
                  customerMinusInviterCny: '0.01000000',
                },
              },
            },
          ],
        },
      ],
    } as unknown as CanvasModelPricingCnyCalculation
    renderTable(detail(null), calculation)
    expect(screen.getByText('Above provider cost by 0.02 yuan')).toBeTruthy()
    expect(
      screen.getByText('Above inviter display price by 0.05 yuan')
    ).toBeTruthy()
    expect(screen.getByText('Above provider cost by 0.01 yuan')).toBeTruthy()
    expect(
      screen.getByText('Above inviter display price by 0.01 yuan')
    ).toBeTruthy()
  })

  it('shows a scheduled reference video price in its inputs and the scheduled column', () => {
    const scheduled = {
      ...qualitySnapshot,
      id: 'price-720p-next',
      inputMode: 'CNY',
      questionnaire: {},
      points: '50',
      inputSurcharge: { video: { basis: 'OUTPUT_QUALITY', points: '36' } },
      originalCnyValues: {
        providerSuccessPriceCny: '0.35',
        inviterDisplayPriceCny: '0.45',
        customerPriceCny: '0.50',
      },
      originalSurchargeCny: {
        setting,
        providerCny: { video: '0.30' },
        inviterDisplayPriceCny: { video: '0.33' },
        customerPriceCny: { video: '0.36' },
      },
    } as unknown as CanvasModelPricingPriceSnapshot
    renderTable(detail(scheduled), null)
    const inputs = screen
      .getAllByRole('textbox')
      .map((input) => (input as HTMLInputElement).value)
    // Generated video: cost, inviter, customer; then the reference video row: cost, inviter, customer.
    expect(inputs).toEqual(['0.35', '0.37', '0.42', '0.30', '0.31', '0.32'])
    const scheduledCells = [
      ...document.querySelectorAll('[data-column-id="scheduled"]'),
    ].map((cell) => cell.textContent)
    expect(scheduledCells.some((text) => text?.includes('0.50'))).toBe(true)
    expect(scheduledCells.some((text) => text?.includes('0.36'))).toBe(true)
  })
})

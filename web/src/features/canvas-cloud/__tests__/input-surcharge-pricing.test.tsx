/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { InputSurchargeControls } from '../components/InputSurchargeControls'
import {
  onlyTiersChanged,
  sameInputSurcharge,
  tierIssueKey,
  withoutChangedSurchargeGroups,
  withSurchargeDrafts,
} from '../lib/input-surcharge'
import {
  calculationScopes,
  originalPricingDrafts,
  pricingEditorRows,
  pricingFields,
  publicationScopes,
  shownRows,
  sortPricingRows,
  surchargeFields,
  withEditedValue,
  type PricingDrafts,
  type PricingEditorRow,
  type PricingEditorState,
} from '../lib/model-pricing-editor'
import {
  pricingRowLabel,
  pricingRowLabeling,
} from '../lib/model-pricing-row-label'
import type {
  CanvasInputSurchargeSetting,
  CanvasModelPricingDetail,
} from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key.replaceAll(/\{\{(\w+)\}\}/g, (_match, name: string) =>
        String(options?.[name] ?? '')
      ),
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}))

const t = (key: string, options?: Record<string, unknown>) =>
  key.replaceAll(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    String(options?.[name] ?? '')
  )

// INPUT-ASSET-BILLING-001: Wan 3.0 super with two specs and one price plan, its reference videos published by tier.
const tiers = [
  { name: '480P', maxShortEdgePx: 480 },
  { name: '720P', maxShortEdgePx: 720 },
]
const byTier: CanvasInputSurchargeSetting = {
  video: { basis: 'INPUT_TIER', tiers },
}

function detail(): CanvasModelPricingDetail {
  const scope = (quality: string, provider: string) => ({
    parameterCombinationId: quality,
    combinationKey: quality,
    parameters: { quality },
    enabled: true,
    controlEnabled: true,
    currentProviderRate: { id: `rate-${quality}` },
    scheduledProviderRate: null,
    originalProviderSuccessPriceCny: provider,
    prices: [
      {
        priceGroupId: 'standard',
        priceGroupCode: 'standard',
        priceGroupName: 'standard',
        scheduled: null,
        current: {
          id: `price-${quality}`,
          inputMode: 'CNY',
          billingUnit: 'SECOND',
          points: '26',
          tokenRates: null,
          questionnaire: {},
          originalCnyValues: {
            providerSuccessPriceCny: provider,
            inviterDisplayPriceCny: '0.4',
            customerPriceCny: '0.52',
          },
          inputSurcharge: {
            video: {
              basis: 'INPUT_TIER',
              tiers: tiers.map((tier) => ({ ...tier, points: '20' })),
            },
          },
          originalSurchargeCny: {
            setting: byTier,
            providerCny: { video: { '480P': '0.132', '720P': '0.132' } },
            inviterDisplayPriceCny: {
              video: { '480P': '0.32', '720P': '0.38' },
            },
            customerPriceCny: { video: { '480P': '0.4', '720P': '0.48' } },
          },
        },
      },
    ],
  })
  return {
    model: {
      capability: 'video.generate',
      billingUnit: 'SECOND',
      billingUnitState: 'CONSISTENT',
      tokenCategories: [],
      inputSurcharge: {
        setting: byTier,
        availability: {
          video: true,
          image: false,
          defaultReferenceVideoTiers: tiers,
        },
      },
    },
    priceGroups: [
      { id: 'standard', code: 'standard', internalName: 'standard' },
    ],
    pricingScopes: [scope('480P', '0.132'), scope('720P', '0.1687')],
  } as unknown as CanvasModelPricingDetail
}

function editor(
  setting: CanvasInputSurchargeSetting | null = byTier
): PricingEditorState {
  const pricing = detail()
  const fields = pricingFields('SECOND', [], setting)
  const originals = originalPricingDrafts(pricing)
  return {
    rows: pricingEditorRows(pricing, fields),
    drafts: originals,
    originals,
    fields,
    billingUnit: 'SECOND',
    tokenCategories: [],
    unitChange: false,
    unitPending: false,
    inputSurcharge: setting,
    surchargeChange: !sameInputSurcharge(byTier, setting),
  }
}

describe('Surcharge prices on the pricing page', () => {
  it('adds one field per surcharge item, none for million-Token pricing', () => {
    expect(surchargeFields(byTier)).toEqual([
      'surcharge:video:480P',
      'surcharge:video:720P',
    ])
    expect(
      surchargeFields({
        video: { basis: 'OUTPUT_QUALITY' },
        image: { freeCount: 1 },
      })
    ).toEqual(['surcharge:video', 'surcharge:image'])
    expect(pricingFields('MILLION_TOKENS', ['total'], byTier)).toEqual([
      'total',
    ])
  })

  it('prefills the published surcharge amounts and shows a tier price once, on the first spec', () => {
    const state = editor()
    expect(
      state.drafts['720P']?.customers.standard?.['surcharge:video:720P']
    ).toBe('0.48')
    expect(state.drafts['480P']?.provider['surcharge:video:480P']).toBe('0.132')
    const shown = shownRows(state).map((row) => row.id)
    expect(shown).toContain('480P:surcharge:video:720P:standard')
    expect(shown).not.toContain('720P:surcharge:video:720P:standard')
    expect(shown).toContain('720P:scalar:standard')
  })

  it('lists the generated video prices first, then the reference video and image surcharges, in either order', () => {
    const state = editor({
      video: { basis: 'OUTPUT_QUALITY' },
      image: { freeCount: 1 },
    })
    const ids = shownRows(state).map((row) => row.id)
    expect(ids).toEqual([
      '480P:scalar:standard',
      '720P:scalar:standard',
      '480P:surcharge:video:standard',
      '720P:surcharge:video:standard',
      '480P:surcharge:image:standard',
    ])
    const items = shownRows(state).map((row) => ({ row, plan: 'standard' }))
    expect(
      sortPricingRows(items, [{ id: 'combination', desc: true }]).map(
        (item) => item.row.id
      )
    ).toEqual([
      '720P:scalar:standard',
      '480P:scalar:standard',
      '720P:surcharge:video:standard',
      '480P:surcharge:video:standard',
      '480P:surcharge:image:standard',
    ])
  })

  it('writes a tier price for every spec and sends the amounts in the API form', () => {
    const state = editor()
    const row = state.rows.find(
      (item) => item.id === '480P:surcharge:video:720P:standard'
    ) as PricingEditorRow
    const drafts = withEditedValue(state, state.drafts, row, 'customer', '0.5')
    expect(drafts['720P']?.customers.standard?.['surcharge:video:720P']).toBe(
      '0.5'
    )
    const scopes = publicationScopes({ ...state, drafts })
    expect(scopes.map((scope) => scope.parameterCombinationId)).toEqual([
      '480P',
      '720P',
    ])
    expect(scopes[1]).toMatchObject({
      providerSuccessPriceCny: '0.1687',
      providerSurchargeCny: { video: { '480P': '0.132', '720P': '0.132' } },
      prices: [
        { customerSurchargeCny: { video: { '480P': '0.4', '720P': '0.5' } } },
      ],
    })
  })

  it('re-enters every price when the charging changes and prices nothing while a surcharge amount is missing', () => {
    const output: CanvasInputSurchargeSetting = {
      video: { basis: 'OUTPUT_QUALITY' },
    }
    const state = editor(output)
    expect(state.surchargeChange).toBe(true)
    const drafts = withoutChangedSurchargeGroups(state.drafts, byTier, output)
    expect(
      drafts['480P']?.customers.standard?.['surcharge:video:480P']
    ).toBeUndefined()
    expect(calculationScopes({ ...state, drafts })).toBeNull()
    const restored = withSurchargeDrafts(drafts, state.originals)
    expect(restored['480P']?.customers.standard?.['surcharge:video:480P']).toBe(
      '0.4'
    )
  })

  it('asks for every reference video price again when one tier changes its short edge, keeping the image prices', () => {
    const withImages: CanvasInputSurchargeSetting = {
      ...byTier,
      image: { freeCount: 1 },
    }
    const state = editor()
    const spec = state.drafts['480P'] as PricingDrafts[string]
    const drafts: PricingDrafts = {
      ...state.drafts,
      '480P': {
        ...spec,
        customers: {
          standard: { ...spec.customers.standard, 'surcharge:image': '0.06' },
        },
      },
    }
    const moved: CanvasInputSurchargeSetting = {
      video: {
        basis: 'INPUT_TIER',
        tiers: [
          { name: '480P', maxShortEdgePx: 540 },
          { name: '720P', maxShortEdgePx: 720 },
        ],
      },
      image: { freeCount: 2 },
    }
    const cleared = withoutChangedSurchargeGroups(drafts, withImages, moved)
    const standard = cleared['480P']?.customers.standard
    expect(standard?.['surcharge:video:480P']).toBeUndefined()
    expect(standard?.['surcharge:video:720P']).toBeUndefined()
    expect(cleared['480P']?.provider['surcharge:video:720P']).toBeUndefined()
    expect(standard?.['surcharge:image']).toBe('0.06')
    expect(standard?.scalar).toBe(drafts['480P']?.customers.standard?.scalar)
  })

  it('tells a tier change from a change of how materials are charged', () => {
    const moved: CanvasInputSurchargeSetting = {
      video: {
        basis: 'INPUT_TIER',
        tiers: [
          { name: '480P', maxShortEdgePx: 540 },
          { name: '720P', maxShortEdgePx: 720 },
        ],
      },
    }
    expect(onlyTiersChanged(byTier, moved)).toBe(true)
    expect(onlyTiersChanged(byTier, byTier)).toBe(false)
    expect(
      onlyTiersChanged(byTier, { ...moved, image: { freeCount: 1 } })
    ).toBe(false)
    expect(
      onlyTiersChanged(byTier, { video: { basis: 'OUTPUT_QUALITY' } })
    ).toBe(false)
  })

  it('names surcharge rows by item, tier short edge and free count', () => {
    const state = editor()
    const labeling = pricingRowLabeling(detail(), false, byTier)
    const row = state.rows.find(
      (item) => item.id === '480P:surcharge:video:720P:standard'
    ) as PricingEditorRow
    expect(pricingRowLabel(row, labeling, t)).toBe(
      'Reference video · 720P (short edge ≤ 720)'
    )
    // Beside the surcharge rows a base row says what it prices; without a surcharge it is the quality alone.
    const base = state.rows.find(
      (item) => item.id === '480P:scalar:standard'
    ) as PricingEditorRow
    expect(pricingRowLabel(base, labeling, t)).toBe('Generated video · 480P')
    expect(
      pricingRowLabel(base, pricingRowLabeling(detail(), false, null), t)
    ).toBe('480P')
    const imageState = editor({ image: { freeCount: 1 } })
    const imageRow = imageState.rows.find(
      (item) => item.field === 'surcharge:image'
    ) as PricingEditorRow
    expect(
      pricingRowLabel(
        imageRow,
        pricingRowLabeling(detail(), false, { image: { freeCount: 1 } }),
        t
      )
    ).toBe('Reference images · Up to 1 free, beyond that')
  })
})

describe('Surcharge controls', () => {
  const availability = {
    video: true,
    image: true,
    defaultReferenceVideoTiers: tiers,
  }

  it('chooses how reference videos and images are charged', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <InputSurchargeControls
        availability={availability}
        value={null}
        onChange={onChange}
      />
    )
    expect(screen.getByLabelText('Reference video')).toBeTruthy()
    expect(screen.queryByLabelText('Free images')).toBeNull()
    rerender(
      <InputSurchargeControls
        availability={availability}
        value={{ image: { freeCount: 1 } }}
        onChange={onChange}
      />
    )
    fireEvent.change(screen.getByLabelText('Free images'), {
      target: { value: '2' },
    })
    expect(onChange).toHaveBeenLastCalledWith({ image: { freeCount: 2 } })
  })

  it('edits the tiers and reports the shared validator issue', () => {
    const onChange = vi.fn()
    render(
      <InputSurchargeControls
        availability={availability}
        value={byTier}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit tiers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add tier' }))
    expect(onChange).toHaveBeenLastCalledWith({
      video: {
        basis: 'INPUT_TIER',
        tiers: [...tiers, { name: '', maxShortEdgePx: 0 }],
      },
    })
    expect(
      tierIssueKey([
        { name: 'A', maxShortEdgePx: 720 },
        { name: 'B', maxShortEdgePx: 480 },
      ])
    ).toBe('Short edges must be whole numbers in ascending order')
    expect(
      tierIssueKey([
        { name: 'A', maxShortEdgePx: 480 },
        { name: 'A', maxShortEdgePx: 720 },
      ])
    ).toBe('Tier names must differ')
    expect(tierIssueKey(tiers)).toBeUndefined()
  })

  it('is not shown for a model that takes no reference materials', () => {
    const { container } = render(
      <InputSurchargeControls
        availability={{
          video: false,
          image: false,
          defaultReferenceVideoTiers: [],
        }}
        value={null}
        onChange={vi.fn()}
      />
    )
    expect(container.textContent).toBe('')
  })
})

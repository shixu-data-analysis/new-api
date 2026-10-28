/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import {
  calculationScopes,
  conflictsByRow,
  currentPricingIdentity,
  isPendingRow,
  isRowIncluded,
  originalPricingDrafts,
  PRICING_MESSAGES,
  pricingCostError,
  pricingEditorRows,
  pricingFields,
  pricingRowErrors,
  publicationScopes,
  withDraftValue,
  type PricingEditorRow,
  type PricingEditorState,
  type PricingSide,
} from '../lib/model-pricing-editor'
import type { CanvasBillingUnit, CanvasModelPricingDetail } from '../types'

type Values = { provider: string; inviter: string; customer: string }

function price(groupId: string, values: Values | null, scheduled = false) {
  const snapshot = values
    ? {
        id: `price-${groupId}`,
        inputMode: 'CNY',
        billingUnit: 'REQUEST',
        points: '10',
        tokenRates: null,
        questionnaire: {},
        originalCnyValues: {
          providerSuccessPriceCny: values.provider,
          inviterDisplayPriceCny: values.inviter,
          customerPriceCny: values.customer,
        },
        originalInput: null,
        restorationError: null,
      }
    : null
  return {
    priceGroupId: groupId,
    priceGroupCode: groupId,
    priceGroupName: groupId,
    current: snapshot,
    scheduled: scheduled
      ? { ...snapshot, id: 'scheduled', publicationId: 'pub-1' }
      : null,
  }
}

// 2K: Standard priced, VIP unpriced; 4K: both priced.
function multiPlanDetail(): CanvasModelPricingDetail {
  const scope = (id: string, prices: ReturnType<typeof price>[]) => ({
    parameterCombinationId: id,
    combinationKey: id,
    parameters: { quality: id },
    enabled: true,
    controlEnabled: true,
    currentProviderRate: { id: `rate-${id}` },
    scheduledProviderRate: null,
    originalProviderSuccessPriceCny: '0.1200',
    prices,
  })
  return {
    model: {
      billingUnit: 'REQUEST',
      billingUnitState: 'CONSISTENT',
      tokenCategories: [],
    },
    priceGroups: [
      { id: 'standard', code: 'standard', internalName: 'standard' },
      { id: 'vip', code: 'vip', internalName: 'vip' },
    ],
    pricingScopes: [
      scope('2K', [
        price('standard', {
          provider: '0.1200',
          inviter: '0.1500',
          customer: '0.1800',
        }),
        price('vip', null),
      ]),
      scope('4K', [
        price('standard', {
          provider: '0.1200',
          inviter: '0.2400',
          customer: '0.3000',
        }),
        price('vip', {
          provider: '0.1200',
          inviter: '0.2400',
          customer: '0.2600',
        }),
      ]),
    ],
  } as unknown as CanvasModelPricingDetail
}

function editor(
  detail: CanvasModelPricingDetail,
  billingUnit: CanvasBillingUnit = 'REQUEST'
): PricingEditorState {
  const fields = pricingFields(billingUnit, detail.model.tokenCategories)
  const originals = originalPricingDrafts(detail)
  return {
    rows: pricingEditorRows(detail, fields),
    drafts: originals,
    originals,
    fields,
    billingUnit,
    tokenCategories: detail.model.tokenCategories,
    unitChange: detail.model.billingUnit !== billingUnit,
    unitPending: false,
  }
}

function edit(
  state: PricingEditorState,
  rowId: string,
  side: PricingSide,
  value: string
): PricingEditorState {
  const row = state.rows.find((item) => item.id === rowId) as PricingEditorRow
  return { ...state, drafts: withDraftValue(state.drafts, row, side, value) }
}

const row = (state: PricingEditorState, id: string) =>
  state.rows.find((item) => item.id === id) as PricingEditorRow
const included = (state: PricingEditorState) =>
  state.rows.filter((item) => isRowIncluded(state, item)).map((item) => item.id)

describe('time-of-day schedule publication', () => {
  it('publishes every priced plan of every spec with a changed schedule, and nothing else', () => {
    const schedule = {
      schemaVersion: 1 as const,
      timeZone: 'Asia/Shanghai',
      rules: [
        {
          days: [1, 2, 3, 4, 5],
          start: '09:00',
          end: '12:00',
          multiplier: '2',
        },
      ],
    }
    const state = {
      ...editor(multiPlanDetail()),
      timeOfDayChange: { schedule },
    }
    const scopes = publicationScopes(state)
    expect(
      scopes.map((scope) => [
        scope.parameterCombinationId,
        scope.prices.map((price) => price.priceGroupId),
        scope.timeOfDaySchedule,
      ])
    ).toEqual([
      ['2K', ['standard'], schedule],
      ['4K', ['standard', 'vip'], schedule],
    ])
    expect(publicationScopes(editor(multiPlanDetail()))).toEqual([])
    expect(
      publicationScopes({
        ...editor(multiPlanDetail()),
        timeOfDayChange: { schedule: null },
      })[0]?.timeOfDaySchedule
    ).toBeNull()
  })
})

describe('model pricing editor rules', () => {
  it('publishes every priced plan of a scope whose shared cost changed, but not its unpriced plan', () => {
    const state = edit(
      editor(multiPlanDetail()),
      '4K:scalar:standard',
      'provider',
      '0.2200'
    )

    expect(included(state)).toEqual(['4K:scalar:standard', '4K:scalar:vip'])
    expect(publicationScopes(state)).toEqual([
      expect.objectContaining({
        parameterCombinationId: '4K',
        providerSuccessPriceCny: '0.2200',
        prices: [
          expect.objectContaining({
            priceGroupId: 'standard',
            sourcePriceVersionId: 'price-standard',
          }),
          expect.objectContaining({
            priceGroupId: 'vip',
            sourcePriceVersionId: 'price-vip',
          }),
        ],
      }),
    ])
  })

  it('submits only the changed plan when a price changes without a cost change', () => {
    const state = edit(
      editor(multiPlanDetail()),
      '4K:scalar:vip',
      'customer',
      '0.2800'
    )

    expect(included(state)).toEqual(['4K:scalar:vip'])
    expect(
      publicationScopes(state)[0]?.prices.map((item) => item.priceGroupId)
    ).toEqual(['vip'])
  })

  it('brings in an unpriced plan once a price is filled and requires the inviter price', () => {
    const state = edit(
      editor(multiPlanDetail()),
      '2K:scalar:vip',
      'customer',
      '0.1500'
    )

    expect(included(state)).toEqual(['2K:scalar:vip'])
    expect(pricingRowErrors(state, row(state, '2K:scalar:vip'), false)).toEqual(
      {
        inviter: PRICING_MESSAGES.inviter,
      }
    )
  })

  it('allows equal cost, inviter and customer prices', () => {
    let state = edit(
      editor(multiPlanDetail()),
      '4K:scalar:vip',
      'inviter',
      '0.1200'
    )
    state = edit(state, '4K:scalar:vip', 'customer', '0.1200')

    expect(pricingRowErrors(state, row(state, '4K:scalar:vip'), true)).toEqual(
      {}
    )
  })

  it('accepts CNY prices with up to 8 decimals and compares them exactly', () => {
    let state = edit(
      editor(multiPlanDetail()),
      '4K:scalar:vip',
      'inviter',
      '0.12000001'
    )
    const errors = (customer: string) => {
      state = edit(state, '4K:scalar:vip', 'customer', customer)
      return pricingRowErrors(state, row(state, '4K:scalar:vip'), true)
    }

    expect(errors('0.481035')).toEqual({})
    expect(errors('0.12000001')).toEqual({})
    expect(errors('0.12')).toEqual({ customer: PRICING_MESSAGES.customer })
    expect(errors('0.120000015')).toEqual({ customer: PRICING_MESSAGES.amount })
  })

  it('requires every Token category of a newly priced plan once one is filled', () => {
    const detail = multiPlanDetail()
    const [scope] = detail.pricingScopes
    if (!scope) throw new Error('missing fixture scope')
    detail.model = {
      ...detail.model,
      billingUnit: 'MILLION_TOKENS',
      tokenCategories: ['input', 'output'],
    }
    detail.pricingScopes = [
      {
        ...scope,
        originalProviderSuccessPriceCny: { input: '1', output: '2' },
      },
    ]
    let state = editor(detail, 'MILLION_TOKENS')
    state = edit(state, '2K:input:vip', 'inviter', '1')
    state = edit(state, '2K:input:vip', 'customer', '1.5')

    expect(isRowIncluded(state, row(state, '2K:output:vip'))).toBe(true)
    expect(pricingRowErrors(state, row(state, '2K:output:vip'), true)).toEqual({
      inviter: PRICING_MESSAGES.inviter,
      customer: PRICING_MESSAGES.amount,
    })
  })

  it('re-prices everything after a unit change and flags empty boxes only after a publish attempt', () => {
    const state = { ...editor(multiPlanDetail(), 'SECOND'), drafts: {} }

    expect(included(state)).toHaveLength(4)
    const target = row(state, '4K:scalar:vip')
    expect(pricingRowErrors(state, target, false)).toEqual({})
    expect(pricingCostError(state, [target], false)).toBeUndefined()
    expect(pricingRowErrors(state, target, true)).toEqual({
      inviter: PRICING_MESSAGES.inviter,
      customer: PRICING_MESSAGES.amount,
    })
    expect(pricingCostError(state, [target], true)).toBe(
      PRICING_MESSAGES.amount
    )
  })

  it('treats a cost-only schedule as pending on priced plans and reports a cost change there', () => {
    const detail = multiPlanDetail()
    const [scope] = detail.pricingScopes
    if (!scope) throw new Error('missing fixture scope')
    scope.scheduledProviderRate = { publicationId: 'pub-2' } as never
    const state = edit(
      editor(detail),
      '2K:scalar:standard',
      'provider',
      '0.1300'
    )

    expect(isPendingRow(row(state, '2K:scalar:standard'))).toBe(true)
    expect(isPendingRow(row(state, '2K:scalar:vip'))).toBe(false)
    expect(
      pricingRowErrors(state, row(state, '2K:scalar:standard'), false)
    ).toEqual({
      customer: PRICING_MESSAGES.scheduled,
    })
  })

  it('marks a scheduled-price conflict on its row and a scope conflict on every published row of the scope', () => {
    const state = edit(
      editor(multiPlanDetail()),
      '4K:scalar:standard',
      'provider',
      '0.2200'
    )
    const marked = conflictsByRow(state, [
      {
        code: 'SCHEDULED_PRICE',
        parameterCombinationId: '4K',
        priceGroupId: 'vip',
        message: '',
      },
    ])
    expect([...marked.keys()]).toEqual(['4K:scalar:vip'])
    const scopeWide = conflictsByRow(state, [
      {
        code: 'LIMITED_PRICE_SPECIAL',
        parameterCombinationId: '4K',
        message: '',
      },
    ])
    expect([...scopeWide.keys()]).toEqual([
      '4K:scalar:standard',
      '4K:scalar:vip',
    ])
  })

  it('leaves an incomplete unchanged plan out of the calculation instead of dropping every note', () => {
    const detail = multiPlanDetail()
    const vip = detail.pricingScopes[1]?.prices[1]?.current?.originalCnyValues
    if (!vip) throw new Error('missing fixture price')
    vip.inviterDisplayPriceCny = null
    const state = editor(detail)

    expect(
      calculationScopes(state)?.map((scope) => [
        scope.parameterCombinationId,
        scope.prices.map((price) => price.priceGroupId),
      ])
    ).toEqual([
      ['2K', ['standard']],
      ['4K', ['standard']],
    ])
    // A published price must be complete; an incomplete one still blocks the calculation.
    expect(
      calculationScopes(edit(state, '2K:scalar:vip', 'customer', '0.1500'))
    ).toBeNull()
  })

  it('identifies the current versions apart from schedules', () => {
    const before = multiPlanDetail()
    const scheduled = multiPlanDetail()
    const plan = scheduled.pricingScopes[0]?.prices[0]
    if (!plan) throw new Error('missing fixture price')
    plan.scheduled = { id: 'scheduled-2' } as never
    expect(currentPricingIdentity(scheduled)).toBe(
      currentPricingIdentity(before)
    )

    const republished = multiPlanDetail()
    const current = republished.pricingScopes[0]?.prices[0]?.current
    if (!current) throw new Error('missing fixture price')
    current.id = 'price-newer'
    expect(currentPricingIdentity(republished)).not.toBe(
      currentPricingIdentity(before)
    )
  })
})

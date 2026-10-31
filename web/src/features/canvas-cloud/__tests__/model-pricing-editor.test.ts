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
  sharedTokenPrice,
  shownRows,
  sortPricingRows,
  withDraftValue,
  withEditedValue,
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

describe('sortPricingRows', () => {
  const item = (groupKey: string, plan: string) => ({
    row: { groupKey },
    plan,
  })
  const items = [
    item('480P', 'Agent'),
    item('480P', 'Standard'),
    item('720P', 'Agent'),
    item('720P', 'Standard'),
    item('1080P', 'Agent'),
    item('1080P', 'Standard'),
  ]
  const order = (sorted: typeof items) =>
    sorted.map((row) => `${row.row.groupKey} ${row.plan}`)

  it('keeps the order Cloud returned when ascending or unsorted', () => {
    expect(sortPricingRows(items, [])).toEqual(items)
    expect(
      sortPricingRows(items, [{ id: 'combination', desc: false }])
    ).toEqual(items)
  })

  it('reverses whole specifications, so a merged provider cost stays together', () => {
    expect(
      order(sortPricingRows(items, [{ id: 'combination', desc: true }]))
    ).toEqual([
      '1080P Agent',
      '1080P Standard',
      '720P Agent',
      '720P Standard',
      '480P Agent',
      '480P Standard',
    ])
  })

  it('sorts price plans inside each specification', () => {
    expect(order(sortPricingRows(items, [{ id: 'plan', desc: true }]))).toEqual(
      [
        '480P Standard',
        '480P Agent',
        '720P Standard',
        '720P Agent',
        '1080P Standard',
        '1080P Agent',
      ]
    )
  })
})

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

describe('one Token price for a Token-billed image (IMAGE-TOKEN-BILLING-001)', () => {
  const pricedValues = { provider: '1', inviter: '2', customer: '3' }
  // 1K, 2K and 4K; `disabled4K` keeps 4K disabled with a current standard price.
  function imageDetail(disabled4K = false): CanvasModelPricingDetail {
    const scope = (id: string, enabled = true) => ({
      parameterCombinationId: id,
      combinationKey: `quality=${id}`,
      parameters: { quality: id },
      enabled,
      controlEnabled: true,
      currentProviderRate: enabled ? null : { id: `rate-${id}` },
      scheduledProviderRate: null,
      originalProviderSuccessPriceCny: null,
      prices: enabled
        ? [price('standard', null), price('vip', null)]
        : [price('standard', pricedValues), price('vip', null)],
    })
    return {
      model: {
        capability: 'image.generate',
        billingUnit: 'MILLION_TOKENS',
        billingUnitState: 'CONSISTENT',
        allowedBillingUnits: ['REQUEST', 'MILLION_TOKENS'],
        oneTokenPrice: true,
        tokenCategories: ['input', 'imageInput', 'output'],
      },
      priceGroups: [
        { id: 'standard', code: 'standard', internalName: 'standard' },
        { id: 'vip', code: 'vip', internalName: 'vip' },
      ],
      pricingScopes: [scope('1K'), scope('2K'), scope('4K', !disabled4K)],
    } as unknown as CanvasModelPricingDetail
  }

  function oneTokenEditor(
    detail: CanvasModelPricingDetail,
    unit: 'MILLION_TOKENS' | 'REQUEST' = 'MILLION_TOKENS'
  ) {
    return {
      ...editor(detail, 'MILLION_TOKENS'),
      unitChange: unit !== 'MILLION_TOKENS',
      oneTokenPrice: sharedTokenPrice(detail),
    }
  }

  // Fills every category of both plans through the shown 1K rows.
  function priceEverything(state: PricingEditorState) {
    let next = state
    for (const field of next.fields) {
      for (const plan of ['standard', 'vip']) {
        for (const [side, value] of [
          ['provider', '1'],
          ['inviter', '2'],
          ['customer', '3'],
        ] as const) {
          next = {
            ...next,
            drafts: withEditedValue(
              next,
              next.drafts,
              row(next, `1K:${field}:${plan}`),
              side,
              value
            ),
          }
        }
      }
    }
    return next
  }

  it('shows one spec of rows by category and plan and publishes every spec alike', () => {
    const state = priceEverything(oneTokenEditor(imageDetail()))
    expect(shownRows(state).map((item) => item.id)).toEqual([
      '1K:input:standard',
      '1K:input:vip',
      '1K:imageInput:standard',
      '1K:imageInput:vip',
      '1K:output:standard',
      '1K:output:vip',
    ])
    const scopes = publicationScopes(state)
    expect(scopes.map((scope) => scope.parameterCombinationId)).toEqual([
      '1K',
      '2K',
      '4K',
    ])
    expect(
      new Set(
        scopes.map((scope) =>
          JSON.stringify({
            cost: scope.providerSuccessPriceCny,
            prices: scope.prices.map(
              ({ priceGroupId, inviterDisplayPriceCny, customerPriceCny }) => ({
                priceGroupId,
                inviterDisplayPriceCny,
                customerPriceCny,
              })
            ),
          })
        )
      )
    ).toHaveProperty('size', 1)
    expect(scopes[0]?.providerSuccessPriceCny).toEqual({
      input: '1',
      imageInput: '1',
      output: '1',
    })
  })

  it('leaves a disabled spec out of a price change and re-prices only its plans on a unit switch, as Cloud requires', () => {
    const detail = imageDetail(true)
    const change = priceEverything(oneTokenEditor(detail))
    expect(
      publicationScopes(change).map((scope) => scope.parameterCombinationId)
    ).toEqual(['1K', '2K'])
    const unitSwitch = priceEverything(oneTokenEditor(detail, 'REQUEST'))
    const scopes = publicationScopes(unitSwitch)
    expect(scopes.map((scope) => scope.parameterCombinationId)).toEqual([
      '1K',
      '2K',
      '4K',
    ])
    expect(
      scopes
        .find((scope) => scope.parameterCombinationId === '4K')
        ?.prices.map((item) => item.priceGroupId)
    ).toEqual(['standard'])
  })

  it('marks the shown rows of the plan with a conflict Cloud reports on another spec', () => {
    const state = priceEverything(oneTokenEditor(imageDetail()))
    const marked = conflictsByRow(state, [
      {
        code: 'SCHEDULED_PRICE',
        message: '',
        parameterCombinationId: '4K',
        priceGroupId: 'vip',
      },
    ] as never)
    // A scheduled price belongs to the plan, so every category of the plan is marked.
    expect([...marked.keys()]).toEqual([
      '1K:input:vip',
      '1K:imageInput:vip',
      '1K:output:vip',
    ])
  })

  it('keeps every spec when Cloud does not price the model once', () => {
    const perSpec = {
      ...imageDetail(),
      model: { ...imageDetail().model, oneTokenPrice: false },
    } as unknown as CanvasModelPricingDetail
    expect(sharedTokenPrice(perSpec)).toBe(false)
    const state = oneTokenEditor(perSpec)
    expect(shownRows(state)).toHaveLength(state.rows.length)
    const single = {
      ...imageDetail(),
      pricingScopes: imageDetail().pricingScopes.slice(0, 1),
    } as unknown as CanvasModelPricingDetail
    expect(sharedTokenPrice(single)).toBe(false)
  })
})

describe('Token-billed video pricing (VIDEO-TOKEN-BILLING-001)', () => {
  it('sends exactly the two totals of every resolution, with no input or output', () => {
    const scope = (id: string) => ({
      parameterCombinationId: id,
      combinationKey: `quality=${id}`,
      parameters: { quality: id },
      enabled: true,
      controlEnabled: true,
      currentProviderRate: null,
      scheduledProviderRate: null,
      originalProviderSuccessPriceCny: null,
      prices: [price('standard', null)],
    })
    const detail = {
      model: {
        capability: 'video.generate',
        billingUnit: 'MILLION_TOKENS',
        billingUnitState: 'CONSISTENT',
        allowedBillingUnits: ['REQUEST', 'SECOND', 'MILLION_TOKENS'],
        oneTokenPrice: false,
        tokenCategories: ['total', 'totalWithVideoInput'],
      },
      priceGroups: [
        { id: 'standard', code: 'standard', internalName: 'standard' },
      ],
      pricingScopes: [scope('480p'), scope('720p')],
    } as unknown as CanvasModelPricingDetail
    let state = editor(detail, 'MILLION_TOKENS')
    for (const quality of ['480p', '720p']) {
      for (const [category, amount] of [
        ['total', '65.763216'],
        ['totalWithVideoInput', '39.335008'],
      ] as const) {
        for (const side of ['provider', 'inviter', 'customer'] as const) {
          state = edit(state, `${quality}:${category}:standard`, side, amount)
        }
      }
    }
    const rates = { total: '65.763216', totalWithVideoInput: '39.335008' }

    expect(calculationScopes(state)).toEqual(
      ['480p', '720p'].map((quality) => ({
        parameterCombinationId: quality,
        providerSuccessPriceCny: rates,
        prices: [
          {
            priceGroupId: 'standard',
            inviterDisplayPriceCny: rates,
            customerPriceCny: rates,
          },
        ],
      }))
    )
  })
})

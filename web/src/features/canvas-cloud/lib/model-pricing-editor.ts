/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type {
  CanvasBillingUnit,
  CanvasModelPricingCnyCalculation,
  CanvasModelPricingCnyScope,
  CanvasModelPricingCnyValue,
  CanvasModelPricingDetail,
  CanvasModelPricingPreview,
  CanvasModelPricingTokenRateVector,
  CanvasTimeOfDaySchedule,
  CanvasTokenCategory,
} from '../types'

// The editable current-pricing table: one row per pricing scope × price plan (text models: × Token category).
// Rows of one scope (and category) share the provider cost, so a cost change re-publishes every priced plan.

export type PricingField = 'scalar' | CanvasTokenCategory
export type PricingSide = 'provider' | 'inviter' | 'customer'
export type PricingScope = CanvasModelPricingDetail['pricingScopes'][number]
export type PricingScopePrice = PricingScope['prices'][number]

export interface CnyScopeDraft {
  provider: Record<string, string>
  inviters: Record<string, Record<string, string>>
  customers: Record<string, Record<string, string>>
}
export type PricingDrafts = Record<string, CnyScopeDraft>

export interface PricingEditorRow {
  id: string
  /** Rows sharing one provider-cost cell. */
  groupKey: string
  scope: PricingScope
  price: PricingScopePrice
  field: PricingField
}

export interface PricingEditorState {
  rows: PricingEditorRow[]
  drafts: PricingDrafts
  originals: PricingDrafts
  fields: PricingField[]
  billingUnit: CanvasBillingUnit
  tokenCategories: CanvasTokenCategory[]
  /** The chosen unit differs from the published one (or published units are mixed): every price is re-entered. */
  unitChange: boolean
  /** Mixed published units and no unit chosen yet: inputs stay locked. */
  unitPending: boolean
  /**
   * A changed time-of-day schedule (null switches it off). It is part of the cost and every price, so every priced
   * plan of every spec is published with it.
   */
  timeOfDayChange?: { schedule: CanvasTimeOfDaySchedule | null }
  /**
   * A Token-billed image with one price for the whole model (IMAGE-TOKEN-BILLING-001): every edit is written for every
   * spec, so the usual rules publish the specs alike, and the page shows one spec's rows (shownRows).
   */
  oneTokenPrice?: boolean
}

export const PRICING_SIDE_LABEL_KEYS: Record<PricingSide, string> = {
  provider: 'Provider cost',
  inviter: 'Inviter (agent) display price',
  customer: 'Customer sale price',
}

export const PRICING_MESSAGES = {
  amount: 'Enter an amount above 0 with up to 8 decimals',
  inviter:
    'Inviter display price must be at least provider cost, with up to 8 decimals.',
  customer: 'Customer sale price must be at least inviter display price.',
  scheduled: 'A price is scheduled. Cancel the schedule first.',
} as const

export const PRICING_CONFLICT_MESSAGES: Record<string, string> = {
  SCHEDULED_PRICE: PRICING_MESSAGES.scheduled,
  SCHEDULED_PROVIDER_RATE:
    'The provider cost has a scheduled version. Cancel the schedule first.',
  LIMITED_PRICE_SPECIAL:
    'A limited-price special is in progress. Wait until it ends or cancel it before changing prices.',
}

export function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const value = key(item)
    groups.set(value, [...(groups.get(value) ?? []), item])
  }
  return groups
}

const emptyDraft = (): CnyScopeDraft => ({
  provider: {},
  inviters: {},
  customers: {},
})

function cnyDraftFields(
  value: CanvasModelPricingCnyValue | null | undefined
): Record<string, string> {
  if (typeof value === 'string') return { scalar: value }
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  )
}

/** Drafts prefilled with the recorded CNY input of every current price. */
export function originalPricingDrafts(
  detail: CanvasModelPricingDetail
): PricingDrafts {
  return Object.fromEntries(
    detail.pricingScopes.map((scope) => {
      const inputs = scope.prices.flatMap((price) =>
        price.current?.originalCnyValues
          ? [[price.priceGroupId, price.current.originalCnyValues] as const]
          : []
      )
      return [
        scope.parameterCombinationId,
        {
          provider: cnyDraftFields(scope.originalProviderSuccessPriceCny),
          inviters: Object.fromEntries(
            inputs.map(([groupId, input]) => [
              groupId,
              cnyDraftFields(input.inviterDisplayPriceCny),
            ])
          ),
          customers: Object.fromEntries(
            inputs.map(([groupId, input]) => [
              groupId,
              cnyDraftFields(input.customerPriceCny),
            ])
          ),
        },
      ]
    })
  )
}

/**
 * The current versions the drafts are compared with and published from. A refresh that keeps them (for example
 * after a schedule is cancelled) can replace the edit snapshot; one that changes them must not move unpublished
 * drafts onto the newer versions.
 */
export function currentPricingIdentity(detail: CanvasModelPricingDetail) {
  return JSON.stringify([
    detail.model.billingUnit,
    detail.model.billingUnitState,
    detail.pricingScopes.map((scope) => [
      scope.parameterCombinationId,
      scope.currentProviderRate?.id ?? null,
      scope.prices.map((price) => [
        price.priceGroupId,
        price.current?.id ?? null,
      ]),
    ]),
  ])
}

/** A Token-billed image with several specs: Cloud prices it once for the whole model (rules 4). */
export function sharedTokenPrice(detail: CanvasModelPricingDetail): boolean {
  return detail.model.oneTokenPrice === true && detail.pricingScopes.length > 1
}

export function pricingFields(
  billingUnit: CanvasBillingUnit,
  tokenCategories: CanvasTokenCategory[]
): PricingField[] {
  return billingUnit === 'MILLION_TOKENS' ? tokenCategories : ['scalar']
}

export function pricingEditorRows(
  detail: CanvasModelPricingDetail,
  fields: PricingField[]
): PricingEditorRow[] {
  return detail.pricingScopes.flatMap((scope) =>
    fields.flatMap((field) =>
      scope.prices.map((price) => ({
        id: `${scope.parameterCombinationId}:${field}:${price.priceGroupId}`,
        groupKey: `${scope.parameterCombinationId}:${field}`,
        scope,
        price,
        field,
      }))
    )
  )
}

// The spec whose rows stand for a model with one Token price: the first one the publication always carries.
function shownScopeId(state: PricingEditorState): string | undefined {
  const scopes = state.rows.map((row) => row.scope)
  return (scopes.find((scope) => scope.enabled) ?? scopes[0])
    ?.parameterCombinationId
}

/** The rows the page shows: one spec's for a model with one Token price, every row otherwise. */
export function shownRows(state: PricingEditorState): PricingEditorRow[] {
  if (!state.oneTokenPrice) return state.rows
  const scopeId = shownScopeId(state)
  return state.rows.filter(
    (row) => row.scope.parameterCombinationId === scopeId
  )
}

// The shown row that stands for a row of any spec: the same category and plan.
function shownRowId(state: PricingEditorState, row: PricingEditorRow) {
  return state.oneTokenPrice
    ? `${shownScopeId(state)}:${row.field}:${row.price.priceGroupId}`
    : row.id
}

/** Applies one edited cell, for every spec of a model with one Token price. */
export function withEditedValue(
  state: PricingEditorState,
  drafts: PricingDrafts,
  row: PricingEditorRow,
  side: PricingSide,
  value: string
): PricingDrafts {
  if (!state.oneTokenPrice) return withDraftValue(drafts, row, side, value)
  const scopes = new Map(
    state.rows.map((item) => [item.scope.parameterCombinationId, item.scope])
  )
  return [...scopes.values()].reduce(
    (result, scope) =>
      withDraftValue(
        result,
        {
          ...row,
          scope,
          price:
            scope.prices.find(
              (price) => price.priceGroupId === row.price.priceGroupId
            ) ?? row.price,
        },
        side,
        value
      ),
    drafts
  )
}

/** Applies one edited cell; the provider cost is stored once per scope. */
export function withDraftValue(
  drafts: PricingDrafts,
  row: PricingEditorRow,
  side: PricingSide,
  value: string
): PricingDrafts {
  const scopeId = row.scope.parameterCombinationId
  const groupId = row.price.priceGroupId
  const draft = drafts[scopeId] ?? emptyDraft()
  if (side === 'provider') {
    return {
      ...drafts,
      [scopeId]: {
        ...draft,
        provider: { ...draft.provider, [row.field]: value },
      },
    }
  }
  const key = side === 'inviter' ? 'inviters' : 'customers'
  return {
    ...drafts,
    [scopeId]: {
      ...draft,
      [key]: {
        ...draft[key],
        [groupId]: { ...draft[key][groupId], [row.field]: value },
      },
    },
  }
}

function sideValue(
  drafts: PricingDrafts,
  scopeId: string,
  groupId: string,
  side: PricingSide,
  field: PricingField
): string {
  const draft = drafts[scopeId]
  if (side === 'provider') return draft?.provider[field] ?? ''
  const values = side === 'inviter' ? draft?.inviters : draft?.customers
  return values?.[groupId]?.[field] ?? ''
}

export function draftValue(
  state: Pick<PricingEditorState, 'drafts'>,
  row: PricingEditorRow,
  side: PricingSide
): string {
  return sideValue(
    state.drafts,
    row.scope.parameterCombinationId,
    row.price.priceGroupId,
    side,
    row.field
  )
}

export function originalValue(
  state: Pick<PricingEditorState, 'originals'>,
  row: PricingEditorRow,
  side: PricingSide
): string {
  return sideValue(
    state.originals,
    row.scope.parameterCombinationId,
    row.price.priceGroupId,
    side,
    row.field
  )
}

/** A scheduled price, or a scheduled cost on a priced plan: the row is shown read-only until the schedule is cancelled. */
export function isPendingRow(row: PricingEditorRow): boolean {
  return Boolean(
    row.price.scheduled ||
    (row.scope.scheduledProviderRate && row.price.current)
  )
}

/** The scheduled version a pending row can be cancelled from. */
export function pendingPublicationId(row: PricingEditorRow): string | null {
  return (
    row.price.scheduled?.publicationId ??
    row.scope.scheduledProviderRate?.publicationId ??
    null
  )
}

// A unit change re-prices every enabled scope and every scope that still has current pricing.
function inUnitChange(row: PricingEditorRow): boolean {
  const scope = row.scope
  const scopeIncluded =
    scope.enabled ||
    Boolean(scope.currentProviderRate) ||
    scope.prices.some((price) => price.current)
  return scopeIncluded && (scope.enabled || Boolean(row.price.current))
}

export function isRowLocked(
  state: PricingEditorState,
  row: PricingEditorRow
): boolean {
  if (state.unitPending || isPendingRow(row)) return true
  return state.unitChange ? !inUnitChange(row) : !row.scope.enabled
}

/** The shared cost stays editable on pending rows; publishing it then reports the schedule. */
export function isCostLocked(
  state: PricingEditorState,
  groupRows: PricingEditorRow[]
): boolean {
  if (state.unitPending) return true
  return groupRows.every((row) =>
    state.unitChange ? !inUnitChange(row) : !row.scope.enabled
  )
}

export function isSideChanged(
  state: PricingEditorState,
  row: PricingEditorRow,
  side: PricingSide
): boolean {
  if (state.unitChange) return draftValue(state, row, side) !== ''
  return draftValue(state, row, side) !== originalValue(state, row, side)
}

function isPlanFilled(state: PricingEditorState, row: PricingEditorRow) {
  return state.fields.some(
    (field) =>
      sideValue(
        state.drafts,
        row.scope.parameterCombinationId,
        row.price.priceGroupId,
        'inviter',
        field
      ) !== '' ||
      sideValue(
        state.drafts,
        row.scope.parameterCombinationId,
        row.price.priceGroupId,
        'customer',
        field
      ) !== ''
  )
}

/** Whether the row is part of the next publication. */
export function isRowIncluded(
  state: PricingEditorState,
  row: PricingEditorRow
): boolean {
  if (state.unitPending) return false
  if (state.unitChange) return inUnitChange(row)
  if (!row.scope.enabled) return false
  // A newly priced plan needs every Token category, so filling one category brings in the whole plan.
  if (!row.price.current) return isPlanFilled(state, row)
  return (
    Boolean(state.timeOfDayChange) ||
    isSideChanged(state, row, 'provider') ||
    isSideChanged(state, row, 'inviter') ||
    isSideChanged(state, row, 'customer')
  )
}

/** A CNY price as Cloud accepts it: up to 8 decimals, the precision of Token rates and costs. */
export function isRmbAmount(value: string) {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(value)
}

export function isPositiveRmbAmount(value: string) {
  return isRmbAmount(value) && Number(value) > 0
}

function cnyScaled(value: string): bigint {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0'))
}

export type PricingRowErrors = Partial<Record<'inviter' | 'customer', string>>

/**
 * Field errors of an included row (translation keys). Empty boxes after a unit change are only flagged once
 * publishing was attempted.
 */
export function pricingRowErrors(
  state: PricingEditorState,
  row: PricingEditorRow,
  attempted: boolean
): PricingRowErrors {
  if (!isRowIncluded(state, row)) return {}
  if (isPendingRow(row)) return { customer: PRICING_MESSAGES.scheduled }
  const provider = draftValue(state, row, 'provider')
  const inviter = draftValue(state, row, 'inviter')
  const customer = draftValue(state, row, 'customer')
  const flagEmpty = !state.unitChange || attempted
  const errors: PricingRowErrors = {}
  if (
    (inviter !== '' || flagEmpty) &&
    (!isRmbAmount(inviter) ||
      (isPositiveRmbAmount(provider) &&
        cnyScaled(inviter) < cnyScaled(provider)))
  ) {
    errors.inviter = PRICING_MESSAGES.inviter
  }
  if (!isPositiveRmbAmount(customer)) {
    if (customer !== '' || flagEmpty) errors.customer = PRICING_MESSAGES.amount
  } else if (
    !errors.inviter &&
    isRmbAmount(inviter) &&
    cnyScaled(customer) < cnyScaled(inviter)
  ) {
    errors.customer = PRICING_MESSAGES.customer
  }
  return errors
}

type CalculatedPrice =
  CanvasModelPricingCnyCalculation['scopes'][number]['prices'][number]

/**
 * The API calculation of a row's price while its drafts are valid and no conflict marks it; every figure derived from
 * it (points, margins, prices by period) is shown only then.
 */
export function validCalculatedPrice(
  state: PricingEditorState,
  row: PricingEditorRow,
  calculation: CanvasModelPricingCnyCalculation | null,
  conflict: string | undefined,
  attempted: boolean
): CalculatedPrice | null {
  const result = calculation?.scopes
    .find(
      (scope) =>
        scope.parameterCombinationId === row.scope.parameterCombinationId
    )
    ?.prices.find((price) => price.priceGroupId === row.price.priceGroupId)
  if (!result || conflict) return null
  if (Object.keys(pricingRowErrors(state, row, attempted)).length > 0) {
    return null
  }
  return result
}

/** The customer points Cloud calculated for a row: per request or second, or the Token category's rate per million. */
export function calculatedPoints(
  result: CalculatedPrice,
  row: PricingEditorRow
): string {
  if (row.field === 'scalar') return result.normalizedPoints
  return result.normalizedTokenRates?.[row.field] ?? ''
}

/** The shared cost error of a cost cell, shown when any row of its group is published. */
export function pricingCostError(
  state: PricingEditorState,
  groupRows: PricingEditorRow[],
  attempted: boolean
): string | undefined {
  const first = groupRows[0]
  if (!first || !groupRows.some((row) => isRowIncluded(state, row))) return
  const cost = draftValue(state, first, 'provider')
  if (isPositiveRmbAmount(cost)) return
  if (cost === '' && state.unitChange && !attempted) return
  return PRICING_MESSAGES.amount
}

/** DOM id of a price input; the cost input sits on the first row of its group on the page. */
export function pricingInputId(row: PricingEditorRow, side: PricingSide) {
  return `model-pricing-${row.id}-${side}`.replaceAll(':', '-')
}

/** The first invalid input in table order, so the page can bring it into view. */
export function firstPricingError(
  state: PricingEditorState
): { row: PricingEditorRow; side: PricingSide } | null {
  const groups = groupBy(state.rows, (row) => row.groupKey)
  for (const row of state.rows) {
    const groupRows = groups.get(row.groupKey) ?? [row]
    if (groupRows[0] === row && pricingCostError(state, groupRows, true)) {
      return { row, side: 'provider' }
    }
    const errors = pricingRowErrors(state, row, true)
    if (errors.inviter) return { row, side: 'inviter' }
    if (errors.customer) return { row, side: 'customer' }
  }
  return null
}

function cnyValue(
  values: Record<string, string> | undefined,
  state: PricingEditorState
): CanvasModelPricingCnyValue {
  if (state.billingUnit !== 'MILLION_TOKENS') return values?.scalar ?? ''
  const result: CanvasModelPricingTokenRateVector = {
    input: values?.input ?? '',
    output: values?.output ?? '',
  }
  if (state.tokenCategories.includes('cacheRead')) {
    result.cacheRead = values?.cacheRead ?? ''
  }
  if (state.tokenCategories.includes('cacheWrite')) {
    result.cacheWrite = values?.cacheWrite ?? ''
  }
  if (state.tokenCategories.includes('imageInput')) {
    result.imageInput = values?.imageInput ?? ''
  }
  return result
}

/**
 * Scopes of the next publication: changed prices, newly priced plans, every priced plan of a scope whose cost changed
 * (the API requires them), or everything a unit change re-prices.
 */
export function publicationScopes(
  state: PricingEditorState
): CanvasModelPricingCnyScope[] {
  return scopesOf(state, (row) => isRowIncluded(state, row))
}

/**
 * Scopes priced for the cell notes: the publication plus every unchanged enabled price, so points and margins come
 * from the API for every row. Null while a published value is incomplete; an incomplete unchanged price (such as a
 * legacy points price) is only left out.
 */
export function calculationScopes(
  state: PricingEditorState
): CanvasModelPricingCnyScope[] | null {
  const published = new Map(
    publicationScopes(state).map((scope) => [
      scope.parameterCombinationId,
      scope,
    ])
  )
  const candidates = scopesOf(
    state,
    (row) =>
      isRowIncluded(state, row) ||
      (!state.unitChange &&
        row.scope.enabled &&
        Boolean(row.price.current) &&
        !isPendingRow(row))
  )
  const scopes: CanvasModelPricingCnyScope[] = []
  for (const scope of candidates) {
    const required = new Set(
      published
        .get(scope.parameterCombinationId)
        ?.prices.map((price) => price.priceGroupId) ?? []
    )
    const costComplete = cnyFieldsComplete(
      scope.providerSuccessPriceCny,
      isPositiveRmbAmount
    )
    if (required.size && !costComplete) return null
    if (!costComplete) continue
    const prices = []
    for (const price of scope.prices) {
      const complete =
        cnyFieldsComplete(price.inviterDisplayPriceCny, isRmbAmount) &&
        cnyFieldsComplete(price.customerPriceCny, isPositiveRmbAmount)
      if (complete) prices.push(price)
      else if (required.has(price.priceGroupId)) return null
    }
    if (prices.length) scopes.push({ ...scope, prices })
  }
  return scopes.length > 0 ? scopes : null
}

function cnyFieldsComplete(
  value: CanvasModelPricingCnyValue,
  valid: (value: string) => boolean
) {
  return typeof value === 'string'
    ? valid(value)
    : Object.values(value).every((amount) => valid(amount ?? ''))
}

function scopesOf(
  state: PricingEditorState,
  selected: (row: PricingEditorRow) => boolean
): CanvasModelPricingCnyScope[] {
  const byScope = groupBy(
    state.rows.filter(selected),
    (row) => row.scope.parameterCombinationId
  )
  return [...byScope.values()].flatMap(([first, ...others]) => {
    if (!first) return []
    const rows = [first, ...others]
    const scope = first.scope
    const scopeId = scope.parameterCombinationId
    const costChanged =
      Boolean(state.timeOfDayChange) ||
      state.fields.some(
        (field) =>
          state.unitChange ||
          (state.drafts[scopeId]?.provider[field] ?? '') !==
            (state.originals[scopeId]?.provider[field] ?? '')
      )
    const groupIds = new Set(rows.map((row) => row.price.priceGroupId))
    const prices = scope.prices.filter(
      (price) =>
        groupIds.has(price.priceGroupId) ||
        (costChanged && Boolean(price.current))
    )
    const draft = state.drafts[scopeId]
    return [
      {
        parameterCombinationId: scopeId,
        providerSuccessPriceCny: cnyValue(draft?.provider, state),
        ...(state.timeOfDayChange
          ? { timeOfDaySchedule: state.timeOfDayChange.schedule }
          : {}),
        prices: prices.map((price) => ({
          priceGroupId: price.priceGroupId,
          ...(price.current?.id
            ? { sourcePriceVersionId: price.current.id }
            : {}),
          inviterDisplayPriceCny: cnyValue(
            draft?.inviters[price.priceGroupId],
            state
          ),
          customerPriceCny: cnyValue(
            draft?.customers[price.priceGroupId],
            state
          ),
        })),
      },
    ]
  })
}

/** Preview conflicts by row: a scheduled price marks its own row, scope conflicts mark every published row of the scope. */
export function conflictsByRow(
  state: PricingEditorState,
  conflicts: CanvasModelPricingPreview['conflicts']
): Map<string, string> {
  const marked = new Map<string, string>()
  for (const conflict of conflicts) {
    const message = PRICING_CONFLICT_MESSAGES[conflict.code] ?? 'Unknown'
    for (const row of state.rows) {
      if (
        row.scope.parameterCombinationId !== conflict.parameterCombinationId
      ) {
        continue
      }
      if (
        conflict.code === 'SCHEDULED_PRICE' &&
        conflict.priceGroupId &&
        row.price.priceGroupId !== conflict.priceGroupId
      ) {
        continue
      }
      // A model with one Token price marks the shown row of the same category and plan.
      const shownId = shownRowId(state, row)
      if (isRowIncluded(state, row) && !marked.has(shownId)) {
        marked.set(shownId, message)
      }
    }
  }
  return marked
}

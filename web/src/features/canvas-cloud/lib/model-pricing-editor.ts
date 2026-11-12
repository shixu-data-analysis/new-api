/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { SortingState } from '@tanstack/react-table'

import type {
  CanvasBillingUnit,
  CanvasModelPricingCnyCalculation,
  CanvasModelPricingCnyScope,
  CanvasModelPricingCnyValue,
  CanvasModelPricingDetail,
  CanvasModelPricingPreview,
  CanvasModelPricingPriceSnapshot,
  CanvasModelPricingTokenRateVector,
  CanvasTimeOfDaySchedule,
  CanvasInputSurcharge,
  CanvasInputSurchargeCny,
  CanvasInputSurchargeSetting,
  CanvasTokenCategory,
} from '../types'

// The editable current-pricing table: one row per pricing scope × price plan (text models: × Token category).
// Rows of one scope (and category) share the provider cost, so a cost change re-publishes every priced plan.

/**
 * A reference-material surcharge item (INPUT-ASSET-BILLING-001): the video price by generated quality, one per reference
 * video tier, or the reference image price. Tier and image prices are one price of the model, edited once for every spec.
 */
export type SurchargeField =
  | 'surcharge:video'
  | `surcharge:video:${string}`
  | 'surcharge:image'
export type PricingField = 'scalar' | CanvasTokenCategory | SurchargeField

export function isSurchargeField(field: PricingField): field is SurchargeField {
  return field.startsWith('surcharge:')
}

/** One kind of value of a price: the whole price (one value, or one per Token category) and each surcharge item's. */
interface PricingFieldValues {
  whole: CanvasModelPricingCnyValue | null | undefined
  surcharge: Partial<Record<SurchargeField, string>>
}

/**
 * A row's value read by its field, the one place that tells the fields apart: the whole price for a request or
 * second, a Token category's rate, or a surcharge item's own value, never the whole price's.
 */
function pricingFieldValue(
  field: PricingField,
  values: PricingFieldValues
): string {
  if (isSurchargeField(field)) return values.surcharge[field] ?? ''
  const { whole } = values
  if (field === 'scalar') return typeof whole === 'string' ? whole : ''
  // Anything else must be a Token category; a new kind of field stops compiling here until it is read above.
  const category: CanvasTokenCategory = field
  return typeof whole === 'object' && whole ? (whole[category] ?? '') : ''
}

// A published surcharge's points per surcharge item.
function surchargePointFields(
  surcharge: CanvasInputSurcharge | null | undefined
): Partial<Record<SurchargeField, string>> {
  if (!surcharge) return {}
  const { video, image: imagePrice, ...unread } = surcharge
  // A new surcharge item in the API type stops compiling here until it is read.
  unread satisfies Record<string, never>
  const image: Partial<Record<SurchargeField, string>> = imagePrice
    ? { 'surcharge:image': imagePrice.points }
    : {}
  if (!video) return image
  if (video.basis === 'OUTPUT_QUALITY') {
    return { 'surcharge:video': video.points, ...image }
  }
  return {
    ...Object.fromEntries(
      video.tiers.map((tier) => [`surcharge:video:${tier.name}`, tier.points])
    ),
    ...image,
  }
}

/** What a published or scheduled price shows on a row: its customer points and the CNY prices it was published with. */
export function publishedRowFigures(
  price: CanvasModelPricingPriceSnapshot | null | undefined,
  field: PricingField
) {
  const amount = (side: 'inviterDisplayPriceCny' | 'customerPriceCny') =>
    pricingFieldValue(field, {
      whole: price?.originalCnyValues?.[side],
      surcharge: surchargeDraftFields(price?.originalSurchargeCny?.[side]),
    })
  return {
    points: pricingFieldValue(field, {
      whole: price?.tokenRates ?? price?.points,
      surcharge: surchargePointFields(price?.inputSurcharge),
    }),
    inviterDisplayPriceCny: amount('inviterDisplayPriceCny'),
    customerPriceCny: amount('customerPriceCny'),
  }
}

/** A surcharge price shared by every spec: a reference video tier or the reference image price. */
function isSharedSurchargeField(field: PricingField): boolean {
  return field === 'surcharge:image' || field.startsWith('surcharge:video:')
}

/** The surcharge items a setting prices, in table order: reference video, then reference images. */
export function surchargeFields(
  setting: CanvasInputSurchargeSetting | null | undefined
): SurchargeField[] {
  if (!setting) return []
  const image: SurchargeField[] = setting.image ? ['surcharge:image'] : []
  if (setting.video?.basis === 'INPUT_TIER') {
    return [
      ...setting.video.tiers.map(
        (tier) => `surcharge:video:${tier.name}` as SurchargeField
      ),
      ...image,
    ]
  }
  return [...(setting.video ? ['surcharge:video' as const] : []), ...image]
}
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
  /** How reference materials are charged in the drafts (INPUT-ASSET-BILLING-001). */
  inputSurcharge?: CanvasInputSurchargeSetting | null
  /** The drafts charge reference materials differently from the published prices: every price is re-entered. */
  surchargeChange?: boolean
}

// A unit or surcharge change re-enters every price the API requires, like a unit switch.
function restructured(
  state: Pick<PricingEditorState, 'unitChange' | 'surchargeChange'>
): boolean {
  return state.unitChange || state.surchargeChange === true
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

// A published surcharge amount set as draft fields: one per surcharge item.
function surchargeDraftFields(
  value: CanvasInputSurchargeCny | null | undefined
): Record<string, string> {
  if (!value) return {}
  const { video: videoAmount, image, ...unread } = value
  // A new surcharge item in the API type stops compiling here until it is read.
  unread satisfies Record<string, never>
  const video =
    typeof videoAmount === 'string'
      ? { 'surcharge:video': videoAmount }
      : Object.fromEntries(
          Object.entries(videoAmount ?? {}).map(([tier, amount]) => [
            `surcharge:video:${tier}`,
            amount,
          ])
        )
  return {
    ...video,
    ...(image ? { 'surcharge:image': image } : {}),
  }
}

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

function surchargeOf(scope: PricingScope, groupId: string) {
  return scope.prices.find((price) => price.priceGroupId === groupId)?.current
    ?.originalSurchargeCny
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
          provider: {
            ...cnyDraftFields(scope.originalProviderSuccessPriceCny),
            ...surchargeDraftFields(
              scope.prices.find((price) => price.current?.originalSurchargeCny)
                ?.current?.originalSurchargeCny?.providerCny
            ),
          },
          inviters: Object.fromEntries(
            inputs.map(([groupId, input]) => [
              groupId,
              {
                ...cnyDraftFields(input.inviterDisplayPriceCny),
                ...surchargeDraftFields(
                  surchargeOf(scope, groupId)?.inviterDisplayPriceCny
                ),
              },
            ])
          ),
          customers: Object.fromEntries(
            inputs.map(([groupId, input]) => [
              groupId,
              {
                ...cnyDraftFields(input.customerPriceCny),
                ...surchargeDraftFields(
                  surchargeOf(scope, groupId)?.customerPriceCny
                ),
              },
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
  tokenCategories: CanvasTokenCategory[],
  inputSurcharge?: CanvasInputSurchargeSetting | null
): PricingField[] {
  return billingUnit === 'MILLION_TOKENS'
    ? tokenCategories
    : ['scalar', ...surchargeFields(inputSurcharge)]
}

export function pricingEditorRows(
  detail: CanvasModelPricingDetail,
  fields: PricingField[]
): PricingEditorRow[] {
  const rowsOf = (
    scope: CanvasModelPricingDetail['pricingScopes'][number],
    field: PricingField
  ) =>
    scope.prices.map((price) => ({
      id: `${scope.parameterCombinationId}:${field}:${price.priceGroupId}`,
      groupKey: `${scope.parameterCombinationId}:${field}`,
      scope,
      price,
      field,
    }))
  // The generated result's prices spec by spec, then each surcharge item's: reference video, then reference images.
  const scopes = detail.pricingScopes
  return [
    ...scopes.flatMap((scope) =>
      fields
        .filter((field) => !isSurchargeField(field))
        .flatMap((field) => rowsOf(scope, field))
    ),
    ...fields
      .filter(isSurchargeField)
      .flatMap((field) => scopes.flatMap((scope) => rowsOf(scope, field))),
  ]
}

// The table's sections: the generated result's prices, reference video surcharges, reference image surcharges.
function pricingSection(field: PricingField) {
  if (!isSurchargeField(field)) return 'result'
  return field === 'surcharge:image' ? 'image' : 'video'
}

/**
 * Orders the table's rows before they are paged, keeping each spec's rows together so a merged provider cost is never
 * split: the quality column reverses whole specs inside each section, the price plan column sorts inside each spec.
 */
export function sortPricingRows<
  T extends { row: { groupKey: string; field: PricingField }; plan: string },
>(items: T[], sorting: SortingState): T[] {
  const sort = sorting[0]
  if (!sort || (sort.id === 'combination' && !sort.desc)) return items
  const specs = [...groupBy(items, (item) => item.row.groupKey).values()]
  if (sort.id === 'combination') {
    return [
      ...groupBy(specs, (rows) =>
        pricingSection((rows[0] as T).row.field)
      ).values(),
    ].flatMap((section) => section.reverse().flat())
  }
  return specs.flatMap((rows) =>
    [...rows].sort(
      (left, right) =>
        left.plan.localeCompare(right.plan) * (sort.desc ? -1 : 1)
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
  const scopeId = shownScopeId(state)
  if (!state.oneTokenPrice) {
    // A shared surcharge price is one row per plan, on the first spec's rows.
    return state.rows.filter(
      (row) =>
        !isSharedSurchargeField(row.field) ||
        row.scope.parameterCombinationId === scopeId
    )
  }
  return state.rows.filter(
    (row) => row.scope.parameterCombinationId === scopeId
  )
}

// The shown row that stands for a row of any spec: the same category and plan.
function shownRowId(state: PricingEditorState, row: PricingEditorRow) {
  return state.oneTokenPrice || isSharedSurchargeField(row.field)
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
  if (!state.oneTokenPrice && !isSharedSurchargeField(row.field)) {
    return withDraftValue(drafts, row, side, value)
  }
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
  return restructured(state) ? !inUnitChange(row) : !row.scope.enabled
}

/** The shared cost stays editable on pending rows; publishing it then reports the schedule. */
export function isCostLocked(
  state: PricingEditorState,
  groupRows: PricingEditorRow[]
): boolean {
  if (state.unitPending) return true
  return groupRows.every((row) =>
    restructured(state) ? !inUnitChange(row) : !row.scope.enabled
  )
}

export function isSideChanged(
  state: PricingEditorState,
  row: PricingEditorRow,
  side: PricingSide
): boolean {
  if (restructured(state)) return draftValue(state, row, side) !== ''
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
  if (restructured(state)) return inUnitChange(row)
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
  const flagEmpty = !restructured(state) || attempted
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

/**
 * What Cloud calculated for a row: the customer points (per request or second, or the Token category's rate per
 * million) and the differences between the three prices, each a surcharge row's own.
 */
export function calculatedRowFigures(
  result: CalculatedPrice,
  field: PricingField
) {
  // Cloud keys surcharge calculations by item ("video", "video:<tier>", "image").
  const items = Object.entries(result.surchargeCalculations ?? {})
  const surcharge = (
    pick: (item: (typeof items)[number][1]) => string
  ): Partial<Record<SurchargeField, string>> =>
    Object.fromEntries(
      items.map(([item, calculation]) => [
        `surcharge:${item}`,
        pick(calculation),
      ])
    )
  return {
    points: pricingFieldValue(field, {
      whole: result.normalizedTokenRates ?? result.normalizedPoints,
      surcharge: surcharge((item) => item.points),
    }),
    inviterMinusProviderCny: pricingFieldValue(field, {
      whole: result.inviterMinusProviderCny,
      surcharge: surcharge((item) => item.inviterMinusProviderCny),
    }),
    customerMinusInviterCny: pricingFieldValue(field, {
      whole: result.customerMinusInviterCny,
      surcharge: surcharge((item) => item.customerMinusInviterCny),
    }),
  }
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
  if (cost === '' && restructured(state) && !attempted) return
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

// The surcharge amounts of a draft side in the API's form; undefined without a surcharge setting.
function surchargeCny(
  values: Record<string, string> | undefined,
  state: PricingEditorState
): CanvasInputSurchargeCny | undefined {
  const setting = state.inputSurcharge
  if (!setting || state.billingUnit === 'MILLION_TOKENS') return undefined
  let video: CanvasInputSurchargeCny['video']
  if (setting.video?.basis === 'INPUT_TIER') {
    video = Object.fromEntries(
      setting.video.tiers.map((tier) => [
        tier.name,
        values?.[`surcharge:video:${tier.name}`] ?? '',
      ])
    )
  } else if (setting.video) {
    video = values?.['surcharge:video'] ?? ''
  }
  return {
    ...(video !== undefined ? { video } : {}),
    ...(setting.image ? { image: values?.['surcharge:image'] ?? '' } : {}),
  }
}

function surchargeComplete(
  value: CanvasInputSurchargeCny | undefined,
  valid: (value: string) => boolean
) {
  if (!value) return true
  const amounts = [
    ...(typeof value.video === 'string'
      ? [value.video]
      : Object.values(value.video ?? {})),
    ...(value.image !== undefined ? [value.image] : []),
  ]
  return amounts.every(valid)
}

function cnyValue(
  values: Record<string, string> | undefined,
  state: PricingEditorState
): CanvasModelPricingCnyValue {
  if (state.billingUnit !== 'MILLION_TOKENS') return values?.scalar ?? ''
  // Exactly the categories the model declares: a video has only its two totals, no input or output.
  return Object.fromEntries(
    state.tokenCategories.map((category) => [
      category,
      values?.[category] ?? '',
    ])
  ) as CanvasModelPricingTokenRateVector
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
      (!restructured(state) &&
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
    const costComplete =
      cnyFieldsComplete(scope.providerSuccessPriceCny, isPositiveRmbAmount) &&
      surchargeComplete(scope.providerSurchargeCny, isPositiveRmbAmount)
    if (required.size && !costComplete) return null
    if (!costComplete) continue
    const prices = []
    for (const price of scope.prices) {
      const complete =
        cnyFieldsComplete(price.inviterDisplayPriceCny, isRmbAmount) &&
        cnyFieldsComplete(price.customerPriceCny, isPositiveRmbAmount) &&
        surchargeComplete(price.inviterSurchargeCny, isRmbAmount) &&
        surchargeComplete(price.customerSurchargeCny, isPositiveRmbAmount)
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

function withSurcharge<K extends string>(
  key: K,
  value: CanvasInputSurchargeCny | undefined
): Partial<Record<K, CanvasInputSurchargeCny>> {
  return value ? ({ [key]: value } as Record<K, CanvasInputSurchargeCny>) : {}
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
          restructured(state) ||
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
        ...withSurcharge(
          'providerSurchargeCny',
          surchargeCny(draft?.provider, state)
        ),
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
          ...withSurcharge(
            'inviterSurchargeCny',
            surchargeCny(draft?.inviters[price.priceGroupId], state)
          ),
          ...withSurcharge(
            'customerSurchargeCny',
            surchargeCny(draft?.customers[price.priceGroupId], state)
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

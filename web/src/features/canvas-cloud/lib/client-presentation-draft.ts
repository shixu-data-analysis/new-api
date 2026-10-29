/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type {
  CanvasClientIconVisibility,
  CanvasClientPresentation,
  CanvasClientPresentationBadge,
  CanvasClientPresentationModel,
  CanvasClientPresentationPublicationRequest,
} from '../types'
import {
  UNTAGGED_CATEGORY,
  categoryNameError,
  orderCategories,
  resolveDefaultCategory,
  type CategoryDefaultSetting,
} from './model-categories'
import {
  MODEL_BADGE_LIMIT,
  MODEL_BADGE_NAME_MAX_LENGTH,
  MODEL_ICON_KEYS,
  isModelPresentationColor,
  shownModelIconKey,
  type ModelIconKey,
  type ModelPresentationColor,
} from './model-icons'

export type PresentationCapability = CanvasClientPresentationModel['capability']
export const PRESENTATION_CAPABILITIES: PresentationCapability[] = [
  'image.generate',
  'video.generate',
  'chat.generate',
]

export interface DraftModel {
  modelKey: string
  capability: PresentationCapability
  providerName: string
  /** Category ids, including `new-N` ids of categories created in the draft. */
  tagIds: string[]
  customerVisible: boolean
  displayName: string
  description: string
  /** null, as the server sends a model never given an icon, shows the generic icon of its generation type in gray. */
  iconKey: ModelIconKey | null
  /** Published only together with an icon. */
  iconColor: ModelPresentationColor
  badgeIds: string[]
}

export interface DraftCategory {
  /** A category id, or `new-N` for a category created in the draft. */
  id: string
  name: string
  /** null shows the default category icon. */
  iconKey: ModelIconKey | null
  /** Kept while the default icon is shown; it only takes effect with an icon. */
  iconColor: ModelPresentationColor
  description: string
}

export interface PresentationSnapshot {
  models: Record<string, DraftModel>
  orders: Record<PresentationCapability, string[]>
  badges: CanvasClientPresentationBadge[]
  categories: DraftCategory[]
  /** Category ids of each generation type: the administrator order, then categories of its models that have no position, by name. */
  categoryOrders: Record<PresentationCapability, string[]>
  categoryDefaults: Record<PresentationCapability, CategoryDefaultSetting>
  iconVisibility: CanvasClientIconVisibility
}

/**
 * Edits replace only what they change, so an unchanged model, order or badge list keeps the same object as
 * the published snapshot; comparisons and row rendering skip those by reference.
 */
export interface PresentationDraftState {
  revision: number
  published: PresentationSnapshot
  draft: PresentationSnapshot
  /** Models that have never been ordered in the published state. */
  unsorted: Set<string>
  nextBadgeRef: number
  nextCategoryRef: number
}

export type BatchKind = 'icon' | 'color' | 'add' | 'remove'

/** Where moved models go: the top, the bottom, or a 1-based position for the first of them. */
export type MoveTarget = 'top' | 'bottom' | number

/**
 * Moves the given models together, keeping their current relative order, so that the first of them
 * ends at the target; a position past the end places them at the bottom.
 */
export function moveModels(
  order: string[],
  modelKeys: string[],
  target: MoveTarget
): string[] {
  const moving = new Set(modelKeys)
  const moved = order.filter((key) => moving.has(key))
  const rest = order.filter((key) => !moving.has(key))
  let index = rest.length
  if (target === 'top') index = 0
  else if (typeof target === 'number') {
    index = Math.min(Math.max(Math.trunc(target) - 1, 0), rest.length)
  }
  return [...rest.slice(0, index), ...moved, ...rest.slice(index)]
}

export type CategoryPatch = Partial<
  Pick<DraftCategory, 'name' | 'description' | 'iconKey' | 'iconColor'>
>

export type PresentationDraftAction =
  | { type: 'load'; data: CanvasClientPresentation }
  | { type: 'createCategory'; capability: PresentationCapability }
  | { type: 'updateCategory'; id: string; patch: CategoryPatch }
  | { type: 'deleteCategory'; id: string }
  | {
      type: 'moveCategory'
      capability: PresentationCapability
      id: string
      target: MoveTarget
    }
  | {
      type: 'setDefaultCategory'
      capability: PresentationCapability
      /** A category id, `UNTAGGED`, or null for no default. */
      value: string | null
    }
  | { type: 'toggleModelCategory'; modelKey: string; tagId: string }
  | { type: 'setIconVisibility'; value: CanvasClientIconVisibility }
  | { type: 'discard' }
  | {
      type: 'updateModel'
      modelKey: string
      patch: Partial<
        Pick<
          DraftModel,
          'displayName' | 'description' | 'iconKey' | 'iconColor'
        >
      >
    }
  | { type: 'toggleBadge'; modelKey: string; badgeId: string }
  | {
      type: 'moveMany'
      capability: PresentationCapability
      modelKeys: string[]
      target: MoveTarget
    }
  | { type: 'createBadge'; name: string }
  | {
      type: 'updateBadge'
      id: string
      name?: string
      color?: ModelPresentationColor
    }
  | { type: 'deleteBadge'; id: string }
  | {
      type: 'batch'
      kind: BatchKind
      modelKeys: string[]
      value: string | null
    }

function isIconKey(value: unknown): value is ModelIconKey {
  return (MODEL_ICON_KEYS as readonly unknown[]).includes(value)
}

export function snapshotFromServer(
  data: CanvasClientPresentation
): PresentationSnapshot {
  const models: Record<string, DraftModel> = {}
  const orders = emptyByCapability<string[]>(() => [])
  // The server lists ordered models first, then unsorted ones by display name.
  for (const model of data.models) {
    const iconKey = isIconKey(model.iconKey) ? model.iconKey : null
    models[model.modelKey] = {
      modelKey: model.modelKey,
      capability: model.capability,
      providerName: model.providerName,
      tagIds: model.tags.map((tag) => tag.id),
      customerVisible: model.customerVisible,
      displayName: model.displayName,
      description: model.description,
      iconKey,
      iconColor:
        iconKey && isModelPresentationColor(model.iconColor)
          ? model.iconColor
          : 'gray',
      badgeIds: model.badgeIds.slice(0, MODEL_BADGE_LIMIT),
    }
    orders[model.capability]?.push(model.modelKey)
  }
  const categories: DraftCategory[] = data.categories.map((category) => {
    const iconKey = isIconKey(category.iconKey) ? category.iconKey : null
    return {
      id: category.id,
      name: category.name,
      iconKey,
      iconColor: isModelPresentationColor(category.iconColor)
        ? category.iconColor
        : 'gray',
      description: category.description ?? '',
    }
  })
  const categoryOrders = emptyByCapability<string[]>(() => [])
  for (const order of data.categoryOrders) {
    if (order.capability in categoryOrders) {
      categoryOrders[order.capability] = order.tagIds.filter((id) =>
        categories.some((category) => category.id === id)
      )
    }
  }
  for (const capability of PRESENTATION_CAPABILITIES) {
    const used = new Set(
      Object.values(models)
        .filter((model) => model.capability === capability)
        .flatMap((model) => model.tagIds)
    )
    const unsorted = categories.filter(
      (category) =>
        used.has(category.id) &&
        !categoryOrders[capability].includes(category.id)
    )
    categoryOrders[capability] = [
      ...categoryOrders[capability],
      ...orderCategories(unsorted, []).map((category) => category.id),
    ]
  }
  const categoryDefaults = emptyByCapability<CategoryDefaultSetting>(() => ({
    tagId: null,
    untagged: false,
  }))
  for (const setting of data.categoryDefaults) {
    if (setting.capability in categoryDefaults) {
      categoryDefaults[setting.capability] = {
        tagId: setting.tagId,
        untagged: setting.untagged,
      }
    }
  }
  return {
    models,
    orders,
    badges: data.badges,
    categories,
    categoryOrders,
    categoryDefaults,
    iconVisibility: data.iconVisibility,
  }
}

function emptyByCapability<T>(
  create: () => T
): Record<PresentationCapability, T> {
  return {
    'image.generate': create(),
    'video.generate': create(),
    'chat.generate': create(),
  }
}

export function initialDraftState(
  data: CanvasClientPresentation
): PresentationDraftState {
  const published = snapshotFromServer(data)
  return {
    revision: data.revision,
    published,
    draft: published,
    unsorted: new Set(
      data.models
        .filter((model) => model.position === null)
        .map((model) => model.modelKey)
    ),
    nextBadgeRef: 1,
    nextCategoryRef: 1,
  }
}

export interface BatchResult {
  snapshot: PresentationSnapshot
  applied: number
  skipped: number
}

/** Applies one batch operation to the selected models; inapplicable models are skipped. */
export function applyBatch(
  snapshot: PresentationSnapshot,
  kind: BatchKind,
  modelKeys: string[],
  value: string | null
): BatchResult {
  const models = { ...snapshot.models }
  let applied = 0
  let skipped = 0
  for (const modelKey of modelKeys) {
    const model = models[modelKey]
    if (!model) continue
    let patch: Partial<DraftModel>
    if (kind === 'icon') {
      patch = { iconKey: isIconKey(value) ? value : null }
    } else if (kind === 'color') {
      if (!isModelPresentationColor(value)) {
        skipped += 1
        continue
      }
      // A model without an icon takes the generic icon of its type in the color.
      patch = {
        iconKey: shownModelIconKey(model.iconKey, model.capability),
        iconColor: value,
      }
    } else if (kind === 'add') {
      if (
        !value ||
        model.badgeIds.includes(value) ||
        model.badgeIds.length >= MODEL_BADGE_LIMIT
      ) {
        skipped += 1
        continue
      }
      patch = { badgeIds: [...model.badgeIds, value] }
    } else {
      if (!value || !model.badgeIds.includes(value)) {
        skipped += 1
        continue
      }
      patch = { badgeIds: model.badgeIds.filter((id) => id !== value) }
    }
    models[modelKey] = { ...model, ...patch }
    applied += 1
  }
  return { snapshot: { ...snapshot, models }, applied, skipped }
}

function withModel(
  state: PresentationDraftState,
  modelKey: string,
  change: (model: DraftModel) => Partial<DraftModel>
): PresentationDraftState {
  const model = state.draft.models[modelKey]
  if (!model) return state
  const models = {
    ...state.draft.models,
    [modelKey]: { ...model, ...change(model) },
  }
  return { ...state, draft: { ...state.draft, models } }
}

/** Removes a category from the library, every model, every order and every default, as the server does. */
function withoutCategory(
  snapshot: PresentationSnapshot,
  id: string
): PresentationSnapshot {
  const models = { ...snapshot.models }
  for (const model of Object.values(snapshot.models)) {
    if (model.tagIds.includes(id)) {
      models[model.modelKey] = {
        ...model,
        tagIds: model.tagIds.filter((tagId) => tagId !== id),
      }
    }
  }
  const categoryOrders = emptyByCapability<string[]>(() => [])
  const categoryDefaults = { ...snapshot.categoryDefaults }
  for (const capability of PRESENTATION_CAPABILITIES) {
    categoryOrders[capability] = snapshot.categoryOrders[capability].filter(
      (tagId) => tagId !== id
    )
    if (categoryDefaults[capability].tagId === id) {
      categoryDefaults[capability] = { tagId: null, untagged: false }
    }
  }
  return {
    ...snapshot,
    models,
    categories: snapshot.categories.filter((category) => category.id !== id),
    categoryOrders,
    categoryDefaults,
  }
}

export function presentationDraftReducer(
  state: PresentationDraftState,
  action: PresentationDraftAction
): PresentationDraftState {
  const draft = state.draft
  switch (action.type) {
    case 'load':
      return initialDraftState(action.data)
    case 'setIconVisibility':
      return { ...state, draft: { ...draft, iconVisibility: action.value } }
    case 'discard':
      return {
        ...state,
        draft: state.published,
        nextBadgeRef: 1,
        nextCategoryRef: 1,
      }
    case 'createCategory': {
      const id = `new-${state.nextCategoryRef}`
      return {
        ...state,
        draft: {
          ...draft,
          categories: [
            ...draft.categories,
            {
              id,
              name: '',
              iconKey: null,
              iconColor: 'gray',
              description: '',
            },
          ],
          categoryOrders: {
            ...draft.categoryOrders,
            [action.capability]: [
              ...draft.categoryOrders[action.capability],
              id,
            ],
          },
        },
        nextCategoryRef: state.nextCategoryRef + 1,
      }
    }
    case 'updateCategory': {
      if (!draft.categories.some((category) => category.id === action.id)) {
        return state
      }
      const categories = draft.categories.map((category) =>
        category.id === action.id ? { ...category, ...action.patch } : category
      )
      return { ...state, draft: { ...draft, categories } }
    }
    case 'deleteCategory':
      return { ...state, draft: withoutCategory(draft, action.id) }
    case 'moveCategory':
      return {
        ...state,
        draft: {
          ...draft,
          categoryOrders: {
            ...draft.categoryOrders,
            [action.capability]: moveModels(
              draft.categoryOrders[action.capability],
              [action.id],
              action.target
            ),
          },
        },
      }
    case 'setDefaultCategory':
      return {
        ...state,
        draft: {
          ...draft,
          categoryDefaults: {
            ...draft.categoryDefaults,
            [action.capability]: {
              tagId:
                action.value && action.value !== UNTAGGED_CATEGORY
                  ? action.value
                  : null,
              untagged: action.value === UNTAGGED_CATEGORY,
            },
          },
        },
      }
    case 'toggleModelCategory': {
      const next = withModel(state, action.modelKey, (model) => ({
        tagIds: model.tagIds.includes(action.tagId)
          ? model.tagIds.filter((id) => id !== action.tagId)
          : [...model.tagIds, action.tagId],
      }))
      // A category that gains its first model of a type joins the end of that type's order.
      const model = next.draft.models[action.modelKey]
      if (
        !model ||
        !model.tagIds.includes(action.tagId) ||
        next.draft.categoryOrders[model.capability].includes(action.tagId)
      ) {
        return next
      }
      return {
        ...next,
        draft: {
          ...next.draft,
          categoryOrders: {
            ...next.draft.categoryOrders,
            [model.capability]: [
              ...next.draft.categoryOrders[model.capability],
              action.tagId,
            ],
          },
        },
      }
    }
    case 'updateModel':
      return withModel(state, action.modelKey, () => action.patch)
    case 'toggleBadge':
      return withModel(state, action.modelKey, (model) => {
        if (model.badgeIds.includes(action.badgeId)) {
          return {
            badgeIds: model.badgeIds.filter((id) => id !== action.badgeId),
          }
        }
        return model.badgeIds.length < MODEL_BADGE_LIMIT
          ? { badgeIds: [...model.badgeIds, action.badgeId] }
          : {}
      })
    case 'moveMany':
      return {
        ...state,
        draft: {
          ...draft,
          orders: {
            ...draft.orders,
            [action.capability]: moveModels(
              draft.orders[action.capability],
              action.modelKeys,
              action.target
            ),
          },
        },
      }
    case 'createBadge':
      return {
        ...state,
        draft: {
          ...draft,
          badges: [
            ...draft.badges,
            {
              id: `new-${state.nextBadgeRef}`,
              name: action.name.trim(),
              color: 'gray',
            },
          ],
        },
        nextBadgeRef: state.nextBadgeRef + 1,
      }
    case 'updateBadge': {
      if (!draft.badges.some((badge) => badge.id === action.id)) return state
      const badges = draft.badges.map((badge) =>
        badge.id === action.id
          ? {
              ...badge,
              ...(action.name !== undefined && { name: action.name.trim() }),
              ...(action.color !== undefined && { color: action.color }),
            }
          : badge
      )
      return { ...state, draft: { ...draft, badges } }
    }
    case 'deleteBadge': {
      const models = { ...draft.models }
      for (const model of Object.values(draft.models)) {
        if (model.badgeIds.includes(action.id)) {
          models[model.modelKey] = {
            ...model,
            badgeIds: model.badgeIds.filter((id) => id !== action.id),
          }
        }
      }
      return {
        ...state,
        draft: {
          ...draft,
          models,
          badges: draft.badges.filter((badge) => badge.id !== action.id),
        },
      }
    }
    case 'batch':
      return {
        ...state,
        draft: applyBatch(draft, action.kind, action.modelKeys, action.value)
          .snapshot,
      }
  }
}

const sameKeys = (left: string[], right: string[]) =>
  left === right ||
  (left.length === right.length &&
    left.every((key, index) => key === right[index]))

const sameSet = (left: string[], right: string[]) =>
  left.length === right.length && left.every((key) => right.includes(key))

function sameModel(
  published: DraftModel,
  draft: DraftModel,
  deleted: Set<string>,
  deletedCategories: Set<string>
) {
  if (published === draft) return true
  return (
    // A deleted category leaves the published model on the server too.
    sameSet(
      published.tagIds.filter((id) => !deletedCategories.has(id)),
      draft.tagIds
    ) &&
    published.displayName.trim() === draft.displayName.trim() &&
    published.description.trim() === draft.description.trim() &&
    published.iconKey === draft.iconKey &&
    (draft.iconKey === null || published.iconColor === draft.iconColor) &&
    // A deleted badge leaves the published model on the server too.
    sameKeys(
      published.badgeIds.filter((id) => !deleted.has(id)),
      draft.badgeIds
    )
  )
}

export interface PresentationChanges {
  modelKeys: string[]
  capabilities: PresentationCapability[]
  badges: boolean
  /** The category library changed: a category was created, edited or deleted. */
  categories: boolean
  categoryCapabilities: PresentationCapability[]
  defaultCapabilities: PresentationCapability[]
  iconVisibility: boolean
}

function sameCategory(published: DraftCategory, draft: DraftCategory) {
  return (
    published === draft ||
    (published.name.trim() === draft.name.trim() &&
      published.description.trim() === draft.description.trim() &&
      published.iconKey === draft.iconKey &&
      (draft.iconKey === null || published.iconColor === draft.iconColor))
  )
}

function deletedCategoryIds(state: PresentationDraftState): Set<string> {
  const draftIds = new Set(
    state.draft.categories.map((category) => category.id)
  )
  return new Set(
    state.published.categories
      .map((category) => category.id)
      .filter((id) => !draftIds.has(id))
  )
}

export function presentationChanges(
  state: PresentationDraftState
): PresentationChanges {
  const draftBadgeIds = new Set(state.draft.badges.map((badge) => badge.id))
  const deleted = new Set(
    state.published.badges
      .map((badge) => badge.id)
      .filter((id) => !draftBadgeIds.has(id))
  )
  const deletedCategories = deletedCategoryIds(state)
  const publishedCategories = new Map(
    state.published.categories.map((category) => [category.id, category])
  )
  // The server drops a deleted category from orders and defaults, so that alone is no order or default change.
  const publishedDefault = (capability: PresentationCapability) => {
    const setting = state.published.categoryDefaults[capability]
    return setting.tagId && deletedCategories.has(setting.tagId)
      ? { tagId: null, untagged: false }
      : setting
  }
  return {
    modelKeys: Object.values(state.draft.models)
      .filter((model) => {
        const published = state.published.models[model.modelKey]
        return (
          !published || !sameModel(published, model, deleted, deletedCategories)
        )
      })
      .map((model) => model.modelKey),
    categories:
      deletedCategories.size > 0 ||
      state.draft.categories.some((category) => {
        const published = publishedCategories.get(category.id)
        return !published || !sameCategory(published, category)
      }),
    categoryCapabilities: PRESENTATION_CAPABILITIES.filter(
      (capability) =>
        !sameKeys(
          state.draft.categoryOrders[capability],
          state.published.categoryOrders[capability].filter(
            (id) => !deletedCategories.has(id)
          )
        )
    ),
    defaultCapabilities: PRESENTATION_CAPABILITIES.filter((capability) => {
      const draft = state.draft.categoryDefaults[capability]
      const published = publishedDefault(capability)
      return (
        draft.tagId !== published.tagId || draft.untagged !== published.untagged
      )
    }),
    capabilities: PRESENTATION_CAPABILITIES.filter(
      (capability) =>
        !sameKeys(
          state.draft.orders[capability],
          state.published.orders[capability]
        )
    ),
    badges:
      state.draft.badges !== state.published.badges &&
      JSON.stringify(state.draft.badges) !==
        JSON.stringify(state.published.badges),
    iconVisibility:
      state.draft.iconVisibility.categories !==
        state.published.iconVisibility.categories ||
      state.draft.iconVisibility.models !==
        state.published.iconVisibility.models,
  }
}

export function hasPresentationChanges(changes: PresentationChanges): boolean {
  return (
    changes.modelKeys.length > 0 ||
    changes.capabilities.length > 0 ||
    changes.badges ||
    changes.categories ||
    changes.categoryCapabilities.length > 0 ||
    changes.defaultCapabilities.length > 0 ||
    changes.iconVisibility
  )
}

/** Categories whose name is empty, too long or used twice; publishing waits until every name is valid. */
export function categoriesWithInvalidName(
  snapshot: PresentationSnapshot
): DraftCategory[] {
  return snapshot.categories.filter((category) =>
    categoryNameError(snapshot.categories, category.name, category.id)
  )
}

export interface TypeCategory extends DraftCategory {
  /** Models of the type in the category; only customer-visible models when the counts are for the preview. */
  count: number
}

/**
 * The categories a generation type lists, in its order: in the admin list every category of the type's order,
 * in the client preview only categories with customer-visible models, plus the category the type opens on.
 */
export function typeCategories(
  snapshot: PresentationSnapshot,
  capability: PresentationCapability,
  options: { visibleOnly: boolean }
): {
  categories: TypeCategory[]
  untaggedCount: number
  defaultId: string | null
} {
  const models = Object.values(snapshot.models).filter(
    (model) =>
      model.capability === capability &&
      (!options.visibleOnly || model.customerVisible)
  )
  const count = (id: string) =>
    models.filter((model) => model.tagIds.includes(id)).length
  // A category without any model belongs to no type yet, so every type lists it to keep it editable; positions
  // only arrange the list.
  const orphan = (id: string) =>
    !Object.values(snapshot.models).some((model) => model.tagIds.includes(id))
  const listed = orderCategories(
    snapshot.categories.filter((category) =>
      options.visibleOnly
        ? count(category.id) > 0
        : snapshot.categoryOrders[capability].includes(category.id) ||
          count(category.id) > 0 ||
          orphan(category.id)
    ),
    snapshot.categoryOrders[capability]
  ).map((category) => ({ ...category, count: count(category.id) }))
  const untaggedCount = models.filter((model) => !model.tagIds.length).length
  return {
    categories: listed,
    untaggedCount,
    defaultId: resolveDefaultCategory(
      listed.filter((category) => category.count > 0),
      untaggedCount > 0,
      snapshot.categoryDefaults[capability]
    ),
  }
}

/** Models whose client display name is empty; publishing waits until they have one. */
export function modelsWithoutName(
  snapshot: PresentationSnapshot
): DraftModel[] {
  return Object.values(snapshot.models).filter(
    (model) => !model.displayName.trim()
  )
}

export function buildPublication(
  state: PresentationDraftState,
  changes: PresentationChanges
): CanvasClientPresentationPublicationRequest {
  const publishedBadges = new Map(
    state.published.badges.map((badge) => [badge.id, badge])
  )
  const draftBadgeIds = new Set(state.draft.badges.map((badge) => badge.id))
  return {
    expectedRevision: state.revision,
    models: changes.modelKeys.flatMap((modelKey) => {
      const model = state.draft.models[modelKey]
      if (!model) return []
      const published = state.published.models[modelKey]
      const displayName = model.displayName.trim()
      const description = model.description.trim()
      // An unchanged name or description is left out, so the server keeps it following its current source.
      return {
        modelKey,
        ...(displayName !== published?.displayName.trim() && { displayName }),
        ...(description !== published?.description.trim() && { description }),
        iconKey: model.iconKey,
        iconColor: model.iconKey ? model.iconColor : null,
        badges: model.badgeIds,
        tags: model.tagIds,
      }
    }),
    orders: changes.capabilities.map((capability) => ({
      capability,
      modelKeys: state.draft.orders[capability],
    })),
    badges: {
      created: state.draft.badges
        .filter((badge) => !publishedBadges.has(badge.id))
        .map((badge) => ({
          ref: badge.id,
          name: badge.name,
          color: badge.color,
        })),
      updated: state.draft.badges.filter((badge) => {
        const published = publishedBadges.get(badge.id)
        return (
          published &&
          (published.name !== badge.name || published.color !== badge.color)
        )
      }),
      deletedIds: state.published.badges
        .map((badge) => badge.id)
        .filter((id) => !draftBadgeIds.has(id)),
    },
    ...categoryPublication(state, changes),
    ...(changes.iconVisibility && {
      iconVisibility: state.draft.iconVisibility,
    }),
  }
}

function categoryInput(category: DraftCategory) {
  return {
    name: category.name.trim(),
    iconKey: category.iconKey,
    iconColor: category.iconColor,
    description: category.description.trim() || null,
  }
}

function categoryPublication(
  state: PresentationDraftState,
  changes: PresentationChanges
): Pick<
  CanvasClientPresentationPublicationRequest,
  'categories' | 'categoryOrders' | 'categoryDefaults'
> {
  const published = new Map(
    state.published.categories.map((category) => [category.id, category])
  )
  return {
    categories: {
      created: state.draft.categories
        .filter((category) => !published.has(category.id))
        .map((category) => ({ ref: category.id, ...categoryInput(category) })),
      updated: state.draft.categories
        .filter((category) => {
          const before = published.get(category.id)
          return before && !sameCategory(before, category)
        })
        .map((category) => ({ id: category.id, ...categoryInput(category) })),
      deletedIds: [...deletedCategoryIds(state)],
    },
    categoryOrders: changes.categoryCapabilities.map((capability) => ({
      capability,
      tagIds: state.draft.categoryOrders[capability],
    })),
    categoryDefaults: changes.defaultCapabilities.map((capability) => ({
      capability,
      ...state.draft.categoryDefaults[capability],
    })),
  }
}

export type BadgeNameError =
  | { kind: 'empty' }
  | { kind: 'tooLong' }
  | { kind: 'duplicate'; name: string }

/** Mirrors the Cloud rule: 1 to 4 characters after trimming, unique ignoring case. */
export function badgeNameError(
  badges: CanvasClientPresentationBadge[],
  name: string,
  exceptId: string | null
): BadgeNameError | null {
  const trimmed = name.trim()
  if (!trimmed) return { kind: 'empty' }
  if ([...trimmed].length > MODEL_BADGE_NAME_MAX_LENGTH) {
    return { kind: 'tooLong' }
  }
  const normalized = trimmed.toLowerCase()
  if (
    badges.some(
      (badge) =>
        badge.id !== exceptId && badge.name.toLowerCase() === normalized
    )
  ) {
    return { kind: 'duplicate', name: trimmed }
  }
  return null
}

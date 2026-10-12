/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type {
  CanvasClientPresentation,
  CanvasClientPresentationBadge,
  CanvasClientPresentationModel,
  CanvasClientPresentationPublicationRequest,
  CanvasModelTag,
} from '../types'
import {
  MODEL_BADGE_LIMIT,
  MODEL_BADGE_NAME_MAX_LENGTH,
  MODEL_ICON_KEYS,
  isModelPresentationColor,
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
  tags: CanvasModelTag[]
  customerVisible: boolean
  displayName: string
  description: string
  /** null shows the generation type icon. */
  iconKey: ModelIconKey | null
  /** Kept while the default icon is shown; published only together with an icon. */
  iconColor: ModelPresentationColor
  badgeIds: string[]
}

export interface PresentationSnapshot {
  models: Record<string, DraftModel>
  orders: Record<PresentationCapability, string[]>
  badges: CanvasClientPresentationBadge[]
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

export type PresentationDraftAction =
  | { type: 'load'; data: CanvasClientPresentation }
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
  const orders: Record<PresentationCapability, string[]> = {
    'image.generate': [],
    'video.generate': [],
    'chat.generate': [],
  }
  // The server lists ordered models first, then unsorted ones by display name.
  for (const model of data.models) {
    const iconKey = isIconKey(model.iconKey) ? model.iconKey : null
    models[model.modelKey] = {
      modelKey: model.modelKey,
      capability: model.capability,
      providerName: model.providerName,
      tags: model.tags,
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
  return { models, orders, badges: data.badges }
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
      if (!model.iconKey || !isModelPresentationColor(value)) {
        skipped += 1
        continue
      }
      patch = { iconColor: value }
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

export function presentationDraftReducer(
  state: PresentationDraftState,
  action: PresentationDraftAction
): PresentationDraftState {
  const draft = state.draft
  switch (action.type) {
    case 'load':
      return initialDraftState(action.data)
    case 'discard':
      return { ...state, draft: state.published, nextBadgeRef: 1 }
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

function sameModel(
  published: DraftModel,
  draft: DraftModel,
  deleted: Set<string>
) {
  if (published === draft) return true
  return (
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
  return {
    modelKeys: Object.values(state.draft.models)
      .filter((model) => {
        const published = state.published.models[model.modelKey]
        return !published || !sameModel(published, model, deleted)
      })
      .map((model) => model.modelKey),
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
  }
}

export function hasPresentationChanges(changes: PresentationChanges): boolean {
  return (
    changes.modelKeys.length > 0 ||
    changes.capabilities.length > 0 ||
    changes.badges
  )
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

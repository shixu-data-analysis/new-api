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
      type: 'move'
      capability: PresentationCapability
      from: number
      to: number
    }
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
    draft: structuredClone(published),
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
  const next = structuredClone(snapshot)
  let applied = 0
  let skipped = 0
  for (const modelKey of modelKeys) {
    const model = next.models[modelKey]
    if (!model) continue
    if (kind === 'icon') {
      model.iconKey = isIconKey(value) ? value : null
      applied += 1
    } else if (kind === 'color') {
      if (!model.iconKey || !isModelPresentationColor(value)) {
        skipped += 1
        continue
      }
      model.iconColor = value
      applied += 1
    } else if (kind === 'add') {
      if (
        !value ||
        model.badgeIds.includes(value) ||
        model.badgeIds.length >= MODEL_BADGE_LIMIT
      ) {
        skipped += 1
        continue
      }
      model.badgeIds = [...model.badgeIds, value]
      applied += 1
    } else {
      if (!value || !model.badgeIds.includes(value)) {
        skipped += 1
        continue
      }
      model.badgeIds = model.badgeIds.filter((id) => id !== value)
      applied += 1
    }
  }
  return { snapshot: next, applied, skipped }
}

export function presentationDraftReducer(
  state: PresentationDraftState,
  action: PresentationDraftAction
): PresentationDraftState {
  if (action.type === 'load') return initialDraftState(action.data)
  if (action.type === 'discard') {
    return {
      ...state,
      draft: structuredClone(state.published),
      nextBadgeRef: 1,
    }
  }
  const draft = structuredClone(state.draft)
  if (action.type === 'updateModel') {
    const model = draft.models[action.modelKey]
    if (!model) return state
    Object.assign(model, action.patch)
    return { ...state, draft }
  }
  if (action.type === 'toggleBadge') {
    const model = draft.models[action.modelKey]
    if (!model) return state
    if (model.badgeIds.includes(action.badgeId)) {
      model.badgeIds = model.badgeIds.filter((id) => id !== action.badgeId)
    } else if (model.badgeIds.length < MODEL_BADGE_LIMIT) {
      model.badgeIds = [...model.badgeIds, action.badgeId]
    }
    return { ...state, draft }
  }
  if (action.type === 'move') {
    const keys = draft.orders[action.capability]
    const [moved] = keys.splice(action.from, 1)
    if (moved === undefined) return state
    keys.splice(action.to, 0, moved)
    return { ...state, draft }
  }
  if (action.type === 'moveMany') {
    draft.orders[action.capability] = moveModels(
      draft.orders[action.capability],
      action.modelKeys,
      action.target
    )
    return { ...state, draft }
  }
  if (action.type === 'createBadge') {
    draft.badges.push({
      id: `new-${state.nextBadgeRef}`,
      name: action.name.trim(),
      color: 'gray',
    })
    return { ...state, draft, nextBadgeRef: state.nextBadgeRef + 1 }
  }
  if (action.type === 'updateBadge') {
    const badge = draft.badges.find((item) => item.id === action.id)
    if (!badge) return state
    if (action.name !== undefined) badge.name = action.name.trim()
    if (action.color !== undefined) badge.color = action.color
    return { ...state, draft }
  }
  if (action.type === 'deleteBadge') {
    draft.badges = draft.badges.filter((badge) => badge.id !== action.id)
    for (const model of Object.values(draft.models)) {
      model.badgeIds = model.badgeIds.filter((id) => id !== action.id)
    }
    return { ...state, draft }
  }
  return {
    ...state,
    draft: applyBatch(draft, action.kind, action.modelKeys, action.value)
      .snapshot,
  }
}

function sameModel(
  published: DraftModel,
  draft: DraftModel,
  deleted: Set<string>
) {
  return (
    published.displayName.trim() === draft.displayName.trim() &&
    published.description.trim() === draft.description.trim() &&
    published.iconKey === draft.iconKey &&
    (draft.iconKey === null || published.iconColor === draft.iconColor) &&
    // A deleted badge leaves the published model on the server too.
    JSON.stringify(published.badgeIds.filter((id) => !deleted.has(id))) ===
      JSON.stringify(draft.badgeIds)
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
        JSON.stringify(state.draft.orders[capability]) !==
        JSON.stringify(state.published.orders[capability])
    ),
    badges:
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
      return {
        modelKey,
        displayName: model.displayName.trim(),
        description: model.description.trim(),
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

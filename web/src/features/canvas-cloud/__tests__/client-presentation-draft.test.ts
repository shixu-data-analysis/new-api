/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import {
  applyBatch,
  badgeNameError,
  buildPublication,
  hasPresentationChanges,
  initialDraftState,
  moveModels,
  presentationChanges,
  presentationDraftReducer,
} from '../lib/client-presentation-draft'
import type {
  CanvasClientPresentation,
  CanvasClientPresentationModel,
} from '../types'

function model(
  overrides: Partial<CanvasClientPresentationModel>
): CanvasClientPresentationModel {
  return {
    modelKey: 'image.a',
    capability: 'image.generate',
    providerName: 'DK',
    displayName: 'Alpha',
    description: '',
    tags: [],
    customerVisible: true,
    iconKey: null,
    iconColor: null,
    badgeIds: [],
    position: 1,
    ...overrides,
  }
}

const data: CanvasClientPresentation = {
  revision: 7,
  badges: [
    { id: 'b-official', name: '官渠', color: 'green' },
    { id: 'b-hot', name: '热门', color: 'red' },
  ],
  models: [
    model({
      modelKey: 'image.a',
      iconKey: 'openai',
      iconColor: 'green',
      badgeIds: ['b-hot', 'b-official'],
    }),
    model({ modelKey: 'image.b', displayName: 'Beta', position: 2 }),
    model({ modelKey: 'image.c', displayName: 'Gamma', position: null }),
    model({
      modelKey: 'video.a',
      capability: 'video.generate',
      displayName: 'Delta',
    }),
  ],
}

describe('client presentation draft', () => {
  it('builds one order per generation type in server order and remembers unsorted models', () => {
    const state = initialDraftState(data)

    expect(state.draft.orders['image.generate']).toEqual([
      'image.a',
      'image.b',
      'image.c',
    ])
    expect(state.draft.orders['video.generate']).toEqual(['video.a'])
    expect([...state.unsorted]).toEqual(['image.c'])
    expect(state.draft.models['image.b']?.iconColor).toBe('gray')
  })

  it('reports no changes for a fresh draft and only changed parts after edits', () => {
    let state = initialDraftState(data)
    expect(hasPresentationChanges(presentationChanges(state))).toBe(false)

    state = presentationDraftReducer(state, {
      type: 'moveMany',
      capability: 'image.generate',
      modelKeys: ['image.c'],
      target: 'top',
    })
    state = presentationDraftReducer(state, {
      type: 'updateModel',
      modelKey: 'image.b',
      patch: { iconKey: 'gemini', iconColor: 'blue' },
    })
    state = presentationDraftReducer(state, {
      type: 'createBadge',
      name: ' 新 ',
    })
    const changes = presentationChanges(state)

    expect(changes).toEqual({
      modelKeys: ['image.b'],
      capabilities: ['image.generate'],
      badges: true,
    })
    expect(buildPublication(state, changes)).toEqual({
      expectedRevision: 7,
      models: [
        {
          modelKey: 'image.b',
          iconKey: 'gemini',
          iconColor: 'blue',
          badges: [],
        },
      ],
      orders: [
        {
          capability: 'image.generate',
          modelKeys: ['image.c', 'image.a', 'image.b'],
        },
      ],
      badges: {
        created: [{ ref: 'new-1', name: '新', color: 'gray' }],
        updated: [],
        deletedIds: [],
      },
    })
  })

  it('sends a name or description only when it changed, so the other keeps its source', () => {
    let state = initialDraftState(data)
    state = presentationDraftReducer(state, {
      type: 'updateModel',
      modelKey: 'image.b',
      patch: { description: ' 新说明 ' },
    })
    state = presentationDraftReducer(state, {
      type: 'updateModel',
      modelKey: 'video.a',
      patch: { displayName: 'Delta Pro' },
    })
    state = presentationDraftReducer(state, {
      type: 'updateModel',
      modelKey: 'image.c',
      patch: { displayName: ' Gamma ' },
    })

    expect(buildPublication(state, presentationChanges(state)).models).toEqual([
      {
        modelKey: 'image.b',
        description: '新说明',
        iconKey: null,
        iconColor: null,
        badges: [],
      },
      {
        modelKey: 'video.a',
        displayName: 'Delta Pro',
        iconKey: null,
        iconColor: null,
        badges: [],
      },
    ])
  })

  it('keeps unchanged models and the published snapshot untouched by edits', () => {
    const initial = initialDraftState(data)
    const state = presentationDraftReducer(initial, {
      type: 'updateModel',
      modelKey: 'image.b',
      patch: { displayName: 'Beta Pro' },
    })

    expect(state.draft.models['image.a']).toBe(initial.draft.models['image.a'])
    expect(state.draft.orders).toBe(initial.draft.orders)
    expect(state.published.models['image.b']?.displayName).toBe('Beta')
    expect(presentationDraftReducer(state, { type: 'discard' }).draft).toBe(
      state.published
    )
  })

  it('does not republish a model whose only change is a deleted badge', () => {
    let state = initialDraftState(data)
    state = presentationDraftReducer(state, {
      type: 'deleteBadge',
      id: 'b-hot',
    })
    const changes = presentationChanges(state)

    expect(state.draft.models['image.a']?.badgeIds).toEqual(['b-official'])
    expect(changes.modelKeys).toEqual([])
    expect(buildPublication(state, changes).badges).toEqual({
      created: [],
      updated: [],
      deletedIds: ['b-hot'],
    })
  })

  it('publishes a null color when the default icon is chosen', () => {
    let state = initialDraftState(data)
    state = presentationDraftReducer(state, {
      type: 'updateModel',
      modelKey: 'image.a',
      patch: { iconKey: null },
    })

    expect(
      buildPublication(state, presentationChanges(state)).models[0]
    ).toMatchObject({ iconKey: null, iconColor: null })
  })

  it('keeps at most two badges in click order', () => {
    let state = initialDraftState(data)
    state = presentationDraftReducer(state, { type: 'createBadge', name: '新' })
    state = presentationDraftReducer(state, {
      type: 'toggleBadge',
      modelKey: 'image.a',
      badgeId: 'new-1',
    })
    expect(state.draft.models['image.a']?.badgeIds).toEqual([
      'b-hot',
      'b-official',
    ])

    state = presentationDraftReducer(state, {
      type: 'toggleBadge',
      modelKey: 'image.a',
      badgeId: 'b-hot',
    })
    state = presentationDraftReducer(state, {
      type: 'toggleBadge',
      modelKey: 'image.a',
      badgeId: 'new-1',
    })
    expect(state.draft.models['image.a']?.badgeIds).toEqual([
      'b-official',
      'new-1',
    ])
  })

  it('skips inapplicable models in batch operations and counts them', () => {
    const { draft } = initialDraftState(data)
    const keys = ['image.a', 'image.b', 'image.c']

    expect(applyBatch(draft, 'color', keys, 'purple')).toMatchObject({
      applied: 1,
      skipped: 2,
    })
    expect(applyBatch(draft, 'add', keys, 'b-hot')).toMatchObject({
      applied: 2,
      skipped: 1,
    })
    expect(applyBatch(draft, 'remove', keys, 'b-official')).toMatchObject({
      applied: 1,
      skipped: 2,
    })
    const icons = applyBatch(draft, 'icon', keys, 'wan')
    expect(icons.applied).toBe(3)
    expect(keys.map((key) => icons.snapshot.models[key]?.iconKey)).toEqual([
      'wan',
      'wan',
      'wan',
    ])
    expect(draft.models['image.b']?.iconKey).toBeNull()
  })

  it('validates badge names like Cloud: trimmed, one to four characters, unique ignoring case', () => {
    const badges = [{ id: 'b1', name: 'Hot', color: 'red' }]

    expect(badgeNameError(badges, '   ', null)).toEqual({ kind: 'empty' })
    expect(badgeNameError(badges, '限时特价中', null)).toEqual({
      kind: 'tooLong',
    })
    expect(badgeNameError(badges, ' hot ', null)).toEqual({
      kind: 'duplicate',
      name: 'hot',
    })
    expect(badgeNameError(badges, 'HOT', 'b1')).toBeNull()
    expect(badgeNameError(badges, '官渠', null)).toBeNull()
  })

  it('moves several models together, keeping their order, to the top, the bottom or a position', () => {
    const order = ['a', 'b', 'c', 'd', 'e']

    expect(moveModels(order, ['d', 'b'], 'top')).toEqual([
      'b',
      'd',
      'a',
      'c',
      'e',
    ])
    expect(moveModels(order, ['a', 'c'], 'bottom')).toEqual([
      'b',
      'd',
      'e',
      'a',
      'c',
    ])
    expect(moveModels(order, ['e', 'a'], 2)).toEqual(['b', 'a', 'e', 'c', 'd'])
    expect(moveModels(order, ['b'], 99)).toEqual(['a', 'c', 'd', 'e', 'b'])
    expect(moveModels(order, ['c'], 1)).toEqual(['c', 'a', 'b', 'd', 'e'])
  })
})

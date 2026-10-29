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
  categoriesWithInvalidName,
  typeCategories,
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
  categories: [],
  categoryOrders: [],
  categoryDefaults: [],
  iconVisibility: { categories: true, models: true },
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
      categories: false,
      categoryCapabilities: [],
      defaultCapabilities: [],
      iconVisibility: false,
    })
    expect(buildPublication(state, changes)).toEqual({
      expectedRevision: 7,
      models: [
        {
          modelKey: 'image.b',
          iconKey: 'gemini',
          iconColor: 'blue',
          badges: [],
          tags: [],
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
      categories: { created: [], updated: [], deletedIds: [] },
      categoryOrders: [],
      categoryDefaults: [],
    })
  })

  it('publishes the icon switches only when they changed', () => {
    let state = initialDraftState(data)
    const hidden = { categories: false, models: true }
    state = presentationDraftReducer(state, {
      type: 'setIconVisibility',
      value: hidden,
    })
    const changes = presentationChanges(state)
    expect(changes.iconVisibility).toBe(true)
    expect(hasPresentationChanges(changes)).toBe(true)
    expect(buildPublication(state, changes).iconVisibility).toEqual(hidden)

    state = presentationDraftReducer(state, {
      type: 'setIconVisibility',
      value: { categories: true, models: true },
    })
    expect(hasPresentationChanges(presentationChanges(state))).toBe(false)
    expect(
      buildPublication(state, presentationChanges(state))
    ).not.toHaveProperty('iconVisibility')
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
        tags: [],
      },
      {
        modelKey: 'video.a',
        displayName: 'Delta Pro',
        iconKey: null,
        iconColor: null,
        badges: [],
        tags: [],
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

    // A model without an icon takes the generic image icon in the color.
    const colored = applyBatch(draft, 'color', keys, 'purple')
    expect(colored).toMatchObject({ applied: 3, skipped: 0 })
    for (const key of keys) {
      expect(colored.snapshot.models[key]).toMatchObject({
        iconKey: draft.models[key]?.iconKey ?? 'image',
        iconColor: 'purple',
      })
    }
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

describe('client presentation draft categories', () => {
  const portrait = {
    id: 'c-portrait',
    name: '人像',
    iconKey: 'seedance',
    iconColor: 'blue',
    description: '人像说明',
  }
  const scenery = {
    id: 'c-scenery',
    name: '风景',
    iconKey: null,
    iconColor: 'gray',
    description: null,
  }
  const motion = {
    id: 'c-motion',
    name: 'Motion',
    iconKey: 'wan',
    iconColor: 'purple',
    description: null,
  }
  const categorized: CanvasClientPresentation = {
    ...data,
    models: [
      model({ modelKey: 'image.a', tags: [portrait] }),
      model({
        modelKey: 'image.b',
        displayName: 'Beta',
        position: 2,
        tags: [portrait, scenery],
      }),
      model({
        modelKey: 'image.c',
        displayName: 'Gamma',
        position: 3,
        customerVisible: false,
        tags: [motion],
      }),
      model({
        modelKey: 'video.a',
        capability: 'video.generate',
        displayName: 'Delta',
        tags: [scenery],
      }),
    ],
    categories: [motion, portrait, scenery],
    categoryOrders: [{ capability: 'image.generate', tagIds: ['c-scenery'] }],
    categoryDefaults: [
      { capability: 'image.generate', tagId: 'c-portrait', untagged: false },
    ],
  }

  it('orders each type by the administrator order, then its unsorted categories by name', () => {
    const state = initialDraftState(categorized)
    expect(state.draft.categoryOrders['image.generate']).toEqual([
      'c-scenery',
      'c-portrait',
      'c-motion',
    ])
    expect(state.draft.categoryOrders['video.generate']).toEqual(['c-scenery'])
    expect(state.draft.models['image.b']?.tagIds).toEqual([
      'c-portrait',
      'c-scenery',
    ])
    expect(
      state.draft.categories.find((category) => category.id === 'c-scenery')
        ?.description
    ).toBe('')
    expect(hasPresentationChanges(presentationChanges(state))).toBe(false)
  })

  it('publishes a new category with its models, order position and default', () => {
    let state = initialDraftState(categorized)
    state = presentationDraftReducer(state, {
      type: 'createCategory',
      capability: 'video.generate',
    })
    state = presentationDraftReducer(state, {
      type: 'updateCategory',
      id: 'new-1',
      patch: {
        name: ' 运镜 ',
        description: ' 镜头 ',
        iconKey: 'wan',
        iconColor: 'orange',
      },
    })
    state = presentationDraftReducer(state, {
      type: 'toggleModelCategory',
      modelKey: 'video.a',
      tagId: 'new-1',
    })
    state = presentationDraftReducer(state, {
      type: 'moveCategory',
      capability: 'video.generate',
      id: 'new-1',
      target: 'top',
    })
    state = presentationDraftReducer(state, {
      type: 'setDefaultCategory',
      capability: 'video.generate',
      value: 'new-1',
    })
    const changes = presentationChanges(state)
    expect([
      changes.modelKeys,
      changes.categories,
      changes.categoryCapabilities,
      changes.defaultCapabilities,
    ]).toEqual([['video.a'], true, ['video.generate'], ['video.generate']])
    const body = buildPublication(state, changes)
    expect(body.categories).toEqual({
      created: [
        {
          ref: 'new-1',
          name: '运镜',
          iconKey: 'wan',
          iconColor: 'orange',
          description: '镜头',
        },
      ],
      updated: [],
      deletedIds: [],
    })
    expect(body.models.map((item) => [item.modelKey, item.tags])).toEqual([
      ['video.a', ['c-scenery', 'new-1']],
    ])
    expect(body.categoryOrders).toEqual([
      { capability: 'video.generate', tagIds: ['new-1', 'c-scenery'] },
    ])
    expect(body.categoryDefaults).toEqual([
      { capability: 'video.generate', tagId: 'new-1', untagged: false },
    ])
  })

  it('lists a new category without models under every type, although it got a position in one', () => {
    let state = initialDraftState(categorized)
    state = presentationDraftReducer(state, {
      type: 'createCategory',
      capability: 'image.generate',
    })
    expect(state.draft.categoryOrders['image.generate']).toContain('new-1')
    for (const capability of [
      'image.generate',
      'video.generate',
      'chat.generate',
    ] as const) {
      expect(
        typeCategories(state.draft, capability, {
          visibleOnly: false,
        }).categories.map((category) => category.id)
      ).toContain('new-1')
    }
    // The client preview still leaves it out: no customer-visible model is in it.
    expect(
      typeCategories(state.draft, 'video.generate', {
        visibleOnly: true,
      }).categories.map((category) => category.id)
    ).not.toContain('new-1')
  })

  it('adds a category to the end of a type order when it gets its first model of that type', () => {
    let state = initialDraftState(categorized)
    state = presentationDraftReducer(state, {
      type: 'toggleModelCategory',
      modelKey: 'video.a',
      tagId: 'c-portrait',
    })
    expect(state.draft.categoryOrders['video.generate']).toEqual([
      'c-scenery',
      'c-portrait',
    ])
  })

  it('deletes a category everywhere without reporting the order or default the server drops by itself', () => {
    let state = initialDraftState(categorized)
    state = presentationDraftReducer(state, {
      type: 'deleteCategory',
      id: 'c-portrait',
    })
    expect(state.draft.models['image.b']?.tagIds).toEqual(['c-scenery'])
    expect(state.draft.categoryDefaults['image.generate']).toEqual({
      tagId: null,
      untagged: false,
    })
    const changes = presentationChanges(state)
    expect([
      changes.modelKeys,
      changes.categories,
      changes.categoryCapabilities,
      changes.defaultCapabilities,
    ]).toEqual([[], true, [], []])
    expect(buildPublication(state, changes).categories?.deletedIds).toEqual([
      'c-portrait',
    ])
  })

  it('reports a renamed or recolored category as updated and blocks an empty or repeated name', () => {
    let state = initialDraftState(categorized)
    state = presentationDraftReducer(state, {
      type: 'updateCategory',
      id: 'c-motion',
      patch: { name: '人像 ' },
    })
    expect(
      categoriesWithInvalidName(state.draft)
        .map((category) => category.id)
        .sort()
    ).toEqual(['c-motion', 'c-portrait'])
    state = presentationDraftReducer(state, {
      type: 'updateCategory',
      id: 'c-motion',
      patch: { name: '动作', iconColor: 'red' },
    })
    expect(categoriesWithInvalidName(state.draft)).toEqual([])
    expect(
      buildPublication(state, presentationChanges(state)).categories?.updated
    ).toEqual([
      {
        id: 'c-motion',
        name: '动作',
        iconKey: 'wan',
        iconColor: 'red',
        description: null,
      },
    ])
    state = presentationDraftReducer(state, {
      type: 'createCategory',
      capability: 'image.generate',
    })
    expect(
      categoriesWithInvalidName(state.draft).map((category) => category.id)
    ).toEqual(['new-1'])
  })

  it('counts and resolves the default of a type for the preview from customer-visible models', () => {
    const state = initialDraftState(categorized)
    const preview = typeCategories(state.draft, 'image.generate', {
      visibleOnly: true,
    })
    expect(
      preview.categories.map((category) => [category.id, category.count])
    ).toEqual([
      ['c-scenery', 1],
      ['c-portrait', 2],
    ])
    expect([preview.untaggedCount, preview.defaultId]).toEqual([
      0,
      'c-portrait',
    ])
    const admin = typeCategories(state.draft, 'image.generate', {
      visibleOnly: false,
    })
    expect(admin.categories.map((category) => category.id)).toEqual([
      'c-scenery',
      'c-portrait',
      'c-motion',
    ])
    const untagged = presentationDraftReducer(state, {
      type: 'setDefaultCategory',
      capability: 'video.generate',
      value: 'UNTAGGED',
    })
    expect(
      typeCategories(untagged.draft, 'video.generate', { visibleOnly: true })
        .defaultId
    ).toBe('c-scenery')
  })

  it('lists a category without any model or position under every type so it stays editable', () => {
    const unused = {
      id: 'c-unused',
      name: 'Unused',
      iconKey: null,
      iconColor: 'gray',
      description: null,
    }
    const state = initialDraftState({
      ...categorized,
      categories: [...categorized.categories, unused],
    })
    for (const capability of [
      'image.generate',
      'video.generate',
      'chat.generate',
    ] as const) {
      expect(
        typeCategories(state.draft, capability, {
          visibleOnly: false,
        }).categories.map((category) => category.id)
      ).toContain('c-unused')
    }
    expect(
      typeCategories(state.draft, 'image.generate', {
        visibleOnly: true,
      }).categories.map((category) => category.id)
    ).not.toContain('c-unused')
  })
})

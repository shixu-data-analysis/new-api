/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import {
  MODEL_BRAND_ICON_PATHS,
  MODEL_ICON_KEYS,
  MODEL_PRESENTATION_COLORS,
  resolveModelIcon,
  visibleModelBadges,
} from '../lib/model-icons'

describe('model icon whitelist', () => {
  it('keeps the icon and color lists equal to Cloud and Canvas Web', () => {
    expect(MODEL_ICON_KEYS).toEqual([
      'openai',
      'gemini',
      'google',
      'midjourney',
      'minimax',
      'seedance',
      'wan',
      'image',
      'video',
      'chat',
    ])
    expect(MODEL_PRESENTATION_COLORS).toEqual([
      'gray',
      'red',
      'orange',
      'yellow',
      'green',
      'cyan',
      'blue',
      'purple',
      'pink',
    ])
    expect(Object.keys(MODEL_BRAND_ICON_PATHS)).toEqual([
      'openai',
      'gemini',
      'google',
      'midjourney',
      'minimax',
      'seedance',
      'wan',
    ])
  })

  it('falls back to the gray generation type icon for an unset or unknown icon', () => {
    expect(resolveModelIcon(null, null, 'video.generate')).toEqual({
      kind: 'generic',
      icon: 'video',
      color: null,
    })
    expect(resolveModelIcon('unknown', 'red', 'chat.generate')).toEqual({
      kind: 'generic',
      icon: 'chat',
      color: null,
    })
    expect(resolveModelIcon(undefined, undefined, 'unknown')).toEqual({
      kind: 'generic',
      icon: 'box',
      color: null,
    })
  })

  it('shows a chosen icon with gray for an unknown color', () => {
    expect(resolveModelIcon('openai', 'teal', 'image.generate')).toEqual({
      kind: 'brand',
      key: 'openai',
      color: 'gray',
    })
    expect(resolveModelIcon('video', 'pink', 'image.generate')).toEqual({
      kind: 'generic',
      icon: 'video',
      color: 'pink',
    })
  })

  it('shows at most two badges and gray for unknown badge colors', () => {
    expect(
      visibleModelBadges([
        { name: 'A', color: 'blue' },
        { name: 'B', color: 'teal' },
        { name: 'C', color: 'red' },
      ])
    ).toEqual([
      { name: 'A', color: 'blue' },
      { name: 'B', color: 'gray' },
    ])
    expect(visibleModelBadges(undefined)).toEqual([])
  })
})

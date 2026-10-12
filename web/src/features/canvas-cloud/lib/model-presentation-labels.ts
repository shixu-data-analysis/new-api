/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { PresentationCapability } from './client-presentation-draft'
import type { ModelIconKey, ModelPresentationColor } from './model-icons'

// Translation keys of icon, color and generation type names on the 客户端展示 page.
export const MODEL_ICON_LABEL_KEYS: Record<ModelIconKey, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  google: 'Google',
  midjourney: 'Midjourney',
  minimax: 'MiniMax',
  seedance: 'Seedance',
  wan: 'Tongyi Wanxiang',
  image: 'Generic image icon',
  video: 'Generic video icon',
  chat: 'Generic chat icon',
}
export const DEFAULT_MODEL_ICON_LABEL_KEY = 'Default (by type)'

export const MODEL_COLOR_LABEL_KEYS: Record<ModelPresentationColor, string> = {
  gray: 'Color gray',
  red: 'Color red',
  orange: 'Color orange',
  yellow: 'Color yellow',
  green: 'Color green',
  cyan: 'Color cyan',
  blue: 'Color blue',
  purple: 'Color purple',
  pink: 'Color pink',
}

export const PRESENTATION_TYPE_COUNT_KEYS: Record<
  PresentationCapability,
  string
> = {
  'image.generate': 'Image {{count}}',
  'video.generate': 'Video {{count}}',
  'chat.generate': 'Chat {{count}}',
}

export const PRESENTATION_TYPE_EMPTY_KEYS: Record<
  PresentationCapability,
  string
> = {
  'image.generate': 'No published image models',
  'video.generate': 'No published video models',
  'chat.generate': 'No published chat models',
}

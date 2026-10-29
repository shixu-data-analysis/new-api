/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import type { CanvasTokenCategory } from '../types'

/** Token categories in display order, with their translation keys. */
export const tokenCategoryLabel: Record<CanvasTokenCategory, string> = {
  input: 'Input',
  imageInput: 'Image input',
  output: 'Output',
  cacheRead: 'Cache read',
  cacheWrite: 'Cache write',
}

/**
 * The translation key of a category among those a model is priced by: a model that prices image input apart calls its
 * text input "Text input" (IMAGE-TOKEN-BILLING-001).
 */
export function tokenCategoryLabelKey(
  category: CanvasTokenCategory,
  priced: readonly string[]
): string {
  return isTextInput(category, priced)
    ? 'Text input'
    : tokenCategoryLabel[category]
}

/** Whether a category is the text input of a model that prices image input apart, and is named so. */
export function isTextInput(
  category: CanvasTokenCategory,
  priced: readonly string[]
): boolean {
  return category === 'input' && priced.includes('imageInput')
}

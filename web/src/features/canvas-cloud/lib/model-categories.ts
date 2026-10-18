/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program.
If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

// Model category rules shared by the presentation draft, its preview and the customer pages. Cloud
// src/model-catalog/model-tags.ts keeps the same default-category rule.

/** Stands for "no category" where a category id is expected: a filter, a default setting or a resolved default. */
export const UNTAGGED_CATEGORY = 'UNTAGGED'
export const MODEL_CATEGORY_NAME_MAX_LENGTH = 191
export const MODEL_CATEGORY_DESCRIPTION_MAX_LENGTH = 40

/** Generation types in client order (image, video, chat); pages without "all types" open on the first one present. */
export const CLIENT_CAPABILITY_ORDER = ['image.generate', 'video.generate', 'chat.generate'] as const

/** Translation key of "N image / video / text models", the model count of a category under one generation type. */
export const TYPE_MODEL_COUNT_KEYS: Record<string, string> = {
  'image.generate': '{{count}} image models',
  'video.generate': '{{count}} video models',
  'chat.generate': '{{count}} text models',
}

export function orderCapabilities(capabilities: string[]): string[] {
  const rank = (value: string) => {
    const index = (CLIENT_CAPABILITY_ORDER as readonly string[]).indexOf(value)
    return index < 0 ? CLIENT_CAPABILITY_ORDER.length : index
  }
  return [...new Set(capabilities)].sort((left, right) => rank(left) - rank(right) || left.localeCompare(right))
}

export interface CategoryDefaultSetting {
  tagId: string | null
  untagged: boolean
}

/**
 * The category a generation type opens on: the administrator default when it has models of the type, then
 * "no category" when that is the default and some model has no category, then the first category in order,
 * and "no category" when the type has no category at all. `ordered` holds only categories with models of the
 * type. Returns null when the type has no model.
 */
export function resolveDefaultCategory(
  ordered: Array<{ id: string }>,
  hasUntaggedModels: boolean,
  setting: CategoryDefaultSetting | undefined
): string | null {
  if (setting?.tagId && ordered.some((category) => category.id === setting.tagId)) {
    return setting.tagId
  }
  if (setting?.untagged && hasUntaggedModels) return UNTAGGED_CATEGORY
  if (ordered.length) return ordered[0]!.id
  return hasUntaggedModels ? UNTAGGED_CATEGORY : null
}

/** Categories in the given order of a generation type; categories missing from it follow by name. */
export function orderCategories<T extends { id: string; name: string }>(
  categories: T[],
  order: string[]
): T[] {
  const position = new Map(order.map((id, index) => [id, index]))
  const rank = (category: T) =>
    position.get(category.id) ?? Number.POSITIVE_INFINITY
  return [...categories].sort((left, right) => {
    const byPosition = rank(left) - rank(right)
    if (byPosition !== 0 && !Number.isNaN(byPosition)) return byPosition
    return (
      left.name.localeCompare(right.name, 'zh-CN') ||
      left.id.localeCompare(right.id)
    )
  })
}

export type CategoryNameError =
  | { kind: 'empty' }
  | { kind: 'tooLong' }
  | { kind: 'duplicate'; name: string }

/** Mirrors the Cloud rule: 1 to 191 characters after trimming, unique ignoring case. */
export function categoryNameError(
  categories: Array<{ id: string; name: string }>,
  name: string,
  exceptId: string | null
): CategoryNameError | null {
  const trimmed = name.trim()
  if (!trimmed) return { kind: 'empty' }
  if (trimmed.length > MODEL_CATEGORY_NAME_MAX_LENGTH) return { kind: 'tooLong' }
  const normalized = trimmed.toLowerCase()
  if (
    categories.some(
      (category) =>
        category.id !== exceptId &&
        category.name.trim().toLowerCase() === normalized
    )
  ) {
    return { kind: 'duplicate', name: trimmed }
  }
  return null
}

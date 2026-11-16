/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

type Translate = (key: string, options?: Record<string, unknown>) => string

// What a text model's JSON fields must hold, checked while they are typed: the Catalog validator says the same in its
// own words when the model is published (pixmiao-catalog catalog-definitions).

/** Why typed input tiers are not valid yet; an empty string when they are, or when the box is empty. */
export function inputTiersIssue(
  text: string,
  contextTokens: number | undefined,
  t: Translate
): string {
  if (!text.trim()) return ''
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return t('Not valid JSON: check the brackets, straight quotes and commas')
  }
  if (!Array.isArray(value)) {
    return t('Write a bracketed list, such as [272000]')
  }
  if (!value.length) {
    return t('Write at least one bound; clear the box for no tiers')
  }
  if (value.some((bound) => !Number.isSafeInteger(bound) || bound < 1)) {
    return t(
      'Each bound is a whole number of Tokens, without quotes, units or a decimal point'
    )
  }
  if (value.some((bound, index) => index > 0 && bound <= value.at(index - 1))) {
    return t('Bounds go from small to large, without repeats')
  }
  if (value.length + 1 > 9) return t('At most 9 tiers')
  if (contextTokens && value.at(-1) >= contextTokens) {
    return t('Bounds stay below the context length {{tokens}}', {
      tokens: contextTokens.toLocaleString('en-US'),
    })
  }
  return ''
}

const LEVEL = /^[a-z0-9_-]{1,32}$/
const LEVEL_KEYS = ['value', 'label', 'description', 'thinking']

/**
 * Why typed reasoning levels are not valid yet; an empty string when they are, or when the box is empty. Every level
 * must be one the Channel maps to upstream fields.
 */
export function reasoningIssue(
  text: string,
  mapped: readonly string[],
  t: Translate
): string {
  if (!text.trim()) return ''
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return t('Not valid JSON: check the brackets, straight quotes and commas')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return t('Write an object: { "default": …, "levels": [ … ] }')
  }
  const reasoning = value as { default?: unknown; levels?: unknown }
  const extra = Object.keys(reasoning).filter(
    (key) => key !== 'default' && key !== 'levels'
  )
  if (extra.length) {
    return t('Only default and levels go here, not {{keys}}', {
      keys: extra.join(', '),
    })
  }
  if (!Array.isArray(reasoning.levels) || !reasoning.levels.length) {
    return t('levels is a bracketed list of at least one level')
  }
  for (const [index, level] of reasoning.levels.entries()) {
    const position = { position: index + 1 }
    if (!level || typeof level !== 'object' || Array.isArray(level)) {
      return t(
        'Level {{position}} is written { "value": …, "label": … }',
        position
      )
    }
    const fields = level as Record<string, unknown>
    const more = Object.keys(fields).filter((key) => !LEVEL_KEYS.includes(key))
    if (more.length) {
      return t(
        'Level {{position}} has {{keys}}; only value, label, description and thinking go here',
        { ...position, keys: more.join(', ') }
      )
    }
    if (typeof fields.value !== 'string' || !LEVEL.test(fields.value)) {
      return t(
        'The value of level {{position}} is 1-32 lowercase letters, digits, - or _',
        position
      )
    }
    if (typeof fields.label !== 'string' || !fields.label.trim()) {
      return t(
        'Level {{position}} needs a label, its name in the menu',
        position
      )
    }
    if (
      fields.description !== undefined &&
      (typeof fields.description !== 'string' ||
        fields.description.includes('\n'))
    ) {
      return t(
        'The description of level {{position}} is one line of text',
        position
      )
    }
    if (fields.thinking !== undefined && fields.thinking !== false) {
      return t(
        'thinking of level {{position}} can only be false, for a level that does not think',
        position
      )
    }
  }
  const values = reasoning.levels.map((level) =>
    String((level as { value: string }).value)
  )
  const repeated = values.find((item, index) => values.indexOf(item) !== index)
  if (repeated) return t('The value {{value}} repeats', { value: repeated })
  if (!values.includes(String(reasoning.default))) {
    return t('default is the value of one level: {{values}}', {
      values: values.join(', '),
    })
  }
  const unmapped = values.filter((item) => !mapped.includes(item))
  if (unmapped.length) {
    return t(
      'The Channel sends no fields for {{levels}}; its levels are {{mapped}}',
      {
        levels: unmapped.join(', '),
        mapped: mapped.length
          ? mapped.join(', ')
          : t('none yet, add them to the Channel first'),
      }
    )
  }
  return ''
}

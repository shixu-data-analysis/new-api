/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { TFunction } from 'i18next'

import { catalogDiagnosticSentence } from '../catalog-plan-labels'

interface CatalogFailureBody {
  code?: string
  message?: string
  diagnostics?: Array<{
    code?: string
    messageKey?: string
    valueSummary?: string
    jsonPath?: string
    params?: Record<string, unknown>
  }>
}

export function catalogEditFailure(error: unknown): CatalogFailureBody {
  const data = (error as { response?: { data?: CatalogFailureBody } } | null)
    ?.response?.data
  return data ?? {}
}

function limitLabel(field: string, t: TFunction): string {
  const labels: Record<string, string> = {
    maxTokens: t('Most output Tokens'),
    contextTokens: t('Context length'),
    maxWidthPx: t('Largest width (px)'),
    maxHeightPx: t('Largest height (px)'),
    maxShortEdgePx: t('Largest short edge (px)'),
    maxDurationMs: t('Longest (seconds)'),
    maxAspectRatio: t('Largest width/height'),
    maxFrameRate: t('Highest frame rate (fps)'),
    maxBatchSize: t('Most'),
    maxPromptCharacters: t('Most prompt characters'),
    max: t('Longest (seconds)'),
  }
  return labels[field] ?? field
}

// The Catalog validator writes English. These are the messages an administrator can cause from the form; others keep their text after a plain lead-in.
function catalogDefinitionMessage(message: string, t: TFunction): string {
  const rules: Array<[RegExp, (match: RegExpExecArray) => string]> = [
    [
      /default parameters are refused by its own limits: (.+)/,
      (match) =>
        t('A default value is outside the limits of this model: {{fields}}', {
          fields: match[1],
        }),
    ],
    [
      /options.*key must be a plain identifier/,
      () =>
        t(
          'An option key must start with a letter, use only letters, numbers and underscores, and differ from existing parameter names such as ratio or quality'
        ),
    ],
    [/options.*key/, () => t('Fill in the option key; it cannot repeat')],
    [
      /options.*values.*at least/,
      () => t('A dropdown option needs at least 2 values'),
    ],
    [
      /options.*requires defaultParams/,
      () => t('Fill in the values first, then set the default'),
    ],
    [/options.*default must/, () => t('The default is not one of the values')],
    [
      /options.*non-empty string/,
      () => t('Fill in the name and the values of the option'),
    ],
    [
      /must include input and output/,
      () => t('The pricing categories must include text input and output'),
    ],
    [
      /must include total/,
      () => t('The pricing categories must include total'),
    ],
    [
      /must be an array with at least (\d+) item/,
      (match) => t('Choose at least {{count}}', { count: match[1] }),
    ],
    [
      /usageEstimate|prices a video input/,
      () =>
        t(
          'The usage estimate disagrees with the current ratio, resolution, image quality or references; change the usage estimate as well'
        ),
    ],
    [
      /requires durationRange/,
      () =>
        t(
          'Limiting duration by resolution needs an overall duration range first'
        ),
    ],
    [
      /durationRangeByQuality\.([^.\s]+) must override/,
      (match) =>
        t('{{quality}} must set at least one of shortest, longest or step', {
          quality: match[1],
        }),
    ],
    [
      /durationRangeByQuality\.([^.\s]+) must name one of qualities/,
      (match) =>
        t('{{quality}} is not one of the chosen resolutions', {
          quality: match[1],
        }),
    ],
    [
      /min must not exceed max/,
      () => t('The shortest duration cannot exceed the longest'),
    ],
    [
      /must not exceed ([A-Za-z]+)/,
      (match) =>
        t('It cannot exceed: {{field}}', { field: limitLabel(match[1], t) }),
    ],
    [
      /must be a positive (safe )?integer/,
      () => t('It must be a positive integer'),
    ],
    [
      /must be a nonnegative (safe )?integer/,
      () => t('It must be a non-negative integer'),
    ],
    [/must be a positive number/, () => t('It must be a positive number')],
    [
      /must declare minPromptCharacters of at least (\d+)/,
      (match) =>
        t(
          'The API contract requires a prompt, so the minimum prompt length must be at least {{count}}',
          { count: match[1] }
        ),
    ],
    [
      /must declare imageOperations/,
      () =>
        t(
          'An image model that takes references must state camera angle and relight (both may be off)'
        ),
    ],
  ]
  for (const [pattern, text] of rules) {
    const match = pattern.exec(message)
    if (match) return text(match)
  }
  return t('The catalog check did not pass: {{message}}', { message })
}

/** A short sentence in the reader's language; codes, paths and the original text stay available as detail. */
export function catalogEditErrorText(
  failure: CatalogFailureBody,
  t: TFunction
): string {
  const diagnostic = failure.diagnostics?.[0]
  const code = diagnostic?.code ?? failure.code ?? ''
  switch (code) {
    case 'CATALOG_ADMIN_BASE_VERSION_CHANGED':
      return t(
        'This object has a newer version; load it and apply the changes again.'
      )
    case 'CATALOG_ADMIN_MODEL_KEY_RETIRED':
      return t('This product key belongs to a deleted model.')
    case 'CATALOG_ADMIN_IMMUTABLE_FIELD':
      return t('This field cannot change after creation.')
    case 'CATALOG_ADMIN_HOST_CHANGE_UNCONFIRMED':
      return t('The API Key would be sent to a new domain; confirm it first.')
    case 'CATALOG_ADMIN_REFERENCE_MISSING':
      return t('A referenced object does not exist.')
    case 'CATALOG_PLAN_STALE':
      return t('The data changed after the preview; validate again.')
    case 'CATALOG_PLAN_BLOCKING':
      return t('The preview has problems that block publishing.')
    case 'CATALOG_PLAN_NO_CHANGES':
      return t('There is nothing to publish.')
    case 'CATALOG_PLAN_PUBLICATION_CONFLICT':
      return t('Another change published at the same time; try again.')
    default:
      break
  }
  const sentence = diagnostic
    ? catalogDiagnosticSentence(diagnostic, t)
    : undefined
  if (sentence) return sentence
  const original = diagnostic?.valueSummary ?? failure.message
  return original
    ? catalogDefinitionMessage(original, t)
    : t('This could not be validated. Try again.')
}

/**
 * Where a refused definition points in the model form, as a dotted path under publicInteraction, or 'upstream'.
 * The Cloud names the path in jsonPath for its own rules and in the message for the Catalog validator's.
 */
export function catalogErrorField(
  failure: CatalogFailureBody
): string | undefined {
  const diagnostic = failure.diagnostics?.[0]
  const text = `${diagnostic?.jsonPath ?? ''} ${diagnostic?.valueSummary ?? failure.message ?? ''}`
  const path =
    /publicInteraction\.((?:paramSchema|referenceLimits|mediaConstraints|defaultParams)(?:\.[A-Za-z0-9:_-]+)+)/.exec(
      text
    )
  if (path) return path[1]
  if (/usageEstimate|Token billing|prices a video input/.test(text)) {
    return 'paramSchema.usageEstimate'
  }
  if (/minPromptCharacters/.test(text)) {
    return 'referenceLimits.minPromptCharacters'
  }
  if (/imageOperations/.test(text)) return 'referenceLimits.imageOperations'
  if (/providerModel|upstream model/.test(text)) return 'upstream'
  return undefined
}

/** The message for a field: one set on it or on something inside it. */
export function fieldError(
  errors: Record<string, string>,
  keys: string[]
): string | undefined {
  const path = keys.join('.')
  const found = Object.keys(errors).find(
    (key) => key === path || key.startsWith(`${path}.`)
  )
  return found === undefined ? undefined : errors[found]
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type {
  AvailabilityProvider,
  ProbeAuth,
  ProbeRequestShape,
  ResponseRow,
} from './model-availability-api'

const MODEL_PLACEHOLDER = '{{model}}'
const CREDENTIAL_TEXT = /authorization|api[_-]?key|bearer\s|\bsk-[a-z0-9]/i
const CREDENTIAL_QUERY = /[?&](key|token|access[_-]?token|secret|password)=/i

export type RequestField = 'path' | 'template' | 'timeoutSeconds' | 'rows'
export type RequestIssues = Partial<Record<RequestField, string>>

function parsesAsJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/** The checks Cloud makes on any rule path. The value is a translation key. */
export function probePathIssue(value: string): string | undefined {
  const path = value.trim()
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    return 'The path must start with / and contain no host.'
  }
  if (CREDENTIAL_TEXT.test(path) || CREDENTIAL_QUERY.test(path)) {
    return 'The path must not contain credentials.'
  }
  return undefined
}

function pathIssue(shape: ProbeRequestShape): string | undefined {
  const issue = probePathIssue(shape.path)
  if (issue) return issue
  if (shape.method === 'GET' && !shape.path.includes(MODEL_PLACEHOLDER)) {
    return 'A GET path must contain {{model}}.'
  }
  return undefined
}

function templateIssue(shape: ProbeRequestShape): string | undefined {
  if (shape.method !== 'POST') return undefined
  const template = shape.template ?? ''
  if (!parsesAsJson(template)) return 'The request content must be valid JSON.'
  if (!template.includes(MODEL_PLACEHOLDER)) {
    return 'The request content must contain {{model}}.'
  }
  if (CREDENTIAL_TEXT.test(template)) {
    return 'The request content must not contain credentials.'
  }
  return undefined
}

/** The checks Cloud also makes on the request, shown beside each field. Each value is a translation key. */
export function requestIssues(shape: ProbeRequestShape): RequestIssues {
  const issues: RequestIssues = {}
  const path = pathIssue(shape)
  if (path) issues.path = path
  const template = templateIssue(shape)
  if (template) issues.template = template
  const wait = shape.timeoutSeconds
  if (!Number.isInteger(wait) || wait < 5 || wait > 60) {
    issues.timeoutSeconds = 'A whole number from 5 to 60.'
  }
  return issues
}

export function ruleIssues(
  shape: ProbeRequestShape,
  rows: ResponseRow[]
): RequestIssues {
  const issues = requestIssues(shape)
  const validStatus = (status: number | null) =>
    status === null ||
    (Number.isInteger(status) && status >= 100 && status <= 599)
  if (rows.some((row) => !validStatus(row.status))) {
    issues.rows =
      'An HTTP status must be a whole number from 100 to 599, or empty.'
  } else if (rows.some((row) => !row.path.trim() || !row.value.trim())) {
    issues.rows = 'Fill in the field and the value of every rule.'
  } else if (
    !rows.some((row) => row.verdict === 'MISSING') ||
    !rows.some((row) => row.verdict === 'AVAILABLE')
  ) {
    issues.rows =
      'At least one rule must mean gone and one must mean available.'
  }
  return issues
}

/** A rule that sends a Key reaches only the models bound to a group; without one it reaches them all. */
export function probedUpstreamIds(
  models: AvailabilityProvider['models'],
  auth: ProbeAuth
): string[] {
  return models
    .filter((model) => auth === 'NONE' || model.bound)
    .flatMap((model) => model.upstreamIds)
}

/** Requests a day for this many upstream IDs, one each round. */
export function requestsPerDay(ids: number, intervalHours: number): number {
  return ids * Math.ceil(24 / intervalHours)
}

function replaceModel(value: unknown, model: string): unknown {
  if (typeof value === 'string') {
    return value.split(MODEL_PLACEHOLDER).join(model)
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceModel(item, model))
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, replaceModel(item, model)])
  )
}

/** What Cloud sends for one model, built the same way. The Key never reaches the page. */
export function requestPreview(
  shape: ProbeRequestShape,
  model: string
): string {
  const path = shape.path
    .trim()
    .split(MODEL_PLACEHOLDER)
    .join(encodeURIComponent(model))
  const lines = [`${shape.method} ${path}`]
  if (shape.auth === 'API_KEY') lines.push('Authorization: Bearer ***')
  if (shape.method !== 'POST') return lines.join('\n')
  const template = shape.template ?? ''
  lines.push(
    parsesAsJson(template)
      ? JSON.stringify(replaceModel(JSON.parse(template), model))
      : template
  )
  return lines.join('\n')
}

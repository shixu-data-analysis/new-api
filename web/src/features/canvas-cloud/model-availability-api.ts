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
import { api } from '@/lib/api'
import { getServerErrorCode } from '@/lib/server-error-message'

const base = '/canvas-api/v1/web/admin/model-availability'

export type ListSource = 'V1_MODELS' | 'PUBLIC_PRICING' | 'CUSTOM' | 'OFF'
export type ProbeAuth = 'API_KEY' | 'NONE'

export interface ListRule {
  type: 'LIST'
  path: string
  auth: ProbeAuth
  modelIdField: string
}

export interface ProbeRequestShape {
  type: 'REQUEST'
  method: 'GET' | 'POST'
  path: string
  auth: ProbeAuth
  template: string | null
  timeoutSeconds: number
}

export interface ResponseRow {
  status: number | null
  path: string
  op: 'EQUALS' | 'CONTAINS'
  value: string
  verdict: 'MISSING' | 'AVAILABLE'
}

export type RequestRule = ProbeRequestShape & { rows: ResponseRow[] }
export type CustomRule = ListRule | RequestRule

export interface ProviderPause {
  pausedAt: string
  reason: 'SUCCESS_STATUS' | 'TIMEOUT'
  credentialGroupId: string | null
  modelKey: string
}

export interface AvailabilityProvider {
  providerId: string
  providerName: string
  source: ListSource
  rule: CustomRule | null
  untested: boolean
  pause: ProviderPause | null
  models: {
    modelKey: string
    displayName: string
    upstreamIds: string[]
    bound: boolean
  }[]
}

export interface AvailabilityTarget {
  key: string
  providerId: string
  providerName: string
  credentialGroupId: string | null
  credentialGroupName: string | null
  failureCount: number
  failureReason:
    | 'AUTH'
    | 'RATE_LIMITED'
    | 'NETWORK'
    | 'SERVER'
    | 'UNSUPPORTED'
    | 'UNDETERMINED'
    | 'COST_RISK'
    | null
  failureDetail: { models?: string[]; response?: string } | null
  alerting: boolean
  awaitingConfirmation: boolean
  lastProbedAt: string | null
  lastSuccessAt: string | null
}

export interface MissingModel {
  modelKey: string
  displayName: string
  upstreamIds: string[]
  providerId: string
  providerName: string
  credentialGroupName: string | null
  firstMissingAt: string
  enabled: boolean
  controlVersion: number
}

export interface AvailabilityOverview {
  settings: {
    autoProbeEnabled: boolean
    intervalHours: number
    threshold: number
    version: number
  }
  providers: AvailabilityProvider[]
  targets: AvailabilityTarget[]
  models: MissingModel[]
  counts: { missing: number; failed: number; paused: number; badge: number }
  coverage: {
    probedTargets: number
    totalTargets: number
    offProviders: string[]
    unboundProviders: string[]
  }
  lastSuccessAt: string | null
  run: {
    trigger: 'MANUAL' | 'SCHEDULED' | 'TEST'
    doneTargets: number
    totalTargets: number
    startedAt: string
    stale: boolean
  } | null
}

export interface ListTestResult {
  ok: boolean
  results: {
    credentialGroupName: string | null
    ok: boolean
    reason: string | null
    count: number
    samples: string[]
    snippet: string
  }[]
}

export interface StoredResponse {
  timedOut: boolean
  status: number | null
  body: string
  notSent?: boolean
}

export interface RequestEvidence {
  availableModel: string
  missingModel: string
  responses: [StoredResponse, StoredResponse]
  sentAt: string
}

export type RowJudgement =
  | { result: 'COST_RISK'; reason: string }
  | { result: 'MISSING' | 'AVAILABLE'; rowIndex: number }
  | { result: 'UNDETERMINED' }

export type JudgeResult =
  | { sent: false; inProgress?: boolean }
  | {
      sent: true
      evidence: RequestEvidence
      verdict: {
        usable: boolean
        reason?: string
        judgements: [RowJudgement, RowJudgement]
      }
    }

export interface SaveSettingsInput {
  expectedVersion: number
  autoProbeEnabled: boolean
  intervalHours: number
  threshold: number
  providers: Record<
    string,
    { source: ListSource; rule: CustomRule | null; confirmUntested: boolean }
  >
}

const SERVER_ERROR_KEYS: Record<string, string> = {
  LIST_TEST_FAILED:
    'The list could not be read, so this source cannot be saved.',
  UNTESTED_NOT_CONFIRMED: 'Confirm that you are using the rule without a test.',
  RULE_UNCHANGED:
    'The rule did not change, so the next round cannot judge these models either.',
  PAUSED_REQUIRES_TEST:
    'A paused provider must send a new test before it resumes.',
  RULE_FAILED_TEST:
    'This request was sent and the rule did not pass with its answers. Send it again or change the rule.',
  VERSION_CONFLICT: 'The settings changed. Reload and try again.',
  PROBE_RUNNING: 'A probe round is already running.',
  TEST_RUNNING: 'Another request test is running. Wait for it, then try again.',
  TEST_IN_PROGRESS:
    'This request was sent and has not answered yet. Wait for it, then try again.',
}

const PROBE_FAILURE_KEYS: Record<string, string> = {
  AUTH: 'The API Key is invalid or has no access',
  RATE_LIMITED: 'Too many requests',
  NETWORK: 'The network failed or timed out',
  SERVER: 'The provider returned an error',
  UNSUPPORTED: 'The list cannot be read from this provider',
}

/** An unknown reason shows as it is rather than as a reason it is not. */
export function probeFailureKey(reason: string | null): string {
  return PROBE_FAILURE_KEYS[reason ?? ''] ?? reason ?? ''
}

/** The translation key for a refused request, or null when the server gave no known reason. */
export function modelAvailabilityErrorKey(error: unknown): string | null {
  return SERVER_ERROR_KEYS[getServerErrorCode(error) ?? ''] ?? null
}

export const modelAvailabilityQueryKey = ['canvas-cloud', 'model-availability']
export const modelAvailabilityBadgeQueryKey = [
  'canvas-cloud',
  'model-availability-badge',
]

export async function getModelAvailability(
  signal?: AbortSignal
): Promise<AvailabilityOverview> {
  return (
    await api.get<AvailabilityOverview>(base, {
      signal,
      skipErrorHandler: true,
    })
  ).data
}

export async function getModelAvailabilityBadge(
  signal?: AbortSignal
): Promise<{ count: number }> {
  return (
    await api.get<{ count: number }>(`${base}/badge`, {
      signal,
      skipErrorHandler: true,
    })
  ).data
}

export async function startModelAvailabilityProbe(): Promise<void> {
  await api.post(`${base}/probe`, undefined, { skipErrorHandler: true })
}

export async function saveModelAvailabilitySettings(
  input: SaveSettingsInput
): Promise<{ version: number }> {
  return (
    await api.put<{ version: number }>(`${base}/settings`, input, {
      skipErrorHandler: true,
    })
  ).data
}

export async function testModelAvailabilityList(input: {
  providerId: string
  source: 'V1_MODELS' | 'PUBLIC_PRICING' | 'CUSTOM'
  rule: CustomRule | null
}): Promise<ListTestResult> {
  return (
    await api.post<ListTestResult>(`${base}/test-list`, input, {
      skipErrorHandler: true,
    })
  ).data
}

export async function testModelAvailabilityRequest(input: {
  providerId: string
  request: ProbeRequestShape
  availableModel: string
  missingModel: string
  acknowledgedCost: true
}): Promise<RequestEvidence> {
  return (
    await api.post<RequestEvidence>(`${base}/test-request`, input, {
      skipErrorHandler: true,
    })
  ).data
}

export async function judgeModelAvailabilityRule(input: {
  providerId: string
  rule: RequestRule
}): Promise<JudgeResult> {
  return (
    await api.post<JudgeResult>(`${base}/judge`, input, {
      skipErrorHandler: true,
    })
  ).data
}

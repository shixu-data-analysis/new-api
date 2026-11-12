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

import type { CanvasPage } from './types'

// COMMUNITY-CONVENTION-001: the community convention, suspending customers and mails to customers.

const base = '/canvas-api/v1/web/admin'
/** Cloud takes at most this many selected customers in one send; more go to every active customer instead. */
export const SELECTED_CUSTOMER_MAIL_LIMIT = 100

export interface ConventionVersionSummary {
  id: string
  version: number
  publishedAt: string
  current: boolean
}

export interface ConventionVersion {
  id: string
  version: number
  body: string
  publishedAt: string
}

export type CustomerMailKind = 'MANUAL' | 'POINTS_EXPIRY'
export type CustomerMailFailureReason =
  | 'NOT_CONFIGURED'
  | 'REJECTED'
  | 'CUSTOMER_INACTIVE'
  | 'INTERNAL_ERROR'

export interface CustomerMailBatch {
  id: string
  kind: CustomerMailKind
  audience: 'SELECTED' | 'ALL_ACTIVE' | null
  subject: string | null
  createdAt: string
  sender: string | null
  recipients: number
  sent: number
  /** Customers with no email address in New API: nothing to send, not a failure. */
  skipped: number
  failed: number
  queued: number
}

export interface CustomerMailFailure {
  customerId: string
  username: string | null
  emailMasked: string | null
  reason: CustomerMailFailureReason
}

export interface PointsExpiryReminder {
  enabled: boolean
  daysBefore: 3 | 7 | 15 | 30
  version: number | null
}

/** The customers a mail goes to: the ones selected in 客户管理, or every active customer when it is sent. */
export type CustomerMailAudience =
  | {
      kind: 'selected'
      customers: Array<{
        customerId: string
        username: string | null
        status: string
      }>
    }
  | { kind: 'allActive' }

export const customerNoticeQueryKeys = {
  conventions: ['canvas-cloud', 'admin', 'convention-versions'] as const,
  convention: (id: string) =>
    ['canvas-cloud', 'admin', 'convention-versions', id] as const,
  mails: ['canvas-cloud', 'admin', 'customer-emails'] as const,
  audience: ['canvas-cloud', 'admin', 'customer-emails', 'audience'] as const,
  reminder: ['canvas-cloud', 'admin', 'points-expiry-reminder'] as const,
}

export async function getConventionVersions(
  query: { page: number; pageSize: number },
  signal?: AbortSignal
): Promise<CanvasPage<ConventionVersionSummary>> {
  return (
    await api.get<CanvasPage<ConventionVersionSummary>>(
      `${base}/convention-versions`,
      { params: query, signal }
    )
  ).data
}

export async function getConventionVersion(
  id: string,
  signal?: AbortSignal
): Promise<ConventionVersion> {
  return (
    await api.get<ConventionVersion>(
      `${base}/convention-versions/${encodeURIComponent(id)}`,
      { signal }
    )
  ).data
}

/** The caller keeps the idempotency key of one publish attempt so a retry replays it. */
export async function publishConventionVersion(request: {
  body: string
  idempotencyKey: string
}): Promise<ConventionVersion> {
  return (
    await api.post<ConventionVersion>(
      `${base}/convention-versions`,
      { body: request.body },
      {
        headers: { 'Idempotency-Key': request.idempotencyKey },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function suspendCustomer(customerId: string, reason: string) {
  return (
    await api.post<{ status: 'ACTIVE' | 'SUSPENDED' }>(
      `${base}/customers/${encodeURIComponent(customerId)}/suspension`,
      { reason },
      { skipErrorHandler: true }
    )
  ).data
}

export async function restoreCustomer(customerId: string, reason: string) {
  return (
    await api.post<{ status: 'ACTIVE' | 'SUSPENDED' }>(
      `${base}/customers/${encodeURIComponent(customerId)}/restoration`,
      reason ? { reason } : {},
      { skipErrorHandler: true }
    )
  ).data
}

export async function getActiveCustomerCount(
  signal?: AbortSignal
): Promise<{ activeCustomers: number }> {
  return (
    await api.get<{ activeCustomers: number }>(
      `${base}/customer-emails/audience`,
      { signal }
    )
  ).data
}

export async function sendCustomerMail(request: {
  audience: CustomerMailAudience
  subject: string
  body: string
  idempotencyKey: string
}): Promise<{ batchId: string; queued: number; skipped: number }> {
  const recipients =
    request.audience.kind === 'allActive'
      ? { allActiveCustomers: true }
      : {
          customerIds: request.audience.customers.map(
            (customer) => customer.customerId
          ),
        }
  return (
    await api.post<{ batchId: string; queued: number; skipped: number }>(
      `${base}/customer-emails`,
      { ...recipients, subject: request.subject, body: request.body },
      {
        headers: { 'Idempotency-Key': request.idempotencyKey },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function sendTestCustomerMail(
  input:
    | { kind: 'MANUAL'; subject: string; body: string }
    | { kind: 'POINTS_EXPIRY' }
) {
  return (
    await api.post<{ addressMasked: string | null }>(
      `${base}/customer-emails/test`,
      input,
      { skipErrorHandler: true }
    )
  ).data
}

export async function getCustomerMails(
  query: { kind?: CustomerMailKind; page: number; pageSize: number },
  signal?: AbortSignal
): Promise<CanvasPage<CustomerMailBatch>> {
  return (
    await api.get<CanvasPage<CustomerMailBatch>>(`${base}/customer-emails`, {
      params: query,
      signal,
    })
  ).data
}

export async function getCustomerMailFailures(
  batchId: string,
  signal?: AbortSignal
): Promise<{ items: CustomerMailFailure[] }> {
  return (
    await api.get<{ items: CustomerMailFailure[] }>(
      `${base}/customer-emails/${encodeURIComponent(batchId)}/failures`,
      { signal }
    )
  ).data
}

export async function getPointsExpiryReminder(
  signal?: AbortSignal
): Promise<PointsExpiryReminder> {
  return (
    await api.get<PointsExpiryReminder>(`${base}/points-expiry-reminder`, {
      signal,
    })
  ).data
}

export async function setPointsExpiryReminder(input: {
  enabled: boolean
  daysBefore: number
}): Promise<PointsExpiryReminder> {
  return (
    await api.put<PointsExpiryReminder>(
      `${base}/points-expiry-reminder`,
      input,
      { skipErrorHandler: true }
    )
  ).data
}

export async function getPointsExpiryReminderPreview(
  signal?: AbortSignal
): Promise<{ subject: string; html: string }> {
  return (
    await api.get<{ subject: string; html: string }>(
      `${base}/points-expiry-reminder/preview`,
      { signal }
    )
  ).data
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/

import { api } from '@/lib/api'

import type {
  CredentialGroupExecutionOverview,
  ErrorPreviewResult,
  ExecutionLocale,
  ExecutionCapacityOverview,
  ExecutionCapacityFilterStatus,
  ExecutionOverview,
  ExecutionWaitItem,
  ExecutionWaitPage,
  PublishableExecutionPolicyKind,
  PublishedExecutionPolicy,
} from './execution-types'

const webBase = '/canvas-api/v1/web'

function executionIdempotencyKey(): string {
  return `web-execution-policy-${crypto.randomUUID()}`
}

export async function getCanvasExecutionOverview(
  signal?: AbortSignal
): Promise<ExecutionOverview> {
  return (
    await api.get<ExecutionOverview>(`${webBase}/admin/execution`, { signal })
  ).data
}

export async function getCanvasExecutionCapacity(
  query: {
    page: number
    pageSize: 10 | 20 | 30 | 40 | 50 | 100
    sortBy: 'provider' | 'credentialGroup'
    sortOrder: 'asc' | 'desc'
    providerId?: string
    credentialGroup?: string
    status?: ExecutionCapacityFilterStatus[]
    waiting?: 'WITH_WAITING' | 'WITHOUT_WAITING'
  },
  signal?: AbortSignal
): Promise<ExecutionCapacityOverview> {
  return (
    await api.get<ExecutionCapacityOverview>(
      `${webBase}/admin/execution/capacity`,
      { params: { ...query, status: query.status?.join(',') }, signal }
    )
  ).data
}

export async function getCanvasExecutionWaits(
  query: {
    credentialGroupId?: string
    page: number
    pageSize: 10 | 20 | 30 | 40 | 50 | 100
  },
  signal?: AbortSignal
): Promise<ExecutionWaitPage> {
  return (
    await api.get<ExecutionWaitPage>(`${webBase}/admin/execution/waits`, {
      params: query,
      signal,
    })
  ).data
}

export async function getCanvasExecutionWaitDetail(
  taskId: string,
  signal?: AbortSignal
): Promise<ExecutionWaitItem> {
  return (
    await api.get<ExecutionWaitItem>(
      `${webBase}/admin/execution/waits/${encodeURIComponent(taskId)}`,
      { signal }
    )
  ).data
}

export async function getCanvasCredentialGroupExecution(
  credentialGroupId: string,
  signal?: AbortSignal
): Promise<CredentialGroupExecutionOverview> {
  return (
    await api.get<CredentialGroupExecutionOverview>(
      `${webBase}/admin/credential-groups/${encodeURIComponent(credentialGroupId)}/execution`,
      { signal }
    )
  ).data
}

export async function publishCanvasExecutionPolicy(input: {
  kind: PublishableExecutionPolicyKind
  scopeKey: string
  config: Record<string, unknown>
}): Promise<PublishedExecutionPolicy> {
  return (
    await api.post<PublishedExecutionPolicy>(
      `${webBase}/admin/execution/policies`,
      { ...input, confirmed: true },
      {
        headers: { 'Idempotency-Key': executionIdempotencyKey() },
        skipErrorHandler: true,
      }
    )
  ).data
}

export async function previewCanvasExecutionError(input: {
  providerId: string
  httpStatus?: number
  response: Record<string, unknown>
  locale: ExecutionLocale
  rules?: unknown[]
}): Promise<ErrorPreviewResult> {
  return (
    await api.post<ErrorPreviewResult>(
      `${webBase}/admin/providers/${encodeURIComponent(input.providerId)}/error-preview`,
      {
        ...(input.httpStatus === undefined
          ? {}
          : { httpStatus: input.httpStatus }),
        response: input.response,
        locale: input.locale,
        ...(input.rules === undefined ? {} : { rules: input.rules }),
      },
      { skipErrorHandler: true }
    )
  ).data
}

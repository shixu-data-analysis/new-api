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
  ExecutionOverview,
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

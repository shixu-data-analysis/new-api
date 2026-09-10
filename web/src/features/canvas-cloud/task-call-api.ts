/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/

import { api } from '@/lib/api'

export interface CanvasTaskCall {
  localCallId: string
  taskId: string
  outputIndices: number[]
  callType: string
  submissionId: string | null
  attemptCount: number
  state: string
  executionOrigin: string
  workerId: string
  providerId: string
  channelId: string
  modelId: string
  upstreamRequestId: string | null
  upstreamTaskId: string | null
  upstreamIdentifierSources: Record<string, string> | null
  httpStatus: number | null
  errorCode: string | null
  sanitizedError: string | null
  errorRuleId: string | null
  errorRuleVersion: number | null
  errorCategory: string | null
  policyVersions: {
    global: number | null
    channel: number | null
    limits: number | null
  }
  startedAt: string | null
  sentAt: string | null
  completedAt: string | null
  deadlineAt: string | null
  asyncInFlight: boolean
  usage: unknown
}

export interface CanvasTaskCallPage {
  page: number
  pageSize: number
  total: number
  items: CanvasTaskCall[]
}

export interface CanvasTaskCallQuery {
  callType?: string
  state?: string
  outputIndex?: number
  httpStatus?: number
  from?: string
  to?: string
  page: number
  pageSize: 10 | 20 | 30 | 40 | 50 | 100
}

export async function getCanvasTaskCalls(
  taskId: string,
  query: CanvasTaskCallQuery,
  signal?: AbortSignal
): Promise<CanvasTaskCallPage> {
  return (
    await api.get<CanvasTaskCallPage>(
      `/canvas-api/v1/web/admin/tasks/${encodeURIComponent(taskId)}/calls`,
      { params: query, signal, skipErrorHandler: true }
    )
  ).data
}

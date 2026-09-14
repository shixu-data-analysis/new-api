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
  outputIndices: number[]
  callType: string
  attemptCount: number
  chainState: string
  providerName: string | null
  channelCode: string | null
  channelVersion: number | null
  upstreamModelId: string | null
  credentialGroupName: string | null
  credentialGroupVersion: number | null
  workerId: string | null
  upstreamRequestId: string | null
  upstreamTaskId: string | null
  initialHttpStatus: number | null
  finalHttpStatus: number | null
  durationMs: number | null
  errorCode: string | null
  sanitizedError: string | null
  errorRuleId: string | null
  errorRuleVersion: number | null
  sanitizedRequest: unknown
  startedAt: string | null
  sentAt: string | null
  finalRespondedAt: string | null
}

export interface CanvasTaskCallPage {
  page: number
  pageSize: number
  total: number
  items: CanvasTaskCall[]
}

export interface CanvasTaskCallQuery {
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

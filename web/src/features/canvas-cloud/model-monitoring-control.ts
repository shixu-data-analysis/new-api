/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { QueryClient } from '@tanstack/react-query'
import * as z from 'zod'

import {
  modelAvailabilityBadgeQueryKey,
  modelAvailabilityQueryKey,
} from './model-availability-api'

/**
 * A model key's control shows on the model list, the availability page and its badge, model monitoring and the usage
 * ranking: a change made on one of them refreshes all of them, so none shows a stale state or offers a stale version.
 */
export function refreshModelControlViews(queryClient: QueryClient) {
  for (const queryKey of [
    ['canvas-cloud', 'admin-testing-models'],
    modelAvailabilityQueryKey,
    modelAvailabilityBadgeQueryKey,
    ['canvas-cloud', 'model-monitoring-overview'],
    ['canvas-cloud', 'model-usage'],
  ]) {
    void queryClient.invalidateQueries({ queryKey })
  }
}

export const modelDisableReasons = [
  'AUTHENTICATION',
  'QUOTA',
  'RATE_LIMIT',
  'UPSTREAM',
  'NETWORK',
  'MAINTENANCE',
  'MODEL_DELISTED',
  'OTHER',
] as const

export const modelEnableReasons = [
  'CREDENTIALS_UPDATED',
  'QUOTA_RESTORED',
  'RATE_LIMIT_RESOLVED',
  'UPSTREAM_RESTORED',
  'NETWORK_RESTORED',
  'MAINTENANCE_COMPLETED',
  'OTHER',
] as const

export const modelMonitoringReasonLabels: Record<string, string> = {
  AUTHENTICATION: 'Authentication failure',
  QUOTA: 'Insufficient balance or quota',
  RATE_LIMIT: 'Frequent rate limiting',
  UPSTREAM: 'Upstream service error',
  NETWORK: 'Network error',
  MAINTENANCE: 'Planned maintenance',
  MODEL_DELISTED: 'Removed by the provider',
  OTHER: 'Other',
  CREDENTIALS_UPDATED: 'Credentials updated',
  QUOTA_RESTORED: 'Balance or quota restored',
  RATE_LIMIT_RESOLVED: 'Rate limiting resolved',
  UPSTREAM_RESTORED: 'Upstream service restored',
  NETWORK_RESTORED: 'Network restored',
  MAINTENANCE_COMPLETED: 'Maintenance completed',
  REQUEST: 'Parameter or content rejection',
  UNCLASSIFIED: 'Unclassified failure',
}

/** The label key of a control reason; an unknown code shows as itself, so a reason is never left out. */
export function modelControlReasonLabel(reason: string): string {
  return modelMonitoringReasonLabels[reason] ?? reason
}

export function modelControlFormSchema(enabled: boolean) {
  const reasons: readonly string[] = enabled
    ? modelEnableReasons
    : modelDisableReasons
  return z
    .object({
      reasonCode: z.string().refine((value) => reasons.includes(value)),
      note: z.string().trim().max(1000),
    })
    .refine((value) => value.reasonCode !== 'OTHER' || Boolean(value.note), {
      path: ['note'],
    })
}

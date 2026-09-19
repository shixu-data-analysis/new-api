/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import * as z from 'zod'

export const modelDisableReasons = [
  'AUTHENTICATION',
  'QUOTA',
  'RATE_LIMIT',
  'UPSTREAM',
  'NETWORK',
  'MAINTENANCE',
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

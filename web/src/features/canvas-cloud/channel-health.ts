import * as z from 'zod'

import type { ChannelHealthReport } from './types'

export const channelDisableReasons = [
  'AUTHENTICATION',
  'QUOTA',
  'RATE_LIMIT',
  'UPSTREAM',
  'NETWORK',
  'MAINTENANCE',
  'OTHER',
] as const
export const channelEnableReasons = [
  'CREDENTIALS_UPDATED',
  'QUOTA_RESTORED',
  'RATE_LIMIT_RESOLVED',
  'UPSTREAM_RESTORED',
  'NETWORK_RESTORED',
  'MAINTENANCE_COMPLETED',
  'OTHER',
] as const
export const channelReasonLabels: Record<string, string> = {
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
export function channelControlFormSchema(enabled: boolean) {
  const reasons: readonly string[] = enabled
    ? channelEnableReasons
    : channelDisableReasons
  return z
    .object({
      reasonCode: z.string().refine((value) => reasons.includes(value)),
      note: z.string().trim().max(1000),
    })
    .refine((value) => value.reasonCode !== 'OTHER' || Boolean(value.note), {
      path: ['note'],
    })
}
export function validHealthRange(from?: Date, to?: Date) {
  return Boolean(
    from &&
    to &&
    Number.isFinite(+from) &&
    Number.isFinite(+to) &&
    +to > +from &&
    +to - +from <= 30 * 86400000
  )
}
export function healthTrendPoints(
  detail: NonNullable<ChannelHealthReport['detail']>
) {
  const values = new Map(
    detail.buckets.map((bucket) => [Date.parse(bucket.at), bucket])
  )
  const points = []
  const step = detail.bucketSeconds * 1000
  if (step <= 0) return []
  for (
    let at = Date.parse(detail.from);
    at < Date.parse(detail.to) && points.length < 121;
    at += step
  ) {
    const bucket = values.get(at)
    points.push({
      at,
      successRate:
        bucket?.successRate == null ? null : bucket.successRate * 100,
      succeeded: bucket?.succeeded ?? 0,
      failed: bucket?.failed ?? 0,
      unknown: bucket?.unknown ?? 0,
      processing: bucket?.processing ?? 0,
    })
  }
  return points
}

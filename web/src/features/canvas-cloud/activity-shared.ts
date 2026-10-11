/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createContext } from 'react'
import * as z from 'zod'

import type { CanvasActivityStatus } from './activity-types'

type ActivityRecordNavigation = {
  capture: (focusId: string) => void
  restoreFocusId?: string
  restoreScrollY?: number
  recordState?: unknown
  updateRecordState: (state: unknown) => void
}

export const ActivityRecordNavigationContext =
  createContext<ActivityRecordNavigation | null>(null)

export function activityCustomerHref(
  customerId: string,
  pointLotId?: string
): string {
  const query = new URLSearchParams({ customerId })
  if (pointLotId) query.set('pointLotId', pointLotId)
  return `/canvas-cloud/customers?${query.toString()}`
}

export function activityRecordState<T extends object>(
  value: unknown,
  kind: string
): T | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    value.kind !== kind
  ) {
    return undefined
  }
  return value as T
}

export function activityStatusKey(value: CanvasActivityStatus): string {
  return `Activity status ${value}`
}

export function minorToCny(value: string): string {
  const minor = BigInt(value)
  return `${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`
}

const ttlDaysMessage = 'Enter a whole number from 1 to 3650'

// Points and recipient limits are stored as PostgreSQL bigint.
export function positiveBigint() {
  return z
    .string()
    .trim()
    .regex(/^[1-9]\d{0,18}$/u, 'Enter a positive whole number')
    .refine(
      (value) =>
        !/^\d+$/u.test(value) || BigInt(value) <= 9_223_372_036_854_775_807n,
      'Enter a positive whole number within the supported range'
    )
}

// Fields shared by the bonus activity forms; messages are translation keys shown next to each field.
export const activityBaseSchema = z.object({
  name: z.string().trim().min(1, 'Please enter a name').max(128),
  points: positiveBigint(),
  ttlDays: z.coerce
    .number({ error: ttlDaysMessage })
    .int(ttlDaysMessage)
    .min(1, ttlDaysMessage)
    .max(3650, ttlDaysMessage),
  reason: z
    .string()
    .trim()
    .min(1, 'Enter a reason')
    .max(255, 'Reason cannot exceed 255 characters'),
})

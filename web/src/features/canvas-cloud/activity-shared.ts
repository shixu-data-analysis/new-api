/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createContext } from 'react'

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

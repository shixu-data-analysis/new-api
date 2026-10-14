/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { CanvasBillingUnit } from '../types'

// Translation keys of a billing unit name, such as "每次请求".
export function billingUnitLabelKey(unit: CanvasBillingUnit): string {
  if (unit === 'REQUEST') return 'per request'
  if (unit === 'SECOND') return 'per second'
  return 'per million tokens'
}

// Customer price unit mirrors Canvas Web ("积分／次"); unknown units stay plain points.
export function pointsUnitKey(billingUnit: CanvasBillingUnit): string {
  if (billingUnit === 'SECOND') return 'points per second'
  if (billingUnit === 'MILLION_TOKENS') return 'points per million tokens'
  if (billingUnit === 'REQUEST') return 'points per request'
  return 'points'
}

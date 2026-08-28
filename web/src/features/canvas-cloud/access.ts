/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { CanvasPrincipalType } from './types'

export const canvasCustomerSections = [
  'overview',
  'recharge',
  'models',
  'tasks',
  'consumption',
] as const

export const canvasAdminSections = [
  'dashboard',
  'usage-logs',
  'task-logs',
  'customers',
  'recharge-codes',
  'catalog',
  'pricing',
  'pricing-calculator',
  'channels',
  'refunds',
  'audit',
] as const

export function getCanvasHomeSection(
  principalType: CanvasPrincipalType
): 'dashboard' | 'overview' {
  return principalType === 'PLATFORM_ADMIN' ? 'dashboard' : 'overview'
}

export function canCanvasPrincipalManageClientAccessToken(
  principalType: CanvasPrincipalType
): boolean {
  return principalType === 'CUSTOMER'
}

export function isCanvasDefaultLandingPath(pathname: string): boolean {
  return pathname === '/dashboard' || pathname === '/dashboard/'
}

export function isCanvasSectionAllowed(
  principalType: CanvasPrincipalType,
  section: string
): boolean {
  const allowed =
    principalType === 'PLATFORM_ADMIN'
      ? canvasAdminSections
      : canvasCustomerSections
  return (allowed as readonly string[]).includes(section)
}

export function canCanvasPrincipalAccessPath(pathname: string): boolean {
  return (
    pathname.startsWith('/canvas-cloud/') || pathname.startsWith('/profile')
  )
}

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
  'task-logs',
  'customers',
  'point-campaigns',
  'invitations',
  'agents',
  'recharge-codes',
  'invite-codes',
  'catalog',
  'pricing',
  'pricing-point-rules',
  'pricing-calculator',
  'runtime',
  'execution',
  'provider-configuration',
  'audit',
] as const

export function isCanvasAdministrator(
  principalType: CanvasPrincipalType
): boolean {
  return principalType === 'PLATFORM_ADMIN' || principalType === 'SUPER_ADMIN'
}

export function getCanvasHomeSection(
  principalType: CanvasPrincipalType
): 'dashboard' | 'overview' {
  if (isCanvasAdministrator(principalType)) return 'dashboard'
  return 'overview'
}

export function canCanvasPrincipalManageClientAccessToken(
  _principalType: CanvasPrincipalType
): boolean {
  return false
}

export function canCanvasPrincipalManageAdvancedAuthentication(
  _principalType: CanvasPrincipalType
): boolean {
  return false
}

export function isCanvasDefaultLandingPath(pathname: string): boolean {
  return pathname === '/dashboard' || pathname === '/dashboard/'
}

export function isCanvasSectionAllowed(
  principalType: CanvasPrincipalType,
  section: string,
  inviterEnabled = false
): boolean {
  let allowed: readonly string[] = canvasCustomerSections
  if (isCanvasAdministrator(principalType)) allowed = canvasAdminSections
  return (
    (allowed as readonly string[]).includes(section) ||
    (principalType === 'CUSTOMER' &&
      inviterEnabled &&
      section === 'agent-center')
  )
}

export function canCanvasPrincipalAccessPath(pathname: string): boolean {
  if (
    pathname === '/canvas-cloud/refunds' ||
    pathname.startsWith('/canvas-cloud/refunds/') ||
    pathname === '/canvas-cloud/usage-logs' ||
    pathname.startsWith('/canvas-cloud/usage-logs/')
  ) {
    return false
  }
  return (
    pathname.startsWith('/canvas-cloud/') || pathname.startsWith('/profile')
  )
}

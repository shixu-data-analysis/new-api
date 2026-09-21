import { createHash } from 'node:crypto'

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import {
  canvasAdminSections,
  canCanvasPrincipalManageAdvancedAuthentication,
  canCanvasPrincipalManageClientAccessToken,
  canCanvasPrincipalAccessPath,
  getCanvasHomeSection,
  isCanvasDefaultLandingPath,
  isCanvasAdministrator,
  isCanvasSectionAllowed,
} from '../access'
import {
  canvasCompactName,
  getCanvasProductName,
  isCanvasBrandContext,
  isCanvasProductName,
} from '../brand'
import { lingCatStudioIcon } from '../lingcat-icon'

describe('Canvas role-scoped information architecture', () => {
  it('keeps customer usage pages separate from administration pages', () => {
    expect(isCanvasSectionAllowed('CUSTOMER', 'points')).toBe(true)
    expect(isCanvasSectionAllowed('CUSTOMER', 'overview')).toBe(false)
    expect(isCanvasSectionAllowed('CUSTOMER', 'tasks')).toBe(true)
    expect(isCanvasSectionAllowed('CUSTOMER', 'dashboard')).toBe(false)
    expect(isCanvasSectionAllowed('CUSTOMER', 'usage-logs')).toBe(false)
    expect(isCanvasSectionAllowed('CUSTOMER', 'agent-center')).toBe(false)
    expect(isCanvasSectionAllowed('CUSTOMER', 'agent-center', true)).toBe(true)
    expect(isCanvasSectionAllowed('CUSTOMER', 'agents', true)).toBe(false)
  })

  it('limits pricing and point rules to Canvas administrators', () => {
    expect(
      isCanvasSectionAllowed('PLATFORM_ADMIN', 'pricing-point-rules')
    ).toBe(true)
    expect(isCanvasSectionAllowed('SUPER_ADMIN', 'pricing-point-rules')).toBe(
      true
    )
    expect(
      isCanvasSectionAllowed('CUSTOMER', 'pricing-point-rules', true)
    ).toBe(false)
  })

  it('allows platform administrators only the administration sections', () => {
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'dashboard')).toBe(true)
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'usage-logs')).toBe(false)
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'task-logs')).toBe(true)
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'reports')).toBe(false)
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'overview')).toBe(false)
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'recharge')).toBe(false)
  })

  it('gives Canvas super administrators every platform administrator section and dashboard home', () => {
    expect(isCanvasAdministrator('PLATFORM_ADMIN')).toBe(true)
    expect(isCanvasAdministrator('SUPER_ADMIN')).toBe(true)
    expect(isCanvasAdministrator('CUSTOMER')).toBe(false)
    expect(getCanvasHomeSection('SUPER_ADMIN')).toBe('dashboard')
    for (const section of canvasAdminSections) {
      expect(isCanvasSectionAllowed('SUPER_ADMIN', section)).toBe(
        isCanvasSectionAllowed('PLATFORM_ADMIN', section)
      )
    }
  })

  it('uses role homes only for the generic authenticated landing path', () => {
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'overview')).toBe(false)
    expect(getCanvasHomeSection('PLATFORM_ADMIN')).toBe('dashboard')
    expect(getCanvasHomeSection('CUSTOMER')).toBe('points')
    expect(isCanvasDefaultLandingPath('/dashboard')).toBe(true)
    expect(isCanvasDefaultLandingPath('/dashboard/overview')).toBe(false)
    expect(isCanvasDefaultLandingPath('/')).toBe(false)
    expect(isCanvasDefaultLandingPath('/wallet')).toBe(false)
  })

  it('keeps client access tokens hidden from every Canvas principal', () => {
    expect(canCanvasPrincipalManageClientAccessToken('CUSTOMER')).toBe(false)
    expect(canCanvasPrincipalManageClientAccessToken('PLATFORM_ADMIN')).toBe(
      false
    )
  })

  it('keeps Passkey and two-factor configuration hidden from every Canvas principal', () => {
    expect(canCanvasPrincipalManageAdvancedAuthentication('CUSTOMER')).toBe(
      false
    )
    expect(
      canCanvasPrincipalManageAdvancedAuthentication('PLATFORM_ADMIN')
    ).toBe(false)
  })

  it('uses the approved localized PixMiao product name without changing upstream attribution', () => {
    expect(getCanvasProductName('zh-CN')).toBe('像素喵片场')
    expect(getCanvasProductName('zh-TW')).toBe('像素喵片場')
    expect(getCanvasProductName('en')).toBe('PixMiao Studio')
    expect(getCanvasProductName('ja')).toBe('PixMiao Studio')
    for (const language of ['fr', 'ru', 'vi']) {
      expect(getCanvasProductName(language)).toBe('PixMiao Studio')
    }
    expect(isCanvasProductName('像素喵片场')).toBe(true)
    expect(isCanvasProductName('PixMiao Studio')).toBe(true)
    expect(isCanvasProductName('New API')).toBe(false)
    expect(canvasCompactName).toBe('PixMiao')
    expect(isCanvasBrandContext('像素喵片场', '/sign-in')).toBe(true)
    expect(isCanvasBrandContext('New API', '/canvas-cloud/points')).toBe(true)
    expect(isCanvasBrandContext('New API', '/sign-in')).toBe(true)
    expect(isCanvasBrandContext('', '/sign-in')).toBe(true)
    expect(
      isCanvasBrandContext('New API', '/sign-in', '/canvas-cloud/points')
    ).toBe(true)
    expect(isCanvasBrandContext('Customer Gateway', '/sign-in')).toBe(false)
    const iconBytes = Buffer.from(
      lingCatStudioIcon.split(',')[1] ?? '',
      'base64'
    )
    expect(createHash('sha256').update(iconBytes).digest('hex')).toBe(
      '9887b17590e2805a1dce57a3bbe1387c3fe2ff0e5bb9038d4d8731b37424490b'
    )
  })

  it('denies Wallet and upstream technical routes to every Canvas principal', () => {
    expect(canCanvasPrincipalAccessPath('/canvas-cloud/overview')).toBe(true)
    expect(canCanvasPrincipalAccessPath('/profile')).toBe(true)
    expect(canCanvasPrincipalAccessPath('/wallet')).toBe(false)
    expect(canCanvasPrincipalAccessPath('/dashboard/overview')).toBe(false)
    expect(canCanvasPrincipalAccessPath('/usage-logs/common')).toBe(false)
    expect(canCanvasPrincipalAccessPath('/channels')).toBe(false)
    expect(canCanvasPrincipalAccessPath('/canvas-cloud/refunds')).toBe(false)
    expect(canCanvasPrincipalAccessPath('/canvas-cloud/usage-logs')).toBe(false)
  })
})

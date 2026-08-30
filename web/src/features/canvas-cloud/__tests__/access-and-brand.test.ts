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
  canCanvasPrincipalManageClientAccessToken,
  canCanvasPrincipalAccessPath,
  getCanvasHomeSection,
  isCanvasDefaultLandingPath,
  isCanvasSectionAllowed,
} from '../access'
import { getCanvasProductName } from '../brand'
import { lingCatStudioIcon } from '../lingcat-icon'

describe('Canvas role-scoped information architecture', () => {
  it('keeps customer usage pages separate from administration pages', () => {
    expect(isCanvasSectionAllowed('CUSTOMER', 'overview')).toBe(true)
    expect(isCanvasSectionAllowed('CUSTOMER', 'tasks')).toBe(true)
    expect(isCanvasSectionAllowed('CUSTOMER', 'dashboard')).toBe(false)
    expect(isCanvasSectionAllowed('CUSTOMER', 'usage-logs')).toBe(false)
    expect(isCanvasSectionAllowed('CUSTOMER', 'agent-center')).toBe(false)
    expect(isCanvasSectionAllowed('CUSTOMER', 'agent-center', true)).toBe(true)
    expect(isCanvasSectionAllowed('CUSTOMER', 'agents', true)).toBe(false)
  })

  it('allows platform administrators only the administration sections', () => {
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'dashboard')).toBe(true)
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'usage-logs')).toBe(true)
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'task-logs')).toBe(true)
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'reports')).toBe(false)
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'overview')).toBe(false)
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'recharge')).toBe(false)
  })

  it('keeps Agents on the single read-only inviter center', () => {
    expect(isCanvasSectionAllowed('AGENT', 'agent-center')).toBe(true)
    expect(isCanvasSectionAllowed('AGENT', 'overview')).toBe(false)
    expect(isCanvasSectionAllowed('AGENT', 'pricing')).toBe(false)
    expect(isCanvasSectionAllowed('AGENT', 'agents')).toBe(false)
    expect(getCanvasHomeSection('AGENT')).toBe('agent-center')
    expect(canCanvasPrincipalManageClientAccessToken('AGENT')).toBe(false)
  })

  it('uses role homes only for the generic authenticated landing path', () => {
    expect(isCanvasSectionAllowed('PLATFORM_ADMIN', 'overview')).toBe(false)
    expect(getCanvasHomeSection('PLATFORM_ADMIN')).toBe('dashboard')
    expect(getCanvasHomeSection('CUSTOMER')).toBe('overview')
    expect(isCanvasDefaultLandingPath('/dashboard')).toBe(true)
    expect(isCanvasDefaultLandingPath('/dashboard/overview')).toBe(false)
    expect(isCanvasDefaultLandingPath('/')).toBe(false)
    expect(isCanvasDefaultLandingPath('/wallet')).toBe(false)
  })

  it('keeps the customer client credential available without exposing it to administrators', () => {
    expect(canCanvasPrincipalManageClientAccessToken('CUSTOMER')).toBe(true)
    expect(canCanvasPrincipalManageClientAccessToken('PLATFORM_ADMIN')).toBe(
      false
    )
  })

  it('uses the approved localized LingCat product name without changing upstream attribution', () => {
    expect(getCanvasProductName('zh-CN')).toBe('灵猫工坊')
    expect(getCanvasProductName('zh-TW')).toBe('靈貓工坊')
    expect(getCanvasProductName('en')).toBe('LingCat Studio')
    expect(getCanvasProductName('ja')).toBe('LingCat Studio')
    const iconBytes = Buffer.from(
      lingCatStudioIcon.split(',')[1] ?? '',
      'base64'
    )
    expect(createHash('sha256').update(iconBytes).digest('hex')).toBe(
      '95155f46d794cef0f598e48959765d2bbe55c3d9bbd581c22acb6258ac8d998c'
    )
  })

  it('denies Wallet and upstream technical routes to every Canvas principal', () => {
    expect(canCanvasPrincipalAccessPath('/canvas-cloud/overview')).toBe(true)
    expect(canCanvasPrincipalAccessPath('/profile')).toBe(true)
    expect(canCanvasPrincipalAccessPath('/wallet')).toBe(false)
    expect(canCanvasPrincipalAccessPath('/dashboard/overview')).toBe(false)
    expect(canCanvasPrincipalAccessPath('/usage-logs/common')).toBe(false)
    expect(canCanvasPrincipalAccessPath('/channels')).toBe(false)
  })
})

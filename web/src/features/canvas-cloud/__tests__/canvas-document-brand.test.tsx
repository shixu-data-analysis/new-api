/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CanvasDocumentBrand } from '../CanvasDocumentBrand'
import { lingCatStudioIcon } from '../lingcat-icon'

const state = vi.hoisted(() => ({
  pathname: '/canvas-cloud/points',
  systemName: 'New API',
  language: 'zhCN',
}))
vi.mock('@tanstack/react-router', () => ({
  useLocation: ({
    select,
  }: {
    select: (value: { pathname: string }) => string
  }) => select({ pathname: state.pathname }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: state.language, resolvedLanguage: state.language },
  }),
}))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({ systemName: state.systemName, logo: '/logo.png' }),
}))

describe('Canvas document brand', () => {
  beforeEach(() => {
    state.pathname = '/canvas-cloud/points'
    state.systemName = 'New API'
    state.language = 'zhCN'
    document.head.innerHTML =
      '<title>New API</title><meta name="title" content="New API"><meta name="description" content="Gateway"><link rel="icon" href="/logo.png">'
    window.history.replaceState(null, '', '/')
  })
  afterEach(() => {
    document.head.innerHTML = ''
  })

  it('sets and restores localized title, share metadata, and favicon for Canvas routes', () => {
    const view = render(<CanvasDocumentBrand />)
    expect(document.title).toBe('像素喵片场')
    expect(document.querySelector('meta[name="title"]')).toHaveAttribute(
      'content',
      '像素喵片场'
    )
    expect(document.querySelector('meta[property="og:title"]')).toHaveAttribute(
      'content',
      '像素喵片场'
    )
    expect(document.querySelector('link[rel="icon"]')).toHaveAttribute(
      'href',
      lingCatStudioIcon
    )
    view.unmount()
    expect(document.title).toBe('New API')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      'Gateway'
    )
    expect(document.querySelector('meta[property="og:title"]')).toBeNull()
  })

  it('preserves upstream identity outside Canvas context', () => {
    state.pathname = '/sign-in'
    render(<CanvasDocumentBrand />)
    expect(document.title).toBe('New API')
    expect(document.querySelector('link[rel="icon"]')).toHaveAttribute(
      'href',
      '/logo.png'
    )
  })
})

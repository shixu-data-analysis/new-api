/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SystemBrand } from '../system-brand'

const { canvasSessionState } = vi.hoisted(() => ({
  canvasSessionState: {
    data: null as null | { principalType: 'CUSTOMER' | 'PLATFORM_ADMIN' },
    isSuccess: false,
    isCanvasShell: false,
  },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: (
    props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      to: string
      params?: unknown
    }
  ) => {
    const { to, params: _params, ...anchorProps } = props
    return <a href={to} {...anchorProps} />
  },
}))

vi.mock('@/features/canvas-cloud/use-canvas-session', () => ({
  useCanvasShellSession: () => ({
    canvasSession: canvasSessionState,
    isCanvasShell: canvasSessionState.isCanvasShell,
  }),
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: { system_name: 'Canvas WEB-001' } }),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({ logo: '/logo.png' }),
}))

describe('SystemBrand responsive layout', () => {
  beforeEach(() => {
    canvasSessionState.data = null
    canvasSessionState.isSuccess = false
    canvasSessionState.isCanvasShell = false
  })

  it('keeps the logo accessible while deferring the long name until sm', () => {
    render(<SystemBrand variant='inline' />)

    expect(screen.getByRole('img', { name: 'Logo' })).toBeVisible()
    expect(screen.getByText('Canvas WEB-001')).toHaveClass(
      'hidden',
      'sm:inline'
    )
    expect(screen.getByRole('link', { name: 'Go to home' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Go to home' })).toHaveAttribute(
      'href',
      '/dashboard'
    )
  })

  it('uses the LingCat identity and role dashboard for a Canvas administrator', () => {
    canvasSessionState.data = { principalType: 'PLATFORM_ADMIN' }
    canvasSessionState.isSuccess = true
    canvasSessionState.isCanvasShell = true

    render(<SystemBrand variant='inline' />)

    expect(screen.getByRole('img', { name: 'LingCat Studio' })).toBeVisible()
    expect(screen.getByText('LingCat Studio')).toHaveClass(
      'hidden',
      'sm:inline'
    )
    expect(
      screen.getByRole('link', { name: 'Return to LingCat Studio dashboard' })
    ).toHaveAttribute('href', '/canvas-cloud/$section')
  })

  it('keeps the LingCat identity while Canvas registration is pending', () => {
    canvasSessionState.isCanvasShell = true

    render(<SystemBrand variant='inline' />)

    expect(screen.getByRole('img', { name: 'LingCat Studio' })).toBeVisible()
    expect(screen.getByText('LingCat Studio')).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Return to LingCat Studio dashboard' })
    ).toHaveAttribute('href', '/canvas-cloud/$section')
  })
})

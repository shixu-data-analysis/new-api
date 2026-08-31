/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { lingCatStudioIcon } from '@/features/canvas-cloud/lingcat-icon'

import { AuthLayout } from './auth-layout'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: '灵猫工坊',
    logo: '/upstream-logo.png',
    loading: false,
  }),
}))

describe('Canvas authentication brand', () => {
  it('uses the approved LingCat icon instead of the upstream system logo', () => {
    render(<AuthLayout>content</AuthLayout>)

    expect(screen.getByRole('img', { name: 'Logo' })).toHaveAttribute(
      'src',
      lingCatStudioIcon
    )
    expect(screen.getByText('灵猫工坊')).toBeVisible()
  })
})

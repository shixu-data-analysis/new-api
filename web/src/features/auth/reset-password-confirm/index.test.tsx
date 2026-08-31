/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ResetPasswordConfirm } from '.'

const mocks = vi.hoisted(() => ({
  apiPost: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { productName?: string }) =>
      values?.productName ? `${key}:${values.productName}` : key,
  }),
}))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({ systemName: '灵猫工坊' }),
}))
vi.mock('@/lib/api', () => ({
  api: { post: mocks.apiPost },
}))
vi.mock('../auth-layout', () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

describe('Canvas password-reset completion', () => {
  beforeEach(() => {
    mocks.apiPost.mockReset()
    mocks.navigate.mockReset()
    window.sessionStorage.clear()
  })

  it('submits the password chosen and confirmed by the user', async () => {
    window.sessionStorage.setItem(
      'canvas.desktop.sign-out-state',
      'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789'
    )
    mocks.apiPost.mockResolvedValue({ data: { success: true } })

    render(<ResetPasswordConfirm email='user@example.com' token='token' />)
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'chosen-password' },
    })
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'chosen-password' },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'auth.resetPasswordConfirm.confirm',
      })
    )

    await waitFor(() => {
      expect(
        screen.getByText('auth.resetPasswordConfirm.canvasDesktopNext')
      ).toBeVisible()
    })
    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/user/reset',
      {
        email: 'user@example.com',
        token: 'token',
        password: 'chosen-password',
      },
      { skipBusinessError: true }
    )
    expect(
      screen.queryByDisplayValue('generated-password')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'auth.resetPasswordConfirm.backToLogin',
      })
    ).not.toBeInTheDocument()
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('reveals each reset-password field independently', () => {
    render(<ResetPasswordConfirm email='user@example.com' token='token' />)

    const newPassword = screen.getByLabelText('New password')
    const confirmPassword = screen.getByLabelText('Confirm New Password')
    const revealButtons = screen.getAllByRole('button', {
      name: 'Show password',
    })

    fireEvent.click(revealButtons[0])
    expect(newPassword).toHaveAttribute('type', 'text')
    expect(confirmPassword).toHaveAttribute('type', 'password')

    fireEvent.click(revealButtons[1])
    expect(confirmPassword).toHaveAttribute('type', 'text')
  })

  it('gives a production-browser return instruction without claiming a local button exists', async () => {
    mocks.apiPost.mockResolvedValue({ data: { success: true } })
    render(<ResetPasswordConfirm email='user@example.com' token='token' />)
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'chosen-password' },
    })
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'chosen-password' },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'auth.resetPasswordConfirm.confirm',
      })
    )

    await waitFor(() => {
      expect(
        screen.getByText(
          'auth.resetPasswordConfirm.canvasExternalNext:灵猫工坊'
        )
      ).toBeVisible()
    })
  })

  it('replaces the form with one recovery action when the link was already used or expired', async () => {
    mocks.apiPost.mockResolvedValue({
      data: { success: false, message: 'invalid token' },
    })
    render(<ResetPasswordConfirm email='user@example.com' token='used-token' />)
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'chosen-password' },
    })
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'chosen-password' },
    })
    fireEvent.click(
      screen.getByRole('button', {
        name: 'auth.resetPasswordConfirm.confirm',
      })
    )

    await waitFor(() => {
      expect(
        screen.getByText('auth.resetPasswordConfirm.linkInvalidOrUsed')
      ).toBeVisible()
    })
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'auth.resetPasswordConfirm.requestNewLink',
      })
    )
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/forgot-password',
      replace: true,
    })
  })
})

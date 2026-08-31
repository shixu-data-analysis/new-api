import { zodResolver } from '@hookform/resolvers/zod'
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
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { PasswordInput } from '@/components/password-input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetPasswordFormSchema } from '@/features/auth/constants'
import { isCanvasProductName } from '@/features/canvas-cloud/brand'
import { useSystemConfig } from '@/hooks/use-system-config'
import { api } from '@/lib/api'
import { isCanvasDesktopView } from '@/lib/canvas-desktop-sign-out'

import { AuthLayout } from '../auth-layout'

export type ResetPasswordSearchParams = {
  email?: string
  token?: string
}

type ResetPasswordConfirmProps = ResetPasswordSearchParams

export function ResetPasswordConfirm({
  email,
  token,
}: ResetPasswordConfirmProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { systemName } = useSystemConfig()
  const isCanvasProduct = isCanvasProductName(systemName)
  const embeddedInCanvasDesktop = isCanvasDesktopView()
  const isValidResetLink = Boolean(email && token)
  const [resetComplete, setResetComplete] = useState(false)
  const [resetLinkInvalid, setResetLinkInvalid] = useState(!isValidResetLink)
  const [loading, setLoading] = useState(false)
  const form = useForm<z.infer<typeof resetPasswordFormSchema>>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  async function handleSubmit(data: z.infer<typeof resetPasswordFormSchema>) {
    if (!isValidResetLink || !email || !token) {
      toast.error(t('Invalid reset link, please request a new password reset'))
      return
    }

    setLoading(true)
    try {
      const res = await api.post(
        '/api/user/reset',
        { email, token, password: data.password },
        { skipBusinessError: true } as Record<string, unknown>
      )

      if (res?.data?.success) {
        form.reset()
        setResetComplete(true)
        toast.success(t('auth.resetPasswordConfirm.success'))
      } else {
        setResetLinkInvalid(true)
      }
    } catch {
      // Errors handled by global interceptor
    } finally {
      setLoading(false)
    }
  }

  let description = t('auth.resetPasswordConfirm.description')
  if (resetComplete && !isCanvasProduct) {
    description = t('auth.resetPasswordConfirm.success')
  } else if (resetComplete && embeddedInCanvasDesktop) {
    description = t('auth.resetPasswordConfirm.canvasDesktopNext')
  } else if (resetComplete) {
    description = t('auth.resetPasswordConfirm.canvasExternalNext', {
      productName: systemName,
    })
  }

  return (
    <AuthLayout>
      <div className='w-full space-y-8'>
        <div className='space-y-2'>
          <h2 className='text-center text-2xl font-semibold tracking-tight sm:text-left'>
            {t('Reset password')}
          </h2>
          {!resetLinkInvalid && (
            <p className='text-muted-foreground text-left text-sm sm:text-base'>
              {description}
            </p>
          )}
        </div>

        <div className='space-y-4'>
          {resetLinkInvalid && (
            <Alert variant='destructive'>
              <AlertDescription>
                {t('auth.resetPasswordConfirm.linkInvalidOrUsed')}
              </AlertDescription>
            </Alert>
          )}

          <div className='space-y-2'>
            <Label htmlFor='email'>{t('Email')}</Label>
            <Input
              id='email'
              type='email'
              value={email || ''}
              disabled
              placeholder={t('Waiting for email...')}
            />
          </div>

          {!resetComplete && !resetLinkInvalid && (
            <Form {...form}>
              <form
                className='grid gap-4'
                onSubmit={form.handleSubmit(handleSubmit)}
              >
                <FormField
                  control={form.control}
                  name='password'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('New password')}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          autoComplete='new-password'
                          placeholder={t('Enter password (8-20 characters)')}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='confirmPassword'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Confirm New Password')}</FormLabel>
                      <FormControl>
                        <PasswordInput
                          autoComplete='new-password'
                          placeholder={t('Confirm password')}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type='submit'
                  className='w-full'
                  disabled={loading || !isValidResetLink}
                >
                  {t('auth.resetPasswordConfirm.confirm')}
                </Button>
              </form>
            </Form>
          )}

          {resetLinkInvalid && (
            <Button
              className='w-full'
              onClick={() =>
                navigate({ to: '/forgot-password', replace: true })
              }
            >
              {t('auth.resetPasswordConfirm.requestNewLink')}
            </Button>
          )}

          {!resetComplete && !resetLinkInvalid && (
            <Button
              variant='link'
              className='w-full'
              onClick={() => navigate({ to: '/sign-in', replace: true })}
            >
              {t('Back to login')}
            </Button>
          )}

          {resetComplete && !isCanvasProduct && (
            <Button
              className='w-full'
              onClick={() => navigate({ to: '/sign-in', replace: true })}
            >
              {t('auth.resetPasswordConfirm.backToLogin')}
            </Button>
          )}
        </div>
      </div>
    </AuthLayout>
  )
}

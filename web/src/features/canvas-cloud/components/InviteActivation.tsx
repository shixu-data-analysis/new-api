/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { activateCanvasInvite } from '../api'

export function InviteActivation() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const activation = useMutation({
    mutationFn: () => activateCanvasInvite(code.trim()),
    onSuccess: async () => {
      toast.success(t('Canvas access activated'))
      await queryClient.invalidateQueries({ queryKey: ['canvas-cloud'] })
    },
    onError: () => toast.error(t('Invite code is invalid or unavailable')),
  })

  return (
    <Card className='mx-auto max-w-xl'>
      <CardHeader>
        <CardTitle>{t('Activate Canvas access')}</CardTitle>
        <CardDescription>
          {t(
            'Your New API account is ready. Enter a valid Canvas invite code to create your Canvas customer account.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'
          onSubmit={(event) => {
            event.preventDefault()
            if (code.trim().length >= 8) activation.mutate()
          }}
        >
          <div className='space-y-2'>
            <Label htmlFor='canvas-invite-code'>{t('Invite code')}</Label>
            <Input
              id='canvas-invite-code'
              autoComplete='off'
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder='CANVAS-…'
              aria-describedby='canvas-invite-help'
            />
            <p
              id='canvas-invite-help'
              className='text-muted-foreground text-sm'
            >
              {t(
                'The invite determines your initial pricing group and may include time-limited Bonus points.'
              )}
            </p>
          </div>
          <Button
            type='submit'
            disabled={activation.isPending || code.trim().length < 8}
          >
            {activation.isPending
              ? t('Activating…')
              : t('Activate Canvas access')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

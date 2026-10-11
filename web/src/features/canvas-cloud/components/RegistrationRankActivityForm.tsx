/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { DateTimePicker } from '@/components/datetime-picker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { toIntlLocale } from '@/i18n/languages'

import { createCanvasRegistrationRankActivity } from '../activity-api'
import { activityBaseSchema, positiveBigint } from '../activity-shared'
import type { CanvasRegistrationRankActivity } from '../activity-types'
import { FormInput } from './ActivityShared'

const registrationRankSchema = activityBaseSchema.extend({
  recipientLimit: positiveBigint(),
  endsAt: z
    .date()
    .optional()
    .refine(
      (value) => !value || value.getTime() > Date.now(),
      'Choose a future time'
    ),
})

type RegistrationRankValues = z.infer<typeof registrationRankSchema>

const positiveWholeNumber = /^[1-9]\d{0,18}$/u

// The server rejects a second running activity; its error names the running one unless a concurrent publish won.
function runningActivityConflict(error: unknown): { name?: string } | null {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return null
  }
  const data = (error.response as { data?: { code?: unknown; name?: unknown } })
    ?.data
  if (data?.code !== 'REGISTRATION_RANK_BONUS_RUNNING') return null
  return typeof data.name === 'string' ? { name: data.name } : {}
}

export function RegistrationRankActivityForm(props: {
  onBack: () => void
  onSaved: (activity: CanvasRegistrationRankActivity) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [conflict, setConflict] = useState<{ name?: string } | null>(null)
  const form = useForm<RegistrationRankValues>({
    resolver: zodResolver(registrationRankSchema) as never,
    mode: 'onBlur',
    defaultValues: {
      name: '',
      recipientLimit: '',
      points: '',
      ttlDays: 30,
      reason: '',
      endsAt: undefined,
    },
  })
  const [recipientLimit, points, endsAt] = useWatch({
    control: form.control,
    name: ['recipientLimit', 'points', 'endsAt'],
  })
  const maximumPoints =
    positiveWholeNumber.test(recipientLimit ?? '') &&
    positiveWholeNumber.test(points ?? '')
      ? new Intl.NumberFormat(toIntlLocale(i18n.language)).format(
          BigInt(recipientLimit) * BigInt(points)
        )
      : null
  const endsAtError = form.formState.errors.endsAt?.message
  const save = useMutation({
    mutationFn: (values: RegistrationRankValues) =>
      createCanvasRegistrationRankActivity({
        name: values.name,
        recipientLimit: values.recipientLimit,
        points: values.points,
        ttlDays: values.ttlDays,
        reason: values.reason,
        ...(values.endsAt ? { endsAt: values.endsAt.toISOString() } : {}),
      }),
    onSuccess: (activity) => {
      toast.success(t('Activity created'))
      void queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'activities'],
      })
      props.onSaved(activity)
    },
    onError: (error) => {
      const running = runningActivityConflict(error)
      setConflict(running)
      if (!running) toast.error(t('Unable to create activity'))
    },
  })
  const submit = form.handleSubmit((values) => {
    setConflict(null)
    save.mutate(values)
  })
  let conflictMessage: string | null = null
  if (conflict?.name) {
    conflictMessage = t(
      'A registration rank bonus "{{name}}" is already running. Stop it, or wait until it is filled or expires, then publish.',
      { name: conflict.name }
    )
  } else if (conflict) {
    conflictMessage = t(
      'A registration rank bonus is already running. Stop it, or wait until it is filled or expires, then publish.'
    )
  }
  return (
    <Card className='max-w-3xl'>
      <CardHeader>
        <CardTitle>{t('REGISTRATION_RANK_BONUS')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className='grid gap-4 lg:grid-cols-2' onSubmit={submit}>
          <FormInput
            form={form}
            name='name'
            label={t('Activity name')}
            className='lg:col-span-2'
            maxLength={128}
          />
          <FormInput
            form={form}
            name='recipientLimit'
            label={t('Recipients (people)')}
            inputMode='numeric'
          />
          <FormInput
            form={form}
            name='points'
            label={t('Points per recipient')}
            inputMode='numeric'
          />
          <FormInput
            form={form}
            name='ttlDays'
            label={t('Bonus validity (days)')}
            type='number'
            min={1}
            max={3650}
          />
          <div>
            <Label>{t('End time (optional)')}</Label>
            <DateTimePicker
              value={endsAt}
              onChange={(value) =>
                form.setValue('endsAt', value, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              futureOnly
              placeholder={t('End time')}
            />
            <p className='text-muted-foreground mt-1 text-xs'>
              {t(
                'Ends automatically at this time; without it, the activity ends when filled or stopped'
              )}
            </p>
            {endsAtError ? (
              <p role='alert' className='text-destructive mt-1 text-sm'>
                {t(endsAtError)}
              </p>
            ) : null}
          </div>
          <FormInput
            form={form}
            name='reason'
            label={t('Reason')}
            className='lg:col-span-2'
          />
          <p className='text-muted-foreground text-sm lg:col-span-2'>
            {t(
              'Counting starts at publication and registrations with any invite code take a rank. After the last bonus, registration continues without a bonus. It can stack with the invite registration bonus.'
            )}
          </p>
          {maximumPoints ? (
            <p className='text-sm lg:col-span-2'>
              {t('Up to {{points}} points', { points: maximumPoints })}
            </p>
          ) : null}
          {conflictMessage ? (
            <p
              role='alert'
              className='border-destructive text-destructive rounded-md border p-3 text-sm lg:col-span-2'
            >
              {conflictMessage}
            </p>
          ) : null}
          <div className='flex justify-end gap-2 lg:col-span-2'>
            <Button type='button' variant='outline' onClick={props.onBack}>
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={save.isPending}>
              {t('Confirm publish')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

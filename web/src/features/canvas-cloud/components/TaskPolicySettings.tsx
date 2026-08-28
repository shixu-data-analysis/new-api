/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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

import {
  getCanvasTaskPolicySettings,
  publishConfirmedCanvasTaskPolicySettings,
} from '../api'
import { PricingActionConfirmation } from './PricingActionConfirmation'

function dateTime(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'
}

export function TaskPolicySettings() {
  const { t } = useTranslation()
  const [quoteTtlSeconds, setQuoteTtlSeconds] = useState('')
  const [bonusFailureGraceDays, setBonusFailureGraceDays] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const settings = useQuery({
    queryKey: ['canvas-cloud', 'task-policy-settings'],
    queryFn: getCanvasTaskPolicySettings,
  })

  useEffect(() => {
    if (!settings.data) return
    setQuoteTtlSeconds(String(settings.data.quoteTtlSeconds))
    setBonusFailureGraceDays(String(settings.data.bonusFailureGraceDays))
  }, [settings.data])

  const quoteValue = Number(quoteTtlSeconds)
  const graceValue = Number(bonusFailureGraceDays)
  const quoteValid =
    /^\d+$/.test(quoteTtlSeconds) && quoteValue >= 1 && quoteValue <= 86400
  const graceValid =
    /^\d+$/.test(bonusFailureGraceDays) && graceValue >= 1 && graceValue <= 365
  const changed = Boolean(
    settings.data &&
    (quoteValue !== settings.data.quoteTtlSeconds ||
      graceValue !== settings.data.bonusFailureGraceDays)
  )

  const publish = useMutation({
    mutationFn: () =>
      publishConfirmedCanvasTaskPolicySettings({
        quoteTtlSeconds: quoteValue,
        bonusFailureGraceDays: graceValue,
      }),
    onSuccess: async () => {
      setConfirmationOpen(false)
      toast.success(t('Task policy settings updated'))
      await settings.refetch()
    },
    onError: () => toast.error(t('Task policy settings update failed')),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Task policy settings')}</CardTitle>
        <CardDescription>
          {t(
            'Published settings are versioned. Quote validity applies to new quotes; the Bonus failure grace applies when frozen Bonus is released after crossing its original expiry.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {settings.isPending && (
          <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
        )}
        {settings.isError && (
          <Button variant='outline' onClick={() => void settings.refetch()}>
            {t('Retry')}
          </Button>
        )}
        {settings.data && (
          <form
            aria-label={t('Adjust task policy settings')}
            className='bg-muted/20 max-w-5xl space-y-4 rounded-xl border p-4'
            onSubmit={(event) => {
              event.preventDefault()
              setSubmitted(true)
              if (!quoteValid || !graceValid || !changed) return
              setConfirmationOpen(true)
            }}
          >
            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-1'>
                <Label htmlFor='quote-ttl-seconds'>{t('Quote validity')}</Label>
                <Input
                  id='quote-ttl-seconds'
                  inputMode='numeric'
                  value={quoteTtlSeconds}
                  onChange={(event) => setQuoteTtlSeconds(event.target.value)}
                  aria-invalid={submitted && !quoteValid}
                  aria-describedby='quote-ttl-help quote-ttl-explanation'
                />
                <div
                  id='quote-ttl-help'
                  className='text-muted-foreground text-xs'
                >
                  {t(
                    'Whole seconds from 1 to 86400. Default: 300 seconds (5 minutes).'
                  )}
                </div>
                <div
                  id='quote-ttl-explanation'
                  className='bg-muted/40 rounded-md border p-3 text-sm'
                >
                  {t(
                    'This is how long a customer can submit a task using a quoted price. After it expires, the system creates a new quote using the current price; the old quote is not extended.'
                  )}
                </div>
                {submitted && !quoteValid && (
                  <div className='text-destructive text-xs' role='alert'>
                    {t('Enter a whole number from 1 to 86400')}
                  </div>
                )}
                <div className='text-muted-foreground text-xs'>
                  {t('Published version')}:{' '}
                  {settings.data.quoteTtlVersion ?? t('Default')} ·{' '}
                  {dateTime(settings.data.quoteTtlEffectiveAt)}
                </div>
              </div>
              <div className='space-y-1'>
                <Label htmlFor='bonus-failure-grace-days'>
                  {t('Bonus failure grace')}
                </Label>
                <Input
                  id='bonus-failure-grace-days'
                  inputMode='numeric'
                  value={bonusFailureGraceDays}
                  onChange={(event) =>
                    setBonusFailureGraceDays(event.target.value)
                  }
                  aria-invalid={submitted && !graceValid}
                  aria-describedby='bonus-failure-grace-help bonus-failure-grace-explanation'
                />
                <div
                  id='bonus-failure-grace-help'
                  className='text-muted-foreground text-xs'
                >
                  {t('Whole days from 1 to 365. Default: 7 days.')}
                </div>
                <div
                  id='bonus-failure-grace-explanation'
                  className='bg-muted/40 rounded-md border p-3 text-sm'
                >
                  {t(
                    'This applies only when Bonus points were frozen before their original expiry and the task fails or times out after that expiry. The released points become grace Bonus for this many days from release. They are returned points, not extra points; successful tasks do not receive them.'
                  )}
                </div>
                {submitted && !graceValid && (
                  <div className='text-destructive text-xs' role='alert'>
                    {t('Enter a whole number from 1 to 365')}
                  </div>
                )}
                <div className='text-muted-foreground text-xs'>
                  {t('Published version')}:{' '}
                  {settings.data.bonusFailureGraceVersion ?? t('Default')} ·{' '}
                  {dateTime(settings.data.bonusFailureGraceEffectiveAt)}
                </div>
              </div>
            </div>
            <div className='flex justify-end border-t pt-4'>
              <Button type='submit' disabled={publish.isPending || !changed}>
                {t('Review settings change')}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
      <PricingActionConfirmation
        open={confirmationOpen}
        onOpenChange={setConfirmationOpen}
        title={t('Confirm task policy change')}
        description={t(
          'Confirmation publishes immutable configuration versions. Historical quotes and completed ledger facts are not recalculated.'
        )}
        details={[
          {
            label: t('Quote validity'),
            value: `${quoteValue} ${t('seconds')}`,
          },
          {
            label: t('Bonus failure grace'),
            value: `${graceValue} ${t('days')}`,
          },
        ]}
        confirmLabel={t('Confirm change')}
        pending={publish.isPending}
        onConfirm={() => publish.mutate()}
      />
    </Card>
  )
}

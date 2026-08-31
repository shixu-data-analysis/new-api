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
  const [paidExpiryDays, setPaidExpiryDays] = useState('')
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
    setPaidExpiryDays(String(settings.data.paidExpiryDays))
  }, [settings.data])

  const quoteValue = Number(quoteTtlSeconds)
  const graceValue = Number(bonusFailureGraceDays)
  const paidExpiryValue = Number(paidExpiryDays)
  const quoteValid =
    /^\d+$/.test(quoteTtlSeconds) && quoteValue >= 1 && quoteValue <= 86400
  const graceValid =
    /^\d+$/.test(bonusFailureGraceDays) && graceValue >= 1 && graceValue <= 365
  const paidExpiryValid =
    /^\d+$/.test(paidExpiryDays) &&
    paidExpiryValue >= 1 &&
    paidExpiryValue <= 3650
  const changed = Boolean(
    settings.data &&
    (quoteValue !== settings.data.quoteTtlSeconds ||
      graceValue !== settings.data.bonusFailureGraceDays ||
      paidExpiryValue !== settings.data.paidExpiryDays)
  )

  const publish = useMutation({
    mutationFn: () =>
      publishConfirmedCanvasTaskPolicySettings({
        quoteTtlSeconds: quoteValue,
        bonusFailureGraceDays: graceValue,
        paidExpiryDays: paidExpiryValue,
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
        <CardTitle>{t('Task and point policy settings')}</CardTitle>
        <CardDescription>
          {t(
            'Published settings are versioned. Paid validity applies only to newly redeemed Paid points; Bonus keeps its own independent validity and failure-grace rules.'
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
              if (!quoteValid || !graceValid || !paidExpiryValid || !changed) {
                return
              }
              setConfirmationOpen(true)
            }}
          >
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]'>
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
                <Label htmlFor='paid-expiry-days'>
                  {t('Paid points validity')}
                </Label>
                <Input
                  id='paid-expiry-days'
                  inputMode='numeric'
                  value={paidExpiryDays}
                  onChange={(event) => setPaidExpiryDays(event.target.value)}
                  aria-invalid={submitted && !paidExpiryValid}
                  aria-describedby='paid-expiry-help paid-expiry-explanation'
                />
                <div
                  id='paid-expiry-help'
                  className='text-muted-foreground text-xs'
                >
                  {t('Whole days from 1 to 3650. Default: 90 days (3 months).')}
                </div>
                <div
                  id='paid-expiry-explanation'
                  className='bg-muted/40 rounded-md border p-3 text-sm'
                >
                  {t(
                    'This applies only to Paid points issued by recharge-code redemption after publication. Existing Paid points without an expiry remain valid, and Bonus points keep their separate validity.'
                  )}
                </div>
                {submitted && !paidExpiryValid && (
                  <div className='text-destructive text-xs' role='alert'>
                    {t('Enter a whole number from 1 to 3650')}
                  </div>
                )}
                <div className='text-muted-foreground text-xs'>
                  {t('Published version')}:{' '}
                  {settings.data.paidExpiryVersion ?? t('Default')} ·{' '}
                  {dateTime(settings.data.paidExpiryEffectiveAt)}
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
              <div className='flex items-start md:col-span-2 xl:col-span-1 xl:pt-6'>
                <Button
                  type='submit'
                  className='w-full xl:w-auto'
                  disabled={publish.isPending || !changed}
                >
                  {t('Review settings change')}
                </Button>
              </div>
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
          {
            label: t('Paid points validity'),
            value: `${paidExpiryValue} ${t('days')}`,
          },
        ]}
        confirmLabel={t('Confirm change')}
        pending={publish.isPending}
        onConfirm={() => publish.mutate()}
      />
    </Card>
  )
}

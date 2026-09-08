/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toIntlLocale } from '@/i18n/languages'

import {
  getCanvasTaskPolicySettings,
  publishConfirmedCanvasTaskPolicySettings,
} from '../api'
import {
  taskPolicySchema,
  type TaskPolicyValues,
} from '../lib/task-policy-schema'
import type { CanvasTaskPolicySettings } from '../types'
import {
  PricingActionConfirmation,
  type ConfirmationDetail,
} from './PricingActionConfirmation'

type PolicySection = 'recharge' | 'release'
type PolicyField = keyof TaskPolicyValues
const fields = {
  quoteTtlSeconds: {
    label: 'Quote validity',
    unit: 'seconds',
    version: 'quoteTtlVersion',
    effectiveAt: 'quoteTtlEffectiveAt',
    explanation:
      'This is how long a customer can submit a task using a quoted price. After it expires, the system creates a new quote using the current price; the old quote is not extended.',
  },
  paidExpiryDays: {
    label: 'Paid points validity',
    unit: 'days',
    version: 'paidExpiryVersion',
    effectiveAt: 'paidExpiryEffectiveAt',
    explanation:
      'This applies only to Paid points issued by recharge-code redemption after publication. Existing Paid points without an expiry remain valid, and Bonus points keep their separate validity.',
  },
  bonusFailureGraceDays: {
    label: 'Bonus failure grace',
    unit: 'days',
    version: 'bonusFailureGraceVersion',
    effectiveAt: 'bonusFailureGraceEffectiveAt',
    explanation:
      'This applies only when Bonus points were frozen before their original expiry and the task fails or times out after that expiry. The released points become grace Bonus for this many days from release. They are returned points, not extra points; successful tasks do not receive them.',
  },
} as const

export function TaskPolicySettings(props: { section: PolicySection }) {
  const { t } = useTranslation()
  const settings = useQuery({
    queryKey: ['canvas-cloud', 'task-policy-settings'],
    queryFn: getCanvasTaskPolicySettings,
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {props.section === 'recharge'
            ? t('Paid points validity')
            : t('Quote and release rules')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {settings.isPending && (
          <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
        )}
        {settings.isError && (
          <Button variant='outline' onClick={() => void settings.refetch()}>
            {t('Retry')}
          </Button>
        )}
        {settings.data && (
          <PolicyForm
            key={props.section}
            section={props.section}
            settings={settings.data}
          />
        )}
      </CardContent>
    </Card>
  )
}

function PolicyForm(props: {
  section: PolicySection
  settings: CanvasTaskPolicySettings
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const names: PolicyField[] =
    props.section === 'recharge'
      ? ['paidExpiryDays']
      : ['quoteTtlSeconds', 'bonusFailureGraceDays']
  const defaults = Object.fromEntries(
    names.map((name) => [name, String(props.settings[name])])
  ) as TaskPolicyValues
  const form = useForm<TaskPolicyValues>({
    resolver: zodResolver(taskPolicySchema),
    defaultValues: defaults,
    mode: 'onTouched',
  })
  const { dirtyFields, isDirty, errors } = form.formState
  const [review, setReview] = useState<{
    patch: Parameters<typeof publishConfirmedCanvasTaskPolicySettings>[0]
    details: ConfirmationDetail[]
  } | null>(null)
  const { reset } = form
  useEffect(() => {
    const next =
      props.section === 'recharge'
        ? { paidExpiryDays: String(props.settings.paidExpiryDays) }
        : {
            quoteTtlSeconds: String(props.settings.quoteTtlSeconds),
            bonusFailureGraceDays: String(props.settings.bonusFailureGraceDays),
          }
    reset(next, {
      keepDirtyValues: true,
      keepDirty: true,
      keepTouched: true,
      keepErrors: true,
    })
  }, [props.settings, props.section, reset])
  const publish = useMutation({
    mutationFn: (
      patch: Parameters<typeof publishConfirmedCanvasTaskPolicySettings>[0]
    ) => publishConfirmedCanvasTaskPolicySettings(patch),
    onSuccess: (result) => {
      setReview(null)
      reset(
        Object.fromEntries(
          names.map((name) => [name, String(result[name])])
        ) as TaskPolicyValues
      )
      queryClient.setQueryData(['canvas-cloud', 'task-policy-settings'], result)
      toast.success(t('Task policy settings updated'))
    },
    onError: () => toast.error(t('Task policy settings update failed')),
  })
  const locale = toIntlLocale(i18n.resolvedLanguage ?? i18n.language)
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const numberFormatter = new Intl.NumberFormat(locale)
  return (
    <>
      <form
        noValidate
        aria-label={
          props.section === 'recharge'
            ? t('Paid points validity')
            : t('Adjust task policy settings')
        }
        onSubmit={form.handleSubmit((values) => {
          const changed = names.filter(
            (name) =>
              dirtyFields[name] && Number(values[name]) !== props.settings[name]
          )
          if (changed.length === 0) return
          setReview({
            patch: Object.fromEntries(
              changed.map((name) => [name, Number(values[name])])
            ),
            details: changed.map((name) => ({
              label: t(fields[name].label),
              value: `${numberFormatter.format(props.settings[name])} → ${numberFormatter.format(Number(values[name]))} ${t(fields[name].unit)}`,
            })),
          })
        })}
        className='bg-muted/20 space-y-4 rounded-xl border p-4'
      >
        <div
          className={
            props.section === 'recharge'
              ? 'grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_auto]'
              : 'grid items-start gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'
          }
        >
          {names.map((name) => {
            const field = fields[name]
            const effectiveAt = props.settings[field.effectiveAt]
            const version = props.settings[field.version]
            return (
              <div key={name} className='min-w-0 space-y-2'>
                <Label
                  htmlFor={name}
                  className={
                    props.section === 'release'
                      ? 'md:min-h-10 xl:min-h-5'
                      : 'min-h-5'
                  }
                >
                  {t(field.label)}
                </Label>
                <div className='flex items-center gap-2'>
                  <Input
                    id={name}
                    inputMode='numeric'
                    className='max-w-52'
                    {...form.register(name)}
                    disabled={publish.isPending}
                    aria-required='true'
                    aria-invalid={Boolean(errors[name])}
                    aria-describedby={`${name}-unit ${name}-explanation${errors[name] ? ` ${name}-error` : ''}`}
                  />
                  <span
                    id={`${name}-unit`}
                    className='text-muted-foreground shrink-0 text-sm'
                  >
                    {t(field.unit)}
                  </span>
                </div>
                {errors[name] && (
                  <p
                    id={`${name}-error`}
                    role='alert'
                    className='text-destructive text-xs'
                  >
                    {t(errors[name].message ?? 'This field is required')}
                  </p>
                )}
                <p
                  id={`${name}-explanation`}
                  className='text-muted-foreground text-sm'
                >
                  {t(field.explanation)}
                </p>
                <div className='text-muted-foreground flex flex-wrap items-center gap-2 text-xs'>
                  <Badge variant='secondary'>
                    {version == null
                      ? t('Default configuration')
                      : `v${version}`}
                  </Badge>
                  {version != null && effectiveAt && (
                    <span>{dateFormatter.format(new Date(effectiveAt))}</span>
                  )}
                </div>
              </div>
            )
          })}
          <Button
            type='submit'
            className={
              props.section === 'recharge'
                ? 'w-full md:mt-7 md:w-auto'
                : 'w-full md:col-span-2 xl:col-span-1 xl:mt-7 xl:w-auto'
            }
            disabled={!isDirty || publish.isPending}
          >
            {t('Review settings change')}
          </Button>
        </div>
      </form>
      <PricingActionConfirmation
        open={review !== null}
        onOpenChange={(open) => {
          if (!open && !publish.isPending) setReview(null)
        }}
        title={t('Confirm task policy change')}
        description={t(
          'Confirmation publishes immutable configuration versions. Historical quotes and completed ledger facts are not recalculated.'
        )}
        details={review?.details ?? []}
        confirmLabel={t('Confirm change')}
        pending={publish.isPending}
        onConfirm={() => {
          if (review) publish.mutate(review.patch)
        }}
      />
    </>
  )
}

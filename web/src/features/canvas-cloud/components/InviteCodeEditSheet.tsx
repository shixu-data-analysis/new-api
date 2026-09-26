/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { DateTimePicker } from '@/components/datetime-picker'
import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
  sideDrawerSectionClassName,
} from '@/components/drawer-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toIntlLocale } from '@/i18n/languages'

import {
  expandCanvasAdminInviteCodeCapacity,
  extendCanvasAdminInviteCode,
  previewCanvasInviteCodeExtension,
} from '../api'
import type { CanvasAdminInviteCode } from '../types'
import { PricingActionConfirmation } from './PricingActionConfirmation'

const MAX_INVITE_CAPACITY = 9_007_199_254_740_991n
const POSITIVE_INTEGER = /^[1-9]\d*$/u

type CapacityExpansionDraft = {
  additionalRegistrations: string
}

function localDateTime(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function parsedLocalDateTime(value: string): Date | undefined {
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : undefined
}

function formatDate(value: string, language: string): string {
  return new Intl.DateTimeFormat(toIntlLocale(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function failureField(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const details = (error as { response?: { data?: { details?: unknown } } })
    .response?.data?.details
  if (!details || typeof details !== 'object') return null
  const field = (details as { field?: unknown }).field
  return typeof field === 'string' ? field : null
}

function failureStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const status = (error as { response?: { status?: unknown } }).response?.status
  return typeof status === 'number' ? status : null
}

function FieldError(props: { id: string; message: string | null }) {
  if (!props.message) return null
  return (
    <p id={props.id} role='alert' className='text-destructive text-sm'>
      {props.message}
    </p>
  )
}

export function InviteCodeEditSheet(props: {
  item: CanvasAdminInviteCode | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDirtyChange?: (dirty: boolean) => void
  onRefreshCapacityConflict: (id: string) => Promise<CanvasAdminInviteCode>
  onCapacityConflictRefreshed: (item: CanvasAdminInviteCode) => void
  onUpdated: (item: CanvasAdminInviteCode) => void | Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const item = props.item
  const onDirtyChange = props.onDirtyChange
  const open = props.open
  const [discardOpen, setDiscardOpen] = useState(false)
  const [extendExpiresAt, setExtendExpiresAt] = useState('')
  const [extendReason, setExtendReason] = useState('')
  const [extendIdempotencyKey, setExtendIdempotencyKey] = useState('')
  const [extendPreview, setExtendPreview] = useState<Awaited<
    ReturnType<typeof previewCanvasInviteCodeExtension>
  > | null>(null)
  const [extendFieldErrors, setExtendFieldErrors] = useState<
    Record<string, string>
  >({})
  const [expandIdempotencyKey, setExpandIdempotencyKey] = useState('')
  const extendPreviewRequestVersion = useRef(0)
  const initializedItemRef = useRef<string | null>(null)
  const capacityConflictRequestVersion = useRef(0)
  const editorGenerationRef = useRef(0)
  const editorIdentityRef = useRef<string | null>(null)
  const capacitySchema = useMemo(
    () =>
      z.object({
        additionalRegistrations: z
          .string()
          .regex(
            POSITIVE_INTEGER,
            t('Enter a positive whole number within the supported range')
          )
          .refine(
            (value) =>
              !POSITIVE_INTEGER.test(value) ||
              (BigInt(value) <= MAX_INVITE_CAPACITY &&
                (!item ||
                  BigInt(item.maxRegistrations) + BigInt(value) <=
                    MAX_INVITE_CAPACITY)),
            t('Enter a positive whole number within the supported range')
          ),
      }),
    [item, t]
  )
  const capacityForm = useForm<CapacityExpansionDraft>({
    mode: 'onTouched',
    resolver: zodResolver(capacitySchema),
    defaultValues: { additionalRegistrations: '' },
  })
  const additionalRegistrations = useWatch({
    control: capacityForm.control,
    name: 'additionalRegistrations',
  })
  const itemId = item?.id
  const itemExpiresAt = item?.expiresAt
  const editorIdentity = open && itemId ? itemId : null
  if (editorIdentityRef.current !== editorIdentity) {
    editorIdentityRef.current = editorIdentity
    editorGenerationRef.current += 1
  }

  useEffect(() => {
    if (!props.open) {
      initializedItemRef.current = null
      return
    }
    if (!itemId || !itemExpiresAt || initializedItemRef.current === itemId) {
      return
    }
    initializedItemRef.current = itemId
    extendPreviewRequestVersion.current += 1
    capacityForm.reset({ additionalRegistrations: '' })
    setExpandIdempotencyKey(`web-invite-expand-${crypto.randomUUID()}`)
    setExtendExpiresAt(localDateTime(new Date(itemExpiresAt)))
    setExtendReason('')
    setExtendIdempotencyKey(`web-invite-extend-${crypto.randomUUID()}`)
    setExtendPreview(null)
    setExtendFieldErrors({})
  }, [capacityForm, itemExpiresAt, itemId, props.open])

  const canExpand = Boolean(item?.allowedActions.includes('EXPAND_CAPACITY'))
  const canExtend = Boolean(item?.allowedActions.includes('EXTEND_EXPIRATION'))
  const extendIsDirty = Boolean(
    item &&
    canExtend &&
    (extendExpiresAt !== localDateTime(new Date(item.expiresAt)) ||
      extendReason !== '')
  )
  const isDirty = capacityForm.formState.isDirty || extendIsDirty
  useEffect(() => {
    onDirtyChange?.(open && isDirty)
  }, [isDirty, onDirtyChange, open])
  let capacityPreview: { total: string; remaining: string } | null = null
  if (
    item &&
    POSITIVE_INTEGER.test(additionalRegistrations) &&
    BigInt(additionalRegistrations) <= MAX_INVITE_CAPACITY
  ) {
    const total =
      BigInt(item.maxRegistrations) + BigInt(additionalRegistrations)
    if (total <= MAX_INVITE_CAPACITY) {
      capacityPreview = {
        total: total.toString(),
        remaining: (
          total -
          BigInt(item.consumedCount) -
          BigInt(item.activeReservedCount)
        ).toString(),
      }
    }
  }
  const capacityError = Boolean(
    capacityForm.formState.errors.additionalRegistrations
  )
  let capacityDescriptionIds: string | undefined
  if (capacityError) {
    capacityDescriptionIds = 'invite-additional-registrations-error'
    if (capacityPreview) {
      capacityDescriptionIds += ' invite-capacity-preview'
    }
  } else if (capacityPreview) {
    capacityDescriptionIds = 'invite-capacity-preview'
  }

  const close = () => {
    extendPreviewRequestVersion.current += 1
    capacityConflictRequestVersion.current += 1
    editorGenerationRef.current += 1
    editorIdentityRef.current = null
    setDiscardOpen(false)
    capacityForm.reset({ additionalRegistrations: '' })
    setExtendExpiresAt('')
    setExtendReason('')
    setExtendPreview(null)
    setExtendFieldErrors({})
    props.onOpenChange(false)
  }

  const requestClose = () => {
    if (isDirty) setDiscardOpen(true)
    else close()
  }

  const previewExtend = async () => {
    if (!item || !extendExpiresAt) return
    const requestVersion = ++extendPreviewRequestVersion.current
    try {
      const result = await previewCanvasInviteCodeExtension({
        id: item.id,
        expectedExpiresAt: item.expiresAt,
        newExpiresAt: new Date(extendExpiresAt).toISOString(),
      })
      if (requestVersion !== extendPreviewRequestVersion.current) return
      setExtendPreview(result)
    } catch (error) {
      if (requestVersion !== extendPreviewRequestVersion.current) return
      const field = failureField(error)
      if (field === 'newExpiresAt' || field === 'expectedExpiresAt') {
        setExtendFieldErrors({
          newExpiresAt: t('Invite expiration preview could not be loaded'),
        })
      }
      toast.error(t('Invite expiration preview could not be loaded'))
    }
  }

  const expand = useMutation({
    mutationFn: (values: CapacityExpansionDraft) => {
      if (!item) throw new Error('Invite code is required')
      return expandCanvasAdminInviteCodeCapacity({
        id: item.id,
        expectedMaxRegistrations: item.maxRegistrations,
        additionalRegistrations: values.additionalRegistrations,
        confirmed: true,
        idempotencyKey: expandIdempotencyKey,
      })
    },
    onSuccess: async (result) => {
      await props.onUpdated(result)
      capacityForm.reset({ additionalRegistrations: '' })
      setExpandIdempotencyKey(`web-invite-expand-${crypto.randomUUID()}`)
      toast.success(t('Invite capacity expanded'))
    },
    onError: async (error) => {
      const field = failureField(error)
      if (
        failureStatus(error) === 409 &&
        field === 'expectedMaxRegistrations'
      ) {
        setExpandIdempotencyKey(`web-invite-expand-${crypto.randomUUID()}`)
        const conflictItemId = item?.id
        const conflictGeneration = editorGenerationRef.current
        const requestVersion = ++capacityConflictRequestVersion.current
        const isCurrentConflict = () =>
          requestVersion === capacityConflictRequestVersion.current &&
          conflictGeneration === editorGenerationRef.current &&
          editorIdentityRef.current === conflictItemId
        try {
          if (!conflictItemId) throw new Error('Invite code is required')
          const refreshedItem =
            await props.onRefreshCapacityConflict(conflictItemId)
          if (!isCurrentConflict()) return
          props.onCapacityConflictRefreshed(refreshedItem)
          if (!isCurrentConflict()) return
          capacityForm.setError(
            'additionalRegistrations',
            {
              type: 'server',
              message: t(
                'Invite capacity changed. The latest capacity is shown; review it and submit again.'
              ),
            },
            { shouldFocus: true }
          )
        } catch {
          if (!isCurrentConflict()) return
          capacityForm.setError(
            'additionalRegistrations',
            {
              type: 'server',
              message: t(
                'Invite capacity changed, but the latest capacity could not be loaded. Submit again to retry the refresh.'
              ),
            },
            { shouldFocus: true }
          )
        }
        return
      }
      const message = t('Invite capacity could not be expanded')
      capacityForm.setError(
        'additionalRegistrations',
        { type: 'server', message },
        { shouldFocus: true }
      )
    },
  })

  const extend = useMutation({
    mutationFn: (input: {
      id: string
      expectedExpiresAt: string
      newExpiresAt: string
      reason: string
    }) =>
      extendCanvasAdminInviteCode({
        ...input,
        confirmed: true,
        idempotencyKey: extendIdempotencyKey,
      }),
    onSuccess: async (result) => {
      await props.onUpdated(result)
      setExtendReason('')
      setExtendPreview(null)
      setExtendFieldErrors({})
      setExtendIdempotencyKey(`web-invite-extend-${crypto.randomUUID()}`)
      toast.success(t('Invite expiration extended'))
    },
    onError: (error) => {
      const field = failureField(error)
      if (field) {
        setExtendFieldErrors({
          [field]: t('Invite expiration could not be extended'),
        })
      }
      toast.error(t('Invite expiration could not be extended'))
    },
  })

  return (
    <>
      <Sheet
        open={props.open}
        onOpenChange={(open) => {
          if (open) props.onOpenChange(true)
          else requestClose()
        }}
      >
        <SheetContent
          className={sideDrawerContentClassName('sm:max-w-xl')}
          showCloseButton={false}
        >
          <SheetHeader className={sideDrawerHeaderClassName('relative')}>
            <SheetTitle>{t('Edit invite code')}</SheetTitle>
            <SheetDescription>
              {t('Capacity and expiration are submitted separately.')}
            </SheetDescription>
            <SheetClose
              render={
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  className='absolute top-3 right-3'
                  aria-label={t('Close')}
                />
              }
            >
              <X aria-hidden='true' />
            </SheetClose>
          </SheetHeader>
          {item ? (
            <div
              className={sideDrawerFormClassName()}
              data-testid='invite-edit-scroll-region'
            >
              <section
                className={sideDrawerSectionClassName()}
                aria-label={t('Current invite summary')}
              >
                <dl className='grid gap-3 text-sm'>
                  <div>
                    <dt className='font-medium'>{t('Invite code')}</dt>
                    <dd>{item.maskedCode}</dd>
                  </div>
                  <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                    <div>
                      <dt className='text-muted-foreground'>
                        {t('Current capacity')}
                      </dt>
                      <dd className='tabular-nums'>{item.maxRegistrations}</dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground'>{t('Used')}</dt>
                      <dd className='tabular-nums'>{item.consumedCount}</dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground'>{t('Reserved')}</dt>
                      <dd className='tabular-nums'>
                        {item.activeReservedCount}
                      </dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground'>
                        {t('Current remaining')}
                      </dt>
                      <dd className='tabular-nums'>{item.remainingCount}</dd>
                    </div>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>{t('Expires at')}</dt>
                    <dd>
                      {formatDate(
                        item.expiresAt,
                        i18n.resolvedLanguage ?? i18n.language
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              {canExpand ? (
                <form
                  className={sideDrawerSectionClassName()}
                  aria-labelledby='invite-capacity-section-title'
                  onSubmit={capacityForm.handleSubmit((values) =>
                    expand.mutate(values)
                  )}
                >
                  <h3
                    id='invite-capacity-section-title'
                    className='text-sm font-semibold'
                  >
                    {t('Increase capacity')}
                  </h3>
                  <div className='space-y-2'>
                    <Label htmlFor='invite-additional-registrations'>
                      {t('Additional registrations')}{' '}
                      <span aria-hidden='true'>*</span>
                    </Label>
                    <Input
                      id='invite-additional-registrations'
                      type='text'
                      inputMode='numeric'
                      autoComplete='off'
                      placeholder={t('Enter a positive whole number')}
                      aria-invalid={capacityError}
                      aria-describedby={capacityDescriptionIds}
                      {...capacityForm.register('additionalRegistrations')}
                    />
                    <FieldError
                      id='invite-additional-registrations-error'
                      message={
                        capacityForm.formState.errors.additionalRegistrations
                          ?.message ?? null
                      }
                    />
                    {capacityPreview ? (
                      <p
                        id='invite-capacity-preview'
                        role='status'
                        aria-live='polite'
                        className='text-muted-foreground text-sm'
                      >
                        {t(
                          'After expansion: total capacity {{total}}, remaining {{remaining}}',
                          capacityPreview
                        )}
                      </p>
                    ) : null}
                    {item.status === 'PAUSED' ||
                    item.unavailableReasons.includes('PAUSED') ? (
                      <p className='text-xs text-amber-700 dark:text-amber-400'>
                        {t(
                          'This invite is paused and will remain paused after expansion.'
                        )}
                      </p>
                    ) : null}
                    {item.unavailableReasons.includes('EXPIRED') ? (
                      <p className='text-xs text-amber-700 dark:text-amber-400'>
                        {t(
                          'This invite is expired and will remain expired after expansion.'
                        )}
                      </p>
                    ) : null}
                  </div>
                  <div className='flex justify-end'>
                    <Button type='submit' disabled={expand.isPending}>
                      {t('Confirm capacity expansion')}
                    </Button>
                  </div>
                </form>
              ) : null}

              {canExtend ? (
                <form
                  className={sideDrawerSectionClassName()}
                  aria-labelledby='invite-expiration-section-title'
                  onSubmit={(event) => {
                    event.preventDefault()
                    const nextExpiry = new Date(extendExpiresAt)
                    if (
                      !Number.isFinite(nextExpiry.getTime()) ||
                      nextExpiry <= new Date(item.expiresAt) ||
                      nextExpiry <= new Date()
                    ) {
                      setExtendFieldErrors({
                        newExpiresAt: t('Expiry must be in the future'),
                      })
                      return
                    }
                    if (!extendPreview) {
                      void previewExtend()
                      return
                    }
                    extend.mutate({
                      id: item.id,
                      expectedExpiresAt: item.expiresAt,
                      newExpiresAt: new Date(extendExpiresAt).toISOString(),
                      reason: extendReason.trim(),
                    })
                  }}
                >
                  <h3
                    id='invite-expiration-section-title'
                    className='text-sm font-semibold'
                  >
                    {t('Extend expiration')}
                  </h3>
                  <div className='space-y-2'>
                    <Label id='invite-extend-at-label'>
                      {t('New expiration time')} *
                    </Label>
                    <div
                      role='group'
                      aria-labelledby='invite-extend-at-label'
                      aria-invalid={Boolean(
                        extendFieldErrors.expectedExpiresAt ||
                        extendFieldErrors.newExpiresAt
                      )}
                      aria-describedby={
                        extendFieldErrors.expectedExpiresAt ||
                        extendFieldErrors.newExpiresAt
                          ? 'invite-extend-at-error'
                          : undefined
                      }
                    >
                      <DateTimePicker
                        value={parsedLocalDateTime(extendExpiresAt)}
                        onChange={(value) => {
                          extendPreviewRequestVersion.current += 1
                          setExtendExpiresAt(value ? localDateTime(value) : '')
                          setExtendPreview(null)
                          setExtendFieldErrors({})
                        }}
                        placeholder={t('New expiration time')}
                        className='grid w-full min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_5rem_auto] [&_input[type=time]]:w-full'
                        futureOnly
                      />
                    </div>
                    <FieldError
                      id='invite-extend-at-error'
                      message={
                        extendFieldErrors.expectedExpiresAt ??
                        extendFieldErrors.newExpiresAt ??
                        null
                      }
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='invite-extend-reason'>
                      {t('Extension reason')} ({t('Optional')})
                    </Label>
                    <Input
                      id='invite-extend-reason'
                      maxLength={2000}
                      aria-invalid={Boolean(extendFieldErrors.reason)}
                      aria-describedby={
                        extendFieldErrors.reason
                          ? 'invite-extend-reason-error'
                          : undefined
                      }
                      value={extendReason}
                      onChange={(event) => {
                        extendPreviewRequestVersion.current += 1
                        setExtendReason(event.target.value)
                        setExtendPreview(null)
                        setExtendFieldErrors({})
                      }}
                    />
                    <FieldError
                      id='invite-extend-reason-error'
                      message={extendFieldErrors.reason ?? null}
                    />
                  </div>
                  {extendPreview ? (
                    <p role='status' className='text-sm'>
                      {t('After extension')}:{' '}
                      {extendPreview.redeemable
                        ? t('Invite status REDEEMABLE')
                        : extendPreview.unavailableReasons
                            .map((reason) => t(`Invite status ${reason}`))
                            .join(' · ')}
                    </p>
                  ) : null}
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'This will not change the management status, capacity, price group, inviter, or invite bonus.'
                    )}
                  </p>
                  <div className='flex justify-end'>
                    <Button
                      type='submit'
                      disabled={extend.isPending || !extendExpiresAt}
                    >
                      {extendPreview
                        ? t('Confirm extension')
                        : t('Preview extension')}
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}
          <SheetFooter className={sideDrawerFooterClassName('grid-cols-1')}>
            <SheetClose render={<Button type='button' variant='outline' />}>
              {t('Close')}
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <PricingActionConfirmation
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t('Discard this draft?')}
        description={t(
          'Leaving will discard the unpublished invite-code draft.'
        )}
        details={[]}
        confirmLabel={t('Discard draft')}
        destructive
        pending={false}
        onConfirm={close}
      />
    </>
  )
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, Pause, Play, ShieldX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import {
  changeCanvasAdminInviteCodeStatus,
  createCanvasAdminInviteCode,
  getCanvasAdminInviteCodes,
  getCanvasInviteCodeOptions,
} from '../api'
import type { CanvasAdminInviteCode } from '../types'
import {
  PricingActionConfirmation,
  type ConfirmationDetail,
} from './PricingActionConfirmation'

type PendingAction =
  | { kind: 'create' }
  | {
      kind: 'status'
      item: CanvasAdminInviteCode
      action: 'pause' | 'resume' | 'revoke'
    }
  | null

function localDateTime(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function inviteStatusVariant(
  status: CanvasAdminInviteCode['effectiveStatus']
): 'secondary' | 'destructive' | 'outline' | 'warning' {
  if (status === 'ACTIVE') return 'secondary'
  if (status === 'REVOKED') return 'destructive'
  if (status === 'EXPIRED') return 'outline'
  return 'warning'
}

function FieldError(props: { id: string; message: string | null }) {
  if (!props.message) return null
  return (
    <p id={props.id} role='alert' className='text-destructive text-sm'>
      {props.message}
    </p>
  )
}

export function InviteCodeManagement() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const initialDates = useMemo(() => {
    const start = new Date()
    const end = new Date(start.getTime() + 30 * 86_400_000)
    return { validFrom: localDateTime(start), expiresAt: localDateTime(end) }
  }, [])
  const [form, setForm] = useState({
    maxRegistrations: '1',
    ...initialDates,
    priceGroupId: '',
    initialBonusPoints: '',
    initialBonusTtlDays: '',
  })
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [issuedCode, setIssuedCode] = useState<string | null>(null)
  const codes = useQuery({
    queryKey: ['canvas-cloud', 'admin-invite-codes'],
    queryFn: getCanvasAdminInviteCodes,
  })
  const options = useQuery({
    queryKey: ['canvas-cloud', 'invite-code-options'],
    queryFn: getCanvasInviteCodeOptions,
  })
  const selectedPriceGroupId =
    form.priceGroupId || options.data?.priceGroups[0]?.id || ''
  const selectedPriceGroup = options.data?.priceGroups.find(
    (item) => item.id === selectedPriceGroupId
  )
  const create = useMutation({
    mutationFn: () =>
      createCanvasAdminInviteCode({
        maxRegistrations: form.maxRegistrations,
        validFrom: new Date(form.validFrom).toISOString(),
        expiresAt: new Date(form.expiresAt).toISOString(),
        priceGroupId: selectedPriceGroupId,
        initialBonusPoints: form.initialBonusPoints || null,
        initialBonusTtlDays: form.initialBonusTtlDays
          ? Number(form.initialBonusTtlDays)
          : null,
        promotionVersionId: null,
        referralSource: null,
      }),
    onSuccess: async (result) => {
      setIssuedCode(result.code)
      setPendingAction(null)
      toast.success(t('Invite code created'))
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-invite-codes'],
      })
    },
    onError: () => toast.error(t('Invite code could not be created')),
  })
  const changeStatus = useMutation({
    mutationFn: (input: {
      id: string
      action: 'pause' | 'resume' | 'revoke'
    }) => changeCanvasAdminInviteCodeStatus(input.id, input.action),
    onSuccess: async () => {
      setPendingAction(null)
      toast.success(t('Invite code status updated'))
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-invite-codes'],
      })
    },
    onError: () => toast.error(t('Invite code status could not be updated')),
  })

  const capacityIsInteger = /^[1-9]\d*$/.test(form.maxRegistrations)
  const capacityIsSafe =
    capacityIsInteger &&
    BigInt(form.maxRegistrations) <= BigInt(Number.MAX_SAFE_INTEGER)
  const validFromTime = new Date(form.validFrom).getTime()
  const expiresAtTime = new Date(form.expiresAt).getTime()
  const bonusConfigured =
    form.initialBonusPoints !== '' || form.initialBonusTtlDays !== ''
  const bonusPointsValid = /^[1-9]\d*$/.test(form.initialBonusPoints)
  const bonusTtlValid = /^[1-9]\d*$/.test(form.initialBonusTtlDays)
  const bonusTtlInRange =
    bonusTtlValid && Number(form.initialBonusTtlDays) <= 3650
  let expiryError: string | null = null
  if (!Number.isFinite(expiresAtTime)) {
    expiryError = t('Enter a valid expiry time')
  } else if (Number.isFinite(validFromTime) && expiresAtTime <= validFromTime) {
    expiryError = t('Expiry must be after the start time')
  } else if (expiresAtTime <= Date.now()) {
    expiryError = t('Expiry must be in the future')
  }
  let bonusPointsError: string | null = null
  let bonusTtlError: string | null = null
  if (
    bonusConfigured &&
    (!form.initialBonusPoints || !form.initialBonusTtlDays)
  ) {
    bonusPointsError = t('Enter both promotional points and validity days')
    bonusTtlError = t('Enter both promotional points and validity days')
  } else if (bonusConfigured) {
    if (!bonusPointsValid) {
      bonusPointsError = t('Promotional points must be a positive whole number')
    }
    if (!bonusTtlInRange) {
      bonusTtlError = t('Validity must be a whole number from 1 to 3650 days')
    }
  }
  const errors = {
    capacity: capacityIsSafe
      ? null
      : t('Enter a positive whole number within the supported range'),
    priceGroup: selectedPriceGroupId
      ? null
      : t('Select a published price group'),
    validFrom: Number.isFinite(validFromTime)
      ? null
      : t('Enter a valid start time'),
    expiresAt: expiryError,
    bonusPoints: bonusPointsError,
    bonusTtl: bonusTtlError,
  }
  const valid = Object.values(errors).every((error) => error === null)

  if (codes.isPending || options.isPending) return <LoadingState />
  if (codes.isError || options.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void codes.refetch()
          void options.refetch()
        }}
      />
    )
  }

  const downloadIssuedCode = () => {
    if (!issuedCode) return
    const url = URL.createObjectURL(
      new Blob([`${issuedCode}\n`], { type: 'text/plain;charset=utf-8' })
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `canvas-invite-${new Date().toISOString().slice(0, 10)}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  let confirmationDescription = ''
  let confirmationDetails: ConfirmationDetail[] = []
  let confirmationTitle = t('Create and activate invite code?')
  let confirmationConfirmLabel = t('Confirm')
  let confirmationDestructive = false
  if (pendingAction?.kind === 'create') {
    confirmationDescription = t(
      'This immediately activates a new invite. Its plaintext is shown only once after creation.'
    )
    confirmationDetails = [
      {
        label: t('Registration capacity'),
        value: form.maxRegistrations,
      },
      {
        label: t('Initial price group'),
        value:
          options.data.priceGroups.find(
            (item) => item.id === selectedPriceGroupId
          )?.internalName ?? '—',
      },
      {
        label: t('Expires at'),
        value: formatDate(new Date(form.expiresAt).toISOString()),
      },
    ]
  } else if (pendingAction?.kind === 'status') {
    let targetStatus = 'REVOKED'
    confirmationTitle = t('Revoke this invite code?')
    confirmationConfirmLabel = t('Revoke invite code')
    confirmationDestructive = true
    let descriptionKey =
      'Revoking permanently blocks new activations and cannot be undone. Customers who already activated are not affected.'
    if (pendingAction.action === 'pause') {
      targetStatus = 'PAUSED'
      confirmationTitle = t('Pause this invite code?')
      confirmationConfirmLabel = t('Pause invite code')
      confirmationDestructive = false
      descriptionKey =
        'Pausing blocks new activations until you resume it. Customers who already activated are not affected.'
    } else if (pendingAction.action === 'resume') {
      targetStatus = 'ACTIVE'
      confirmationTitle = t('Resume this invite code?')
      confirmationConfirmLabel = t('Resume invite code')
      confirmationDestructive = false
      descriptionKey =
        'Resuming allows new activations again until the invite expires or reaches its registration limit.'
    }
    confirmationDescription = t(descriptionKey)
    confirmationDetails = [
      {
        label: t('Invite code'),
        value: pendingAction.item.maskedCode,
      },
      {
        label: t('Current status'),
        value: t(`Invite status ${pendingAction.item.effectiveStatus}`),
      },
      {
        label: t('New status'),
        value: t(`Invite status ${targetStatus}`),
      },
    ]
  }

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Create invite code')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className='space-y-5'
            onSubmit={(event) => {
              event.preventDefault()
              if (valid) setPendingAction({ kind: 'create' })
            }}
          >
            <div className='grid gap-4 md:grid-cols-[minmax(180px,1fr)_minmax(0,3fr)]'>
              <div className='space-y-2'>
                <Label htmlFor='invite-capacity'>
                  {t('Registration capacity')}
                </Label>
                <Input
                  id='invite-capacity'
                  inputMode='numeric'
                  aria-invalid={Boolean(errors.capacity)}
                  aria-describedby={
                    errors.capacity
                      ? 'invite-capacity-help invite-capacity-error'
                      : 'invite-capacity-help'
                  }
                  value={form.maxRegistrations}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      maxRegistrations: event.target.value,
                    }))
                  }
                />
                <p
                  id='invite-capacity-help'
                  className='text-muted-foreground text-xs'
                >
                  {t('How many customers can activate this invite code.')}
                </p>
                <FieldError
                  id='invite-capacity-error'
                  message={errors.capacity}
                />
              </div>
              <div className='min-w-0 space-y-2'>
                <Label htmlFor='invite-price-group'>
                  {t('Initial price group')}
                </Label>
                <select
                  id='invite-price-group'
                  className='border-input bg-background h-9 w-full min-w-0 rounded-md border px-3 text-sm'
                  aria-invalid={Boolean(errors.priceGroup)}
                  aria-describedby={
                    errors.priceGroup ? 'invite-price-group-error' : undefined
                  }
                  title={
                    selectedPriceGroup
                      ? `${selectedPriceGroup.internalName} · ${selectedPriceGroup.code}`
                      : undefined
                  }
                  value={selectedPriceGroupId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priceGroupId: event.target.value,
                    }))
                  }
                >
                  {options.data.priceGroups.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.internalName} · {item.code}
                    </option>
                  ))}
                </select>
                <FieldError
                  id='invite-price-group-error'
                  message={errors.priceGroup}
                />
              </div>
            </div>
            <div className='grid gap-4 xl:grid-cols-2'>
              <fieldset className='space-y-3 rounded-xl border p-4'>
                <legend className='px-1 text-sm font-semibold'>
                  {t('Invite validity')}
                </legend>
                <div className='grid gap-4 md:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label htmlFor='invite-valid-from'>{t('Valid from')}</Label>
                    <Input
                      id='invite-valid-from'
                      type='datetime-local'
                      aria-invalid={Boolean(errors.validFrom)}
                      aria-describedby={
                        errors.validFrom
                          ? 'invite-timezone-help invite-valid-from-error'
                          : 'invite-timezone-help'
                      }
                      value={form.validFrom}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          validFrom: event.target.value,
                        }))
                      }
                    />
                    <FieldError
                      id='invite-valid-from-error'
                      message={errors.validFrom}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='invite-expires-at'>{t('Expires at')}</Label>
                    <Input
                      id='invite-expires-at'
                      type='datetime-local'
                      aria-invalid={Boolean(errors.expiresAt)}
                      aria-describedby={
                        errors.expiresAt
                          ? 'invite-timezone-help invite-expires-at-error'
                          : 'invite-timezone-help'
                      }
                      value={form.expiresAt}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          expiresAt: event.target.value,
                        }))
                      }
                    />
                    <FieldError
                      id='invite-expires-at-error'
                      message={errors.expiresAt}
                    />
                  </div>
                </div>
                <p
                  id='invite-timezone-help'
                  className='text-muted-foreground text-xs'
                >
                  {t('Uses your current time zone')}:{' '}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
              </fieldset>

              <fieldset className='space-y-3 rounded-xl border p-4'>
                <legend className='px-1 text-sm font-semibold'>
                  {t('Initial Bonus')}
                </legend>
                <div className='grid gap-4 md:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label htmlFor='invite-bonus-points'>
                      {t('Initial Bonus points')}
                    </Label>
                    <Input
                      id='invite-bonus-points'
                      inputMode='numeric'
                      aria-invalid={Boolean(errors.bonusPoints)}
                      aria-describedby={
                        errors.bonusPoints
                          ? 'invite-bonus-help invite-bonus-points-error'
                          : 'invite-bonus-help'
                      }
                      value={form.initialBonusPoints}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          initialBonusPoints: event.target.value,
                        }))
                      }
                      placeholder={t('Optional')}
                    />
                    <FieldError
                      id='invite-bonus-points-error'
                      message={errors.bonusPoints}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor='invite-bonus-ttl'>
                      {t('Bonus validity days')}
                    </Label>
                    <Input
                      id='invite-bonus-ttl'
                      inputMode='numeric'
                      aria-invalid={Boolean(errors.bonusTtl)}
                      aria-describedby={
                        errors.bonusTtl
                          ? 'invite-bonus-help invite-bonus-ttl-error'
                          : 'invite-bonus-help'
                      }
                      value={form.initialBonusTtlDays}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          initialBonusTtlDays: event.target.value,
                        }))
                      }
                      placeholder={t('Optional')}
                    />
                    <FieldError
                      id='invite-bonus-ttl-error'
                      message={errors.bonusTtl}
                    />
                  </div>
                </div>
                <p
                  id='invite-bonus-help'
                  className='text-muted-foreground text-xs'
                >
                  {t(
                    'Set promotional points and validity days together, or leave both empty.'
                  )}
                </p>
              </fieldset>
            </div>
            <div>
              <p className='text-muted-foreground mb-3 text-sm'>
                {t(
                  'Initial Bonus points are promotional points, not cash. Their validity is fixed when the customer activates the invite.'
                )}
              </p>
              <Button type='submit' disabled={!valid || create.isPending}>
                {t('Review and create invite')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {issuedCode && (
        <Card className='border-amber-500/50'>
          <CardHeader>
            <CardTitle>{t('Save this invite code now')}</CardTitle>
            <CardDescription>
              {t(
                'For security, the full code is shown only once and cannot be recovered later.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-wrap items-center gap-2'>
            <code className='bg-muted max-w-full overflow-x-auto rounded px-3 py-2 text-sm'>
              {issuedCode}
            </code>
            <Button
              variant='outline'
              onClick={() => {
                void navigator.clipboard.writeText(issuedCode)
                toast.success(t('Invite code copied'))
              }}
            >
              <Copy /> {t('Copy')}
            </Button>
            <Button variant='outline' onClick={downloadIssuedCode}>
              <Download /> {t('Download')}
            </Button>
            <Button variant='ghost' onClick={() => setIssuedCode(null)}>
              {t('I have saved it')}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('Invite codes')}</CardTitle>
        </CardHeader>
        <CardContent>
          {codes.data.length === 0 ? (
            <EmptyState title={t('No invite codes')} bordered />
          ) : (
            <div className='overflow-x-auto rounded-xl border'>
              <table className='w-full min-w-[860px] text-left text-sm'>
                <thead className='bg-muted/60 text-muted-foreground'>
                  <tr>
                    {[
                      'Invite code',
                      'Status',
                      'Price group',
                      'Used / capacity',
                      'Initial Bonus',
                      'Validity',
                      'Actions',
                    ].map((label) => (
                      <th key={label} className='px-3 py-2 font-medium'>
                        {t(label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className='divide-y'>
                  {codes.data.map((item) => (
                    <tr key={item.id}>
                      <td className='px-3 py-2 font-mono'>{item.maskedCode}</td>
                      <td className='px-3 py-2'>
                        <Badge
                          variant={inviteStatusVariant(item.effectiveStatus)}
                        >
                          {t(`Invite status ${item.effectiveStatus}`)}
                        </Badge>
                      </td>
                      <td className='px-3 py-2'>{item.priceGroupName}</td>
                      <td className='px-3 py-2 tabular-nums'>
                        {item.consumedCount} / {item.maxRegistrations}
                        {Number(item.reservedCount) > 0 && (
                          <span className='text-muted-foreground block'>
                            {t('Reserved')}: {item.reservedCount}
                          </span>
                        )}
                      </td>
                      <td className='px-3 py-2'>
                        {item.initialBonusPoints
                          ? `${item.initialBonusPoints} · ${item.initialBonusTtlDays} ${t('days')}`
                          : '—'}
                      </td>
                      <td className='px-3 py-2'>
                        {formatDate(item.validFrom)}
                        <span className='text-muted-foreground block'>
                          {formatDate(item.expiresAt)}
                        </span>
                      </td>
                      <td className='px-3 py-2'>
                        <TooltipProvider delay={200}>
                          <div className='flex flex-wrap gap-2'>
                            {item.effectiveStatus === 'ACTIVE' && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      size='sm'
                                      variant='outline'
                                      className='cursor-pointer gap-1.5'
                                      aria-label={t('Pause invite code')}
                                      onClick={() =>
                                        setPendingAction({
                                          kind: 'status',
                                          item,
                                          action: 'pause',
                                        })
                                      }
                                    />
                                  }
                                >
                                  <Pause className='size-4' />
                                  {t('Pause invite code')}
                                </TooltipTrigger>
                                <TooltipContent className='max-w-72 leading-relaxed'>
                                  {t(
                                    'Pausing blocks new activations until you resume it. Customers who already activated are not affected.'
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {item.effectiveStatus === 'PAUSED' && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      size='sm'
                                      variant='outline'
                                      className='cursor-pointer gap-1.5'
                                      aria-label={t('Resume invite code')}
                                      onClick={() =>
                                        setPendingAction({
                                          kind: 'status',
                                          item,
                                          action: 'resume',
                                        })
                                      }
                                    />
                                  }
                                >
                                  <Play className='size-4' />
                                  {t('Resume invite code')}
                                </TooltipTrigger>
                                <TooltipContent className='max-w-72 leading-relaxed'>
                                  {t(
                                    'Resuming allows new activations again until the invite expires or reaches its registration limit.'
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {['ACTIVE', 'PAUSED'].includes(
                              item.effectiveStatus
                            ) && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      size='sm'
                                      variant='outline'
                                      className='text-destructive hover:text-destructive cursor-pointer gap-1.5'
                                      aria-label={t('Revoke invite code')}
                                      onClick={() =>
                                        setPendingAction({
                                          kind: 'status',
                                          item,
                                          action: 'revoke',
                                        })
                                      }
                                    />
                                  }
                                >
                                  <ShieldX className='size-4' />
                                  {t('Revoke invite code')}
                                </TooltipTrigger>
                                <TooltipContent className='max-w-72 leading-relaxed'>
                                  {t(
                                    'Revoking permanently blocks new activations and cannot be undone. Customers who already activated are not affected.'
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TooltipProvider>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PricingActionConfirmation
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={confirmationTitle}
        description={confirmationDescription}
        details={confirmationDetails}
        confirmLabel={confirmationConfirmLabel}
        destructive={confirmationDestructive}
        pending={create.isPending || changeStatus.isPending}
        onConfirm={() => {
          if (pendingAction?.kind === 'create') create.mutate()
          if (pendingAction?.kind === 'status') {
            changeStatus.mutate({
              id: pendingAction.item.id,
              action: pendingAction.action,
            })
          }
        }}
      />
    </div>
  )
}

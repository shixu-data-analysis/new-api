/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, Download, Pause, Play, ShieldX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableRowActionMenu } from '@/components/data-table/core/row-action-menu'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks'

import {
  changeCanvasAdminInviteCodeStatus,
  createCanvasAdminInviteCode,
  getCanvasAdminInviteCodes,
  getCanvasInviteCodeOptions,
  revealCanvasCode,
} from '../api'
import type { CanvasAdminInviteCode, CanvasInviteCodeStatus } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasCodeRevealButton } from './CanvasCodeRevealButton'
import { CanvasColumnFilterField } from './CanvasColumnFilterPanel'
import { CanvasServerTable } from './CanvasServerTable'
import { CanvasStatusBadge } from './CanvasStatusBadge'
import { CopyableText } from './CopyableText'
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
    referralPrincipalId: '',
  })
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [issuedCode, setIssuedCode] = useState<string | null>(null)
  const [revealedCodes, setRevealedCodes] = useState<Record<string, string>>({})
  const tableState = useServerTableState('createdAt')
  const setPagination = tableState.setPagination
  const [status, setStatus] = useState('')
  const [priceGroup, setPriceGroup] = useState('')
  const [inviter, setInviter] = useState('')
  const debouncedPriceGroup = useDebounce(priceGroup.trim(), 300)
  const debouncedInviter = useDebounce(inviter.trim(), 300)
  useEffect(() => {
    setPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [debouncedInviter, debouncedPriceGroup, setPagination, status])
  const codes = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-invite-codes',
      tableState.query,
      status,
      debouncedPriceGroup,
      debouncedInviter,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminInviteCodes(
        {
          page: tableState.query.page,
          pageSize: tableState.query.pageSize,
          sortBy: tableState.query.sortBy,
          sortOrder: tableState.query.sortOrder,
          ...(tableState.query.search ? { code: tableState.query.search } : {}),
          ...(debouncedPriceGroup ? { priceGroup: debouncedPriceGroup } : {}),
          ...(debouncedInviter ? { inviter: debouncedInviter } : {}),
          ...(status ? { status: status as CanvasInviteCodeStatus } : {}),
        },
        signal
      ),
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
        referralPrincipalId: form.referralPrincipalId || null,
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
  const reveal = useMutation({
    mutationFn: (input: { id: string; action: 'DISPLAY' | 'COPY' }) =>
      revealCanvasCode('admin-invite', input.id, input.action).then(
        (result) => ({ ...result, ...input })
      ),
    onSuccess: async (result) => {
      if (result.action === 'COPY') {
        await navigator.clipboard.writeText(result.code)
        toast.success(t('Invite code copied'))
        return
      }
      setRevealedCodes((current) => ({ ...current, [result.id]: result.code }))
    },
    onError: () => toast.error(t('Invite code could not be revealed')),
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

  const columns: ColumnDef<CanvasAdminInviteCode, unknown>[] = [
    {
      id: 'code',
      accessorKey: 'maskedCode',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Invite code')} />
      ),
      cell: ({ row }) => {
        const item = row.original
        const revealLabel = t(
          revealedCodes[item.id] ? 'Hide invite code' : 'Show invite code'
        )
        return (
          <div className='flex w-full items-center gap-1'>
            <span className='min-w-0 flex-1 truncate font-mono'>
              {revealedCodes[item.id] ?? item.maskedCode}
            </span>
            <CanvasCodeRevealButton
              label={revealLabel}
              revealed={Boolean(revealedCodes[item.id])}
              disabled={reveal.isPending}
              onClick={() => {
                if (revealedCodes[item.id]) {
                  setRevealedCodes((current) => {
                    const next = { ...current }
                    delete next[item.id]
                    return next
                  })
                  return
                }
                reveal.mutate({ id: item.id, action: 'DISPLAY' })
              }}
            />
          </div>
        )
      },
    },
    {
      id: 'status',
      accessorKey: 'effectiveStatus',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Status')} />
      ),
      cell: ({ row }) => (
        <CanvasStatusBadge
          status={row.original.effectiveStatus}
          label={t(`Invite status ${row.original.effectiveStatus}`)}
        />
      ),
    },
    {
      id: 'priceGroup',
      accessorKey: 'priceGroupName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Price group')} />
      ),
    },
    {
      id: 'inviter',
      accessorFn: (item) => item.agent?.username ?? '',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Inviter username')} />
      ),
      cell: ({ row }) =>
        row.original.agent ? (
          <CopyableText value={row.original.agent.username} />
        ) : (
          '—'
        ),
    },
    {
      id: 'capacity',
      accessorKey: 'maxRegistrations',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Used / capacity')} />
      ),
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {row.original.consumedCount} / {row.original.maxRegistrations}
          {Number(row.original.reservedCount) > 0 ? (
            <span className='text-muted-foreground block'>
              {t('Reserved')}: {row.original.reservedCount}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'initialBonus',
      accessorKey: 'initialBonusPoints',
      enableSorting: false,
      header: t('Initial Bonus'),
      cell: ({ row }) =>
        row.original.initialBonusPoints
          ? `${row.original.initialBonusPoints} · ${row.original.initialBonusTtlDays} ${t('days')}`
          : '—',
    },
    {
      id: 'validFrom',
      accessorKey: 'validFrom',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Validity')} />
      ),
      cell: ({ row }) => (
        <span>
          {formatDate(row.original.validFrom)}
          <span className='text-muted-foreground block'>
            {formatDate(row.original.expiresAt)}
          </span>
        </span>
      ),
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Created At')} />
      ),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: t('Actions'),
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className='flex items-center justify-end gap-1'>
            <DataTableRowActionMenu
              ariaLabel={t('Open menu')}
              modal={false}
              contentClassName='w-52'
            >
              <DropdownMenuItem
                disabled={reveal.isPending}
                onClick={() => reveal.mutate({ id: item.id, action: 'COPY' })}
              >
                {t('Copy invite code')}
                <DropdownMenuShortcut>
                  <Copy className='size-4' />
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              {['ACTIVE', 'PAUSED'].includes(item.effectiveStatus) ? (
                <DropdownMenuSeparator />
              ) : null}
              {item.effectiveStatus === 'ACTIVE' ? (
                <DropdownMenuItem
                  onClick={() =>
                    setPendingAction({ kind: 'status', item, action: 'pause' })
                  }
                >
                  {t('Pause invite code')}
                  <DropdownMenuShortcut>
                    <Pause className='size-4' />
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
              ) : null}
              {item.effectiveStatus === 'PAUSED' ? (
                <DropdownMenuItem
                  onClick={() =>
                    setPendingAction({ kind: 'status', item, action: 'resume' })
                  }
                >
                  {t('Resume invite code')}
                  <DropdownMenuShortcut>
                    <Play className='size-4' />
                  </DropdownMenuShortcut>
                </DropdownMenuItem>
              ) : null}
              {['ACTIVE', 'PAUSED'].includes(item.effectiveStatus) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className='text-destructive focus:text-destructive'
                    onClick={() =>
                      setPendingAction({
                        kind: 'status',
                        item,
                        action: 'revoke',
                      })
                    }
                  >
                    {t('Revoke invite code')}
                    <DropdownMenuShortcut>
                      <ShieldX className='size-4' />
                    </DropdownMenuShortcut>
                  </DropdownMenuItem>
                </>
              ) : null}
            </DataTableRowActionMenu>
          </div>
        )
      },
    },
  ]

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

  let confirmationDescription = ''
  let confirmationDetails: ConfirmationDetail[] = []
  let confirmationTitle = t('Create and activate invite code?')
  let confirmationConfirmLabel = t('Confirm')
  let confirmationDestructive = false
  if (pendingAction?.kind === 'create') {
    confirmationDescription = t(
      'This immediately activates a new invite. Later plaintext access remains masked by default and is audited.'
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
        label: t('Inviter'),
        value:
          options.data.agents.find(
            (item) => item.principalId === form.referralPrincipalId
          )?.username ?? t('None'),
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
            <div className='space-y-2'>
              <Label htmlFor='invite-agent'>{t('Inviter')}</Label>
              <select
                id='invite-agent'
                className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
                value={form.referralPrincipalId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    referralPrincipalId: event.target.value,
                  }))
                }
              >
                <option value=''>{t('No inviter')}</option>
                {options.data.agents.map((agent) => (
                  <option key={agent.principalId} value={agent.principalId}>
                    {agent.username}
                  </option>
                ))}
              </select>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Attribution does not restrict which models the customer can use.'
                )}
              </p>
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
              <p className='text-muted-foreground mb-3 text-xs'>
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
            <CardTitle>{t('Invite code created')}</CardTitle>
            <CardDescription>
              {t(
                'The full code is shown now for delivery. The list masks it by default; showing or copying it later is audited.'
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
          <CanvasServerTable
            data={codes.data.items}
            columns={columns}
            total={codes.data.total}
            state={tableState}
            searchLabel={t('Invite code')}
            loading={codes.isFetching}
            emptyTitle={t('No invite codes')}
            additionalFilters={
              <>
                <CanvasColumnFilterField label={t('Price group')}>
                  <Input
                    value={priceGroup}
                    placeholder={t('Price group')}
                    onChange={(event) => setPriceGroup(event.target.value)}
                  />
                </CanvasColumnFilterField>
                <CanvasColumnFilterField label={t('Inviter username')}>
                  <Input
                    value={inviter}
                    placeholder={t('Inviter username')}
                    onChange={(event) => setInviter(event.target.value)}
                  />
                </CanvasColumnFilterField>
                <CanvasColumnFilterField label={t('Status')}>
                  <Select
                    value={status || 'ALL'}
                    onValueChange={(value) =>
                      setStatus(value === 'ALL' ? '' : (value ?? ''))
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue>
                        {status ? (
                          <CanvasStatusBadge
                            status={status}
                            label={t(`Invite status ${status}`)}
                          />
                        ) : (
                          t('All statuses')
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                      {['DRAFT', 'ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED'].map(
                        (value) => (
                          <SelectItem key={value} value={value}>
                            <CanvasStatusBadge
                              status={value}
                              label={t(`Invite status ${value}`)}
                            />
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </CanvasColumnFilterField>
              </>
            }
            hasActiveFilters={Boolean(priceGroup || inviter || status)}
            onResetFilters={() => {
              setPriceGroup('')
              setInviter('')
              setStatus('')
            }}
            getRowId={(row) => row.id}
          />
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

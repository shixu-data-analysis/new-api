/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, Download, Pause, Play, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useController, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { DateTimePicker } from '@/components/datetime-picker'
import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
  SideDrawerSection,
} from '@/components/drawer-layout'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasBindableBonusActivities } from '../activity-api'
import {
  changeCanvasAdminInviteCodeStatus,
  createCanvasAdminInviteCode,
  exportCanvasAdminInviteCodes,
  getCanvasAdminInviteCodes,
  getCanvasInviteCodeOptions,
  revealCanvasCode,
} from '../api'
import type {
  CanvasAdminInviteCode,
  CanvasInvitationExactFilter,
  CanvasInviteCodeStatus,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasCodeRevealButton } from './CanvasCodeRevealButton'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CanvasStatusBadge } from './CanvasStatusBadge'
import type { InvitationNavigationGuard } from './InvitationManagement'
import {
  PricingActionConfirmation,
  type ConfirmationDetail,
} from './PricingActionConfirmation'

type PendingAction =
  | { kind: 'create' }
  | { kind: 'discard' }
  | {
      kind: 'status'
      item: CanvasAdminInviteCode
      action: 'pause' | 'resume' | 'revoke'
    }
  | null

type InviteDraft = {
  maxRegistrations: string
  validFrom: string
  expiresAt: string
  priceGroupId: string
  referralPrincipalId: string
  promotionVersionId: string
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

function formatTokyoDate(value: string, language: string): string {
  return new Intl.DateTimeFormat(toIntlLocale(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
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

function inviteCodeFailureCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const data = (error as { response?: { data?: unknown } }).response?.data
  if (!data || typeof data !== 'object') return null
  const code = (data as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function inviteCodeFailureField(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const details = (error as { response?: { data?: { details?: unknown } } })
    .response?.data?.details
  if (!details || typeof details !== 'object') return null
  const field = (details as { field?: unknown }).field
  return typeof field === 'string' ? field : null
}

export function InviteCodeManagement(props: {
  inviterPrincipalId?: string
  onViewInviter?: (agent: NonNullable<CanvasAdminInviteCode['agent']>) => void
  onExactFilterChange?: (filter: CanvasInvitationExactFilter | null) => void
  onClearPreciseLocation?: () => void
  onNavigationGuardChange?: (guard: InvitationNavigationGuard) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const onExactFilterChange = props.onExactFilterChange
  const initialDates = useMemo(() => {
    const start = new Date()
    const end = new Date(start.getTime() + 30 * 86_400_000)
    return { validFrom: localDateTime(start), expiresAt: localDateTime(end) }
  }, [])
  const inviteForm = useForm<InviteDraft>({
    mode: 'onTouched',
    resolver: zodResolver(
      z
        .object({
          maxRegistrations: z
            .string()
            .regex(
              /^[1-9]\d*$/,
              t('Enter a positive whole number within the supported range')
            )
            .refine(
              (value) => BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER),
              t('Enter a positive whole number within the supported range')
            ),
          validFrom: z.string().min(1, t('Enter a valid start time')),
          expiresAt: z.string().min(1, t('Enter a valid expiry time')),
          priceGroupId: z.string().min(1, t('Select a published price group')),
          referralPrincipalId: z.string(),
          promotionVersionId: z.string(),
        })
        .superRefine((value, context) => {
          const from = new Date(value.validFrom).getTime()
          const expires = new Date(value.expiresAt).getTime()
          if (!Number.isFinite(from)) {
            context.addIssue({
              code: 'custom',
              path: ['validFrom'],
              message: t('Enter a valid start time'),
            })
          }
          if (!Number.isFinite(expires)) {
            context.addIssue({
              code: 'custom',
              path: ['expiresAt'],
              message: t('Enter a valid expiry time'),
            })
          } else if (Number.isFinite(from) && expires <= from) {
            context.addIssue({
              code: 'custom',
              path: ['expiresAt'],
              message: t('Expiry must be after the start time'),
            })
          } else if (expires <= Date.now()) {
            context.addIssue({
              code: 'custom',
              path: ['expiresAt'],
              message: t('Expiry must be in the future'),
            })
          }
        })
    ),
    defaultValues: {
      maxRegistrations: '1',
      ...initialDates,
      priceGroupId: '',
      referralPrincipalId: '',
      promotionVersionId: '',
    },
  })
  const form = inviteForm.watch()
  const promotionVersionId = useWatch({
    control: inviteForm.control,
    name: 'promotionVersionId',
  })
  const promotionField = useController({
    control: inviteForm.control,
    name: 'promotionVersionId',
  }).field
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
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
  }, [
    debouncedInviter,
    debouncedPriceGroup,
    props.inviterPrincipalId,
    setPagination,
    status,
  ])
  const codes = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin-invite-codes',
      tableState.query,
      status,
      debouncedPriceGroup,
      debouncedInviter,
      props.inviterPrincipalId,
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
          ...(props.inviterPrincipalId
            ? { inviterPrincipalId: props.inviterPrincipalId }
            : {}),
          ...(status ? { status: status as CanvasInviteCodeStatus } : {}),
        },
        signal
      ),
    placeholderData: (previous) => previous,
  })
  useEffect(() => {
    onExactFilterChange?.(codes.data?.exactFilter ?? null)
  }, [codes.data?.exactFilter, onExactFilterChange])
  const options = useQuery({
    queryKey: ['canvas-cloud', 'invite-code-options'],
    queryFn: getCanvasInviteCodeOptions,
  })
  const campaigns = useQuery({
    queryKey: ['canvas-cloud', 'invite-campaign-options'],
    queryFn: ({ signal }) =>
      getCanvasBindableBonusActivities('INVITE_BONUS', signal),
  })
  const selectedCampaign = campaigns.data?.find(
    (item) => item.id === promotionVersionId
  )
  const selectedPriceGroupId = form.priceGroupId
  const selectedPriceGroup = options.data?.priceGroups.find(
    (item) => item.id === selectedPriceGroupId
  )
  const resetCreateDraft = useCallback(() => {
    inviteForm.reset({
      maxRegistrations: '1',
      ...initialDates,
      priceGroupId: '',
      referralPrincipalId: '',
      promotionVersionId: '',
    })
    setCreateIdempotencyKey('')
  }, [initialDates, inviteForm])
  const draftIsDirty = inviteForm.formState.isDirty
  const hasProtectedDelivery = Boolean(issuedCode)
  const discardCreateDrawer = useCallback(() => {
    setPendingAction(null)
    setIssuedCode(null)
    resetCreateDraft()
    setCreateOpen(false)
  }, [resetCreateDraft])
  useEffect(() => {
    props.onNavigationGuardChange?.({
      when: createOpen && (draftIsDirty || hasProtectedDelivery),
      discard: discardCreateDrawer,
    })
  }, [
    createOpen,
    discardCreateDrawer,
    draftIsDirty,
    hasProtectedDelivery,
    props,
  ])
  const create = useMutation({
    mutationFn: () =>
      createCanvasAdminInviteCode({
        maxRegistrations: form.maxRegistrations,
        validFrom: new Date(form.validFrom).toISOString(),
        expiresAt: new Date(form.expiresAt).toISOString(),
        priceGroupId: selectedPriceGroupId,
        initialBonusPoints: selectedCampaign?.points ?? null,
        initialBonusTtlDays: selectedCampaign?.ttlDays ?? null,
        promotionVersionId: promotionVersionId || null,
        referralSource: null,
        referralPrincipalId: form.referralPrincipalId || null,
        idempotencyKey: createIdempotencyKey,
      }),
    onSuccess: async (result) => {
      try {
        setCreateError(null)
        const deliveredCode =
          result.code ??
          (await revealCanvasCode('admin-invite', result.item.id, 'DISPLAY'))
            .code
        setIssuedCode(deliveredCode)
        setPendingAction(null)
        toast.success(t('Invite code created'))
        await queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'admin-invite-codes'],
        })
      } catch {
        setPendingAction(null)
        toast.error(t('Invite code created, but it could not be revealed'))
      }
    },
    onError: (error) => {
      const code = inviteCodeFailureCode(error)
      const field = inviteCodeFailureField(error)
      const target =
        field === 'maxRegistrations' ||
        field === 'expiresAt' ||
        field === 'priceGroupId' ||
        field === 'referralPrincipalId' ||
        field === 'promotionVersionId'
          ? field
          : null
      let message = t('Invite code could not be created')
      if (code === 'INVALID_INVITE_CAPACITY') {
        message = t('Enter a positive whole number within the supported range')
      } else if (code === 'INVALID_VALIDITY_WINDOW') {
        message = t('Expiry must be after the start time')
      } else if (code === 'PRICE_GROUP_UNAVAILABLE') {
        message = t('Select a published price group')
      } else if (code === 'INVITER_UNAVAILABLE') {
        message = t('The selected inviter is no longer available.')
      } else if (
        code === 'PROMOTION_UNAVAILABLE' ||
        code === 'PROMOTION_CHANGED'
      ) {
        message = t('The selected bonus campaign is no longer available.')
      } else if (code === 'UNAUTHORIZED') {
        message = t(
          'Your administrator session is no longer authorized. Refresh the page and sign in again.'
        )
      }
      if (target) inviteForm.setError(target, { type: 'server', message })
      setCreateError(message)
      setPendingAction(null)
      toast.error(t('Invite code could not be created'), {
        description: message,
      })
    },
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
  const exportCodes = useMutation({
    mutationFn: () =>
      exportCanvasAdminInviteCodes({
        sortBy: tableState.query.sortBy,
        sortOrder: tableState.query.sortOrder,
        ...(tableState.query.search ? { code: tableState.query.search } : {}),
        ...(debouncedPriceGroup ? { priceGroup: debouncedPriceGroup } : {}),
        ...(debouncedInviter ? { inviter: debouncedInviter } : {}),
        ...(props.inviterPrincipalId
          ? { inviterPrincipalId: props.inviterPrincipalId }
          : {}),
        ...(status ? { status: status as CanvasInviteCodeStatus } : {}),
      }),
    onSuccess: (csv) => {
      const url = URL.createObjectURL(csv)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `canvas-invite-codes-${new Date().toISOString()}.csv`
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      toast.success(t('Invite codes exported'))
    },
    onError: () => toast.error(t('Invite codes could not be exported')),
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

  const shouldShowError = (field: keyof InviteDraft) =>
    Boolean(inviteForm.formState.touchedFields[field]) ||
    inviteForm.formState.submitCount > 0
  let promotionError: string | null = null
  if (shouldShowError('promotionVersionId')) {
    promotionError =
      inviteForm.formState.errors.promotionVersionId?.message ?? null
  } else if (
    inviteForm.formState.errors.promotionVersionId?.type === 'server'
  ) {
    promotionError =
      inviteForm.formState.errors.promotionVersionId.message ?? null
  }
  const errors = {
    capacity: shouldShowError('maxRegistrations')
      ? (inviteForm.formState.errors.maxRegistrations?.message ?? null)
      : null,
    priceGroup: shouldShowError('priceGroupId')
      ? (inviteForm.formState.errors.priceGroupId?.message ?? null)
      : null,
    validFrom: shouldShowError('validFrom')
      ? (inviteForm.formState.errors.validFrom?.message ?? null)
      : null,
    expiresAt: shouldShowError('expiresAt')
      ? (inviteForm.formState.errors.expiresAt?.message ?? null)
      : null,
    promotion: promotionError,
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
          <div className='flex w-full items-start gap-1'>
            <span className='min-w-0 flex-1 font-mono break-all'>
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
            <Button
              aria-label={t('Copy invite code')}
              disabled={reveal.isPending}
              size='icon-sm'
              title={t('Copy invite code')}
              type='button'
              variant='ghost'
              onClick={() => reveal.mutate({ id: item.id, action: 'COPY' })}
            >
              <Copy aria-hidden='true' className='size-4' />
            </Button>
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
        <DataTableColumnHeader column={column} title={t('Price plan')} />
      ),
    },
    {
      id: 'inviter',
      accessorFn: (item) => item.agent?.username ?? '',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Inviter')} />
      ),
      cell: ({ row }) => {
        const agent = row.original.agent
        if (!agent) return t('Unassociated')
        return (
          <div className='flex items-center gap-1'>
            {props.onViewInviter ? (
              <Button
                className='h-auto p-0 text-left whitespace-normal'
                type='button'
                variant='link'
                onClick={() => props.onViewInviter?.(agent)}
              >
                {agent.username}
              </Button>
            ) : (
              <span className='break-all'>{agent.username}</span>
            )}
            <Button
              aria-label={t('Copy inviter username')}
              size='icon-sm'
              title={t('Copy inviter username')}
              type='button'
              variant='ghost'
              onClick={() => {
                void navigator.clipboard.writeText(agent.username)
                toast.success(t('Inviter username copied'))
              }}
            >
              <Copy aria-hidden='true' className='size-4' />
            </Button>
          </div>
        )
      },
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
      header: t('Invite bonus'),
      cell: ({ row }) =>
        row.original.initialBonusPoints
          ? `${row.original.initialBonusPoints} · ${row.original.initialBonusTtlDays} ${t('days')}`
          : t('None'),
    },
    {
      id: 'validFrom',
      accessorKey: 'validFrom',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Validity')} />
      ),
      cell: ({ row }) => (
        <span>
          {formatDate(
            row.original.validFrom,
            i18n.resolvedLanguage ?? i18n.language
          )}
          <span className='text-muted-foreground block'>
            {formatDate(
              row.original.expiresAt,
              i18n.resolvedLanguage ?? i18n.language
            )}
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
      cell: ({ row }) =>
        formatDate(
          row.original.createdAt,
          i18n.resolvedLanguage ?? i18n.language
        ),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: t('Actions'),
      cell: ({ row }) => {
        const item = row.original
        const actionCandidates = [
          item.effectiveStatus === 'ACTIVE'
            ? {
                action: 'pause' as const,
                label: t('Pause invite code'),
                Icon: Pause,
              }
            : null,
          item.effectiveStatus === 'PAUSED'
            ? {
                action: 'resume' as const,
                label: t('Resume invite code'),
                Icon: Play,
              }
            : null,
          ['ACTIVE', 'PAUSED'].includes(item.effectiveStatus)
            ? {
                action: 'revoke' as const,
                label: t('Revoke'),
                Icon: Trash2,
              }
            : null,
        ]
        const actions = actionCandidates.filter(
          (action): action is NonNullable<(typeof actionCandidates)[number]> =>
            action !== null
        )
        if (actions.length === 0) {
          return <span aria-label={t('No actions')}>—</span>
        }
        return (
          <div className='flex min-w-max items-center justify-end gap-1'>
            {actions.map(({ action, label, Icon }) => (
              <Button
                key={action}
                className={
                  action === 'revoke'
                    ? 'text-destructive hover:text-destructive'
                    : undefined
                }
                type='button'
                variant='outline'
                onClick={() =>
                  setPendingAction({ kind: 'status', item, action })
                }
              >
                <Icon aria-hidden='true' />
                {label}
              </Button>
            ))}
          </div>
        )
      },
    },
  ]

  if (
    (codes.isPending && !codes.data) ||
    options.isPending ||
    campaigns.isPending
  ) {
    return <LoadingState />
  }
  if (options.isError) {
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
  let confirmationTitle = t('Create invite code')
  let confirmationConfirmLabel = t('Confirm creation')
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
        value: selectedPriceGroup
          ? `${selectedPriceGroup.internalName} · ${selectedPriceGroup.code}`
          : '—',
      },
      ...(selectedCampaign
        ? [
            {
              label: t('Invite bonus campaign'),
              value: `${selectedCampaign.name} · v${selectedCampaign.version}`,
            },
            {
              label: t('Bonus per new customer'),
              value: selectedCampaign.points,
            },
            {
              label: t('Bonus validity'),
              value: String(selectedCampaign.ttlDays),
            },
          ]
        : [{ label: t('Invite bonus campaign'), value: t('No promotion') }]),
      {
        label: t('Inviter'),
        value:
          options.data.agents.find(
            (item) => item.principalId === form.referralPrincipalId
          )?.username ?? t('No inviter'),
      },
      {
        label: t('Valid from'),
        value: `${formatTokyoDate(
          new Date(form.validFrom).toISOString(),
          i18n.resolvedLanguage ?? i18n.language
        )} · Asia/Tokyo`,
      },
      {
        label: t('Expires at'),
        value: `${formatTokyoDate(
          new Date(form.expiresAt).toISOString(),
          i18n.resolvedLanguage ?? i18n.language
        )} · Asia/Tokyo`,
      },
    ]
  } else if (pendingAction?.kind === 'discard') {
    confirmationTitle = t('Discard this draft?')
    confirmationConfirmLabel = t('Discard draft')
    confirmationDescription = issuedCode
      ? t(
          'The full invite code has not been marked as saved. Leaving will clear it from this page.'
        )
      : t('Leaving will discard the unpublished invite-code draft.')
    confirmationDestructive = true
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
      <div className='flex flex-wrap justify-end gap-2'>
        <Button
          type='button'
          variant='outline'
          disabled={exportCodes.isPending}
          onClick={() => exportCodes.mutate()}
        >
          <Download />
          {t('Export current results')}
        </Button>
        <Button
          type='button'
          onClick={() => {
            resetCreateDraft()
            setIssuedCode(null)
            setCreateIdempotencyKey(`web-invite-create-${crypto.randomUUID()}`)
            setCreateOpen(true)
          }}
        >
          {t('Create invite code')}
        </Button>
      </div>
      <Sheet
        open={createOpen}
        onOpenChange={(open) => {
          if (open) {
            setCreateOpen(true)
            return
          }
          if (draftIsDirty || hasProtectedDelivery) {
            setPendingAction({ kind: 'discard' })
          } else {
            resetCreateDraft()
            setCreateOpen(false)
          }
        }}
      >
        <SheetContent className={sideDrawerContentClassName('sm:max-w-xl')}>
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>{t('Create invite code')}</SheetTitle>
            <SheetDescription>
              {t('Review all fields before creating an invite code.')}
            </SheetDescription>
          </SheetHeader>
          {!issuedCode ? (
            <form
              id='invite-code-create-form'
              className={sideDrawerFormClassName()}
              noValidate
              onSubmit={inviteForm.handleSubmit(
                () => setPendingAction({ kind: 'create' }),
                () => toast.error(t('Please fix the highlighted fields'))
              )}
            >
              {createError ? (
                <p role='alert' className='text-destructive text-sm'>
                  {createError}
                </p>
              ) : null}
              <SideDrawerSection className='grid gap-4'>
                <div className='space-y-2'>
                  <Label htmlFor='invite-capacity'>
                    {t('Registration capacity')}
                    <span aria-hidden='true'> *</span>
                  </Label>
                  <Input
                    id='invite-capacity'
                    aria-label={t('Registration capacity')}
                    inputMode='numeric'
                    aria-invalid={Boolean(errors.capacity)}
                    aria-describedby={
                      errors.capacity
                        ? 'invite-capacity-help invite-capacity-error'
                        : 'invite-capacity-help'
                    }
                    value={form.maxRegistrations}
                    {...inviteForm.register('maxRegistrations')}
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
                    <span aria-hidden='true'> *</span>
                  </Label>
                  <select
                    id='invite-price-group'
                    aria-label={t('Initial price group')}
                    className='border-input bg-background min-h-10 w-full min-w-0 rounded-md border px-3 py-2 text-sm whitespace-normal'
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
                    {...inviteForm.register('priceGroupId')}
                  >
                    <option value=''>
                      {t('Select a published price group')}
                    </option>
                    {options.data.priceGroups.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.internalName} · {item.code}
                      </option>
                    ))}
                  </select>
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'Only currently published and effective plans are shown.'
                    )}
                  </p>
                  <FieldError
                    id='invite-price-group-error'
                    message={errors.priceGroup}
                  />
                  {options.data.priceGroups.length === 0 ? (
                    <p role='alert' className='text-muted-foreground text-sm'>
                      {t('No published price plans')}
                    </p>
                  ) : null}
                </div>
              </SideDrawerSection>
              <SideDrawerSection className='space-y-2'>
                <Label htmlFor='invite-agent'>
                  {t('Inviter')}
                  <span aria-hidden='true'> ({t('Optional')})</span>
                </Label>
                <select
                  id='invite-agent'
                  aria-label={t('Inviter')}
                  className='border-input bg-background min-h-10 w-full rounded-md border px-3 py-2 text-sm whitespace-normal'
                  value={form.referralPrincipalId}
                  {...inviteForm.register('referralPrincipalId')}
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
              </SideDrawerSection>
              <SideDrawerSection className='grid gap-6'>
                <section
                  className='space-y-3'
                  aria-labelledby='invite-validity-title'
                >
                  <h3
                    id='invite-validity-title'
                    className='text-sm font-semibold'
                  >
                    {t('Invite validity')}
                  </h3>
                  <div className='grid gap-4'>
                    <div className='space-y-2'>
                      <Label id='invite-valid-from-label'>
                        {t('Valid from')}
                        <span aria-hidden='true'> *</span>
                      </Label>
                      <div
                        role='group'
                        aria-labelledby='invite-valid-from-label'
                        aria-invalid={Boolean(errors.validFrom)}
                        aria-describedby={
                          errors.validFrom
                            ? 'invite-timezone-help invite-valid-from-error'
                            : 'invite-timezone-help'
                        }
                      >
                        <DateTimePicker
                          value={parsedLocalDateTime(form.validFrom)}
                          onChange={(value) =>
                            inviteForm.setValue(
                              'validFrom',
                              value ? localDateTime(value) : '',
                              {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: true,
                              }
                            )
                          }
                          placeholder={t('Valid from')}
                          className='grid w-full min-w-0 grid-cols-[minmax(0,1fr)_5rem_auto] gap-1.5 [&_input[type=time]]:w-full'
                          futureOnly
                        />
                      </div>
                      <FieldError
                        id='invite-valid-from-error'
                        message={errors.validFrom}
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label id='invite-expires-at-label'>
                        {t('Expires at')}
                        <span aria-hidden='true'> *</span>
                      </Label>
                      <div
                        role='group'
                        aria-labelledby='invite-expires-at-label'
                        aria-invalid={Boolean(errors.expiresAt)}
                        aria-describedby={
                          errors.expiresAt
                            ? 'invite-timezone-help invite-expires-at-error'
                            : 'invite-timezone-help'
                        }
                      >
                        <DateTimePicker
                          value={parsedLocalDateTime(form.expiresAt)}
                          onChange={(value) =>
                            inviteForm.setValue(
                              'expiresAt',
                              value ? localDateTime(value) : '',
                              {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: true,
                              }
                            )
                          }
                          placeholder={t('Expires at')}
                          className='grid w-full min-w-0 grid-cols-[minmax(0,1fr)_5rem_auto] gap-1.5 [&_input[type=time]]:w-full'
                          futureOnly
                        />
                      </div>
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
                    {t('Time zone: {{zone}}', {
                      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    })}
                  </p>
                </section>

                <section
                  className='space-y-3'
                  aria-labelledby='invite-bonus-campaign-title'
                >
                  <h3
                    id='invite-bonus-campaign-title'
                    className='text-sm font-semibold'
                  >
                    {t('Invite bonus campaign')}
                    <span aria-hidden='true'> ({t('Optional')})</span>
                  </h3>
                  <div className='space-y-2'>
                    <select
                      aria-label={t('Invite bonus campaign')}
                      id='invite-bonus-campaign'
                      className='border-input bg-background min-h-10 w-full rounded-md border px-3 py-2 text-sm whitespace-normal'
                      {...promotionField}
                      value={promotionVersionId}
                      onChange={(event) => {
                        promotionField.onChange(event)
                      }}
                    >
                      <option value=''>{t('No promotion')}</option>
                      {campaigns.data?.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · v{item.version} · {item.points}{' '}
                          {t('Bonus points')} · {item.ttlDays} {t('days')}
                        </option>
                      ))}
                    </select>
                    <FieldError
                      id='invite-bonus-campaign-error'
                      message={errors.promotion}
                    />
                    {campaigns.isError ? (
                      <div className='flex flex-wrap items-center gap-2'>
                        <p role='alert' className='text-destructive text-sm'>
                          {t('Unable to load invite bonus campaigns')}
                        </p>
                        <Button
                          size='sm'
                          type='button'
                          variant='outline'
                          onClick={() => void campaigns.refetch()}
                        >
                          {t('Retry')}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {selectedCampaign ? (
                    <div className='grid gap-2 text-sm md:grid-cols-2'>
                      <p>
                        {t('Bonus per new customer')}: {selectedCampaign.points}{' '}
                        {t('points')}
                      </p>
                      <p>
                        {t('Bonus validity')}:{' '}
                        {t(
                          'Valid for {{days}} days after registration credit',
                          {
                            days: selectedCampaign.ttlDays,
                          }
                        )}
                      </p>
                    </div>
                  ) : null}
                </section>
              </SideDrawerSection>
              <SideDrawerSection>
                <p className='text-muted-foreground mb-3 text-xs'>
                  {t(
                    'Initial Bonus points are promotional points, not cash. Their validity is fixed when the customer activates the invite.'
                  )}
                </p>
              </SideDrawerSection>
            </form>
          ) : null}

          {issuedCode && (
            <div className='mx-4 mb-4 rounded-xl border border-amber-500/50 bg-amber-500/5 p-4 sm:mx-6'>
              <h3 className='text-sm font-semibold'>
                {t('Invite code created')}
              </h3>
              <p className='text-muted-foreground mt-1 text-sm'>
                {t(
                  'The full code is shown now for delivery. The list masks it by default; showing or copying it later is audited.'
                )}
              </p>
              <p className='mt-3 text-sm font-medium'>
                {t('Full invite code')}
              </p>
              <div className='mt-3 flex flex-wrap items-center gap-2'>
                <code className='bg-muted max-w-full overflow-x-auto rounded px-3 py-2 text-sm'>
                  {issuedCode}
                </code>
                <TooltipProvider delay={200}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          aria-label={t('Copy invite code')}
                          size='icon-sm'
                          type='button'
                          variant='outline'
                          onClick={() => {
                            void navigator.clipboard.writeText(issuedCode)
                            toast.success(t('Invite code copied'))
                          }}
                        >
                          <Copy aria-hidden='true' />
                        </Button>
                      }
                    />
                    <TooltipContent>{t('Copy invite code')}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button variant='outline' onClick={downloadIssuedCode}>
                  <Download /> {t('Download TXT')}
                </Button>
                <Button
                  variant='ghost'
                  onClick={() => {
                    setIssuedCode(null)
                    resetCreateDraft()
                    setCreateOpen(false)
                  }}
                >
                  {t('I have saved it')}
                </Button>
              </div>
              <div className='text-muted-foreground mt-3 grid gap-1 text-sm sm:grid-cols-2'>
                <span>{t('Invite status ACTIVE')}</span>
                <span>
                  {t('Valid from')}:{' '}
                  {formatTokyoDate(
                    new Date(form.validFrom).toISOString(),
                    i18n.resolvedLanguage ?? i18n.language
                  )}{' '}
                  · Asia/Tokyo
                </span>
              </div>
            </div>
          )}
          {!issuedCode ? (
            <SheetFooter className={sideDrawerFooterClassName()}>
              <Button
                type='button'
                variant='outline'
                disabled={create.isPending}
                onClick={() => {
                  if (draftIsDirty || hasProtectedDelivery) {
                    setPendingAction({ kind: 'discard' })
                  } else {
                    resetCreateDraft()
                    setCreateOpen(false)
                  }
                }}
              >
                {t('Cancel')}
              </Button>
              <Button
                type='submit'
                form='invite-code-create-form'
                disabled={create.isPending || hasProtectedDelivery}
              >
                {t('Review and create invite')}
              </Button>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>

      <Card>
        <CardContent>
          <CanvasServerTable
            data={codes.data?.items ?? []}
            columns={columns}
            total={codes.data?.total ?? 0}
            state={tableState}
            searchLabel={t('Invite code')}
            searchPlaceholder={t('Visible invite code prefix')}
            loading={codes.isFetching}
            error={codes.isError}
            errorTitle={(() => {
              const code = inviteCodeFailureCode(codes.error)
              if (props.inviterPrincipalId && code === 'NOT_FOUND') {
                return t('The selected inviter no longer exists')
              }
              if (props.inviterPrincipalId && code === 'NOT_AN_INVITER') {
                return t('The selected user is not an inviter')
              }
              return undefined
            })()}
            onRetry={() => void codes.refetch()}
            emptyTitle={
              props.inviterPrincipalId
                ? t('No invite codes match this precise inviter')
                : t('No invite codes')
            }
            filteredEmptyTitle={t('No invite codes match current filters')}
            additionalFilters={
              <>
                <DataTableColumnFilterField label={t('Price plan')}>
                  <Input
                    value={priceGroup}
                    placeholder={t('Enter plan name or code')}
                    onChange={(event) => setPriceGroup(event.target.value)}
                  />
                </DataTableColumnFilterField>
                <DataTableColumnFilterField label={t('Inviter')}>
                  <Input
                    value={inviter}
                    placeholder={t('Enter inviter username')}
                    onChange={(event) => setInviter(event.target.value)}
                  />
                </DataTableColumnFilterField>
                <DataTableColumnFilterField label={t('Status')}>
                  <Select
                    value={status || 'ALL'}
                    onValueChange={(value) =>
                      setStatus(value === 'ALL' ? '' : (value ?? ''))
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <CanvasLocalizedSelectValue
                        value={status}
                        emptyLabelKey='All statuses'
                        displayValue={
                          <CanvasStatusBadge
                            status={status}
                            label={t(`Invite status ${status}`)}
                          />
                        }
                      />
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
                </DataTableColumnFilterField>
              </>
            }
            hasActiveFilters={Boolean(priceGroup || inviter || status)}
            activeFilterCount={
              (priceGroup ? 1 : 0) + (inviter ? 1 : 0) + (status ? 1 : 0)
            }
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
        cancelLabel={
          pendingAction?.kind === 'create' ? t('Back to edit') : undefined
        }
        confirmLabel={confirmationConfirmLabel}
        destructive={confirmationDestructive}
        pending={create.isPending || changeStatus.isPending}
        onConfirm={() => {
          if (pendingAction?.kind === 'create') create.mutate()
          if (pendingAction?.kind === 'discard') {
            setPendingAction(null)
            setIssuedCode(null)
            resetCreateDraft()
            setCreateOpen(false)
            return
          }
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

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
import { Copy, Download } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  checkCanvasInviteCodeAvailability,
  extendCanvasAdminInviteCode,
  previewCanvasInviteCodeExtension,
  createCanvasAdminInviteCode,
  exportCanvasAdminInviteCodes,
  getCanvasAdminInviteCodes,
  searchCanvasAdminInviteCodes,
  getCanvasInviteCodeOptions,
  revealCanvasCode,
} from '../api'
import type {
  CanvasAdminInviteCode,
  CanvasAdminInviteCodePage,
  CanvasInvitationExactFilter,
  CanvasInviteCodeStatus,
} from '../types'
import { useDirectAsync } from '../use-direct-async'
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
  | { kind: 'discardExtend' }
  | {
      kind: 'status'
      item: CanvasAdminInviteCode
      action: 'pause' | 'resume' | 'revoke'
    }
  | { kind: 'extend'; item: CanvasAdminInviteCode }
  | null

type InviteDraft = {
  codeMode: 'GENERATED' | 'CUSTOM'
  customCode: string
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

function inviteCodeAllowedActions(item: CanvasAdminInviteCode): string[] {
  return item.allowedActions
}

function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase()
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
          codeMode: z.enum(['GENERATED', 'CUSTOM']),
          customCode: z.string(),
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
          if (
            value.codeMode === 'CUSTOM' &&
            !/^[A-Z0-9]{4,8}$/u.test(value.customCode)
          ) {
            context.addIssue({
              code: 'custom',
              path: ['customCode'],
              message: t(
                'Custom invite code must be 4–8 uppercase letters or digits'
              ),
            })
          }
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
      codeMode: 'GENERATED',
      customCode: '',
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
  const [createErrorFocusTarget, setCreateErrorFocusTarget] = useState<
    keyof InviteDraft | null
  >(null)
  const [issuedCode, setIssuedCode] = useState<string | null>(null)
  const [revealedCodes, setRevealedCodes] = useState<Record<string, string>>({})
  const [pendingReveals, setPendingReveals] = useState<Record<string, true>>({})
  const [extendOpen, setExtendOpen] = useState(false)
  const [extendItem, setExtendItem] = useState<CanvasAdminInviteCode | null>(
    null
  )
  const [extendExpiresAt, setExtendExpiresAt] = useState('')
  const [extendReason, setExtendReason] = useState('')
  const [extendIdempotencyKey, setExtendIdempotencyKey] = useState('')
  const [extendPreview, setExtendPreview] = useState<Awaited<
    ReturnType<typeof previewCanvasInviteCodeExtension>
  > | null>(null)
  const [extendFieldErrors, setExtendFieldErrors] = useState<
    Record<string, string>
  >({})
  const availabilityRequestVersion = useRef(0)
  const extendPreviewRequestVersion = useRef(0)
  const tableState = useServerTableState('createdAt')
  const setPagination = tableState.setPagination
  const [status, setStatus] = useState('')
  const [priceGroup, setPriceGroup] = useState('')
  const [inviter, setInviter] = useState('')
  const [exactCode, setExactCode] = useState('')
  const debouncedExactCode = useDebounce(exactCode, 300)
  const debouncedPriceGroup = useDebounce(priceGroup.trim(), 300)
  const debouncedInviter = useDebounce(inviter.trim(), 300)
  const [exactSearchResult, setExactSearchResult] =
    useState<CanvasAdminInviteCodePage | null>(null)
  const [exactSearchError, setExactSearchError] = useState(false)
  const {
    mutate: runExactSearch,
    reset: resetExactSearch,
    isPending: exactSearchPending,
  } = useDirectAsync({
    execute: searchCanvasAdminInviteCodes,
    onSuccess: (result) => {
      setExactSearchError(false)
      setExactSearchResult(result)
    },
    onError: () => {
      setExactSearchResult(null)
      setExactSearchError(true)
    },
  })
  useEffect(() => {
    if (pendingAction !== null || !createErrorFocusTarget) return
    inviteForm.setFocus(createErrorFocusTarget)
    setCreateErrorFocusTarget(null)
  }, [createErrorFocusTarget, inviteForm, pendingAction])
  useEffect(() => {
    setPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [
    debouncedInviter,
    debouncedExactCode,
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
    resetExactSearch()
    setExactSearchResult(null)
    setExactSearchError(false)
    if (!debouncedExactCode) return
    if (normalizeInviteCode(debouncedExactCode).length < 4) {
      setExactSearchResult({
        page: 1,
        pageSize: 20,
        total: 0,
        items: [],
        exactFilter: null,
      })
      return
    }
    runExactSearch({
      code: normalizeInviteCode(debouncedExactCode),
      ...(debouncedPriceGroup ? { priceGroup: debouncedPriceGroup } : {}),
      ...(debouncedInviter ? { inviter: debouncedInviter } : {}),
      ...(props.inviterPrincipalId
        ? { inviterPrincipalId: props.inviterPrincipalId }
        : {}),
      ...(status ? { status: status as CanvasInviteCodeStatus } : {}),
      page: tableState.query.page,
      pageSize: tableState.query.pageSize,
      sortBy: tableState.query.sortBy,
      sortOrder: tableState.query.sortOrder,
    })
  }, [
    debouncedExactCode,
    debouncedPriceGroup,
    debouncedInviter,
    props.inviterPrincipalId,
    status,
    tableState.query.page,
    tableState.query.pageSize,
    tableState.query.sortBy,
    tableState.query.sortOrder,
    resetExactSearch,
    runExactSearch,
  ])
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
  const openExtend = (item: CanvasAdminInviteCode) => {
    extendPreviewRequestVersion.current += 1
    setExtendItem(item)
    setExtendExpiresAt(localDateTime(new Date(item.expiresAt)))
    setExtendReason('')
    setExtendIdempotencyKey(`web-invite-extend-${crypto.randomUUID()}`)
    setExtendPreview(null)
    setExtendFieldErrors({})
    setExtendOpen(true)
  }
  const extendIsDirty = Boolean(
    extendItem &&
    (extendExpiresAt !== localDateTime(new Date(extendItem.expiresAt)) ||
      extendReason !== '')
  )
  const closeExtend = () => {
    extendPreviewRequestVersion.current += 1
    setExtendOpen(false)
    setExtendItem(null)
    setExtendExpiresAt('')
    setExtendReason('')
    setExtendPreview(null)
    setExtendFieldErrors({})
    setExtendIdempotencyKey('')
  }
  const previewExtend = async () => {
    if (!extendItem || !extendExpiresAt) return
    const requestVersion = ++extendPreviewRequestVersion.current
    const proposal = {
      id: extendItem.id,
      expectedExpiresAt: extendItem.expiresAt,
      newExpiresAt: new Date(extendExpiresAt).toISOString(),
      reason: extendReason,
    }
    try {
      const result = await previewCanvasInviteCodeExtension({
        id: proposal.id,
        expectedExpiresAt: proposal.expectedExpiresAt,
        newExpiresAt: proposal.newExpiresAt,
      })
      if (requestVersion !== extendPreviewRequestVersion.current) return
      setExtendPreview(result)
    } catch (error) {
      if (requestVersion !== extendPreviewRequestVersion.current) return
      const field = inviteCodeFailureField(error)
      if (field === 'newExpiresAt' || field === 'expectedExpiresAt') {
        setExtendFieldErrors({
          newExpiresAt: t('Invite expiration preview could not be loaded'),
        })
      }
      toast.error(t('Invite expiration preview could not be loaded'))
    }
  }
  const resetCreateDraft = useCallback(() => {
    inviteForm.reset({
      codeMode: 'GENERATED',
      customCode: '',
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
        codeMode: form.codeMode,
        ...(form.codeMode === 'CUSTOM'
          ? { code: normalizeInviteCode(form.customCode) }
          : {}),
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
      let target: keyof InviteDraft | null = null
      if (field === 'code' || field === 'customCode') {
        target = 'customCode'
      } else if (
        field === 'maxRegistrations' ||
        field === 'expiresAt' ||
        field === 'priceGroupId' ||
        field === 'referralPrincipalId' ||
        field === 'promotionVersionId'
      ) {
        target = field
      }
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
      } else if (
        code === 'INVITE_CODE_UNAVAILABLE' ||
        code === 'INVITE_CODE_INVALID'
      ) {
        message = t('Invite code is invalid or unavailable')
      }
      if (target) inviteForm.setError(target, { type: 'server', message })
      setCreateError(message)
      setPendingAction(null)
      setCreateErrorFocusTarget(target)
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
    onSuccess: (result) => {
      queryClient.setQueriesData<{ items: CanvasAdminInviteCode[] }>(
        { queryKey: ['canvas-cloud', 'admin-invite-codes'] },
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.id === result.id ? result : item
                ),
              }
            : current
      )
      setPendingAction(null)
      toast.success(t('Invite expiration extended'))
      closeExtend()
    },
    onError: (error) => {
      const field = inviteCodeFailureField(error)
      if (field) {
        setExtendFieldErrors({
          [field]: t('Invite expiration could not be extended'),
        })
      }
      toast.error(t('Invite expiration could not be extended'))
    },
  })
  const availability = useMutation({
    mutationFn: (input: { code: string; requestVersion: number }) =>
      checkCanvasInviteCodeAvailability(input.code),
    onSuccess: (result, input) => {
      if (
        input.requestVersion !== availabilityRequestVersion.current ||
        inviteForm.getValues('codeMode') !== 'CUSTOM' ||
        normalizeInviteCode(inviteForm.getValues('customCode')) !== input.code
      ) {
        return
      }
      if (!result.available) {
        inviteForm.setError('customCode', {
          type: 'server',
          message: t('Invite code is invalid or unavailable'),
        })
      }
    },
  })
  const exportCodes = useMutation({
    mutationFn: () =>
      exportCanvasAdminInviteCodes({
        sortBy: tableState.query.sortBy,
        sortOrder: tableState.query.sortOrder,
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
    onSettled: (_data, _error, variables) => {
      const key = `${variables.id}:${variables.action}`
      setPendingReveals((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
    },
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
        const canDisplay = inviteCodeAllowedActions(item).includes('DISPLAY')
        const canCopy = inviteCodeAllowedActions(item).includes('COPY')
        return (
          <div className='flex w-full items-start gap-1'>
            <span className='min-w-0 flex-1 font-mono break-all'>
              {revealedCodes[item.id] ?? item.maskedCode}
            </span>
            {canDisplay ? (
              <CanvasCodeRevealButton
                label={revealLabel}
                revealed={Boolean(revealedCodes[item.id])}
                disabled={pendingReveals[`${item.id}:DISPLAY`] === true}
                onClick={() => {
                  if (revealedCodes[item.id]) {
                    setRevealedCodes((current) => {
                      const next = { ...current }
                      delete next[item.id]
                      return next
                    })
                    return
                  }
                  setPendingReveals((current) => ({
                    ...current,
                    [`${item.id}:DISPLAY`]: true,
                  }))
                  reveal.mutate({ id: item.id, action: 'DISPLAY' })
                }}
              />
            ) : null}
            {canCopy ? (
              <Button
                aria-label={t('Copy invite code')}
                disabled={pendingReveals[`${item.id}:COPY`] === true}
                size='icon-sm'
                title={t('Copy invite code')}
                type='button'
                variant='ghost'
                onClick={() => {
                  setPendingReveals((current) => ({
                    ...current,
                    [`${item.id}:COPY`]: true,
                  }))
                  reveal.mutate({ id: item.id, action: 'COPY' })
                }}
              >
                <Copy aria-hidden='true' className='size-4' />
              </Button>
            ) : null}
          </div>
        )
      },
    },
    {
      id: 'status',
      accessorKey: 'redeemable',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Status')} />
      ),
      cell: ({ row }) => {
        const labels = row.original.redeemable
          ? [t('Invite status REDEEMABLE')]
          : row.original.unavailableReasons.map((reason) =>
              t(`Invite status ${reason}`)
            )
        return (
          <CanvasStatusBadge
            status={
              row.original.redeemable
                ? 'REDEEMABLE'
                : (row.original.unavailableReasons[0] ?? 'UNKNOWN')
            }
            label={labels.join(' · ')}
          />
        )
      },
    },
    {
      id: 'codeMode',
      accessorKey: 'codeMode',
      header: t('Generation method'),
      cell: ({ row }) =>
        t(row.original.codeMode === 'CUSTOM' ? 'Custom' : 'System generated'),
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
          {Number(row.original.activeReservedCount) > 0 ? (
            <span className='text-muted-foreground block'>
              {t('Reserved')}: {row.original.activeReservedCount}
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
          inviteCodeAllowedActions(item).includes('PAUSE')
            ? {
                action: 'pause' as const,
                label: t('Pause invite code'),
              }
            : null,
          inviteCodeAllowedActions(item).includes('RESUME')
            ? {
                action: 'resume' as const,
                label: t('Resume invite code'),
              }
            : null,
          inviteCodeAllowedActions(item).includes('REVOKE')
            ? {
                action: 'revoke' as const,
                label: t('Revoke'),
              }
            : null,
          inviteCodeAllowedActions(item).includes('EXTEND_EXPIRATION')
            ? {
                action: 'extend' as const,
                label: t('Extend expiration'),
                Icon: null,
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
            {actions.map(({ action, label }) => (
              <Button
                key={action}
                className={
                  action === 'revoke'
                    ? 'text-destructive hover:text-destructive'
                    : undefined
                }
                type='button'
                variant='outline'
                disabled={
                  action !== 'extend' &&
                  changeStatus.isPending &&
                  changeStatus.variables?.id === item.id &&
                  changeStatus.variables.action === action
                }
                onClick={() => {
                  if (action === 'extend') openExtend(item)
                  else setPendingAction({ kind: 'status', item, action })
                }}
              >
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
  } else if (pendingAction?.kind === 'discardExtend') {
    confirmationTitle = t('Discard this draft?')
    confirmationConfirmLabel = t('Discard draft')
    confirmationDescription = t(
      'Leaving will discard the unpublished invite-code draft.'
    )
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
        value: pendingAction.item.redeemable
          ? t('Invite status REDEEMABLE')
          : pendingAction.item.unavailableReasons
              .map((reason) => t(`Invite status ${reason}`))
              .join(' · '),
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
          disabled={exportCodes.isPending || Boolean(exactCode)}
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
                (fieldErrors) => {
                  if (fieldErrors.customCode) {
                    inviteForm.setFocus('customCode')
                  }
                  toast.error(t('Please fix the highlighted fields'))
                }
              )}
            >
              {createError ? (
                <p role='alert' className='text-destructive text-sm'>
                  {createError}
                </p>
              ) : null}
              <SideDrawerSection className='grid gap-4'>
                <fieldset className='space-y-2'>
                  <legend className='text-sm font-medium'>
                    {t('Generation method')} <span aria-hidden='true'> *</span>
                  </legend>
                  <div className='flex flex-wrap gap-4'>
                    {(['GENERATED', 'CUSTOM'] as const).map((mode) => (
                      <label
                        key={mode}
                        className='flex items-center gap-2 text-sm'
                      >
                        <input
                          type='radio'
                          value={mode}
                          checked={form.codeMode === mode}
                          onChange={() => {
                            availabilityRequestVersion.current += 1
                            inviteForm.clearErrors('customCode')
                            inviteForm.setValue('customCode', '', {
                              shouldDirty: true,
                            })
                            inviteForm.setValue('codeMode', mode, {
                              shouldDirty: true,
                            })
                          }}
                        />
                        {t(mode === 'CUSTOM' ? 'Custom' : 'System generated')}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {form.codeMode === 'CUSTOM' ? (
                  <div className='space-y-2'>
                    <Label htmlFor='invite-custom-code'>
                      {t('Invite code')} *
                    </Label>
                    <Input
                      id='invite-custom-code'
                      name='customCode'
                      ref={inviteForm.register('customCode').ref}
                      aria-label={t('Invite code')}
                      value={form.customCode}
                      autoCapitalize='characters'
                      aria-invalid={Boolean(
                        inviteForm.formState.errors.customCode
                      )}
                      aria-describedby={
                        inviteForm.formState.errors.customCode
                          ? 'invite-custom-code-error'
                          : undefined
                      }
                      onChange={(event) => {
                        availabilityRequestVersion.current += 1
                        inviteForm.clearErrors('customCode')
                        inviteForm.setValue(
                          'customCode',
                          normalizeInviteCode(event.target.value),
                          { shouldDirty: true, shouldTouch: true }
                        )
                      }}
                      onBlur={() => {
                        void inviteForm.trigger('customCode')
                        const normalized = normalizeInviteCode(form.customCode)
                        if (/^[A-Z0-9]{4,8}$/u.test(normalized)) {
                          const requestVersion =
                            ++availabilityRequestVersion.current
                          availability.mutate({
                            code: normalized,
                            requestVersion,
                          })
                        }
                      }}
                    />
                    <p className='text-muted-foreground text-xs'>
                      {t(
                        'Custom invite code must be 4–8 uppercase letters or digits'
                      )}
                    </p>
                    <FieldError
                      id='invite-custom-code-error'
                      message={
                        inviteForm.formState.errors.customCode?.message ?? null
                      }
                    />
                  </div>
                ) : (
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'System will generate CANVAS- followed by 8 uppercase letters or digits'
                    )}
                  </p>
                )}
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
                      aria-invalid={Boolean(errors.promotion)}
                      aria-describedby={
                        errors.promotion
                          ? 'invite-bonus-campaign-error'
                          : undefined
                      }
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

      <Sheet
        open={extendOpen}
        onOpenChange={(open) => {
          if (open) setExtendOpen(true)
          else if (extendIsDirty) setPendingAction({ kind: 'discardExtend' })
          else closeExtend()
        }}
      >
        <SheetContent className={sideDrawerContentClassName('sm:max-w-xl')}>
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>{t('Extend expiration')}</SheetTitle>
            <SheetDescription>
              {t('Only the expiration time will change.')}
            </SheetDescription>
          </SheetHeader>
          {extendItem ? (
            <form
              className={sideDrawerFormClassName()}
              onSubmit={(event) => {
                event.preventDefault()
                const nextExpiry = new Date(extendExpiresAt)
                if (
                  !Number.isFinite(nextExpiry.getTime()) ||
                  nextExpiry <= new Date(extendItem.expiresAt) ||
                  nextExpiry <= new Date()
                ) {
                  setExtendFieldErrors({
                    newExpiresAt: t('Expiry must be in the future'),
                  })
                  toast.error(t('Expiry must be in the future'))
                  return
                }
                if (!extendPreview) {
                  void previewExtend()
                  return
                }
                extend.mutate({
                  id: extendItem.id,
                  expectedExpiresAt: extendItem.expiresAt,
                  newExpiresAt: new Date(extendExpiresAt).toISOString(),
                  reason: extendReason.trim(),
                })
              }}
            >
              <p className='text-sm'>
                {t('Invite code')}: {extendItem.maskedCode}
              </p>
              <p className='text-sm'>
                {t('Current status')}:{' '}
                {extendItem.redeemable
                  ? t('Invite status REDEEMABLE')
                  : extendItem.unavailableReasons
                      .map((reason) => t(`Invite status ${reason}`))
                      .join(' · ')}{' '}
                · {t('Used / capacity')}: {extendItem.consumedCount} /{' '}
                {extendItem.maxRegistrations}
              </p>
              <p className='text-sm'>
                {t('Expires at')}:{' '}
                {formatDate(
                  extendItem.expiresAt,
                  i18n.resolvedLanguage ?? i18n.language
                )}
              </p>
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
                    className='grid w-full min-w-0 grid-cols-[minmax(0,1fr)_5rem_auto] gap-1.5 [&_input[type=time]]:w-full'
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
              <SheetFooter className={sideDrawerFooterClassName()}>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => {
                    if (extendIsDirty) {
                      setPendingAction({ kind: 'discardExtend' })
                    } else {
                      closeExtend()
                    }
                  }}
                >
                  {t('Cancel')}
                </Button>
                <Button
                  type='submit'
                  disabled={extend.isPending || !extendExpiresAt}
                >
                  {extendPreview
                    ? t('Confirm extension')
                    : t('Preview extension')}
                </Button>
              </SheetFooter>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>

      <Card>
        <CardContent>
          <CanvasServerTable
            data={
              debouncedExactCode
                ? (exactSearchResult?.items ?? [])
                : (codes.data?.items ?? [])
            }
            columns={columns}
            total={
              debouncedExactCode
                ? (exactSearchResult?.total ?? 0)
                : (codes.data?.total ?? 0)
            }
            state={tableState}
            loading={debouncedExactCode ? exactSearchPending : codes.isFetching}
            error={debouncedExactCode ? exactSearchError : codes.isError}
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
            onRetry={() => {
              if (debouncedExactCode) {
                runExactSearch({
                  code: normalizeInviteCode(debouncedExactCode),
                  ...(debouncedPriceGroup
                    ? { priceGroup: debouncedPriceGroup }
                    : {}),
                  ...(debouncedInviter ? { inviter: debouncedInviter } : {}),
                  ...(props.inviterPrincipalId
                    ? { inviterPrincipalId: props.inviterPrincipalId }
                    : {}),
                  ...(status
                    ? { status: status as CanvasInviteCodeStatus }
                    : {}),
                  page: tableState.query.page,
                  pageSize: tableState.query.pageSize,
                  sortBy: tableState.query.sortBy,
                  sortOrder: tableState.query.sortOrder,
                })
                return
              }
              void codes.refetch()
            }}
            emptyTitle={
              props.inviterPrincipalId
                ? t('No invite codes match this precise inviter')
                : t('No invite codes')
            }
            filteredEmptyTitle={t('No invite codes match current filters')}
            additionalFilters={
              <>
                <DataTableColumnFilterField label={t('Invite code')}>
                  <Input
                    value={exactCode}
                    aria-label={t('Invite code')}
                    placeholder={t('Enter complete invite code')}
                    onChange={(event) => {
                      setExactCode(event.target.value)
                      setPagination((value) =>
                        value.pageIndex === 0
                          ? value
                          : { ...value, pageIndex: 0 }
                      )
                    }}
                  />
                </DataTableColumnFilterField>
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
            hasActiveFilters={Boolean(
              exactCode || priceGroup || inviter || status
            )}
            activeFilterCount={
              (exactCode ? 1 : 0) +
              (priceGroup ? 1 : 0) +
              (inviter ? 1 : 0) +
              (status ? 1 : 0)
            }
            onResetFilters={() => {
              setPriceGroup('')
              setInviter('')
              setExactCode('')
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
        pending={create.isPending || changeStatus.isPending || extend.isPending}
        onConfirm={() => {
          if (pendingAction?.kind === 'create') create.mutate()
          if (pendingAction?.kind === 'discard') {
            setPendingAction(null)
            setIssuedCode(null)
            resetCreateDraft()
            setCreateOpen(false)
            return
          }
          if (pendingAction?.kind === 'discardExtend') {
            setPendingAction(null)
            closeExtend()
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

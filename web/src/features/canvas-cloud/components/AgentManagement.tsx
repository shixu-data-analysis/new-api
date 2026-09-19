/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
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
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasAgents, provisionCanvasAgent } from '../api'
import type { CanvasAgentProfile, CanvasInvitationExactFilter } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CanvasStatusBadge } from './CanvasStatusBadge'
import { CopyableText } from './CopyableText'
import type { InvitationNavigationGuard } from './InvitationManagement'
import { PricingActionConfirmation } from './PricingActionConfirmation'

interface AgentFormValues {
  username: string
  reason: string
}

function agentCreationFailureCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const data = (error as { response?: { data?: unknown } }).response?.data
  if (!data || typeof data !== 'object') return null
  const code = (data as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function agentCreationFailureField(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const details = (error as { response?: { data?: { details?: unknown } } })
    .response?.data?.details
  if (!details || typeof details !== 'object') return null
  const field = (details as { field?: unknown }).field
  return typeof field === 'string' ? field : null
}

export function AgentManagement(props: {
  principalId?: string
  onViewInviteCodes?: (agent: CanvasAgentProfile) => void
  onExactFilterChange?: (filter: CanvasInvitationExactFilter | null) => void
  onNavigationGuardChange?: (guard: InvitationNavigationGuard) => void
  onClearPreciseLocation?: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const onViewInviteCodes = props.onViewInviteCodes
  const onExactFilterChange = props.onExactFilterChange
  const [createOpen, setCreateOpen] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState('')
  const tableState = useServerTableState('createdAt')
  const [status, setStatus] = useState('')
  const form = useForm<AgentFormValues>({
    mode: 'onTouched',
    resolver: zodResolver(
      z.object({
        username: z
          .string()
          .trim()
          .min(1, t('Enter a username'))
          .max(191, t('Username must not exceed 191 characters')),
        reason: z
          .string()
          .trim()
          .min(1, t('Enter an approval reason'))
          .max(500, t('Reason must not exceed 500 characters')),
      })
    ),
    defaultValues: {
      username: '',
      reason: '',
    },
  })
  const values = form.watch()
  const hasDraft = Boolean(values.username.trim() || values.reason.trim())
  const [confirming, setConfirming] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const agents = useQuery({
    queryKey: [
      'canvas-cloud',
      'agents',
      tableState.query,
      status,
      props.principalId,
    ],
    queryFn: ({ signal }) =>
      getCanvasAgents(
        {
          ...tableState.query,
          ...(status ? { status: status as CanvasAgentProfile['status'] } : {}),
          ...(props.principalId ? { principalId: props.principalId } : {}),
        },
        signal
      ),
    placeholderData: (previous) => previous,
  })
  useEffect(() => {
    onExactFilterChange?.(agents.data?.exactFilter ?? null)
  }, [agents.data?.exactFilter, onExactFilterChange])
  useEffect(() => {
    tableState.setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }
    )
  }, [props.principalId, status, tableState])
  const create = useMutation({
    mutationFn: () =>
      provisionCanvasAgent({
        username: form.getValues('username').trim(),
        status: 'ACTIVE',
        reason: form.getValues('reason').trim(),
        idempotencyKey,
      }),
    onSuccess: async () => {
      setCreateError(null)
      setConfirming(false)
      setDiscarding(false)
      setCreateOpen(false)
      setIdempotencyKey('')
      form.reset()
      toast.success(t('Invitation ability enabled'))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['canvas-cloud', 'agents'] }),
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'invite-code-options'],
        }),
      ])
    },
    onError: (error) => {
      const code = agentCreationFailureCode(error)
      const field = agentCreationFailureField(error)
      let fieldMessage: string | null = null
      if (code === 'INVITER_CAPABILITY_ALREADY_GRANTED') {
        fieldMessage = t('This customer already has invitation ability.')
      } else if (
        code === 'INVITER_TARGET_UNAVAILABLE' ||
        (code === 'VALIDATION_FAILED' && field === 'username')
      ) {
        fieldMessage = t(
          'Only an active Canvas customer can receive invitation ability.'
        )
      } else if (code === 'VALIDATION_FAILED' && field === 'reason') {
        fieldMessage = t('Enter an approval reason')
      }
      if (fieldMessage && (field === 'username' || field === 'reason')) {
        form.setError(field, { type: 'server', message: fieldMessage })
      }
      const reason = (() => {
        switch (code) {
          case 'INVITER_CAPABILITY_ALREADY_GRANTED':
            return t('This customer already has invitation ability.')
          case 'CUSTOMER_REQUIRED':
            return t(
              'Only an active Canvas customer can receive invitation ability.'
            )
          case 'VALIDATION_FAILED':
            return t(
              'Only an existing, enabled common New API user can become an inviter. Administrators and root users are not eligible.'
            )
          case 'NOT_FOUND':
            return t(
              'The username was not found. Refresh the page and check the username.'
            )
          case 'IDENTITY_PROVIDER_UNAVAILABLE':
            return t(
              'The user could not be verified right now. Confirm the username exists, then try again later.'
            )
          case 'UNAUTHORIZED':
            return t(
              'Your administrator session is no longer authorized. Refresh the page and sign in again.'
            )
          case 'IDEMPOTENCY_CONFLICT':
            return t(
              'This creation request conflicts with an earlier attempt. Refresh the page before trying again.'
            )
          default:
            return t(
              'The request could not be completed. Refresh the page and try again.'
            )
        }
      })()
      setCreateError(reason)
      toast.error(t('Invitation ability could not be enabled'), {
        description: reason,
      })
    },
  })
  const closeCreateDrawer = useCallback(() => {
    if (create.isPending) return
    setConfirming(false)
    setDiscarding(false)
    setCreateOpen(false)
    setIdempotencyKey('')
    form.reset()
  }, [create.isPending, form])
  const requestCloseCreateDrawer = () => {
    if (create.isPending) return
    if (form.formState.isDirty || hasDraft) {
      setDiscarding(true)
      return
    }
    closeCreateDrawer()
  }
  const guardWhen = createOpen && (form.formState.isDirty || hasDraft)
  useEffect(() => {
    props.onNavigationGuardChange?.({
      when: guardWhen,
      discard: closeCreateDrawer,
    })
  }, [closeCreateDrawer, guardWhen, props])
  const columns = useMemo<ColumnDef<CanvasAgentProfile, unknown>[]>(
    () => [
      {
        id: 'username',
        accessorKey: 'username',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Username')} />
        ),
        cell: ({ row }) => (
          <CopyableText value={row.original.username} noTruncate />
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        cell: ({ row }) => (
          <CanvasStatusBadge
            status={row.original.status}
            label={t(row.original.status === 'ACTIVE' ? 'Enabled' : 'Disabled')}
          />
        ),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Created At')} />
        ),
        cell: ({ row }) =>
          new Intl.DateTimeFormat(
            toIntlLocale(i18n.resolvedLanguage ?? i18n.language),
            { dateStyle: 'medium', timeStyle: 'short' }
          ).format(new Date(row.original.createdAt)),
      },
      ...(onViewInviteCodes
        ? [
            {
              id: 'actions',
              enableSorting: false,
              header: t('Actions'),
              cell: ({ row }: { row: { original: CanvasAgentProfile } }) => (
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => onViewInviteCodes(row.original)}
                >
                  {t('View invite codes')}
                </Button>
              ),
            } as ColumnDef<CanvasAgentProfile, unknown>,
          ]
        : []),
    ],
    [i18n.language, i18n.resolvedLanguage, onViewInviteCodes, t]
  )
  if (agents.isPending && !agents.data) return <LoadingState />
  const exactError = agents.isError
  const exactErrorTitle = (() => {
    const code = agentCreationFailureCode(agents.error)
    let title: string | undefined
    if (props.principalId && code === 'NOT_FOUND') {
      title = t('The selected inviter no longer exists')
    } else if (props.principalId && code === 'NOT_AN_INVITER') {
      title = t('The selected user is not an inviter')
    }
    return title
  })()
  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button
          type='button'
          onClick={() => {
            setCreateError(null)
            form.reset()
            setIdempotencyKey(`web-agent-create-${crypto.randomUUID()}`)
            setCreateOpen(true)
          }}
        >
          {t('Enable invitation ability')}
        </Button>
      </div>
      <Sheet
        open={createOpen}
        onOpenChange={(open) =>
          open ? setCreateOpen(true) : requestCloseCreateDrawer()
        }
      >
        <SheetContent className={sideDrawerContentClassName('sm:max-w-xl')}>
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>{t('Enable invitation ability')}</SheetTitle>
            <SheetDescription>
              {t(
                'Add invitation ability to an existing Canvas customer without removing customer access.'
              )}
            </SheetDescription>
          </SheetHeader>
          <Form {...form}>
            <form
              id='agent-invitation-ability-form'
              noValidate
              className={sideDrawerFormClassName(
                'grid items-start md:grid-cols-2'
              )}
              onSubmit={form.handleSubmit(
                () => setConfirming(true),
                () => toast.error(t('Please fix the highlighted fields'))
              )}
            >
              {createError ? (
                <p role='alert' className='text-destructive md:col-span-2'>
                  {createError}
                </p>
              ) : null}
              <FormField
                control={form.control}
                name='username'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Customer username')}</FormLabel>
                    <FormControl>
                      <Input {...field} autoComplete='off' maxLength={191} />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Enter the username of an existing active Canvas customer.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='reason'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Enable reason')}</FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={500} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <SheetFooter className={sideDrawerFooterClassName()}>
            <Button
              type='button'
              variant='outline'
              disabled={create.isPending}
              onClick={requestCloseCreateDrawer}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='submit'
              form='agent-invitation-ability-form'
              disabled={create.isPending}
            >
              {t('Enable invitation ability')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <CanvasServerTable
        data={agents.data?.items ?? []}
        columns={columns}
        total={agents.data?.total ?? 0}
        state={tableState}
        searchLabel={t('Username')}
        searchPlaceholder={t('Enter inviter username')}
        loading={agents.isFetching}
        error={exactError}
        errorTitle={exactErrorTitle}
        onRetry={() => void agents.refetch()}
        emptyTitle={
          props.principalId
            ? t('No inviter matches this precise location')
            : t('No inviters')
        }
        filteredEmptyTitle={t('No inviters match current filters')}
        additionalFilters={
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
                      label={t(status === 'ACTIVE' ? 'Enabled' : 'Disabled')}
                    />
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                <SelectItem value='ACTIVE'>
                  <CanvasStatusBadge status='ACTIVE' label={t('Enabled')} />
                </SelectItem>
                <SelectItem value='DISABLED'>
                  <CanvasStatusBadge status='DISABLED' label={t('Disabled')} />
                </SelectItem>
              </SelectContent>
            </Select>
          </DataTableColumnFilterField>
        }
        hasActiveFilters={Boolean(status)}
        activeFilterCount={status ? 1 : 0}
        onResetFilters={() => {
          setStatus('')
        }}
        getRowId={(row) => row.principalId}
      />
      <PricingActionConfirmation
        open={confirming || discarding}
        title={
          discarding
            ? t('Discard this draft?')
            : t('Enable invitation ability for this customer?')
        }
        description={
          discarding
            ? t('Leaving will discard the unpublished inviter draft.')
            : t(
                'The customer keeps all customer pages, wallet, points, recharge, models, and tasks. The inviter center appears only after this confirmed grant.'
              )
        }
        confirmLabel={discarding ? t('Discard draft') : t('Confirm creation')}
        destructive={discarding}
        pending={create.isPending}
        details={
          discarding
            ? []
            : [
                {
                  label: t('Customer username'),
                  value: values.username.trim(),
                },
                { label: t('Enable reason'), value: values.reason.trim() },
              ]
        }
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(false)
            setDiscarding(false)
          }
        }}
        onConfirm={() => {
          if (discarding) closeCreateDrawer()
          else create.mutate()
        }}
      />
    </div>
  )
}

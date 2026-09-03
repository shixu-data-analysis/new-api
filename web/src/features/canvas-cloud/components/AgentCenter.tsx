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
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
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
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks'

import {
  getCanvasAgentCustomers,
  getCanvasAgentInviteCodes,
  getCanvasAgentWorkspace,
  revealCanvasCode,
} from '../api'
import { formatCanvasDateTime } from '../formatters'
import type {
  CanvasAgentCustomer,
  CanvasAgentCustomerQuery,
  CanvasAgentInviteCode,
  CanvasAgentInviteCodeQuery,
  CanvasInviteCodeStatus,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTerm, BusinessTermText } from './BusinessTerm'
import { CanvasCodeRevealButton } from './CanvasCodeRevealButton'
import { CanvasColumnFilterField } from './CanvasColumnFilterPanel'
import { CanvasServerTable } from './CanvasServerTable'
import { CanvasStatusBadge } from './CanvasStatusBadge'
import { CopyableText } from './CopyableText'

export function AgentCenter() {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const invitesState =
    useServerTableState<CanvasAgentInviteCodeQuery['sortBy']>('createdAt')
  const customersState =
    useServerTableState<CanvasAgentCustomerQuery['sortBy']>('activatedAt')
  const setCustomersPagination = customersState.setPagination
  const [inviteStatus, setInviteStatus] = useState('')
  const [customerStatus, setCustomerStatus] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const debouncedCustomerEmail = useDebounce(customerEmail.trim(), 300)
  useEffect(() => {
    setCustomersPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [customerStatus, debouncedCustomerEmail, setCustomersPagination])
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'agent-workspace'],
    queryFn: getCanvasAgentWorkspace,
  })
  const invites = useQuery({
    queryKey: [
      'canvas-cloud',
      'agent-invite-codes',
      invitesState.query,
      inviteStatus,
    ],
    queryFn: ({ signal }) =>
      getCanvasAgentInviteCodes(
        {
          ...invitesState.query,
          ...(inviteStatus
            ? { status: inviteStatus as CanvasInviteCodeStatus }
            : {}),
        },
        signal
      ),
  })
  const customers = useQuery({
    queryKey: [
      'canvas-cloud',
      'agent-customers',
      customersState.query,
      debouncedCustomerEmail,
      customerStatus,
    ],
    queryFn: ({ signal }) =>
      getCanvasAgentCustomers(
        {
          page: customersState.query.page,
          pageSize: customersState.query.pageSize,
          sortBy: customersState.query.sortBy,
          sortOrder: customersState.query.sortOrder,
          ...(customersState.query.search
            ? { username: customersState.query.search }
            : {}),
          ...(debouncedCustomerEmail ? { email: debouncedCustomerEmail } : {}),
          ...(customerStatus
            ? { status: customerStatus as CanvasAgentCustomer['status'] }
            : {}),
        },
        signal
      ),
  })
  const reveal = useMutation({
    mutationFn: (input: { id: string; action: 'DISPLAY' | 'COPY' }) =>
      revealCanvasCode('agent-invite', input.id, input.action).then(
        (result) => ({ ...result, ...input })
      ),
    onSuccess: async (result) => {
      if (result.action === 'COPY') {
        await navigator.clipboard.writeText(result.code)
        toast.success(t('Invite code copied'))
        return
      }
      setRevealed((current) => ({ ...current, [result.id]: result.code }))
    },
    onError: () => toast.error(t('Invite code could not be revealed')),
  })
  const inviteColumns: ColumnDef<CanvasAgentInviteCode, unknown>[] = [
    {
      id: 'code',
      accessorKey: 'maskedCode',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Invite code')} />
      ),
      cell: ({ row }) => {
        const item = row.original
        const revealLabel = t(
          revealed[item.id] ? 'Hide invite code' : 'Show invite code'
        )
        return (
          <div className='flex w-full items-center gap-1'>
            <span className='min-w-0 flex-1 truncate font-mono'>
              {revealed[item.id] ?? item.maskedCode}
            </span>
            <CanvasCodeRevealButton
              label={revealLabel}
              revealed={Boolean(revealed[item.id])}
              disabled={reveal.isPending}
              onClick={() => {
                if (revealed[item.id]) {
                  setRevealed((current) => {
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
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Status')} />
      ),
      cell: ({ row }) => (
        <CanvasStatusBadge
          status={row.original.status}
          label={t(`Invite status ${row.original.status}`)}
        />
      ),
    },
    {
      id: 'capacity',
      accessorKey: 'maxRegistrations',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Used / Capacity')} />
      ),
      cell: ({ row }) =>
        `${row.original.consumedCount} / ${row.original.maxRegistrations}`,
    },
    {
      id: 'activatedCustomers',
      accessorKey: 'activatedCustomers',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t('Activated customers')}
        />
      ),
    },
    {
      id: 'expiresAt',
      accessorKey: 'expiresAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Expires')} />
      ),
      cell: ({ row }) => formatCanvasDateTime(row.original.expiresAt),
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Created At')} />
      ),
      cell: ({ row }) => formatCanvasDateTime(row.original.createdAt),
    },
    {
      id: 'action',
      enableSorting: false,
      header: t('Action'),
      cell: ({ row }) => (
        <div className='flex gap-1'>
          <Button
            size='sm'
            variant='outline'
            aria-label={t('Copy invite code')}
            onClick={() =>
              reveal.mutate({ id: row.original.id, action: 'COPY' })
            }
          >
            <Copy />
          </Button>
        </div>
      ),
    },
  ]
  const customerColumns: ColumnDef<CanvasAgentCustomer, unknown>[] = [
    {
      id: 'customer',
      accessorKey: 'username',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Username')} />
      ),
      cell: ({ row }) =>
        row.original.username ? (
          <CopyableText value={row.original.username} />
        ) : (
          '—'
        ),
    },
    {
      id: 'email',
      accessorKey: 'emailMasked',
      enableSorting: false,
      header: t('Email'),
      cell: ({ row }) => row.original.emailMasked ?? '—',
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Status')} />
      ),
      cell: ({ row }) => (
        <BusinessTerm kind='customerStatus' value={row.original.status} />
      ),
    },
    {
      id: 'activatedAt',
      accessorKey: 'activatedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Activated at')} />
      ),
      cell: ({ row }) => formatCanvasDateTime(row.original.activatedAt),
    },
  ]
  if (workspace.isPending) return <LoadingState />
  if (workspace.isError || invites.isError || customers.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void workspace.refetch()
          void invites.refetch()
          void customers.refetch()
        }}
      />
    )
  }
  const data = workspace.data
  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{data.profile.username}</CardTitle>
          <CardDescription>{t('Inviter')}</CardDescription>
        </CardHeader>
        <CardContent>
          <CanvasStatusBadge status='ACTIVE' label={t('Enabled')} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('My invite codes')}</CardTitle>
          <CardDescription>
            {t('Codes stay masked until an audited display or copy action.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CanvasServerTable
            data={invites.data?.items ?? []}
            columns={inviteColumns}
            total={invites.data?.total ?? 0}
            state={invitesState}
            searchLabel={t('Visible invite code prefix')}
            loading={invites.isPending || invites.isFetching}
            emptyTitle={t('No invite codes')}
            additionalFilters={
              <CanvasColumnFilterField label={t('Status')}>
                <Select
                  value={inviteStatus || 'ALL'}
                  onValueChange={(value) =>
                    setInviteStatus(value === 'ALL' ? '' : (value ?? ''))
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue>
                      {inviteStatus ? (
                        <CanvasStatusBadge
                          status={inviteStatus}
                          label={t(`Invite status ${inviteStatus}`)}
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
            }
            hasActiveFilters={Boolean(inviteStatus)}
            onResetFilters={() => setInviteStatus('')}
            getRowId={(row) => row.id}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('My customers')}</CardTitle>
          <CardDescription>
            {t('Customers activated through invite codes assigned to you.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CanvasServerTable
            data={customers.data?.items ?? []}
            columns={customerColumns}
            total={customers.data?.total ?? 0}
            state={customersState}
            searchLabel={t('Username')}
            loading={customers.isPending || customers.isFetching}
            emptyTitle={t('No customers')}
            additionalFilters={
              <>
                <CanvasColumnFilterField label={t('Email')}>
                  <Input
                    value={customerEmail}
                    placeholder={t('Email')}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                  />
                </CanvasColumnFilterField>
                <CanvasColumnFilterField label={t('Status')}>
                  <Select
                    value={customerStatus || 'ALL'}
                    onValueChange={(value) =>
                      setCustomerStatus(value === 'ALL' ? '' : (value ?? ''))
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue>
                        {customerStatus ? (
                          <BusinessTermText
                            kind='customerStatus'
                            value={customerStatus}
                          />
                        ) : (
                          t('All statuses')
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                      {['ACTIVE', 'SUSPENDED', 'CLOSED'].map((value) => (
                        <SelectItem key={value} value={value}>
                          <BusinessTerm kind='customerStatus' value={value} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CanvasColumnFilterField>
              </>
            }
            hasActiveFilters={Boolean(customerEmail || customerStatus)}
            onResetFilters={() => {
              setCustomerEmail('')
              setCustomerStatus('')
            }}
            getRowId={(row) => row.id}
          />
        </CardContent>
      </Card>
    </div>
  )
}

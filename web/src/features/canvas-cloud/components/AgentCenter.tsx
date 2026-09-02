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
import { Copy, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
import { BusinessTerm } from './BusinessTerm'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'

export function AgentCenter() {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const invitesState =
    useServerTableState<CanvasAgentInviteCodeQuery['sortBy']>('createdAt')
  const customersState =
    useServerTableState<CanvasAgentCustomerQuery['sortBy']>('activatedAt')
  const [inviteStatus, setInviteStatus] = useState('')
  const [customerStatus, setCustomerStatus] = useState('')
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
      customerStatus,
    ],
    queryFn: ({ signal }) =>
      getCanvasAgentCustomers(
        {
          ...customersState.query,
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
      cell: ({ row }) => (
        <span className='font-mono'>
          {revealed[row.original.id] ?? row.original.maskedCode}
        </span>
      ),
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Status')} />
      ),
      cell: ({ row }) => t(`Invite status ${row.original.status}`),
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
            aria-label={t(
              revealed[row.original.id]
                ? 'Hide invite code'
                : 'Show invite code'
            )}
            aria-pressed={Boolean(revealed[row.original.id])}
            onClick={() => {
              if (revealed[row.original.id]) {
                setRevealed((current) => {
                  const next = { ...current }
                  delete next[row.original.id]
                  return next
                })
                return
              }
              reveal.mutate({ id: row.original.id, action: 'DISPLAY' })
            }}
          >
            {revealed[row.original.id] ? <EyeOff /> : <Eye />}
          </Button>
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
        <DataTableColumnHeader column={column} title={t('Customer')} />
      ),
      cell: ({ row }) =>
        row.original.username ? (
          <CopyableText value={row.original.username} />
        ) : (
          '—'
        ),
    },
    {
      id: 'newApiUserId',
      accessorKey: 'newApiUserId',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('New API user ID')} />
      ),
      cell: ({ row }) => <CopyableText value={row.original.newApiUserId} />,
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
          <CardTitle>{data.profile.internalName}</CardTitle>
          <CardDescription>{t('Inviter')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant='secondary'>{t('Enabled')}</Badge>
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
            searchPlaceholder={t('Search invite codes')}
            searchLabel={t('Visible invite code prefix')}
            searchDescription={t(
              'Fuzzy matches only the visible invite code prefix.'
            )}
            loading={invites.isPending || invites.isFetching}
            emptyTitle={t('No invite codes')}
            additionalFilters={
              <Select
                value={inviteStatus || 'ALL'}
                onValueChange={(value) =>
                  setInviteStatus(value === 'ALL' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger className='w-44'>
                  <SelectValue>
                    {inviteStatus
                      ? t(`Invite status ${inviteStatus}`)
                      : t('All statuses')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                  {['DRAFT', 'ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED'].map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {t(`Invite status ${value}`)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
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
            searchPlaceholder={t('Search customers')}
            searchLabel={t('Customer name, email, or New API user ID')}
            searchDescription={t(
              'Fuzzy matches customer name, masked email, or New API user ID.'
            )}
            loading={customers.isPending || customers.isFetching}
            emptyTitle={t('No customers')}
            additionalFilters={
              <Select
                value={customerStatus || 'ALL'}
                onValueChange={(value) =>
                  setCustomerStatus(value === 'ALL' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger className='w-44'>
                  <SelectValue>
                    {customerStatus ? (
                      <BusinessTerm
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
            }
            hasActiveFilters={Boolean(customerStatus)}
            onResetFilters={() => setCustomerStatus('')}
            getRowId={(row) => row.id}
          />
        </CardContent>
      </Card>
    </div>
  )
}

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
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

import {
  getCanvasAgentInviteCodes,
  revealCanvasCode,
  searchCanvasAgentInviteCodes,
} from '../api'
import { copyText } from '../copy-text'
import { formatCanvasDateTime } from '../formatters'
import type {
  CanvasAgentInviteCode,
  CanvasAgentInviteCodeQuery,
  CanvasInviteCodeStatus,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasCodeRevealButton } from './CanvasCodeRevealButton'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CanvasStatusBadge } from './CanvasStatusBadge'

/** The agent's own invite codes, masked until an audited display or copy. */
export function AgentInviteCodes() {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [inviteCodeInput, setInviteCodeInput] = useState('')
  const inviteCodeRef = useRef('')
  const [inviteSearchVersion, setInviteSearchVersion] = useState(0)
  const invitesState =
    useServerTableState<CanvasAgentInviteCodeQuery['sortBy']>('createdAt')
  const [inviteStatus, setInviteStatus] = useState('')
  const [invitePriceGroupId, setInvitePriceGroupId] = useState('')
  const shortInviteCode =
    inviteCodeRef.current.length > 0 && inviteCodeRef.current.length < 4
  const invites = useQuery({
    queryKey: [
      'canvas-cloud',
      'agent-invite-codes',
      invitesState.query,
      inviteStatus,
      invitePriceGroupId,
      inviteSearchVersion,
    ],
    queryFn: ({ signal }) =>
      inviteCodeRef.current
        ? searchCanvasAgentInviteCodes(
            {
              code: inviteCodeRef.current,
              page: invitesState.query.page,
              pageSize: invitesState.query.pageSize,
              sortBy: invitesState.query.sortBy,
              sortOrder: invitesState.query.sortOrder,
              ...(inviteStatus
                ? { status: inviteStatus as CanvasInviteCodeStatus }
                : {}),
              ...(invitePriceGroupId
                ? { priceGroupId: invitePriceGroupId }
                : {}),
            },
            signal
          )
        : getCanvasAgentInviteCodes(
            {
              page: invitesState.query.page,
              pageSize: invitesState.query.pageSize,
              sortBy: invitesState.query.sortBy,
              sortOrder: invitesState.query.sortOrder,
              ...(inviteStatus
                ? { status: inviteStatus as CanvasInviteCodeStatus }
                : {}),
              ...(invitePriceGroupId
                ? { priceGroupId: invitePriceGroupId }
                : {}),
            },
            signal
          ),
    placeholderData: (previousData) => previousData,
    enabled: !shortInviteCode,
  })
  const reveal = useMutation({
    mutationFn: (input: { id: string; action: 'DISPLAY' | 'COPY' }) =>
      revealCanvasCode('agent-invite', input.id, input.action).then(
        (result) => ({ ...result, ...input })
      ),
    onSuccess: async (result) => {
      if (result.action === 'COPY') {
        await copyText(result.code, {
          copied: t('Invite code copied'),
          failed: t('Failed to copy to clipboard'),
        })
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
      meta: { label: t('Invite code') },
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
            <Button
              size='icon'
              variant='ghost'
              aria-label={t('Copy invite code')}
              disabled={reveal.isPending}
              onClick={() => reveal.mutate({ id: item.id, action: 'COPY' })}
            >
              <Copy className='size-4' />
            </Button>
          </div>
        )
      },
    },
    {
      id: 'status',
      accessorKey: 'status',
      meta: { label: t('Status') },
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
      meta: { label: t('Used / Capacity') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Used / Capacity')} />
      ),
      cell: ({ row }) =>
        `${row.original.consumedCount} / ${row.original.maxRegistrations}`,
    },
    {
      id: 'activatedCustomers',
      accessorKey: 'activatedCustomers',
      meta: { label: t('Activated customers') },
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
      meta: { label: t('Expires') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Expires')} />
      ),
      cell: ({ row }) => formatCanvasDateTime(row.original.expiresAt),
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      meta: { label: t('Created At') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Created At')} />
      ),
      cell: ({ row }) => formatCanvasDateTime(row.original.createdAt),
    },
  ]
  return (
    <Card>
      <CardContent>
        <CanvasServerTable
          data={shortInviteCode ? [] : (invites.data?.items ?? [])}
          columns={inviteColumns}
          total={shortInviteCode ? 0 : (invites.data?.total ?? 0)}
          state={invitesState}
          loading={
            (invites.isPending && !shortInviteCode) || invites.isFetching
          }
          error={invites.isError}
          onRetry={() => void invites.refetch()}
          emptyTitle={t('No invite codes')}
          additionalFilters={
            <>
              <DataTableColumnFilterField label={t('Exact invite code')}>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    inviteCodeRef.current = inviteCodeInput.trim().toUpperCase()
                    setInviteSearchVersion((value) => value + 1)
                    invitesState.setPagination((value) => ({
                      ...value,
                      pageIndex: 0,
                    }))
                  }}
                  className='flex gap-2'
                >
                  <Input
                    aria-label={t('Exact invite code')}
                    value={inviteCodeInput}
                    onChange={(event) => setInviteCodeInput(event.target.value)}
                    autoComplete='off'
                  />
                  <Button type='submit' size='sm'>
                    {t('Search')}
                  </Button>
                </form>
              </DataTableColumnFilterField>
              <DataTableColumnFilterField label={t('Status')}>
                <Select
                  value={inviteStatus || 'ALL'}
                  onValueChange={(value) => {
                    setInviteStatus(value === 'ALL' ? '' : (value ?? ''))
                    invitesState.setPagination((page) => ({
                      ...page,
                      pageIndex: 0,
                    }))
                  }}
                >
                  <SelectTrigger className='w-full'>
                    <CanvasLocalizedSelectValue
                      value={inviteStatus}
                      emptyLabelKey='All statuses'
                      displayValue={
                        <CanvasStatusBadge
                          status={inviteStatus}
                          label={t(`Invite status ${inviteStatus}`)}
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
              <DataTableColumnFilterField label={t('Price plan')}>
                <Select
                  value={invitePriceGroupId || 'ALL'}
                  onValueChange={(value) => {
                    setInvitePriceGroupId(value === 'ALL' ? '' : (value ?? ''))
                    invitesState.setPagination((page) => ({
                      ...page,
                      pageIndex: 0,
                    }))
                  }}
                >
                  <SelectTrigger
                    className='w-full'
                    aria-label={t('Price plan')}
                  >
                    <CanvasLocalizedSelectValue
                      value={invitePriceGroupId}
                      emptyLabelKey='All price plans'
                      displayValue={
                        invites.data?.filters.priceGroups.find(
                          (group) => group.id === invitePriceGroupId
                        )?.name
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>{t('All price plans')}</SelectItem>
                    {invites.data?.filters.priceGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DataTableColumnFilterField>
            </>
          }
          hasActiveFilters={Boolean(
            inviteStatus || invitePriceGroupId || inviteCodeRef.current
          )}
          onResetFilters={() => {
            setInviteStatus('')
            setInvitePriceGroupId('')
            setInviteCodeInput('')
            inviteCodeRef.current = ''
            setInviteSearchVersion((value) => value + 1)
          }}
          getRowId={(row) => row.id}
        />
      </CardContent>
    </Card>
  )
}

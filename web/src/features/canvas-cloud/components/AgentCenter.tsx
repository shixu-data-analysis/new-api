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
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader, DataTableRow } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
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
} from '@/components/ui/select'
import { TableCell, TableRow } from '@/components/ui/table'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'

import {
  getCanvasAgentCustomers,
  getCanvasAgentInviteCodes,
  getCanvasAgentModelPrices,
  getCanvasAgentCustomerModelUsage,
  getCanvasAgentWorkspace,
  revealCanvasCode,
  searchCanvasAgentInviteCodes,
} from '../api'
import { formatCanvasDateTime } from '../formatters'
import { formatExactRmbReference } from '../point-conversion-types'
import { pricingScopeLabel } from '../pricing-scope-label'
import type {
  CanvasAgentCustomer,
  CanvasAgentCustomerQuery,
  CanvasAgentInviteCode,
  CanvasAgentInviteCodeQuery,
  CanvasAgentModelUsageRow,
  CanvasBillingUnit,
  CanvasInviteCodeStatus,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { AgentModelPriceList } from './AgentModelPriceList'
import { BusinessTerm } from './BusinessTerm'
import { CanvasCodeRevealButton } from './CanvasCodeRevealButton'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { CanvasStatusBadge } from './CanvasStatusBadge'
import { CopyableText } from './CopyableText'

const billingUnitKeys: Record<CanvasBillingUnit, string> = {
  REQUEST: 'Per request',
  SECOND: 'Per second',
  MILLION_TOKENS: 'Per million tokens',
}

function UsageAmount({
  value,
  incomplete,
}: {
  value: string | null
  incomplete: boolean
}) {
  const { t, i18n } = useTranslation()
  return (
    <span>
      {value === null
        ? '—'
        : `¥${formatExactRmbReference(value, toIntlLocale(i18n.language))}`}
      {incomplete ? (
        <span className='ml-1 text-amber-700'>({t('Amount incomplete')})</span>
      ) : null}
    </span>
  )
}

function PriceSnapshot({
  value,
  status,
}: {
  value:
    | string
    | Partial<Record<'input' | 'output' | 'cacheRead' | 'cacheWrite', string>>
    | null
  status: CanvasAgentModelUsageRow['agentPriceSnapshotStatus']
}) {
  const { t, i18n } = useTranslation()
  if (status === 'VARIES') {
    return <span>{t('Multiple historical prices')}</span>
  }
  if (value === null) {
    return <span>—</span>
  }
  if (typeof value === 'string') {
    return (
      <span>{`¥${formatExactRmbReference(value, toIntlLocale(i18n.language))}`}</span>
    )
  }
  const labels = {
    input: 'Input',
    output: 'Output',
    cacheRead: 'Cache read',
    cacheWrite: 'Cache write',
  } as const
  return (
    <span>
      {Object.entries(value)
        .map(
          ([category, amount]) =>
            `${t(labels[category as keyof typeof labels])}: ¥${formatExactRmbReference(amount, toIntlLocale(i18n.language))}`
        )
        .join(' · ')}
    </span>
  )
}

function ModelUsage({ customerId }: { customerId: string }) {
  const { t } = useTranslation()
  const state = useServerTableState<'priceGroupName'>('priceGroupName')
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'agent-customer-model-usage',
      customerId,
      state.query.page,
      state.query.pageSize,
    ],
    queryFn: ({ signal }) =>
      getCanvasAgentCustomerModelUsage(
        customerId,
        {
          page: state.query.page,
          pageSize: state.query.pageSize,
        },
        signal
      ),
  })
  const columns: ColumnDef<CanvasAgentModelUsageRow, unknown>[] = [
    {
      id: 'priceGroupName',
      accessorKey: 'priceGroupName',
      header: t('Task-time price group'),
    },
    {
      id: 'modelName',
      accessorKey: 'modelName',
      header: t('Model / specification'),
      cell: ({ row }) => (
        <span>
          {row.original.modelName} /{' '}
          {pricingScopeLabel(
            {
              key: row.original.combinationKey,
              parameters: row.original.parameters,
            },
            t
          )}
        </span>
      ),
    },
    {
      id: 'billingUnit',
      accessorKey: 'billingUnit',
      header: t('Billing unit'),
      cell: ({ row }) => t(billingUnitKeys[row.original.billingUnit]),
    },
    {
      id: 'usage',
      header: t('Usage'),
      cell: ({ row }) => {
        const usage = row.original.usage
        if (row.original.billingUnit === 'MILLION_TOKENS') {
          return (
            <span>
              {t('Input')}: {usage.inputTokens ?? '—'}; {t('Output')}:{' '}
              {usage.outputTokens ?? '—'}; {t('Cache read')}:{' '}
              {usage.cacheReadTokens ?? '—'}; {t('Cache write')}:{' '}
              {usage.cacheWriteTokens ?? '—'}
            </span>
          )
        }
        if (row.original.billingUnit === 'SECOND') return usage.seconds
        return usage.requests
      },
    },
    {
      id: 'successfulTasks',
      accessorKey: 'successfulTasks',
      header: t('Successful tasks'),
    },
    {
      id: 'settledPoints',
      accessorKey: 'settledPoints',
      header: t('Consumed points'),
    },
    {
      id: 'agentPriceSnapshot',
      header: t('Model price snapshot'),
      cell: ({ row }) => (
        <PriceSnapshot
          value={row.original.agentPriceSnapshot}
          status={row.original.agentPriceSnapshotStatus}
        />
      ),
    },
    {
      id: 'modelUsageAmount',
      header: t('Model usage amount'),
      cell: ({ row }) => (
        <UsageAmount
          value={row.original.modelUsageAmount}
          incomplete={row.original.amountIncomplete}
        />
      ),
    },
  ]
  return (
    <CanvasServerTable
      data={query.data?.items ?? []}
      columns={columns}
      total={query.data?.total ?? 0}
      state={state}
      loading={query.isPending || query.isFetching}
      error={query.isError}
      onRetry={() => void query.refetch()}
      emptyTitle={t('No model usage')}
      getRowId={(row) =>
        `${row.priceGroupId}:${row.modelKey}:${row.combinationKey}:${row.billingUnit}`
      }
    />
  )
}

export function AgentCenter() {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [inviteCodeInput, setInviteCodeInput] = useState('')
  const inviteCodeRef = useRef('')
  const [inviteSearchVersion, setInviteSearchVersion] = useState(0)
  const [expandedCustomerId, setExpandedCustomerId] = useState<string>()
  const [pricesOpen, setPricesOpen] = useState(true)
  const [priceCapability, setPriceCapability] = useState('')
  const [priceTag, setPriceTag] = useState('')
  const [priceSearch, setPriceSearch] = useState('')
  const [pricePage, setPricePage] = useState(1)
  const debouncedPriceSearch = useDebounce(priceSearch.trim(), 300)
  const invitesState =
    useServerTableState<CanvasAgentInviteCodeQuery['sortBy']>('createdAt')
  const customersState =
    useServerTableState<CanvasAgentCustomerQuery['sortBy']>('activatedAt')
  const setCustomersPagination = customersState.setPagination
  const [inviteStatus, setInviteStatus] = useState('')
  const [invitePriceGroupId, setInvitePriceGroupId] = useState('')
  const [customerStatus, setCustomerStatus] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const debouncedCustomerEmail = useDebounce(customerEmail.trim(), 300)
  useEffect(() => {
    setCustomersPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [customerStatus, debouncedCustomerEmail, setCustomersPagination])
  useEffect(
    () => setPricePage(1),
    [priceCapability, priceTag, debouncedPriceSearch]
  )
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'agent-workspace'],
    queryFn: getCanvasAgentWorkspace,
  })
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
  const prices = useQuery({
    queryKey: [
      'canvas-cloud',
      'agent-model-prices',
      priceCapability,
      priceTag,
      debouncedPriceSearch,
      pricePage,
    ],
    queryFn: ({ signal }) =>
      getCanvasAgentModelPrices(
        {
          page: pricePage,
          pageSize: 10,
          ...(priceCapability ? { capability: priceCapability } : {}),
          ...(priceTag ? { tagId: priceTag } : {}),
          ...(debouncedPriceSearch ? { search: debouncedPriceSearch } : {}),
        },
        signal
      ),
    enabled: pricesOpen,
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
    {
      id: 'currentPriceGroup',
      header: t('Current price group'),
      cell: ({ row }) => row.original.currentPriceGroup?.name ?? '—',
    },
    {
      id: 'successfulTasks',
      accessorKey: 'successfulTasks',
      header: t('Successful tasks'),
    },
    {
      id: 'settledPoints',
      accessorKey: 'settledPoints',
      header: t('Consumed points'),
    },
    {
      id: 'modelUsageAmount',
      header: t('Model usage amount'),
      cell: ({ row }) => (
        <UsageAmount
          value={row.original.modelUsageAmount}
          incomplete={row.original.amountIncomplete}
        />
      ),
    },
    {
      id: 'usageAction',
      header: t('Action'),
      cell: ({ row }) => (
        <Button
          size='sm'
          variant='outline'
          aria-expanded={expandedCustomerId === row.original.id}
          onClick={() =>
            setExpandedCustomerId(
              expandedCustomerId === row.original.id
                ? undefined
                : row.original.id
            )
          }
        >
          {t('Model usage')}
        </Button>
      ),
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
  let pricesContent: ReactNode = null
  if (prices.isError) {
    pricesContent = <ErrorState onRetry={() => void prices.refetch()} />
  } else if (prices.isPending) {
    pricesContent = <LoadingState />
  } else {
    pricesContent = <AgentModelPriceList models={prices.data.items} />
  }
  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('My invite codes')}</CardTitle>
          <CardDescription>
            {t('Codes stay masked until an audited display or copy action.')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CanvasServerTable
            data={shortInviteCode ? [] : (invites.data?.items ?? [])}
            columns={inviteColumns}
            total={shortInviteCode ? 0 : (invites.data?.total ?? 0)}
            state={invitesState}
            loading={
              (invites.isPending && !shortInviteCode) || invites.isFetching
            }
            emptyTitle={t('No invite codes')}
            additionalFilters={
              <>
                <DataTableColumnFilterField label={t('Exact invite code')}>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      inviteCodeRef.current = inviteCodeInput
                        .trim()
                        .toUpperCase()
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
                      onChange={(event) =>
                        setInviteCodeInput(event.target.value)
                      }
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
                      setInvitePriceGroupId(
                        value === 'ALL' ? '' : (value ?? '')
                      )
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
                      <SelectItem value='ALL'>
                        {t('All price plans')}
                      </SelectItem>
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
      <Card>
        <CardHeader>
          <CardTitle>{t('Cumulative overview')}</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
          <div>
            <p className='text-muted-foreground text-sm'>
              {t('Activated customers')}
            </p>
            <strong>{data.summary.activatedCustomers}</strong>
          </div>
          <div>
            <p className='text-muted-foreground text-sm'>
              {t('Customers with successful tasks')}
            </p>
            <strong>{data.summary.customersWithSuccessfulTasks}</strong>
          </div>
          <div>
            <p className='text-muted-foreground text-sm'>
              {t('Successful tasks')}
            </p>
            <strong>{data.summary.successfulTasks}</strong>
          </div>
          <div>
            <p className='text-muted-foreground text-sm'>
              {t('Model usage amount')}
            </p>
            <strong>
              <UsageAmount
                value={data.summary.modelUsageAmount}
                incomplete={data.summary.amountIncomplete}
              />
            </strong>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('Price group summary')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-2'>
          {data.priceGroups.length === 0 ? (
            <p>{t('No price groups')}</p>
          ) : (
            data.priceGroups.map((group) => (
              <div
                key={group.priceGroupId}
                className='grid gap-2 rounded border p-3 text-sm sm:grid-cols-4'
              >
                <strong>{group.priceGroupName}</strong>
                <span>
                  {t('Successful tasks')}: {group.successfulTasks}
                </span>
                <span>
                  {t('Consumed points')}: {group.settledPoints}
                </span>
                <span>
                  {t('Model usage amount')}:{' '}
                  <UsageAmount
                    value={group.modelUsageAmount}
                    incomplete={group.amountIncomplete}
                  />
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <div>
            <CardTitle>{t('Current model prices')}</CardTitle>
            <CardDescription>
              {t('Prices for the price groups of your current customers.')}
            </CardDescription>
          </div>
          <Button
            type='button'
            variant='outline'
            aria-expanded={pricesOpen}
            onClick={() => setPricesOpen(!pricesOpen)}
          >
            {pricesOpen ? t('Collapse') : t('Expand')}
          </Button>
        </CardHeader>
        {pricesOpen ? (
          <CardContent className='space-y-3'>
            <div className='flex flex-wrap gap-2'>
              <Input
                className='w-56'
                value={priceSearch}
                onChange={(event) => setPriceSearch(event.target.value)}
                placeholder={t('Model name')}
                aria-label={t('Model name')}
              />
              <Select
                value={priceCapability || 'ALL'}
                onValueChange={(value) =>
                  setPriceCapability(value === 'ALL' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger
                  className='w-48'
                  aria-label={t('Generation type')}
                >
                  <CanvasLocalizedSelectValue
                    value={priceCapability}
                    emptyLabelKey='All types'
                    displayValue={
                      priceCapability ? t(priceCapability) : undefined
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All types')}</SelectItem>
                  {prices.data?.filters.capabilities.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={priceTag || 'ALL'}
                onValueChange={(value) =>
                  setPriceTag(value === 'ALL' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger className='w-48' aria-label={t('Tag')}>
                  <CanvasLocalizedSelectValue
                    value={priceTag}
                    emptyLabelKey='All tags'
                    displayValue={
                      prices.data?.filters.tags.find(
                        (tag) => tag.id === priceTag
                      )?.name
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All tags')}</SelectItem>
                  {prices.data?.filters.tags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {pricesContent}
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={pricePage <= 1}
                onClick={() => setPricePage((value) => value - 1)}
              >
                {t('Previous')}
              </Button>
              <span>
                {pricePage} /{' '}
                {Math.max(1, Math.ceil((prices.data?.total ?? 0) / 10))}
              </span>
              <Button
                variant='outline'
                size='sm'
                disabled={pricePage * 10 >= (prices.data?.total ?? 0)}
                onClick={() => setPricePage((value) => value + 1)}
              >
                {t('Next')}
              </Button>
            </div>
          </CardContent>
        ) : null}
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
                <DataTableColumnFilterField label={t('Email')}>
                  <Input
                    value={customerEmail}
                    placeholder={t('Email')}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                  />
                </DataTableColumnFilterField>
                <DataTableColumnFilterField label={t('Status')}>
                  <Select
                    value={customerStatus || 'ALL'}
                    onValueChange={(value) =>
                      setCustomerStatus(value === 'ALL' ? '' : (value ?? ''))
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <CanvasLocalizedSelectValue
                        value={customerStatus}
                        emptyLabelKey='All statuses'
                        termKind='customerStatus'
                      />
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
                </DataTableColumnFilterField>
              </>
            }
            hasActiveFilters={Boolean(customerEmail || customerStatus)}
            onResetFilters={() => {
              setCustomerEmail('')
              setCustomerStatus('')
            }}
            getRowId={(row) => row.id}
            renderRow={(row) => (
              <Fragment key={row.id}>
                <DataTableRow
                  row={row}
                  cellRenderColumns={customerColumns}
                  aria-expanded={expandedCustomerId === row.original.id}
                />
                {expandedCustomerId === row.original.id ? (
                  <TableRow>
                    <TableCell
                      colSpan={row.getVisibleCells().length}
                      className='bg-muted/20 p-4'
                    >
                      <ModelUsage customerId={row.original.id} />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            )}
            renderExpandedContent={(row) =>
              expandedCustomerId === row.original.id ? (
                <ModelUsage customerId={row.original.id} />
              ) : null
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}

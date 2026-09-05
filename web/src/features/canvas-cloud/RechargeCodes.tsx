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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, Download, Eye, EyeOff, Plus, RefreshCw } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks'

import {
  getCanvasAdminRechargeCodes,
  issueCanvasAdminRechargeCodes,
  revealCanvasCode,
} from './api'
import { getCanvasCampaigns } from './campaign-api'
import { BusinessTerm, BusinessTermText } from './components/BusinessTerm'
import { CanvasColumnFilterField } from './components/CanvasColumnFilterPanel'
import { CanvasServerTable } from './components/CanvasServerTable'
import { cnyToMinor } from './recharge-code-amount'
import type {
  CanvasAdminRechargeCode,
  CanvasAdminRechargeCodeQuery,
  CanvasIssuedRechargeCodes,
} from './types'
import { useServerTableState } from './use-server-table-state'

function formatCny(value: string): string {
  const minor = BigInt(value)
  return `¥${minor / 100n}.${(minor % 100n).toString().padStart(2, '0')}`
}

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'
}

function dateBoundary(value: string, nextDay = false): string | undefined {
  if (!value) return undefined
  const date = new Date(`${value}T00:00:00`)
  if (nextDay) date.setDate(date.getDate() + 1)
  return date.toISOString()
}

export function CanvasRechargeCodes(props: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('10')
  const [count, setCount] = useState('1')
  const [promotionVersionId, setPromotionVersionId] = useState('')
  const campaigns = useQuery({
    queryKey: ['canvas-cloud', 'recharge-campaign-options'],
    queryFn: ({ signal }) =>
      getCanvasCampaigns(
        {
          page: 1,
          pageSize: 100,
          status: 'ACTIVE',
          kind: 'RECHARGE_BONUS',
          sortBy: 'createdAt',
          sortOrder: 'desc',
        },
        signal
      ),
  })
  const selectedCampaign = campaigns.data?.items.find(
    (item) => item.id === promotionVersionId
  )
  const [issued, setIssued] = useState<CanvasIssuedRechargeCodes | null>(null)
  const [codesVisible, setCodesVisible] = useState(false)
  const [revealedCodes, setRevealedCodes] = useState<Record<string, string>>({})
  const tableState =
    useServerTableState<CanvasAdminRechargeCodeQuery['sortBy']>('createdAt')
  const [status, setStatus] = useState<'' | CanvasAdminRechargeCode['status']>(
    ''
  )
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [code, setCode] = useState('')
  const debouncedCode = useDebounce(code.trim(), 300)
  const inventoryQuery: CanvasAdminRechargeCodeQuery = {
    page: tableState.query.page,
    pageSize: tableState.query.pageSize,
    sortBy: tableState.query.sortBy,
    sortOrder: tableState.query.sortOrder,
    ...(tableState.query.search ? { name: tableState.query.search } : {}),
    ...(debouncedCode ? { code: debouncedCode } : {}),
    ...(status ? { status } : {}),
    ...(dateBoundary(createdFrom)
      ? { createdFrom: dateBoundary(createdFrom) }
      : {}),
    ...(dateBoundary(createdTo, true)
      ? { createdTo: dateBoundary(createdTo, true) }
      : {}),
  }
  const inventory = useQuery({
    queryKey: ['canvas-cloud', 'admin-recharge-codes', inventoryQuery],
    queryFn: ({ signal }) =>
      getCanvasAdminRechargeCodes(inventoryQuery, signal),
    placeholderData: (previous) => previous,
  })
  const issue = useMutation({
    mutationFn: issueCanvasAdminRechargeCodes,
    onSuccess: async (result) => {
      setCodesVisible(false)
      setIssued(result)
      toast.success(t('Canvas recharge codes created'))
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-recharge-codes'],
      })
    },
  })
  const reveal = useMutation({
    mutationFn: (input: { id: string; action: 'DISPLAY' | 'COPY' }) =>
      revealCanvasCode('admin-recharge', input.id, input.action).then(
        (result) => ({ ...result, ...input })
      ),
    onSuccess: async (result) => {
      if (result.action === 'COPY') {
        await navigator.clipboard.writeText(result.code)
        toast.success(t('Recharge code copied'))
        return
      }
      setRevealedCodes((current) => ({ ...current, [result.id]: result.code }))
    },
    onError: () => toast.error(t('Recharge code could not be revealed')),
  })
  const amountMinor = cnyToMinor(amount)
  const parsedCount = Number(count)
  const validCount =
    Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= 100
  const canSubmit =
    name.trim().length >= 1 &&
    name.trim().length <= 20 &&
    amountMinor !== null &&
    validCount &&
    (!promotionVersionId ||
      selectedCampaign?.draft?.rechargeAmountMinor === amountMinor) &&
    !issue.isPending

  const copyCodes = async () => {
    if (!issued?.codes.length) return
    await navigator.clipboard.writeText(
      issued.codes.map((item) => item.code).join('\n')
    )
    toast.success(t('Recharge codes copied'))
  }

  const downloadCodes = () => {
    if (!issued?.codes.length) return
    const blob = new Blob(
      [`${issued.codes.map((item) => item.code).join('\n')}\n`],
      { type: 'text/plain;charset=utf-8' }
    )
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `canvas-recharge-codes-${new Date()
      .toISOString()
      .slice(0, 10)}.txt`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast.success(t('Recharge codes downloaded'))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (amountMinor === null || !validCount) {
      return
    }
    if (
      promotionVersionId &&
      (!selectedCampaign?.draft ||
        selectedCampaign.draft.rechargeAmountMinor !== amountMinor)
    ) {
      return
    }
    issue.mutate({
      name: name.trim(),
      amountMinor,
      count: parsedCount,
      ...(promotionVersionId ? { promotionVersionId } : {}),
    })
  }

  const columns: ColumnDef<CanvasAdminRechargeCode, unknown>[] = [
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Name')} />
      ),
    },
    {
      id: 'code',
      accessorKey: 'maskedCode',
      enableSorting: false,
      header: t('Code'),
      cell: ({ row }) => (
        <span className='font-mono'>
          {revealedCodes[row.original.id] ?? row.original.maskedCode}
        </span>
      ),
    },
    {
      id: 'status',
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Status')} />
      ),
      cell: ({ row }) => (
        <BusinessTerm kind='rechargeCodeStatus' value={row.original.status} />
      ),
    },
    {
      id: 'amount',
      accessorKey: 'amountMinor',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Amount')} />
      ),
      cell: ({ row }) => formatCny(row.original.amountMinor),
    },
    {
      id: 'points',
      accessorKey: 'points',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Points')} />
      ),
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {row.original.points} {t('Paid points')} + {row.original.bonusPoints}{' '}
          {t('Bonus points')}
        </span>
      ),
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Created')} />
      ),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: 'expiresAt',
      accessorKey: 'expiresAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Expires')} />
      ),
      cell: ({ row }) => formatDate(row.original.expiresAt),
    },
    {
      id: 'redeemedAt',
      accessorKey: 'redeemedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Redeemed')} />
      ),
      cell: ({ row }) => formatDate(row.original.redeemedAt),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: t('Actions'),
      cell: ({ row }) =>
        row.original.status === 'ACTIVE' ? (
          <div className='flex gap-1'>
            <Button
              size='sm'
              variant='outline'
              aria-label={t(
                revealedCodes[row.original.id]
                  ? 'Hide recharge code'
                  : 'Show recharge code'
              )}
              aria-pressed={Boolean(revealedCodes[row.original.id])}
              disabled={reveal.isPending}
              onClick={() => {
                if (revealedCodes[row.original.id]) {
                  setRevealedCodes((current) => {
                    const next = { ...current }
                    delete next[row.original.id]
                    return next
                  })
                  return
                }
                reveal.mutate({ id: row.original.id, action: 'DISPLAY' })
              }}
            >
              {revealedCodes[row.original.id] ? <EyeOff /> : <Eye />}
            </Button>
            <Button
              size='sm'
              variant='outline'
              aria-label={t('Copy recharge code')}
              disabled={reveal.isPending}
              onClick={() =>
                reveal.mutate({ id: row.original.id, action: 'COPY' })
              }
            >
              <Copy />
            </Button>
          </div>
        ) : (
          '—'
        ),
    },
  ]

  const resetPage = () =>
    tableState.setPagination((value) => ({ ...value, pageIndex: 0 }))

  const renderInventory = () => {
    if (inventory.isError) {
      return <ErrorState onRetry={() => void inventory.refetch()} />
    }
    const hasFilters = Boolean(
      tableState.search.trim() || code || status || createdFrom || createdTo
    )
    return (
      <CanvasServerTable
        data={inventory.data?.items ?? []}
        columns={columns}
        total={inventory.data?.total ?? 0}
        state={tableState}
        searchLabel={t('Name')}
        loading={inventory.isPending || inventory.isFetching}
        emptyTitle={
          hasFilters
            ? t('No matching recharge codes')
            : t('No Canvas recharge codes')
        }
        additionalFilters={
          <>
            <CanvasColumnFilterField label={t('Code')}>
              <Input
                value={code}
                placeholder={t('Code')}
                onChange={(event) => {
                  setCode(event.target.value)
                  resetPage()
                }}
              />
            </CanvasColumnFilterField>
            <CanvasColumnFilterField label={t('Status')}>
              <Select
                value={status || 'ALL'}
                onValueChange={(value) => {
                  setStatus(
                    value === 'ALL'
                      ? ''
                      : ((value ?? '') as CanvasAdminRechargeCode['status'])
                  )
                  resetPage()
                }}
              >
                <SelectTrigger
                  id='canvas-code-status'
                  className='w-full'
                  aria-label={t('Status')}
                >
                  <SelectValue>
                    {status ? (
                      <BusinessTermText
                        kind='rechargeCodeStatus'
                        value={status}
                      />
                    ) : (
                      t('All statuses')
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>{t('All statuses')}</SelectItem>
                  {['ACTIVE', 'REDEEMED', 'EXPIRED', 'VOID'].map((value) => (
                    <SelectItem key={value} value={value}>
                      <BusinessTerm kind='rechargeCodeStatus' value={value} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CanvasColumnFilterField>
            <CanvasColumnFilterField label={t('Created from')}>
              <Input
                id='canvas-code-created-from'
                className='w-full'
                type='date'
                aria-label={t('Created from')}
                value={createdFrom}
                onChange={(event) => {
                  setCreatedFrom(event.target.value)
                  resetPage()
                }}
              />
            </CanvasColumnFilterField>
            <CanvasColumnFilterField label={t('Created to')}>
              <Input
                id='canvas-code-created-to'
                className='w-full'
                type='date'
                aria-label={t('Created to')}
                value={createdTo}
                onChange={(event) => {
                  setCreatedTo(event.target.value)
                  resetPage()
                }}
              />
            </CanvasColumnFilterField>
          </>
        }
        hasActiveFilters={Boolean(code || status || createdFrom || createdTo)}
        onResetFilters={() => {
          setStatus('')
          setCode('')
          setCreatedFrom('')
          setCreatedTo('')
        }}
        getRowId={(row) => row.id}
      />
    )
  }

  const content = (
    <div className='space-y-4'>
      <Card size='sm'>
        <CardHeader>
          <CardTitle>{t('Create Canvas recharge codes')}</CardTitle>
          <CardDescription>
            {t(
              'Create one-time CNY codes for the configured store. Customers redeem these exact codes on the Canvas recharge page.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            aria-label={t('Create Canvas recharge codes')}
            className='max-w-6xl'
            onSubmit={submit}
          >
            <fieldset className='grid items-start gap-4 md:grid-cols-2 lg:grid-cols-[minmax(16rem,2fr)_minmax(15rem,1.6fr)_8rem_auto]'>
              <legend className='sr-only'>
                {t('Create Canvas recharge codes')}
              </legend>
              <div className='space-y-1.5 md:col-span-2 lg:col-span-4'>
                <Label htmlFor='canvas-code-campaign'>
                  {t('Recharge bonus campaign')}
                </Label>
                <select
                  id='canvas-code-campaign'
                  className='border-input bg-background h-9 w-full rounded-lg border px-3 text-sm'
                  value={promotionVersionId}
                  onChange={(event) => {
                    const id = event.target.value
                    setPromotionVersionId(id)
                    const minor = campaigns.data?.items.find(
                      (item) => item.id === id
                    )?.draft?.rechargeAmountMinor
                    if (minor) {
                      setAmount(
                        `${BigInt(minor) / 100n}.${(BigInt(minor) % 100n).toString().padStart(2, '0')}`
                      )
                    }
                  }}
                >
                  <option value=''>{t('No campaign')}</option>
                  {campaigns.data?.items
                    .filter((item) => item.draft)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · v{item.version} ·{' '}
                        {item.draft?.bonusPoints} {t('Bonus points')}
                      </option>
                    ))}
                </select>
                {promotionVersionId &&
                  selectedCampaign?.draft?.rechargeAmountMinor !==
                    amountMinor && (
                    <p role='alert' className='text-destructive text-sm'>
                      {t('Recharge amount must match the selected campaign')}
                    </p>
                  )}
                {campaigns.isError ? (
                  <p role='alert' className='text-destructive text-sm'>
                    {t('Unable to load recharge bonus campaigns')}
                  </p>
                ) : null}
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='canvas-code-name'>{t('Name')}</Label>
                <Input
                  id='canvas-code-name'
                  maxLength={20}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('Enter recharge code name')}
                />
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='canvas-code-amount'>{t('Amount (CNY)')}</Label>
                <Input
                  id='canvas-code-amount'
                  aria-describedby='canvas-code-amount-help'
                  inputMode='decimal'
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <p
                  id='canvas-code-amount-help'
                  className='text-muted-foreground text-xs'
                >
                  {t(
                    'The currently published point issuance rate is used; the amount must produce whole points.'
                  )}
                </p>
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='canvas-code-count'>{t('Quantity')}</Label>
                <Input
                  id='canvas-code-count'
                  inputMode='numeric'
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                />
              </div>
              <div className='flex md:col-span-2 md:justify-end lg:col-span-1 lg:pt-6'>
                <Button
                  className='w-full sm:w-auto'
                  disabled={!canSubmit}
                  type='submit'
                >
                  <Plus />
                  {t('Create codes')}
                </Button>
              </div>
            </fieldset>
          </form>
        </CardContent>
      </Card>

      {issued?.created && issued.codes.length > 0 && (
        <Card className='border-amber-500/50'>
          <CardHeader>
            <CardTitle>{t('Copy these codes now')}</CardTitle>
            <CardDescription>
              {t(
                'Plaintext codes are shown only once and are not stored. Save them before leaving this page.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <pre
              aria-label={t(
                codesVisible
                  ? 'Visible recharge codes'
                  : 'Hidden recharge codes'
              )}
              className='bg-muted max-h-72 overflow-auto rounded-lg p-3 font-mono text-sm'
            >
              {issued.codes
                .map((item) =>
                  codesVisible ? item.code : '•••• •••• •••• ••••'
                )
                .join('\n')}
            </pre>
            <div className='flex flex-wrap gap-2'>
              <Button
                aria-pressed={codesVisible}
                variant='outline'
                onClick={() => setCodesVisible((visible) => !visible)}
              >
                {codesVisible ? <EyeOff /> : <Eye />}
                {t(codesVisible ? 'Hide codes' : 'Show codes')}
              </Button>
              <Button variant='outline' onClick={() => void copyCodes()}>
                <Copy />
                {t('Copy all codes')}
              </Button>
              <Button variant='outline' onClick={downloadCodes}>
                <Download />
                {t('Download TXT')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card size='sm'>
        <CardHeader>
          <CardTitle>{t('Canvas recharge code inventory')}</CardTitle>
          <CardDescription>
            {t(
              'External shop payments are not recorded until a future shop integration is implemented.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>{renderInventory()}</CardContent>
      </Card>
    </div>
  )

  if (props.embedded) return content

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Canvas Recharge Codes')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          size='sm'
          onClick={() => void inventory.refetch()}
        >
          <RefreshCw />
          {t('Refresh')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>{content}</SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

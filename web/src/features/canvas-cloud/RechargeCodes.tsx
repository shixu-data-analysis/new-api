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
import {
  Copy,
  Download,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
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
import { Label } from '@/components/ui/label'

import {
  getCanvasAdminRechargeCodes,
  issueCanvasAdminRechargeCodes,
} from './api'
import { BusinessTerm } from './components/BusinessTerm'
import { cnyToMinor } from './recharge-code-amount'
import type {
  CanvasAdminRechargeCode,
  CanvasAdminRechargeCodeQuery,
  CanvasIssuedRechargeCodes,
} from './types'

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

export function CanvasRechargeCodes() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('10')
  const [count, setCount] = useState('1')
  const [issued, setIssued] = useState<CanvasIssuedRechargeCodes | null>(null)
  const [codesVisible, setCodesVisible] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | CanvasAdminRechargeCode['status']>(
    ''
  )
  const [createdFrom, setCreatedFrom] = useState('')
  const [createdTo, setCreatedTo] = useState('')
  const [sortBy, setSortBy] =
    useState<CanvasAdminRechargeCodeQuery['sortBy']>('createdAt')
  const [sortOrder, setSortOrder] =
    useState<CanvasAdminRechargeCodeQuery['sortOrder']>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20)
  const inventoryQuery: CanvasAdminRechargeCodeQuery = {
    page,
    pageSize,
    sortBy,
    sortOrder,
    ...(search.trim() ? { search: search.trim() } : {}),
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
    queryFn: () => getCanvasAdminRechargeCodes(inventoryQuery),
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
  const amountMinor = cnyToMinor(amount)
  const parsedCount = Number(count)
  const validCount =
    Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= 100
  const canSubmit =
    name.trim().length >= 1 &&
    name.trim().length <= 20 &&
    amountMinor !== null &&
    validCount &&
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
    if (amountMinor === null || !validCount) return
    issue.mutate({ name: name.trim(), amountMinor, count: parsedCount })
  }

  const renderInventory = () => {
    if (inventory.isPending) return <LoadingState />
    if (inventory.isError) {
      return <ErrorState onRetry={() => void inventory.refetch()} />
    }
    if (inventory.data.items.length === 0) {
      const hasFilters = Boolean(
        search.trim() || status || createdFrom || createdTo
      )
      return (
        <EmptyState
          title={
            hasFilters
              ? t('No matching recharge codes')
              : t('No Canvas recharge codes')
          }
          bordered
        />
      )
    }
    const totalPages = Math.max(
      1,
      Math.ceil(inventory.data.total / inventory.data.pageSize)
    )
    const firstItem = (inventory.data.page - 1) * inventory.data.pageSize + 1
    const lastItem = Math.min(
      inventory.data.page * inventory.data.pageSize,
      inventory.data.total
    )
    return (
      <div className='space-y-3'>
        <div className='overflow-x-auto rounded-xl border'>
          <table className='w-full min-w-[760px] text-left text-sm'>
            <thead className='bg-muted/60 text-muted-foreground'>
              <tr>
                {[
                  t('Name'),
                  t('Code'),
                  t('Status'),
                  t('Amount'),
                  t('Points'),
                  t('Created'),
                  t('Expires'),
                  t('Redeemed'),
                ].map((header) => (
                  <th key={header} className='px-3 py-2 font-medium'>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className='divide-y'>
              {inventory.data.items.map((item) => (
                <tr key={item.id} className='hover:bg-muted/30'>
                  <td className='px-3 py-2'>{item.name}</td>
                  <td className='px-3 py-2 font-mono'>{item.maskedCode}</td>
                  <td className='px-3 py-2'>
                    <BusinessTerm
                      kind='rechargeCodeStatus'
                      value={item.status}
                    />
                  </td>
                  <td className='px-3 py-2'>{formatCny(item.amountMinor)}</td>
                  <td className='px-3 py-2'>{item.points}</td>
                  <td className='px-3 py-2'>{formatDate(item.createdAt)}</td>
                  <td className='px-3 py-2'>{formatDate(item.expiresAt)}</td>
                  <td className='px-3 py-2'>{formatDate(item.redeemedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <p className='text-muted-foreground text-sm'>
            {t('{{from}}–{{to}} of {{total}}', {
              from: firstItem,
              to: lastItem,
              total: inventory.data.total,
            })}
          </p>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {t('Previous')}
            </Button>
            <span className='min-w-20 text-center text-sm'>
              {t('Page {{page}} of {{total}}', {
                page: inventory.data.page,
                total: totalPages,
              })}
            </span>
            <Button
              variant='outline'
              size='sm'
              disabled={page >= totalPages}
              onClick={() =>
                setPage((current) => Math.min(totalPages, current + 1))
              }
            >
              {t('Next')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

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
      <SectionPageLayout.Content>
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
                    <Label htmlFor='canvas-code-amount'>
                      {t('Amount (CNY)')}
                    </Label>
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
                        '1 CNY equals 50 Canvas Points; the amount must produce whole points.'
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
            <CardContent className='space-y-4'>
              <div className='bg-muted/20 space-y-3 rounded-lg border p-3'>
                <div className='grid items-start gap-3 md:grid-cols-2 xl:grid-cols-[minmax(20rem,2fr)_minmax(10rem,1fr)_minmax(10rem,1fr)]'>
                  <div className='space-y-1.5 md:col-span-2 xl:col-span-1'>
                    <Label htmlFor='canvas-code-search'>
                      {t('Search recharge codes')}
                    </Label>
                    <div className='relative'>
                      <Search
                        aria-hidden='true'
                        className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2'
                      />
                      <Input
                        id='canvas-code-search'
                        aria-describedby='canvas-code-search-help'
                        className='pl-9'
                        value={search}
                        onChange={(event) => {
                          setSearch(event.target.value)
                          setPage(1)
                        }}
                        placeholder={t('Search by name or full code')}
                      />
                    </div>
                    <p
                      id='canvas-code-search-help'
                      className='text-muted-foreground text-xs'
                    >
                      {t(
                        'Paste a customer-provided full code to match its safely retained prefix and suffix.'
                      )}
                    </p>
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='canvas-code-status'>{t('Status')}</Label>
                    <select
                      id='canvas-code-status'
                      className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
                      value={status}
                      onChange={(event) => {
                        setStatus(
                          event.target.value as
                            | ''
                            | CanvasAdminRechargeCode['status']
                        )
                        setPage(1)
                      }}
                    >
                      <option value=''>{t('All statuses')}</option>
                      <option value='ACTIVE'>{t('Active')}</option>
                      <option value='REDEEMED'>{t('Redeemed')}</option>
                      <option value='EXPIRED'>{t('Expired')}</option>
                      <option value='VOID'>{t('Voided')}</option>
                    </select>
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='canvas-code-page-size'>
                      {t('Page size')}
                    </Label>
                    <select
                      id='canvas-code-page-size'
                      className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
                      value={pageSize}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value) as 20 | 50 | 100)
                        setPage(1)
                      }}
                    >
                      {[20, 50, 100].map((size) => (
                        <option key={size} value={size}>
                          {t('{{count}} per page', { count: size })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className='grid items-start gap-3 md:grid-cols-2 xl:grid-cols-4'>
                  <div className='space-y-1.5'>
                    <Label htmlFor='canvas-code-created-from'>
                      {t('Created from')}
                    </Label>
                    <Input
                      id='canvas-code-created-from'
                      type='date'
                      value={createdFrom}
                      onChange={(event) => {
                        setCreatedFrom(event.target.value)
                        setPage(1)
                      }}
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='canvas-code-created-to'>
                      {t('Created to')}
                    </Label>
                    <Input
                      id='canvas-code-created-to'
                      type='date'
                      value={createdTo}
                      onChange={(event) => {
                        setCreatedTo(event.target.value)
                        setPage(1)
                      }}
                    />
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='canvas-code-sort-by'>{t('Sort by')}</Label>
                    <select
                      id='canvas-code-sort-by'
                      className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
                      value={sortBy}
                      onChange={(event) => {
                        setSortBy(
                          event.target
                            .value as CanvasAdminRechargeCodeQuery['sortBy']
                        )
                        setPage(1)
                      }}
                    >
                      <option value='createdAt'>{t('Created')}</option>
                      <option value='expiresAt'>{t('Expires')}</option>
                      <option value='redeemedAt'>{t('Redeemed')}</option>
                      <option value='name'>{t('Name')}</option>
                      <option value='status'>{t('Status')}</option>
                      <option value='amount'>{t('Amount')}</option>
                      <option value='points'>{t('Points')}</option>
                    </select>
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='canvas-code-sort-order'>
                      {t('Sort order')}
                    </Label>
                    <select
                      id='canvas-code-sort-order'
                      className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
                      value={sortOrder}
                      onChange={(event) => {
                        setSortOrder(
                          event.target
                            .value as CanvasAdminRechargeCodeQuery['sortOrder']
                        )
                        setPage(1)
                      }}
                    >
                      <option value='desc'>{t('Descending')}</option>
                      <option value='asc'>{t('Ascending')}</option>
                    </select>
                  </div>
                </div>
              </div>
              {renderInventory()}
            </CardContent>
          </Card>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

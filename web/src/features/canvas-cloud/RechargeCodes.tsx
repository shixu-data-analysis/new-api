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
import { Copy, Download, Eye, EyeOff, Plus, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useController, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
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
} from '@/components/ui/select'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasBindableBonusActivities } from './activity-api'
import {
  getCanvasAdminRechargeCodes,
  issueCanvasAdminRechargeCodes,
  revealCanvasCode,
} from './api'
import { BusinessTerm } from './components/BusinessTerm'
import { CanvasDateRangeFilter } from './components/CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './components/CanvasLocalizedSelectValue'
import { CanvasServerTable } from './components/CanvasServerTable'
import { isCanvasDateRangeValid } from './date-range'
import {
  cnyToMinor,
  normalizeRechargeCodeInventorySearch,
} from './recharge-code-amount'
import type {
  CanvasAdminRechargeCode,
  CanvasAdminRechargeCodeQuery,
  CanvasIssuedRechargeCodes,
} from './types'
import { useServerTableState } from './use-server-table-state'

function formatCny(value: string, language: string): string {
  return new Intl.NumberFormat(toIntlLocale(language), {
    style: 'currency',
    currency: 'CNY',
  }).format(Number(BigInt(value)) / 100)
}

function formatDate(value: string | null, language: string): string {
  return value
    ? new Intl.DateTimeFormat(toIntlLocale(language), {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'
}

function rechargeFailure(error: unknown): {
  code: string | null
  field: string | null
} {
  if (!error || typeof error !== 'object') return { code: null, field: null }
  const data = (error as { response?: { data?: unknown } }).response?.data
  if (!data || typeof data !== 'object') return { code: null, field: null }
  const code = (data as { code?: unknown }).code
  const details = (data as { details?: unknown }).details
  const field =
    details && typeof details === 'object'
      ? (details as { field?: unknown }).field
      : null
  return {
    code: typeof code === 'string' ? code : null,
    field: typeof field === 'string' ? field : null,
  }
}

export function CanvasRechargeCodes(props: { embedded?: boolean } = {}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const issueForm = useForm<{
    name: string
    amount: string
    count: string
    promotionVersionId: string
  }>({
    mode: 'onTouched',
    resolver: zodResolver(
      z.object({
        name: z.string().trim().min(1, t('Enter recharge code name')).max(20),
        amount: z.string().refine((value) => cnyToMinor(value) !== null, {
          message: t('Enter a valid recharge amount'),
        }),
        count: z
          .string()
          .regex(/^([1-9]|[1-9]\d|100)$/, t('Enter a quantity from 1 to 100')),
        promotionVersionId: z.string(),
      })
    ),
    defaultValues: {
      name: '',
      amount: '10',
      count: '1',
      promotionVersionId: '',
    },
  })
  const { name, amount, count } = issueForm.watch()
  const [selectedPromotionVersionId, setSelectedPromotionVersionId] =
    useState('')
  const promotionVersionId = selectedPromotionVersionId
  const promotionField = useController({
    control: issueForm.control,
    name: 'promotionVersionId',
  }).field
  const campaigns = useQuery({
    queryKey: ['canvas-cloud', 'recharge-campaign-options'],
    queryFn: ({ signal }) =>
      getCanvasBindableBonusActivities('RECHARGE_BONUS', signal),
  })
  const selectedCampaign = campaigns.data?.find(
    (item) => item.id === promotionVersionId
  )
  const [issued, setIssued] = useState<CanvasIssuedRechargeCodes | null>(null)
  const [issueError, setIssueError] = useState<string | null>(null)
  const [issueIdempotencyKey, setIssueIdempotencyKey] = useState('')
  const [codesVisible, setCodesVisible] = useState(false)
  const [revealedCodes, setRevealedCodes] = useState<Record<string, string>>({})
  useEffect(() => {
    setIssueError(null)
  }, [name, amount, count, promotionVersionId])
  const tableState =
    useServerTableState<CanvasAdminRechargeCodeQuery['sortBy']>('createdAt')
  const [status, setStatus] = useState<'' | CanvasAdminRechargeCode['status']>(
    ''
  )
  const [createdFrom, setCreatedFrom] = useState<Date>()
  const [createdTo, setCreatedTo] = useState<Date>()
  const [code, setCode] = useState('')
  const debouncedCode = useDebounce(code.trim(), 300)
  const normalizedCode = normalizeRechargeCodeInventorySearch(debouncedCode)
  const createdRangeValid = isCanvasDateRangeValid(createdFrom, createdTo)
  const codeSearchError =
    debouncedCode && !normalizedCode
      ? t('Enter a complete recharge code')
      : null
  const inventoryQuery: CanvasAdminRechargeCodeQuery = {
    page: tableState.query.page,
    pageSize: tableState.query.pageSize,
    sortBy: tableState.query.sortBy,
    sortOrder: tableState.query.sortOrder,
    ...(tableState.query.search ? { name: tableState.query.search } : {}),
    ...(normalizedCode ? { code: normalizedCode } : {}),
    ...(status ? { status } : {}),
    ...(createdFrom ? { createdFrom: createdFrom.toISOString() } : {}),
    ...(createdTo ? { createdTo: createdTo.toISOString() } : {}),
  }
  const inventory = useQuery({
    queryKey: ['canvas-cloud', 'admin-recharge-codes', inventoryQuery],
    queryFn: ({ signal }) =>
      getCanvasAdminRechargeCodes(inventoryQuery, signal),
    enabled: (!debouncedCode || Boolean(normalizedCode)) && createdRangeValid,
    placeholderData: (previous) => previous,
  })
  const issue = useMutation({
    mutationFn: issueCanvasAdminRechargeCodes,
    onSuccess: async (result) => {
      try {
        setIssueError(null)
        setCodesVisible(false)
        if (result.created) {
          setIssued(result)
          toast.success(t('Canvas recharge codes created'))
        } else {
          setIssued(null)
          toast.success(t('Recharge code request was already completed'))
        }
        setIssueIdempotencyKey('')
        await queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'admin-recharge-codes'],
        })
      } catch {
        toast.error(t('Recharge codes were created, but could not be revealed'))
      }
    },
    onError: (error) => {
      const failure = rechargeFailure(error)
      let field: 'name' | 'amount' | 'count' | 'promotionVersionId' | null =
        null
      if (failure.field === 'amountMinor') {
        field = 'amount'
      } else if (failure.field === 'name' || failure.field === 'count') {
        field = failure.field
      } else if (failure.field === 'promotionVersionId') {
        field = failure.field
      } else if (
        failure.code === 'PROMOTION_GATE_CLOSED' &&
        promotionVersionId
      ) {
        field = 'promotionVersionId'
      }
      let message = t('Recharge codes could not be created')
      if (failure.code === 'INVALID_RECHARGE_NAME') {
        message = t('Enter recharge code name')
      } else if (failure.code === 'INVALID_RECHARGE_COUNT') {
        message = t('Enter a quantity from 1 to 100')
      } else if (failure.code === 'AMOUNT_NOT_REDEEMABLE') {
        message = t('Enter a valid recharge amount')
      } else if (
        failure.code === 'PROMOTION_UNAVAILABLE' ||
        failure.code === 'PROMOTION_CHANGED' ||
        failure.code === 'PROMOTION_GATE_CLOSED'
      ) {
        message = t('The selected bonus campaign is no longer available.')
      } else if (failure.code === 'UNAUTHORIZED') {
        message = t(
          'Your administrator session is no longer authorized. Refresh the page and sign in again.'
        )
      }
      if (field) issueForm.setError(field, { type: 'server', message })
      setIssueError(message)
      toast.error(t('Recharge codes could not be created'), {
        description: message,
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

  const submit = issueForm.handleSubmit(() => {
    if (amountMinor === null || !validCount) return
    const idempotencyKey =
      issueIdempotencyKey || `web-issue-code-${crypto.randomUUID()}`
    setIssueIdempotencyKey(idempotencyKey)
    issue.mutate({
      name: name.trim(),
      amountMinor,
      count: parsedCount,
      idempotencyKey,
      ...(promotionVersionId ? { promotionVersionId } : {}),
    })
  })

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
      header: t('Recharge code'),
      cell: ({ row }) => {
        const item = row.original
        const visible = revealedCodes[item.id]
        return (
          <div className='flex min-w-0 items-start gap-1'>
            <span className='min-w-0 font-mono break-all'>
              {visible ?? item.maskedCode}
            </span>
            {item.status === 'ACTIVE' ? (
              <>
                <Button
                  aria-label={t(
                    visible ? 'Hide recharge code' : 'Show recharge code'
                  )}
                  aria-pressed={Boolean(visible)}
                  disabled={reveal.isPending}
                  size='icon-sm'
                  title={t(
                    visible ? 'Hide recharge code' : 'Show recharge code'
                  )}
                  type='button'
                  variant='ghost'
                  onClick={() => {
                    if (visible) {
                      setRevealedCodes((current) => {
                        const next = { ...current }
                        delete next[item.id]
                        return next
                      })
                      return
                    }
                    reveal.mutate({ id: item.id, action: 'DISPLAY' })
                  }}
                >
                  {visible ? (
                    <EyeOff aria-hidden='true' />
                  ) : (
                    <Eye aria-hidden='true' />
                  )}
                </Button>
                <Button
                  aria-label={t('Copy recharge code')}
                  disabled={reveal.isPending}
                  size='icon-sm'
                  title={t('Copy recharge code')}
                  type='button'
                  variant='ghost'
                  onClick={() => reveal.mutate({ id: item.id, action: 'COPY' })}
                >
                  <Copy aria-hidden='true' />
                </Button>
              </>
            ) : null}
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
        <BusinessTerm kind='rechargeCodeStatus' value={row.original.status} />
      ),
    },
    {
      id: 'amount',
      accessorKey: 'amountMinor',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Amount')} />
      ),
      cell: ({ row }) =>
        formatCny(
          row.original.amountMinor,
          i18n.resolvedLanguage ?? i18n.language
        ),
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
        <DataTableColumnHeader column={column} title={t('Created time')} />
      ),
      cell: ({ row }) =>
        formatDate(
          row.original.createdAt,
          i18n.resolvedLanguage ?? i18n.language
        ),
    },
    {
      id: 'expiresAt',
      accessorKey: 'expiresAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Expiry time')} />
      ),
      cell: ({ row }) =>
        formatDate(
          row.original.expiresAt,
          i18n.resolvedLanguage ?? i18n.language
        ),
    },
    {
      id: 'redeemedAt',
      accessorKey: 'redeemedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Redeemed at')} />
      ),
      cell: ({ row }) =>
        formatDate(
          row.original.redeemedAt,
          i18n.resolvedLanguage ?? i18n.language
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
        searchPlaceholder={t('Enter recharge code name')}
        loading={inventory.isPending || inventory.isFetching}
        emptyTitle={
          hasFilters
            ? t('No matching recharge codes')
            : t('No Canvas recharge codes')
        }
        additionalFilters={
          <>
            <DataTableColumnFilterField label={t('Recharge code')}>
              <Input
                id='canvas-code-filter'
                aria-label={t('Recharge code')}
                value={code}
                placeholder={t('Enter a complete recharge code')}
                aria-describedby={
                  codeSearchError ? 'canvas-code-search-error' : undefined
                }
                aria-invalid={Boolean(codeSearchError)}
                onChange={(event) => {
                  setCode(event.target.value)
                  resetPage()
                }}
              />
              {codeSearchError ? (
                <p
                  id='canvas-code-search-error'
                  role='alert'
                  className='text-destructive text-sm'
                >
                  {codeSearchError}
                </p>
              ) : null}
            </DataTableColumnFilterField>
            <DataTableColumnFilterField label={t('Status')}>
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
                  <CanvasLocalizedSelectValue
                    value={status}
                    emptyLabelKey='All statuses'
                    termKind='rechargeCodeStatus'
                  />
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
            </DataTableColumnFilterField>
            <DataTableColumnFilterField label={t('Creation time')}>
              <CanvasDateRangeFilter
                from={createdFrom}
                to={createdTo}
                onFromChange={(value) => {
                  setCreatedFrom(value)
                  resetPage()
                }}
                onToChange={(value) => {
                  setCreatedTo(value)
                  resetPage()
                }}
              />
            </DataTableColumnFilterField>
          </>
        }
        hasActiveFilters={Boolean(code || status || createdFrom || createdTo)}
        onResetFilters={() => {
          setStatus('')
          setCode('')
          setCreatedFrom(undefined)
          setCreatedTo(undefined)
        }}
        getRowId={(row) => row.id}
      />
    )
  }

  const content = (
    <div className='space-y-4'>
      <FormNavigationGuard when={Boolean(issued?.codes.length)} />
      <Card size='sm'>
        <CardHeader>
          <CardTitle>{t('Create recharge codes')}</CardTitle>
          <CardDescription>
            {t(
              'Create one-time CNY codes for the configured store. Customers redeem these exact codes on the Canvas recharge page.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            aria-label={t('Create recharge codes')}
            className='max-w-6xl'
            onSubmit={submit}
          >
            {issueError ? (
              <p role='alert' className='text-destructive mb-3 text-sm'>
                {issueError}
              </p>
            ) : null}
            <fieldset className='grid items-start gap-4 md:grid-cols-2 lg:grid-cols-[minmax(16rem,2fr)_minmax(15rem,1.6fr)_8rem_auto]'>
              <legend className='sr-only'>{t('Create recharge codes')}</legend>
              <div className='space-y-1.5 md:col-span-2 lg:col-span-4'>
                <Label htmlFor='canvas-code-campaign'>
                  {t('Recharge bonus campaign')}
                  <span aria-hidden='true'> ({t('Optional')})</span>
                </Label>
                <select
                  id='canvas-code-campaign'
                  aria-label={t('Recharge bonus campaign')}
                  className='border-input bg-background min-h-10 w-full rounded-lg border px-3 py-2 text-sm whitespace-normal'
                  {...promotionField}
                  value={promotionVersionId}
                  onChange={(event) => {
                    setSelectedPromotionVersionId(event.target.value)
                    promotionField.onChange(event)
                  }}
                >
                  <option value=''>{t('No campaign')}</option>
                  {campaigns.data?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · v{item.version} · {item.points}{' '}
                      {t('Bonus points')} · {item.ttlDays} {t('days')}
                    </option>
                  ))}
                </select>
                {issueForm.formState.errors.promotionVersionId ? (
                  <p role='alert' className='text-destructive text-sm'>
                    {issueForm.formState.errors.promotionVersionId.message}
                  </p>
                ) : null}
                {selectedCampaign ? (
                  <p className='text-muted-foreground text-sm'>
                    {t(
                      'Bonus per code: {{points}} points · Valid for {{days}} days after redemption',
                      {
                        points: selectedCampaign.points,
                        days: selectedCampaign.ttlDays,
                      }
                    )}
                  </p>
                ) : null}
                {campaigns.isError ? (
                  <p role='alert' className='text-destructive text-sm'>
                    {t('Unable to load recharge bonus campaigns')}
                  </p>
                ) : null}
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='canvas-code-name'>
                  {t('Name')}
                  <span aria-hidden='true'> *</span>
                </Label>
                <Input
                  id='canvas-code-name'
                  aria-label={t('Name')}
                  maxLength={20}
                  aria-invalid={Boolean(issueForm.formState.errors.name)}
                  aria-describedby={
                    issueForm.formState.errors.name
                      ? 'canvas-code-name-error'
                      : undefined
                  }
                  {...issueForm.register('name')}
                  placeholder={t('Enter recharge code name')}
                />
                {issueForm.formState.errors.name ? (
                  <p
                    id='canvas-code-name-error'
                    role='alert'
                    className='text-destructive text-sm'
                  >
                    {issueForm.formState.errors.name.message}
                  </p>
                ) : null}
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='canvas-code-amount'>
                  {t('Amount (CNY)')}
                  <span aria-hidden='true'> *</span>
                </Label>
                <Input
                  id='canvas-code-amount'
                  aria-label={t('Amount (CNY)')}
                  aria-describedby='canvas-code-amount-help'
                  inputMode='decimal'
                  aria-invalid={Boolean(issueForm.formState.errors.amount)}
                  {...issueForm.register('amount')}
                />
                <p
                  id='canvas-code-amount-help'
                  className='text-muted-foreground text-xs'
                >
                  {t(
                    'The currently published point issuance rate is used; the amount must produce whole points.'
                  )}
                </p>
                {issueForm.formState.errors.amount ? (
                  <p role='alert' className='text-destructive text-sm'>
                    {issueForm.formState.errors.amount.message}
                  </p>
                ) : null}
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='canvas-code-count'>
                  {t('Quantity')}
                  <span aria-hidden='true'> *</span>
                </Label>
                <Input
                  id='canvas-code-count'
                  aria-label={t('Quantity')}
                  inputMode='numeric'
                  aria-invalid={Boolean(issueForm.formState.errors.count)}
                  {...issueForm.register('count')}
                />
                {issueForm.formState.errors.count ? (
                  <p role='alert' className='text-destructive text-sm'>
                    {issueForm.formState.errors.count.message}
                  </p>
                ) : null}
              </div>
              <div className='flex md:col-span-2 md:justify-end lg:col-span-1 lg:pt-6'>
                <Button
                  className='w-full sm:w-auto'
                  disabled={issue.isPending || Boolean(issued?.codes.length)}
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

      {issued?.codes.length ? (
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
            <p className='text-sm font-medium'>{t('Full recharge codes')}</p>
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
                aria-label={t(
                  codesVisible
                    ? 'Hide all recharge codes'
                    : 'Show all recharge codes'
                )}
                aria-pressed={codesVisible}
                size='icon-sm'
                title={t(
                  codesVisible
                    ? 'Hide all recharge codes'
                    : 'Show all recharge codes'
                )}
                type='button'
                variant='outline'
                onClick={() => setCodesVisible((visible) => !visible)}
              >
                {codesVisible ? <EyeOff /> : <Eye />}
              </Button>
              <Button
                aria-label={t('Copy all recharge codes')}
                size='icon-sm'
                title={t('Copy all recharge codes')}
                type='button'
                variant='outline'
                onClick={() => void copyCodes()}
              >
                <Copy />
              </Button>
              <Button variant='outline' onClick={downloadCodes}>
                <Download />
                {t('Download TXT')}
              </Button>
              <Button variant='ghost' onClick={() => setIssued(null)}>
                {t('I have saved these codes')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card size='sm'>
        <CardHeader>
          <CardTitle>{t('Recharge code inventory')}</CardTitle>
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
    <SectionPageLayout fluid={false}>
      <SectionPageLayout.Title>{t('Recharge codes')}</SectionPageLayout.Title>
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

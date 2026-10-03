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
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { BellRing, Clock3, ExternalLink, Info, Pencil } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { DateTimePicker } from '@/components/datetime-picker'
import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

import { getCanvasBusinessTerm } from '../business-terms'
import {
  addProviderBalanceRecord,
  getProviderBalanceRecords,
  getProviderBalances,
  providerBalanceAlertsQueryKey,
  setProviderAlertThreshold,
  setProviderDefaultAlertThreshold,
  setProviderWebsite,
} from '../operating-dashboard-api'
import { toMinute } from '../operating-dashboard-format'
import type {
  ProviderBalanceRecord,
  ProviderBalanceRow,
} from '../operating-dashboard-types'
import { useDashboardFormatters } from '../use-dashboard-formatters'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTerm } from './BusinessTerm'
import { CanvasServerTable } from './CanvasServerTable'
import {
  type DashboardDrawerRequest,
  OperatingDashboardDrawers,
} from './OperatingDashboardDrawers'

const ALL = '__all__'
const amountPattern = /^(0|[1-9]\d{0,15})(?:\.\d{1,4})?$/u
const NOTE_LIMIT = 1_000

function fieldOf(error: unknown): string | undefined {
  return (error as { response?: { data?: { details?: { field?: string } } } })
    .response?.data?.details?.field
}

function isNegative(value: string | null) {
  return value !== null && value.startsWith('-') && Number(value) !== 0
}

/** Balance rows, records and the alert badges all change with a balance record, a threshold or a website. */
async function refreshBalances(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'provider-balances'],
    }),
    queryClient.invalidateQueries({ queryKey: providerBalanceAlertsQueryKey }),
  ])
}

/** The cost drawer reads at most 366 days, so an older last balance starts the drawer one year before `asOf`. */
function sinceLastBalance(lastBalanceAt: string, asOf: string) {
  const earliest = new Date(asOf).getTime() - 365 * 86_400_000
  return new Date(
    Math.max(new Date(lastBalanceAt).getTime(), earliest)
  ).toISOString()
}

function ThresholdDialog(props: {
  provider?: ProviderBalanceRow
  defaultThresholdRmb: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const format = useDashboardFormatters()
  const id = useId()
  const isDefault = !props.provider
  // Stored thresholds carry four decimals; the field shows them without trailing zeros (500.0000 -> 500).
  const [value, setValue] = useState(
    (
      (isDefault
        ? props.defaultThresholdRmb
        : props.provider?.alertThresholdRmb) ?? ''
    )
      .replace(/(\.\d*?)0+$/u, '$1')
      .replace(/\.$/u, '')
  )
  const [tried, setTried] = useState(false)
  const [failure, setFailure] = useState(false)
  const trimmed = value.trim()
  const valid = trimmed === '' || amountPattern.test(trimmed)
  const save = useMutation({
    mutationFn: async () => {
      const threshold = trimmed === '' ? null : trimmed
      if (isDefault) {
        await setProviderDefaultAlertThreshold(threshold)
        return
      }
      await setProviderAlertThreshold(
        props.provider?.providerId ?? '',
        threshold
      )
    },
    onSuccess: async () => {
      await refreshBalances(queryClient)
      toast.success(
        t(isDefault ? 'Default alert threshold saved' : 'Alert threshold saved')
      )
      props.onClose()
    },
    onError: (error) => {
      if (fieldOf(error) === 'thresholdRmb') {
        setTried(true)
        return
      }
      setFailure(true)
    },
  })
  const defaultLabel =
    props.defaultThresholdRmb === null
      ? t('Not set')
      : format.rmb(props.defaultThresholdRmb)
  let placeholder: string = t('Not set')
  if (!isDefault && props.defaultThresholdRmb !== null) {
    placeholder = t('Default {{amount}}', { amount: defaultLabel })
  }
  const showError = tried && !valid
  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isDefault
              ? t('Default alert threshold')
              : t('Set alert · {{name}}', { name: props.provider?.name })}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t(
              'The estimate below this amount marks the API provider on the operating dashboard.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            setTried(true)
            setFailure(false)
            if (!valid) return
            save.mutate()
          }}
        >
          <div className='space-y-1'>
            <Label htmlFor={`${id}-threshold`}>
              {t(
                isDefault
                  ? 'Default alert threshold (RMB)'
                  : 'Alert threshold (RMB)'
              )}
            </Label>
            <Input
              id={`${id}-threshold`}
              inputMode='decimal'
              value={value}
              placeholder={placeholder}
              aria-invalid={showError}
              aria-describedby={
                showError ? `${id}-threshold-error` : `${id}-threshold-state`
              }
              onBlur={() => setTried(true)}
              onChange={(event) => setValue(event.target.value)}
            />
            {!isDefault ? (
              <div
                id={`${id}-threshold-state`}
                className='text-muted-foreground text-xs'
              >
                {trimmed === '' ? (
                  t('Uses the default threshold {{amount}}', {
                    amount: defaultLabel,
                  })
                ) : (
                  <Button
                    type='button'
                    variant='link'
                    className='h-auto p-0 text-xs'
                    onClick={() => setValue('')}
                  >
                    {t('Restore default')}
                  </Button>
                )}
              </div>
            ) : null}
            {showError ? (
              <p
                id={`${id}-threshold-error`}
                className='text-destructive text-xs'
                role='alert'
              >
                {t(
                  'Enter an amount of at least 0 with at most 4 decimal places.'
                )}
              </p>
            ) : null}
          </div>
          {failure ? (
            <p className='text-destructive text-sm' role='alert'>
              {t('Unable to save. Please try again later.')}
            </p>
          ) : null}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={props.onClose}>
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={save.isPending}>
              {t(save.isPending ? 'Saving…' : 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Estimate line: last balance + later top-ups - later call cost = current estimate. */
function EstimateLine({ row }: { row: ProviderBalanceRow }) {
  const { t } = useTranslation()
  const format = useDashboardFormatters()
  const { lastBalanceRmb, topUpsAfterRmb, costAfterRmb, estimatedBalanceRmb } =
    row
  if (
    estimatedBalanceRmb === null ||
    lastBalanceRmb === null ||
    topUpsAfterRmb === null ||
    costAfterRmb === null
  ) {
    return <p className='text-sm'>{t('Not recorded')}</p>
  }
  return (
    <p className='text-sm tabular-nums'>
      {t('Last back-office balance')} {format.rmb(lastBalanceRmb)} ＋{' '}
      {t('Later top-ups')} {format.rmb(topUpsAfterRmb)} －{' '}
      {t('Later call cost')} {format.rmb(costAfterRmb)} ＝{' '}
      {t('Current estimated balance')}{' '}
      <span
        className={`font-semibold ${row.belowAlertThreshold || isNegative(estimatedBalanceRmb) ? 'text-destructive' : ''}`}
      >
        {format.rmb(estimatedBalanceRmb)}
      </span>
    </p>
  )
}

function AddRecordDialog(props: {
  provider: ProviderBalanceRow
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const id = useId()
  const firstRecord = props.provider.lastBalanceAt === null
  const [recordType, setRecordType] = useState<'BALANCE' | 'TOP_UP'>('BALANCE')
  const [amount, setAmount] = useState('')
  const [recordedAt, setRecordedAt] = useState<Date | undefined>(() =>
    toMinute(new Date())
  )
  const [note, setNote] = useState('')
  const [tried, setTried] = useState<Record<string, boolean>>({})
  const [serverField, setServerField] = useState<string>()
  const [failure, setFailure] = useState(false)
  const amountValid =
    amountPattern.test(amount.trim()) &&
    (recordType === 'BALANCE' || Number(amount) > 0)
  let timeError: string | undefined
  if (!recordedAt) timeError = 'Enter a time.'
  else if (recordedAt.getTime() > Date.now()) {
    timeError = 'Time must not be later than now.'
  }
  const save = useMutation({
    mutationFn: (at: Date) =>
      addProviderBalanceRecord(props.provider.providerId, {
        recordType,
        amountRmb: amount.trim(),
        recordedAt: toMinute(at).toISOString(),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: async () => {
      await refreshBalances(queryClient)
      toast.success(t('Record added'))
      props.onClose()
    },
    onError: (error) => {
      const field = fieldOf(error)
      if (field) {
        setServerField(field)
        return
      }
      setFailure(true)
    },
  })
  const showAmountError =
    (tried.amount && !amountValid) || serverField === 'amountRmb'
  const showTimeError =
    (tried.recordedAt && timeError) || serverField === 'recordedAt'
  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <div className='flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pe-8'>
            <DialogTitle>
              {t('Add record · {{name}}', { name: props.provider.name })}
            </DialogTitle>
            {props.provider.websiteUrl ? (
              <a
                href={props.provider.websiteUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
              >
                <ExternalLink className='size-4' aria-hidden='true' />
                {t('Open website')}
              </a>
            ) : null}
          </div>
          <DialogDescription className='sr-only'>
            {t(
              'Record a back-office balance or a top-up of this API provider.'
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            setTried({ amount: true, recordedAt: true })
            setServerField(undefined)
            setFailure(false)
            if (
              !amountValid ||
              timeError ||
              !recordedAt ||
              note.trim().length > NOTE_LIMIT
            ) {
              return
            }
            save.mutate(recordedAt)
          }}
        >
          <div className='space-y-1'>
            <Label htmlFor={`${id}-type`}>{t('Type')}</Label>
            <Select
              value={recordType}
              onValueChange={(value) =>
                setRecordType(value as 'BALANCE' | 'TOP_UP')
              }
            >
              <SelectTrigger
                id={`${id}-type`}
                className='w-full'
                aria-describedby={firstRecord ? `${id}-type-help` : undefined}
              >
                <SelectValue>
                  {(value: string) =>
                    t(value === 'TOP_UP' ? 'Top-up' : 'Back-office balance')
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='BALANCE'>
                  {t('Back-office balance')}
                </SelectItem>
                <SelectItem value='TOP_UP' disabled={firstRecord}>
                  {t('Top-up')}
                </SelectItem>
              </SelectContent>
            </Select>
            {firstRecord ? (
              <p
                id={`${id}-type-help`}
                className='text-muted-foreground text-xs'
              >
                {t('The first record must be a back-office balance.')}
              </p>
            ) : null}
            {serverField === 'recordType' ? (
              <p className='text-destructive text-xs' role='alert'>
                {t('The first record must be a back-office balance.')}
              </p>
            ) : null}
          </div>
          <div className='space-y-1'>
            <Label htmlFor={`${id}-amount`}>{t('Amount (RMB)')}</Label>
            <Input
              id={`${id}-amount`}
              inputMode='decimal'
              value={amount}
              aria-invalid={Boolean(showAmountError)}
              aria-describedby={
                showAmountError ? `${id}-amount-error` : undefined
              }
              onBlur={() => setTried((value) => ({ ...value, amount: true }))}
              onChange={(event) => setAmount(event.target.value)}
            />
            {showAmountError ? (
              <p
                id={`${id}-amount-error`}
                className='text-destructive text-xs'
                role='alert'
              >
                {t(
                  'Enter a valid amount with at most 4 decimal places; a top-up must be greater than 0.'
                )}
              </p>
            ) : null}
          </div>
          <div className='space-y-1'>
            <Label>{t('Time')}</Label>
            <DateTimePicker
              value={recordedAt}
              onChange={(value) => {
                setRecordedAt(value)
                setTried((current) => ({ ...current, recordedAt: true }))
              }}
            />
            {showTimeError ? (
              <p className='text-destructive text-xs' role='alert'>
                {t(timeError ?? 'Time must not be later than now.')}
              </p>
            ) : null}
          </div>
          <div className='space-y-1'>
            <Label htmlFor={`${id}-note`}>{t('Note (optional)')}</Label>
            <Textarea
              id={`${id}-note`}
              value={note}
              maxLength={NOTE_LIMIT}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {failure ? (
            <p className='text-destructive text-sm' role='alert'>
              {t('Unable to save. Please try again later.')}
            </p>
          ) : null}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={props.onClose}>
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={save.isPending}>
              {t(save.isPending ? 'Saving…' : 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function WebsiteDialog(props: {
  provider: ProviderBalanceRow
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const id = useId()
  const [url, setUrl] = useState(props.provider.websiteUrl ?? '')
  const [tried, setTried] = useState(false)
  const [failure, setFailure] = useState(false)
  const valid =
    url.trim() === '' ||
    (/^https:\/\/\S+$/u.test(url.trim()) && url.trim().length <= 2_048)
  const save = useMutation({
    mutationFn: () => setProviderWebsite(props.provider.providerId, url.trim()),
    onSuccess: async () => {
      await refreshBalances(queryClient)
      toast.success(t('Website saved'))
      props.onClose()
    },
    onError: (error) => {
      if (fieldOf(error) === 'websiteUrl') {
        setTried(true)
        return
      }
      setFailure(true)
    },
  })
  return (
    <Dialog open onOpenChange={(open) => (!open ? props.onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('Website · {{name}}', { name: props.provider.name })}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t('Leave empty and save to clear the website.')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            setTried(true)
            setFailure(false)
            if (!valid) return
            save.mutate()
          }}
        >
          <div className='space-y-1'>
            <Label htmlFor={`${id}-url`}>{t('Website')}</Label>
            <Input
              id={`${id}-url`}
              value={url}
              placeholder='https://'
              maxLength={2_048}
              aria-invalid={tried && !valid}
              aria-describedby={tried && !valid ? `${id}-url-error` : undefined}
              onBlur={() => setTried(true)}
              onChange={(event) => setUrl(event.target.value)}
            />
            {tried && !valid ? (
              <p
                id={`${id}-url-error`}
                className='text-destructive text-xs'
                role='alert'
              >
                {t('Enter a URL that starts with https://.')}
              </p>
            ) : null}
          </div>
          {failure ? (
            <p className='text-destructive text-sm' role='alert'>
              {t('Unable to save. Please try again later.')}
            </p>
          ) : null}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={props.onClose}>
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={save.isPending}>
              {t(save.isPending ? 'Saving…' : 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RecordsDrawer(props: {
  provider?: ProviderBalanceRow
  asOf?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const format = useDashboardFormatters()
  const state = useServerTableState('recordedAt')
  const providerId = props.provider?.providerId
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'provider-balances',
      'records',
      providerId,
      props.asOf,
      state.query.page,
      state.query.pageSize,
    ],
    queryFn: ({ signal }) =>
      getProviderBalanceRecords(
        providerId ?? '',
        {
          page: state.query.page,
          pageSize: state.query.pageSize,
          ...(props.asOf ? { asOf: props.asOf } : {}),
        },
        signal
      ),
    enabled: Boolean(providerId),
  })
  const columns: ColumnDef<ProviderBalanceRecord, unknown>[] = [
    {
      id: 'recordedAt',
      header: t('Time'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => format.dateTime(row.original.recordedAt),
    },
    {
      id: 'recordType',
      header: t('Type'),
      enableSorting: false,
      cell: ({ row }) =>
        t(
          row.original.recordType === 'TOP_UP'
            ? 'Top-up'
            : 'Back-office balance'
        ),
    },
    {
      id: 'amount',
      header: t('Amount'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {format.rmb(row.original.amountRmb)}
        </span>
      ),
    },
    {
      id: 'note',
      header: t('Note'),
      enableSorting: false,
      cell: ({ row }) => row.original.note ?? '—',
    },
    {
      id: 'createdBy',
      header: t('Recorded by'),
      enableSorting: false,
      cell: ({ row }) => row.original.createdBy ?? '—',
    },
    {
      id: 'createdAt',
      header: t('Recorded at'),
      enableSorting: false,
      cell: ({ row }) => format.dateTime(row.original.createdAt),
    },
  ]
  return (
    <Sheet
      open={Boolean(props.provider)}
      onOpenChange={(open) => (!open ? props.onClose() : undefined)}
    >
      <SheetContent
        className={sideDrawerContentClassName('max-w-none sm:!max-w-[720px]')}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>{t('API provider balance records')}</SheetTitle>
        </SheetHeader>
        <div className={sideDrawerFormClassName()}>
          <div className='space-y-3'>
            <p className='font-medium'>{props.provider?.name}</p>
            {query.data ? <EstimateLine row={query.data.summary} /> : null}
            <CanvasServerTable
              data={query.data?.items ?? []}
              columns={columns}
              total={query.data?.total ?? 0}
              state={state}
              loading={query.isFetching}
              error={query.isError}
              onRetry={() => void query.refetch()}
              emptyTitle={t('Not recorded')}
              getRowId={(row) => row.id}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ProviderBalancesPanel() {
  const { t } = useTranslation()
  const format = useDashboardFormatters()
  const id = useId()
  const state = useServerTableState<'estimate' | 'name'>('estimate', '', false)
  const [providerId, setProviderId] = useState<string>()
  const [records, setRecords] = useState<ProviderBalanceRow>()
  const [adding, setAdding] = useState<ProviderBalanceRow>()
  const [website, setWebsite] = useState<ProviderBalanceRow>()
  const [threshold, setThreshold] = useState<{
    provider?: ProviderBalanceRow
  }>()
  const [costs, setCosts] = useState<DashboardDrawerRequest>()
  const list = useQuery({
    queryKey: [
      'canvas-cloud',
      'provider-balances',
      'list',
      providerId,
      state.query,
    ],
    queryFn: ({ signal }) =>
      getProviderBalances(
        {
          ...(providerId ? { providerId } : {}),
          page: state.query.page,
          pageSize: state.query.pageSize,
          sortBy: state.query.sortBy,
          sortOrder: state.query.sortOrder,
        },
        signal
      ),
    retry: false,
  })
  const options = useQuery({
    queryKey: ['canvas-cloud', 'provider-balances', 'options'],
    queryFn: ({ signal }) =>
      getProviderBalances(
        { page: 1, pageSize: 100, sortBy: 'name', sortOrder: 'asc' },
        signal
      ),
    staleTime: 60_000,
  })
  const defaultThreshold = list.data?.defaultAlertThresholdRmb ?? null
  const openIncompleteCosts = (row: ProviderBalanceRow) => {
    const asOf = list.data?.asOf
    if (!asOf || !row.lastBalanceAt) return
    const from = sinceLastBalance(row.lastBalanceAt, asOf)
    setCosts({
      kind: 'cost',
      costState: 'INCOMPLETE',
      providerId: row.providerId,
      scope: {
        from,
        to: asOf,
        asOf,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        periodLabel: `${format.dateTime(from)} — ${format.dateTime(asOf)}`,
      },
    })
  }
  const amount = (value: string | null) =>
    value === null ? (
      '—'
    ) : (
      <span className='tabular-nums'>{format.rmb(value)}</span>
    )
  const columns: ColumnDef<ProviderBalanceRow, unknown>[] = [
    {
      id: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('API provider')} />
      ),
      enableHiding: false,
      cell: ({ row }) => (
        <button
          type='button'
          className='text-primary focus-visible:ring-ring/50 rounded-sm text-start underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
          onClick={() => setRecords(row.original)}
        >
          {row.original.name}
        </button>
      ),
    },
    {
      id: 'lastBalance',
      header: () => (
        <BusinessTerm kind='dashboardMetric' value='PROVIDER_LAST_BALANCE' />
      ),
      enableSorting: false,
      cell: ({ row }) => (
        <div className='space-y-0.5'>
          <div>{amount(row.original.lastBalanceRmb)}</div>
          {row.original.lastBalanceAt ? (
            <div className='text-muted-foreground text-xs'>
              {format.dateTime(row.original.lastBalanceAt)}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: 'topUps',
      header: `＋ ${t('Later top-ups')}`,
      enableSorting: false,
      cell: ({ row }) => amount(row.original.topUpsAfterRmb),
    },
    {
      id: 'cost',
      header: `－ ${t('Later call cost')}`,
      enableSorting: false,
      cell: ({ row }) => amount(row.original.costAfterRmb),
    },
    {
      id: 'estimate',
      header: ({ column }) => (
        <span className='flex items-center gap-1'>
          ＝{' '}
          <DataTableColumnHeader
            column={column}
            title={t('Current estimated balance')}
            description={t(
              getCanvasBusinessTerm('dashboardMetric', 'PROVIDER_ESTIMATE')
                ?.helpKey ?? ''
            )}
          />
        </span>
      ),
      enableHiding: false,
      cell: ({ row }) => {
        const item = row.original
        if (item.estimatedBalanceRmb === null) return t('Not recorded')
        const negative = isNegative(item.estimatedBalanceRmb)
        let reason: string | null = null
        if (negative) reason = t('Negative balance')
        else if (item.belowAlertThreshold && item.effectiveAlertThresholdRmb) {
          reason = t('Below alert {{amount}}', {
            amount: format.rmb(item.effectiveAlertThresholdRmb),
          })
        }
        return (
          <div className='flex flex-col items-end gap-1'>
            <span
              className={`font-semibold tabular-nums ${item.belowAlertThreshold || negative ? 'text-destructive' : ''}`}
            >
              {format.rmb(item.estimatedBalanceRmb)}
            </span>
            {reason ? (
              <span className='text-destructive text-xs'>{reason}</span>
            ) : null}
            {item.incompleteCostTaskCount > 0 || item.balanceStale ? (
              <div className='flex flex-wrap justify-end gap-1'>
                {item.incompleteCostTaskCount > 0 ? (
                  <button
                    type='button'
                    className='focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs whitespace-nowrap text-amber-700 hover:underline focus-visible:ring-2 focus-visible:outline-none dark:text-amber-400'
                    onClick={() => openIncompleteCosts(item)}
                  >
                    <Info className='size-3' aria-hidden='true' />
                    {t('{{count}} tasks without recorded cost', {
                      count: item.incompleteCostTaskCount,
                    })}
                  </button>
                ) : null}
                {item.balanceStale ? (
                  <button
                    type='button'
                    className='focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs whitespace-nowrap text-amber-700 hover:underline focus-visible:ring-2 focus-visible:outline-none dark:text-amber-400'
                    onClick={() => setAdding(item)}
                  >
                    <Clock3 className='size-3' aria-hidden='true' />
                    {t('Balance not updated for {{days}} days', {
                      days: item.balanceAgeDays,
                    })}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      },
    },
    {
      id: 'alertThreshold',
      header: t('Alert threshold'),
      enableSorting: false,
      cell: ({ row }) => {
        if (row.original.alertThresholdRmb !== null) {
          return amount(row.original.alertThresholdRmb)
        }
        if (defaultThreshold === null) {
          return <span className='text-muted-foreground'>—</span>
        }
        return (
          <span className='text-muted-foreground tabular-nums'>
            {t('{{amount}} (default)', {
              amount: format.rmb(defaultThreshold),
            })}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: t('Actions'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
          <Button
            type='button'
            variant='link'
            className='h-auto p-0'
            onClick={() => setAdding(row.original)}
          >
            {t('Add record')}
          </Button>
          <Button
            type='button'
            variant='link'
            className='h-auto p-0'
            onClick={() => setThreshold({ provider: row.original })}
          >
            {t('Set alert')}
          </Button>
          {row.original.websiteUrl ? (
            <>
              <a
                href={row.original.websiteUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='text-primary focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-sm text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none'
              >
                <ExternalLink className='size-4' aria-hidden='true' />
                {t('Open website')}
              </a>
              <Button
                type='button'
                size='icon-sm'
                variant='ghost'
                aria-label={t('Change website')}
                onClick={() => setWebsite(row.original)}
              >
                <Pencil />
              </Button>
            </>
          ) : (
            <Button
              type='button'
              variant='link'
              className='h-auto p-0'
              onClick={() => setWebsite(row.original)}
            >
              {t('Set website')}
            </Button>
          )}
        </div>
      ),
    },
  ]
  return (
    <div className='space-y-3'>
      <div className='flex justify-end'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => setThreshold({})}
        >
          <BellRing aria-hidden='true' />
          {defaultThreshold === null
            ? t('Default alert threshold: not set')
            : t('Default alert threshold: {{amount}}', {
                amount: format.rmb(defaultThreshold),
              })}
        </Button>
      </div>
      <CanvasServerTable
        data={list.data?.items ?? []}
        columns={columns}
        total={list.data?.total ?? 0}
        state={state}
        loading={list.isFetching}
        error={list.isError}
        errorTitle={t('API provider balances failed to load')}
        onRetry={() => void list.refetch()}
        emptyTitle={t('No API providers')}
        getRowId={(row) => row.providerId}
        getRowClassName={(row) =>
          row.original.belowAlertThreshold
            ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--destructive)]'
            : undefined
        }
        hasActiveFilters={Boolean(providerId)}
        activeFilterCount={providerId ? 1 : 0}
        onResetFilters={() => setProviderId(undefined)}
        additionalFilters={
          <DataTableColumnFilterField
            label={t('API provider')}
            htmlFor={`${id}-provider`}
          >
            <Select
              value={providerId ?? ALL}
              onValueChange={(value) =>
                setProviderId(value === ALL || !value ? undefined : value)
              }
            >
              <SelectTrigger id={`${id}-provider`}>
                <SelectValue>
                  {(value: string) =>
                    value === ALL
                      ? t('All API providers')
                      : (options.data?.items.find(
                          (item) => item.providerId === value
                        )?.name ?? value)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('All API providers')}</SelectItem>
                {(options.data?.items ?? []).map((item) => (
                  <SelectItem key={item.providerId} value={item.providerId}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DataTableColumnFilterField>
        }
      />
      <RecordsDrawer
        provider={records}
        asOf={list.data?.asOf}
        onClose={() => setRecords(undefined)}
      />
      {adding ? (
        <AddRecordDialog
          provider={adding}
          onClose={() => setAdding(undefined)}
        />
      ) : null}
      {website ? (
        <WebsiteDialog
          provider={website}
          onClose={() => setWebsite(undefined)}
        />
      ) : null}
      {threshold ? (
        <ThresholdDialog
          provider={threshold.provider}
          defaultThresholdRmb={defaultThreshold}
          onClose={() => setThreshold(undefined)}
        />
      ) : null}
      <OperatingDashboardDrawers
        request={costs}
        onClose={() => setCosts(undefined)}
      />
    </div>
  )
}

/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTableColumnHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasChannelHealth } from '../api'
import { validHealthRange } from '../channel-health'
import { formatCanvasDateTime } from '../formatters'
import type {
  ChannelHealthItem,
  ChannelHealthQuery,
  ChannelHealthWindow,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasColumnFilterField } from './CanvasColumnFilterPanel'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasServerTable } from './CanvasServerTable'
import { CanvasStatusBadge } from './CanvasStatusBadge'
import { ChannelControlDialog } from './ChannelControlDialog'
import { ChannelHealthDetails } from './ChannelHealthDetails'

const windowLabels: Record<ChannelHealthWindow, string> = {
  hour: 'Last hour',
  day: 'Last 24 hours',
  week: 'Last 7 days',
  month: 'Last 30 days',
  custom: 'Custom range',
  round: 'Since latest enablement',
}

export function ChannelHealth() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const state =
    useServerTableState<NonNullable<ChannelHealthQuery['sortBy']>>(
      'providerName'
    )
  const [provider, setProvider] = useState('')
  const [enabled, setEnabled] = useState('')
  const debouncedProvider = useDebounce(provider.trim(), 300)
  const setPagination = state.setPagination
  useEffect(() => {
    setPagination((value) => ({ ...value, pageIndex: 0 }))
  }, [debouncedProvider, enabled, setPagination])
  const [window, setWindow] = useState<ChannelHealthWindow>('day')
  const [origin, setOrigin] = useState<'REAL' | 'MOCK'>('REAL')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const [selected, setSelected] = useState<string>()
  const [action, setAction] = useState<ChannelHealthItem | null>(null)
  const valid = window !== 'custom' || validHealthRange(from, to)
  const filters: ChannelHealthQuery = {
    window,
    origin,
    ...(window === 'custom' && from && to
      ? { from: from.toISOString(), to: to.toISOString() }
      : {}),
  }
  const query: ChannelHealthQuery = {
    ...filters,
    page: state.query.page,
    pageSize: state.query.pageSize,
    channel: state.query.search,
    provider: debouncedProvider,
    ...(enabled ? { enabled: enabled as 'true' | 'false' } : {}),
    sortBy: state.query.sortBy,
    sortOrder: state.query.sortOrder,
  }
  const report = useQuery({
    queryKey: ['canvas-cloud', 'channel-health', query],
    queryFn: () => getCanvasChannelHealth(query),
    enabled: valid,
  })
  const detail = useQuery({
    queryKey: ['canvas-cloud', 'channel-health', 'detail', selected, filters],
    queryFn: () => getCanvasChannelHealth({ ...filters, channelId: selected }),
    enabled: valid && Boolean(selected),
  })
  const percent = (value: number | null) =>
    value === null
      ? t('No data')
      : new Intl.NumberFormat(toIntlLocale(i18n.language), {
          style: 'percent',
          maximumFractionDigits: 1,
        }).format(value)
  const columns: ColumnDef<ChannelHealthItem, unknown>[] = [
    {
      id: 'providerName',
      accessorKey: 'providerName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Channel')} />
      ),
      cell: ({ row }) => (
        <div className='space-y-1'>
          <Button
            variant='link'
            className='h-auto max-w-full justify-start p-0 text-left break-words whitespace-normal'
            onClick={() => setSelected(row.original.id)}
          >
            {row.original.providerName} · {row.original.code}
          </Button>
          <div className='text-muted-foreground text-xs'>
            v{row.original.version}
          </div>
        </div>
      ),
    },
    {
      id: 'enabled',
      accessorKey: 'enabled',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Status')} />
      ),
      cell: ({ row }) => (
        <div className='space-y-1'>
          <CanvasStatusBadge
            status={row.original.enabled ? 'ACTIVE' : 'DISABLED'}
            label={row.original.enabled ? t('Enabled') : t('Disabled')}
          />
          {!row.original.providerEnabled && (
            <p className='text-muted-foreground text-xs'>
              {t('Provider disabled')}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'successRate',
      accessorKey: 'successRate',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Task success rate')} />
      ),
      cell: ({ row }) => (
        <div>
          <span className='font-semibold tabular-nums'>
            {percent(row.original.successRate)}
          </span>
          <p className='text-muted-foreground text-xs'>
            {t('Successful tasks')}: {row.original.succeeded} ·{' '}
            {t('Confirmed failures')}: {row.original.failed}
          </p>
        </div>
      ),
    },
    {
      id: 'unknown',
      accessorKey: 'unknown',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Unknown outcomes')} />
      ),
      cell: ({ row }) => (
        <div>
          {row.original.unknown}
          <p className='text-muted-foreground text-xs'>
            {t('Processing')}: {row.original.processing}
          </p>
        </div>
      ),
    },
    {
      id: 'lastFailureAt',
      accessorKey: 'lastFailureAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Last failure')} />
      ),
      cell: ({ row }) => formatCanvasDateTime(row.original.lastFailureAt),
    },
    {
      id: 'affectedModels',
      header: t('Affected models'),
      enableSorting: false,
      cell: ({ row }) => (
        <span className='block max-w-80 break-words whitespace-normal'>
          {row.original.affectedModels.map((m) => m.name).join(', ') ||
            t('No data')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('Actions'),
      enableSorting: false,
      cell: ({ row }) => (
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setSelected(row.original.id)}
          >
            {t('Details')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={() => setAction(row.original)}
          >
            {row.original.enabled ? t('Disable channel') : t('Restore channel')}
          </Button>
        </div>
      ),
    },
  ]
  return (
    <section
      className='min-w-0 space-y-4'
      aria-label={t('Channel health monitoring')}
    >
      <div className='flex flex-wrap items-end gap-3'>
        <div className='space-y-1'>
          <Label htmlFor='health-window'>{t('Time range')}</Label>
          <NativeSelect
            id='health-window'
            value={window}
            onChange={(event) => {
              setWindow(event.target.value as ChannelHealthWindow)
              state.setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
          >
            {Object.entries(windowLabels).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {t(label)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className='space-y-1'>
          <Label htmlFor='health-origin'>{t('Execution source')}</Label>
          <NativeSelect
            id='health-origin'
            value={origin}
            onChange={(event) => {
              setOrigin(event.target.value as 'REAL' | 'MOCK')
              state.setPagination((p) => ({ ...p, pageIndex: 0 }))
            }}
          >
            <NativeSelectOption value='REAL'>
              {t('Real calls')}
            </NativeSelectOption>
            <NativeSelectOption value='MOCK'>
              {t('Mock calls')}
            </NativeSelectOption>
          </NativeSelect>
        </div>
        <Button
          variant='outline'
          disabled={!valid || report.isFetching}
          onClick={() =>
            void queryClient.invalidateQueries({
              queryKey: ['canvas-cloud', 'channel-health'],
            })
          }
        >
          {t('Refresh')}
        </Button>
      </div>
      {window === 'custom' && (
        <CanvasDateRangeFilter
          from={from}
          to={to}
          onFromChange={(value) => {
            setFrom(value)
            state.setPagination((p) => ({ ...p, pageIndex: 0 }))
          }}
          onToChange={(value) => {
            setTo(value)
            state.setPagination((p) => ({ ...p, pageIndex: 0 }))
          }}
        />
      )}
      {!valid && (
        <p role='alert' className='text-destructive text-sm'>
          {t('Select a positive time range of at most 30 days')}
        </p>
      )}
      <p className='text-muted-foreground text-sm'>
        {t(
          'One task counts once. Success rate excludes processing and unknown outcomes. Empty intervals are gaps.'
        )}
      </p>
      {report.isError && (
        <p role='alert'>{t('Unable to load channel health')}</p>
      )}
      {valid && report.data && (
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          {[
            [t('Task success rate'), percent(report.data.summary.successRate)],
            [t('Successful tasks'), report.data.summary.succeeded],
            [t('Confirmed failures'), report.data.summary.failed],
            [t('Unknown outcomes'), report.data.summary.unknown],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium'>{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className='text-2xl font-semibold tabular-nums'>{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <CanvasServerTable
        data={valid ? (report.data?.items ?? []) : []}
        columns={columns}
        total={valid ? (report.data?.total ?? 0) : 0}
        state={state}
        loading={valid && report.isPending}
        searchLabel={t('Channel')}
        hasActiveFilters={Boolean(provider || enabled)}
        onResetFilters={() => {
          setProvider('')
          setEnabled('')
        }}
        additionalFilters={
          <>
            <CanvasColumnFilterField
              label={t('Provider')}
              htmlFor='health-provider'
            >
              <Input
                id='health-provider'
                value={provider}
                placeholder={t('Provider')}
                onChange={(event) => setProvider(event.target.value)}
              />
            </CanvasColumnFilterField>
            <CanvasColumnFilterField
              label={t('Status')}
              htmlFor='health-status'
            >
              <NativeSelect
                id='health-status'
                value={enabled}
                onChange={(event) => setEnabled(event.target.value)}
              >
                <NativeSelectOption value=''>{t('All')}</NativeSelectOption>
                <NativeSelectOption value='true'>
                  {t('Enabled')}
                </NativeSelectOption>
                <NativeSelectOption value='false'>
                  {t('Disabled')}
                </NativeSelectOption>
              </NativeSelect>
            </CanvasColumnFilterField>
          </>
        }
        emptyTitle={t('No provider channels')}
        getRowId={(row) => row.id}
      />
      {selected && (
        <Card>
          <CardHeader className='flex flex-row items-center justify-between gap-2'>
            <CardTitle>{t('Channel health details')}</CardTitle>
            <Button variant='ghost' onClick={() => setSelected(undefined)}>
              {t('Close')}
            </Button>
          </CardHeader>
          <CardContent className='min-w-0 space-y-4'>
            {detail.isError && (
              <p role='alert'>{t('Unable to load channel health')}</p>
            )}
            {!detail.isError && valid && detail.data && (
              <ChannelHealthDetails report={detail.data} />
            )}
            {!detail.isError && (!valid || !detail.data) && (
              <p>
                {valid
                  ? t('Loading...')
                  : t('Select a positive time range of at most 30 days')}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {action && (
        <ChannelControlDialog
          key={`${action.id}:${action.controlVersion}`}
          channel={action}
          onClose={() => setAction(null)}
          onChanged={(enabled) => {
            if (enabled) setWindow('round')
            void queryClient.invalidateQueries({
              queryKey: ['canvas-cloud', 'channel-health'],
            })
            void queryClient.invalidateQueries({
              queryKey: ['canvas-cloud', 'admin'],
            })
          }}
        />
      )}
    </section>
  )
}

import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks'
import { normalizeInterfaceLanguage, toIntlLocale } from '@/i18n/languages'

import { getCanvasCustomerTasks } from '../api'
import { isCanvasDateRangeValid } from '../date-range'
import { formatCanvasDateTime } from '../formatters'
import type { CanvasCustomerTask } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasServerTable } from './CanvasServerTable'

const executionStatuses = [
  'ACCEPTED',
  'PROCESSING',
  'SUCCEEDED',
  'PARTIAL_SUCCESS',
  'CONFIRMED_FAILED',
  'UNKNOWN',
] as const
const settlementProgresses = ['PENDING', 'PROCESSING', 'COMPLETED'] as const
const customerTaskErrorMessageKeys: Record<string, string> = {
  PROVIDER_RATE_LIMITED: 'The generation service is busy. Please retry later.',
  PROVIDER_REQUEST_TIMEOUT:
    'The generation service is temporarily unavailable. Please retry later.',
  PROVIDER_UNAVAILABLE:
    'The generation service is temporarily unavailable. Please retry later.',
  PROVIDER_BAD_GATEWAY:
    'The generation service is temporarily unavailable. Please retry later.',
  PROVIDER_GATEWAY_TIMEOUT:
    'The generation service is temporarily unavailable. Please retry later.',
  PROVIDER_AUTH_FAILED:
    'The generation service is unavailable. Please contact an administrator.',
  PROVIDER_BALANCE_INSUFFICIENT:
    'The generation service is unavailable. Please contact an administrator.',
  PROVIDER_ACCESS_DENIED:
    'The generation service is unavailable. Please contact an administrator.',
  PROVIDER_ENDPOINT_NOT_FOUND:
    'The generation service is unavailable. Please contact an administrator.',
  PROVIDER_INTERNAL_ERROR:
    'The generation service is unavailable. Please contact an administrator.',
  PROVIDER_UNKNOWN_ERROR:
    'The generation service is unavailable. Please contact an administrator.',
}

export function CustomerTasks() {
  const { t, i18n } = useTranslation()
  const state = useServerTableState('acceptedAt')
  const setPagination = state.setPagination
  const [model, setModel] = useState('')
  const [executionStatus, setExecutionStatus] = useState('')
  const [settlementProgress, setSettlementProgress] = useState('')
  const [from, setFrom] = useState<Date>()
  const [to, setTo] = useState<Date>()
  const debouncedModel = useDebounce(model.trim(), 300)
  const dateRangeValid = isCanvasDateRangeValid(from, to)
  useEffect(() => {
    setPagination((value) =>
      value.pageIndex === 0 ? value : { ...value, pageIndex: 0 }
    )
  }, [
    debouncedModel,
    executionStatus,
    from,
    setPagination,
    settlementProgress,
    to,
  ])
  const tasks = useQuery({
    queryKey: [
      'canvas-cloud',
      'customer',
      'tasks',
      state.query,
      debouncedModel,
      executionStatus,
      settlementProgress,
      from?.toISOString(),
      to?.toISOString(),
    ],
    queryFn: ({ signal }) =>
      getCanvasCustomerTasks(
        {
          taskId: state.query.search || undefined,
          model: debouncedModel || undefined,
          derivedExecutionStatus: executionStatus || undefined,
          settlementProgress: (settlementProgress || undefined) as
            | 'PENDING'
            | 'PROCESSING'
            | 'COMPLETED'
            | undefined,
          from: from?.toISOString(),
          to: to?.toISOString(),
          sortBy: state.query.sortBy as
            | 'taskId'
            | 'model'
            | 'derivedExecutionStatus'
            | 'acceptedAt',
          sortOrder: state.query.sortOrder,
          page: state.query.page,
          pageSize: state.query.pageSize,
        },
        signal
      ),
    enabled: dateRangeValid,
  })
  const formatPoints = useCallback(
    (value: string) =>
      new Intl.NumberFormat(toIntlLocale(i18n.language)).format(BigInt(value)),
    [i18n.language]
  )
  const copyTaskId = useCallback(
    async (id: string) => {
      await navigator.clipboard.writeText(id)
      toast.success(t('Task ID copied'))
    },
    [t]
  )
  const columns = useMemo<ColumnDef<CanvasCustomerTask, unknown>[]>(
    () => [
      {
        id: 'taskId',
        accessorKey: 'id',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Task ID')} />
        ),
        cell: ({ row }) => (
          <div className='flex min-w-0 items-center gap-1'>
            <span
              className='max-w-40 truncate font-mono'
              title={row.original.id}
            >
              {row.original.id}
            </span>
            <Button
              size='icon'
              variant='ghost'
              aria-label={t('Copy task ID')}
              title={t('Copy task ID')}
              onClick={() => void copyTaskId(row.original.id)}
            >
              <Copy aria-hidden='true' />
            </Button>
          </div>
        ),
      },
      {
        id: 'model',
        accessorKey: 'modelName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Model')} />
        ),
      },
      {
        id: 'derivedExecutionStatus',
        accessorKey: 'derivedExecutionStatus',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Task result')} />
        ),
        cell: ({ row }) => {
          const summary = row.original.executionSummary
          const parts = [
            t(`Customer task execution ${row.original.derivedExecutionStatus}`),
          ]
          if (summary.succeededResults) {
            parts.push(
              t('{{count}} succeeded', { count: summary.succeededResults })
            )
          }
          if (summary.failedResults) {
            parts.push(t('{{count}} failed', { count: summary.failedResults }))
          }
          if (summary.acceptedResults) {
            parts.push(
              t('{{count}} waiting', { count: summary.acceptedResults })
            )
          }
          if (summary.processingResults) {
            parts.push(
              t('{{count}} processing', { count: summary.processingResults })
            )
          }
          if (summary.unknownResults || summary.resultsIncomplete) {
            parts.push(t('Results pending confirmation'))
          }
          const language = normalizeInterfaceLanguage(
            i18n.resolvedLanguage || i18n.language
          )
          const failures = row.original.outputSummaries.filter(
            (output) => output.error
          )
          return (
            <div className='space-y-1'>
              <p>{parts.join(' · ')}</p>
              {failures.map((output) => (
                <p
                  key={output.outputIndex}
                  className='text-muted-foreground max-w-md text-xs break-words'
                >
                  {t('Result')} {output.outputIndex + 1}:{' '}
                  {output.error?.messages?.[language] ||
                    output.error?.messages?.en ||
                    (output.error?.code &&
                    customerTaskErrorMessageKeys[output.error.code]
                      ? t(customerTaskErrorMessageKeys[output.error.code])
                      : null) ||
                    t(
                      'The task failed. Please retry later or contact an administrator.'
                    )}
                </p>
              ))}
            </div>
          )
        },
      },
      {
        id: 'billing',
        header: t('Point result'),
        cell: ({ row }) => {
          const item = row.original
          if (item.settlementProgress !== 'COMPLETED') {
            return t(`Settlement progress ${item.settlementProgress}`)
          }
          const parts: string[] = []
          if (BigInt(item.deductedPoints) > 0n) {
            parts.push(
              t('Deducted {{points}}', {
                points: formatPoints(item.deductedPoints),
              })
            )
          }
          if (BigInt(item.releasedPoints) > 0n) {
            parts.push(
              t('Released {{points}}', {
                points: formatPoints(item.releasedPoints),
              })
            )
          }
          if (BigInt(item.outstandingDebtPoints) > 0n) {
            parts.push(
              t('Outstanding {{points}}', {
                points: formatPoints(item.outstandingDebtPoints),
              })
            )
          }
          return (
            parts.join(' · ') ||
            t(`Customer billing ${item.customerBillingStatus}`)
          )
        },
      },
      {
        id: 'acceptedAt',
        accessorKey: 'acceptedAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Accepted at')} />
        ),
        cell: ({ row }) => formatCanvasDateTime(row.original.acceptedAt),
      },
    ],
    [copyTaskId, formatPoints, i18n.language, i18n.resolvedLanguage, t]
  )
  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Button
          type='button'
          variant='outline'
          onClick={() => void tasks.refetch()}
        >
          <RefreshCw aria-hidden='true' />
          {t('Refresh')}
        </Button>
      </div>
      <CanvasServerTable
        data={tasks.data?.items ?? []}
        columns={columns}
        total={tasks.data?.total ?? 0}
        state={state}
        loading={tasks.isPending || tasks.isFetching}
        error={tasks.isError}
        onRetry={() => void tasks.refetch()}
        emptyTitle={t('No Canvas tasks')}
        filteredEmptyTitle={t('No matching results')}
        searchLabel={t('Task ID')}
        additionalFilters={
          <>
            <DataTableColumnFilterField label={t('Model')}>
              <Input
                value={model}
                placeholder={t('Model')}
                onChange={(event) => setModel(event.target.value)}
              />
            </DataTableColumnFilterField>
            <DataTableColumnFilterField label={t('Execution status')}>
              <Select
                value={executionStatus || 'ALL'}
                onValueChange={(value) =>
                  setExecutionStatus(value === 'ALL' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger aria-label={t('Execution status')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>
                    {t('All execution statuses')}
                  </SelectItem>
                  {executionStatuses.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`Customer task execution ${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DataTableColumnFilterField>
            <DataTableColumnFilterField label={t('Settlement progress')}>
              <Select
                value={settlementProgress || 'ALL'}
                onValueChange={(value) =>
                  setSettlementProgress(value === 'ALL' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger aria-label={t('Settlement progress')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>
                    {t('All settlement progresses')}
                  </SelectItem>
                  {settlementProgresses.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`Settlement progress ${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </DataTableColumnFilterField>
            <div className='sm:col-span-2'>
              <p className='mb-2 text-sm font-medium'>{t('Accepted time')}</p>
              <CanvasDateRangeFilter
                from={from}
                to={to}
                onFromChange={setFrom}
                onToChange={setTo}
              />
            </div>
            {!dateRangeValid ? (
              <p className='text-destructive text-sm'>
                {t('The start time must not be later than the end time.')}
              </p>
            ) : null}
          </>
        }
        hasActiveFilters={Boolean(
          model || executionStatus || settlementProgress || from || to
        )}
        onResetFilters={() => {
          setModel('')
          setExecutionStatus('')
          setSettlementProgress('')
          setFrom(undefined)
          setTo(undefined)
        }}
        getRowId={(row) => row.id}
      />
    </div>
  )
}

/* Copyright (C) 2023-2026 QuantumNous; licensed under GNU AGPL v3 or later. */
import { useQuery } from '@tanstack/react-query'
import { flexRender, type ColumnDef, type Row } from '@tanstack/react-table'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'

import {
  getCanvasAdminTaskInputBlob,
  getCanvasAdminTaskInputDownload,
} from '../api'
import { getCanvasTaskCalls, type CanvasTaskCall } from '../task-call-api'
import type { CanvasAdminTaskInputAsset } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'
import { CopyableText } from './CopyableText'

const callTypes: Record<string, string> = {
  SUBMIT: 'Submit task',
  PREPARE_ASSET: 'Prepare media',
}
const chainStates: Record<string, string> = {
  NOT_SENT: 'Not sent',
  AWAITING_RESPONSE: 'Awaiting response',
  RESPONDED: 'Responded',
  OUTCOME_UNKNOWN: 'Outcome pending confirmation',
}
const present = (input: string | number | null | undefined) =>
  input === null || input === undefined || input === '' ? '—' : input

function callResponse(call: CanvasTaskCall) {
  if (call.initialHttpStatus === null) return '—'
  return call.finalHttpStatus !== null &&
    call.finalHttpStatus !== call.initialHttpStatus
    ? `${call.initialHttpStatus} → ${call.finalHttpStatus}`
    : String(call.initialHttpStatus)
}

function compactRequestSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compactRequestSnapshot)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        compactRequestSnapshot(entry),
      ])
    )
  }
  if (typeof value === 'string') {
    if (/^data:/i.test(value)) return '[provider-data-hidden]'
    if (
      /^[a-z][a-z0-9+.-]*:/i.test(value) ||
      (value.startsWith('/') &&
        /(?:redacted|x-amz-|signature|token)/i.test(value))
    ) {
      return '[provider-url-hidden]'
    }
  }
  return value
}

function openInNewTab(url: string, target: Window | null): void {
  if (target) {
    target.location.replace(url)
    return
  }
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.click()
}

function inputMediaLabel(
  asset: CanvasAdminTaskInputAsset,
  t: (key: string) => string
): string {
  let type = 'Audio'
  if (asset.mediaType === 'IMAGE') type = 'Image'
  if (asset.mediaType === 'VIDEO') type = 'Video'
  return `${t(type)} ${asset.inputIndex + 1}`
}

function CallDetails({
  call,
  inputAssets,
  openingInput,
  onOpenInput,
}: {
  call: CanvasTaskCall
  inputAssets: CanvasAdminTaskInputAsset[]
  openingInput: string | null
  onOpenInput: (asset: CanvasAdminTaskInputAsset) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const time = (input: string | null) =>
    input
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'medium',
        }).format(new Date(input))
      : '—'
  const request =
    call.sanitizedRequest === null
      ? null
      : JSON.stringify(compactRequestSnapshot(call.sanitizedRequest), null, 2)
  const fields: Array<[string, ReactNode]> = [
    ['Upstream model', present(call.upstreamModelId)],
    [
      'API key group',
      call.credentialGroupName
        ? `${call.credentialGroupName}${call.credentialGroupVersion === null ? '' : ` · ${t('Version')} ${call.credentialGroupVersion}`}`
        : '—',
    ],
    [
      'Call ID',
      <CopyableText key='call' value={call.localCallId} noTruncate />,
    ],
    ['Executor', present(call.workerId)],
    [
      'Upstream request ID',
      call.upstreamRequestId ? (
        <CopyableText key='request' value={call.upstreamRequestId} noTruncate />
      ) : (
        '—'
      ),
    ],
    [
      'Upstream task ID',
      call.upstreamTaskId ? (
        <CopyableText key='task' value={call.upstreamTaskId} noTruncate />
      ) : (
        '—'
      ),
    ],
    ['Request sent at', time(call.sentAt)],
    ['Final provider response at', time(call.finalRespondedAt)],
    ['Provider error code', present(call.errorCode)],
    [
      'Error mapping rule',
      call.errorRuleId
        ? `${call.errorRuleId}${call.errorRuleVersion === null ? '' : ` · ${t('Version')} ${call.errorRuleVersion}`}`
        : '—',
    ],
    ['Safe error details', present(call.sanitizedError)],
  ]
  return (
    <div className='space-y-4 py-2'>
      <dl className='grid gap-4 sm:grid-cols-2'>
        {fields.map(([label, content]) => (
          <div className='min-w-0' key={label}>
            <dt className='text-muted-foreground text-sm'>{t(label)}</dt>
            <dd className='mt-1 text-sm [overflow-wrap:anywhere] break-words'>
              {content}
            </dd>
          </div>
        ))}
      </dl>
      {inputAssets.length ? (
        <section className='space-y-2'>
          <h4 className='text-sm font-medium'>{t('Input media')}</h4>
          <ul className='grid gap-2 sm:grid-cols-2'>
            {inputAssets.map((asset) => {
              const mediaLabel = inputMediaLabel(asset, t)
              return (
                <li
                  key={asset.assetId}
                  className='bg-muted/50 flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2'
                >
                  <span className='min-w-0'>
                    <span className='block text-sm font-medium'>
                      {mediaLabel}
                    </span>
                    <span className='text-muted-foreground block truncate text-xs'>
                      {asset.mimeType}
                    </span>
                  </span>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={openingInput === asset.assetId}
                    aria-label={`${t('Open')} ${mediaLabel}`}
                    onClick={() => onOpenInput(asset)}
                  >
                    {t('Open')}
                  </Button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
      {request ? (
        <details>
          <summary className='cursor-pointer text-sm font-medium'>
            {t(
              call.sentAt
                ? 'Sent upstream request (sanitized)'
                : 'Prepared upstream request (sanitized)'
            )}
          </summary>
          <pre className='bg-muted mt-2 max-h-80 overflow-auto rounded-md p-3 text-xs [overflow-wrap:anywhere] whitespace-pre-wrap'>
            {request}
          </pre>
        </details>
      ) : null}
    </div>
  )
}

export function TaskCallHistory({
  taskId,
  inputAssets = [],
}: {
  taskId: string
  inputAssets?: CanvasAdminTaskInputAsset[]
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const state = useServerTableState('startedAt')
  const [expanded, setExpanded] = useState<string>()
  const [openingInput, setOpeningInput] = useState<string | null>(null)
  const openInput = async (asset: CanvasAdminTaskInputAsset) => {
    const target = window.open('about:blank', '_blank')
    if (target) target.opener = null
    setOpeningInput(asset.assetId)
    try {
      const descriptor = await getCanvasAdminTaskInputDownload(
        asset.downloadPath,
        taskId,
        asset.assetId
      )
      if (/^https?:\/\//i.test(descriptor.url)) {
        openInNewTab(descriptor.url, target)
        return
      }
      const blob = await getCanvasAdminTaskInputBlob(
        descriptor.url,
        taskId,
        asset.assetId
      )
      const objectUrl = URL.createObjectURL(blob)
      openInNewTab(objectUrl, target)
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch {
      target?.close()
      toast.error(t('Input media is no longer available.'))
    } finally {
      setOpeningInput((current) => (current === asset.assetId ? null : current))
    }
  }
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'task-calls',
      taskId,
      state.query.page,
      state.query.pageSize,
    ],
    queryFn: ({ signal }) =>
      getCanvasTaskCalls(
        taskId,
        { page: state.query.page, pageSize: state.query.pageSize },
        signal
      ),
    retry: false,
  })
  const columns = useMemo<ColumnDef<CanvasTaskCall, unknown>[]>(
    () => [
      {
        id: 'startedAt',
        header: t('Call started at'),
        cell: ({ row }) =>
          row.original.startedAt
            ? new Intl.DateTimeFormat(locale, {
                dateStyle: 'short',
                timeStyle: 'medium',
              }).format(new Date(row.original.startedAt))
            : '—',
      },
      {
        id: 'callType',
        header: t('Type'),
        cell: ({ row }) => (
          <>
            {t(callTypes[row.original.callType] ?? 'Unknown call type')}
            {row.original.attemptCount > 1
              ? ` · ${t('Attempt count', { count: row.original.attemptCount })}`
              : ''}
          </>
        ),
      },
      {
        id: 'related',
        header: t('Related object'),
        cell: ({ row }) =>
          row.original.outputIndices.length
            ? row.original.outputIndices
                .map(
                  (index) =>
                    `${t(row.original.callType === 'PREPARE_ASSET' ? 'Input asset' : 'Result')} ${index + 1}`
                )
                .join(' · ')
            : '—',
      },
      {
        id: 'provider',
        header: t('Provider / channel'),
        cell: ({ row }) =>
          [
            row.original.providerName,
            row.original.channelCode,
            row.original.channelVersion === null
              ? null
              : `${t('Version')} ${row.original.channelVersion}`,
          ]
            .filter(Boolean)
            .join(' / ') || '—',
      },
      {
        id: 'state',
        header: t('Call status'),
        cell: ({ row }) =>
          t(chainStates[row.original.chainState] ?? 'Unknown call state'),
      },
      {
        id: 'response',
        header: t('Response'),
        cell: ({ row }) => callResponse(row.original),
      },
      {
        id: 'duration',
        header: t('Duration'),
        cell: ({ row }) =>
          row.original.durationMs === null
            ? '—'
            : t('Duration seconds', { count: row.original.durationMs / 1000 }),
      },
      {
        id: 'actions',
        header: t('Actions'),
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            type='button'
            variant='link'
            className='h-auto p-0'
            aria-expanded={expanded === row.original.localCallId}
            onClick={() =>
              setExpanded((current) =>
                current === row.original.localCallId
                  ? undefined
                  : row.original.localCallId
              )
            }
          >
            {t(
              expanded === row.original.localCallId ? 'Hide details' : 'Details'
            )}
          </Button>
        ),
      },
    ],
    [expanded, locale, t]
  )
  const rowRenderer = (row: Row<CanvasTaskCall>) => (
    <Fragment key={row.id}>
      <TableRow>
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
      {expanded === row.original.localCallId ? (
        <TableRow>
          <TableCell colSpan={row.getVisibleCells().length}>
            <CallDetails
              call={row.original}
              inputAssets={inputAssets}
              openingInput={openingInput}
              onOpenInput={(asset) => void openInput(asset)}
            />
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  )
  return (
    <CanvasServerTable
      data={query.data?.items ?? []}
      columns={columns}
      total={query.data?.total ?? 0}
      state={state}
      loading={query.isPending || query.isFetching}
      error={query.isError}
      errorTitle={t('Unable to load provider calls')}
      onRetry={() => void query.refetch()}
      emptyTitle={t('No provider calls')}
      getRowId={(row) => row.localCallId}
      renderRow={rowRenderer}
      renderExpandedContent={(row) =>
        expanded === row.original.localCallId ? (
          <CallDetails
            call={row.original}
            inputAssets={inputAssets}
            openingInput={openingInput}
            onOpenInput={(asset) => void openInput(asset)}
          />
        ) : null
      }
    />
  )
}

/* Copyright (C) 2023-2026 QuantumNous; licensed under GNU AGPL v3 or later. */
import { useQuery } from '@tanstack/react-query'
import { flexRender, type ColumnDef, type Row } from '@tanstack/react-table'
import { Fragment, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { TableCell, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toIntlLocale } from '@/i18n/languages'

import {
  getCanvasAdminTaskInputBlob,
  getCanvasAdminTaskInputDownload,
} from '../api'
import { formatErrorRuleMatch } from '../error-rule-format'
import { getCanvasTaskCalls, type CanvasTaskCall } from '../task-call-api'
import type { CanvasAdminTaskInputAsset } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'
import { CodeBlock } from './CodeBlock'
import { CopyableText } from './CopyableText'
import { TableRowPanel } from './TableRowPanel'

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
const errorCategories: Record<string, string> = {
  INVALID_REQUEST: 'Invalid request',
  PROVIDER_AUTH_FAILED: 'Provider authentication failed',
  PROVIDER_BALANCE_INSUFFICIENT: 'Provider balance insufficient',
  PROVIDER_ACCESS_DENIED: 'Provider access denied',
  PROVIDER_ENDPOINT_NOT_FOUND: 'Provider endpoint not found',
  PROVIDER_REQUEST_TIMEOUT: 'Provider request timed out',
  PROVIDER_RATE_LIMITED: 'Provider rate limited',
  PROVIDER_INTERNAL_ERROR: 'Provider internal error',
  PROVIDER_BAD_GATEWAY: 'Provider bad gateway',
  PROVIDER_UNAVAILABLE: 'Provider unavailable',
  PROVIDER_GATEWAY_TIMEOUT: 'Provider gateway timed out',
  PROVIDER_UNKNOWN_ERROR: 'Unknown provider error',
}
const judgementStatuses: Record<string, string> = {
  SUCCEEDED: 'Succeeded',
  CONFIRMED_FAILED: 'Confirmed failed',
  UNKNOWN: 'Result pending confirmation',
}
// Tooltip text for overview labels whose meaning is not obvious.
const overviewHints: Record<string, string> = {
  'Provider / channel':
    'The provider and channel used by this call, and the channel configuration version frozen when the task was accepted.',
  'API key group':
    'The API key group used by this call and its execution policy version.',
  'Upstream model': 'The model ID actually sent to the provider.',
  Executor:
    'The Canvas executor instance that ran this call, for matching logs.',
  'Upstream request ID':
    'The request ID returned by the provider; give it to the provider when asking about this call.',
  'Upstream task ID':
    'The task ID returned after the provider accepted the request; with an ID the system keeps querying the result.',
  'Canvas error code':
    'A problem Canvas detected itself, such as a response that does not match the interface contract (PROVIDER_SCHEMA). It is not returned by the provider.',
  'Upstream error code':
    'The error code read from the provider response, recorded as is.',
  'Error category':
    'The Canvas error category given by the matched mapping; it selects the default customer message.',
  'Matched mapping':
    'The error mapping this call matched, with its rule ID and version.',
  'Execution judgement':
    'Whether this call made the result confirmed failed or pending confirmation, and whether a mapping or the system decided it.',
  'Administrator rationale':
    'The rationale entered with the mapping; visible only to administrators and audit records.',
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

function collapseLongStrings(
  value: unknown,
  suffix: (count: number) => string
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => collapseLongStrings(entry, suffix))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        collapseLongStrings(entry, suffix),
      ])
    )
  }
  if (typeof value === 'string' && value.length > 200) {
    return `${value.slice(0, 200)}${suffix(value.length)}`
  }
  return value
}

export function JsonSnapshot(props: {
  value: unknown
  description?: string
  /** What the copy icon copies when it is more than the shown JSON, such as the whole request with its request line. */
  copyValue?: unknown
  /** Shown between the header row and the JSON, such as the request line. */
  lead?: ReactNode
}) {
  const { t } = useTranslation()
  const full = JSON.stringify(props.value, null, 2)
  const collapsed = JSON.stringify(
    collapseLongStrings(props.value, (count) =>
      t('Collapsed text length', { count })
    ),
    null,
    2
  )
  return (
    <div className='space-y-2'>
      {props.description ? (
        <p className='text-muted-foreground text-xs'>{props.description}</p>
      ) : null}
      {props.lead}
      <CodeBlock
        text={full}
        collapsedText={collapsed}
        copyText={
          props.copyValue === undefined
            ? undefined
            : JSON.stringify(props.copyValue, null, 2)
        }
      />
    </div>
  )
}

function executionJudgementText(
  judgement: CanvasTaskCall['executionJudgement'],
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!judgement) return '—'
  if (judgement.source === 'PROVIDER_STATE') {
    const status = t(
      judgement.status === 'UNKNOWN'
        ? 'Processing, still querying'
        : judgementStatuses[judgement.status]
    )
    return judgement.providerStatus
      ? t('{{status}} (provider status {{providerStatus}})', {
          status,
          providerStatus: judgement.providerStatus,
          interpolation: { escapeValue: false },
        })
      : status
  }
  return t(
    judgement.source === 'RULE'
      ? '{{status}} (set by mapping)'
      : '{{status}} (system judgement)',
    { status: t(judgementStatuses[judgement.status]) }
  )
}

/** A chain is settled when every result it produced succeeded. */
function callIsSettled(
  call: CanvasTaskCall,
  outputs: Array<{ outputIndex: number; executionStatus: string }>,
  taskSucceeded: boolean
): boolean {
  if (call.callType === 'PREPARE_ASSET') {
    return (
      call.finalHttpStatus !== null &&
      call.finalHttpStatus >= 200 &&
      call.finalHttpStatus < 300
    )
  }
  if (outputs.length === 0) return taskSucceeded
  return call.outputIndices.every(
    (index) =>
      outputs.find((output) => output.outputIndex === index)
        ?.executionStatus === 'SUCCEEDED'
  )
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

function orderedInputMedia(
  assets: CanvasAdminTaskInputAsset[],
  t: (key: string) => string
): Array<{ asset: CanvasAdminTaskInputAsset; label: string }> {
  const sequence = { IMAGE: 0, VIDEO: 0, AUDIO: 0 }
  return [...assets]
    .sort((left, right) => left.inputIndex - right.inputIndex)
    .map((asset) => {
      sequence[asset.mediaType] += 1
      let type = 'Audio'
      if (asset.mediaType === 'IMAGE') type = 'Image'
      if (asset.mediaType === 'VIDEO') type = 'Video'
      return { asset, label: `${t(type)} ${sequence[asset.mediaType]}` }
    })
}

export function CallDetails({
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
  const { t } = useTranslation()
  const request =
    call.sanitizedRequest === null
      ? null
      : compactRequestSnapshot(call.sanitizedRequest)
  const responseDiagnostic = call.providerResponseDiagnostic
  let schemaNote: string | null = null
  if (
    responseDiagnostic?.schema?.rule === 'required' &&
    responseDiagnostic.schema.field
  ) {
    schemaNote = t(
      'Response does not match the interface contract: missing required field {{field}}',
      {
        field: responseDiagnostic.schema.field,
        interpolation: { escapeValue: false },
      }
    )
  } else if (responseDiagnostic?.schema?.rule === 'maxBodyBytes') {
    schemaNote = t('The response exceeded the read limit.')
  } else if (responseDiagnostic?.schema) {
    schemaNote = t('Response does not match the interface contract.')
  }
  const fields: Array<[string, ReactNode, boolean?]> = [
    [
      'Provider / channel',
      [
        call.providerName,
        call.channelCode,
        call.channelVersion === null
          ? null
          : `${t('Version')} ${call.channelVersion}`,
      ]
        .filter((value) => value !== null && value !== '')
        .join(' · ') || '—',
    ],
    [
      'API key group',
      call.credentialGroupName
        ? `${call.credentialGroupName}${call.credentialGroupVersion === null ? '' : ` · ${t('Version')} ${call.credentialGroupVersion}`}`
        : '—',
    ],
    ['Upstream model', present(call.upstreamModelId)],
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
    [
      'Canvas error code',
      <div key='canvas-error-code'>
        <div>{present(call.canvasErrorCode)}</div>
        {schemaNote ? (
          <p className='text-muted-foreground mt-1 text-xs'>{schemaNote}</p>
        ) : null}
      </div>,
    ],
    ['Upstream error code', present(call.upstreamErrorCode)],
    [
      'Error category',
      call.errorCategory
        ? t(errorCategories[call.errorCategory] ?? 'Unknown error category')
        : '—',
    ],
    [
      'Matched mapping',
      call.errorRuleId ? (
        <div key='matched-mapping'>
          <div>
            {call.matchedRule ? formatErrorRuleMatch(call.matchedRule, t) : '—'}
          </div>
          <p className='text-muted-foreground mt-1 text-xs'>
            {call.errorRuleId}
            {call.errorRuleVersion === null
              ? ''
              : ` · ${t('Version')} ${call.errorRuleVersion}`}
          </p>
        </div>
      ) : (
        '—'
      ),
    ],
    ['Execution judgement', executionJudgementText(call.executionJudgement, t)],
    ...(call.matchedRule?.adminNote.trim()
      ? ([
          ['Administrator rationale', call.matchedRule.adminNote, true],
        ] as Array<[string, ReactNode, boolean?]>)
      : []),
  ]
  const defaultTab =
    call.canvasErrorCode ||
    (call.finalHttpStatus !== null &&
      (call.finalHttpStatus < 200 || call.finalHttpStatus >= 300))
      ? 'response'
      : 'overview'
  const requestSnapshot =
    request && typeof request === 'object' && !Array.isArray(request)
      ? (request as Record<string, unknown>)
      : null
  const requestRest = requestSnapshot
    ? Object.fromEntries(
        Object.entries({
          query: requestSnapshot.query,
          contentType: requestSnapshot.contentType,
          body: requestSnapshot.body,
        }).filter(
          ([, value]) =>
            value !== null &&
            value !== undefined &&
            !(
              typeof value === 'object' &&
              !Array.isArray(value) &&
              Object.keys(value).length === 0
            )
        )
      )
    : null
  const requestExplanation = t(
    'The request Canvas sent after converting it with the provider interface template.'
  )
  const requestLine = (
    <p className='font-mono text-sm'>
      {String(requestSnapshot?.method ?? '')}{' '}
      {String(requestSnapshot?.path ?? '')}
    </p>
  )
  let requestContent: ReactNode = (
    <p className='text-muted-foreground text-sm'>—</p>
  )
  if (requestSnapshot && requestRest && Object.keys(requestRest).length) {
    // The copy icon copies the whole request, request line included.
    requestContent = (
      <JsonSnapshot
        value={requestRest}
        description={requestExplanation}
        copyValue={requestSnapshot}
        lead={requestLine}
      />
    )
  } else if (requestSnapshot) {
    requestContent = (
      <>
        <p className='text-muted-foreground text-xs'>{requestExplanation}</p>
        <CodeBlock
          text={`${String(requestSnapshot.method ?? '')} ${String(requestSnapshot.path ?? '')}`}
          copyText={JSON.stringify(requestSnapshot, null, 2)}
        />
        <p className='text-muted-foreground text-sm'>
          {t('No query parameters or request body.')}
        </p>
      </>
    )
  }
  let missingBodyText = t('No response was received.')
  if (call.finalHttpStatus !== null) {
    missingBodyText = call.responseBodyRecorded
      ? t(
          'The body was empty, binary, or over the read limit and was not saved.'
        )
      : t('This call predates the change; the response body was not saved.')
  }
  return (
    <div className='space-y-4 py-2'>
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value='overview'>{t('Overview')}</TabsTrigger>
          <TabsTrigger value='response'>
            {t('Received upstream response')}
          </TabsTrigger>
          <TabsTrigger value='request'>
            {t('Sent upstream request')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value='overview' className='mt-4 space-y-4'>
          <dl className='grid grid-cols-2 gap-4 lg:grid-cols-3'>
            {fields.map(([label, content, fullWidth]) => (
              <div
                className={fullWidth ? 'col-span-full min-w-0' : 'min-w-0'}
                key={label}
              >
                <dt className='text-muted-foreground text-sm'>
                  <TooltipProvider delay={200}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            className='focus-visible:ring-ring/50 cursor-help rounded-sm underline decoration-dotted underline-offset-4 focus-visible:ring-2 focus-visible:outline-none'
                            aria-label={`${t(label)}. ${t(overviewHints[label] ?? '')}`}
                            tabIndex={0}
                          />
                        }
                      >
                        {t(label)}
                      </TooltipTrigger>
                      <TooltipContent className='max-w-72 leading-relaxed'>
                        {t(overviewHints[label] ?? '')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </dt>
                <dd className='mt-1 text-sm [overflow-wrap:anywhere] break-words'>
                  {content}
                </dd>
              </div>
            ))}
          </dl>
          {call.callType === 'SUBMIT' && inputAssets.length ? (
            <section className='space-y-2'>
              <h4 className='text-sm font-medium'>{t('Input media')}</h4>
              <ul className='grid gap-2 sm:grid-cols-2'>
                {orderedInputMedia(inputAssets, t).map(({ asset, label }) => {
                  return (
                    <li
                      key={asset.assetId}
                      className='bg-muted/50 flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2'
                    >
                      <span className='min-w-0'>
                        <span className='block text-sm font-medium'>
                          {label}
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
                        aria-label={`${t('Open')} ${label}`}
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
        </TabsContent>
        <TabsContent value='response' className='mt-4'>
          {call.sanitizedResponse !== null ? (
            <JsonSnapshot
              value={call.sanitizedResponse}
              description={t(
                call.responseFromQuery
                  ? 'The last query response returned by the provider.'
                  : 'The content returned by the provider.'
              )}
            />
          ) : (
            <p className='text-muted-foreground text-sm'>
              {missingBodyText}
              {responseDiagnostic ? (
                <span className='text-xs'>
                  {t('({{contentType}} · {{count}} bytes)', {
                    contentType: responseDiagnostic.contentType,
                    count: responseDiagnostic.summary.byteLength,
                    interpolation: { escapeValue: false },
                  })}
                </span>
              ) : null}
            </p>
          )}
        </TabsContent>
        <TabsContent value='request' className='mt-4 space-y-2'>
          {requestContent}
        </TabsContent>
      </Tabs>
    </div>
  )
}

export function TaskCallHistory({
  taskId,
  inputAssets = [],
  outputs = [],
  taskSucceeded = false,
  renderCallCost,
}: {
  taskId: string
  inputAssets?: CanvasAdminTaskInputAsset[]
  outputs?: Array<{ outputIndex: number; executionStatus: string }>
  taskSucceeded?: boolean
  /** Provider cost line of a submit call (its completeness and settlement), shown under the call. */
  renderCallCost?: (call: CanvasTaskCall) => ReactNode
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const state = useServerTableState('startedAt')
  // Explicit toggles override the default: open unsettled calls, or the last call when all succeeded.
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
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
  const items = query.data?.items ?? []
  const anyUnsettled = items.some(
    (item) => !callIsSettled(item, outputs, taskSucceeded)
  )
  const isOpen = (call: CanvasTaskCall) => {
    const explicit = toggled[call.localCallId]
    if (explicit !== undefined) return explicit
    if (anyUnsettled) return !callIsSettled(call, outputs, taskSucceeded)
    return items.at(-1)?.localCallId === call.localCallId
  }
  const columns: ColumnDef<CanvasTaskCall, unknown>[] = [
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
          aria-expanded={isOpen(row.original)}
          onClick={() =>
            setToggled((current) => ({
              ...current,
              [row.original.localCallId]: !isOpen(row.original),
            }))
          }
        >
          {t(isOpen(row.original) ? 'Hide details' : 'Details')}
        </Button>
      ),
    },
  ]
  const rowRenderer = (row: Row<CanvasTaskCall>) => {
    const cost = renderCallCost?.(row.original)
    return (
      <Fragment key={row.id}>
        <TableRow>
          {row.getVisibleCells().map((cell) => (
            <TableCell key={cell.id}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
        {cost ? (
          <TableRow>
            <TableCell colSpan={row.getVisibleCells().length}>
              <TableRowPanel>{cost}</TableRowPanel>
            </TableCell>
          </TableRow>
        ) : null}
        {isOpen(row.original) ? (
          <TableRow>
            <TableCell colSpan={row.getVisibleCells().length}>
              <TableRowPanel>
                <CallDetails
                  call={row.original}
                  inputAssets={inputAssets}
                  openingInput={openingInput}
                  onOpenInput={(asset) => void openInput(asset)}
                />
              </TableRowPanel>
            </TableCell>
          </TableRow>
        ) : null}
      </Fragment>
    )
  }
  return (
    <CanvasServerTable
      data={items}
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
      renderExpandedContent={(row) => (
        <>
          {renderCallCost?.(row.original)}
          {isOpen(row.original) ? (
            <CallDetails
              call={row.original}
              inputAssets={inputAssets}
              openingInput={openingInput}
              onOpenInput={(asset) => void openInput(asset)}
            />
          ) : null}
        </>
      )}
    />
  )
}

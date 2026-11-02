/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Textarea } from '@/components/ui/textarea'

import type { ChannelDraft } from '../../catalog-channel-draft'
import {
  assetRequest,
  pollRequest,
  readResponseSample,
  sampleResponse,
  type ResponseReading,
  type ResponseSource,
  type ResponseState,
  type TaskState,
} from '../../catalog-channel-response'
import { FoldTrigger } from './EditFields'

const CODE =
  'bg-muted m-0 rounded-lg px-3 py-2 font-mono text-xs leading-snug [overflow-wrap:anywhere] whitespace-pre-wrap'

export function PreviewCard(props: {
  title: string
  note?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className='bg-card grid gap-2 rounded-xl border p-4 text-sm'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <strong className='font-medium'>{props.title}</strong>
        {props.actions}
      </div>
      {props.note ? (
        <p className='text-muted-foreground text-xs'>{props.note}</p>
      ) : null}
      {props.children}
    </section>
  )
}

const Muted = (props: { children: ReactNode }) => (
  <p className='text-muted-foreground text-xs [overflow-wrap:anywhere]'>
    {props.children}
  </p>
)
const Problem = (props: { children: ReactNode }) => (
  <p className='text-destructive text-xs'>{props.children}</p>
)
const Target = (props: { children: ReactNode }) => (
  <p className='font-medium [overflow-wrap:anywhere]'>{props.children}</p>
)

/** The upload of one sample material and its status check, sent before the task is submitted. */
export function AssetRequestCard(props: { draft: ChannelDraft; base: string }) {
  const { t } = useTranslation()
  const request = assetRequest(props.draft)
  const kindNames = {
    image: t('an image'),
    video: t('a video'),
    audio: t('an audio clip'),
  }
  let content: ReactNode
  if (request.issue === 'noUpload') {
    content = (
      <Muted>
        {t(
          'Shown after one kind of material is set to upload to the upstream first.'
        )}
      </Muted>
    )
  } else if (request.issue === 'empty') {
    content = <Muted>{t('Shown after you fill in the upload path.')}</Muted>
  } else {
    const { poll } = request
    content = (
      <>
        <Muted>
          {t('Each material is uploaded once; the example is {{kind}}.', {
            kind: kindNames[request.kind],
          })}
        </Muted>
        <Target>
          {request.method} {props.base}
          {request.path}
        </Target>
        <Muted>{request.format}</Muted>
        {'text' in request.body ? (
          <pre className={CODE}>{request.body.text}</pre>
        ) : (
          <Problem>
            {request.body.reason === 'JSON'
              ? t('The upload request body is not valid JSON.')
              : t('The upload request body fails: {{reason}} at {{field}}', {
                  reason: request.body.reason,
                  field: request.body.field,
                })}
          </Problem>
        )}
        <strong className='font-medium'>{t('Material status check')}</strong>
        {poll.issue === 'none' ? (
          <Muted>
            {t(
              'No material status path: a material counts as usable as soon as it is uploaded.'
            )}
          </Muted>
        ) : null}
        {poll.issue === 'noPlaceholder' ? (
          <Problem>
            {t(
              'The material status path has no place for the material ID yet, such as /v1/assets/{assetId}'
            )}
          </Problem>
        ) : null}
        {poll.issue === undefined ? (
          <>
            <Target>
              {poll.method} {props.base}
              {poll.path}
            </Target>
            <Muted>
              <code className='font-mono'>{poll.remoteId}</code>
              {' ← '}
              {t(
                'the material ID in the upload response (path {{path}}), until the status is {{values}}.',
                {
                  path: poll.idPath ?? t('not filled in yet'),
                  values: poll.readyValues.join(', ') || t('a ready value'),
                }
              )}
            </Muted>
          </>
        ) : null}
      </>
    )
  }
  return (
    <PreviewCard
      title={t('Upload materials request')}
      note={t('Sent before the task is submitted.')}
    >
      {content}
    </PreviewCard>
  )
}

/** The poll request as it goes out: the task ID from the submit answer, in the path or a query parameter. */
export function PollRequestCard(props: { draft: ChannelDraft; base: string }) {
  const { t } = useTranslation()
  const request = pollRequest(props.draft)
  let content: ReactNode
  if (request.issue === 'empty') {
    content = <Muted>{t('Shown after you fill in the query path.')}</Muted>
  } else if (request.issue === 'placeholderInPath') {
    content = (
      <Problem>
        {t(
          'The task ID goes in a query parameter; remove {{placeholder}} from the path',
          { placeholder: request.placeholder }
        )}
      </Problem>
    )
  } else if (request.issue === 'noPlaceholder') {
    content = (
      <Problem>
        {t('The path has no place for the task ID yet, such as /v1/tasks/{id}')}
      </Problem>
    )
  } else {
    const interval = props.draft.pollIntervalMs.trim()
    content = (
      <>
        <Target>
          {request.method} {props.base}
          {request.path}
          {request.queryName !== undefined
            ? `?${request.queryName || t('parameter name')}=${request.taskId}`
            : ''}
        </Target>
        <Muted>
          <code className='font-mono'>{request.taskId}</code>
          {' ← '}
          {t('{{from}} {{interval}}', {
            from: request.submitIdPath
              ? t('the task ID in the submit response (path {{path}}).', {
                  path: request.submitIdPath,
                })
              : t(
                  'the task ID in the submit response; its path is not filled in yet.'
                ),
            interval: interval
              ? t('Queried every {{ms}} ms.', { ms: interval })
              : t('Queried at the default interval.'),
          })}
        </Muted>
      </>
    )
  }
  return <PreviewCard title={t('Query request')}>{content}</PreviewCard>
}

function ResponseCheck(props: { draft: ChannelDraft }) {
  const { t } = useTranslation()
  const [pasted, setPasted] = useState('')
  const [result, setResult] = useState<ResponseReading[] | 'invalid' | null>(
    null
  )
  const names = {
    taskId: t('Task ID'),
    status: t('Status'),
    result: t('Result'),
    error: t('Error'),
  }
  const stateNames: Record<TaskState, string> = {
    pending: t('Queued'),
    running: t('Generating'),
    succeeded: t('Success'),
    failed: t('Failure'),
  }
  const asText = (value: unknown) =>
    typeof value === 'object' ? JSON.stringify(value) : String(value)
  const valueOf = (reading: ResponseReading) => {
    if (!reading.found.length) {
      return reading.tried.length
        ? t('Not read (tried {{paths}})', { paths: reading.tried.join(', ') })
        : t('Not read (no path filled in)')
    }
    const strings = reading.found.filter((entry) => typeof entry === 'string')
    let shown = asText(reading.found[0])
    if (reading.what === 'result' && strings.length) shown = strings.join(', ')
    if (reading.what === 'status') {
      shown = `${shown} → ${reading.state ? stateNames[reading.state] : t('matches no state value, so it stays in progress')}`
    }
    return t('{{value}} (from {{path}})', { value: shown, path: reading.path })
  }
  const check = () => {
    try {
      setResult(readResponseSample(props.draft, pasted))
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      setResult('invalid')
    }
  }
  return (
    <Collapsible>
      <FoldTrigger>
        {t('Paste a real upstream response to check the paths')}
      </FoldTrigger>
      <CollapsibleContent className='mt-2 grid gap-2'>
        <Muted>
          {t(
            'The example response is built from the paths on the left, so it looks right even when a path is wrong. Paste a real response from the upstream documents to see whether each path reads it. Nothing calls the upstream.'
          )}
        </Muted>
        <Textarea
          aria-label={t('Upstream response JSON')}
          rows={4}
          className='font-mono text-xs'
          placeholder='{ "data": { "id": "abc", "status": "running" } }'
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
        />
        <div>
          <Button type='button' variant='outline' size='sm' onClick={check}>
            {t('Check')}
          </Button>
        </div>
        {result === 'invalid' ? (
          <p role='alert' className='text-destructive text-xs'>
            {t('Not valid JSON')}
          </p>
        ) : null}
        {Array.isArray(result) ? (
          <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
            {result.flatMap((reading) => [
              <dt
                key={`${reading.what}-name`}
                className='text-muted-foreground'
              >
                {names[reading.what]}
              </dt>,
              <dd
                key={`${reading.what}-value`}
                className={`m-0 font-mono [overflow-wrap:anywhere] ${reading.bad ? 'text-destructive' : ''}`}
              >
                {valueOf(reading)}
              </dd>,
            ])}
          </dl>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** The answers the paths expect, one tab per state, with where each value comes from on the left. */
export function ResponseCard(props: { draft: ChannelDraft }) {
  const { t } = useTranslation()
  const { draft } = props
  const polls = draft.workflow !== 'sync'
  const stateNames: Record<TaskState, string> = {
    pending: t('Queued'),
    running: t('Generating'),
    succeeded: t('Success'),
    failed: t('Failure'),
  }
  const states: Array<[ResponseState, string]> = polls
    ? [
        ...(draft.workflow === 'asset-async'
          ? [['asset', t('Upload materials')] as [ResponseState, string]]
          : []),
        ['submit', t('Submit')],
        ['pending', stateNames.pending],
        ['running', stateNames.running],
        ['succeeded', stateNames.succeeded],
        ['failed', stateNames.failed],
      ]
    : [
        ['succeeded', stateNames.succeeded],
        ['failed', stateNames.failed],
      ]
  const [picked, setPicked] = useState<ResponseState | null>(null)
  const fallback: ResponseState = polls ? 'running' : 'succeeded'
  const state =
    picked && states.some(([value]) => value === picked) ? picked : fallback
  const answer = sampleResponse(draft, state, t('Sample error message'))
  const assetId = answer.sources.flatMap((source) =>
    source.what === 'assetId' ? [source.remoteId] : []
  )[0]
  const hasPaths =
    draft.streaming ||
    [draft.taskIdPath, draft.statusPath, draft.outputPaths].some((text) =>
      text.trim()
    )
  const alsoLabels = {
    state: t('Also accepted: {{values}}'),
    taskId: t('Task ID is also read from: {{values}}'),
    status: t('Status is also read from: {{values}}'),
    result: t('Results are also read from: {{values}}'),
    error: t('Errors are also read from: {{values}}'),
  }
  const sourceLine = (source: ResponseSource): [string, string] => {
    switch (source.what) {
      case 'taskId':
        return [
          '"task_123"',
          source.fromSubmit
            ? t('task ID path of the submit response {{path}}', {
                path: source.path,
              })
            : t('task ID path {{path}}', { path: source.path }),
        ]
      case 'status':
        return [
          JSON.stringify(source.value),
          t('status path {{path}}, the status value of {{state}}', {
            path: source.path,
            state: stateNames[source.state],
          }),
        ]
      case 'result':
        return [
          t('Result address'),
          t('result path {{path}}', { path: source.path }),
        ]
      case 'error':
        return [
          t('Error message'),
          t('error path {{path}}', { path: source.path }),
        ]
      case 'usage':
        return [t('Usage'), t('Usage format')]
      case 'assetId':
        return [
          JSON.stringify(source.remoteId),
          t('material ID path {{path}}', { path: source.path }),
        ]
      case 'assetStatus':
        return [
          JSON.stringify(source.value),
          t('status path {{path}}, a ready value', { path: source.path }),
        ]
    }
  }
  if (!hasPaths) {
    return (
      <PreviewCard title={t('Example response')}>
        <Muted>
          {t(
            'The example response appears after you fill in the paths on the left.'
          )}
        </Muted>
      </PreviewCard>
    )
  }
  return (
    <PreviewCard
      title={t('Example response')}
      note={t(
        'Built from the settings on the left; not a real upstream response.'
      )}
    >
      <div
        role='tablist'
        aria-label={t('Example response')}
        className='bg-muted inline-flex w-fit flex-wrap gap-0.5 rounded-lg p-[3px]'
      >
        {states.map(([value, label]) => (
          <button
            key={value}
            type='button'
            role='tab'
            aria-selected={state === value}
            className={`rounded-md px-2 py-0.5 text-sm font-medium ${state === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            onClick={() => setPicked(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <pre className={CODE}>{answer.text}</pre>
      {answer.streamed ? (
        <Muted>
          {t(
            'A stream is not one JSON: the upstream sends several parts, each a JSON after data:, ending with data: [DONE].'
          )}
        </Muted>
      ) : null}
      {answer.sources.length ? (
        <div className='space-y-0.5'>
          <Muted>{t('Matches the left:')}</Muted>
          {answer.sources.map((source) => {
            const [value, from] = sourceLine(source)
            return (
              <Muted key={source.what}>
                <code className='font-mono'>{value}</code> ← {from}
              </Muted>
            )
          })}
        </div>
      ) : null}
      {assetId ? (
        <Muted>
          {t('The submit request sends asset://{{id}}.', { id: assetId })}
        </Muted>
      ) : null}
      {answer.alsoRead.map((entry) => (
        <Muted key={entry.what}>
          {alsoLabels[entry.what].replace('{{values}}', entry.values)}
        </Muted>
      ))}
      {draft.capability === 'chat.generate' ? null : (
        <ResponseCheck draft={draft} />
      )}
    </PreviewCard>
  )
}

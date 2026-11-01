/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import { sampleChoices, sampleRequest, sampleResponse, toList, type ChannelDraft, type ResponseState, type SampleKind } from '../../catalog-channel-draft'
import type { CatalogJson } from '../../catalog-edit-types'

/** The example request and answers of the Channel form; they follow the form and call nothing. */
export function ChannelPreview(props: { draft: ChannelDraft; profile: CatalogJson; baseUrl: string; upstreamId?: string }) {
  const { t } = useTranslation()
  const { draft } = props
  const choices = sampleChoices(draft)
  const [picked, setPicked] = useState<SampleKind | null>(null)
  // A Channel that takes references previews the request that carries one, until the administrator picks.
  const sample = picked && choices.includes(picked) ? picked : choices[1] ?? 'default'
  const sampleLabels: Record<SampleKind, string> = { default: t('No materials'), reference: t('With 1 reference image'), video: t('With 1 video'), audio: t('With 1 audio') }
  const { operation, body } = sampleRequest(draft, props.profile, sample, { prompt: t('An orange cat on a windowsill, afternoon sun'), upstreamId: props.upstreamId ?? t('<upstream model ID>'), option: (key) => t('<value of {{key}}>', { key }), template: t('<built from the template>') })
  const isForm = operation.format === 'multipart/form-data'
  const requestText = isForm
    ? Object.entries(body).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map((entry) => `-F "${key}=${typeof entry === 'string' ? entry : JSON.stringify(entry)}"`)).join('\n')
    : JSON.stringify(body, null, 2)
  const polls = draft.workflow !== 'sync'
  const states: Array<[ResponseState, string]> = polls
    ? [...(draft.workflow === 'asset-async' ? [['asset', t('Upload materials')] as [ResponseState, string]] : []), ['submit', t('Submit')], ['pending', t('Queued')], ['running', t('Generating')], ['succeeded', t('Success')], ['failed', t('Failure')]]
    : [['succeeded', t('Success')], ['failed', t('Failure')]]
  const [pickedState, setPickedState] = useState<ResponseState | null>(null)
  const state = pickedState && states.some(([value]) => value === pickedState) ? pickedState : polls ? 'running' : 'succeeded'
  const answer = sampleResponse(draft, state, t('Sample error message'))
  const hasPaths = draft.streaming || [draft.taskIdPath, draft.statusPath, draft.outputPaths].some((text) => toList(text).length)
  const alsoLabels = { state: t('Also accepted: {{values}}'), taskId: t('Task ID is also read from: {{values}}'), status: t('Status is also read from: {{values}}'), result: t('Results are also read from: {{values}}'), error: t('Errors are also read from: {{values}}') }
  const ready = props.baseUrl && operation.path.trim()
  return (
    <aside aria-label={t('Request and response preview')} className='grid min-w-0 gap-3 min-[1181px]:sticky min-[1181px]:top-0 min-[1181px]:max-h-[calc(100vh-13rem)] min-[1181px]:overflow-y-auto'>
      <section className='bg-card grid gap-2 rounded-xl border p-4 text-sm'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <strong className='font-medium'>{t('Example request')}</strong>
          {choices.length > 1 ? (
            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground text-xs'>{t('Preview with')}</span>
              <NativeSelect aria-label={t('Preview with')} className='w-40' value={sample} onChange={(event) => setPicked(event.target.value as SampleKind)}>
                {choices.map((choice) => <NativeSelectOption key={choice} value={choice}>{sampleLabels[choice]}</NativeSelectOption>)}
              </NativeSelect>
            </div>
          ) : null}
        </div>
        <p className='text-muted-foreground text-xs'>{t('Built from the settings on the left; nothing is sent.')}</p>
        {ready ? (
          <>
            <p className='font-medium [overflow-wrap:anywhere]'>{operation.method} {props.baseUrl.replace(/\/$/, '')}{operation.path}</p>
            <p className='text-muted-foreground text-xs'>{operation.format ?? 'application/json'}{draft.idempotencyHeader.trim() && polls ? ` · ${t('{{header}}: a unique value per submit', { header: draft.idempotencyHeader.trim() })}` : ''}</p>
            <pre className='bg-muted m-0 rounded-lg px-3 py-2 font-mono text-xs leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]'>{requestText}</pre>
          </>
        ) : <p className='text-muted-foreground text-xs'>{t('Shown after you choose an API provider and fill in the submit path.')}</p>}
      </section>
      <section className='bg-card grid gap-2 rounded-xl border p-4 text-sm'>
        {hasPaths ? (
          <>
            <strong className='font-medium'>{t('Example response')}</strong>
            <p className='text-muted-foreground text-xs'>{t('Built from the settings on the left; not a real upstream response.')}</p>
            <div role='tablist' aria-label={t('Example response')} className='bg-muted inline-flex w-fit flex-wrap gap-0.5 rounded-lg p-[3px]'>
              {states.map(([value, label]) => <button key={value} type='button' role='tab' aria-selected={state === value} className={`rounded-md px-2 py-0.5 text-sm font-medium ${state === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`} onClick={() => setPickedState(value)}>{label}</button>)}
            </div>
            <pre className='bg-muted m-0 rounded-lg px-3 py-2 font-mono text-xs leading-snug whitespace-pre-wrap [overflow-wrap:anywhere]'>{answer.text}</pre>
            {answer.streamed ? <p className='text-muted-foreground text-xs'>{t('A stream is not one JSON: the upstream sends several parts, each a JSON after data:, ending with data: [DONE].')}</p> : null}
            {state === 'asset' ? <p className='text-muted-foreground text-xs'>{t('The submit request sends asset://remote-asset-1.')}</p> : null}
            {answer.alsoRead.map((entry) => <p key={entry.what} className='text-muted-foreground text-xs [overflow-wrap:anywhere]'>{alsoLabels[entry.what].replace('{{values}}', entry.values)}</p>)}
          </>
        ) : <p className='text-muted-foreground text-xs'>{t('The example response appears after you fill in the paths on the left.')}</p>}
      </section>
    </aside>
  )
}

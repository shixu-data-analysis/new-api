/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import {
  sampleRequest,
  type ChannelDraft,
  type SampleKind,
} from '../../catalog-channel-draft'
import {
  isModeView,
  materialsOf,
  type BodyName,
  type MediaMode,
} from '../../catalog-channel-materials'
import type { CatalogJson } from '../../catalog-edit-types'
import { MediaModeTabs } from './ChannelMaterialsSection'
import {
  AssetRequestCard,
  PollRequestCard,
  PreviewCard,
  ResponseCard,
} from './ChannelResponsePreview'

/** The example request and answers of the Channel form; they follow the form and call nothing. */
export function ChannelPreview(props: {
  draft: ChannelDraft
  body: BodyName
  mode?: MediaMode
  onMode: (mode: MediaMode) => void
  profile: CatalogJson
  baseUrl: string
  upstreamId?: string
  /** The default parameters of the first model on this Channel, with the values changed on this page. */
  defaults?: CatalogJson
}) {
  const { t } = useTranslation()
  const { draft } = props
  // A video or image form previews the mode shown on the left; an expression switches modes here instead.
  const modeView = isModeView(draft.capability)
  const view = modeView ? materialsOf(draft, props.body) : null
  const sample: SampleKind = view
    ? view.modeSample(view.currentMode(props.mode))
    : 'default'
  // The prompt mentions each reference the way this Channel writes it to the upstream, as the canvas sends @图片1.
  const written = (label: string, custom: string) =>
    (custom.trim() || `@${label}{n}`).replaceAll('{n}', '1')
  const tokens =
    (
      {
        reference: [['图片', draft.promptImage]],
        video: [['视频', draft.promptVideo]],
        audio: [['音频', draft.promptAudio]],
        omni: [
          ['图片', draft.promptImage],
          ['视频', draft.promptVideo],
          ['音频', draft.promptAudio],
        ],
      } as Partial<Record<SampleKind, string[][]>>
    )[sample] ?? []
  const basePrompt = t('An orange cat on a windowsill')
  const { operation, body, failure } = sampleRequest(
    draft,
    props.profile,
    sample,
    {
      prompt: tokens.length
        ? t('{{prompt}}, referencing {{references}}', {
            prompt: basePrompt,
            references: tokens
              .map(([label, custom]) => written(label, custom))
              .join(t(', ')),
          })
        : basePrompt,
      upstreamId: props.upstreamId ?? t('<upstream model ID>'),
      option: (key) => t('<value of {{key}}>', { key }),
      ...(props.defaults ? { defaults: props.defaults } : {}),
      ...(modeView ? { negativePrompt: t('Blurry, low resolution') } : {}),
    }
  )
  const isForm = operation.format === 'multipart/form-data'
  const requestText = isForm
    ? Object.entries(body)
        .flatMap(([key, value]) =>
          (Array.isArray(value) ? value : [value]).map(
            (entry) =>
              `-F "${key}=${typeof entry === 'string' ? entry : JSON.stringify(entry)}"`
          )
        )
        .join('\n')
    : JSON.stringify(body, null, 2)
  const polls = draft.workflow !== 'sync'
  const base = props.baseUrl.replace(/\/$/, '')
  const ready = props.baseUrl && operation.path.trim()
  return (
    <aside
      aria-label={t('Request and response preview')}
      className='grid min-w-0 gap-3 min-[1181px]:sticky min-[1181px]:top-0 min-[1181px]:max-h-[calc(100vh-13rem)] min-[1181px]:overflow-y-auto'
    >
      {draft.workflow === 'asset-async' ? (
        <AssetRequestCard draft={draft} base={base} />
      ) : null}
      <PreviewCard
        title={t('Example request')}
        note={t('Built from the settings on the left; nothing is sent.')}
        actions={
          view && view.mediaStyle() === 'expr' ? (
            <MediaModeTabs
              draft={draft}
              body={props.body}
              mode={props.mode}
              onMode={props.onMode}
            />
          ) : null
        }
      >
        {ready ? (
          <>
            <p className='font-medium [overflow-wrap:anywhere]'>
              {operation.method} {base}
              {operation.path}
            </p>
            <p className='text-muted-foreground text-xs'>
              {operation.format ?? 'application/json'}
              {draft.idempotencyHeader.trim() && polls
                ? ` · ${t('{{header}}: a unique value per submit', { header: draft.idempotencyHeader.trim() })}`
                : ''}
            </p>
            {failure ? (
              <p role='alert' className='text-destructive text-xs'>
                {failure.field
                  ? t(
                      'The template fails for this sample: {{reason}} at {{field}}',
                      { ...failure }
                    )
                  : t(
                      'The request cannot be built for this sample: {{reason}}',
                      {
                        reason: failure.reason,
                      }
                    )}
              </p>
            ) : (
              <pre className='bg-muted m-0 rounded-lg px-3 py-2 font-mono text-xs leading-snug [overflow-wrap:anywhere] whitespace-pre-wrap'>
                {requestText}
              </pre>
            )}
          </>
        ) : (
          <p className='text-muted-foreground text-xs'>
            {t(
              'Shown after you choose an API provider and fill in the submit path.'
            )}
          </p>
        )}
      </PreviewCard>
      {polls ? <PollRequestCard draft={draft} base={base} /> : null}
      <ResponseCard draft={draft} />
    </aside>
  )
}

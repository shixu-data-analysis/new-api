/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import type {
  ChannelDraft,
  MaterialKind,
  Slot,
} from '../../catalog-channel-draft'
import {
  composeSegments,
  editMaterials,
  exprIssue,
  exprSegments,
  LIST_PARTS,
  materialLines,
  KIND_OF_SLOT,
  materialsOf,
  MODE_SLOT_KEYS,
  SHAPEABLE,
  segmentKind,
  type BodyName,
  type MediaMode,
  type MediaSlot,
  type SegmentKind,
  type SendStyle,
} from '../../catalog-channel-materials'
import {
  sameShape,
  shapeIssue,
  URL_SHAPE,
  usableHolders,
  type ShapePart,
} from '../../catalog-channel-shapes'
import { EditField, FoldTrigger, SwitchField } from './EditFields'

/** The modes of a body as tabs; an expression shows them in the preview instead, where they only switch the sample. */
export function MediaModeTabs(props: {
  draft: ChannelDraft
  body: BodyName
  mode?: MediaMode
  onMode: (mode: MediaMode) => void
}) {
  const { t } = useTranslation()
  const view = materialsOf(props.draft, props.body)
  const labels: Record<MediaMode, string> = {
    text: t('Text only'),
    first: t('First frame'),
    frames: t('First and last frames'),
    reference: t('All references'),
  }
  if (view.imageView) labels.reference = t('With reference images')
  else if (view.textBodyWithImagesElsewhere) {
    labels.reference = t('Video and audio')
  }
  const allowed = view.allowedModes()
  return (
    <Tabs
      value={view.currentMode(props.mode)}
      onValueChange={(next) => props.onMode(next as MediaMode)}
    >
      <TabsList>
        {view.bodyModes().map((mode) => (
          <TabsTrigger key={mode} value={mode}>
            {allowed.includes(mode)
              ? labels[mode]
              : t('{{mode}} · not supported', { mode: labels[mode] })}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

/** The prompt and materials of a video or image form, edited by canvas mode. */
export function ChannelMaterialsSection(props: {
  draft: ChannelDraft
  body: BodyName
  mode?: MediaMode
  onMode: (mode: MediaMode) => void
  onChange: (next: ChannelDraft) => void
  errorOf: (path: string) => string | undefined
}) {
  const { t } = useTranslation()
  const { draft, body } = props
  const view = materialsOf(draft, body)
  const style = view.mediaStyle()
  const mode = view.currentMode(props.mode)
  const accepted = view.accepts()
  const list = view.contentRow()
  const change = (edit: (next: ReturnType<typeof materialsOf>) => void) =>
    props.onChange(
      editMaterials(draft, (next) => edit(materialsOf(next, body)))
    )
  const [shapesOpen, setShapesOpen] = useState<
    Partial<Record<MediaMode, boolean>>
  >({})

  const acceptLabels: Record<MaterialKind, string> = {
    first: t('Receive the first frame'),
    last: t('Receive the last frame'),
    reference: t('Receive reference images'),
    video: t('Receive reference videos'),
    audio: t('Receive reference audio'),
  }
  const slotLabels: Record<Slot, string> = {
    prompt: t('Prompt goes in'),
    first: t('First frame goes in'),
    last: t('Last frame goes in'),
    images: t('Images go in'),
    videos: t('Videos go in'),
    audios: t('Audio goes in'),
  }
  const partLabels: Record<MaterialKind, string> = {
    first: t('Send content of the first frame'),
    last: t('Send content of the last frame'),
    reference: t('Send content of each reference image'),
    video: t('Send content of each reference video'),
    audio: t('Send content of each reference audio'),
  }
  const modeKinds: Record<MediaMode, MaterialKind[]> = {
    text: [],
    first: ['first'],
    frames: ['first', 'last'],
    reference: view
      .bodyKinds()
      .filter((kind) => kind !== 'first' && kind !== 'last'),
  }
  const unsupported: Record<MediaMode, string> = {
    text: '',
    first: t('Image to video needs the first frame; it is not supported now.'),
    frames: t(
      'First and last frames need both frames; they are not supported now.'
    ),
    reference: view.imageView
      ? t('Reference images need receiving them; they are not supported now.')
      : t(
          'All references need at least one reference material; they are not supported now.'
        ),
  }
  const kinds = view.bodyKinds()

  const fromExpression = (
    <div className='text-muted-foreground min-h-8 py-1.5 text-sm'>
      {t('Sent by the expression')}
    </div>
  )
  const slotInput = (slot: Slot) => (
    <EditField
      key={slot}
      label={slotLabels[slot]}
      error={props.errorOf(`${body}.slot.${slot}`)}
    >
      {(id, describedBy) =>
        !view.slotField(slot) && view.slotExprRow(slot) ? (
          fromExpression
        ) : (
          <Input
            id={id}
            aria-describedby={describedBy}
            className='font-mono'
            value={view.slotField(slot)}
            onChange={(event) =>
              change((next) => next.setSlot(slot, event.target.value))
            }
          />
        )
      }
    </EditField>
  )

  const negative = view.negativeRow()
  const header = (
    <div className='grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13rem,16rem))]'>
      <EditField label={t('Send style')}>
        {(id, describedBy) => (
          <NativeSelect
            id={id}
            aria-describedby={describedBy}
            className='w-full'
            value={style}
            onChange={(event) =>
              change((next) =>
                next.setMediaStyle(event.target.value as SendStyle)
              )
            }
          >
            <NativeSelectOption value='fields'>
              {t('By field')}
            </NativeSelectOption>
            <NativeSelectOption value='list'>
              {t('All in one list')}
            </NativeSelectOption>
            <NativeSelectOption value='expr'>
              {t('By an expression')}
            </NativeSelectOption>
          </NativeSelect>
        )}
      </EditField>
      {style === 'fields' ? slotInput('prompt') : null}
      {style === 'list' && list ? (
        <EditField label={t('List field name')}>
          {(id, describedBy) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              className='font-mono'
              value={list.field}
              onChange={(event) =>
                change((next) => {
                  const row = next.contentRow()
                  if (row) row.field = event.target.value
                })
              }
            />
          )}
        </EditField>
      ) : null}
      <EditField label={t('Negative prompt goes in (optional)')}>
        {(id, describedBy) =>
          !negative && view.negativeExprRow() ? (
            fromExpression
          ) : (
            <Input
              id={id}
              aria-describedby={describedBy}
              className='font-mono'
              value={negative?.field ?? ''}
              onChange={(event) =>
                change((next) => next.setNegative(event.target.value))
              }
            />
          )
        }
      </EditField>
    </div>
  )

  const acceptSwitches = (readOnly: boolean, shown: MaterialKind[]) =>
    shown.length ? (
      <div className='flex flex-wrap items-center gap-x-5 gap-y-2'>
        {shown.map((kind) => (
          <SwitchField
            key={kind}
            label={acceptLabels[kind]}
            checked={Boolean(accepted[kind])}
            disabled={readOnly}
            onChange={(on) => change((next) => next.setAccept(kind, on))}
          />
        ))}
      </div>
    ) : null
  const errorLines = (paths: string[]) =>
    paths
      .map((path) => props.errorOf(path))
      .filter(Boolean)
      .map((message) => (
        <p key={message} role='alert' className='text-destructive text-xs'>
          {message}
        </p>
      ))

  const shapeSlots = (MODE_SLOT_KEYS[mode] ?? []).filter((slot) => {
    if (view.textBodyWithImagesElsewhere && slot === 'images') return false
    if (!accepted[KIND_OF_SLOT[slot]]) return false
    const row = view.rowOfSlot(slot)
    return Boolean(row && SHAPEABLE.includes(row.source))
  })
  const shapesShown =
    shapesOpen[mode] ||
    shapeSlots.some(
      (slot) =>
        !sameShape(view.slotShape(slot), URL_SHAPE) ||
        view.rowOfSlot(slot)?.asList
    )

  let modeBody
  if (style === 'expr') {
    modeBody = (
      <div className='space-y-3'>
        <div className='space-y-1'>
          <div className='flex flex-wrap items-center gap-x-5 gap-y-2'>
            <span className='text-sm font-medium'>
              {t('Materials received')}
            </span>
            {acceptSwitches(true, kinds)}
          </div>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Decided by what the expression sends; change the expression to change it.'
            )}
          </p>
        </div>
        {view.mediaExprRows().map((row) => (
          <ExpressionEditor
            key={draft[body].indexOf(row)}
            draft={draft}
            body={body}
            index={draft[body].indexOf(row)}
            onChange={props.onChange}
            error={props.errorOf(`${body}.${draft[body].indexOf(row)}.expr`)}
          />
        ))}
        <ExpressionHelp draft={draft} />
      </div>
    )
  } else if (mode === 'text') {
    modeBody = (
      <p className='text-muted-foreground text-xs'>
        {t('This mode sends no material.')}
      </p>
    )
  } else if (list) {
    modeBody = (
      <div className='space-y-3'>
        {acceptSwitches(false, modeKinds[mode])}
        {!view.allowedModes().includes(mode) ? (
          <p className='text-muted-foreground text-xs'>{unsupported[mode]}</p>
        ) : null}
        {(LIST_PARTS[mode] ?? [])
          .filter(
            (kind) =>
              !(view.textBodyWithImagesElsewhere && kind === 'reference') &&
              accepted[kind]
          )
          .map((kind) => (
            <ShapeEditor
              key={kind}
              label={partLabels[kind]}
              part={kind}
              value={list.parts?.[kind] ?? ''}
              onChange={(text) =>
                change((next) => next.setListPart(kind, text))
              }
            />
          ))}
        <ShapeHelp parts={['text', ...modeKinds[mode]]} list mode={mode} />
      </div>
    )
  } else {
    const slots: MediaSlot[] = {
      first: ['first'] as MediaSlot[],
      frames: ['first', 'last'] as MediaSlot[],
      reference: [
        ...(view.textBodyWithImagesElsewhere || !accepted.reference
          ? []
          : (['images'] as MediaSlot[])),
        ...(accepted.video ? (['videos'] as MediaSlot[]) : []),
        ...(accepted.audio ? (['audios'] as MediaSlot[]) : []),
      ],
    }[mode]
    modeBody = (
      <div className='space-y-3'>
        {acceptSwitches(false, modeKinds[mode])}
        {!view.allowedModes().includes(mode) ? (
          <p className='text-muted-foreground text-xs'>{unsupported[mode]}</p>
        ) : null}
        <div className='grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]'>
          {slots.map(slotInput)}
        </div>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Write field names as in the upstream documents. The first and last frames can share the images field. Each item sends only the address; when the upstream wants an object, change the send content.'
          )}
        </p>
        <SendLine draft={draft} body={body} mode={mode} />
        {shapeSlots.length > 0 && shapesShown ? (
          <div className='space-y-3'>
            {shapeSlots.map((slot) => (
              <div key={slot} className='space-y-2'>
                {(slot === 'first' || slot === 'last') &&
                view.frameAlone(slot) ? (
                  <div className='max-w-64'>
                    <EditField
                      label={
                        slot === 'first'
                          ? t('First frame sent as')
                          : t('Last frame sent as')
                      }
                    >
                      {(id, describedBy) => (
                        <NativeSelect
                          id={id}
                          aria-describedby={describedBy}
                          className='w-full'
                          value={view.slotRow(slot)?.asList ? 'list' : 'single'}
                          onChange={(event) =>
                            change((next) =>
                              next.setFrameForm(
                                slot,
                                event.target.value as 'single' | 'list'
                              )
                            )
                          }
                        >
                          <NativeSelectOption value='single'>
                            {t('A single value')}
                          </NativeSelectOption>
                          <NativeSelectOption value='list'>
                            {t('A list of one item')}
                          </NativeSelectOption>
                        </NativeSelect>
                      )}
                    </EditField>
                  </div>
                ) : null}
                <ShapeEditor
                  label={partLabels[KIND_OF_SLOT[slot]]}
                  part={KIND_OF_SLOT[slot]}
                  value={view.slotShape(slot)}
                  onChange={(text) =>
                    change((next) => next.setShape(slot, text))
                  }
                />
              </div>
            ))}
            <ShapeHelp
              parts={shapeSlots.map((slot) => KIND_OF_SLOT[slot])}
              list={false}
              mode={mode}
            />
          </div>
        ) : null}
        {shapeSlots.length > 0 && !shapesShown ? (
          <button
            type='button'
            className='text-primary text-sm hover:underline'
            onClick={() => setShapesOpen((open) => ({ ...open, [mode]: true }))}
          >
            {t('Change send content')}
          </button>
        ) : null}
        {view
          .mediaExprRows()
          .filter((row) =>
            mode === 'reference'
              ? true
              : (MODE_SLOT_KEYS[mode] ?? []).some(
                  (slot) => view.slotExprRow(slot) === row
                )
          )
          .map((row) => (
            <ExpressionEditor
              key={draft[body].indexOf(row)}
              draft={draft}
              body={body}
              index={draft[body].indexOf(row)}
              onChange={props.onChange}
              error={props.errorOf(`${body}.${draft[body].indexOf(row)}.expr`)}
            />
          ))}
      </div>
    )
  }

  const partErrors = draft[body].flatMap((row, index) =>
    Object.keys(row.parts ?? {}).map((key) => `${body}.shape.${index}.${key}`)
  )
  return (
    <div className='space-y-3'>
      {header}
      {style === 'list' ? (
        <p className='text-muted-foreground text-xs'>
          {t('The prompt is in the list.')}
        </p>
      ) : null}
      {style === 'expr' ? (
        <p className='text-muted-foreground text-xs'>
          {t('The prompt is in the expression.')}
        </p>
      ) : null}
      {list ? (
        <ShapeEditor
          label={t('Send content of the prompt')}
          part='text'
          value={list.parts?.text ?? ''}
          onChange={(text) => change((next) => next.setListPart('text', text))}
        />
      ) : null}
      {errorLines([`${body}.promptSent`])}
      {style !== 'expr' ? (
        <MediaModeTabs
          draft={draft}
          body={body}
          mode={props.mode}
          onMode={props.onMode}
        />
      ) : null}
      {modeBody}
      {errorLines([
        ...kinds.map((kind) => `${body}.accept.${kind}`),
        ...partErrors,
        ...(['image', 'video', 'audio'] as const).map(
          (kind) => `${body}.shapeDelivery.${kind}`
        ),
        'mediaModes',
        'materialsRender',
      ])}
    </div>
  )
}

/** What each field holds when sent: the preview shows one material, so it cannot show the list. */
function SendLine(props: {
  draft: ChannelDraft
  body: BodyName
  mode: MediaMode
}) {
  const { t } = useTranslation()
  const view = materialsOf(props.draft, props.body)
  const multipart =
    (props.draft.images ?? props.draft.submit).format === 'multipart/form-data'
  const units: Partial<Record<Slot, string>> = {
    first: t('one item per image'),
    last: t('one item per image'),
    images: t('one item per image'),
    videos: t('one item per clip'),
    audios: t('one item per clip'),
  }
  const shown = (MODE_SLOT_KEYS[props.mode] ?? []).filter(
    (slot) =>
      !(view.textBodyWithImagesElsewhere && slot === 'images') &&
      view.slotField(slot).trim()
  )
  const lines = [
    ...new Set(
      shown.map((slot) => {
        let value = `[ ${units[slot]}, … ]`
        if (multipart) value = t('one field of the same name per material')
        if (!view.slotSendsList(slot)) value = t('a single value')
        return `${view.slotField(slot).trim()}: ${value}`
      })
    ),
  ]
  return lines.length ? (
    <p className='text-muted-foreground text-xs'>
      {t('When sent: {{lines}}', { lines: lines.join(', ') })}
    </p>
  ) : null
}

/** One material's send content: the upstream's JSON for one item, with placeholders for what changes. */
function ShapeEditor(props: {
  label: string
  part: ShapePart
  value: string
  onChange: (text: string) => void
}) {
  const { t } = useTranslation()
  const issue = shapeIssue(props.part, props.value)
  const holders: Record<string, string> = {
    prompt: t('the prompt'),
    url: t('the material address'),
    durationSeconds: t('the material length (seconds)'),
    role: t('the role name'),
  }
  return (
    <EditField
      label={props.label}
      error={issue ? t(issue.key, issue.values ?? {}) : undefined}
    >
      {(id, describedBy) => (
        <div className='space-y-1'>
          <Textarea
            id={id}
            aria-describedby={describedBy}
            className='min-h-9 font-mono text-xs'
            rows={Math.min(4, Math.ceil(props.value.length / 80) || 1)}
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
          />
          <p className='text-muted-foreground text-xs'>
            {t('Usable: {{holders}}', {
              holders: usableHolders(props.part, props.value)
                .map((name) => `{{${name}}} ${holders[name]}`)
                .join(', '),
            })}
          </p>
        </div>
      )}
    </EditField>
  )
}

function HelpTable(props: { heads: string[]; rows: string[][] }) {
  return (
    <div className='overflow-x-auto rounded-lg border'>
      <table className='w-full text-xs'>
        <thead>
          <tr className='border-b'>
            {props.heads.map((head) => (
              <th
                key={head}
                scope='col'
                className='p-2 text-left font-medium whitespace-nowrap'
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((cells) => (
            <tr key={cells.join(' ')} className='border-b last:border-0'>
              {props.heads.map((head, column) => (
                <td
                  key={head}
                  className={`p-2 align-top ${column ? 'font-mono break-all' : ''}`}
                >
                  {cells[column]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Examples for the inputs on screen, so a video is never shown an image's structure or a reference a frame's. */
function ShapeHelp(props: { parts: string[]; list: boolean; mode: MediaMode }) {
  const { t } = useTranslation()
  const timed = props.parts.some((part) => part === 'video' || part === 'audio')
  const label: Record<string, string> = {
    text: t('Prompt'),
    first: t('First frame'),
    last: t('Last frame'),
    reference: t('Reference image'),
    video: t('Reference video'),
    audio: t('Reference audio'),
  }
  const listExamples: Array<[string, string]> = [
    ['text', '{"type": "text", "text": {{prompt}}}'],
    [
      'first',
      '{"type": "image_url", "image_url": {"url": {{url}}}, "role": "first_frame"}',
    ],
    [
      'last',
      '{"type": "image_url", "image_url": {"url": {{url}}}, "role": "last_frame"}',
    ],
    [
      'reference',
      '{"type": "image_url", "image_url": {"url": {{url}}}, "role": "reference_image"}',
    ],
    [
      'video',
      '{"type": "video_url", "video_url": {"url": {{url}}}, "role": "reference_video"}',
    ],
    [
      'audio',
      '{"type": "audio_url", "audio_url": {"url": {{url}}}, "role": "reference_audio"}',
    ],
  ]
  const timedExample =
    '{"url": {{url}}, "duration_seconds": {{durationSeconds}}}'
  let table
  if (props.list) {
    table = (
      <HelpTable
        heads={[t('Material'), t('Send content')]}
        rows={listExamples
          .filter(([key]) => props.parts.includes(key))
          .map(([key, text]) => [label[key], text])}
      />
    )
  } else if (props.mode === 'first') {
    table = (
      <HelpTable
        heads={[
          t('What the upstream wants'),
          t('Send content of the first frame'),
        ]}
        rows={[
          [t('The address only'), '{{url}}'],
          [t('The address in an object'), '{"url": {{url}}}'],
          [
            t('Marked as the first frame'),
            '{"url": {{url}}, "type": "first_frame"}',
          ],
        ]}
      />
    )
  } else if (props.mode === 'frames') {
    table = (
      <HelpTable
        heads={[
          t('What the upstream wants'),
          t('Send content of the first frame'),
          t('Send content of the last frame'),
        ]}
        rows={[
          [t('The address only'), '{{url}}', '{{url}}'],
          [
            t('Marked first and last'),
            '{"url": {{url}}, "type": "first_frame"}',
            '{"url": {{url}}, "type": "last_frame"}',
          ],
        ]}
      />
    )
  } else {
    const examples: Array<[string, string, string]> = [
      ['reference', t('The address only'), '{{url}}'],
      [
        'reference',
        t('Marked by use'),
        '{"url": {{url}}, "type": "reference_image"}',
      ],
      ['video', t('The address only'), '{{url}}'],
      ['video', t('With its length'), timedExample],
      ['audio', t('The address only'), '{{url}}'],
      ['audio', t('With its length'), timedExample],
    ]
    table = (
      <HelpTable
        heads={[t('Material'), t('What the upstream wants'), t('Send content')]}
        rows={examples
          .filter(([key]) => props.parts.includes(key))
          .map(([key, goal, text]) => [label[key], goal, text])}
      />
    )
  }
  return (
    <Collapsible>
      <FoldTrigger>{t('How to write send content')}</FoldTrigger>
      <CollapsibleContent className='mt-2 space-y-2'>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Copy the JSON of one item from the upstream documents and replace what changes with placeholders. Placeholders need no quotes; text needs double quotes, numbers and true or false do not.'
          )}{' '}
          {props.mode === 'reference'
            ? t(
                'With several materials each is sent like this; the system adds the outer list.'
              )
            : ''}{' '}
          {timed
            ? t(
                '{{placeholder}} is the length of the reference material itself, not the length to generate; it is left out when unknown.',
                {
                  placeholder: '{{durationSeconds}}',
                }
              )
            : ''}
        </p>
        {table}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** An expression that sends materials: by part when it is a list of parts, whole otherwise with where each material is. */
function ExpressionEditor(props: {
  draft: ChannelDraft
  body: BodyName
  index: number
  error?: string
  onChange: (next: ChannelDraft) => void
}) {
  const { t } = useTranslation()
  const row = props.draft[props.body][props.index]
  const roles = props.draft.roleMap
  const segs = exprSegments(row.expr, roles)
  const issue = segs ? null : exprIssue(row.expr)
  const setExpr = (expr: string) =>
    props.onChange(
      editMaterials(props.draft, (next) => {
        next[props.body][props.index].expr = expr
      })
    )
  const imageView = props.draft.capability === 'image.generate'
  const segmentLabels: Record<SegmentKind, [string, string]> = {
    mixed: [t('Several materials'), t('Several modes')],
    prompt: [t('Prompt part'), t('Every mode')],
    first: [t('First frame part'), t('First frame, first and last frames')],
    last: [t('Last frame part'), t('First and last frames')],
    reference: [
      t('Reference image part'),
      imageView ? t('With reference images') : t('All references'),
    ],
    images: [
      imageView ? t('Reference image part') : t('Image part'),
      imageView
        ? t('With reference images')
        : t('First frame, first and last frames, all references'),
    ],
    video: [t('Reference video part'), t('All references')],
    audio: [t('Reference audio part'), t('All references')],
    other: [t('Fixed content'), t('Every mode')],
  }
  return (
    <div className='space-y-2'>
      <EditField label={t('Field name')}>
        {(id, describedBy) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            className='max-w-64 font-mono'
            value={row.field}
            onChange={(event) =>
              props.onChange(
                editMaterials(props.draft, (next) => {
                  next[props.body][props.index].field = event.target.value
                })
              )
            }
          />
        )}
      </EditField>
      {segs ? (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>
            {t(
              'The expression is split by material. Switch to a mode to see the request of the part you change. When a part only differs in structure, the send content of "All in one list" is simpler.'
            )}
          </p>
          {segs.texts.map((text, part) => {
            const [label, modes] = segmentLabels[segmentKind(text, roles)]
            return (
              <EditField
                // A part is its place in the expression: the text changes while it is edited, and parts never move.
                // eslint-disable-next-line react/no-array-index-key
                key={part}
                label={label}
                help={t('Affects: {{modes}}', { modes })}
              >
                {(id, describedBy) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    className='font-mono text-xs'
                    rows={Math.min(14, Math.max(2, text.split('\n').length))}
                    value={text}
                    onChange={(event) =>
                      setExpr(
                        composeSegments({
                          ...segs,
                          texts: segs.texts.map((one, i) =>
                            i === part ? event.target.value : one
                          ),
                        })
                      )
                    }
                  />
                )}
              </EditField>
            )
          })}
        </div>
      ) : (
        <EditField
          label={t('Expression')}
          error={issue ? t(issue.key, issue.values ?? {}) : undefined}
        >
          {(id, describedBy) => (
            <div className='space-y-2'>
              <Textarea
                id={id}
                aria-describedby={describedBy}
                className='font-mono text-xs'
                rows={Math.min(
                  14,
                  Math.max(2, String(row.expr ?? '').split('\n').length)
                )}
                value={row.expr ?? ''}
                onChange={(event) => setExpr(event.target.value)}
              />
              {materialLines(row.expr, roles).length ? (
                <div className='space-y-1'>
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'This expression is not split by material; the table shows the lines of each material.'
                    )}
                  </p>
                  <HelpTable
                    heads={[t('Material'), t('Lines of the expression')]}
                    rows={materialLines(row.expr, roles)
                      .filter(
                        ({ kind }) => kind !== 'mixed' && kind !== 'other'
                      )
                      .map(({ kind, lines }) => [
                        segmentLabels[kind][0],
                        lines.join(', '),
                      ])}
                  />
                </div>
              ) : null}
            </div>
          )}
        </EditField>
      )}
      {props.error ? (
        <p role='alert' className='text-destructive text-xs'>
          {props.error}
        </p>
      ) : null}
    </div>
  )
}

/** Grouped by what the administrator does: change what was generated, take a value, combine. Roles come from this Channel. */
function ExpressionHelp(props: { draft: ChannelDraft }) {
  const { t } = useTranslation()
  const frames = props.draft.capability === 'video.generate'
  const role = (key: string, fallback: string) =>
    props.draft.roleMap[key] || fallback
  const pick = (name: string, roleName: string) =>
    `{"$call": "${name}", "args": [{"$ref": "media.images"}, "${roleName}"]}`
  const values: string[][] = [
    [t('Prompt'), '{"$ref": "request.prompt"}'],
    [t('Negative prompt'), '{"$ref": "request.negativePrompt"}'],
    [
      t('Ratio, quality, length'),
      '{"$ref": "request.aspectRatio"}, request.quality, request.durationSeconds',
    ],
    [t('Upstream model ID'), '{"$ref": "model.upstreamId"}'],
    [
      t('Custom parameter of the model'),
      '{"$ref": "request.rawParams.<name>"}',
    ],
    ...(frames
      ? [
          [
            t('First frame address'),
            pick('mediaUrlByRole', role('first-frame', 'first_frame')),
          ],
          [
            t('Last frame address'),
            pick('mediaUrlByRole', role('last-frame', 'last_frame')),
          ],
        ]
      : []),
    [
      t('Every reference image address'),
      pick('mediaUrlsByRole', role('image-reference', 'reference_image')),
    ],
    ...(frames
      ? [
          [
            t('Reference videos and audio'),
            '{"$ref": "media.videos"}, {"$ref": "media.audios"} (item.url)',
          ],
        ]
      : []),
  ]
  const combine: string[][] = [
    [
      t('Leave the field out when it has no value'),
      '{"$call": "omitEmpty", "args": [value]}',
    ],
    ...(frames
      ? [
          [
            t('Send this item only with a first frame'),
            '{"$if": first frame, "then": {...}, "else": {"$omit": true}}',
          ],
        ]
      : []),
    [
      t('One item per material'),
      '{"$map": {"from": list, "as": "item", "template": {"url": {"$ref": "item.url"}}}}',
    ],
    [
      t('Join parts into one list'),
      '{"$call": "concat", "args": [list 1, list 2]}',
    ],
  ]
  return (
    <Collapsible>
      <FoldTrigger>{t('How to write expressions')}</FoldTrigger>
      <CollapsibleContent className='mt-2 space-y-3'>
        <div className='space-y-1'>
          <strong className='text-sm font-medium'>
            {t('Step 1: change what was generated')}
          </strong>
          <p className='text-muted-foreground text-xs'>
            {t(
              'The expression is generated from the current structure; usually only key names or fixed text change. It says how the request is built, not the OpenAPI structure.'
            )}
          </p>
        </div>
        <div className='space-y-1'>
          <strong className='text-sm font-medium'>
            {t('Step 2: take values')}
          </strong>
          <HelpTable
            heads={[t('What to take'), t('How to write it')]}
            rows={values}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'Names such as {{role}} are the role names of this Channel; write them as shown.',
              {
                role: frames
                  ? role('first-frame', 'first_frame')
                  : role('image-reference', 'reference_image'),
              }
            )}
          </p>
        </div>
        <div className='space-y-1'>
          <strong className='text-sm font-medium'>
            {t('Step 3: combine')}
          </strong>
          <HelpTable
            heads={[t('What to do'), t('How to write it')]}
            rows={combine}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

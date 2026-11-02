/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

import type { OperationDraft, RequestRow } from '../../catalog-channel-draft'
import { MATERIAL_SOURCES } from '../../catalog-channel-materials'
import type { CatalogModelDefinition } from '../../catalog-edit-types'
import { EditField } from './EditFields'

const SCALAR_SOURCES = [
  'upstreamId',
  'aspectRatio',
  'quality',
  'durationSeconds',
  'generateAudio',
  'batchSize',
  'watermark',
  'background',
  'maxTokens',
]
const POLICY_SOURCES = ['size', 'apiQuality', 'count', 'ratio']
const USER_SOURCES = [
  'prompt',
  'promptOptional',
  'imageOne',
  'negativePrompt',
  'messages',
  'images',
  'videos',
  'audios',
  'imagesByRole',
  'imagesAlways',
  'imageFiles',
  'imagesBase64',
  'videoFiles',
  'videosBase64',
  'audioFiles',
  'audiosBase64',
  'firstFrame',
  'lastFrame',
]
const FIXED_SOURCES = ['fixed', 'expr', 'orientation']
const CHAT_SOURCES = new Set([
  'upstreamId',
  'prompt',
  'messages',
  'maxTokens',
  'fixed',
  'expr',
])
const NOT_OFFERED: Record<string, string[]> = {
  'video.generate': [
    'promptOptional',
    'imageOne',
    'background',
    'messages',
    'maxTokens',
    'size',
    'apiQuality',
    'count',
    'ratio',
    'imageFiles',
    'imagesBase64',
    'imagesAlways',
    'imagesByRole',
    'modelSize',
    'batchSize',
  ],
  'image.generate': [
    'videoFiles',
    'videosBase64',
    'audioFiles',
    'audiosBase64',
    'messages',
    'maxTokens',
    'durationSeconds',
    'generateAudio',
    'watermark',
    'videos',
    'audios',
    'firstFrame',
    'lastFrame',
    'orientation',
    'modelSize',
    'ratio',
    'imagesByRole',
    'imagesAlways',
  ],
}

type Group = 'model' | 'user' | 'fixed'

function groupOf(source: string): Group {
  if (USER_SOURCES.includes(source)) return 'user'
  return FIXED_SOURCES.includes(source) ? 'fixed' : 'model'
}

function sourcesFor(
  capability: string,
  group: Group,
  current: string
): string[] {
  const modelSources = [
    ...SCALAR_SOURCES,
    ...POLICY_SOURCES,
    'modelSize',
    'option',
  ]
  const allByGroup: Record<string, readonly string[]> = {
    user: USER_SOURCES,
    fixed: FIXED_SOURCES,
  }
  const all = allByGroup[group] ?? modelSources
  return all.filter(
    (source) =>
      source === current ||
      (capability === 'chat.generate'
        ? CHAT_SOURCES.has(source)
        : !NOT_OFFERED[capability]?.includes(source))
  )
}

// What each value is when it reaches the upstream, so the type column always says it.
const SCALAR_TYPE: Record<string, 'string' | 'number' | 'integer' | 'boolean'> =
  {
    upstreamId: 'string',
    prompt: 'string',
    aspectRatio: 'string',
    quality: 'string',
    durationSeconds: 'number',
    generateAudio: 'boolean',
    batchSize: 'integer',
    watermark: 'boolean',
    background: 'string',
    maxTokens: 'integer',
  }
const MAP_ROW =
  'grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_9rem_2.5rem] sm:items-start'

export function RowsEditor(props: {
  rows: RequestRow[]
  capability: string
  name: 'rows' | 'imageRows'
  errorOf: (path: string) => string | undefined
  models?: CatalogModelDefinition[]
  /** A video or image form edits the prompt and materials by mode in place of the user-input group. */
  materials?: { title: string; note: string; content: ReactNode }
  onChange: (rows: RequestRow[]) => void
}) {
  const { t } = useTranslation()
  const materialRow = (row: RequestRow) =>
    Boolean(props.materials) &&
    (MATERIAL_SOURCES.includes(row.source) ||
      (row.source === 'expr' && /"media\./.test(row.expr ?? '')))
  const labels: Record<string, string> = {
    upstreamId: t('Upstream model ID'),
    prompt: t('Prompt text'),
    aspectRatio: t('Aspect ratio'),
    quality: t('Quality tier'),
    durationSeconds: t('Duration (seconds)'),
    generateAudio: t('Generate audio'),
    batchSize: t('Count (nested field)'),
    watermark: t('Watermark'),
    background: t('Transparent background'),
    maxTokens: t('Output limit'),
    promptOptional: t('Prompt (may be empty)'),
    imageOne: t('Reference image address (one)'),
    messages: t('User message (messages)'),
    negativePrompt: t('Negative prompt'),
    orientation: t('Orientation (from the ratio)'),
    modelSize: t('Size (model parameter)'),
    imageFiles: t('Reference image files (list)'),
    imagesBase64: t('Reference image base64 (list)'),
    videoFiles: t('Reference video files (list)'),
    videosBase64: t('Reference video base64 (list)'),
    audioFiles: t('Reference audio files (list)'),
    audiosBase64: t('Reference audio base64 (list)'),
    imagesAlways: t('Reference image addresses (list, always sent)'),
    images: t('Reference image addresses (list)'),
    videos: t('Reference video addresses (list)'),
    audios: t('Reference audio addresses (list)'),
    imagesByRole: t('Reference image addresses (by role)'),
    firstFrame: t('First frame address'),
    lastFrame: t('Last frame address'),
    size: t('Size (from the size table)'),
    apiQuality: t('Image quality'),
    count: t('Count'),
    ratio: t('Aspect ratio (own field)'),
    option: t('Custom parameter'),
    fixed: t('Fixed value'),
    expr: t('Expression'),
  }
  const typeChoices: Record<string, Array<[string, string]>> = {
    string: [
      ['', t('Text (as it is)')],
      ['lowercase', t('Text (lowercase)')],
      ['uppercase', t('Text (uppercase)')],
    ],
    number: [
      ['', t('Number (as it is)')],
      ['trim', t('String')],
      ['integer', t('Integer')],
    ],
    integer: [
      ['', t('Integer (as it is)')],
      ['trim', t('String')],
      ['number', t('Number')],
    ],
    boolean: [
      ['', t('Boolean (as it is)')],
      ['trim', t('String')],
    ],
  }
  const transformLabels: Record<string, string> = {
    lowercase: t('Lowercase'),
    uppercase: t('Uppercase'),
    trim: t('As text'),
    number: t('As a number'),
    integer: t('As an integer'),
    boolean: t('As a boolean'),
  }
  const shownType: Record<string, string> = {
    messages: t('List of objects'),
    negativePrompt: t('String'),
    orientation: t('String'),
    modelSize: t('String'),
    imageFiles: t('List of files'),
    imagesBase64: t('List of text'),
    videoFiles: t('List of files'),
    videosBase64: t('List of text'),
    audioFiles: t('List of files'),
    audiosBase64: t('List of text'),
    imagesAlways: t('List of text'),
    images: t('List of text'),
    videos: t('List of text'),
    audios: t('List of text'),
    imagesByRole: t('List of text'),
    imageOne: t('String'),
    firstFrame: t('String'),
    lastFrame: t('String'),
    promptOptional: t('String'),
    size: t('String'),
    apiQuality: t('String'),
    count: t('Integer'),
    ratio: t('String'),
  }
  const groups: Array<{
    id: Group
    title: string
    note: string
    add: RequestRow
  }> = [
    {
      id: 'model',
      title: t('Model settings'),
      note: t(
        'The values come from the parameters of the model or the choice of the user. Each model must fill in a custom parameter once it is added.'
      ),
      add: { field: '', source: 'option', transform: '', paramType: 'string' },
    },
    {
      id: 'user',
      title: t('User input'),
      note: t('The user provides it for each generation.'),
      add: { field: '', source: 'prompt', transform: '' },
    },
    {
      id: 'fixed',
      title: t('Fixed by the Channel'),
      note: t('The value is written here and is the same for all models.'),
      add: {
        field: '',
        source: 'fixed',
        transform: '',
        fixed: '',
        fixedType: 'string',
      },
    },
  ]
  const paramLabels: Record<string, string> = {
    aspectRatio: t('Aspect ratio'),
    quality: t('Quality tier'),
    apiQuality: t('Image quality'),
    durationSeconds: t('Length'),
    generateAudio: t('Generate audio'),
    batchSize: t('Count'),
    background: t('Transparent background'),
  }
  const missingOn = (source: string) =>
    (props.models ?? []).filter(
      (model) =>
        model.release.publicInteraction.defaultParams[source] === undefined
    ).length
  const update = (index: number, next: Partial<RequestRow>) =>
    props.onChange(
      props.rows.map((row, position) =>
        position === index ? { ...row, ...next } : row
      )
    )
  return (
    <div className='space-y-3 md:col-span-2'>
      {groups.map((group) => {
        if (group.id === 'user' && props.materials) {
          return (
            <div
              key={group.id}
              className='grid justify-items-stretch gap-2 border-t pt-3'
            >
              <div className='grid gap-0.5'>
                <strong className='font-medium'>{props.materials.title}</strong>
                <p className='text-muted-foreground text-xs'>
                  {props.materials.note}
                </p>
              </div>
              {props.materials.content}
            </div>
          )
        }
        const own = props.rows
          .map((row, index) => ({ row, index }))
          .filter(
            ({ row }) => groupOf(row.source) === group.id && !materialRow(row)
          )
        return (
          <div
            key={group.id}
            className='grid justify-items-stretch gap-2 border-t pt-3'
          >
            <div className='grid gap-0.5'>
              <strong className='font-medium'>{group.title}</strong>
              <p className='text-muted-foreground text-xs'>{group.note}</p>
            </div>
            {own.length ? (
              <div
                aria-hidden='true'
                className={`text-muted-foreground hidden text-xs sm:grid ${MAP_ROW}`}
              >
                <span>{t('Upstream field')}</span>
                <span>
                  {group.id === 'fixed' ? t('Value') : t('Value from')}
                </span>
                <span>{t('Type')}</span>
                <span />
              </div>
            ) : null}
            {own.map(({ row, index }) => {
              const scalarType = SCALAR_TYPE[row.source]
              const stored = row.transform ?? ''
              const choices = scalarType ? typeChoices[scalarType] : []
              const allChoices =
                scalarType && !choices.some(([value]) => value === stored)
                  ? [
                      ...choices,
                      [stored, transformLabels[stored] ?? stored] as [
                        string,
                        string,
                      ],
                    ]
                  : choices
              return (
                <div key={index} role='row' className={MAP_ROW}>
                  <div className='min-w-0 space-y-1'>
                    <Input
                      aria-label={t('Upstream field')}
                      aria-invalid={
                        props.errorOf(`${props.name}.${index}.field`)
                          ? true
                          : undefined
                      }
                      className='font-mono'
                      placeholder={t('Upstream field')}
                      value={row.field}
                      onChange={(event) =>
                        update(index, { field: event.target.value })
                      }
                    />
                    {props.errorOf(`${props.name}.${index}.field`) ? (
                      <p role='alert' className='text-destructive text-xs'>
                        {props.errorOf(`${props.name}.${index}.field`)}
                      </p>
                    ) : null}
                  </div>
                  <NativeSelect
                    aria-label={t('Value of {{field}}', { field: row.field })}
                    className='w-full'
                    value={row.source}
                    onChange={(event) =>
                      update(index, {
                        source: event.target.value,
                        transform: '',
                        ...(event.target.value === 'fixed'
                          ? { fixed: '', fixedType: 'string' }
                          : {}),
                        ...(event.target.value === 'option'
                          ? { paramType: 'string' }
                          : {}),
                      })
                    }
                  >
                    {sourcesFor(props.capability, group.id, row.source).map(
                      (source) => (
                        <NativeSelectOption key={source} value={source}>
                          {labels[source] ?? source}
                        </NativeSelectOption>
                      )
                    )}
                  </NativeSelect>
                  <div className='min-w-0'>
                    {scalarType &&
                    ['upstreamId', 'prompt'].includes(row.source) &&
                    !row.transform ? (
                      <div className='text-muted-foreground min-h-8 py-1.5 text-sm'>
                        {t('String')}
                      </div>
                    ) : null}
                    {scalarType &&
                    (!['upstreamId', 'prompt'].includes(row.source) ||
                      row.transform) ? (
                      <NativeSelect
                        aria-label={t('Type of {{field}}', {
                          field: row.field,
                        })}
                        className='w-full'
                        value={stored}
                        onChange={(event) =>
                          update(index, { transform: event.target.value })
                        }
                      >
                        {allChoices.map(([value, label]) => (
                          <NativeSelectOption key={value} value={value}>
                            {label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    ) : null}
                    {row.source === 'fixed' || row.source === 'option' ? (
                      <NativeSelect
                        aria-label={t('Type of {{field}}', {
                          field: row.field,
                        })}
                        className='w-full'
                        value={
                          (row.source === 'fixed'
                            ? row.fixedType
                            : row.paramType) ?? 'string'
                        }
                        onChange={(event) =>
                          update(
                            index,
                            row.source === 'fixed'
                              ? {
                                  fixedType: event.target
                                    .value as RequestRow['fixedType'],
                                }
                              : {
                                  paramType: event.target
                                    .value as RequestRow['paramType'],
                                }
                          )
                        }
                      >
                        <NativeSelectOption value='string'>
                          {t('String')}
                        </NativeSelectOption>
                        <NativeSelectOption value='number'>
                          {t('Number')}
                        </NativeSelectOption>
                        <NativeSelectOption value='boolean'>
                          {t('Boolean')}
                        </NativeSelectOption>
                      </NativeSelect>
                    ) : null}
                    {!scalarType &&
                    row.source !== 'fixed' &&
                    row.source !== 'option' &&
                    row.source !== 'expr' ? (
                      <div className='text-muted-foreground min-h-8 py-1.5 text-sm'>
                        {shownType[row.source] ?? ''}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type='button'
                    className='text-primary justify-self-start py-1.5 text-sm hover:underline'
                    aria-label={t('Delete field {{field}}', {
                      field: row.field,
                    })}
                    onClick={() =>
                      props.onChange(
                        props.rows.filter((_, position) => position !== index)
                      )
                    }
                  >
                    {t('Delete')}
                  </button>
                  {paramLabels[row.source] && missingOn(row.source) ? (
                    <p className='text-muted-foreground text-xs sm:col-span-4'>
                      {t(
                        '{{count}} models have no {{param}}; they do not send this field.',
                        {
                          count: missingOn(row.source),
                          param: paramLabels[row.source],
                        }
                      )}
                    </p>
                  ) : null}
                  {row.source === 'option' ? (
                    <p className='text-muted-foreground text-xs sm:col-span-4'>
                      {props.models
                        ? t(
                            'Fill in the value under "Values of each model" below, or under "Parameters" of the model.'
                          )
                        : t(
                            'The value is filled in under "Parameters" of the model.'
                          )}
                    </p>
                  ) : null}
                  {row.source === 'fixed' ? (
                    <div className='sm:col-span-4'>
                      {row.fixedType === 'boolean' ? (
                        <NativeSelect
                          aria-label={t('Fixed value')}
                          className='w-32'
                          value={row.fixed === 'false' ? 'false' : 'true'}
                          onChange={(event) =>
                            update(index, { fixed: event.target.value })
                          }
                        >
                          <NativeSelectOption value='true'>
                            true
                          </NativeSelectOption>
                          <NativeSelectOption value='false'>
                            false
                          </NativeSelectOption>
                        </NativeSelect>
                      ) : (
                        <Input
                          aria-label={t('Fixed value')}
                          className='font-mono'
                          type={row.fixedType === 'number' ? 'number' : 'text'}
                          placeholder={
                            row.fixedType === 'number'
                              ? t('The number sent, such as 1')
                              : t('The text sent, such as url')
                          }
                          value={row.fixed ?? ''}
                          onChange={(event) =>
                            update(index, { fixed: event.target.value })
                          }
                        />
                      )}
                      {props.errorOf(`${props.name}.${index}.fixed`) ? (
                        <p
                          role='alert'
                          className='text-destructive mt-1 text-xs'
                        >
                          {props.errorOf(`${props.name}.${index}.fixed`)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {row.source === 'expr' ? (
                    <div className='space-y-1 sm:col-span-4'>
                      <Textarea
                        aria-label={t('Expression')}
                        rows={3}
                        className='font-mono text-xs'
                        value={row.expr ?? ''}
                        onChange={(event) =>
                          update(index, { expr: event.target.value })
                        }
                      />
                      {props.errorOf(`${props.name}.${index}.expr`) ? (
                        <p role='alert' className='text-destructive text-xs'>
                          {props.errorOf(`${props.name}.${index}.expr`)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='justify-self-start'
              onClick={() => props.onChange([...props.rows, group.add])}
            >
              {group.id === 'model' && props.capability !== 'chat.generate'
                ? t('Add a custom parameter')
                : t('Add a field')}
            </Button>
          </div>
        )
      })}
      {props.errorOf(props.name) ? (
        <p role='alert' className='text-destructive text-xs'>
          {props.errorOf(props.name)}
        </p>
      ) : null}
    </div>
  )
}

export function OperationFields(props: {
  operation: OperationDraft
  label: string
  help?: string
  error?: string
  withFormat: boolean
  placeholder: string
  onChange: (next: OperationDraft) => void
}) {
  const { t } = useTranslation()
  return (
    <EditField label={props.label} wide error={props.error} help={props.help}>
      {(id, describedBy) => (
        <div
          className={`grid gap-2 sm:items-center ${props.withFormat ? 'sm:grid-cols-[6rem_minmax(0,1fr)_11rem]' : 'sm:grid-cols-[6rem_minmax(0,1fr)]'}`}
        >
          <NativeSelect
            aria-label={t('Method of {{operation}}', {
              operation: props.label,
            })}
            className='w-full'
            value={props.operation.method}
            onChange={(event) =>
              props.onChange({ ...props.operation, method: event.target.value })
            }
          >
            {['POST', 'PUT', 'GET', 'DELETE'].map((method) => (
              <NativeSelectOption key={method} value={method}>
                {method}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Input
            id={id}
            aria-describedby={describedBy}
            className='font-mono'
            aria-invalid={props.error ? true : undefined}
            placeholder={props.placeholder}
            value={props.operation.path}
            onChange={(event) =>
              props.onChange({ ...props.operation, path: event.target.value })
            }
          />
          {props.withFormat ? (
            <NativeSelect
              aria-label={t('Request format')}
              className='w-full'
              value={props.operation.format ?? 'application/json'}
              onChange={(event) =>
                props.onChange({
                  ...props.operation,
                  format: event.target.value,
                })
              }
            >
              <NativeSelectOption value='application/json'>
                JSON
              </NativeSelectOption>
              <NativeSelectOption value='multipart/form-data'>
                {t('File form (multipart)')}
              </NativeSelectOption>
            </NativeSelect>
          ) : null}
        </div>
      )}
    </EditField>
  )
}

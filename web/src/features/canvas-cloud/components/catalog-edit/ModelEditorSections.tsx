/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  REQUEST_VALIDATOR_MEDIA_CONSTRAINT_FIELDS,
  videoUpscaleOperation,
} from '@pixmiao/model-catalog/request-validator'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

import type { Accepts } from '../../catalog-channel-draft'
import {
  displayPath,
  isValidAspectRatio,
  isValidQuality,
  normalizedQuality,
  type SentFields,
} from '../../catalog-edit-logic'
import type {
  CatalogCapability,
  CatalogJson,
  CatalogModelDefinition,
} from '../../catalog-edit-types'
import { tokenCategoryLabelKey } from '../../lib/token-rate-summary'
import type { CanvasTokenCategory } from '../../types'
import { fieldError } from './catalog-edit-errors'
import {
  EditField,
  EditSection,
  NumberField,
  SwitchField,
  ValueAdder,
  ValuePills,
} from './EditFields'

const RATIO_ORDER = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '5:4',
  '4:5',
  '2:1',
  '21:9',
  '7:4',
  '4:7',
  '1:4',
  '4:1',
  '1:8',
  '8:1',
]
const QUALITY_ORDER = ['480P', '720P', '768P', '1080P', '1K', '2K', '4K']

function byOrder(order: string[]) {
  return (left: string, right: string) =>
    (order.indexOf(left) + 1 || 99) - (order.indexOf(right) + 1 || 99) ||
    left.localeCompare(right)
}

export interface SectionProps {
  draft: CatalogModelDefinition
  base: CatalogModelDefinition | null
  sent: SentFields
  catalogValues: (capability: CatalogCapability, field: string) => string[]
  errors: Record<string, string>
  /** Sets one field by its dotted path under publicInteraction, as a list of keys. */
  set: (keys: string[], value: unknown) => void
  /** The published value when this field changed, for the "modified" mark. */
  was: (
    keys: string[],
    named?: (before: unknown) => string
  ) => string | undefined
}

function interactionOf(draft: CatalogModelDefinition) {
  return draft.release.publicInteraction
}

function toggled(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value]
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : []
}

function secondsList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const seconds = value
    .map(Number)
    .filter((entry) => Number.isSafeInteger(entry) && entry > 0)
  return [...new Set(seconds)].sort((left, right) => left - right)
}

// Switching how lengths are offered keeps what can be kept: a range becomes its values (only the default when there
// are too many to click through); choices become the range from the shortest to the longest, stepping by their gap
// when it is even, else by one second.
const MAX_CHOICES_FROM_RANGE = 12

function choicesFromRange(
  range: Record<string, number | undefined>,
  fallback: unknown
): number[] {
  const { min, max, step = 1 } = range
  const values: number[] = []
  if (min && max && step > 0 && max >= min) {
    for (
      let value = min;
      value <= max && values.length <= MAX_CHOICES_FROM_RANGE;
      value += step
    ) {
      values.push(value)
    }
  }
  if (values.length && values.length <= MAX_CHOICES_FROM_RANGE) return values
  return typeof fallback === 'number' ? [fallback] : []
}

function rangeFromChoices(choices: number[]) {
  const [min] = choices
  const max = choices.at(-1)
  if (min === undefined || max === undefined) return undefined
  const gaps = choices.slice(1).map((value, index) => value - choices[index])
  const even = gaps.length > 0 && gaps.every((gap) => gap === gaps[0])
  return { min, max, step: even ? gaps[0] : 1 }
}

/** A default chosen from the values offered above; with none offered yet, it says to choose those first. */
function DefaultSelect(props: {
  value: unknown
  options: string[]
  onChange: (next: string | undefined) => void
  id: string
  describedBy: string | undefined
}) {
  const { t } = useTranslation()
  return (
    <NativeSelect
      id={props.id}
      aria-describedby={props.describedBy}
      value={typeof props.value === 'string' ? props.value : ''}
      onChange={(event) => props.onChange(event.target.value || undefined)}
    >
      <NativeSelectOption value=''>
        {props.options.length
          ? t('Please select')
          : t('Choose the options first')}
      </NativeSelectOption>
      {props.options.map((option) => (
        <NativeSelectOption key={option} value={option}>
          {option}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

/** One parameter: the field it is sent as, its choices and its default. */
function ParameterRow(props: {
  name: string
  sentTo: string
  note?: string
  split?: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className='grid gap-2 border-t pt-3 md:col-span-2'>
      <div className='flex flex-wrap items-baseline gap-2'>
        <strong className='font-medium'>{props.name}</strong>
        {props.sentTo ? (
          <span className='text-primary text-xs'>
            {t('Sent as {{field}}', { field: props.sentTo })}
          </span>
        ) : null}
        {props.note ? (
          <span className='text-muted-foreground text-xs'>{props.note}</span>
        ) : null}
      </div>
      <div
        className={`grid items-start gap-3 ${props.split ? 'sm:grid-cols-[minmax(0,1fr)_11rem]' : 'grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]'}`}
      >
        {props.children}
      </div>
    </div>
  )
}

function CustomFieldControl(props: {
  field: SentFields['modelFields'][number]
  draft: CatalogModelDefinition
  set: SectionProps['set']
  error?: string
}) {
  const rowIds = useRef<string[]>([])
  const { t } = useTranslation()
  const { field, draft, set } = props
  const interaction = interactionOf(draft)
  const options = (interaction.paramSchema.options ?? []) as Array<{
    key: string
    label: string
    type: 'enum' | 'boolean'
    values?: Array<{ value: string; label: string }>
  }>
  const option = options.find((entry) => entry.key === field.key)
  const value = interaction.defaultParams[field.key]
  const setOption = (next: (typeof options)[number] | undefined) => {
    const rest = options.filter((entry) => entry.key !== field.key)
    const list = next ? [...rest, next] : rest
    set(['paramSchema', 'options'], list.length ? list : undefined)
  }
  if (field.type === 'boolean') {
    let mode = ''
    if (option) mode = 'choice'
    else if (value === '') mode = 'skip'
    else if (value !== undefined) mode = String(value)
    return (
      <>
        <EditField label={t('Value')} error={props.error}>
          {(id) => (
            <NativeSelect
              id={id}
              value={mode}
              onChange={(event) => {
                const next = event.target.value
                if (next === 'choice') {
                  setOption({
                    key: field.key,
                    label: field.field,
                    type: 'boolean',
                  })
                  set(['defaultParams', field.key], value === true)
                  return
                }
                setOption(undefined)
                if (next === 'skip') set(['defaultParams', field.key], '')
                else if (next === '') {
                  set(['defaultParams', field.key], undefined)
                } else set(['defaultParams', field.key], next === 'true')
              }}
            >
              <NativeSelectOption value=''>
                {t('Please select')}
              </NativeSelectOption>
              <NativeSelectOption value='true'>
                {t('Always send true')}
              </NativeSelectOption>
              <NativeSelectOption value='false'>
                {t('Always send false')}
              </NativeSelectOption>
              <NativeSelectOption value='choice'>
                {t('Let the user choose')}
              </NativeSelectOption>
              <NativeSelectOption value='skip'>
                {t('Do not send')}
              </NativeSelectOption>
            </NativeSelect>
          )}
        </EditField>
        {option ? (
          <EditField label={t('Name on the canvas')}>
            {(id) => (
              <Input
                id={id}
                value={option.label}
                onChange={(event) =>
                  setOption({ ...option, label: event.target.value })
                }
              />
            )}
          </EditField>
        ) : null}
      </>
    )
  }
  if (value === '') {
    return (
      <div className='flex flex-wrap items-center gap-2 md:col-span-2'>
        <span className='text-muted-foreground text-sm'>
          {t('This model does not send this field')}
        </span>
        <button
          type='button'
          className='text-primary text-sm hover:underline'
          onClick={() => set(['defaultParams', field.key], undefined)}
        >
          {t('Send it again')}
        </button>
      </div>
    )
  }
  const values = option?.values ?? [
    { value: value === undefined ? '' : String(value), label: '' },
  ]
  // The values have no identity of their own, and a row must keep its focus while its value is typed.
  while (rowIds.current.length < values.length) {
    rowIds.current.push(crypto.randomUUID())
  }
  const writeValues = (next: Array<{ value: string; label: string }>) => {
    if (next.length > 1 && field.type === 'string') {
      setOption({
        key: field.key,
        label: option?.label ?? field.field,
        type: 'enum',
        values: next,
      })
      const current = String(value ?? '')
      set(
        ['defaultParams', field.key],
        next.some((entry) => entry.value === current) ? current : next[0].value
      )
      return
    }
    setOption(undefined)
    const single = next[0]?.value ?? ''
    if (field.type === 'number') {
      set(
        ['defaultParams', field.key],
        single === '' ? undefined : Number(single)
      )
    } else set(['defaultParams', field.key], single === '' ? undefined : single)
  }
  return (
    <div className='space-y-2 md:col-span-2'>
      {values.map((entry, index) => (
        <div
          key={rowIds.current[index]}
          className='flex flex-wrap items-center gap-2'
        >
          <Input
            aria-label={t('Value of {{field}}', { field: field.field })}
            aria-invalid={props.error ? true : undefined}
            className='w-48 font-mono'
            type={field.type === 'number' ? 'number' : 'text'}
            value={entry.value}
            onChange={(event) =>
              writeValues(
                values.map((item, position) =>
                  position === index
                    ? { ...item, value: event.target.value }
                    : item
                )
              )
            }
          />
          {values.length > 1 ? (
            <>
              <Input
                aria-label={t('Name on the canvas')}
                className='w-40'
                placeholder={t('Name on the canvas')}
                value={entry.label}
                onChange={(event) =>
                  writeValues(
                    values.map((item, position) =>
                      position === index
                        ? { ...item, label: event.target.value }
                        : item
                    )
                  )
                }
              />
              <button
                type='button'
                className='text-muted-foreground text-sm hover:underline'
                onClick={() => {
                  rowIds.current.splice(index, 1)
                  writeValues(
                    values.filter((_, position) => position !== index)
                  )
                }}
              >
                {t('Delete')}
              </button>
            </>
          ) : null}
        </div>
      ))}
      <div className='flex flex-wrap items-center gap-3'>
        {field.type === 'string' ? (
          <button
            type='button'
            className='text-primary text-sm hover:underline'
            onClick={() => writeValues([...values, { value: '', label: '' }])}
          >
            {t('Add a value')}
          </button>
        ) : null}
        <button
          type='button'
          className='text-primary text-sm hover:underline'
          onClick={() => {
            setOption(undefined)
            set(['defaultParams', field.key], '')
          }}
        >
          {t('Do not send')}
        </button>
      </div>
      {props.error ? (
        <p role='alert' className='text-destructive text-xs'>
          {props.error}
        </p>
      ) : null}
    </div>
  )
}

export function ModelParametersSection(props: SectionProps) {
  const { t } = useTranslation()
  const { draft, sent, set, was, errors } = props
  const cap = draft.capability
  if (cap === 'chat.generate') return null
  const errorAt = (...keys: string[]) => fieldError(errors, keys)
  const interaction = interactionOf(draft)
  const schema = interaction.paramSchema
  const defaults = interaction.defaultParams
  const ratios = stringList(schema.aspectRatios)
  const qualities = stringList(schema.qualities)
  const apiQualities = stringList(schema.apiQualities)
  const range = (schema.durationRange ?? {}) as Record<
    string,
    number | undefined
  >
  const byQuality = (schema.durationRangeByQuality ?? undefined) as
    | Record<string, Record<string, number | undefined>>
    | undefined
  const durationChoices = secondsList(schema.durations)
  const durationMode = Array.isArray(schema.durations) ? 'choices' : 'range'
  const placeholder = t('Please select')
  const ratioChoices = [
    ...new Set([...props.catalogValues(cap, 'aspectRatios'), ...ratios]),
  ].sort(byOrder(RATIO_ORDER))
  const qualityChoices = [
    ...new Set([...props.catalogValues(cap, 'qualities'), ...qualities]),
  ].sort(byOrder(QUALITY_ORDER))
  const apiQualityLabels = {
    low: t('Low'),
    medium: t('Medium'),
    high: t('High'),
  }
  const transparent = stringList(schema.backgroundModes).includes('transparent')

  type Row = {
    key: string
    name: string
    sentTo: string
    note?: string
    body: React.ReactNode
  }
  const splitRows = new Set(['ratio', 'quality', 'apiQuality'])
  const rows: Row[] = []
  // Design 12.2: a row appears when the Channel sends it, or stays visible when the model already has a value.
  if (sent.aspectRatio.length || ratios.length) {
    rows.push({
      key: 'ratio',
      name: t('Aspect ratio'),
      sentTo: sent.aspectRatio.join(', '),
      body: (
        <>
          <EditField
            label={t('Choices')}
            error={errorAt('paramSchema', 'aspectRatios')}
            was={was(['paramSchema', 'aspectRatios'])}
          >
            {() => (
              <div className='space-y-2'>
                <ValuePills
                  label={t('Aspect ratio')}
                  options={ratioChoices}
                  selected={ratios}
                  onToggle={(value) =>
                    set(['paramSchema', 'aspectRatios'], toggled(ratios, value))
                  }
                />
                <ValueAdder
                  placeholder={t('Enter a ratio, such as 3:1')}
                  actionLabel={t('Add aspect ratio')}
                  fieldLabel={t('Aspect ratio to add')}
                  validate={(value) => {
                    if (!isValidAspectRatio(value)) {
                      return t('Write it as width:height with positive numbers')
                    }
                    return ratios.includes(value)
                      ? t('This aspect ratio already exists')
                      : undefined
                  }}
                  onAdd={(value) =>
                    set(['paramSchema', 'aspectRatios'], [...ratios, value])
                  }
                />
              </div>
            )}
          </EditField>
          <EditField
            label={t('Default')}
            error={errorAt('defaultParams', 'aspectRatio')}
            was={was(['defaultParams', 'aspectRatio'])}
          >
            {(id, describedBy) => (
              <DefaultSelect
                value={defaults.aspectRatio}
                options={ratios}
                onChange={(next) => set(['defaultParams', 'aspectRatio'], next)}
                id={id}
                describedBy={describedBy}
              />
            )}
          </EditField>
        </>
      ),
    })
  }
  if (sent.quality.length || qualities.length) {
    rows.push({
      key: 'quality',
      name: t('Quality tier'),
      sentTo: sent.quality.join(', '),
      body: (
        <>
          <EditField
            label={t('Choices')}
            help={t('Leave empty to not distinguish resolutions')}
            error={errorAt('paramSchema', 'qualities')}
            was={was(['paramSchema', 'qualities'])}
          >
            {() => (
              <div className='space-y-2'>
                <ValuePills
                  label={t('Quality tier')}
                  options={qualityChoices}
                  selected={qualities}
                  onToggle={(value) =>
                    set(['paramSchema', 'qualities'], toggled(qualities, value))
                  }
                />
                <ValueAdder
                  placeholder={t('Enter a resolution, such as 1440P')}
                  actionLabel={t('Add resolution')}
                  fieldLabel={t('Resolution to add')}
                  normalize={normalizedQuality}
                  validate={(value) => {
                    if (!isValidQuality(value)) {
                      return t(
                        'Use letters, numbers, dots, hyphens and underscores only'
                      )
                    }
                    return qualities.includes(value)
                      ? t('This resolution already exists')
                      : undefined
                  }}
                  onAdd={(value) =>
                    set(['paramSchema', 'qualities'], [...qualities, value])
                  }
                />
              </div>
            )}
          </EditField>
          {qualities.length ? (
            <EditField
              label={t('Default')}
              error={errorAt('defaultParams', 'quality')}
              was={was(['defaultParams', 'quality'])}
            >
              {(id, describedBy) => (
                <DefaultSelect
                  value={defaults.quality}
                  options={qualities}
                  onChange={(next) => set(['defaultParams', 'quality'], next)}
                  id={id}
                  describedBy={describedBy}
                />
              )}
            </EditField>
          ) : null}
        </>
      ),
    })
  }
  if (
    cap === 'image.generate' &&
    (sent.apiQuality.length || apiQualities.length)
  ) {
    rows.push({
      key: 'apiQuality',
      name: t('Image quality'),
      sentTo: sent.apiQuality.join(', '),
      body: (
        <>
          <EditField
            label={t('Choices')}
            error={errorAt('paramSchema', 'apiQualities')}
            was={was(['paramSchema', 'apiQualities'])}
          >
            {() => (
              <ValuePills
                label={t('Image quality')}
                options={['low', 'medium', 'high']}
                labels={apiQualityLabels}
                selected={apiQualities}
                onToggle={(value) =>
                  set(
                    ['paramSchema', 'apiQualities'],
                    toggled(apiQualities, value)
                  )
                }
              />
            )}
          </EditField>
          {apiQualities.length ? (
            <EditField
              label={t('Default')}
              error={errorAt('defaultParams', 'apiQuality')}
              was={was(['defaultParams', 'apiQuality'])}
            >
              {(id, describedBy) => (
                <DefaultSelect
                  value={defaults.apiQuality}
                  options={apiQualities}
                  onChange={(next) =>
                    set(['defaultParams', 'apiQuality'], next)
                  }
                  id={id}
                  describedBy={describedBy}
                />
              )}
            </EditField>
          ) : null}
        </>
      ),
    })
  }
  if (cap === 'video.generate') {
    if (
      sent.durationSeconds.length ||
      schema.durationRange ||
      schema.durations ||
      defaults.durationSeconds !== undefined
    ) {
      rows.push({
        key: 'duration',
        name: t('Length'),
        sentTo: sent.durationSeconds.join(', '),
        body: (
          <>
            <EditField
              label={t('Value mode')}
              help={
                durationMode === 'choices'
                  ? t('Fixed choices do not differ by resolution')
                  : t(
                      'Choose fixed choices when the upstream accepts only some lengths'
                    )
              }
            >
              {(id, describedBy) => (
                <NativeSelect
                  id={id}
                  className='w-full'
                  aria-describedby={describedBy}
                  value={durationMode}
                  onChange={(event) => {
                    if (event.target.value === durationMode) return
                    if (event.target.value === 'choices') {
                      set(
                        ['paramSchema', 'durations'],
                        choicesFromRange(range, defaults.durationSeconds)
                      )
                      set(['paramSchema', 'durationRange'], undefined)
                      set(['paramSchema', 'durationRangeByQuality'], undefined)
                      return
                    }
                    set(
                      ['paramSchema', 'durationRange'],
                      rangeFromChoices(durationChoices)
                    )
                    set(['paramSchema', 'durations'], undefined)
                  }}
                >
                  <NativeSelectOption value='range'>
                    {t('Continuous range')}
                  </NativeSelectOption>
                  <NativeSelectOption value='choices'>
                    {t('Fixed choices')}
                  </NativeSelectOption>
                </NativeSelect>
              )}
            </EditField>
            {durationMode === 'choices' ? (
              <>
                <EditField
                  label={t('Default')}
                  error={errorAt('defaultParams', 'durationSeconds')}
                  was={was(['defaultParams', 'durationSeconds'])}
                >
                  {(id, describedBy) => (
                    <NativeSelect
                      id={id}
                      className='w-full'
                      aria-describedby={describedBy}
                      aria-invalid={
                        errorAt('defaultParams', 'durationSeconds')
                          ? true
                          : undefined
                      }
                      value={
                        typeof defaults.durationSeconds === 'number'
                          ? String(defaults.durationSeconds)
                          : ''
                      }
                      onChange={(event) =>
                        set(
                          ['defaultParams', 'durationSeconds'],
                          event.target.value
                            ? Number(event.target.value)
                            : undefined
                        )
                      }
                    >
                      <NativeSelectOption value=''>
                        {durationChoices.length
                          ? t('Please select')
                          : t('Choose the options first')}
                      </NativeSelectOption>
                      {durationChoices.map((seconds) => (
                        <NativeSelectOption
                          key={seconds}
                          value={String(seconds)}
                        >
                          {t('{{seconds}} s', { seconds })}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                </EditField>
                <EditField
                  label={t('Choices')}
                  wide
                  help={t(
                    'Lengths other video models use are listed; the lit ones apply to this model'
                  )}
                  error={errorAt('paramSchema', 'durations')}
                  was={was(['paramSchema', 'durations'])}
                >
                  {() => {
                    const offered = secondsList([
                      ...props.catalogValues(cap, 'durations'),
                      ...durationChoices,
                    ])
                    return (
                      <div className='space-y-2'>
                        <ValuePills
                          label={t('Length')}
                          options={offered.map(String)}
                          labels={Object.fromEntries(
                            offered.map((seconds) => [
                              String(seconds),
                              t('{{seconds}} s', { seconds }),
                            ])
                          )}
                          selected={durationChoices.map(String)}
                          onToggle={(value) =>
                            set(
                              ['paramSchema', 'durations'],
                              secondsList(
                                toggled(durationChoices.map(String), value)
                              )
                            )
                          }
                        />
                        <div className='max-w-sm'>
                          <ValueAdder
                            placeholder={t('Enter seconds, such as 30')}
                            actionLabel={t('Add length')}
                            fieldLabel={t('Length to add')}
                            validate={(value) => {
                              if (!/^[1-9][0-9]*$/.test(value.trim())) {
                                return t('Enter a whole number of seconds')
                              }
                              return durationChoices.includes(Number(value))
                                ? t('This length already exists')
                                : undefined
                            }}
                            onAdd={(value) =>
                              set(
                                ['paramSchema', 'durations'],
                                secondsList([...durationChoices, Number(value)])
                              )
                            }
                          />
                        </div>
                      </div>
                    )
                  }}
                </EditField>
              </>
            ) : (
              <>
                {(['min', 'max', 'step'] as const).map((part) => (
                  <NumberField
                    key={part}
                    label={
                      {
                        min: t('Shortest (seconds)'),
                        max: t('Longest (seconds)'),
                        step: t('Step (seconds)'),
                      }[part]
                    }
                    value={range[part]}
                    error={errorAt('paramSchema', 'durationRange', part)}
                    was={was(['paramSchema', 'durationRange', part])}
                    onChange={(next) =>
                      set(['paramSchema', 'durationRange', part], next)
                    }
                  />
                ))}
                <NumberField
                  label={t('Default (seconds)')}
                  value={defaults.durationSeconds}
                  error={errorAt('defaultParams', 'durationSeconds')}
                  was={was(['defaultParams', 'durationSeconds'])}
                  onChange={(next) =>
                    set(['defaultParams', 'durationSeconds'], next)
                  }
                />
                <EditField
                  label={t('Limit duration by resolution')}
                  wide
                  help={
                    qualities.length
                      ? t(
                          'Fill only what differs; empty keeps the overall range'
                        )
                      : t('Choose resolutions first')
                  }
                  error={errorAt('paramSchema', 'durationRangeByQuality')}
                >
                  {() => (
                    <div className='space-y-2'>
                      <SwitchField
                        label={t('Limit duration by resolution')}
                        checked={Boolean(byQuality)}
                        disabled={!qualities.length}
                        onChange={(next) =>
                          set(
                            ['paramSchema', 'durationRangeByQuality'],
                            next ? {} : undefined
                          )
                        }
                      />
                      {byQuality
                        ? qualities.map((quality) => (
                            <div
                              key={quality}
                              className='flex flex-wrap items-center gap-2'
                            >
                              <span className='text-muted-foreground w-14 shrink-0 text-xs'>
                                {quality}
                              </span>
                              {(['min', 'max', 'step'] as const).map((part) => (
                                <Input
                                  key={part}
                                  className='w-28'
                                  type='number'
                                  aria-label={t('{{quality}} {{part}}', {
                                    quality,
                                    part: {
                                      min: t('Shortest'),
                                      max: t('Longest'),
                                      step: t('Step'),
                                    }[part],
                                  })}
                                  placeholder={t('Keep {{value}}', {
                                    value: range[part] ?? '—',
                                  })}
                                  value={byQuality[quality]?.[part] ?? ''}
                                  onChange={(event) => {
                                    const number =
                                      event.target.value === ''
                                        ? undefined
                                        : Number(event.target.value)
                                    const entry = {
                                      ...byQuality[quality],
                                      [part]: number,
                                    }
                                    if (number === undefined) delete entry[part]
                                    const next = {
                                      ...byQuality,
                                      [quality]: entry,
                                    }
                                    if (Object.keys(entry).length === 0) {
                                      delete next[quality]
                                    }
                                    set(
                                      ['paramSchema', 'durationRangeByQuality'],
                                      next
                                    )
                                  }}
                                />
                              ))}
                            </div>
                          ))
                        : null}
                    </div>
                  )}
                </EditField>
              </>
            )}
          </>
        ),
      })
    }
    if (sent.generateAudio.length || schema.supportsAudioGeneration === true) {
      rows.push({
        key: 'audio',
        name: t('Generate audio'),
        sentTo: sent.generateAudio.join(', '),
        body: (
          <>
            <SwitchField
              label={t('Supports generating audio')}
              checked={schema.supportsAudioGeneration === true}
              onChange={(next) => {
                set(['paramSchema', 'supportsAudioGeneration'], next)
                if (!next) set(['defaultParams', 'generateAudio'], false)
              }}
            />
            {schema.supportsAudioGeneration === true ||
            defaults.generateAudio === true ? (
              <SwitchField
                label={t('Generate audio by default')}
                checked={defaults.generateAudio === true}
                onChange={(next) =>
                  set(['defaultParams', 'generateAudio'], next)
                }
              />
            ) : null}
          </>
        ),
      })
    }
    if (sent.watermark.length) {
      rows.push({
        key: 'watermark',
        name: t('Watermark'),
        sentTo: sent.watermark.join(', '),
        body: (
          <SwitchField
            label={t('Watermark by default')}
            checked={defaults.watermark === true}
            onChange={(next) => set(['defaultParams', 'watermark'], next)}
          />
        ),
      })
    }
  }
  const countSent = sent.batchSize.length > 0
  rows.push({
    key: 'count',
    name: t('Count'),
    sentTo: sent.batchSize.join(', '),
    // Count is the one exception to design 12.2: without a field the Executor makes several calls.
    note: countSent
      ? undefined
      : t('The Channel has no count field: several results mean several calls'),
    body: (
      <>
        {cap === 'image.generate' ? (
          <NumberField
            label={t('Fewest')}
            placeholder='1'
            value={schema.minBatchSize}
            error={errorAt('paramSchema', 'minBatchSize')}
            was={was(['paramSchema', 'minBatchSize'])}
            onChange={(next) => set(['paramSchema', 'minBatchSize'], next)}
          />
        ) : null}
        <NumberField
          label={t('Most')}
          value={schema.maxBatchSize}
          error={errorAt('paramSchema', 'maxBatchSize')}
          was={was(['paramSchema', 'maxBatchSize'])}
          onChange={(next) => set(['paramSchema', 'maxBatchSize'], next)}
        />
        <NumberField
          label={t('Default')}
          value={defaults.batchSize}
          error={errorAt('defaultParams', 'batchSize')}
          was={was(['defaultParams', 'batchSize'])}
          onChange={(next) => set(['defaultParams', 'batchSize'], next)}
        />
        {countSent || defaults.multiResultMode === 'native' ? (
          <EditField
            label={t('How several results are made')}
            error={errorAt('defaultParams', 'multiResultMode')}
            was={was(['defaultParams', 'multiResultMode'])}
          >
            {(id) => (
              <NativeSelect
                id={id}
                className='w-full'
                value={
                  typeof defaults.multiResultMode === 'string'
                    ? defaults.multiResultMode
                    : ''
                }
                onChange={(event) =>
                  set(
                    ['defaultParams', 'multiResultMode'],
                    event.target.value || undefined
                  )
                }
              >
                <NativeSelectOption value=''>{placeholder}</NativeSelectOption>
                <NativeSelectOption value='native'>
                  {t('One call returns several')}
                </NativeSelectOption>
                <NativeSelectOption value='fanout'>
                  {t('Split into several calls')}
                </NativeSelectOption>
              </NativeSelect>
            )}
          </EditField>
        ) : null}
        {defaults.multiResultMode === 'fanout' ? (
          <NumberField
            label={t('Concurrency')}
            value={defaults.fanoutConcurrency}
            error={errorAt('defaultParams', 'fanoutConcurrency')}
            was={was(['defaultParams', 'fanoutConcurrency'])}
            onChange={(next) =>
              set(['defaultParams', 'fanoutConcurrency'], next)
            }
          />
        ) : null}
      </>
    ),
  })
  if (cap === 'image.generate' && (sent.background.length || transparent)) {
    rows.push({
      key: 'background',
      name: t('Transparent background'),
      sentTo: sent.background.join(', '),
      body: (
        <>
          <SwitchField
            label={t('Supports transparent background')}
            checked={transparent}
            onChange={(next) => {
              set(
                ['paramSchema', 'backgroundModes'],
                next ? ['transparent'] : undefined
              )
              if (!next) set(['paramSchema', 'backgroundInput'], undefined)
            }}
          />
          {transparent ? (
            <SwitchField
              label={t('Only with one reference image that has transparency')}
              checked={schema.backgroundInput === 'singleAlphaImage'}
              onChange={(next) =>
                set(
                  ['paramSchema', 'backgroundInput'],
                  next ? 'singleAlphaImage' : undefined
                )
              }
            />
          ) : null}
        </>
      ),
    })
  }
  for (const field of sent.modelFields) {
    if (field.key === 'watermark' && cap === 'video.generate') continue
    rows.push({
      key: `field-${field.key}`,
      name: field.field,
      sentTo: field.field,
      body: (
        <CustomFieldControl
          field={field}
          draft={draft}
          set={set}
          error={errorAt('defaultParams', field.key)}
        />
      ),
    })
  }
  const sentRows = rows.filter((row) => row.sentTo)
  const otherRows = rows.filter((row) => !row.sentTo)
  return (
    <EditSection title={t('Parameters')}>
      {sentRows.map((row) => (
        <ParameterRow
          key={row.key}
          name={row.name}
          sentTo={row.sentTo}
          note={row.note}
          split={splitRows.has(row.key)}
        >
          {row.body}
        </ParameterRow>
      ))}
      {otherRows.length ? (
        <p className='text-muted-foreground mt-2 text-xs font-medium md:col-span-2'>
          {t('Not sent by the Channel')}
        </p>
      ) : null}
      {otherRows.map((row) => (
        <ParameterRow
          key={row.key}
          name={row.name}
          sentTo=''
          note={row.note}
          split={splitRows.has(row.key)}
        >
          {row.body}
        </ParameterRow>
      ))}
    </EditSection>
  )
}

const TOKEN_CATEGORIES: Record<CatalogCapability, string[]> = {
  'chat.generate': ['input', 'output', 'cacheRead', 'cacheWrite'],
  'image.generate': [
    'input',
    'output',
    'cacheRead',
    'cacheWrite',
    'imageInput',
  ],
  'video.generate': ['total', 'totalWithVideoInput'],
}

export function ModelTokenSection(
  props: SectionProps & {
    usageProtocol: string | undefined
    onJsonError: (error: string | undefined) => void
  }
) {
  const { t } = useTranslation()
  const { draft, set, was, usageProtocol, errors } = props
  const cap = draft.capability
  if (!usageProtocol && cap !== 'chat.generate') return null
  const errorAt = (key: string) => fieldError(errors, ['paramSchema', key])
  const schema = interactionOf(draft).paramSchema
  const categories = stringList(schema.tokenUsageCategories)
  // Named as the pricing pages and model cards name them, by the same rule.
  const namesOf = (priced: string[]) =>
    priced.map((category) =>
      t(tokenCategoryLabelKey(category as CanvasTokenCategory, priced))
    )
  const labels = Object.fromEntries(
    TOKEN_CATEGORIES[cap].map((category) => [
      category,
      t(tokenCategoryLabelKey(category as CanvasTokenCategory, categories)),
    ])
  )
  // What to price, by type: the rules of IMAGE-TOKEN-BILLING-001 and VIDEO-TOKEN-BILLING-001.
  const categoryGuide: Record<CatalogCapability, string> = {
    'chat.generate': t(
      'Input and output are always priced. Add cache read and cache write when the API you call prices them apart.'
    ),
    'image.generate': t(
      'Input and output are always priced. Add image input when the upstream prices input images apart; input then counts the text only.'
    ),
    'video.generate': t(
      'Without video input is always priced. Add with video input only when the upstream prices a task with a reference video apart: each quality then has two prices, and a task uses the one that fits whether it has a reference video. Without it, a task with a reference video is priced as without video input.'
    ),
  }
  return (
    <EditSection
      title={t('Billing by Token')}
      description={
        usageProtocol
          ? undefined
          : t(
              'This Channel returns no usage, so it can only be priced per request or per second.'
            )
      }
    >
      {cap === 'chat.generate' ? (
        <>
          <NumberField
            label={t('Most output Tokens')}
            value={schema.maxTokens}
            error={errorAt('maxTokens')}
            was={was(['paramSchema', 'maxTokens'])}
            onChange={(next) => set(['paramSchema', 'maxTokens'], next)}
          />
          <NumberField
            label={t('Context length')}
            value={schema.contextTokens}
            error={errorAt('contextTokens')}
            was={was(['paramSchema', 'contextTokens'])}
            onChange={(next) => set(['paramSchema', 'contextTokens'], next)}
          />
          <NumberField
            label={t('Lowest output limit')}
            placeholder={t('No limit')}
            help={t('Optional; cannot exceed the most output Tokens')}
            value={schema.minOutputTokens}
            error={errorAt('minOutputTokens')}
            was={was(['paramSchema', 'minOutputTokens'])}
            onChange={(next) => set(['paramSchema', 'minOutputTokens'], next)}
          />
        </>
      ) : null}
      {usageProtocol ? (
        <EditField
          label={t('Priced categories')}
          wide
          help={
            <>
              <span className='block'>{categoryGuide[cap]}</span>
              <span className='block'>
                {t(
                  'Changing categories puts the matching specifications back to pricing.'
                )}
              </span>
            </>
          }
          error={errorAt('tokenUsageCategories')}
          was={was(['paramSchema', 'tokenUsageCategories'], (before) =>
            namesOf(stringList(before)).join(', ')
          )}
        >
          {() => (
            <ValuePills
              label={t('Priced categories')}
              options={TOKEN_CATEGORIES[cap]}
              labels={labels}
              selected={categories}
              onToggle={(value) =>
                set(
                  ['paramSchema', 'tokenUsageCategories'],
                  toggled(categories, value).length
                    ? toggled(categories, value)
                    : undefined
                )
              }
            />
          )}
        </EditField>
      ) : null}
      {usageProtocol && cap !== 'chat.generate' ? (
        <EditField
          label={t('Usage estimate (JSON)')}
          wide
          error={
            errorAt('usageEstimate') ??
            (!schema.usageEstimate && categories.length
              ? t('A Token-billed image or video model needs a usage estimate')
              : undefined)
          }
        >
          {(id) => (
            <Textarea
              id={id}
              rows={10}
              className='font-mono text-xs'
              defaultValue={
                schema.usageEstimate
                  ? JSON.stringify(schema.usageEstimate, null, 2)
                  : ''
              }
              onChange={(event) => {
                const text = event.target.value.trim()
                if (!text) {
                  props.onJsonError(undefined)
                  set(['paramSchema', 'usageEstimate'], undefined)
                  return
                }
                try {
                  set(['paramSchema', 'usageEstimate'], JSON.parse(text))
                  props.onJsonError(undefined)
                } catch {
                  props.onJsonError(t('The usage estimate is not valid JSON'))
                }
              }}
            />
          )}
        </EditField>
      ) : null}
    </EditSection>
  )
}

export function ModelSizeSection(
  props: SectionProps & {
    required: boolean
    prefilled: number
    showTable: boolean
    onShowTable: () => void
  }
) {
  const { t } = useTranslation()
  const { draft, set } = props
  const sizeError = fieldError(props.errors, ['defaultParams', 'sizeMap'])
  const interaction = interactionOf(draft)
  const sizeMap = (interaction.defaultParams.sizeMap ?? {}) as Record<
    string,
    Record<string, string>
  >
  if (!props.required && draft.capability !== 'image.generate') return null
  if (
    !props.required &&
    !props.showTable &&
    !interaction.defaultParams.sizeMap
  ) {
    return (
      <section className='bg-card flex max-w-3xl flex-wrap items-center justify-between gap-2 rounded-xl border p-4 text-sm'>
        <div>
          <strong className='text-sm font-medium'>{t('Size table')}</strong>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Needed once the Channel sends sizes; it can be filled in advance.'
            )}
          </p>
        </div>
        <button
          type='button'
          className='text-primary text-sm hover:underline'
          onClick={props.onShowTable}
        >
          {t('Fill in the size table')}
        </button>
      </section>
    )
  }
  const ratios = stringList(interaction.paramSchema.aspectRatios)
  const qualities = stringList(interaction.paramSchema.qualities)
  return (
    <section className='bg-card grid max-w-3xl gap-3 rounded-xl border p-4 text-sm'>
      <div className='space-y-1'>
        <strong className='text-sm font-medium'>{t('Size table')}</strong>
        <p className='text-muted-foreground text-xs'>
          {props.prefilled
            ? t(
                '{{count}} common sizes were filled in; please check them. Empty cells need typing and must be filled to publish.',
                { count: props.prefilled }
              )
            : t(
                'Fill in the pixels for each aspect ratio and resolution; all must be filled to publish.'
              )}
        </p>
      </div>
      <StaticDataTable
        data={ratios}
        getRowKey={(ratio) => ratio}
        emptyContent={t('Choose aspect ratios first')}
        columns={[
          {
            id: 'ratio',
            header: t('Aspect ratio'),
            cell: (ratio) => <span className='font-medium'>{ratio}</span>,
          },
          ...qualities.map((quality) => ({
            id: quality,
            header: quality,
            cell: (ratio: string) => (
              <Input
                className='font-mono'
                aria-label={t('Size of {{ratio}} at {{quality}}', {
                  ratio,
                  quality,
                })}
                aria-invalid={
                  sizeError && !sizeMap[ratio]?.[quality] ? true : undefined
                }
                placeholder={t('WxH')}
                value={sizeMap[ratio]?.[quality] ?? ''}
                onChange={(event) =>
                  set(
                    ['defaultParams', 'sizeMap', ratio, quality],
                    event.target.value || undefined
                  )
                }
              />
            ),
          })),
        ]}
      />
      {sizeError ? (
        <p role='alert' className='text-destructive text-xs'>
          {sizeError}
        </p>
      ) : null}
    </section>
  )
}

const REGION_COMPILER = {
  marked: 'canvas.semantic.region-edit.marked-image.v1',
  bbox: 'canvas.semantic.region-edit.bbox.v1',
}
const REFERENCE_FLAGS = [
  'supportsImageReference',
  'supportsVideoReference',
  'supportsAudioReference',
]

/** `accepted` is what the interface measurably takes, so a mode that needs another material cannot be turned on. */
export function ModelReferenceSection(
  props: SectionProps & { accepted: Accepts }
) {
  const { t } = useTranslation()
  const { draft, set, was, errors, accepted } = props
  const cap = draft.capability
  if (cap === 'chat.generate') return null
  const video = cap === 'video.generate'
  const limits = interactionOf(draft).referenceLimits
  const number = (key: string, label: string) => (
    <NumberField
      key={key}
      label={label}
      placeholder={t('No limit')}
      value={limits[key]}
      error={fieldError(errors, ['referenceLimits', key])}
      was={was(['referenceLimits', key])}
      onChange={(next) => set(['referenceLimits', key], next)}
    />
  )
  // A mode already on can still be turned off, so a model can follow an interface that stopped taking a material.
  const flag = (key: string, label: string, carried = true) => (
    <SwitchField
      key={key}
      label={label}
      checked={limits[key] === true}
      disabled={!carried && limits[key] !== true}
      onChange={(next) => set(['referenceLimits', key], next)}
    />
  )
  // The canvas offers full reference whenever any reference type is on: it has no flag of its own.
  const omni = REFERENCE_FLAGS.some((key) => limits[key] === true)
  const allMedia: Array<
    [string, string, string | null, string, 'image' | 'video' | 'audio']
  > = [
    [
      t('Image'),
      'supportsImageReference',
      'minImageReferences',
      'maxImageReferences',
      'image',
    ],
    ...(video
      ? ([
          [
            t('Video'),
            'supportsVideoReference',
            null,
            'maxVideoReferences',
            'video',
          ],
          [
            t('Audio'),
            'supportsAudioReference',
            null,
            'maxAudioReferences',
            'audio',
          ],
        ] as Array<
          [string, string, string | null, string, 'image' | 'video' | 'audio']
        >)
      : []),
  ]
  const material = {
    image: 'reference',
    video: 'video',
    audio: 'audio',
  } as const
  const media = allMedia.filter(
    ([, on, , , kind]) => accepted[material[kind]] || limits[on] === true
  )
  const notCarried = [
    ...(!accepted.first
      ? [
          t(
            'Not available: the Channel configuration does not take the first frame, so image to video cannot be turned on.'
          ),
        ]
      : []),
    ...(!(accepted.first && accepted.last)
      ? [
          t(
            'Not available: the Channel configuration does not take both frames, so first and last frames cannot be turned on.'
          ),
        ]
      : []),
  ]
  const tableError = media
    .flatMap((row) => [row[1], row[2], row[3]])
    .flatMap(
      (key) => (key && fieldError(errors, ['referenceLimits', key])) || []
    )[0]
  const table = (
    <>
      <StaticDataTable
        className='md:col-span-2'
        data={media}
        getRowKey={(row) => row[1]}
        emptyContent={t('The Channel carries no materials')}
        columns={[
          {
            id: 'name',
            header: t('Material'),
            cell: (row) => (
              <span className='font-medium whitespace-nowrap'>{row[0]}</span>
            ),
          },
          {
            id: 'on',
            header: t('Can be referenced'),
            cell: (row) => (
              <SwitchField
                label={t('{{name}} reference', { name: row[0] })}
                checked={limits[row[1]] === true}
                onChange={(next) => set(['referenceLimits', row[1]], next)}
              />
            ),
          },
          ...(
            [
              [2, t('Fewest')],
              [3, t('Most')],
            ] as const
          ).map(([position, limit]) => ({
            id: String(position),
            header: limit,
            cell: (row: (typeof media)[number]) => {
              const key = row[position]
              if (!key) return <span className='text-muted-foreground'>—</span>
              return (
                <Input
                  type='number'
                  aria-label={t('{{limit}} {{name}}', { limit, name: row[0] })}
                  placeholder={t('No limit')}
                  value={
                    typeof limits[key] === 'number'
                      ? (limits[key] as number)
                      : ''
                  }
                  aria-invalid={
                    fieldError(errors, ['referenceLimits', key])
                      ? true
                      : undefined
                  }
                  onChange={(event) =>
                    set(
                      ['referenceLimits', key],
                      event.target.value === ''
                        ? undefined
                        : Number(event.target.value)
                    )
                  }
                />
              )
            },
          })),
        ]}
      />
      {tableError ? (
        <p role='alert' className='text-destructive text-xs md:col-span-2'>
          {tableError}
        </p>
      ) : null}
    </>
  )
  const operations = (limits.imageOperations ?? {}) as Record<
    string,
    { mode: string; compiler?: string }
  >
  const operationLabels: Record<string, string> = {
    'camera-angle': t('Camera angle'),
    relight: t('Relight'),
    'region-edit': t('Region edit'),
  }
  const upscale = videoUpscaleOperation(limits)
  const setUpscale = (next: { sameResolution: boolean } | undefined) =>
    set(
      ['referenceLimits', 'videoOperations'],
      next ? { upscale: next } : undefined
    )
  const setOperation = (operation: string, next: boolean) => {
    const value = { ...operations }
    if (next) {
      value[operation] = {
        mode: 'prompt',
        compiler:
          operation === 'region-edit'
            ? REGION_COMPILER.marked
            : `canvas.semantic.${operation}.v1`,
      }
    } else delete value[operation]
    set(['referenceLimits', 'imageOperations'], value)
  }
  return (
    <EditSection title={t('Reference materials and prompt')}>
      <p className='text-muted-foreground text-xs font-medium md:col-span-2'>
        {t('Prompt text')}
      </p>
      {number('minPromptCharacters', t('Fewest prompt characters'))}
      {number('maxPromptCharacters', t('Most prompt characters'))}
      {video ? (
        <>
          <p className='text-muted-foreground text-xs font-medium md:col-span-2'>
            {t('Video modes')}
          </p>
          <div className='flex flex-wrap gap-x-6 gap-y-2 md:col-span-2'>
            {flag('supportsTextToVideo', t('Text to video'))}
            {flag(
              'supportsImageToVideo',
              t('Image to video'),
              Boolean(accepted.first)
            )}
            {flag(
              'supportsStartEndFrames',
              t('First and last frames'),
              Boolean(accepted.first && accepted.last)
            )}
            {media.length ? (
              <SwitchField
                label={t('Full reference')}
                checked={omni}
                onChange={(next) => {
                  for (const key of REFERENCE_FLAGS) {
                    set(['referenceLimits', key], next ? true : undefined)
                  }
                }}
              />
            ) : null}
          </div>
          <EditField
            label={t('Video upscale')}
            wide
            error={fieldError(errors, ['referenceLimits', 'videoOperations'])}
            help={
              upscale
                ? t(
                    'An upscale model takes one source video and no prompt, makes one result and bills the source length; turn the other video modes off.'
                  )
                : undefined
            }
          >
            {() => (
              <div className='flex flex-wrap gap-x-6 gap-y-2'>
                <SwitchField
                  label={t('Upscale only')}
                  checked={Boolean(upscale)}
                  disabled={!accepted.video && !upscale}
                  onChange={(next) =>
                    setUpscale(next ? { sameResolution: false } : undefined)
                  }
                />
                {upscale ? (
                  <SwitchField
                    label={t(
                      'Accepts the source resolution (rebuilds at the same size)'
                    )}
                    checked={upscale.sameResolution}
                    onChange={(next) => setUpscale({ sameResolution: next })}
                  />
                ) : null}
              </div>
            )}
          </EditField>
          {notCarried.map((note) => (
            <p
              key={note}
              className='text-muted-foreground text-xs md:col-span-2'
            >
              {note}
            </p>
          ))}
          {!media.length ? (
            <p className='text-muted-foreground text-xs md:col-span-2'>
              {t(
                'Not available: the Channel configuration takes no reference material, so full reference cannot be turned on.'
              )}
            </p>
          ) : null}
          {omni ? (
            <>
              <p className='text-muted-foreground text-xs font-medium md:col-span-2'>
                {t('Materials full reference can use')}
              </p>
              {table}
              {number(
                'maxTotalReferences',
                t('Most reference materials in total')
              )}
              <p className='text-muted-foreground text-xs font-medium md:col-span-2'>
                {t('Combination rules')}
              </p>
              <div className='flex flex-wrap gap-x-6 gap-y-2 md:col-span-2'>
                {flag(
                  'requiresImageInputWithVideo',
                  t('A video reference needs an image')
                )}
                {flag(
                  'requiresVisualInputWithAudio',
                  t('An audio reference needs an image or a video')
                )}
              </div>
            </>
          ) : null}
        </>
      ) : null}
      {!video && !media.length ? (
        <p className='text-muted-foreground text-xs md:col-span-2'>
          {t(
            'Not available: the Channel configuration does not take reference images, so reference images and camera angle, relight and region edit cannot be turned on.'
          )}
        </p>
      ) : null}
      {!video && media.length ? (
        <>
          <p className='text-muted-foreground text-xs font-medium md:col-span-2'>
            {t('Reference materials')}
          </p>
          {table}
          {number(
            'maxImagesWithResults',
            t('Reference images plus results, at most')
          )}
          <EditField
            label={t('Camera angle, relight and region edit')}
            wide
            error={fieldError(errors, ['referenceLimits', 'imageOperations'])}
            help={
              operations['region-edit']
                ? t(
                    'Boxes use a marked image by default. Turn on coordinates only when the model documents bbox support.'
                  )
                : undefined
            }
          >
            {() => (
              <div className='flex flex-wrap gap-x-6 gap-y-2'>
                {Object.keys(operationLabels).map((operation) => (
                  <SwitchField
                    key={operation}
                    label={operationLabels[operation]}
                    checked={Boolean(operations[operation])}
                    onChange={(next) => setOperation(operation, next)}
                  />
                ))}
                {operations['region-edit'] ? (
                  <SwitchField
                    label={t('Boxes use <bbox> coordinates')}
                    checked={
                      operations['region-edit'].compiler ===
                      REGION_COMPILER.bbox
                    }
                    onChange={(next) =>
                      set(['referenceLimits', 'imageOperations'], {
                        ...operations,
                        'region-edit': {
                          mode: 'prompt',
                          compiler: next
                            ? REGION_COMPILER.bbox
                            : REGION_COMPILER.marked,
                        },
                      })
                    }
                  />
                ) : null}
              </div>
            )}
          </EditField>
        </>
      ) : null}
    </EditSection>
  )
}

type MediaScale = 'list' | 'mb' | 'sec' | ''

// The shared validator lists the constraints in the order the form shows them; the unit follows the field name.
function mediaScale(field: string): MediaScale {
  if (field === 'formats') return 'list'
  if (field.endsWith('Bytes')) return 'mb'
  if (field.endsWith('Ms')) return 'sec'
  return ''
}

function mediaApplies(kind: string, field: string) {
  if (kind === 'image' && /Duration|FrameRate/.test(field)) return false
  return !(kind === 'audio' && /Px$|AspectRatio|FrameRate/.test(field))
}

const MEGABYTE = 1024 * 1024

export function ModelMediaSection(props: SectionProps & { accepted: Accepts }) {
  const { t } = useTranslation()
  const { draft, accepted, set } = props
  const cap = draft.capability
  if (cap === 'chat.generate') return null
  const constraints = (interactionOf(draft).mediaConstraints ?? {}) as Record<
    string,
    Record<string, unknown>
  >
  const mediaError = fieldError(props.errors, ['mediaConstraints'])
  const takes: Record<string, boolean | undefined> = {
    image: accepted.first || accepted.last || accepted.reference,
    video: accepted.video,
    audio: accepted.audio,
  }
  const kinds = (
    cap === 'video.generate' ? ['image', 'video', 'audio'] : ['image']
  ).filter((kind) => takes[kind] || constraints[kind])
  if (!kinds.length) return null
  const kindLabels: Record<string, string> = {
    image: t('Image'),
    video: t('Video'),
    audio: t('Audio'),
  }
  const fieldLabels: Record<string, string> = {
    formats: t('Formats'),
    maxFileSizeBytes: t('Largest file (MB)'),
    maxTotalFileSizeBytes: t('Largest total (MB)'),
    minDurationMs: t('Shortest length (seconds)'),
    maxDurationMs: t('Longest length (seconds)'),
    maxTotalDurationMs: t('Longest total (seconds)'),
    minShortEdgePx: t('Smallest short edge (px)'),
    maxShortEdgePx: t('Largest short edge (px)'),
    minWidthPx: t('Smallest width (px)'),
    maxWidthPx: t('Largest width (px)'),
    minHeightPx: t('Smallest height (px)'),
    maxHeightPx: t('Largest height (px)'),
    minAspectRatio: t('Smallest width/height'),
    maxAspectRatio: t('Largest width/height'),
    minFrameRate: t('Lowest frame rate (fps)'),
    maxFrameRate: t('Highest frame rate (fps)'),
  }
  const shown = (value: unknown, scale: string): string | number => {
    if (value === undefined) return ''
    if (scale === 'list') return (value as string[]).join(', ')
    if (scale === 'mb') return +((value as number) / MEGABYTE).toFixed(6)
    if (scale === 'sec') return (value as number) / 1000
    return value as number
  }
  const stored = (text: string, scale: string, current: unknown): unknown => {
    if (text.trim() === '') return undefined
    if (scale === 'list') {
      return text
        .split(/[,，]/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    }
    const number = Number(text)
    // Showing megabytes rounds; typing the shown text again keeps the stored bytes exactly.
    if (scale === 'mb') {
      return String(shown(current, 'mb')) === text
        ? current
        : Math.round(number * MEGABYTE)
    }
    return scale === 'sec' ? Math.round(number * 1000) : number
  }
  return (
    <section className='bg-card grid max-w-3xl gap-3 rounded-xl border p-4 text-sm'>
      <div className='space-y-1'>
        <strong className='text-sm font-medium'>
          {t('Material constraints')}
        </strong>
        <p className='text-muted-foreground text-xs'>
          {t('Empty means no limit. Separate formats with commas.')}
        </p>
      </div>
      <StaticDataTable
        data={REQUEST_VALIDATOR_MEDIA_CONSTRAINT_FIELDS.filter((field) =>
          kinds.some((kind) => mediaApplies(kind, field))
        ).map((field) => [field, mediaScale(field)] as const)}
        getRowKey={(row) => row[0]}
        emptyContent={t('No constraints')}
        columns={[
          {
            id: 'field',
            header: t('Constraint'),
            cell: (row) => (
              <span className='font-medium whitespace-nowrap'>
                {fieldLabels[row[0]]}
              </span>
            ),
          },
          ...kinds.map((kind) => ({
            id: kind,
            header: kindLabels[kind],
            cell: ([field, scale]: readonly [string, MediaScale]) => {
              if (!mediaApplies(kind, field)) {
                return <span className='text-muted-foreground'>—</span>
              }
              return (
                <Input
                  type={scale === 'list' ? 'text' : 'number'}
                  className={scale === 'list' ? 'font-mono' : undefined}
                  aria-label={`${kindLabels[kind]} ${fieldLabels[field]}`}
                  placeholder={t('No limit')}
                  value={shown(constraints[kind]?.[field], scale)}
                  onChange={(event) =>
                    set(
                      ['mediaConstraints', kind, field],
                      stored(
                        event.target.value,
                        scale,
                        constraints[kind]?.[field]
                      )
                    )
                  }
                />
              )
            },
          })),
        ]}
      />
      {mediaError ? (
        <p role='alert' className='text-destructive text-xs'>
          {mediaError}
        </p>
      ) : null}
    </section>
  )
}

export function UnsupportedFieldsNotice(props: { paths: string[] }) {
  const { t } = useTranslation()
  if (!props.paths.length) return null
  return (
    <div
      role='note'
      className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm'
    >
      <p className='font-medium'>
        {t('{{count}} fields are not supported by this page yet', {
          count: props.paths.length,
        })}
      </p>
      <p className='text-muted-foreground text-xs'>
        {t(
          'The Bundle has these fields and this page cannot edit them. They are kept as they are when you publish. To change them, change the Bundle; the JSON tab shows them.'
        )}
      </p>
      <ul className='mt-1 font-mono text-xs'>
        {props.paths.map((entry) => (
          <li key={entry}>{displayPath(entry)}</li>
        ))}
      </ul>
    </div>
  )
}

export type { CatalogJson }

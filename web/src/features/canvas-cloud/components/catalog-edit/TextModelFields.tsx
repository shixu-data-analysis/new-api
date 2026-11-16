/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Textarea } from '@/components/ui/textarea'

import { inputTiersSummary } from '../../lib/token-rate-summary'
import { EditField, EditSection, SwitchField } from './EditFields'
import type { SectionProps } from './ModelEditorSections'
import { inputTiersIssue, reasoningIssue } from './text-model-fields'

/**
 * A JSON field that keeps what is typed until it is valid: the draft changes only then, and the issue shows under the
 * box while typing. The editor collects the issue so publishing waits for a fix.
 */
function JsonValueField(props: {
  label: string
  help: string
  value: unknown
  rows: number
  placeholder?: string
  error: string | undefined
  was: string | undefined
  issueOf: (text: string) => string
  onValid: (next: unknown) => void
  onIssue: (issue: string | undefined) => void
}) {
  const [text, setText] = useState(() =>
    props.value === undefined ? '' : JSON.stringify(props.value, null, 2)
  )
  const issue = props.issueOf(text)
  return (
    <EditField
      label={props.label}
      wide
      help={props.help}
      error={issue || props.error}
      was={props.was}
    >
      {(id) => (
        <Textarea
          id={id}
          rows={props.rows}
          className='font-mono text-xs'
          placeholder={props.placeholder}
          aria-invalid={Boolean(issue)}
          value={text}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            const found = props.issueOf(next)
            props.onIssue(found || undefined)
            if (!found) {
              props.onValid(next.trim() ? JSON.parse(next) : undefined)
            }
          }}
        />
      )}
    </EditField>
  )
}

type JsonIssue = (field: string, issue: string | undefined) => void

/** A text model's input tiers, under its priced categories (Catalog inputTiers). */
export function InputTiersField(
  props: SectionProps & { onJsonIssue: JsonIssue }
) {
  const { t } = useTranslation()
  const schema = props.draft.release.publicInteraction.paramSchema as {
    inputTiers?: number[]
    contextTokens?: number
  }
  const tiers = schema.inputTiers ?? []
  return (
    <JsonValueField
      label={t('Input tiers')}
      rows={2}
      placeholder='[272000]'
      help={[
        tiers.length ? inputTiersSummary(tiers, t) : '',
        t(
          'Fill in when the provider prices a call by its input length: a bracketed list of each tier’s input limit from small to large, in whole Tokens, comma-separated, leaving out the last tier. A price page that says "input ≤ 272K" makes [272000], two tiers; three tiers are [128000, 272000]. Leave it empty without tiers.'
        ),
      ]
        .filter(Boolean)
        .join(' ')}
      value={schema.inputTiers}
      error={props.errors['paramSchema.inputTiers']}
      was={props.was(['paramSchema', 'inputTiers'], (before) =>
        before === undefined ? '' : JSON.stringify(before)
      )}
      issueOf={(text) => inputTiersIssue(text, schema.contextTokens, t)}
      onValid={(next) => props.set(['paramSchema', 'inputTiers'], next)}
      onIssue={(issue) => props.onJsonIssue('inputTiers', issue)}
    />
  )
}

/** What a text model does in the canvas assistant: tool calling and the reasoning levels of its menu. */
export function ModelAssistantSection(
  props: SectionProps & { mappedLevels: string[]; onJsonIssue: JsonIssue }
) {
  const { t } = useTranslation()
  const schema = props.draft.release.publicInteraction.paramSchema as {
    toolCalling?: boolean
    reasoning?: unknown
  }
  return (
    <EditSection
      title={t('Canvas assistant')}
      description={t(
        'Needed only when the text model works in the canvas assistant.'
      )}
    >
      <div className='space-y-1'>
        <SwitchField
          label={t('Supports tool calling')}
          checked={schema.toolCalling === true}
          onChange={(next) =>
            props.set(['paramSchema', 'toolCalling'], next ? true : undefined)
          }
        />
        <p className='text-muted-foreground text-xs'>
          {t(
            'Shown in the assistant’s chat model menu once on. Turn on only after real tool-calling tests pass.'
          )}
        </p>
      </div>
      <JsonValueField
        label={t('Reasoning levels (JSON)')}
        rows={7}
        placeholder={JSON.stringify(
          {
            default: 'low',
            levels: [
              { value: 'none', label: '不思考', thinking: false },
              { value: 'low', label: '低' },
            ],
          },
          null,
          2
        )}
        help={t(
          'The levels of the assistant’s reasoning menu: { "default": the default level’s value, "levels": [ one { "value": …, "label": … } per level ] }, in menu order. value is a level the Channel sends fields for; label is its name in the menu; a level that does not think adds "thinking": false; "description" adds one line. Text nodes use the default level. Without levels there is no reasoning button and text nodes send no reasoning fields.'
        )}
        value={schema.reasoning}
        error={props.errors['paramSchema.reasoning']}
        was={props.was(['paramSchema', 'reasoning'], (before) =>
          before === undefined ? '' : JSON.stringify(before)
        )}
        issueOf={(text) => reasoningIssue(text, props.mappedLevels, t)}
        onValid={(next) => props.set(['paramSchema', 'reasoning'], next)}
        onIssue={(issue) => props.onJsonIssue('reasoning', issue)}
      />
    </EditSection>
  )
}

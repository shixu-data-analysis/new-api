/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import { movePollTaskId, type ChannelDraft } from '../../catalog-channel-draft'
import { OperationFields } from './ChannelFormParts'
import { EditField, FoldTrigger, EditSection, SwitchField } from './EditFields'

function SubHead(props: { title: string; note?: string }) {
  return (
    <div className='border-t pt-3 md:col-span-2'>
      <strong className='font-medium'>{props.title}</strong>
      {props.note ? (
        <p className='text-muted-foreground text-xs'>{props.note}</p>
      ) : null}
    </div>
  )
}

function PathInput(props: {
  label: string
  value: string
  placeholder: string
  help?: string
  error?: string
  onChange: (value: string) => void
}) {
  return (
    <EditField label={props.label} help={props.help} error={props.error}>
      {(id, describedBy) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          className='font-mono'
          placeholder={props.placeholder}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </EditField>
  )
}

/**
 * How a task's answers are read, in the order a real call runs: the task ID
 * from the submit answer, the poll request, how its end is read, then what it
 * returns. Each part matches a card in the preview.
 */
export function ChannelResponseSection(props: {
  draft: ChannelDraft
  set: (next: Partial<ChannelDraft>) => void
  errorOf: (path: string) => string | undefined
  pollPlaceholder: string
  defaultPollIntervalMs: number
  usageChoices: string[]
  taskPathHelp: string
  statusPathHelp: string
  dottedHelp: string
}) {
  const { t } = useTranslation()
  const { draft, set, errorOf, taskPathHelp } = props
  const polls = draft.workflow !== 'sync'
  const isChat = draft.capability === 'chat.generate'
  // Rare: the poll answer keeps the task ID somewhere else than the submit answer.
  const [ownPollId, setOwnPollId] = useState(
    () =>
      Boolean(draft.submitTaskId.trim()) &&
      draft.submitTaskId.trim() !== draft.taskIdPath.trim()
  )
  const pollIdMemory = useRef<string | undefined>(undefined)
  const submitId = ownPollId
    ? draft.submitTaskId || draft.taskIdPath
    : draft.taskIdPath
  const setSubmitId = (value: string) => {
    if (!ownPollId) return set({ taskIdPath: value, submitTaskId: '' })
    set({
      submitTaskId: value.trim() === draft.taskIdPath.trim() ? '' : value,
    })
  }
  // Turning it off makes the poll answer use the submit path again; turning it back on restores the poll path.
  const toggleOwnPollId = (next: boolean) => {
    setOwnPollId(next)
    if (next) {
      // The submit path is kept as it is, so editing the poll path no longer changes it.
      set({
        submitTaskId: submitId,
        taskIdPath: pollIdMemory.current ?? draft.taskIdPath,
      })
      return
    }
    pollIdMemory.current = draft.taskIdPath
    set({ taskIdPath: submitId, submitTaskId: '' })
  }
  const stateField = (
    group: 'pending' | 'running' | 'succeeded' | 'failed',
    label: string,
    placeholder: string,
    help?: string
  ) => (
    <PathInput
      label={label}
      help={help}
      error={errorOf(`states.${group}`)}
      placeholder={placeholder}
      value={draft.states[group]}
      onChange={(value) => set({ states: { ...draft.states, [group]: value } })}
    />
  )
  const resultPlaceholder = {
    'chat.generate': 'choices[].message.content',
    'video.generate': 'video_url',
  }[draft.capability]
  return (
    <EditSection
      title={polls ? t('Submit response and polling') : t('Response')}
      description={
        polls
          ? t(
              'After submit, the task ID is read and the task is queried again and again until it ends.'
            )
          : t('A sync interface returns the result at once.')
      }
    >
      {polls ? (
        <>
          <SubHead
            title={t('Submit response')}
            note={t(
              'After a successful submit, the task ID is read from the response; the query uses it.'
            )}
          />
          <PathInput
            label={t('Task ID path')}
            help={taskPathHelp}
            error={ownPollId ? undefined : errorOf('taskIdPath')}
            placeholder='data.id'
            value={submitId}
            onChange={setSubmitId}
          />
          <div className='md:col-span-2'>
            <SwitchField
              label={t('The query response has the task ID elsewhere (rare)')}
              checked={ownPollId}
              onChange={toggleOwnPollId}
            />
          </div>
          {ownPollId ? (
            <PathInput
              label={t('Task ID path in the query response')}
              help={t(
                'Fill it in only when it differs from the submit response.'
              )}
              error={errorOf('taskIdPath')}
              placeholder='data.id'
              value={draft.taskIdPath}
              onChange={(value) => set({ taskIdPath: value })}
            />
          ) : null}
          <SubHead
            title={t('Querying')}
            note={t(
              'After submit, this interface is queried again and again until the task ends. The request is shown on the right under Query request.'
            )}
          />
          <OperationFields
            error={errorOf('poll.path')}
            label={t('Query path')}
            operation={draft.poll}
            placeholder={props.pollPlaceholder}
            withFormat={false}
            onChange={(poll) => set({ poll: { ...draft.poll, ...poll } })}
          />
          <EditField
            label={t('Task ID goes in')}
            help={
              draft.poll.taskIdIn === 'path'
                ? t(
                    'Write a placeholder in the path, such as /v1/videos/{taskId}'
                  )
                : t('Write no placeholder in the path.')
            }
          >
            {(id, describedBy) => (
              <NativeSelect
                id={id}
                className='w-full'
                aria-describedby={describedBy}
                value={draft.poll.taskIdIn}
                onChange={(event) =>
                  set({
                    poll: movePollTaskId(
                      draft.poll,
                      event.target.value as 'path' | 'query'
                    ),
                  })
                }
              >
                <NativeSelectOption value='path'>
                  {t('The path')}
                </NativeSelectOption>
                <NativeSelectOption value='query'>
                  {t('A query parameter')}
                </NativeSelectOption>
              </NativeSelect>
            )}
          </EditField>
          {draft.poll.taskIdIn === 'query' ? (
            <PathInput
              label={t('Query parameter')}
              help={t(
                'For example id; the request is /v1/tasks?id=the task ID'
              )}
              error={errorOf('poll.queryName')}
              placeholder='id'
              value={draft.poll.queryName}
              onChange={(value) =>
                set({ poll: { ...draft.poll, queryName: value } })
              }
            />
          ) : null}
          <EditField
            error={errorOf('pollIntervalMs')}
            label={t('Poll interval (ms)')}
            help={t(
              'Empty uses the system default (now {{seconds}} seconds). Fill it in only when the upstream demands one, from 1000 to 3600000',
              { seconds: props.defaultPollIntervalMs / 1000 }
            )}
          >
            {(id, describedBy) => (
              <Input
                id={id}
                type='number'
                aria-describedby={describedBy}
                placeholder={String(props.defaultPollIntervalMs)}
                value={draft.pollIntervalMs}
                onChange={(event) =>
                  set({ pollIntervalMs: event.target.value })
                }
              />
            )}
          </EditField>
          <SubHead
            title={t('Telling when the task ends')}
            note={t(
              'Every query reads the status. Fill in the raw values of the upstream, match their case, and separate several with commas. Once published, tasks already running also use these values for a status their earlier settings do not recognise.'
            )}
          />
          <PathInput
            label={t('Status path')}
            help={props.statusPathHelp}
            error={errorOf('statusPath')}
            placeholder='data.status'
            value={draft.statusPath}
            onChange={(value) => set({ statusPath: value })}
          />
          {stateField('succeeded', t('Success values'), 'completed')}
          {stateField('failed', t('Failure values'), 'failed')}
          {stateField(
            'running',
            t('Generating values'),
            'processing',
            t(
              'Fill in at least one. A value not listed also counts as in progress, but is recorded as an unrecognized state.'
            )
          )}
          <Collapsible
            className='md:col-span-2'
            defaultOpen={Boolean(
              draft.states.pending.trim() || errorOf('states.pending')
            )}
          >
            <FoldTrigger>{t('Queued values (optional)')}</FoldTrigger>
            <CollapsibleContent className='mt-2 max-w-sm'>
              {stateField(
                'pending',
                t('Queued values'),
                'queued, pending',
                t('Left empty, they also count as in progress.')
              )}
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : null}
      <SubHead
        title={polls ? t('After the task ends') : t('Reading the result')}
        note={
          polls
            ? t('Success reads the result; failure reads the error.')
            : t('Results and errors are read from the upstream response.')
        }
      />
      {isChat && draft.streaming ? null : (
        <PathInput
          label={t('Result paths')}
          help={props.dottedHelp}
          error={errorOf('outputPaths')}
          placeholder={resultPlaceholder ?? 'data[].url'}
          value={draft.outputPaths}
          onChange={(value) => set({ outputPaths: value })}
        />
      )}
      <PathInput
        label={t('Error paths')}
        help={t(
          'Use . for levels, such as error.message. Separate several with commas; the first that has a value is used.'
        )}
        placeholder='error.message'
        value={draft.errorPaths}
        onChange={(value) => set({ errorPaths: value })}
      />
      <SubHead
        title={t('Usage')}
        note={t('Needed only when billing by Token.')}
      />
      <EditField
        label={t('Usage format')}
        error={errorOf('usage')}
        help={
          isChat
            ? t(
                'Decides how usage is read and billed. An OpenAI-compatible upstream usually uses OpenAI Chat.'
              )
            : t(
                'Choose a format when the upstream returns Token usage and a model bills by Token; per request and per second need nothing here.'
              )
        }
      >
        {(id, describedBy) => (
          <NativeSelect
            id={id}
            className='w-full'
            aria-describedby={describedBy}
            value={draft.usageProtocol}
            onChange={(event) => set({ usageProtocol: event.target.value })}
          >
            {isChat ? null : (
              <NativeSelectOption value=''>
                {t('Does not read usage')}
              </NativeSelectOption>
            )}
            {props.usageChoices.map((protocol) => (
              <NativeSelectOption key={protocol} value={protocol}>
                {protocol}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        )}
      </EditField>
    </EditSection>
  )
}

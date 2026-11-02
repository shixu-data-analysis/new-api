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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

import { jsonSyntaxIssue, type JsonIssue } from '../../catalog-json-fill'
import { FoldTrigger } from './EditFields'
import { useJsonIssueText } from './use-json-issue-text'

/**
 * Says what goes in the box as a table, shows the outer shape in the empty box, and can put in a real example to
 * change. `fill` returns what is wrong with the parsed value, or null once it filled the form.
 */
export function JsonFillDialog(props: {
  title: string
  summary: ReactNode
  heads: string[]
  rows: Array<{ key: string; cells: ReactNode[] }>
  notes: string[]
  placeholder: string
  initialText?: string
  example?: {
    label: string
    options: Array<{ value: string; label: string }>
    make: (value: string) => string
  }
  /** The button says what the paste fills, so models that go to the next step are named before they move. */
  confirmFor: (parsed: unknown) => string
  fill: (parsed: unknown) => JsonIssue | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const issueText = useJsonIssueText()
  const [text, setText] = useState(props.initialText ?? '')
  const [picked, setPicked] = useState('')
  const [error, setError] = useState<string>()
  let confirm = t('Fill in')
  try {
    confirm = props.confirmFor(JSON.parse(text))
  } catch (parseError) {
    if (!(parseError instanceof SyntaxError)) throw parseError
  }
  const submit = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (parseError) {
      if (!(parseError instanceof SyntaxError)) throw parseError
      setError(issueText(jsonSyntaxIssue(text, parseError)))
      return
    }
    const issue = props.fill(parsed)
    if (issue) {
      setError(issueText(issue))
      return
    }
    props.onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent className='max-w-3xl sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
        </DialogHeader>
        <div className='grid min-w-0 gap-3'>
          {error ? (
            <p
              role='alert'
              className='text-destructive text-sm [overflow-wrap:anywhere]'
            >
              {error}
            </p>
          ) : null}
          <p className='text-sm'>{props.summary}</p>
          <Collapsible>
            <FoldTrigger>{t('How to fill in each part')}</FoldTrigger>
            <CollapsibleContent className='mt-2 space-y-2'>
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
                    {props.rows.map((row) => (
                      <tr key={row.key} className='border-b last:border-0'>
                        {props.heads.map((head, column) => (
                          <td
                            key={head}
                            className={`p-2 align-top ${column < 2 ? 'whitespace-nowrap' : ''}`}
                          >
                            {row.cells[column]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {props.notes.map((note) => (
                <p key={note} className='text-muted-foreground text-xs'>
                  {note}
                </p>
              ))}
            </CollapsibleContent>
          </Collapsible>
          {props.example ? (
            <div className='flex flex-wrap items-center gap-2'>
              <label
                htmlFor='json-fill-example'
                className='text-sm font-medium'
              >
                {props.example.label}
              </label>
              <NativeSelect
                id='json-fill-example'
                className='w-72 max-w-full'
                value={picked}
                onChange={(event) => {
                  setPicked(event.target.value)
                  if (event.target.value && props.example) {
                    setText(props.example.make(event.target.value))
                    setError(undefined)
                  }
                }}
              >
                <NativeSelectOption value=''>
                  {t('Choose to fill the box below')}
                </NativeSelectOption>
                {props.example.options.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <Textarea
            aria-label={t('JSON to fill in')}
            rows={12}
            className='max-h-[50vh] font-mono text-xs'
            placeholder={props.placeholder}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              // Emptied, the box asks for an example again, so any can be picked anew.
              if (!event.target.value.trim()) setPicked('')
            }}
          />
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button disabled={!text.trim()} onClick={submit}>
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

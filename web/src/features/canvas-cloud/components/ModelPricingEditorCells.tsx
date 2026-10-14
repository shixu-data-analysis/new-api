/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

import type { PricingEditorRow } from '../lib/model-pricing-editor'

export interface PricingCellNote {
  text: string
  error?: boolean
}

/** One price input with its unit and the notes or errors under it. */
export function PricingInputCell(props: {
  id: string
  label: string
  value: string
  placeholder?: string
  locked: boolean
  changed: boolean
  notes: PricingCellNote[]
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const error = props.notes.some((note) => note.error)
  return (
    <div className='flex flex-col items-end'>
      <span className='inline-flex items-center gap-1'>
        <Input
          id={props.id}
          inputMode='decimal'
          aria-label={props.label}
          aria-invalid={error}
          aria-describedby={
            props.notes.length ? `${props.id}-notes` : undefined
          }
          className={cn(
            'h-8 w-26 text-right tabular-nums',
            props.changed && 'border-primary',
            props.locked && 'bg-muted text-muted-foreground'
          )}
          value={props.value}
          placeholder={props.placeholder}
          disabled={props.locked}
          onChange={(event) => props.onChange(event.target.value.trim())}
        />
        <span className='text-muted-foreground text-xs'>{t('CNY')}</span>
      </span>
      {props.notes.length ? (
        <p
          id={`${props.id}-notes`}
          className='mt-1 space-y-0.5 text-right text-xs leading-[1.125rem]'
        >
          {props.notes.map((note) => (
            <span
              key={note.text}
              className={cn(
                'block',
                note.error
                  ? 'text-destructive whitespace-normal'
                  : 'text-muted-foreground'
              )}
            >
              {note.text}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  )
}

/** The pending price of a row: amount, effective time and the cancel link that withdraws its pricing scope. */
export function PendingPriceCell(props: {
  row: PricingEditorRow
  amount: string
  points: string
  onCancel: (() => void) | null
}) {
  const { t } = useTranslation()
  const effectiveAt =
    props.row.price.scheduled?.effectiveAt ??
    props.row.scope.scheduledProviderRate?.effectiveAt
  return (
    <div className='flex flex-col items-end gap-0.5 text-xs leading-[1.125rem] whitespace-nowrap'>
      <span>
        {t('{{amount}} yuan · {{points}} points', {
          amount: props.amount,
          points: props.points,
        })}
      </span>
      {effectiveAt ? (
        <span className='text-muted-foreground'>
          {t('Effective {{time}}', {
            time: dayjs(effectiveAt).format('YYYY/MM/DD HH:mm'),
          })}
        </span>
      ) : null}
      {props.onCancel ? (
        <Button
          type='button'
          variant='link'
          className='h-auto p-0 text-xs'
          onClick={props.onCancel}
        >
          {t('Cancel schedule')}
        </Button>
      ) : null}
    </div>
  )
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'

/**
 * The position number of a row; clicking it turns into an input. Enter moves the model there,
 * Escape or leaving the field cancels. The number is the position among all models of the type.
 */
export function ClientPresentationPositionInput(props: {
  name: string
  position: number
  total: number
  onMoveTo: (position: number) => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  if (!editing) {
    return (
      <button
        type='button'
        data-row-control
        title={t('Change position')}
        aria-label={t('Change the position of {{name}}, now {{position}}', {
          name: props.name,
          position: props.position,
        })}
        className='border-input bg-background text-foreground hover:border-primary focus-visible:ring-ring/50 h-6 w-10 flex-none cursor-text rounded-md border px-1.5 text-center text-[12.5px] tabular-nums shadow-xs outline-none focus-visible:ring-2'
        onClick={() => {
          setValue(String(props.position))
          setEditing(true)
        }}
      >
        {props.position}
      </button>
    )
  }
  return (
    <span data-row-control className='flex-none'>
      <Input
        autoFocus
        type='number'
        inputMode='numeric'
        min={1}
        max={props.total}
        className='h-6 w-14 px-1.5 text-center text-[12.5px] tabular-nums'
        value={value}
        aria-label={t('Position of {{name}} (1 to {{count}})', {
          name: props.name,
          count: props.total,
        })}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setEditing(false)
          }
          if (event.key !== 'Enter') return
          event.preventDefault()
          const target = Number(value)
          setEditing(false)
          if (
            Number.isInteger(target) &&
            target >= 1 &&
            target <= props.total &&
            target !== props.position
          ) {
            props.onMoveTo(target)
          }
        }}
      />
    </span>
  )
}

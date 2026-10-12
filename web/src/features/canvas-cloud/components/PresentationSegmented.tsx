/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { cn } from '@/lib/utils'

/** Compact segmented switch of the 客户端展示 page (generation type, preview theme). */
export function PresentationSegmented<T extends string>(props: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div
      role='group'
      aria-label={props.label}
      className='bg-muted inline-flex gap-0.5 rounded-[9px] p-[3px]'
    >
      {props.options.map((option) => (
        <button
          key={option.value}
          type='button'
          aria-pressed={option.value === props.value}
          className={cn(
            'text-muted-foreground cursor-pointer rounded-[7px] border-0 bg-transparent px-3 py-1 text-[13px]',
            option.value === props.value &&
              'bg-background text-foreground font-semibold shadow-xs'
          )}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import {
  MODEL_PRESENTATION_COLORS,
  type ModelPresentationColor,
} from '../lib/model-icons'
import { MODEL_COLOR_LABEL_KEYS } from '../lib/model-presentation-labels'

/** The nine preset colors as round swatches; a radio group when it shows a current value. */
export function ModelColorSwatches(props: {
  label: string
  value: string | null
  onChange: (color: ModelPresentationColor) => void
  size?: 'default' | 'small'
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const small = props.size === 'small'
  const radio = props.value !== null
  return (
    <span
      role={radio ? 'radiogroup' : 'group'}
      aria-label={props.label}
      className={cn('flex flex-wrap items-center', small ? 'gap-1.5' : 'gap-2')}
    >
      {MODEL_PRESENTATION_COLORS.map((color) => {
        const checked = props.value === color
        return (
          <button
            key={color}
            type='button'
            role={radio ? 'radio' : undefined}
            aria-checked={radio ? checked : undefined}
            aria-label={t(MODEL_COLOR_LABEL_KEYS[color])}
            title={t(MODEL_COLOR_LABEL_KEYS[color])}
            data-model-color={color}
            disabled={props.disabled}
            className={cn(
              'model-color-swatch focus-visible:ring-ring relative cursor-pointer rounded-full border-0 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-25',
              small ? 'size-4' : 'size-6',
              checked &&
                (small
                  ? 'after:absolute after:-inset-[3px] after:rounded-full after:border-2 after:border-[var(--model-swatch)]'
                  : 'after:absolute after:-inset-1 after:rounded-full after:border-2 after:border-[var(--model-swatch)]')
            )}
            onClick={() => props.onChange(color)}
          />
        )
      })}
    </span>
  )
}

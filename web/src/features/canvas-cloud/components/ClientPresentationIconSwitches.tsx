/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import type { CanvasClientIconVisibility } from '../types'

/** Whether client pages show category icons and model icons; published with the other changes. */
export function ClientPresentationIconSwitches(props: {
  value: CanvasClientIconVisibility
  onChange: (value: CanvasClientIconVisibility) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const switches = [
    { key: 'categories', label: t('Show category icons') },
    { key: 'models', label: t('Show model icons') },
  ] as const
  return (
    <div className='flex max-w-[1240px] flex-wrap items-center gap-x-5 gap-y-2'>
      {switches.map(({ key, label }) => (
        <div key={key} className='flex items-center gap-2'>
          <Switch
            id={`${id}-${key}`}
            checked={props.value[key]}
            onCheckedChange={(checked) =>
              props.onChange({ ...props.value, [key]: checked })
            }
          />
          <Label htmlFor={`${id}-${key}`} className='font-normal'>
            {label}
          </Label>
        </div>
      ))}
    </div>
  )
}

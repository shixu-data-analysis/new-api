/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

/** The two steps of a new Channel configuration, shown on both: what each holds, and where pasted models went. */
export function WizardSteps(props: {
  current: 1 | 2
  channelPasted: boolean
  pastedModels: number
}) {
  const { t } = useTranslation()
  const steps: Array<[1 | 2, string, string]> = [
    [
      1,
      t('Channel configuration'),
      props.channelPasted ? t('filled from JSON') : '',
    ],
    [
      2,
      t('Models'),
      props.pastedModels
        ? t('{{count}} filled from JSON', { count: props.pastedModels })
        : t('none, one or several'),
    ],
  ]
  return (
    <ol
      aria-label={t('Steps of a new Channel configuration')}
      className='flex flex-wrap items-center gap-2 text-sm'
    >
      {steps.map(([number, label, note]) => (
        <li
          key={number}
          aria-current={number === props.current ? 'step' : undefined}
          className={`flex items-center gap-1.5 ${number === props.current ? 'font-medium' : 'text-muted-foreground'}`}
        >
          {number === 2 ? (
            <span aria-hidden='true' className='text-muted-foreground mr-1'>
              →
            </span>
          ) : null}
          <span
            className={`inline-flex size-5 items-center justify-center rounded-full text-xs ${number === props.current ? 'bg-primary text-primary-foreground' : 'border'}`}
          >
            {number}
          </span>
          <span>{label}</span>
          {note ? (
            <span className='text-muted-foreground font-normal'>
              {t('({{note}})', { note })}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

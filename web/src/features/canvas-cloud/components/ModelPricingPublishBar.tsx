/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { DateTimePicker } from '@/components/datetime-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type PricingEffectiveMode = 'IMMEDIATE' | 'SCHEDULED'

/** The page footer of the current-pricing tab: what will be published, when, why, and the two actions. */
export function ModelPricingPublishBar(props: {
  summary: string
  dirty: boolean
  error: string
  effectiveMode: PricingEffectiveMode
  /** Mixed published units can only be replaced immediately. */
  scheduleDisabled: boolean
  effectiveAt: Date | undefined
  reason: string
  reasonError: string | undefined
  publishDisabled: boolean
  onEffectiveModeChange: (mode: PricingEffectiveMode) => void
  onEffectiveAtChange: (value: Date | undefined) => void
  onReasonChange: (value: string) => void
  onDiscard: () => void
  onPublish: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      role='region'
      aria-label={t('Unpublished price changes')}
      data-model-pricing-publish-bar
      className='flex flex-wrap items-center gap-3'
    >
      <span
        className={cn(
          'text-sm font-medium',
          !props.dirty && 'text-muted-foreground'
        )}
      >
        {props.summary}
      </span>
      <fieldset className='flex items-center gap-3'>
        <legend className='sr-only'>{t('Effective mode')}</legend>
        {(['IMMEDIATE', 'SCHEDULED'] as const).map((mode) => (
          <label
            key={mode}
            className={cn(
              'flex items-center gap-2 text-sm',
              mode === 'SCHEDULED' && props.scheduleDisabled && 'opacity-50'
            )}
          >
            <input
              type='radio'
              name='model-pricing-effective-mode'
              value={mode}
              checked={props.effectiveMode === mode}
              disabled={mode === 'SCHEDULED' && props.scheduleDisabled}
              onChange={() => props.onEffectiveModeChange(mode)}
            />
            {t(mode === 'IMMEDIATE' ? 'Immediately' : 'Schedule for later')}
          </label>
        ))}
      </fieldset>
      {props.effectiveMode === 'SCHEDULED' ? (
        <DateTimePicker
          className='w-80'
          futureOnly
          value={props.effectiveAt}
          onChange={props.onEffectiveAtChange}
        />
      ) : null}
      <Input
        aria-label={t('Change reason (optional)')}
        placeholder={t('Change reason (optional)')}
        aria-invalid={Boolean(props.reasonError)}
        className='w-64'
        value={props.reason}
        onChange={(event) => props.onReasonChange(event.target.value)}
      />
      {props.error || props.reasonError ? (
        <span role='alert' className='text-destructive text-sm'>
          {props.error || props.reasonError}
        </span>
      ) : null}
      <span className='flex-1' />
      <Button
        type='button'
        variant='outline'
        disabled={!props.dirty}
        onClick={props.onDiscard}
      >
        {t('Discard changes')}
      </Button>
      <Button
        type='button'
        disabled={props.publishDisabled}
        onClick={props.onPublish}
      >
        {t('Publish')}
      </Button>
    </div>
  )
}

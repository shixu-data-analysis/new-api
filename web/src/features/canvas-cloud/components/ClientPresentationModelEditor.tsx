/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { Dispatch } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import type {
  DraftModel,
  PresentationDraftAction,
} from '../lib/client-presentation-draft'
import { MODEL_BADGE_LIMIT, MODEL_ICON_KEYS } from '../lib/model-icons'
import {
  DEFAULT_MODEL_ICON_LABEL_KEY,
  MODEL_COLOR_LABEL_KEYS,
  MODEL_ICON_LABEL_KEYS,
} from '../lib/model-presentation-labels'
import type { CanvasClientPresentationBadge } from '../types'
import { ModelColorSwatches } from './ModelColorSwatches'
import { ModelIconTile } from './ModelIconTile'

/** Inline editor of one model; every change goes into the draft. */
export function ClientPresentationModelEditor(props: {
  model: DraftModel
  badges: CanvasClientPresentationBadge[]
  dispatch: Dispatch<PresentationDraftAction>
  onOpenModelCategories: () => void
}) {
  const { t } = useTranslation()
  const { model } = props
  const update = (
    patch: Partial<
      Pick<DraftModel, 'displayName' | 'description' | 'iconKey' | 'iconColor'>
    >
  ) => props.dispatch({ type: 'updateModel', modelKey: model.modelKey, patch })
  const nameId = `client-presentation-name-${model.modelKey}`
  const descriptionId = `client-presentation-description-${model.modelKey}`
  const nameMissing = !model.displayName.trim()
  const iconLabel = t(
    model.iconKey
      ? MODEL_ICON_LABEL_KEYS[model.iconKey]
      : DEFAULT_MODEL_ICON_LABEL_KEY
  )
  return (
    <div className='grid max-w-[560px] gap-3 ps-[58px] pe-3.5 pt-1 pb-3.5 max-sm:ps-3.5'>
      <div className='grid gap-1.5'>
        <Label htmlFor={nameId}>{t('Client display name *')}</Label>
        <Input
          id={nameId}
          maxLength={191}
          value={model.displayName}
          aria-invalid={nameMissing}
          aria-describedby={nameMissing ? `${nameId}-error` : undefined}
          onChange={(event) => update({ displayName: event.target.value })}
        />
        {nameMissing && (
          <p id={`${nameId}-error`} className='text-destructive text-xs'>
            {t('Please enter a name')}
          </p>
        )}
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={descriptionId}>
          {t('Client display description (optional)')}
        </Label>
        <Textarea
          id={descriptionId}
          rows={2}
          maxLength={500}
          className='min-h-16'
          value={model.description}
          placeholder={t('The imported catalog provided no description')}
          aria-describedby={`${descriptionId}-hint`}
          onChange={(event) => update({ description: event.target.value })}
        />
        <p
          id={`${descriptionId}-hint`}
          className='text-muted-foreground text-xs'
        >
          {t(
            'Brought in when the catalog is first imported; after that it changes only here, and re-importing does not overwrite it.'
          )}
        </p>
      </div>
      <fieldset className='grid min-w-0 gap-2'>
        <legend className='flex items-baseline gap-2 text-sm font-semibold'>
          {t('Icon')}{' '}
          <span className='text-muted-foreground text-xs font-normal'>
            {iconLabel}
          </span>
        </legend>
        <div
          role='radiogroup'
          aria-label={t('Icon')}
          className='flex flex-wrap items-center gap-1.5'
        >
          {[null, ...MODEL_ICON_KEYS].map((iconKey) => {
            const label = t(
              iconKey
                ? MODEL_ICON_LABEL_KEYS[iconKey]
                : DEFAULT_MODEL_ICON_LABEL_KEY
            )
            const checked = model.iconKey === iconKey
            return (
              <button
                key={iconKey ?? 'default'}
                type='button'
                role='radio'
                aria-checked={checked}
                aria-label={label}
                title={label}
                className={cn(
                  'bg-background hover:bg-muted grid size-10 cursor-pointer place-items-center rounded-[10px] border p-0',
                  checked &&
                    'border-primary shadow-[inset_0_0_0_1px_var(--primary)]'
                )}
                onClick={() => update({ iconKey })}
              >
                <ModelIconTile
                  iconKey={iconKey}
                  iconColor={model.iconColor}
                  capability={model.capability}
                />
              </button>
            )
          })}
        </div>
      </fieldset>
      <fieldset className='grid min-w-0 gap-2'>
        <legend className='text-sm font-semibold'>{t('Icon color')}</legend>
        <div className='flex flex-wrap items-center gap-2'>
          <ModelColorSwatches
            label={t('Icon color')}
            value={model.iconKey ? model.iconColor : ''}
            disabled={!model.iconKey}
            onChange={(iconColor) => update({ iconColor })}
          />
          <span className='text-muted-foreground text-xs'>
            {model.iconKey
              ? t(MODEL_COLOR_LABEL_KEYS[model.iconColor])
              : t(
                  'The default icon is neutral gray; choose an icon to set its color'
                )}
          </span>
        </div>
      </fieldset>
      <div className='grid min-w-0 gap-1.5'>
        <span className='flex items-baseline gap-2 text-sm font-semibold'>
          {t('Model categories')}{' '}
          <span className='text-muted-foreground text-xs font-normal'>
            {t('Read-only')}
          </span>
        </span>
        <div className='flex flex-wrap items-center gap-x-2.5 gap-y-1.5'>
          {model.tags.length ? (
            model.tags.map((tag) => (
              <span
                key={tag.id}
                className='bg-muted text-muted-foreground inline-flex h-5 items-center rounded-full px-[7px] text-[11.5px]'
              >
                {tag.name}
              </span>
            ))
          ) : (
            <span className='text-muted-foreground text-xs'>
              {t('No model category')}
            </span>
          )}
          <button
            type='button'
            className='text-primary cursor-pointer border-0 bg-transparent p-0 text-[12.5px] hover:underline'
            onClick={props.onOpenModelCategories}
          >
            {t('Change in "Model list › Manage model categories"')}
          </button>
        </div>
      </div>
      <fieldset className='grid min-w-0 gap-2'>
        <legend className='flex items-baseline gap-2 text-sm font-semibold'>
          {t('Badges')}{' '}
          <span className='text-muted-foreground text-xs font-normal'>
            {t(
              'Shown after the name in the order you pick them, at most {{count}}',
              { count: MODEL_BADGE_LIMIT }
            )}
          </span>
        </legend>
        <div className='flex flex-wrap gap-1.5'>
          {props.badges.length === 0 && (
            <span className='text-muted-foreground text-xs'>
              {t('No badges yet')}
            </span>
          )}
          {props.badges.map((badge) => {
            const position = model.badgeIds.indexOf(badge.id)
            const full =
              position < 0 && model.badgeIds.length >= MODEL_BADGE_LIMIT
            return (
              <button
                key={badge.id}
                type='button'
                aria-pressed={position >= 0}
                disabled={full}
                title={
                  full
                    ? t('At most {{count}} badges', {
                        count: MODEL_BADGE_LIMIT,
                      })
                    : undefined
                }
                className={cn(
                  'bg-background inline-flex h-[30px] cursor-pointer items-center gap-[5px] rounded-lg border px-2.5 disabled:cursor-not-allowed disabled:opacity-40',
                  position >= 0 &&
                    'border-primary shadow-[inset_0_0_0_1px_var(--primary)]'
                )}
                onClick={() =>
                  props.dispatch({
                    type: 'toggleBadge',
                    modelKey: model.modelKey,
                    badgeId: badge.id,
                  })
                }
              >
                {position >= 0 && (
                  <span className='bg-primary text-primary-foreground grid size-4 place-items-center rounded-full text-[10.5px] font-bold'>
                    {position + 1}
                  </span>
                )}
                <span className='model-badge' data-model-color={badge.color}>
                  {badge.name}
                </span>
              </button>
            )
          })}
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('Add, remove and color badges in "Badge management".')}
        </p>
      </fieldset>
    </div>
  )
}

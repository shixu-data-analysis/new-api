/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program.
If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { type Dispatch, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import type {
  DraftCategory,
  PresentationCapability,
  PresentationDraftAction,
  PresentationSnapshot,
} from '../lib/client-presentation-draft'
import {
  MODEL_CATEGORY_DESCRIPTION_MAX_LENGTH,
  MODEL_CATEGORY_NAME_MAX_LENGTH,
  TYPE_MODEL_COUNT_KEYS,
  categoryNameError,
} from '../lib/model-categories'
import { MODEL_ICON_KEYS } from '../lib/model-icons'
import {
  MODEL_COLOR_LABEL_KEYS,
  MODEL_ICON_LABEL_KEYS,
} from '../lib/model-presentation-labels'
import { CategoryIconTile } from './CategoryIconTile'
import { ClientPresentationCategoryModelsDialog } from './ClientPresentationCategoryModelsDialog'
import { ModelColorSwatches } from './ModelColorSwatches'

const DEFAULT_CATEGORY_ICON_LABEL_KEY = 'Default (category icon)'

/** Inline editor of one category, laid out like the model editor; every change goes into the draft. */
export function ClientPresentationCategoryEditor(props: {
  category: DraftCategory
  capability: PresentationCapability
  snapshot: PresentationSnapshot
  dispatch: Dispatch<PresentationDraftAction>
}) {
  const { t } = useTranslation()
  const { category, snapshot } = props
  const [pickingModels, setPickingModels] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const update = (patch: Partial<Omit<DraftCategory, 'id'>>) =>
    props.dispatch({ type: 'updateCategory', id: category.id, patch })
  const nameId = `client-presentation-category-name-${category.id}`
  const descriptionId = `client-presentation-category-description-${category.id}`
  const nameError = categoryNameError(
    snapshot.categories,
    category.name,
    category.id
  )
  const models = snapshot.orders[props.capability]
    .flatMap((modelKey) => snapshot.models[modelKey] ?? [])
    .filter((model) => model.tagIds.includes(category.id))
  const allModelsCount = Object.values(snapshot.models).filter((model) =>
    model.tagIds.includes(category.id)
  ).length
  const iconLabel = t(
    category.iconKey
      ? MODEL_ICON_LABEL_KEYS[category.iconKey]
      : DEFAULT_CATEGORY_ICON_LABEL_KEY
  )
  let nameMessage = ''
  if (nameError?.kind === 'empty') nameMessage = t('Please enter a name')
  else if (nameError?.kind === 'tooLong') {
    nameMessage = t('Name must be 191 characters or fewer')
  } else if (nameError?.kind === 'duplicate') {
    nameMessage = t('Category "{{name}}" already exists', {
      name: nameError.name,
    })
  }
  return (
    <div className='grid max-w-[560px] gap-3 ps-[58px] pe-3.5 pt-1 pb-3.5 max-sm:ps-3.5'>
      <div className='grid gap-1.5'>
        <Label htmlFor={nameId}>{t('Category name *')}</Label>
        <Input
          id={nameId}
          maxLength={MODEL_CATEGORY_NAME_MAX_LENGTH}
          value={category.name}
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
          onChange={(event) => update({ name: event.target.value })}
        />
        {nameError && (
          <p id={`${nameId}-error`} className='text-destructive text-xs'>
            {nameMessage}
          </p>
        )}
      </div>
      <div className='grid gap-1.5'>
        <Label htmlFor={descriptionId}>
          {t('Category description (optional)')}
        </Label>
        <Textarea
          id={descriptionId}
          rows={2}
          maxLength={MODEL_CATEGORY_DESCRIPTION_MAX_LENGTH}
          className='min-h-16'
          value={category.description}
          aria-describedby={`${descriptionId}-hint`}
          onChange={(event) => update({ description: event.target.value })}
        />
        <p
          id={`${descriptionId}-hint`}
          className='text-muted-foreground text-xs'
        >
          {t(
            'Shown in the canvas category menu when the category is hovered or selected. At most {{count}} characters.',
            { count: MODEL_CATEGORY_DESCRIPTION_MAX_LENGTH }
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
                : DEFAULT_CATEGORY_ICON_LABEL_KEY
            )
            const checked = category.iconKey === iconKey
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
                <CategoryIconTile
                  category={{ iconKey, iconColor: category.iconColor }}
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
            value={category.iconKey ? category.iconColor : ''}
            disabled={!category.iconKey}
            onChange={(iconColor) => update({ iconColor })}
          />
          <span className='text-muted-foreground text-xs'>
            {category.iconKey
              ? t(MODEL_COLOR_LABEL_KEYS[category.iconColor])
              : t(
                  'The default icon is neutral gray; choose an icon to set its color'
                )}
          </span>
        </div>
      </fieldset>
      <div className='grid min-w-0 gap-1.5'>
        <span className='flex items-baseline gap-2 text-sm font-semibold'>
          {t('Associated models')}{' '}
          <span className='text-muted-foreground text-xs font-normal'>
            {t(TYPE_MODEL_COUNT_KEYS[props.capability], {
              count: models.length,
            })}
          </span>
        </span>
        <div className='flex flex-wrap items-center gap-x-2.5 gap-y-1.5'>
          {models.length ? (
            models.map((model) => (
              <span
                key={model.modelKey}
                className='bg-muted text-muted-foreground inline-flex h-5 items-center rounded-full px-[7px] text-[11.5px]'
              >
                {model.displayName.trim() || t('(No name)')}
              </span>
            ))
          ) : (
            <span className='text-muted-foreground text-xs'>
              {t('No associated models yet')}
            </span>
          )}
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => setPickingModels(true)}
          >
            {t('Choose models')}
          </Button>
        </div>
      </div>
      <div className='flex border-t border-dashed pt-3'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='text-destructive'
          onClick={() => setDeleting(true)}
        >
          {t('Delete category')}
        </Button>
      </div>
      <ClientPresentationCategoryModelsDialog
        category={pickingModels ? category : null}
        capability={props.capability}
        snapshot={snapshot}
        dispatch={props.dispatch}
        onClose={() => setPickingModels(false)}
      />
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete model category?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This removes the category from {{count}} models. The models and their other categories remain.',
                { count: allModelsCount }
              )}{' '}
              {t('It takes effect after "Save and publish".')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                props.dispatch({ type: 'deleteCategory', id: category.id })
              }
            >
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

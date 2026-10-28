/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { ChevronDown, Clock, Star } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

import {
  type DraftModel,
  type PresentationCapability,
  type PresentationSnapshot,
  typeCategories,
} from '../lib/client-presentation-draft'
import { UNTAGGED_CATEGORY } from '../lib/model-categories'
import { CategoryIconTile } from './CategoryIconTile'
import { ClientPresentationPreviewCategoryMenu } from './ClientPresentationPreviewCategoryMenu'
import { ModelIconTile } from './ModelIconTile'
import { PresentationSegmented } from './PresentationSegmented'

function DraftBadges(props: {
  model: DraftModel
  snapshot: PresentationSnapshot
}) {
  return (
    <>
      {props.model.badgeIds
        .map((id) => props.snapshot.badges.find((badge) => badge.id === id))
        .filter((badge) => badge !== undefined)
        .map((badge) => (
          <span
            key={badge.id}
            className='model-badge'
            data-model-color={badge.color}
          >
            {badge.name}
          </span>
        ))}
    </>
  )
}

/**
 * Replica of the Canvas Web footer: the model menu ("models" mode) or the category menu ("categories" mode), with
 * the category button opening on the default category. Prices and statistics stay placeholders.
 */
export function ClientPresentationPreview(props: {
  mode?: 'models' | 'categories'
  snapshot: PresentationSnapshot
  capability: PresentationCapability
  keys: string[]
  selected: string | null
  onSelect: (modelKey: string) => void
  selectedCategory?: string | null
  onSelectCategory?: (id: string) => void
}) {
  const { t } = useTranslation()
  const mode = props.mode ?? 'models'
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const typed = typeCategories(props.snapshot, props.capability, {
    visibleOnly: true,
  })
  // null follows the default category, so the preview reflects a changed default at once.
  const [chosenCategory, setChosenCategory] = useState<string | null>(null)
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const listedIds = [
    ...typed.categories.map((category) => category.id),
    ...(typed.untaggedCount > 0 ? [UNTAGGED_CATEGORY] : []),
  ]
  // As on the canvas, a type without any category to pick shows "No category" on a disabled button.
  const hasCategories = listedIds.length > 0
  const categoryId =
    chosenCategory && listedIds.includes(chosenCategory)
      ? chosenCategory
      : typed.defaultId
  const models = props.keys.flatMap((key) => props.snapshot.models[key] ?? [])
  const visible = models.filter((model) => model.customerVisible)
  const shown = visible.filter((model) =>
    categoryId === UNTAGGED_CATEGORY
      ? !model.tagIds.length
      : !categoryId || model.tagIds.includes(categoryId)
  )
  const current =
    (props.selected &&
      shown.find((model) => model.modelKey === props.selected)) ||
    shown[0]
  const currentCategory = typed.categories.find(
    (category) => category.id === categoryId
  )
  const modelName = (model: DraftModel) =>
    model.displayName.trim() || t('(No name)')

  useEffect(() => {
    // Keep the model selected in the list visible inside the scrolling menu.
    const menu = menuRef.current
    const row = menu?.querySelector<HTMLElement>('[data-focus-row="true"]')
    if (!menu || !row) return
    const top = row.offsetTop - menu.offsetTop
    if (
      top < menu.scrollTop ||
      top + row.offsetHeight > menu.scrollTop + menu.clientHeight
    ) {
      menu.scrollTop = top - menu.clientHeight / 2 + row.offsetHeight / 2
    }
  }, [props.selected, props.keys])

  const categoryButton = (
    <button
      type='button'
      aria-expanded={
        hasCategories && (mode === 'categories' || categoryMenuOpen)
      }
      aria-haspopup='menu'
      disabled={!hasCategories}
      className='inline-flex h-8 max-w-[170px] cursor-pointer items-center gap-1.5 rounded-[6px] border-0 px-2 text-[13px] font-semibold hover:bg-[var(--model-preview-hover)] disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent aria-expanded:bg-[var(--model-preview-hover)]'
      style={{ color: 'var(--model-preview-text)' }}
      onClick={() => mode === 'models' && setCategoryMenuOpen((open) => !open)}
    >
      <CategoryIconTile
        category={currentCategory}
        kind={categoryId === UNTAGGED_CATEGORY ? 'untagged' : undefined}
        className='size-4 [&>svg]:size-[15px]'
        bare
      />
      <span className='truncate'>
        {categoryId === UNTAGGED_CATEGORY || !currentCategory
          ? t('No category')
          : currentCategory.name.trim() || t('(No name)')}
      </span>
      <ChevronDown aria-hidden='true' className='size-3.5 flex-none' />
    </button>
  )

  const sentences =
    mode === 'categories'
      ? [
          t(
            'Same as the canvas category menu; hover a row to preview its description.'
          ),
          t(
            'Categories without customer-visible models are not shown to customers.'
          ),
          t(
            'Clicking a category in the preview also opens its settings on the left.'
          ),
        ]
      : [
          t(
            'Same as the Canvas Web picker: 440px wide, at most 480px high; about 8 models fit on the first screen and the rest scroll.'
          ),
          t(
            'Prices and success rates do not depend on these settings and use xx placeholders.'
          ),
          t(
            'Showing {{shown}} / {{total}} (models hidden from customers excluded).',
            { shown: shown.length, total: visible.length }
          ),
          t(
            'The category button opens on the default category, as on the canvas.'
          ),
          t(
            'Clicking a model in the preview also opens its settings on the left.'
          ),
        ]

  return (
    <Card
      className='grid gap-2.5 p-3'
      aria-label={t('Client preview')}
      role='complementary'
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-sm font-semibold'>{t('Client preview')}</h3>
        <PresentationSegmented
          label={t('Preview theme')}
          value={theme}
          options={[
            { value: 'dark', label: t('Dark') },
            { value: 'light', label: t('Light') },
          ]}
          onChange={setTheme}
        />
      </div>
      <div
        className={cn(
          'grid justify-items-start gap-2 overflow-hidden rounded-xl px-2 pt-3 pb-2.5',
          theme === 'dark' ? 'model-preview-dark' : 'model-preview-light'
        )}
        style={{ background: 'var(--model-preview-page)' }}
      >
        {mode === 'categories' ? (
          <ClientPresentationPreviewCategoryMenu
            className='max-h-[480px] w-full'
            categories={typed.categories}
            untaggedCount={typed.untaggedCount}
            selected={props.selectedCategory ?? typed.defaultId}
            onSelect={(id) =>
              id !== UNTAGGED_CATEGORY && props.onSelectCategory?.(id)
            }
          />
        ) : (
          <div
            ref={menuRef}
            className='box-border max-h-[480px] w-full overflow-x-hidden overflow-y-auto rounded-xl border p-2 shadow-[0_16px_40px_rgba(0,0,0,0.25)]'
            style={{
              borderColor: 'var(--model-preview-border)',
              background: 'var(--model-preview-surface)',
              color: 'var(--model-preview-text)',
            }}
          >
            <div
              className='flex justify-between px-[7px] pt-0.5 pb-2 text-[11px]'
              style={{ color: 'var(--model-preview-muted)' }}
            >
              <span>{t('Select model')}</span>
              <span>{t('Past 24 hours')}</span>
            </div>
            <div className='grid gap-0.5'>
              {shown.length === 0 && (
                <p
                  className='m-2 text-xs'
                  style={{ color: 'var(--model-preview-muted)' }}
                >
                  {visible.length === 0
                    ? t('No models of this type are visible to customers')
                    : t('No models match the selected categories')}
                </p>
              )}
              {shown.map((model) => {
                const active = model.modelKey === props.selected
                return (
                  <button
                    key={model.modelKey}
                    type='button'
                    data-focus-row={active}
                    title={model.description}
                    className={cn(
                      'box-border flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-[7px] border-0 bg-transparent p-2 text-start hover:bg-[var(--model-preview-hover)]',
                      active &&
                        'bg-[var(--model-preview-hover)] shadow-[inset_0_0_0_1.5px_var(--primary)]'
                    )}
                    style={{ color: 'var(--model-preview-text)' }}
                    onClick={() => {
                      setCategoryMenuOpen(false)
                      props.onSelect(model.modelKey)
                    }}
                  >
                    <ModelIconTile
                      iconKey={model.iconKey}
                      iconColor={model.iconColor}
                      capability={model.capability}
                      className='model-icon-tile--large'
                    />
                    <span className='grid min-w-0 flex-1 gap-[3px]'>
                      <span className='flex min-w-0 items-center gap-1.5'>
                        <span className='min-w-0 truncate text-sm leading-[18px] font-[640]'>
                          {modelName(model)}
                        </span>
                        <DraftBadges model={model} snapshot={props.snapshot} />
                      </span>
                      <span
                        className='text-xs leading-[1.45] font-semibold'
                        style={{ color: 'var(--model-preview-price)' }}
                      >
                        {t('xx points per request')}
                      </span>
                    </span>
                    <span
                      className='inline-flex flex-none gap-2.5 text-[11px] tabular-nums'
                      style={{ color: 'var(--model-preview-muted)' }}
                    >
                      <span
                        className='inline-flex items-center gap-[3px]'
                        style={{ color: 'var(--model-preview-ok)' }}
                      >
                        <Star aria-hidden='true' className='size-[13px]' />
                        xx%
                      </span>
                      <span
                        className='inline-flex items-center gap-[3px]'
                        style={{ color: 'var(--model-preview-duration)' }}
                      >
                        <Clock aria-hidden='true' className='size-[13px]' />
                        xxs
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div className='relative flex w-full items-center gap-1.5'>
          {categoryButton}
          {mode === 'models' && hasCategories && categoryMenuOpen && (
            <ClientPresentationPreviewCategoryMenu
              className='absolute bottom-[calc(100%+6px)] left-0 z-[2] max-h-60 w-[min(320px,100%)]'
              categories={typed.categories}
              untaggedCount={typed.untaggedCount}
              selected={categoryId}
              onSelect={(id) => {
                setChosenCategory(id)
                setCategoryMenuOpen(false)
              }}
            />
          )}
          {mode === 'models' && current && (
            <span
              className='inline-flex h-8 max-w-full items-center gap-1.5 rounded-[9px] border py-0 ps-1 pe-2.5 text-[13px]'
              style={{
                borderColor: 'var(--model-preview-border)',
                background: 'var(--model-preview-surface)',
                color: 'var(--model-preview-text)',
              }}
            >
              <ModelIconTile
                iconKey={current.iconKey}
                iconColor={current.iconColor}
                capability={current.capability}
                className='size-6 [&>svg]:size-[15px]'
              />
              <span className='truncate'>{modelName(current)}</span>
            </span>
          )}
        </div>
      </div>
      <p className='text-muted-foreground text-xs leading-normal'>
        {sentences.join(t('sentence separator'))}
      </p>
    </Card>
  )
}

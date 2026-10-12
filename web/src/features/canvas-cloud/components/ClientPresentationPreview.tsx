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

import type {
  DraftModel,
  PresentationSnapshot,
} from '../lib/client-presentation-draft'
import { ModelIconTile } from './ModelIconTile'
import { PresentationSegmented } from './PresentationSegmented'

const UNTAGGED = '__untagged'

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

/** Replica of the Canvas Web model picker; prices and statistics stay placeholders. */
export function ClientPresentationPreview(props: {
  snapshot: PresentationSnapshot
  keys: string[]
  selected: string | null
  onSelect: (modelKey: string) => void
}) {
  const { t } = useTranslation()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const models = props.keys.flatMap((key) => props.snapshot.models[key] ?? [])
  const visible = models.filter((model) => model.customerVisible)
  const shown = tagFilter.length
    ? visible.filter((model) =>
        tagFilter.some((tagId) =>
          tagId === UNTAGGED
            ? !model.tags.length
            : model.tags.some((tag) => tag.id === tagId)
        )
      )
    : visible
  const usedTags = [
    ...new Map(
      models.flatMap((model) => model.tags).map((tag) => [tag.id, tag])
    ).values(),
  ]
  const hasUntagged = models.some((model) => !model.tags.length)
  const current =
    (props.selected &&
      shown.find((model) => model.modelKey === props.selected)) ||
    shown[0] ||
    visible[0]
  let tagSummary = t('All categories')
  if (tagFilter.length === 1) {
    tagSummary =
      tagFilter[0] === UNTAGGED
        ? t('No category')
        : (usedTags.find((tag) => tag.id === tagFilter[0])?.name ??
          t('All categories'))
  } else if (tagFilter.length > 1) {
    tagSummary = t('{{count}} categories selected', { count: tagFilter.length })
  }
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
                {t('No models match the selected categories')}
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
                    'box-border flex min-h-12 w-full cursor-pointer items-center gap-2.5 rounded-[7px] border-0 bg-transparent px-2 py-[7px] text-start hover:bg-[var(--model-preview-hover)]',
                    active &&
                      'bg-[var(--model-preview-hover)] shadow-[inset_0_0_0_1.5px_var(--primary)]'
                  )}
                  style={{ color: 'var(--model-preview-text)' }}
                  onClick={() => {
                    setTagMenuOpen(false)
                    props.onSelect(model.modelKey)
                  }}
                >
                  <ModelIconTile
                    iconKey={model.iconKey}
                    iconColor={model.iconColor}
                    capability={model.capability}
                  />
                  <span className='grid min-w-0 flex-1 gap-[3px]'>
                    <span className='flex min-w-0 items-center gap-1.5'>
                      <span className='min-w-0 truncate text-sm leading-[18px] font-semibold'>
                        {modelName(model)}
                      </span>
                      <DraftBadges model={model} snapshot={props.snapshot} />
                    </span>
                    <span
                      className='text-[11px] leading-[15px] font-semibold'
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
        <div className='relative flex w-full items-center gap-1.5'>
          <button
            type='button'
            aria-expanded={tagMenuOpen}
            aria-haspopup='true'
            className='inline-flex h-8 max-w-[150px] cursor-pointer items-center gap-1 rounded-[9px] border px-2.5 text-[13px]'
            style={{
              borderColor: 'var(--model-preview-border)',
              background: 'var(--model-preview-surface)',
              color: 'var(--model-preview-text)',
            }}
            onClick={() => setTagMenuOpen((open) => !open)}
          >
            <span className='truncate'>{tagSummary}</span>
            <ChevronDown aria-hidden='true' className='size-3.5 flex-none' />
          </button>
          {tagMenuOpen && (
            <div
              role='group'
              aria-label={t('Categories')}
              className='absolute bottom-[calc(100%+6px)] left-0 z-[2] grid max-h-60 min-w-40 gap-[3px] overflow-y-auto rounded-lg border p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.3)]'
              style={{
                borderColor: 'var(--model-preview-border)',
                background: 'var(--model-preview-surface)',
              }}
            >
              {[
                { id: '', name: t('All categories') },
                ...usedTags,
                ...(hasUntagged
                  ? [{ id: UNTAGGED, name: t('No category') }]
                  : []),
              ].map((tag) => {
                const pressed = tag.id
                  ? tagFilter.includes(tag.id)
                  : tagFilter.length === 0
                return (
                  <button
                    key={tag.id || 'all'}
                    type='button'
                    aria-pressed={pressed}
                    className={cn(
                      'min-h-[30px] cursor-pointer rounded-md border-0 bg-transparent px-2 py-1 text-start text-[13px] hover:bg-[var(--model-preview-hover)]',
                      pressed && 'bg-[var(--model-preview-hover)]'
                    )}
                    style={{ color: 'var(--model-preview-text)' }}
                    onClick={() =>
                      setTagFilter((current) => {
                        if (!tag.id) return []
                        return current.includes(tag.id)
                          ? current.filter((id) => id !== tag.id)
                          : [...current, tag.id]
                      })
                    }
                  >
                    {tag.name}
                  </button>
                )
              })}
            </div>
          )}
          {current && (
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
        {[
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
            'Categories in the filter come from "Manage model categories" and are used here only for the preview.'
          ),
          ...(tagFilter.length
            ? [
                t(
                  'After filtering by category, models keep the administrator order.'
                ),
              ]
            : []),
          t(
            'Clicking a model in the preview also opens its settings on the left.'
          ),
        ].join(t('sentence separator'))}
      </p>
    </Card>
  )
}

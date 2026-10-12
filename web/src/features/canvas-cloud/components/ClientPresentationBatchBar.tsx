/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useState, type Dispatch } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import {
  applyBatch,
  type BatchKind,
  type PresentationCapability,
  type PresentationDraftAction,
  type PresentationSnapshot,
} from '../lib/client-presentation-draft'
import { MODEL_BADGE_LIMIT, MODEL_ICON_KEYS } from '../lib/model-icons'
import {
  DEFAULT_MODEL_ICON_LABEL_KEY,
  MODEL_COLOR_LABEL_KEYS,
  MODEL_ICON_LABEL_KEYS,
} from '../lib/model-presentation-labels'
import { ClientPresentationMoveMenu } from './ClientPresentationMoveMenu'
import { ModelColorSwatches } from './ModelColorSwatches'
import { ModelIconTile } from './ModelIconTile'

const operations: Array<[BatchKind, string]> = [
  ['icon', 'Set icon'],
  ['color', 'Set color'],
  ['add', 'Add badge'],
  ['remove', 'Remove badge'],
]

const doneKeys: Record<BatchKind, string> = {
  icon: 'Set icon "{{label}}" for {{count}} models',
  color: 'Set color "{{label}}" for {{count}} models',
  add: 'Added badge "{{label}}" to {{count}} models',
  remove: 'Removed badge "{{label}}" from {{count}} models',
}

const skippedKeys: Record<BatchKind, string> = {
  icon: '',
  color: '{{count}} models use the default icon and were skipped',
  add: '{{count}} models already have this badge or are full and were skipped',
  remove: '{{count}} models do not have this badge and were skipped',
}

/** Bulk settings for the checked models; results only change the draft. */
export function ClientPresentationBatchBar(props: {
  capability: PresentationCapability
  shownKeys: string[]
  searching: boolean
  picked: Set<string>
  onPickedChange: (picked: Set<string>) => void
  draft: PresentationSnapshot
  dispatch: Dispatch<PresentationDraftAction>
}) {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<BatchKind | null>(null)
  const count = props.picked.size
  const allShownPicked =
    props.shownKeys.length > 0 &&
    props.shownKeys.every((key) => props.picked.has(key))
  if (!props.shownKeys.length) return null

  function apply(kind: BatchKind, value: string | null, label: string) {
    const modelKeys = [...props.picked]
    const result = applyBatch(props.draft, kind, modelKeys, value)
    props.dispatch({ type: 'batch', kind, modelKeys, value })
    setMenu(null)
    const done = t(doneKeys[kind], { count: result.applied, label })
    toast.success(
      result.skipped
        ? t('{{done}}; {{skipped}}. Not published yet.', {
            done,
            skipped: t(skippedKeys[kind], { count: result.skipped }),
          })
        : t('{{done}}. Not published yet.', { done })
    )
  }

  function menuContent(kind: BatchKind) {
    if (kind === 'icon') {
      return (
        <>
          <span className='text-muted-foreground text-xs'>
            {t('Set the icon of the {{count}} selected models', { count })}
          </span>
          <div className='flex flex-wrap items-center gap-1.5'>
            {[null, ...MODEL_ICON_KEYS].map((iconKey) => {
              const label = t(
                iconKey
                  ? MODEL_ICON_LABEL_KEYS[iconKey]
                  : DEFAULT_MODEL_ICON_LABEL_KEY
              )
              return (
                <button
                  key={iconKey ?? 'default'}
                  type='button'
                  aria-label={label}
                  title={label}
                  className='bg-background hover:bg-muted grid size-10 cursor-pointer place-items-center rounded-[10px] border'
                  onClick={() => apply('icon', iconKey, label)}
                >
                  <ModelIconTile
                    iconKey={iconKey}
                    iconColor='gray'
                    capability={props.capability}
                  />
                </button>
              )
            })}
          </div>
        </>
      )
    }
    if (kind === 'color') {
      return (
        <>
          <span className='text-muted-foreground text-xs'>
            {t(
              'Set the icon color of the {{count}} selected models; models with the default icon are skipped',
              { count }
            )}
          </span>
          <ModelColorSwatches
            label={t('Set color')}
            value={null}
            onChange={(color) =>
              apply('color', color, t(MODEL_COLOR_LABEL_KEYS[color]))
            }
          />
        </>
      )
    }
    return (
      <>
        <span className='text-muted-foreground text-xs'>
          {kind === 'add'
            ? t(
                'Add a badge to the {{count}} selected models; models that already have it or already have {{max}} badges are skipped',
                { count, max: MODEL_BADGE_LIMIT }
              )
            : t('Remove a badge from the {{count}} selected models', { count })}
        </span>
        <div className='flex flex-wrap gap-1.5'>
          {props.draft.badges.length === 0 && (
            <span className='text-muted-foreground text-xs'>
              {t('No badges yet')}
            </span>
          )}
          {props.draft.badges.map((badge) => (
            <button
              key={badge.id}
              type='button'
              className='bg-background inline-flex h-[30px] cursor-pointer items-center rounded-lg border px-2.5'
              onClick={() => apply(kind, badge.id, badge.name)}
            >
              <span className='model-badge' data-model-color={badge.color}>
                {badge.name}
              </span>
            </button>
          ))}
        </div>
      </>
    )
  }

  return (
    // Sticks below the page toolbar while the list scrolls; the opaque layer keeps rows from showing through.
    <div className='bg-card sticky top-[var(--presentation-toolbar-height,0px)] z-[5] basis-full py-1'>
      <div
        role='group'
        aria-label={t('Bulk settings')}
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded-[10px] border border-dashed px-2 py-1.5',
          count > 0 && 'border-primary/45 bg-primary/8 border-solid'
        )}
      >
        <label
          className={cn(
            'bg-background inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold',
            allShownPicked && 'border-primary text-primary'
          )}
        >
          <Checkbox
            checked={allShownPicked}
            onCheckedChange={(checked) => {
              const next = new Set(props.picked)
              for (const key of props.shownKeys) {
                if (checked) next.add(key)
                else next.delete(key)
              }
              props.onPickedChange(next)
            }}
          />
          {props.searching
            ? t('Select all {{count}} results', {
                count: props.shownKeys.length,
              })
            : t('Select all {{count}}', { count: props.shownKeys.length })}
        </label>
        <span
          className={cn(
            'text-xs',
            count ? 'px-1 font-semibold' : 'text-muted-foreground'
          )}
        >
          {count
            ? t('Selected {{count}}', { count })
            : t('Select models to set them in bulk')}
        </span>
        <span className='flex-1' />
        {operations.map(([kind, label]) => (
          <Popover
            key={kind}
            open={menu === kind}
            onOpenChange={(open) => setMenu(open ? kind : null)}
          >
            <PopoverTrigger
              render={
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={!count}
                  title={count ? undefined : t('Select models first')}
                  className={cn(menu === kind && 'border-primary')}
                />
              }
            >
              {t(label)}
            </PopoverTrigger>
            <PopoverContent
              align='start'
              className='w-auto max-w-[min(460px,calc(100vw-32px))] gap-2'
            >
              {menuContent(kind)}
            </PopoverContent>
          </Popover>
        ))}
        <ClientPresentationMoveMenu
          count={count}
          total={props.draft.orders[props.capability].length}
          onMove={(target) => {
            const modelKeys = [...props.picked]
            props.dispatch({
              type: 'moveMany',
              capability: props.capability,
              modelKeys,
              target,
            })
            let done = t('Moved {{count}} models to position {{position}}', {
              count: modelKeys.length,
              position: target,
            })
            if (target === 'top') {
              done = t('Moved {{count}} models to the top', {
                count: modelKeys.length,
              })
            }
            if (target === 'bottom') {
              done = t('Moved {{count}} models to the bottom', {
                count: modelKeys.length,
              })
            }
            toast.success(t('{{done}}. Not published yet.', { done }))
          }}
        />
        {count > 0 && (
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => props.onPickedChange(new Set())}
          >
            {t('Deselect')}
          </Button>
        )}
      </div>
    </div>
  )
}

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
import { type Dispatch, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

import {
  type PresentationCapability,
  type PresentationDraftAction,
  type PresentationDraftState,
  typeCategories,
} from '../lib/client-presentation-draft'
import { UNTAGGED_CATEGORY } from '../lib/model-categories'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { ClientPresentationCategoryEditor } from './ClientPresentationCategoryEditor'
import { ClientPresentationCategoryRow } from './ClientPresentationCategoryRow'
import type { MoveAction } from './ClientPresentationModelRow'
import { ClientPresentationPreview } from './ClientPresentationPreview'

/** "展示与分类 › 分类": the categories of one generation type with their order, default, presentation and models. */
export function ClientPresentationCategories(props: {
  state: PresentationDraftState
  capability: PresentationCapability
  dispatch: Dispatch<PresentationDraftAction>
}) {
  const { t } = useTranslation()
  const { capability } = props
  const draft = props.state.draft
  const [selected, setSelected] = useState<string | null>(null)
  const listRef = useRef<HTMLOListElement>(null)
  const dragFrom = useRef<{ id: string; index: number } | null>(null)
  const pendingFocus = useRef<{
    id: string
    action?: MoveAction
    name?: boolean
  } | null>(null)
  const listed = typeCategories(draft, capability, { visibleOnly: false })
  const setting = draft.categoryDefaults[capability]
  let defaultValue = listed.defaultId
  if (setting.untagged) defaultValue = UNTAGGED_CATEGORY
  else if (setting.tagId) defaultValue = setting.tagId
  const defaultOptions = [
    ...listed.categories
      .filter((category) => category.count > 0)
      .map((category) => ({
        value: category.id,
        label: category.name.trim() || t('(No name)'),
      })),
    ...(listed.untaggedCount > 0
      ? [{ value: UNTAGGED_CATEGORY, label: t('No category') }]
      : []),
  ]
  const defaultLabel =
    defaultOptions.find((option) => option.value === defaultValue)?.label ??
    t('Not set')

  const move = (id: string, to: number, action?: MoveAction) => {
    pendingFocus.current = action ? { id, action } : null
    props.dispatch({ type: 'moveCategory', capability, id, target: to + 1 })
  }

  useLayoutEffect(() => {
    const focus = pendingFocus.current
    if (!focus) return
    pendingFocus.current = null
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-category-id="${CSS.escape(focus.id)}"]`
    )
    row?.scrollIntoView({ block: 'nearest' })
    if (focus.name) {
      row
        ?.querySelector<HTMLInputElement>(
          'input[id^="client-presentation-category-name-"]'
        )
        ?.focus()
      return
    }
    if (!focus.action) return
    const button =
      row?.querySelector<HTMLButtonElement>(
        `[data-move="${focus.action}"]:not(:disabled)`
      ) ?? row?.querySelector<HTMLButtonElement>('[data-move]:not(:disabled)')
    button?.focus()
  })

  return (
    <div className='grid max-w-[1240px] items-start gap-4 min-[1200px]:grid-cols-[minmax(0,1fr)_482px]'>
      <Card className='min-w-0 overflow-visible p-2'>
        <div className='flex flex-wrap items-center gap-2 px-1 pt-1 pb-2'>
          <Label className='text-muted-foreground text-sm font-normal'>
            {t('Default category')}
          </Label>
          <Select
            value={defaultValue ?? ''}
            onValueChange={(value) =>
              props.dispatch({
                type: 'setDefaultCategory',
                capability,
                value: value || null,
              })
            }
            disabled={!defaultOptions.length}
          >
            <SelectTrigger
              className='w-auto min-w-[160px]'
              aria-label={t('Default category')}
            >
              <CanvasLocalizedSelectValue
                value={defaultValue ?? ''}
                displayValue={defaultLabel}
              />
            </SelectTrigger>
            <SelectContent>
              {defaultOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              const id = `new-${props.state.nextCategoryRef}`
              props.dispatch({ type: 'createCategory', capability })
              setSelected(id)
              pendingFocus.current = { id, name: true }
            }}
          >
            {t('New category')}
          </Button>
          <span className='text-muted-foreground basis-full text-xs'>
            {t('{{count}} categories.', { count: listed.categories.length })}{' '}
            {t(
              'When a node of this type is created, the canvas opens on the default category; without a default, or after it is deleted, the first category in order is used.'
            )}
          </span>
        </div>
        <ol ref={listRef} className='m-0 grid list-none gap-1 p-0'>
          {listed.categories.length === 0 && (
            <li className='text-muted-foreground px-4 py-12 text-center'>
              {t('This generation type has no categories yet')}
            </li>
          )}
          {listed.categories.map((category, index) => (
            <ClientPresentationCategoryRow
              key={category.id}
              category={category}
              capability={capability}
              index={index}
              total={listed.categories.length}
              isDefault={category.id === listed.defaultId}
              expanded={selected === category.id}
              onToggle={(id) =>
                setSelected((current) => (current === id ? null : id))
              }
              onMove={move}
              onDragStart={(id, from) => {
                dragFrom.current = { id, index: from }
              }}
              onDrop={(to) => {
                const from = dragFrom.current
                dragFrom.current = null
                if (from && from.index !== to) move(from.id, to)
              }}
            >
              {selected === category.id && (
                <ClientPresentationCategoryEditor
                  category={category}
                  capability={capability}
                  snapshot={draft}
                  dispatch={props.dispatch}
                />
              )}
            </ClientPresentationCategoryRow>
          ))}
        </ol>
      </Card>
      <div className='min-[1200px]:sticky min-[1200px]:top-[calc(var(--presentation-toolbar-height,0px)+1rem)] min-[1200px]:max-h-[calc(var(--presentation-scroll-area-height,100dvh)-var(--presentation-toolbar-height,0px)-2.5rem)] min-[1200px]:overflow-y-auto'>
        <ClientPresentationPreview
          key={capability}
          mode='categories'
          snapshot={draft}
          capability={capability}
          keys={draft.orders[capability]}
          selected={null}
          selectedCategory={selected}
          onSelect={() => undefined}
          onSelectCategory={(id) => {
            setSelected(id)
            pendingFocus.current = { id }
          }}
        />
      </div>
    </div>
  )
}

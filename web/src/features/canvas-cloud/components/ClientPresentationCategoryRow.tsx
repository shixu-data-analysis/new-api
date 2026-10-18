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
import {
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { PresentationCapability, TypeCategory } from '../lib/client-presentation-draft'
import { TYPE_MODEL_COUNT_KEYS } from '../lib/model-categories'
import { CategoryIconTile } from './CategoryIconTile'
import type { MoveAction } from './ClientPresentationModelRow'
import { ClientPresentationPositionInput } from './ClientPresentationPositionInput'

/** One category of a generation type's order, laid out like a model row: drag handle, position, identity, order buttons and the inline editor. */
export function ClientPresentationCategoryRow(props: {
  category: TypeCategory
  capability: PresentationCapability
  index: number
  total: number
  isDefault: boolean
  expanded: boolean
  onToggle: (id: string) => void
  /** Moves the category to the 0-based order position; the action keeps focus on the pressed button. */
  onMove: (id: string, to: number, action?: MoveAction) => void
  onDragStart: (id: string, index: number) => void
  onDrop: (index: number) => void
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const [dragOver, setDragOver] = useState(false)
  const [dragging, setDragging] = useState(false)
  const { category } = props
  const name = category.name.trim() || t('(No name)')
  const moves: Array<[MoveAction, string, string, ReactNode, number | undefined]> = [
    ['top', t('Move to top'), t('Move {{name}} to top', { name }), <ArrowUpToLine key='top' aria-hidden='true' />, props.index > 0 ? 0 : undefined],
    ['up', t('Move up'), t('Move {{name}} up', { name }), <ChevronUp key='up' aria-hidden='true' />, props.index > 0 ? props.index - 1 : undefined],
    ['down', t('Move down'), t('Move {{name}} down', { name }), <ChevronDown key='down' aria-hidden='true' />, props.index < props.total - 1 ? props.index + 1 : undefined],
  ]
  return (
    <li
      data-category-id={category.id}
      className={cn(
        'rounded-xl border border-transparent',
        props.expanded && 'border-border bg-primary/8',
        dragOver && 'shadow-[0_-2px_0_var(--primary)]',
        dragging && 'opacity-40'
      )}
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        props.onDrop(props.index)
      }}
    >
      <div
        draggable
        className={cn(
          'flex min-w-0 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2',
          !props.expanded && 'hover:bg-muted'
        )}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-row-control]')) return
          props.onToggle(category.id)
        }}
        onDragStart={(event) => {
          setDragging(true)
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', category.id)
          props.onDragStart(category.id, props.index)
        }}
        onDragEnd={() => setDragging(false)}
      >
        <span
          aria-hidden='true'
          title={t('Drag to reorder')}
          className='text-muted-foreground grid w-[18px] flex-none cursor-grab place-items-center'
        >
          <GripVertical className='size-4' />
        </span>
        <ClientPresentationPositionInput
          name={name}
          position={props.index + 1}
          total={props.total}
          onMoveTo={(position) => props.onMove(category.id, position - 1)}
        />
        <CategoryIconTile category={category} />
        <div className='grid min-w-0 flex-1 gap-0.5'>
          <div className='flex min-w-0 flex-wrap items-center gap-1.5 font-semibold'>
            <span className='min-w-0 truncate'>{name}</span>
            {props.isDefault && (
              <span className='bg-primary/12 text-primary inline-flex h-5 items-center rounded-full px-[7px] text-[11.5px] font-normal whitespace-nowrap'>
                {t('Default display')}
              </span>
            )}
            {category.count === 0 && (
              <span className='bg-muted text-muted-foreground inline-flex h-5 items-center rounded-full px-[7px] text-[11.5px] font-normal whitespace-nowrap'>
                {t('No models · hidden from customers')}
              </span>
            )}
          </div>
          <div className='text-muted-foreground truncate text-xs'>
            {t(TYPE_MODEL_COUNT_KEYS[props.capability]!, { count: category.count })}
          </div>
        </div>
        <div data-row-control className='flex flex-none gap-0.5 max-sm:hidden'>
          {moves.map(([action, label, accessibleLabel, icon, to]) => (
            <Button
              key={action}
              type='button'
              size='icon-sm'
              variant='outline'
              data-move={action}
              aria-label={accessibleLabel}
              title={label}
              disabled={to === undefined}
              onClick={() => {
                if (to !== undefined) props.onMove(category.id, to, action)
              }}
            >
              {icon}
            </Button>
          ))}
        </div>
        <Button
          data-row-control
          type='button'
          size='icon-sm'
          variant='ghost'
          aria-expanded={props.expanded}
          aria-label={props.expanded ? t('Collapse {{name}}', { name }) : t('Edit {{name}}', { name })}
          onClick={() => props.onToggle(category.id)}
        >
          <ChevronDown
            aria-hidden='true'
            className={cn('transition-transform motion-reduce:transition-none', props.expanded && 'rotate-180')}
          />
        </Button>
      </div>
      {props.expanded && props.children}
    </li>
  )
}

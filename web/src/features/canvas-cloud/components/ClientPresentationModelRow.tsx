/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from 'lucide-react'
import { memo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

import type { DraftModel } from '../lib/client-presentation-draft'
import type { CanvasClientPresentationBadge } from '../types'
import { ClientPresentationPositionInput } from './ClientPresentationPositionInput'
import { ModelIconTile } from './ModelIconTile'

export type MoveAction = 'top' | 'up' | 'down'

/**
 * One model of the order list: selection, drag handle, position, identity, order buttons and the inline editor.
 * Callbacks take the model key and stay the same between renders, so only rows whose props changed render again.
 */
export const ClientPresentationModelRow = memo(
  function ClientPresentationModelRow(props: {
    model: DraftModel
    index: number
    total: number
    /** Order positions of the visible models above and below; up and down jump over hidden models. */
    previousIndex: number | undefined
    nextIndex: number | undefined
    expanded: boolean
    checked: boolean
    unsorted: boolean
    badges: CanvasClientPresentationBadge[]
    onToggle: (modelKey: string) => void
    onCheckedChange: (modelKey: string, checked: boolean) => void
    /** Moves the model to the 0-based order position; the action keeps focus on the pressed button. */
    onMove: (modelKey: string, to: number, action?: MoveAction) => void
    onDragStart: (modelKey: string, index: number) => void
    onDrop: (index: number) => void
    /** The editor of the expanded row. */
    children?: ReactNode
  }) {
    const { t } = useTranslation()
    const [dragOver, setDragOver] = useState(false)
    const [dragging, setDragging] = useState(false)
    const { model } = props
    const name = model.displayName.trim() || t('(No name)')
    const badges = model.badgeIds
      .map((id) => props.badges.find((badge) => badge.id === id))
      .filter((badge) => badge !== undefined)
    const moves: Array<
      [MoveAction, string, string, ReactNode, number | undefined]
    > = [
      [
        'top',
        t('Move to top'),
        t('Move {{name}} to top', { name }),
        <ArrowUpToLine key='top' aria-hidden='true' />,
        props.index > 0 ? 0 : undefined,
      ],
      [
        'up',
        t('Move up'),
        t('Move {{name}} up', { name }),
        <ChevronUp key='up' aria-hidden='true' />,
        props.previousIndex,
      ],
      [
        'down',
        t('Move down'),
        t('Move {{name}} down', { name }),
        <ChevronDown key='down' aria-hidden='true' />,
        props.nextIndex,
      ],
    ]
    return (
      <li
        data-model-key={model.modelKey}
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
            !props.expanded && 'hover:bg-muted',
            props.checked && 'bg-primary/8'
          )}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('[data-row-control]')) {
              return
            }
            props.onToggle(model.modelKey)
          }}
          onDragStart={(event) => {
            setDragging(true)
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', model.modelKey)
            props.onDragStart(model.modelKey, props.index)
          }}
          onDragEnd={() => setDragging(false)}
        >
          <span data-row-control className='flex'>
            <Checkbox
              checked={props.checked}
              aria-label={t('Select {{name}}', { name })}
              onCheckedChange={(checked) =>
                props.onCheckedChange(model.modelKey, Boolean(checked))
              }
            />
          </span>
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
            onMoveTo={(position) => props.onMove(model.modelKey, position - 1)}
          />
          <ModelIconTile
            iconKey={model.iconKey}
            iconColor={model.iconColor}
            capability={model.capability}
          />
          <div className='grid min-w-0 flex-1 gap-0.5'>
            <div className='flex min-w-0 flex-wrap items-center gap-1.5 font-semibold'>
              <span className='min-w-0 truncate'>{name}</span>
              {badges.map((badge) => (
                <span
                  key={badge.id}
                  className='model-badge'
                  data-model-color={badge.color}
                >
                  {badge.name}
                </span>
              ))}
              {props.unsorted && (
                <span className='inline-flex h-5 items-center rounded-full bg-amber-600/12 px-[7px] text-[11.5px] font-normal whitespace-nowrap text-amber-700 dark:text-amber-400'>
                  {t('Unsorted')}
                </span>
              )}
              {!model.customerVisible && (
                <span
                  title={t(
                    'Published, but not yet open to any price group; not shown in the client preview'
                  )}
                  className='bg-muted text-muted-foreground inline-flex h-5 items-center rounded-full px-[7px] text-[11.5px] font-normal whitespace-nowrap'
                >
                  {t('Hidden from customers')}
                </span>
              )}
            </div>
            <div className='text-muted-foreground truncate font-mono text-xs'>
              {t('{{modelKey}} · {{provider}}', {
                modelKey: model.modelKey,
                provider: model.providerName,
              })}
            </div>
          </div>
          <div
            data-row-control
            className='flex flex-none gap-0.5 max-sm:hidden'
          >
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
                  if (to !== undefined) props.onMove(model.modelKey, to, action)
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
            aria-label={
              props.expanded
                ? t('Collapse {{name}}', { name })
                : t('Edit {{name}}', { name })
            }
            onClick={() => props.onToggle(model.modelKey)}
          >
            <ChevronDown
              aria-hidden='true'
              className={cn(
                'transition-transform motion-reduce:transition-none',
                props.expanded && 'rotate-180'
              )}
            />
          </Button>
        </div>
        {props.expanded && props.children}
      </li>
    )
  }
)

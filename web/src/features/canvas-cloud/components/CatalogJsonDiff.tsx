/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  foldCatalogJsonDiff,
  type CatalogJsonDiff as CatalogJsonDiffResult,
  type CatalogJsonDiffItem,
  type CatalogJsonDiffLine,
} from '../catalog-json-diff'

function DiffLine(props: { line: CatalogJsonDiffLine; marked: boolean }) {
  const { line } = props
  let marker = ' '
  let content: ReactNode = line.text
  if (props.marked && line.kind === 'removed') {
    marker = '−'
    content = <del className='no-underline'>{line.text}</del>
  } else if (props.marked && line.kind === 'added') {
    marker = '+'
    content = <ins className='no-underline'>{line.text}</ins>
  }
  return (
    <div
      className={cn(
        'flex px-2 whitespace-pre',
        props.marked &&
          line.kind === 'removed' &&
          'bg-destructive/10 text-destructive',
        props.marked &&
          line.kind === 'added' &&
          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      )}
    >
      <span aria-hidden='true' className='w-4 shrink-0 select-none'>
        {marker}
      </span>
      {content}
    </div>
  )
}

/** Old and new JSON compared line by line; shared by model and shared-resource details. */
export function CatalogJsonDiff(props: {
  title: string
  summary: ReactNode
  diff: CatalogJsonDiffResult
  actions?: ReactNode
}) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const { diff } = props
  const changed = diff.hasCurrent && diff.added + diff.removed > 0
  const changesOnly = changed && !showAll
  const items = useMemo<CatalogJsonDiffItem[]>(
    () =>
      changesOnly
        ? foldCatalogJsonDiff(diff.lines)
        : diff.lines.map((_, index) => ({ type: 'line', index })),
    [changesOnly, diff.lines]
  )
  return (
    <div className='min-w-0 space-y-2'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0'>
          <div className='font-medium'>{props.title}</div>
          <div className='text-muted-foreground text-xs'>{props.summary}</div>
        </div>
        <div className='flex flex-wrap gap-2'>
          {changed && (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? t('Show changes only') : t('Show full text')}
            </Button>
          )}
          {props.actions}
        </div>
      </div>
      <div
        role='region'
        aria-label={props.title}
        tabIndex={0}
        className='bg-muted/30 max-h-[420px] overflow-auto rounded-md border py-1 font-mono text-xs'
      >
        <div className='min-w-max'>
          {items.map((item) => {
            if (item.type === 'line') {
              return (
                <DiffLine
                  key={item.index}
                  line={diff.lines[item.index]}
                  marked={diff.hasCurrent}
                />
              )
            }
            return (
              <button
                key={`fold-${item.from}`}
                type='button'
                className='text-muted-foreground hover:bg-muted block w-full px-2 py-0.5 text-left'
                // Any folded run switches to the full text; "Show changes only" folds again.
                onClick={() => setShowAll(true)}
              >
                {t('⋯ {{count}} unchanged lines. Click to expand.', {
                  count: item.to - item.from + 1,
                })}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

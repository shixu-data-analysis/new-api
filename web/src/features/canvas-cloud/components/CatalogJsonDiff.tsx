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
import { ChevronsDownUp, ChevronsUpDown, Copy } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import {
  foldCatalogJsonDiff,
  type CatalogJsonDiff as CatalogJsonDiffResult,
  type CatalogJsonDiffItem,
  type CatalogJsonDiffLine,
} from '../catalog-json-diff'
import { copyText as copyToClipboardWithFeedback } from '../copy-text'
import { CodeBlockAction } from './CodeBlock'

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
        'flex px-2 [overflow-wrap:anywhere] whitespace-pre-wrap',
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
      <span className='min-w-0'>{content}</span>
    </div>
  )
}

/**
 * Old and new JSON compared line by line; shared by model and shared-resource details. It looks like
 * `CodeBlock`: long lines wrap, and switching between changes and full text and copying are icons in
 * the top-right corner.
 */
export function CatalogJsonDiff(props: {
  title: string
  summary: ReactNode
  diff: CatalogJsonDiffResult
  /** What the copy icon copies; without it there is no copy icon. */
  copyText?: string
}) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const { diff, copyText } = props
  const changed = diff.hasCurrent && diff.added + diff.removed > 0
  const changesOnly = changed && !showAll
  const items = useMemo<CatalogJsonDiffItem[]>(
    () =>
      changesOnly
        ? foldCatalogJsonDiff(diff.lines)
        : diff.lines.map((_, index) => ({ type: 'line', index })),
    [changesOnly, diff.lines]
  )
  const actionCount = (changed ? 1 : 0) + (copyText !== undefined ? 1 : 0)
  return (
    <div className='min-w-0 space-y-2'>
      <div className='min-w-0'>
        <div className='font-medium'>{props.title}</div>
        <div className='text-muted-foreground text-xs'>{props.summary}</div>
      </div>
      <div className='relative min-w-0'>
        <div
          role='region'
          aria-label={props.title}
          tabIndex={0}
          className={cn(
            'bg-muted max-h-[420px] overflow-auto rounded-md px-1 py-3 font-mono text-xs',
            actionCount === 2 && 'pr-18',
            actionCount === 1 && 'pr-10'
          )}
        >
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
                className='text-muted-foreground hover:bg-background block w-full px-2 py-0.5 text-left'
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
        {actionCount > 0 ? (
          <TooltipProvider delay={200}>
            <div className='absolute top-1.5 right-1.5 flex items-center gap-0.5'>
              {changed ? (
                <CodeBlockAction
                  label={t(showAll ? 'Show changes only' : 'Show full text')}
                  onClick={() => setShowAll((value) => !value)}
                >
                  {showAll ? (
                    <ChevronsDownUp aria-hidden='true' className='size-4' />
                  ) : (
                    <ChevronsUpDown aria-hidden='true' className='size-4' />
                  )}
                </CodeBlockAction>
              ) : null}
              {copyText !== undefined ? (
                <CodeBlockAction
                  label={t('Copy JSON')}
                  onClick={() =>
                    void copyToClipboardWithFeedback(copyText, {
                      copied: t('Copied'),
                      failed: t('Failed to copy to clipboard'),
                    })
                  }
                >
                  <Copy aria-hidden='true' className='size-4' />
                </CodeBlockAction>
              ) : null}
            </div>
          </TooltipProvider>
        ) : null}
      </div>
    </div>
  )
}

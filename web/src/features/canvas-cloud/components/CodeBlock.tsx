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
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { copyText as copyToClipboardWithFeedback } from '../copy-text'

/**
 * A block of code-like text (JSON, request lines, codes) shared by the Canvas pages. It is as wide as its
 * content up to a readable width; long lines wrap and a tall block scrolls inside. "Show full content" and
 * copy are icons in the block's top-right corner, explained on hover.
 */
export function CodeBlock(props: {
  text: string
  /** What the copy icon copies when it differs from the shown text; `null` leaves the copy icon out. */
  copyText?: string | null
  /** A shortened text shown first; an icon switches to `text`. */
  collapsedText?: string
  className?: string
  'aria-label'?: string
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const collapsible =
    props.collapsedText !== undefined && props.collapsedText !== props.text
  const shown = collapsible && !expanded ? props.collapsedText : props.text
  const copied = props.copyText === undefined ? props.text : props.copyText
  const actionCount = (collapsible ? 1 : 0) + (copied !== null ? 1 : 0)
  return (
    <div className='relative w-fit max-w-full min-w-0 lg:max-w-3xl'>
      <pre
        aria-label={props['aria-label']}
        className={cn(
          'bg-muted max-h-72 overflow-auto rounded-md p-3 font-mono text-xs [overflow-wrap:anywhere] whitespace-pre-wrap',
          actionCount === 2 && 'pr-18',
          actionCount === 1 && 'pr-10',
          props.className
        )}
      >
        {shown}
      </pre>
      {actionCount > 0 ? (
        <TooltipProvider delay={200}>
          <div className='absolute top-1.5 right-1.5 flex items-center gap-0.5'>
            {collapsible ? (
              <CodeBlockAction
                label={t(expanded ? 'Collapse' : 'Show full content')}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? (
                  <ChevronsDownUp aria-hidden='true' className='size-4' />
                ) : (
                  <ChevronsUpDown aria-hidden='true' className='size-4' />
                )}
              </CodeBlockAction>
            ) : null}
            {copied !== null ? (
              <CodeBlockAction
                label={t('Copy')}
                onClick={() =>
                  void copyToClipboardWithFeedback(copied, {
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
  )
}

function CodeBlockAction(props: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            aria-label={props.label}
            className='bg-muted hover:bg-background'
            onClick={props.onClick}
          >
            {props.children}
          </Button>
        }
      />
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  )
}

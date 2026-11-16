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
import type { ReactElement, ReactNode } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * The one hover text of Canvas Cloud pages: an explanation, a value list or an icon button's name. The trigger element
 * keeps its own semantics and accessible name; line breaks in text content are kept.
 */
export function CanvasTooltip(props: {
  content: ReactNode
  children: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  contentClassName?: string
}) {
  return (
    <TooltipProvider delay={200}>
      <Tooltip open={props.open} onOpenChange={props.onOpenChange}>
        <TooltipTrigger render={props.children} />
        <TooltipContent
          className={cn(
            'max-w-72 leading-relaxed whitespace-pre-line',
            props.contentClassName
          )}
        >
          {props.content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Label and value rows inside a CanvasTooltip, such as a model's identity. */
export function CanvasTooltipRows(props: {
  rows: ReadonlyArray<{ label: string; value: ReactNode; code?: boolean }>
}) {
  return (
    <dl className='grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1.5'>
      {props.rows.map((row) => (
        <div key={row.label} className='contents'>
          <dt className='text-background/70'>{row.label}</dt>
          <dd className={row.code ? 'font-mono break-all' : 'break-words'}>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A small info icon that opens a CanvasTooltip; it only darkens on hover, without a button background. */
export const canvasInfoTriggerClassName =
  'text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-sm align-middle focus-visible:ring-2 focus-visible:outline-none [&_svg]:size-4'

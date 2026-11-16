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
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** The support views: a list on the left, the chosen conversation or model on the right. */
export const SUPPORT_SPLIT_LAYOUT =
  'grid items-start gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]'

/**
 * One row of a support list. The conversation and failure alert lists change their row look together, so the chosen and
 * hover backgrounds are defined here once.
 */
export function SupportListItem(props: {
  selected: boolean
  className: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <li>
      <button
        type='button'
        aria-pressed={props.selected}
        className={cn(
          'w-full rounded-lg p-2.5 text-start',
          props.className,
          props.selected ? 'bg-muted/60' : 'hover:bg-muted/40'
        )}
        onClick={props.onClick}
      >
        {props.children}
      </button>
    </li>
  )
}

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
import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * A row's one main action, its other actions, and the dangerous ones, which come last (Canvas Cloud table guide,
 * row actions). Icon actions such as copy and more stay icon buttons.
 */
export type CanvasRowActionTone = 'primary' | 'normal' | 'danger'

const variantOf = {
  primary: 'ghost',
  normal: 'outline',
  danger: 'destructive',
} as const

// Tinted like a dangerous action, so the main action stands out without a column of solid blocks down the page.
const primaryClass =
  'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary aria-expanded:bg-primary/20 aria-expanded:text-primary dark:bg-primary/20 dark:hover:bg-primary/30'

/** A text action in a table row: every Canvas Cloud table uses this one size and these three tones. */
export function CanvasRowAction({
  tone = 'normal',
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'variant' | 'size'> & {
  tone?: CanvasRowActionTone
}) {
  return (
    <Button
      {...props}
      data-row-action={tone}
      size='sm'
      variant={variantOf[tone]}
      className={cn(tone === 'primary' && primaryClass, className)}
    />
  )
}

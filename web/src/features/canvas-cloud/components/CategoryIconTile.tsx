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
import { Inbox, Layers, Tag } from 'lucide-react'

import { cn } from '@/lib/utils'

import { MODEL_ICON_KEYS } from '../lib/model-icons'
import { ModelIconTile } from './ModelIconTile'

/**
 * Decorative category icon: the chosen model icon in its color, or a neutral tag when the category has no icon.
 * "All categories" and "no category" have their own neutral icons. The category name stays the accessible label.
 */
export function CategoryIconTile(props: {
  category?: { iconKey: string | null; iconColor: string | null }
  kind?: 'all' | 'untagged'
  className?: string
  /** Only the glyph, without the tinted tile, for use inside a button that has its own hover fill. */
  bare?: boolean
}) {
  const iconKey = props.category?.iconKey
  if (!props.kind && iconKey && (MODEL_ICON_KEYS as readonly string[]).includes(iconKey)) {
    return (
      <ModelIconTile
        iconKey={iconKey}
        iconColor={props.category?.iconColor}
        capability={null}
        className={props.className}
        bare={props.bare}
      />
    )
  }
  let Glyph = Tag
  if (props.kind === 'all') Glyph = Layers
  else if (props.kind === 'untagged') Glyph = Inbox
  return (
    <span
      className={cn('model-icon-tile', props.className)}
      data-model-color='none'
      style={props.bare ? { background: 'transparent' } : undefined}
      aria-hidden='true'
    >
      <Glyph />
    </span>
  )
}

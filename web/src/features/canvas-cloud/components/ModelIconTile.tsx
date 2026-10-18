/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Box, Image as ImageIcon, MessageSquare, Video } from 'lucide-react'

import { cn } from '@/lib/utils'

import { modelIconSymbolId, resolveModelIcon } from '../lib/model-icons'

const genericIcons = {
  image: ImageIcon,
  video: Video,
  chat: MessageSquare,
  box: Box,
}

/** Decorative 28×28 model icon; the model name next to it stays the accessible label. */
export function ModelIconTile(props: {
  iconKey: string | null | undefined
  iconColor: string | null | undefined
  capability: unknown
  className?: string
  /** Only the glyph, without the tinted tile, for use inside a button that has its own hover fill. */
  bare?: boolean
}) {
  const icon = resolveModelIcon(
    props.iconKey,
    props.iconColor,
    props.capability
  )
  let glyph
  if (icon.kind === 'brand') {
    glyph = (
      <svg viewBox='0 0 24 24'>
        <use href={`#${modelIconSymbolId(icon.key)}`} />
      </svg>
    )
  } else {
    const GenericIcon = genericIcons[icon.icon]
    glyph = <GenericIcon />
  }
  return (
    <span
      className={cn('model-icon-tile', props.className)}
      data-model-color={icon.color ?? 'none'}
      style={props.bare ? { background: 'transparent' } : undefined}
      aria-hidden='true'
    >
      {glyph}
    </span>
  )
}

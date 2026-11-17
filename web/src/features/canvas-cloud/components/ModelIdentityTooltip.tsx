/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CanvasTooltip,
  CanvasTooltipRows,
  canvasInfoTriggerClassName,
} from './CanvasTooltip'

export interface ModelIdentityTooltipProps {
  effectiveDisplayName: string
  catalogDefaultName: string
  modelKey: string
  upstreamModelId?: string | null
  upstreamModelIds?: readonly string[]
  modelKeyShown?: boolean
  upstreamModelIdShown?: boolean
  upstreamModelIdsShown?: readonly string[]
}

export function ModelIdentityTooltip(props: ModelIdentityTooltipProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const shownUpstreamModelIds = new Set(props.upstreamModelIdsShown ?? [])
  const upstreamModelIds = [
    ...(props.upstreamModelId ? [props.upstreamModelId] : []),
    ...(props.upstreamModelIds ?? []),
  ].filter(
    (id, index, values) =>
      Boolean(id) &&
      values.indexOf(id) === index &&
      !props.upstreamModelIdShown &&
      !shownUpstreamModelIds.has(id)
  )

  const catalogNameDiffers =
    props.effectiveDisplayName !== props.catalogDefaultName
  // The control hides only when it would add nothing to what the page already shows.
  if (
    !catalogNameDiffers &&
    props.modelKeyShown &&
    upstreamModelIds.length === 0
  ) {
    return null
  }

  const rows = [
    ...(catalogNameDiffers
      ? [{ label: t('Catalog default name'), value: props.catalogDefaultName }]
      : []),
    ...(props.modelKeyShown
      ? []
      : [{ label: t('Model key'), value: props.modelKey, code: true }]),
    ...(upstreamModelIds.length > 0
      ? [
          {
            label: t('Upstream model ID'),
            value: (
              <span className='block space-y-1'>
                {upstreamModelIds.map((upstreamModelId) => (
                  <span key={upstreamModelId} className='block'>
                    {upstreamModelId}
                  </span>
                ))}
              </span>
            ),
            code: true,
          },
        ]
      : []),
  ]

  return (
    <CanvasTooltip
      open={open}
      onOpenChange={setOpen}
      contentClassName='block max-w-80 p-3'
      content={<CanvasTooltipRows rows={rows} />}
    >
      <button
        type='button'
        className={`${canvasInfoTriggerClassName} ms-1`}
        aria-label={t('View model identity')}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <HugeiconsIcon icon={InformationCircleIcon} aria-hidden='true' />
      </button>
    </CanvasTooltip>
  )
}

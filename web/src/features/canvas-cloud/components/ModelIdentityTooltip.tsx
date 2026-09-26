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

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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

  if (props.effectiveDisplayName === props.catalogDefaultName) return null

  const trigger = (
    <Button
      type='button'
      variant='ghost'
      size='icon-xs'
      className='text-muted-foreground hover:text-foreground ms-1 inline-flex align-middle'
      aria-label={t('View model identity')}
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
    >
      <HugeiconsIcon icon={InformationCircleIcon} aria-hidden='true' />
    </Button>
  )

  return (
    <TooltipProvider delay={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger render={trigger} />
        <TooltipContent className='block max-w-80 space-y-2 p-3 leading-relaxed'>
          <dl className='grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1.5'>
            <dt className='text-background/70'>{t('Catalog default name')}</dt>
            <dd className='break-words'>{props.catalogDefaultName}</dd>
            {!props.modelKeyShown && (
              <>
                <dt className='text-background/70'>{t('Model key')}</dt>
                <dd className='font-mono break-all'>{props.modelKey}</dd>
              </>
            )}
            {upstreamModelIds.length > 0 && (
              <>
                <dt className='text-background/70'>{t('Upstream model ID')}</dt>
                <dd className='space-y-1 font-mono break-all'>
                  {upstreamModelIds.map((upstreamModelId) => (
                    <div key={upstreamModelId}>{upstreamModelId}</div>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

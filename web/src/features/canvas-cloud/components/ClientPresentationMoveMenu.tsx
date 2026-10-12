/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import type { MoveTarget } from '../lib/client-presentation-draft'

/** "Move to…" for the checked models: top, bottom, or a position in the generation type order. */
export function ClientPresentationMoveMenu(props: {
  count: number
  total: number
  onMove: (target: MoveTarget) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState('')
  // The first moved model can land at most where all of them still fit, so the entered position is
  // always where it ends up.
  const lastPosition = Math.max(1, props.total - props.count + 1)
  const value = Number(position)
  const valid = Number.isInteger(value) && value >= 1 && value <= lastPosition

  function move(target: MoveTarget) {
    props.onMove(target)
    setOpen(false)
    setPosition('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={!props.count}
            title={props.count ? undefined : t('Select models first')}
            className={cn(open && 'border-primary')}
          />
        }
      >
        {t('Move to…')}
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-auto max-w-[min(460px,calc(100vw-32px))] gap-2'
      >
        <span className='text-muted-foreground text-xs'>
          {t(
            'Move the {{count}} selected models together; they keep their order',
            { count: props.count }
          )}
        </span>
        <div className='flex flex-wrap items-center gap-1.5'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => move('top')}
          >
            {t('Move to top')}
          </Button>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => move('bottom')}
          >
            {t('Move to bottom')}
          </Button>
        </div>
        <form
          className='flex flex-wrap items-center gap-1.5'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) move(value)
          }}
        >
          <Input
            type='number'
            inputMode='numeric'
            min={1}
            max={lastPosition}
            className='h-7 w-20'
            value={position}
            placeholder={t('Position')}
            aria-label={t('Target position (1 to {{count}})', {
              count: lastPosition,
            })}
            onChange={(event) => setPosition(event.target.value)}
          />
          <Button type='submit' size='sm' disabled={!valid}>
            {t('Move')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

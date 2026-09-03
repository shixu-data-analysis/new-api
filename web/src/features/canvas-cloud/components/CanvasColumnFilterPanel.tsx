/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { ListFilter } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function CanvasColumnFilterPanel({
  activeCount,
  children,
  onClear,
}: {
  activeCount: number
  children: ReactNode
  onClear?: () => void
}) {
  const { t } = useTranslation()

  const panel = (
    <Popover>
      <PopoverTrigger render={<Button type='button' variant='outline' />}>
        <ListFilter />
        {t('Column filters')}
        {activeCount > 0 && (
          <span className='bg-primary text-primary-foreground rounded-full px-1.5 text-xs tabular-nums'>
            {activeCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align='start'
        sideOffset={8}
        className='max-h-[60vh] w-[min(64rem,calc(100vw-2rem))] overflow-y-auto p-3'
      >
        <div className='grid auto-rows-min items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 [&_[data-slot=select-trigger]]:h-8 [&_[data-slot=select-trigger]]:w-full [&_input]:h-8 [&_input]:w-full'>
          {children}
        </div>
      </PopoverContent>
    </Popover>
  )

  if (!onClear) return panel
  return (
    <div className='flex items-center gap-2'>
      {panel}
      {activeCount > 0 ? (
        <Button type='button' variant='ghost' onClick={onClear}>
          {t('Clear filters')}
        </Button>
      ) : null}
    </div>
  )
}

export function CanvasColumnFilterField({
  label,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-rows-[1.25rem_auto] items-start gap-1',
        className
      )}
    >
      <Label
        htmlFor={htmlFor}
        className='truncate text-sm leading-5 font-medium'
        title={typeof label === 'string' ? label : undefined}
      >
        {label}
      </Label>
      <div className='min-w-0'>{children}</div>
    </div>
  )
}

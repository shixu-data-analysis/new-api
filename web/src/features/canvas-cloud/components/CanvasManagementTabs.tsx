/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { ComponentProps } from 'react'

import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const managementTabsListClassName =
  'h-10 w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden p-1'
const managementTabsTriggerClassName = 'h-8 min-h-8 flex-none px-3'

export function CanvasManagementTabsList(
  props: ComponentProps<typeof TabsList>
) {
  return (
    <TabsList
      {...props}
      className={cn(managementTabsListClassName, props.className)}
    />
  )
}

export function CanvasManagementTabsTrigger(
  props: ComponentProps<typeof TabsTrigger>
) {
  return (
    <TabsTrigger
      {...props}
      className={cn(managementTabsTriggerClassName, props.className)}
    />
  )
}

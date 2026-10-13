/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { AdminTaskRecordDetails } from './AdminTaskRecordDetails'

export function TaskRecordDetailsSheet(props: {
  taskId?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet
      open={Boolean(props.taskId)}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <SheetContent
        className={sideDrawerContentClassName('max-w-none sm:!max-w-[1200px]')}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>{t('Task details')}</SheetTitle>
        </SheetHeader>
        <div className={sideDrawerFormClassName()}>
          {props.taskId ? (
            <AdminTaskRecordDetails key={props.taskId} taskId={props.taskId} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

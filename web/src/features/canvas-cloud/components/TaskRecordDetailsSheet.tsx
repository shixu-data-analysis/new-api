/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

import { AdminTaskRecordDetails } from './AdminTaskRecordDetails'
import { CopyableText } from './CopyableText'

export function TaskRecordDetailsSheet(props: {
  taskId?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const drawerScroll = useRef<HTMLDivElement | null>(null)
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>()
  useEffect(() => setSelectedLedgerId(undefined), [props.taskId])
  return (
    <Sheet
      open={Boolean(props.taskId)}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <SheetContent
        className={sideDrawerContentClassName('max-w-none sm:!max-w-[720px]')}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>
            {selectedLedgerId
              ? t('Point ledger details')
              : `${t('Task details')} ${props.taskId ? `· ${props.taskId}` : ''}`}
          </SheetTitle>
          {props.taskId && !selectedLedgerId ? (
            <CopyableText value={props.taskId} hideValue />
          ) : null}
        </SheetHeader>
        <div ref={drawerScroll} className={sideDrawerFormClassName()}>
          {props.taskId ? (
            <AdminTaskRecordDetails
              key={props.taskId}
              taskId={props.taskId}
              scrollContainerRef={drawerScroll}
              onLedgerDetailsChange={setSelectedLedgerId}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import {
  SideDrawerSection,
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import {
  auditActionLabelKey,
  auditActorText,
  auditDetailRows,
  auditObjectIdLabel,
  auditObjectText,
  auditReasonRow,
  type AuditDetailRow,
  type AuditEvent,
} from '../audit-log-format'
import { formatCanvasDateTime } from '../formatters'
import type { CanvasAuditResolvedNames } from '../types'
import { CopyableText } from './CopyableText'
import { PreflightDiagnosticDetails } from './PreflightDiagnosticDetails'

function DetailValue(props: { label: string; children: ReactNode }) {
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground text-sm'>{props.label}</dt>
      <dd className='mt-1 min-h-5 text-sm [overflow-wrap:anywhere] break-words whitespace-pre-line'>
        {props.children}
      </dd>
    </div>
  )
}

function DetailRows(props: { rows: AuditDetailRow[] }) {
  return (
    <dl className='grid gap-x-6 gap-y-4 sm:grid-cols-2'>
      {props.rows.map((row) =>
        row.diagnostic ? (
          <div key={row.label} className='min-w-0 sm:col-span-2'>
            <dt className='text-muted-foreground mb-2 text-sm'>{row.label}</dt>
            <dd>
              <PreflightDiagnosticDetails diagnostic={row.diagnostic} />
            </dd>
          </div>
        ) : (
          <DetailValue key={row.label} label={row.label}>
            {row.copy ? (
              <CopyableText
                value={row.value}
                copyLabel={row.label}
                noTruncate
              />
            ) : (
              row.value
            )}
          </DetailValue>
        )
      )}
    </dl>
  )
}

export function AuditEventDetailsSheet(props: {
  event?: AuditEvent
  names?: CanvasAuditResolvedNames
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { event, names } = props
  const labelKey = event ? auditActionLabelKey(event.action) : null
  const basic: AuditDetailRow[] = []
  let details: AuditDetailRow[] = []
  if (event && names) {
    basic.push(
      { label: t('Actor'), value: auditActorText(event, t) },
      { label: t('Operation object'), value: auditObjectText(event, names, t) },
      { label: t('Outcome'), value: t(event.outcome) }
    )
    const reason = auditReasonRow(event, t)
    if (reason) basic.push(reason)
    const idLabel = auditObjectIdLabel(event.action)
    if (idLabel && event.resourceId) {
      basic.push({ label: t(idLabel), value: event.resourceId, copy: true })
    }
    details = auditDetailRows(event, names, t, i18n.language)
  }
  return (
    <Sheet
      open={Boolean(event)}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <SheetContent
        className={sideDrawerContentClassName('max-w-none sm:!max-w-[720px]')}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle className={labelKey ? undefined : 'font-mono'}>
            {labelKey ? t(labelKey) : event?.action}
          </SheetTitle>
          <SheetDescription className='tabular-nums'>
            {event ? formatCanvasDateTime(event.occurredAt) : null}
          </SheetDescription>
        </SheetHeader>
        <div className={sideDrawerFormClassName()}>
          <SideDrawerSection>
            <h3 className='text-sm font-semibold'>{t('Basic information')}</h3>
            <DetailRows rows={basic} />
          </SideDrawerSection>
          {details.length > 0 ? (
            <SideDrawerSection>
              <h3 className='text-sm font-semibold'>{t('Details')}</h3>
              <DetailRows rows={details} />
            </SideDrawerSection>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

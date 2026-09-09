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
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

export interface ConfirmationDetail {
  label: string
  value: string
}

export interface PricingComparisonRow {
  scope: string
  scopeId?: string
  priceGroupId?: string
  priceGroup?: string
  field: string
  before: React.ReactNode
  after: React.ReactNode
}

export function PricingActionConfirmation(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  details: ConfirmationDetail[]
  comparisonRows?: PricingComparisonRow[]
  confirmLabel: string
  destructive?: boolean
  confirmDisabled?: boolean
  pending: boolean
  onConfirm: () => void
  children?: React.ReactNode
}) {
  const { t } = useTranslation()
  const scopes = new Map<
    string,
    {
      label: string
      groups: Map<string, { label?: string; rows: PricingComparisonRow[] }>
    }
  >()
  for (const row of props.comparisonRows ?? []) {
    const scopeId = row.scopeId ?? row.scope
    const scope = scopes.get(scopeId) ?? { label: row.scope, groups: new Map() }
    const groupId = row.priceGroupId ?? row.priceGroup ?? ''
    const group = scope.groups.get(groupId) ?? {
      label: row.priceGroup,
      rows: [],
    }
    group.rows.push(row)
    scope.groups.set(groupId, group)
    scopes.set(scopeId, scope)
  }
  const hasComparisons = scopes.size > 0

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] flex-col w-[calc(100vw-1.5rem)] data-[size=default]:max-w-[calc(100vw-1.5rem)]',
          hasComparisons
            ? 'sm:max-w-4xl data-[size=default]:sm:max-w-4xl'
            : 'sm:max-w-lg data-[size=default]:sm:max-w-lg'
        )}
      >
        <AlertDialogHeader className='shrink-0'>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto text-sm'>
          <dl className='space-y-1'>
            {props.details.map((detail) => (
              <div
                key={`${detail.label}:${detail.value}`}
                className='flex flex-wrap gap-x-2 gap-y-0.5'
              >
                <dt className='text-muted-foreground'>{detail.label}:</dt>
                <dd className='min-w-0 [overflow-wrap:anywhere]'>
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
          {[...scopes].map(([scopeId, scope]) => (
            <section
              key={scopeId}
              className='min-w-0 space-y-3'
              aria-label={scope.label}
            >
              <h3 className='font-medium [overflow-wrap:anywhere]'>
                {scope.label}
              </h3>
              {[...scope.groups].map(([groupId, group]) => (
                <div key={groupId} className='min-w-0 space-y-2'>
                  {group.label && (
                    <h4 className='font-medium [overflow-wrap:anywhere]'>
                      {t('Price plan')}: {group.label}
                    </h4>
                  )}
                  <div
                    role='table'
                    aria-label={group.label ?? scope.label}
                    className='min-w-0 rounded-lg border'
                  >
                    <div role='rowgroup' className='sr-only sm:not-sr-only'>
                      <div
                        role='row'
                        className='bg-muted/30 text-muted-foreground grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.25fr)] border-b'
                      >
                        {[t('Changed field'), t('Before'), t('After')].map(
                          (label) => (
                            <div
                              key={label}
                              role='columnheader'
                              className='px-3 py-2 font-medium'
                            >
                              {label}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                    <div role='rowgroup'>
                      {group.rows.map((row) => (
                        <div
                          key={row.field}
                          role='row'
                          className='grid min-w-0 border-b last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1.25fr)]'
                        >
                          <div
                            role='rowheader'
                            className='min-w-0 px-3 py-2 font-medium [overflow-wrap:anywhere]'
                          >
                            {row.field}
                          </div>
                          <div
                            role='cell'
                            className='min-w-0 px-3 py-2 [overflow-wrap:anywhere]'
                          >
                            <div
                              aria-hidden='true'
                              className='text-muted-foreground mb-1 sm:hidden'
                            >
                              {t('Before')}
                            </div>
                            {row.before}
                          </div>
                          <div
                            role='cell'
                            className='min-w-0 px-3 py-2 [overflow-wrap:anywhere]'
                          >
                            <div
                              aria-hidden='true'
                              className='text-muted-foreground mb-1 sm:hidden'
                            >
                              {t('After')}
                            </div>
                            {row.after}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </section>
          ))}
          {props.children}
        </div>
        <AlertDialogFooter className='shrink-0'>
          <AlertDialogCancel disabled={props.pending}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={props.destructive ? 'destructive' : 'default'}
            disabled={props.pending || props.confirmDisabled}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

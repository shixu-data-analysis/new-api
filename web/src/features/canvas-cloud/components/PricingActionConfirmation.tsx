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

export interface ConfirmationDetail {
  label: string
  value: string
}

export function PricingActionConfirmation(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  details: ConfirmationDetail[]
  confirmLabel: string
  pending: boolean
  onConfirm: () => void
}) {
  const { t } = useTranslation()

  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent className='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-lg'>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <dl className='bg-muted/30 grid gap-3 rounded-lg border p-3 sm:grid-cols-2'>
          {props.details.map((detail) => (
            <div key={detail.label} className='min-w-0'>
              <dt className='text-muted-foreground text-xs font-medium'>
                {detail.label}
              </dt>
              <dd className='mt-1 text-sm font-medium break-words'>
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={props.pending}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction disabled={props.pending} onClick={props.onConfirm}>
            {props.confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

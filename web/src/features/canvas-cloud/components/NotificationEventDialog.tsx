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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

import {
  NOTIFICATION_ADDRESS_TYPE_LABELS,
  notificationEventName,
} from '../notification-labels'
import type { CanvasNotificationSettings } from '../types'
import { CanvasFormDialog } from './CanvasFormDialog'

/** 发送到: the addresses one event goes to; several may be chosen and each is sent to on its own. */
export function NotificationEventDialog(props: {
  settings: CanvasNotificationSettings
  eventId: string
  saving: boolean
  error: string | null
  onSave: (addressIds: string[]) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const initial = props.settings.events[props.eventId]?.addressIds ?? []
  const [chosen, setChosen] = useState<string[]>(initial)
  const title = t('{{event}} · Send to', {
    event: notificationEventName(props.eventId, t),
  })

  return (
    <CanvasFormDialog
      title={title}
      onRequestClose={() => (props.saving ? undefined : props.onClose())}
      onSubmit={() => props.onSave(chosen)}
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            disabled={props.saving}
            onClick={props.onClose}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' disabled={props.saving}>
            {props.saving ? t('Saving...') : t('Save')}
          </Button>
        </>
      }
    >
      <fieldset className='min-h-0 flex-1 space-y-1 overflow-y-auto px-6 py-4'>
        <legend className='sr-only'>{title}</legend>
        {props.settings.addresses.length ? (
          props.settings.addresses.map((address) => (
            <label
              key={address.id}
              className='hover:bg-muted flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2'
            >
              <Checkbox
                checked={chosen.includes(address.id)}
                onCheckedChange={(checked) =>
                  setChosen((current) =>
                    checked
                      ? [...current, address.id]
                      : current.filter((id) => id !== address.id)
                  )
                }
              />
              <span className='text-sm font-medium'>{address.name}</span>
              <span className='text-muted-foreground text-sm'>
                {t(
                  NOTIFICATION_ADDRESS_TYPE_LABELS[address.type] ?? address.type
                )}
              </span>
              <span className='text-muted-foreground min-w-0 truncate text-sm'>
                {address.hint}
              </span>
            </label>
          ))
        ) : (
          <p className='text-muted-foreground text-sm'>
            {t('No addresses yet. Add one in Notification addresses first.')}
          </p>
        )}
        <p className='text-muted-foreground pt-2 text-xs'>
          {t('Choose any number; each address is sent to on its own.')}
        </p>
        {props.error ? (
          <p role='alert' className='text-destructive text-sm'>
            {props.error}
          </p>
        ) : null}
      </fieldset>
    </CanvasFormDialog>
  )
}

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
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import {
  getCanvasAdminNotificationSettings,
  notificationQueryKeys,
} from '../api'
import { NOTIFICATION_ADDRESS_TYPE_LABELS } from '../notification-labels'

/**
 * Where one event goes, read from 运行管理 › 通知 and changed only there (NOTIFICATIONS-001). The settings dialogs of the
 * features that raise the event show it in place of their own addresses.
 */
export function NotificationSendTo(props: {
  eventId: string
  label: string
  help?: string
  /** Asked before leaving for the notification settings; false keeps the dialog open, e.g. to confirm discarding. */
  onBeforeLeave?: () => boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: notificationQueryKeys.settings,
    queryFn: ({ signal }) => getCanvasAdminNotificationSettings(signal),
  })
  const event = query.data?.events[props.eventId]
  const chosen = (event?.addressIds ?? [])
    .map((id) => query.data?.addresses.find((address) => address.id === id))
    .filter((address) => address !== undefined)

  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{props.label}</p>
      <div className='flex flex-wrap items-center gap-2'>
        {query.isError ? (
          <span className='text-destructive text-sm'>
            {t('The notification settings failed to load')}
          </span>
        ) : null}
        {event && !event.enabled ? (
          <Badge variant='secondary'>{t('Off')}</Badge>
        ) : null}
        {chosen.map((address) => (
          <Badge key={address.id} variant='outline'>
            {t('{{name}} ({{type}})', {
              name: address.name,
              type: t(
                NOTIFICATION_ADDRESS_TYPE_LABELS[address.type] ?? address.type
              ),
            })}
          </Badge>
        ))}
        {query.data && !chosen.length ? (
          <span className='text-muted-foreground text-sm'>
            {t('None chosen')}
          </span>
        ) : null}
        <Button
          type='button'
          variant='link'
          className='ms-auto h-auto p-0'
          onClick={() => {
            if (props.onBeforeLeave && !props.onBeforeLeave()) return
            void navigate({
              to: '/canvas-cloud/$section',
              params: { section: 'runtime' },
              search: { view: 'notifications' },
            })
          }}
        >
          {t('Change in Notifications')}
        </Button>
      </div>
      {props.help ? (
        <p className='text-muted-foreground text-xs'>{props.help}</p>
      ) : null}
    </div>
  )
}

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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { toIntlLocale } from '@/i18n/languages'
import { getServerErrorCode } from '@/lib/server-error-message'

import {
  getCanvasAdminNotificationSettings,
  notificationQueryKeys,
  setCanvasAdminNotificationSettings,
  testCanvasAdminNotificationAddress,
} from '../api'
import {
  NOTIFICATION_ADDRESS_TYPE_LABELS,
  notificationCategoryName,
  notificationEventName,
  notificationEventWhen,
  notificationFailure,
} from '../notification-labels'
import {
  eventsOfAddress,
  notificationSettingsInput,
  type NotificationChange,
} from '../notification-settings-input'
import type {
  CanvasNotificationAddress,
  CanvasNotificationSettings,
} from '../types'
import { canvasStaticColumnWidth } from './canvas-table-layout'
import { NotificationAddressDialog } from './NotificationAddressDialog'

// A dialog keeps the settings it opened on: it shows them and saves its draft against them, so a change saved meanwhile by
// someone else answers NOTIFICATION_SETTINGS_CONFLICT instead of being overwritten by a refetch the draft never saw.
type OpenDialog =
  | ({ base: CanvasNotificationSettings } & (
      | { kind: 'address'; editing: CanvasNotificationAddress | null }
      | { kind: 'delete'; address: CanvasNotificationAddress }
    ))
  | null

const fieldOf = (error: unknown): string | undefined =>
  (error as { response?: { data?: { details?: { field?: string } } } }).response
    ?.data?.details?.field

// The page's language codes (zhCN, zhTW) are not Intl tags, so they go through toIntlLocale.
const dateTime = (value: string, language: string) =>
  new Intl.DateTimeFormat(toIntlLocale(language), {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))

/** 运行管理 › 通知 (NOTIFICATIONS-001): where operations notices go. Every change saves the whole settings at once. */
export function NotificationSettings() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: notificationQueryKeys.settings,
    queryFn: ({ signal }) => getCanvasAdminNotificationSettings(signal),
  })
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: notificationQueryKeys.settings })

  const save = useMutation({
    mutationFn: ({
      settings,
      change,
    }: {
      settings: CanvasNotificationSettings
      change: NotificationChange
    }) =>
      setCanvasAdminNotificationSettings(
        notificationSettingsInput(settings, change)
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(notificationQueryKeys.settings, result)
      setDialog(null)
      setErrors({})
      toast.success(t('Settings saved'))
    },
    onError: (error) => {
      const code = getServerErrorCode(error)
      if (code === 'NOTIFICATION_SETTINGS_CONFLICT') {
        setDialog(null)
        void refresh()
        toast.error(
          t(
            'The notification settings changed meanwhile. They were reloaded; make your change again.'
          )
        )
        return
      }
      const rejected = code === 'NOTIFICATION_ADDRESS_REJECTED'
      const message = rejected
        ? t(
            'This address is not allowed. Use an HTTPS address on the public internet.'
          )
        : t('Unable to save the notification settings. Please try again.')
      // Only the address dialog shows an error in place; a switch or a deletion has nowhere to, so it toasts.
      if (dialog?.kind === 'address') {
        const field = rejected ? fieldOf(error) : undefined
        setErrors({ [field ?? 'form']: message })
        return
      }
      toast.error(message)
    },
  })
  const test = useMutation({
    mutationFn: (addressId: string) =>
      testCanvasAdminNotificationAddress(addressId, crypto.randomUUID()),
    onSuccess: (result) => {
      void refresh()
      if (result.ok) toast.success(t('Test message sent'))
      else toast.error(notificationFailure(result.reason ?? '', t))
    },
    onError: (error) =>
      toast.error(
        getServerErrorCode(error) === 'NOTIFICATION_ADDRESS_UNAVAILABLE'
          ? t('This kind of address cannot be sent from this environment')
          : t('Unable to send the test message. Please try again.')
      ),
  })

  if (query.isError) {
    return (
      <div className='space-y-3 py-10 text-center'>
        <p className='font-medium'>
          {t('The notification settings failed to load')}
        </p>
        <Button variant='outline' onClick={() => void query.refetch()}>
          {t('Retry')}
        </Button>
      </div>
    )
  }
  const settings = query.data
  if (!settings) {
    return <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>
  }
  // A switch has no draft, so it saves against the settings shown; a dialog saves against the ones it opened on.
  const change = (next: NotificationChange) =>
    save.mutate({ settings, change: next })
  const saveDialog = (
    base: CanvasNotificationSettings,
    next: NotificationChange
  ) => save.mutate({ settings: base, change: next })
  const nameOf = (id: string) =>
    settings.addresses.find((address) => address.id === id)

  const addressColumns: StaticDataTableColumn<CanvasNotificationAddress>[] = [
    {
      id: 'name',
      header: t('Name'),
      className: canvasStaticColumnWidth.wide,
      cell: (address) => <span className='font-medium'>{address.name}</span>,
    },
    {
      id: 'type',
      header: t('Type'),
      className: canvasStaticColumnWidth.compact,
      cell: (address) =>
        t(NOTIFICATION_ADDRESS_TYPE_LABELS[address.type] ?? address.type),
    },
    {
      id: 'address',
      header: t('Address'),
      className: canvasStaticColumnWidth.detail,
      cell: (address) => <span className='break-all'>{address.hint}</span>,
    },
    {
      id: 'used',
      header: t('Used for'),
      className: canvasStaticColumnWidth.compact,
      cell: (address) => {
        const count = eventsOfAddress(settings, address.id).length
        if (!count) {
          return <span className='text-muted-foreground'>{t('Not used')}</span>
        }
        return count === 1 ? t('1 event') : t('{{count}} events', { count })
      },
    },
    {
      id: 'delivered',
      header: t('Last sent'),
      className: canvasStaticColumnWidth.wide,
      cell: (address) => {
        const last = settings.lastDeliveries[address.id]
        if (!last) {
          return (
            <span className='text-muted-foreground'>{t('Not sent yet')}</span>
          )
        }
        if (last.ok) {
          return t('{{time}} · Delivered', {
            time: dateTime(last.at, i18n.language),
          })
        }
        return (
          <div className='space-y-0.5 whitespace-normal'>
            <p className='text-destructive'>
              {t('{{time}} · Failed', {
                time: dateTime(last.at, i18n.language),
              })}
            </p>
            <p className='text-muted-foreground text-xs'>
              {notificationFailure(last.reason ?? '', t)}
            </p>
          </div>
        )
      },
    },
    {
      id: 'actions',
      header: t('Actions'),
      className: canvasStaticColumnWidth.detail,
      cell: (address) => (
        <div className='flex flex-wrap items-center gap-3'>
          <Button
            variant='link'
            className='h-auto p-0'
            disabled={test.isPending}
            onClick={() => test.mutate(address.id)}
          >
            {t('Send test')}
          </Button>
          <Button
            variant='link'
            className='h-auto p-0'
            onClick={() => {
              setErrors({})
              setDialog({ kind: 'address', editing: address, base: settings })
            }}
          >
            {t('Edit')}
          </Button>
          <Button
            variant='link'
            className='text-destructive h-auto p-0'
            onClick={() =>
              setDialog({ kind: 'delete', address, base: settings })
            }
          >
            {t('Delete')}
          </Button>
        </div>
      ),
    },
  ]
  const events = Object.entries(settings.events).map(([id, event]) => ({
    id,
    ...event,
  }))
  const eventColumns: StaticDataTableColumn<(typeof events)[number]>[] = [
    {
      id: 'event',
      header: t('Event'),
      className: canvasStaticColumnWidth.wide,
      cell: (event) => (
        <div className='whitespace-normal'>
          <p className='font-medium'>{notificationEventName(event.id, t)}</p>
          <p className='text-muted-foreground text-xs'>
            {notificationCategoryName(event.category, t)}
          </p>
        </div>
      ),
    },
    {
      id: 'when',
      header: t('When it is sent'),
      className: canvasStaticColumnWidth.detail,
      cellClassName: 'whitespace-normal text-muted-foreground',
      cell: (event) => notificationEventWhen(event.id, t),
    },
    {
      id: 'send-to',
      header: t('Send to'),
      className: canvasStaticColumnWidth.detail,
      cell: (event) => (
        <div className='space-y-1 whitespace-normal'>
          <div className='flex flex-wrap items-center gap-2'>
            {event.addressIds
              .map((id) => nameOf(id))
              .filter((address) => address !== undefined)
              .map((address) => (
                <Badge key={address.id} variant='outline'>
                  {t('{{name}} ({{type}})', {
                    name: address.name,
                    type: t(NOTIFICATION_ADDRESS_TYPE_LABELS[address.type]),
                  })}
                </Badge>
              ))}
            {event.addressIds.length ? null : (
              <span className='text-muted-foreground'>{t('None chosen')}</span>
            )}
          </div>
          {event.enabled && !event.addressIds.length ? (
            <p className='text-destructive text-xs'>
              {t('No address is chosen, so nothing is sent')}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'status',
      header: t('Enabled'),
      className: canvasStaticColumnWidth.compact,
      cell: (event) => (
        <Switch
          checked={event.enabled}
          disabled={save.isPending}
          aria-label={t('Send {{event}}', {
            event: notificationEventName(event.id, t),
          })}
          onCheckedChange={(enabled) =>
            change({ kind: 'toggle', eventId: event.id, enabled })
          }
        />
      ),
    },
  ]

  const deletedUses =
    dialog?.kind === 'delete'
      ? eventsOfAddress(dialog.base, dialog.address.id).length
      : 0
  const deleteImpact = deletedUses
    ? t(
        'Events that send here: {{count}}. After deleting, they no longer do.',
        { count: deletedUses }
      )
    : t('No event sends here.')

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Notification addresses')}</CardTitle>
          <CardDescription>
            {t(
              'Group bot Webhooks or administrator emails. A group may have several bots.'
            )}
          </CardDescription>
          <CardAction>
            <Button
              onClick={() => {
                setErrors({})
                setDialog({ kind: 'address', editing: null, base: settings })
              }}
            >
              {t('New address')}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {/* Bounded: Cloud keeps at most 50 addresses, so the table is not paged. */}
          <StaticDataTable
            columns={addressColumns}
            data={settings.addresses}
            getRowKey={(address) => address.id}
            emptyContent={t(
              'No addresses yet. Add a group bot or an email, then choose where each event goes.'
            )}
            containerProps={{
              tabIndex: 0,
              role: 'region',
              'aria-label': t('Notification addresses'),
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('Notification events')}</CardTitle>
          <CardDescription>
            {t(
              'When each event happens and its thresholds are set in the settings of its own feature.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Bounded: one row per event Cloud registers. */}
          <StaticDataTable
            columns={eventColumns}
            data={events}
            getRowKey={(event) => event.id}
            containerProps={{
              tabIndex: 0,
              role: 'region',
              'aria-label': t('Notification events'),
            }}
          />
        </CardContent>
      </Card>

      {dialog?.kind === 'address' ? (
        <NotificationAddressDialog
          settings={dialog.base}
          editing={dialog.editing}
          saving={save.isPending}
          errors={errors}
          testing={test.isPending}
          onTest={(id) => test.mutate(id)}
          onSave={(next) => saveDialog(dialog.base, next)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <AlertDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(open) => (open ? undefined : setDialog(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog?.kind === 'delete'
                ? t('Delete the address “{{name}}”?', {
                    name: dialog.address.name,
                  })
                : null}
            </AlertDialogTitle>
            <AlertDialogDescription>{deleteImpact}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={save.isPending}>
              {t('Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              disabled={save.isPending}
              onClick={() =>
                dialog?.kind === 'delete' &&
                saveDialog(dialog.base, {
                  kind: 'delete',
                  addressId: dialog.address.id,
                })
              }
            >
              {t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

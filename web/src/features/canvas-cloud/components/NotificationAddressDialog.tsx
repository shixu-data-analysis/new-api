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
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import {
  NOTIFICATION_ADDRESS_TYPE_LABELS,
  notificationCategoryName,
  notificationEventName,
} from '../notification-labels'
import {
  eventsOfAddress,
  type NotificationAddressDraft,
  type NotificationChange,
} from '../notification-settings-input'
import type {
  CanvasNotificationAddress,
  CanvasNotificationAddressType,
  CanvasNotificationSettings,
} from '../types'

const ROWS_PER_SAVE = 10
const NAME_LENGTH = 20
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * Whether a row left empty keeps its saved Webhook or email: Cloud keeps a Webhook across bot kinds and an email as an
 * email, but a row turned from one to the other has nothing to keep.
 */
function keepsSaved(
  row: NotificationAddressDraft,
  saved: CanvasNotificationAddress | undefined
): boolean {
  return Boolean(saved) && (saved?.type === 'EMAIL') === (row.type === 'EMAIL')
}

/** Why a row cannot be saved, or null; a row that keeps its saved address may stay empty. */
function rowIssue(
  row: NotificationAddressDraft,
  keeps: boolean,
  t: Translate
): string | null {
  const value = row.value.trim()
  if (!value) return keeps ? null : t('Enter the address')
  if (row.type === 'EMAIL') {
    return EMAIL.test(value) ? null : t('Enter a valid email address')
  }
  return /^https:\/\/\S+$/i.test(value)
    ? null
    : t('Enter an address that starts with https://')
}

function nameIssueOf(name: string, t: Translate): string | null {
  const trimmed = name.trim()
  if (!trimmed) return t('Enter a name')
  if (trimmed.length > NAME_LENGTH) {
    return t('At most {{count}} characters', { count: NAME_LENGTH })
  }
  return null
}

/** The saved address's hint while the row keeps it; otherwise what an address of the kind looks like. */
function placeholderOf(
  row: NotificationAddressDraft,
  savedHint: string | null,
  t: Translate
): string {
  if (savedHint) return t('Saved: {{hint}}', { hint: savedHint })
  return row.type === 'EMAIL' ? 'name@example.com' : 'https://'
}

/**
 * 新增地址／编辑地址: one name for several rows, each a Webhook or an email, and the events they are used for. Each row is
 * saved as its own address. Editing starts from one address and may add more under the same name.
 */
export function NotificationAddressDialog(props: {
  settings: CanvasNotificationSettings
  editing: CanvasNotificationAddress | null
  saving: boolean
  /** Server refusals keyed by address id, or 'form' for the rest. */
  errors: Record<string, string>
  onSave: (change: NotificationChange) => void
  onTest: (addressId: string) => void
  testing: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const { settings, editing } = props
  const [name, setName] = useState(editing?.name ?? '')
  const [rows, setRows] = useState<NotificationAddressDraft[]>(() => [
    {
      id: editing?.id ?? crypto.randomUUID(),
      type: editing?.type ?? 'WECOM',
      value: '',
    },
  ])
  const [events, setEvents] = useState<string[]>(() =>
    editing ? eventsOfAddress(settings, editing.id) : []
  )
  const [tried, setTried] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const savedOf = (rowId: string) =>
    settings.addresses.find((address) => address.id === rowId)
  const nameIssue = nameIssueOf(name, t)
  const issues = rows.map((row) =>
    rowIssue(row, keepsSaved(row, savedOf(row.id)), t)
  )
  const invalid = Boolean(nameIssue) || issues.some(Boolean)
  const removed = editing && !rows.some((row) => row.id === editing.id)
  const dirty =
    name !== (editing?.name ?? '') ||
    rows.length !== 1 ||
    rows[0]?.type !== (editing?.type ?? 'WECOM') ||
    rows.some((row) => row.value.trim() !== '') ||
    Boolean(removed) ||
    events.join() !==
      (editing ? eventsOfAddress(settings, editing.id) : []).join()

  const close = () => {
    if (props.saving) return
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    props.onClose()
  }
  const updateRow = (index: number, row: Partial<NotificationAddressDraft>) =>
    setRows((current) =>
      current.map((entry, at) => (at === index ? { ...entry, ...row } : entry))
    )
  const submit = () => {
    setTried(true)
    if (invalid) return
    props.onSave({
      kind: 'addresses',
      name,
      rows,
      removed: removed && editing ? [editing.id] : [],
      events,
    })
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent className='flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg'>
        <DialogHeader className='px-6 pt-6 pb-3'>
          <DialogTitle>
            {editing ? t('Edit address') : t('New address')}
          </DialogTitle>
        </DialogHeader>
        <form
          className='flex min-h-0 flex-1 flex-col'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className='min-h-80 flex-1 space-y-5 overflow-y-auto px-6 py-4'>
            <div className='space-y-2'>
              <Label htmlFor={`${id}-name`}>{t('Name')}</Label>
              <Input
                id={`${id}-name`}
                value={name}
                maxLength={NAME_LENGTH}
                placeholder={t('For example: Operations group')}
                aria-invalid={tried && Boolean(nameIssue)}
                aria-describedby={
                  tried && nameIssue ? `${id}-name-error` : undefined
                }
                onChange={(event) => setName(event.target.value)}
              />
              {tried && nameIssue ? (
                <p
                  id={`${id}-name-error`}
                  role='alert'
                  className='text-destructive text-xs'
                >
                  {nameIssue}
                </p>
              ) : null}
            </div>

            <fieldset className='space-y-2'>
              <legend className='text-sm font-medium'>{t('Addresses')}</legend>
              {rows.map((row, index) => {
                const issue =
                  (tried ? issues[index] : null) ?? props.errors[row.id]
                const saved = savedOf(row.id)
                return (
                  <div key={row.id} className='space-y-1'>
                    <div className='grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2'>
                      <NativeSelect
                        aria-label={t('Type of address {{index}}', {
                          index: index + 1,
                        })}
                        value={row.type}
                        onChange={(event) =>
                          updateRow(index, {
                            type: event.target
                              .value as CanvasNotificationAddressType,
                          })
                        }
                      >
                        {settings.addressTypes.map((type) => (
                          <NativeSelectOption key={type} value={type}>
                            {t(NOTIFICATION_ADDRESS_TYPE_LABELS[type] ?? type)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <Input
                        type={row.type === 'EMAIL' ? 'email' : 'url'}
                        autoComplete='off'
                        aria-label={t('Address {{index}}', {
                          index: index + 1,
                        })}
                        aria-invalid={Boolean(issue)}
                        value={row.value}
                        placeholder={placeholderOf(
                          row,
                          saved && keepsSaved(row, saved) ? saved.hint : null,
                          t
                        )}
                        onChange={(event) =>
                          updateRow(index, { value: event.target.value })
                        }
                      />
                      <Button
                        type='button'
                        variant='link'
                        className='text-destructive h-auto p-0'
                        disabled={rows.length === 1}
                        onClick={() =>
                          setRows((current) =>
                            current.filter((_, at) => at !== index)
                          )
                        }
                      >
                        {t('Delete')}
                      </Button>
                    </div>
                    {issue ? (
                      <p role='alert' className='text-destructive text-xs'>
                        {issue}
                      </p>
                    ) : null}
                  </div>
                )
              })}
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={rows.length >= ROWS_PER_SAVE}
                  onClick={() =>
                    setRows((current) => [
                      ...current,
                      {
                        id: crypto.randomUUID(),
                        type: current.at(-1)?.type ?? 'WECOM',
                        value: '',
                      },
                    ])
                  }
                >
                  {t('Add a row')}
                </Button>
                <span className='text-muted-foreground text-xs'>
                  {t(
                    'Webhooks take HTTPS addresses only. Each row is saved as its own address and sent to on its own. Leave a saved address empty to keep it.'
                  )}
                </span>
              </div>
            </fieldset>

            <fieldset className='space-y-1'>
              <legend className='mb-1 text-sm font-medium'>
                {t('Used for these events')}
              </legend>
              {Object.entries(settings.events).map(([eventId, event]) => (
                <label
                  key={eventId}
                  className='hover:bg-muted flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2'
                >
                  <Checkbox
                    checked={events.includes(eventId)}
                    onCheckedChange={(checked) =>
                      setEvents((current) =>
                        checked
                          ? [...current, eventId]
                          : current.filter((entry) => entry !== eventId)
                      )
                    }
                  />
                  <span className='text-sm font-medium'>
                    {notificationEventName(eventId, t)}
                  </span>
                  <span className='text-muted-foreground text-sm'>
                    {notificationCategoryName(event.category, t)}
                  </span>
                </label>
              ))}
            </fieldset>

            {editing ? (
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={props.testing || dirty}
                onClick={() => props.onTest(editing.id)}
              >
                {t('Send test message')}
              </Button>
            ) : null}
            {props.errors.form ? (
              <p role='alert' className='text-destructive text-sm'>
                {props.errors.form}
              </p>
            ) : null}
          </div>
          <DialogFooter className='items-center border-t px-6 py-4'>
            {confirmDiscard ? (
              <>
                <span className='text-muted-foreground me-auto text-sm'>
                  {t('Discard the unsaved changes?')}
                </span>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setConfirmDiscard(false)}
                >
                  {t('Keep editing')}
                </Button>
                <Button
                  type='button'
                  variant='destructive'
                  onClick={props.onClose}
                >
                  {t('Discard changes')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type='button'
                  variant='outline'
                  disabled={props.saving}
                  onClick={close}
                >
                  {t('Cancel')}
                </Button>
                <Button type='submit' disabled={props.saving}>
                  {props.saving ? t('Saving...') : t('Save')}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

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
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/datetime-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import {
  announcementQueryKeys,
  createCanvasAdminAnnouncement,
  getCanvasAnnouncementTags,
  updateCanvasAdminAnnouncement,
} from '../api'
import { formatCanvasDateTimeMinutes } from '../formatters'
import type { CanvasAdminAnnouncement } from '../types'
import { AnnouncementTagsDialog } from './AnnouncementTagsDialog'

const TITLE_LIMIT = 40
const BODY_LIMIT = 1000

function fieldOf(error: unknown): string | undefined {
  return (error as { response?: { data?: { details?: { field?: string } } } })
    .response?.data?.details?.field
}

export function AnnouncementEditorDialog(props: {
  /** Absent when publishing a new announcement. */
  announcement?: CanvasAdminAnnouncement
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const id = useId()
  const current = props.announcement
  // A published or offline announcement keeps its time; only a scheduled one can be moved or published now.
  const timeEditable = !current || current.status === 'SCHEDULED'
  const [title, setTitle] = useState(current?.title ?? '')
  const [body, setBody] = useState(current?.body ?? '')
  const [scheduled, setScheduled] = useState(current?.status === 'SCHEDULED')
  const [publishAt, setPublishAt] = useState<Date | undefined>(
    current?.status === 'SCHEDULED' ? new Date(current.publishedAt) : undefined
  )
  const [tagId, setTagId] = useState<string | null>(current?.tag?.id ?? null)
  const [autoPopup, setAutoPopup] = useState(current?.autoPopup ?? false)
  const [tried, setTried] = useState<Record<string, boolean>>({})
  const [serverField, setServerField] = useState<string>()
  const [tagsOpen, setTagsOpen] = useState(false)
  const attempt = useRef<{ body: string; key: string } | null>(null)
  const tags = useQuery({
    queryKey: announcementQueryKeys.tags,
    queryFn: getCanvasAnnouncementTags,
  })

  const titleError = title.trim() ? undefined : 'Enter a title.'
  let timeError: string | undefined
  if (timeEditable && scheduled && !publishAt) timeError = 'Choose a time.'
  else if (
    timeEditable &&
    scheduled &&
    publishAt &&
    publishAt.getTime() <= Date.now()
  ) {
    timeError = 'Choose a time in the future.'
  }
  const save = useMutation({
    mutationFn: () => {
      const input = {
        title: title.trim(),
        body: body.trim(),
        tagId,
        autoPopup,
        ...(timeEditable
          ? {
              publishAt:
                scheduled && publishAt ? publishAt.toISOString() : null,
            }
          : {}),
      }
      if (current) return updateCanvasAdminAnnouncement(current.id, input)
      const created = { ...input, publishAt: input.publishAt ?? null }
      const serialized = JSON.stringify(created)
      // A retry of the same content reuses its idempotency key, so a publish whose response was lost is not repeated.
      if (attempt.current?.body !== serialized) {
        attempt.current = {
          body: serialized,
          key: `web-announcement-${crypto.randomUUID()}`,
        }
      }
      return createCanvasAdminAnnouncement({
        input: created,
        idempotencyKey: attempt.current.key,
      })
    },
    onSuccess: async (result) => {
      let message = 'Announcement saved'
      if (!current) {
        message =
          result.status === 'SCHEDULED'
            ? 'Announcement scheduled'
            : 'Announcement published'
      }
      toast.success(t(message))
      await queryClient.invalidateQueries({
        queryKey: announcementQueryKeys.all,
      })
      props.onClose()
    },
    onError: (error) => {
      const field = fieldOf(error)
      if (field) {
        setServerField(field)
        return
      }
      toast.error(t('Unable to save the announcement. Please try again.'))
    },
  })
  const showTitleError = (tried.title && titleError) || serverField === 'title'
  const showTimeError =
    (tried.publishAt && timeError) || serverField === 'publishAt'
  const pickTag = (value: string | null) => {
    setTagId(value)
    setServerField(undefined)
    // A tag fills in its default; the switch can still be changed before publishing.
    setAutoPopup(
      Boolean(
        tags.data?.items.find((tag) => tag.id === value)?.defaultAutoPopup
      )
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(open) =>
        !open && !save.isPending ? props.onClose() : undefined
      }
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {t(current ? 'Edit announcement' : 'Publish announcement')}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t('Customers see it under Announcements on the Desktop tab bar.')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            setTried({ title: true, publishAt: true })
            setServerField(undefined)
            if (titleError || timeError) return
            save.mutate()
          }}
        >
          <div className='space-y-1'>
            <Label htmlFor={`${id}-title`}>{t('Title')}</Label>
            <Input
              id={`${id}-title`}
              value={title}
              maxLength={TITLE_LIMIT}
              aria-required='true'
              aria-invalid={Boolean(showTitleError)}
              aria-describedby={`${id}-title-help${showTitleError ? ` ${id}-title-error` : ''}`}
              onBlur={() => setTried((value) => ({ ...value, title: true }))}
              onChange={(event) => setTitle(event.target.value)}
            />
            <p
              id={`${id}-title-help`}
              className='text-muted-foreground text-xs'
            >
              {t('Up to 40 characters. Customers see this line first.')}
            </p>
            {showTitleError ? (
              <p
                id={`${id}-title-error`}
                role='alert'
                className='text-destructive text-xs'
              >
                {t(titleError ?? 'Check the title.')}
              </p>
            ) : null}
          </div>
          <div className='space-y-1'>
            <Label htmlFor={`${id}-body`}>{t('Body (optional)')}</Label>
            <Textarea
              id={`${id}-body`}
              value={body}
              rows={5}
              maxLength={BODY_LIMIT}
              aria-invalid={serverField === 'body'}
              aria-describedby={`${id}-body-help`}
              onChange={(event) => setBody(event.target.value)}
            />
            <p id={`${id}-body-help`} className='text-muted-foreground text-xs'>
              {t('Up to 1000 characters. Line breaks are kept.')}
            </p>
          </div>
          <fieldset className='space-y-2'>
            <legend className='text-sm font-medium'>{t('Publish time')}</legend>
            {timeEditable || !current ? (
              <>
                <div className='flex flex-wrap gap-4'>
                  {[false, true].map((later) => (
                    <label
                      key={String(later)}
                      className='flex items-center gap-2 text-sm'
                    >
                      <input
                        type='radio'
                        name={`${id}-when`}
                        checked={scheduled === later}
                        onChange={() => setScheduled(later)}
                      />
                      {t(later ? 'Publish at a set time' : 'Publish now')}
                    </label>
                  ))}
                </div>
                {scheduled ? (
                  <DateTimePicker
                    className='w-full sm:w-80'
                    futureOnly
                    value={publishAt}
                    onChange={(value) => {
                      setPublishAt(value)
                      setTried((tried) => ({ ...tried, publishAt: true }))
                    }}
                  />
                ) : null}
                {showTimeError ? (
                  <p role='alert' className='text-destructive text-xs'>
                    {t(timeError ?? 'Choose a time in the future.')}
                  </p>
                ) : null}
              </>
            ) : (
              <p className='text-muted-foreground text-sm'>
                {t('Published at {{time}}', {
                  time: formatCanvasDateTimeMinutes(current.publishedAt),
                })}
              </p>
            )}
          </fieldset>
          <div className='space-y-2'>
            <div className='flex items-baseline justify-between gap-2'>
              <span id={`${id}-tag`} className='text-sm font-medium'>
                {t('Tag (optional)')}
              </span>
              <Button
                type='button'
                variant='link'
                size='sm'
                className='h-auto p-0'
                onClick={() => setTagsOpen(true)}
              >
                {t('Manage tags')}
              </Button>
            </div>
            <div
              role='radiogroup'
              aria-labelledby={`${id}-tag`}
              className='flex flex-wrap gap-1.5'
            >
              {[
                { id: null, name: t('No tag'), color: null },
                ...(tags.data?.items ?? []),
              ].map((tag) => (
                <button
                  key={tag.id ?? 'none'}
                  type='button'
                  role='radio'
                  aria-checked={tagId === tag.id}
                  data-model-color={tag.color ?? undefined}
                  className={cn(
                    'border-input hover:bg-muted inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm',
                    tagId === tag.id && 'border-primary ring-primary ring-1'
                  )}
                  onClick={() => pickTag(tag.id)}
                >
                  {tag.color ? (
                    <span
                      aria-hidden='true'
                      className='size-2 rounded-full bg-[var(--model-swatch)]'
                    />
                  ) : null}
                  {tag.name}
                </button>
              ))}
            </div>
            <p
              className={cn(
                'text-xs',
                serverField === 'tagId'
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              )}
              role={serverField === 'tagId' ? 'alert' : undefined}
            >
              {t(
                serverField === 'tagId'
                  ? 'This tag no longer exists. Choose another one.'
                  : 'Each announcement has at most one tag.'
              )}
            </p>
          </div>
          <div className='flex items-start justify-between gap-3 rounded-lg border p-3'>
            <div className='space-y-0.5'>
              <Label htmlFor={`${id}-popup`}>{t('Pop up once')}</Label>
              <p
                id={`${id}-popup-help`}
                className='text-muted-foreground text-xs'
              >
                {t(
                  'Pops up once the next time customers open the Desktop and not again after they see it; when off, only a dot shows on Announcements. A tag fills in its default, which you can change.'
                )}
              </p>
            </div>
            <Switch
              id={`${id}-popup`}
              checked={autoPopup}
              aria-describedby={`${id}-popup-help`}
              onCheckedChange={setAutoPopup}
            />
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={save.isPending}
              onClick={props.onClose}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={save.isPending}>
              {t(current ? 'Save' : 'Publish')}
            </Button>
          </DialogFooter>
        </form>
        {tagsOpen ? (
          <AnnouncementTagsDialog onClose={() => setTagsOpen(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

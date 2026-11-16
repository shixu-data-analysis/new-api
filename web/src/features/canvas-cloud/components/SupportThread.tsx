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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BellRing, ImagePlus, X } from 'lucide-react'
import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'
import { getServerErrorCode } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  issueCanvasAdminSupportAttachment,
  markCanvasAdminSupportHandled,
  replyCanvasAdminSupportConversation,
  supportQueryKeys,
  uploadCanvasSupportAttachment,
} from '../api'
import {
  attachmentDigests,
  compressSupportImage,
  SUPPORT_IMAGES_PER_SEND,
  SupportImageError,
} from '../lib/support-attachments'
import { startsTimeGroup, supportTimeLabel } from '../lib/support-labels'
import type {
  CanvasAdminSupportConversation,
  CanvasAdminSupportMessage,
  CanvasSupportQuickReplies,
} from '../types'
import { useSupportMessages } from '../use-support-messages'
import { CanvasTooltip } from './CanvasTooltip'
import { MessageContent } from './SupportMessageContent'
import { SupportQuickReplyMenu } from './SupportQuickReplyMenu'

const TEXT_MAX = 2000

function Bubble(props: {
  message: CanvasAdminSupportMessage
  /** The exact time, shown on hover; the time lines between groups carry it on screen. */
  time: string
}) {
  const { t } = useTranslation()
  const { message } = props
  if (message.sender === 'SYSTEM') {
    return (
      <CanvasTooltip content={props.time}>
        <div className='bg-muted/50 grid gap-1 rounded-xl border px-3 py-2.5'>
          <div className='flex items-center gap-1.5 text-sm font-semibold'>
            <BellRing className='size-3.5' aria-hidden='true' />
            {t('System notice')}
          </div>
          <p className='text-sm whitespace-pre-wrap'>{message.text}</p>
        </div>
      </CanvasTooltip>
    )
  }
  const mine = message.sender === 'ADMIN'
  return (
    <div
      className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}
    >
      <CanvasTooltip content={props.time}>
        <div>
          <MessageContent message={message} mine={mine} />
        </div>
      </CanvasTooltip>
      {mine ? (
        <span className='text-muted-foreground text-xs'>
          {message.adminName ?? t('Administrator')}
        </span>
      ) : null}
    </div>
  )
}

interface PendingImage {
  key: string
  file: File
  preview: string
}

export function SupportThread(props: {
  conversation: CanvasAdminSupportConversation
  quickReplies: CanvasSupportQuickReplies
  onOpenCustomer: (customerId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const inputId = useId()
  const { conversation } = props
  const name = conversation.customer.name ?? t('Customer')
  const thread = useSupportMessages(conversation.id)
  const [draft, setDraft] = useState('')
  // Kept between replies; off sends a reply that lights the client's dot without the preview card.
  const [popup, setPopup] = useState(true)
  const [images, setImages] = useState<PendingImage[]>([])
  const scroller = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const anchor = useRef<{ height: number; top: number } | null>(null)
  // Whether the reader is at the newest message; reading history is never pulled away by a new one.
  const pinned = useRef(true)
  const locale = toIntlLocale(i18n.language)
  const exactTime = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))

  // Earlier messages keep what was on screen in place; new ones scroll to the bottom for a reader already there.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    if (anchor.current) {
      element.scrollTop =
        element.scrollHeight - anchor.current.height + anchor.current.top
      anchor.current = null
      return
    }
    if (pinned.current) element.scrollTop = element.scrollHeight
  }, [thread.messages])
  useEffect(
    () => () => images.forEach((image) => URL.revokeObjectURL(image.preview)),
    [images]
  )

  const addImages = (files: File[]) => {
    const accepted = files.filter((file) => file.type.startsWith('image/'))
    const room = SUPPORT_IMAGES_PER_SEND - images.length
    if (accepted.length > room) {
      toast.error(
        t('Send at most {{count}} images at a time', {
          count: SUPPORT_IMAGES_PER_SEND,
        })
      )
    }
    setImages((previous) => [
      ...previous,
      ...accepted.slice(0, Math.max(0, room)).map((file) => ({
        key: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      })),
    ])
  }

  const send = useMutation({
    mutationFn: async () => {
      const attachmentIds: string[] = []
      for (const image of images) {
        const blob = await compressSupportImage(image.file)
        const issued = await issueCanvasAdminSupportAttachment({
          conversationId: conversation.id,
          input: {
            kind: 'IMAGE',
            mimeType: 'image/webp',
            sizeBytes: blob.size,
            ...(await attachmentDigests(blob)),
          },
          idempotencyKey: crypto.randomUUID(),
        })
        await uploadCanvasSupportAttachment(issued.upload, blob)
        attachmentIds.push(issued.attachmentId)
      }
      const text = draft.trim()
      return replyCanvasAdminSupportConversation({
        conversationId: conversation.id,
        input: {
          ...(text ? { text } : {}),
          ...(attachmentIds.length ? { attachmentIds } : {}),
          popup,
        },
        idempotencyKey: crypto.randomUUID(),
      })
    },
    onSuccess: (result) => {
      pinned.current = true
      thread.append(result.messages)
      setDraft('')
      setImages([])
      void queryClient.invalidateQueries({ queryKey: supportQueryKeys.all })
    },
    onError: (error) => {
      if (error instanceof SupportImageError) {
        toast.error(
          error.reason === 'TOO_LARGE'
            ? t('Each image must be at most 10 MB')
            : t('This file is not an image')
        )
        return
      }
      if (getServerErrorCode(error) === 'SUPPORT_STORAGE_UNAVAILABLE') {
        toast.error(
          t('Images cannot be sent now: attachment storage is unavailable')
        )
        return
      }
      toast.error(
        t('Unable to send the reply. Your text is kept; please try again.')
      )
    },
  })
  const handled = useMutation({
    mutationFn: () =>
      markCanvasAdminSupportHandled({
        conversationId: conversation.id,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: () => {
      toast.success(t('Marked as handled'))
      void queryClient.invalidateQueries({ queryKey: supportQueryKeys.all })
    },
    onError: () =>
      toast.error(t('Unable to mark as handled. Please try again.')),
  })
  const canSend =
    (draft.trim() !== '' || images.length > 0) &&
    draft.length <= TEXT_MAX &&
    !send.isPending

  return (
    <Card className='flex h-[min(46rem,calc(100dvh-14rem))] min-h-[28rem] flex-col gap-0 overflow-hidden py-0'>
      <header className='flex flex-wrap items-center gap-2 border-b px-4 py-3'>
        <h2 className='text-base font-semibold'>{name}</h2>
        <span className='text-muted-foreground font-mono text-xs'>
          ID {conversation.customer.userId}
        </span>
        {conversation.pending ? (
          <Badge
            variant='outline'
            className='border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          >
            {t('Awaiting reply')}
          </Badge>
        ) : null}
        <span className='ms-auto flex gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => props.onOpenCustomer(conversation.customer.id)}
          >
            {t('Customer details')}
          </Button>
          {conversation.pending ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={handled.isPending}
              onClick={() => handled.mutate()}
            >
              {t('Mark as handled')}
            </Button>
          ) : null}
        </span>
      </header>

      <div
        ref={scroller}
        className='flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4'
        onScroll={(event) => {
          const element = event.currentTarget
          pinned.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 80
        }}
        aria-live='polite'
      >
        {thread.state === 'loading' ? (
          <p className='text-muted-foreground text-sm' role='status'>
            {t('Loading…')}
          </p>
        ) : null}
        {thread.state === 'error' ? (
          <p className='text-destructive text-sm' role='alert'>
            {t('Unable to load the messages. Please try again.')}
          </p>
        ) : null}
        {thread.hasEarlier ? (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='self-center'
            disabled={thread.loadingEarlier}
            onClick={() => {
              const element = scroller.current
              if (element) {
                anchor.current = {
                  height: element.scrollHeight,
                  top: element.scrollTop,
                }
              }
              void thread.loadEarlier()
            }}
          >
            {t('Load earlier messages')}
          </Button>
        ) : null}
        {thread.state === 'ready' && thread.messages.length === 0 ? (
          <p className='text-muted-foreground text-sm'>{t('No messages')}</p>
        ) : null}
        {thread.messages.map((message, index) => (
          <Fragment key={message.seq}>
            {startsTimeGroup(thread.messages[index - 1], message) ? (
              <p className='text-muted-foreground self-center text-xs tabular-nums'>
                {supportTimeLabel(message.createdAt, locale, t)}
              </p>
            ) : null}
            <Bubble message={message} time={exactTime(message.createdAt)} />
          </Fragment>
        ))}
      </div>

      <form
        className='border-t px-4 py-3'
        onSubmit={(event) => {
          event.preventDefault()
          if (canSend) send.mutate()
        }}
      >
        <div className='focus-within:border-ring grid gap-2 rounded-xl border px-3 py-2'>
          {images.length ? (
            <ul
              className='flex flex-wrap gap-2'
              aria-label={t('Images to send')}
            >
              {images.map((image) => (
                <li
                  key={image.key}
                  className='relative size-14 overflow-hidden rounded-md border'
                >
                  <img
                    src={image.preview}
                    alt=''
                    className='size-full object-cover'
                  />
                  <button
                    type='button'
                    className='absolute end-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/60 text-white'
                    aria-label={t('Remove image')}
                    onClick={() =>
                      setImages((previous) =>
                        previous.filter((item) => item.key !== image.key)
                      )
                    }
                  >
                    <X className='size-3' aria-hidden='true' />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <label htmlFor={inputId} className='sr-only'>
            {t('Reply to {{name}} (ID {{id}})', {
              name,
              id: conversation.customer.userId,
            })}
          </label>
          <Textarea
            id={inputId}
            className='min-h-14 resize-none rounded-none border-0 p-0 shadow-none focus-visible:ring-0'
            placeholder={t('Reply to {{name}} (ID {{id}})', {
              name,
              id: conversation.customer.userId,
            })}
            value={draft}
            maxLength={TEXT_MAX}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              const files = [...event.clipboardData.files]
              if (!files.some((file) => file.type.startsWith('image/'))) return
              event.preventDefault()
              addImages(files)
            }}
            onKeyDown={(event) => {
              if (
                event.key !== 'Enter' ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              ) {
                return
              }
              event.preventDefault()
              if (canSend) send.mutate()
            }}
          />
          <div className='text-muted-foreground flex items-center gap-2 text-xs'>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              aria-label={t('Send image')}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus aria-hidden='true' />
            </Button>
            <SupportQuickReplyMenu
              replies={props.quickReplies}
              onPick={setDraft}
            />
            <label className='flex items-center gap-1.5 text-xs'>
              <Checkbox
                checked={popup}
                onCheckedChange={(checked) => setPopup(checked === true)}
              />
              {t('Pop up on the client')}
            </label>
            <input
              ref={fileInput}
              type='file'
              accept='image/png,image/jpeg,image/webp'
              multiple
              hidden
              onChange={(event) => {
                addImages([...(event.target.files ?? [])])
                event.target.value = ''
              }}
            />
            <span className='ms-auto'>
              {t('Enter to send, Shift + Enter for a new line')}
            </span>
            <Button type='submit' size='sm' disabled={!canSend}>
              {send.isPending ? t('Sending…') : t('Send')}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  )
}

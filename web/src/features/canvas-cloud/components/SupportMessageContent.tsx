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
import { Download, ExternalLink, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import { resolveCanvasSupportAttachmentUrl } from '../api'
import type {
  CanvasAdminSupportMessage,
  CanvasSupportAttachment,
} from '../types'

/** Storage addresses open as they are; a local Mock path is read with credentials into a blob address. */
function useAttachmentUrl(url: string | null) {
  const [resolved, setResolved] = useState<string | null>(
    url && !url.startsWith('/v1/') ? url : null
  )
  useEffect(() => {
    if (!url || !url.startsWith('/v1/')) {
      setResolved(url)
      return
    }
    let revoked = false
    let blobUrl: string | null = null
    resolveCanvasSupportAttachmentUrl(url)
      .then((value) => {
        blobUrl = value
        if (!revoked) setResolved(value)
      })
      .catch(() => setResolved(null))
    return () => {
      revoked = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [url])
  return resolved
}

/**
 * Where 下载 points. A storage address on another origin ignores <a download>, so Cloud signs a second address that saves
 * the file; a local Mock path is already read into a blob of this page, where <a download> works.
 */
function saveHref(attachment: CanvasSupportAttachment, shown: string | null) {
  if (attachment.downloadUrl?.startsWith('/v1/')) return shown
  return attachment.downloadUrl
}

function ImageAttachment(props: {
  attachment: CanvasSupportAttachment
  label: string
}) {
  const { t } = useTranslation()
  const url = useAttachmentUrl(props.attachment.url)
  const [open, setOpen] = useState(false)
  // A thumbnail keeps the address it loaded from: a renewed address would download the same image again. One that has not
  // loaded yet follows the renewals, and one that fails falls back to the newest.
  const [loaded, setLoaded] = useState<string | null>(null)
  if (!url) {
    return (
      <span className='bg-muted text-muted-foreground inline-flex h-28 w-44 items-center justify-center rounded-lg text-xs'>
        {t('Image unavailable')}
      </span>
    )
  }
  return (
    <>
      <button
        type='button'
        className='block h-28 w-44 cursor-zoom-in overflow-hidden rounded-lg border'
        aria-label={t('View image')}
        onClick={() => setOpen(true)}
      >
        <img
          src={loaded ?? url}
          alt=''
          loading='lazy'
          className='size-full object-cover'
          onLoad={(event) => setLoaded(event.currentTarget.src)}
          onError={() => setLoaded(null)}
        />
      </button>
      {open ? (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent className='max-w-[min(90vw,64rem)] p-3'>
            <DialogTitle className='sr-only'>{props.label}</DialogTitle>
            <img
              src={url}
              alt={props.label}
              className='max-h-[75vh] w-full rounded-md object-contain'
            />
            <div className='flex flex-wrap justify-end gap-2'>
              <Button
                variant='outline'
                size='sm'
                render={
                  <a href={url} target='_blank' rel='noopener noreferrer' />
                }
              >
                <ExternalLink aria-hidden='true' />
                {t('Open in new tab')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                render={
                  <a
                    href={saveHref(props.attachment, url) ?? url}
                    download=''
                  />
                }
              >
                <Download aria-hidden='true' />
                {t('Download')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}

function LogAttachment(props: { attachment: CanvasSupportAttachment }) {
  const { t, i18n } = useTranslation()
  const url = useAttachmentUrl(props.attachment.url)
  const size = new Intl.NumberFormat(toIntlLocale(i18n.language), {
    style: 'unit',
    unit: 'kilobyte',
    maximumFractionDigits: 0,
  }).format(Math.max(1, props.attachment.sizeBytes / 1024))
  return (
    <div className='bg-card flex w-72 items-center gap-3 rounded-xl border px-3 py-2.5'>
      <span className='bg-muted grid size-9 shrink-0 place-items-center rounded-lg'>
        <FileText className='size-4' aria-hidden='true' />
      </span>
      <span className='flex min-w-0 flex-1 flex-col'>
        <span className='text-sm font-medium'>{t('Diagnostic log')}</span>
        <span className='text-muted-foreground text-xs'>{size}</span>
      </span>
      {url ? (
        <span className='flex gap-3 text-sm'>
          <a
            className='text-primary underline underline-offset-4'
            href={url}
            target='_blank'
            rel='noopener noreferrer'
          >
            {t('View')}
          </a>
          <a
            className='text-primary underline underline-offset-4'
            href={saveHref(props.attachment, url) ?? url}
            download=''
          >
            {t('Download')}
          </a>
        </span>
      ) : (
        <span className='text-muted-foreground text-xs'>
          {t('Unavailable')}
        </span>
      )}
    </div>
  )
}

export function MessageContent(props: {
  message: CanvasAdminSupportMessage
  mine: boolean
}) {
  const { t } = useTranslation()
  const { attachment } = props.message
  if (attachment?.kind === 'IMAGE') {
    return <ImageAttachment attachment={attachment} label={t('Image')} />
  }
  if (attachment?.kind === 'LOG') {
    return <LogAttachment attachment={attachment} />
  }
  return (
    <div
      className={cn(
        'max-w-[28rem] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap',
        props.mine
          ? 'bg-primary text-primary-foreground rounded-tr-sm'
          : 'bg-muted rounded-tl-sm'
      )}
    >
      {props.message.text}
    </div>
  )
}

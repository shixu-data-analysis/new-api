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
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { getServerErrorCode } from '@/lib/server-error-message'

import {
  setCanvasAdminSupportSettings,
  supportQueryKeys,
  testCanvasAdminSupportWebhook,
} from '../api'
import type {
  CanvasSupportRetentionDays,
  CanvasSupportSettings,
  CanvasSupportWebhookFormat,
  CanvasSupportWebhookTest,
} from '../types'

const RETENTION_DAYS: CanvasSupportRetentionDays[] = [3, 7, 15, 30]
const FORMATS: Array<[CanvasSupportWebhookFormat, string]> = [
  ['WECOM', 'WeCom'],
  ['DINGTALK', 'DingTalk'],
  ['FEISHU', 'Feishu'],
  ['SLACK', 'Slack'],
  ['JSON', 'Generic JSON'],
]
const TEST_FAILURES: Record<
  NonNullable<CanvasSupportWebhookTest['reason']>,
  string
> = {
  URL_REJECTED: 'The Webhook address is not allowed',
  NETWORK: 'The Webhook could not be reached',
  TIMEOUT: 'The Webhook did not answer in time',
  HTTP_STATUS: 'The Webhook answered with an error',
  BOT_ERROR:
    'The bot refused the message; check the address and its security settings',
}

function webhookUrlError(
  missing: boolean,
  notHttps: boolean,
  t: (key: string) => string
): string | null {
  if (missing) {
    return t('Enter the Webhook address')
  }
  if (notHttps) {
    return t('Enter an address that starts with https://')
  }
  return null
}

/** 客服设置: message retention and the Webhook that alerts the internal group. */
export function SupportSettingsDialog(props: {
  settings: CanvasSupportSettings
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const id = useId()
  const [retentionDays, setRetentionDays] = useState(
    props.settings.retentionDays
  )
  const [hasWebhook, setHasWebhook] = useState(props.settings.webhook !== null)
  const [format, setFormat] = useState<CanvasSupportWebhookFormat>(
    props.settings.webhook?.format ?? 'WECOM'
  )
  const [url, setUrl] = useState('')
  const [tried, setTried] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const saved = props.settings.webhook
  const trimmedUrl = url.trim()
  // A saved address may stay as it is; a new one, or the first one, must be HTTPS.
  const urlMissing = hasWebhook && !saved && trimmedUrl === ''
  const urlNotHttps = trimmedUrl !== '' && !/^https:\/\/\S+$/i.test(trimmedUrl)
  const localUrlError = webhookUrlError(urlMissing, urlNotHttps, t)
  const shownUrlError = tried ? (localUrlError ?? urlError) : urlError
  const shorter = retentionDays < props.settings.retentionDays
  const dirty =
    retentionDays !== props.settings.retentionDays ||
    hasWebhook !== (saved !== null) ||
    (hasWebhook && (format !== saved?.format || trimmedUrl !== ''))

  const save = useMutation({
    mutationFn: () =>
      setCanvasAdminSupportSettings({
        retentionDays,
        webhook: hasWebhook
          ? { format, ...(trimmedUrl ? { url: trimmedUrl } : {}) }
          : null,
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(supportQueryKeys.settings, result)
      toast.success(t('Settings saved'))
      props.onClose()
    },
    onError: (error) => {
      if (getServerErrorCode(error) === 'SUPPORT_WEBHOOK_REJECTED') {
        setUrlError(
          t(
            'This address is not allowed. Use an HTTPS address on the public internet.'
          )
        )
        return
      }
      toast.error(t('Unable to save the settings. Please try again.'))
    },
  })
  const test = useMutation({
    mutationFn: () => testCanvasAdminSupportWebhook(crypto.randomUUID()),
    onSuccess: (result) =>
      result.ok
        ? toast.success(t('Test message sent'))
        : toast.error(t(TEST_FAILURES[result.reason ?? 'NETWORK'])),
    onError: () =>
      toast.error(t('Unable to send the test message. Please try again.')),
  })
  const busy = save.isPending || test.isPending

  return (
    <Dialog
      open
      onOpenChange={(open) => (!open && !busy ? props.onClose() : undefined)}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('Support settings')}</DialogTitle>
        </DialogHeader>
        <form
          className='space-y-5'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            setTried(true)
            if (localUrlError) return
            save.mutate()
          }}
        >
          <fieldset className='space-y-2'>
            <legend className='text-sm font-medium'>
              {t('Keep messages for')}
            </legend>
            <div className='flex flex-wrap gap-x-4 gap-y-2'>
              {RETENTION_DAYS.map((days) => (
                <label key={days} className='flex items-center gap-2 text-sm'>
                  <input
                    type='radio'
                    name={`${id}-retention`}
                    checked={retentionDays === days}
                    onChange={() => setRetentionDays(days)}
                  />
                  {t('{{count}} days', { count: days })}
                </label>
              ))}
            </div>
            <p className='text-muted-foreground text-xs'>
              {t(
                'Messages and attachments past this are deleted every day and cannot be restored.'
              )}
            </p>
            {shorter ? (
              <p role='alert' className='text-destructive text-xs'>
                {t(
                  'After saving, messages and attachments older than {{count}} days are deleted at the next cleanup.',
                  {
                    count: retentionDays,
                  }
                )}
              </p>
            ) : null}
          </fieldset>

          <fieldset className='space-y-3 border-t border-dashed pt-4'>
            <legend className='text-sm font-medium'>
              {t('Webhook alerts')}
            </legend>
            <p className='text-muted-foreground text-xs'>
              {t(
                'One alert when a conversation starts waiting for a reply, and one more if it still waits after 30 minutes.'
              )}
            </p>
            <label className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                checked={hasWebhook}
                onChange={(event) => setHasWebhook(event.target.checked)}
              />
              {t('Send Webhook alerts')}
            </label>
            {hasWebhook ? (
              <>
                <div className='space-y-2'>
                  <span className='text-sm font-medium' id={`${id}-format`}>
                    {t('Message format')}
                  </span>
                  <div
                    className='flex flex-wrap gap-x-4 gap-y-2'
                    role='radiogroup'
                    aria-labelledby={`${id}-format`}
                  >
                    {FORMATS.map(([value, label]) => (
                      <label
                        key={value}
                        className='flex items-center gap-2 text-sm'
                      >
                        <input
                          type='radio'
                          name={`${id}-webhook-format`}
                          checked={format === value}
                          onChange={() => setFormat(value)}
                        />
                        {t(label)}
                      </label>
                    ))}
                  </div>
                </div>
                <div className='space-y-2'>
                  <Label htmlFor={`${id}-url`}>{t('Webhook address')}</Label>
                  <Input
                    id={`${id}-url`}
                    type='url'
                    autoComplete='off'
                    value={url}
                    placeholder={
                      saved
                        ? t('Saved: {{hint}}. Leave empty to keep it.', {
                            hint: saved.displayHint,
                          })
                        : 'https://'
                    }
                    aria-invalid={Boolean(shownUrlError)}
                    aria-describedby={
                      shownUrlError ? `${id}-url-error` : `${id}-url-help`
                    }
                    onChange={(event) => {
                      setUrl(event.target.value)
                      setUrlError(null)
                    }}
                  />
                  {shownUrlError ? (
                    <p
                      id={`${id}-url-error`}
                      role='alert'
                      className='text-destructive text-xs'
                    >
                      {shownUrlError}
                    </p>
                  ) : (
                    <p
                      id={`${id}-url-help`}
                      className='text-muted-foreground text-xs'
                    >
                      {t(
                        'HTTPS only. After saving only the host and the last four characters are shown.'
                      )}
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </fieldset>

          <DialogFooter className='sm:justify-between'>
            <Button
              type='button'
              variant='outline'
              disabled={busy || !saved || dirty}
              onClick={() => test.mutate()}
            >
              {t('Send test message')}
            </Button>
            <div className='flex gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={busy}
                onClick={props.onClose}
              >
                {t('Cancel')}
              </Button>
              <Button type='submit' disabled={busy}>
                {t('Save')}
              </Button>
            </div>
          </DialogFooter>
          {saved && dirty ? (
            <DialogDescription className='text-xs'>
              {t('Save the changes before sending a test message.')}
            </DialogDescription>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  )
}

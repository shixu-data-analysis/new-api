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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getServerErrorCode } from '@/lib/server-error-message'

import {
  setCanvasAdminSupportSettings,
  supportQueryKeys,
  testCanvasAdminSupportWebhook,
} from '../api'
import type {
  CanvasSupportQuickReplies,
  CanvasSupportRetentionDays,
  CanvasSupportSettings,
  CanvasSupportWebhookFormat,
  CanvasSupportWebhookTest,
} from '../types'
import { SupportQuickRepliesField } from './SupportQuickRepliesField'

const RETENTION_DAYS: CanvasSupportRetentionDays[] = [3, 7, 15, 30]
type SettingsTab = 'alerts' | 'replies' | 'retention'
const THRESHOLD_RANGE = { min: 2, max: 20 }
const WINDOW_HOURS_RANGE = { min: 1, max: 168 }

const inRange = (value: string, range: { min: number; max: number }) =>
  /^\d+$/.test(value) &&
  Number(value) >= range.min &&
  Number(value) <= range.max
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

/** 客服设置: message retention, the Webhook that alerts the internal group, failure alerts and quick replies. */
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
  const [threshold, setThreshold] = useState(
    String(props.settings.failureAlerts.threshold)
  )
  const [windowHours, setWindowHours] = useState(
    String(props.settings.failureAlerts.windowHours)
  )
  const [quickReplies, setQuickReplies] = useState<CanvasSupportQuickReplies>(
    props.settings.quickReplies
  )
  const [tab, setTab] = useState<SettingsTab>('alerts')
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
  const failureRangeError =
    inRange(threshold, THRESHOLD_RANGE) &&
    inRange(windowHours, WINDOW_HOURS_RANGE)
      ? null
      : t(
          'Enter {{min}}–{{max}} failures and {{minHours}}–{{maxHours}} hours',
          {
            min: THRESHOLD_RANGE.min,
            max: THRESHOLD_RANGE.max,
            minHours: WINDOW_HOURS_RANGE.min,
            maxHours: WINDOW_HOURS_RANGE.max,
          }
        )
  const dirty =
    retentionDays !== props.settings.retentionDays ||
    threshold !== String(props.settings.failureAlerts.threshold) ||
    windowHours !== String(props.settings.failureAlerts.windowHours) ||
    JSON.stringify(quickReplies) !==
      JSON.stringify(props.settings.quickReplies) ||
    hasWebhook !== (saved !== null) ||
    (hasWebhook && (format !== saved?.format || trimmedUrl !== ''))

  const save = useMutation({
    mutationFn: () =>
      setCanvasAdminSupportSettings({
        retentionDays,
        failureAlerts: {
          threshold: Number(threshold),
          windowHours: Number(windowHours),
        },
        quickReplies,
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

  // Errors on submit are all in 提醒; the dialog shows that tab so they can be seen.
  const submit = () => {
    setTried(true)
    if (localUrlError || failureRangeError) {
      setTab('alerts')
      return
    }
    save.mutate()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => (!open && !busy ? props.onClose() : undefined)}
    >
      <DialogContent className='flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-lg'>
        <DialogHeader className='px-6 pt-6 pb-3'>
          <DialogTitle>{t('Support settings')}</DialogTitle>
        </DialogHeader>
        <form
          className='flex min-h-0 flex-1 flex-col'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as SettingsTab)}
            className='flex min-h-0 flex-1 flex-col gap-0'
          >
            <div className='px-6'>
              <TabsList aria-label={t('Support settings')}>
                <TabsTrigger value='alerts'>{t('Alerts')}</TabsTrigger>
                <TabsTrigger value='replies'>{t('Quick replies')}</TabsTrigger>
                <TabsTrigger value='retention'>
                  {t('Message retention')}
                </TabsTrigger>
              </TabsList>
            </div>
            <div className='min-h-80 flex-1 overflow-y-auto px-6 py-4'>
              <TabsContent value='alerts' className='space-y-6'>
                <section
                  className='space-y-3'
                  aria-labelledby={`${id}-webhook`}
                >
                  <div className='flex items-start gap-3'>
                    <div className='flex-1 space-y-1'>
                      <h3 id={`${id}-webhook`} className='text-sm font-medium'>
                        {t('Webhook alerts')}
                      </h3>
                      <p
                        id={`${id}-webhook-help`}
                        className='text-muted-foreground text-xs'
                      >
                        {t(
                          'Alerts on new messages (at most once per conversation every 10 minutes) and again after 30 minutes without a reply.'
                        )}
                      </p>
                    </div>
                    <Switch
                      checked={hasWebhook}
                      aria-label={t('Send Webhook alerts')}
                      aria-describedby={`${id}-webhook-help`}
                      onCheckedChange={setHasWebhook}
                    />
                  </div>
                  {hasWebhook ? (
                    <div className='grid gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]'>
                      <div className='space-y-2'>
                        <Label htmlFor={`${id}-format`}>
                          {t('Message format')}
                        </Label>
                        <Select
                          value={format}
                          onValueChange={(value) =>
                            value
                              ? setFormat(value as CanvasSupportWebhookFormat)
                              : undefined
                          }
                        >
                          <SelectTrigger id={`${id}-format`} className='w-full'>
                            <SelectValue>
                              {(value: string) =>
                                t(
                                  FORMATS.find(([key]) => key === value)?.[1] ??
                                    'Unknown'
                                )
                              }
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {FORMATS.map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {t(label)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className='min-w-0 space-y-2'>
                        <Label htmlFor={`${id}-url`}>
                          {t('Webhook address')}
                        </Label>
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
                      </div>
                      <div className='space-y-2 sm:col-span-2'>
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
                            {t('HTTPS only')}
                          </p>
                        )}
                        <div className='flex flex-wrap items-center gap-2'>
                          <Button
                            type='button'
                            variant='outline'
                            size='sm'
                            disabled={busy || !saved || dirty}
                            onClick={() => test.mutate()}
                          >
                            {t('Send test message')}
                          </Button>
                          {saved && dirty ? (
                            <span className='text-muted-foreground text-xs'>
                              {t(
                                'Save the changes before sending a test message.'
                              )}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section
                  className='space-y-2 border-t pt-5'
                  aria-labelledby={`${id}-failures`}
                >
                  <h3 id={`${id}-failures`} className='text-sm font-medium'>
                    {t('Failure alerts')}
                  </h3>
                  <div className='flex flex-wrap items-center gap-2 text-sm'>
                    <span>
                      {t('Alert when one customer fails on one model')}
                    </span>
                    <Input
                      className='w-16 text-center tabular-nums'
                      inputMode='numeric'
                      aria-label={t('Failures')}
                      aria-invalid={tried && Boolean(failureRangeError)}
                      value={threshold}
                      onChange={(event) =>
                        setThreshold(event.target.value.trim())
                      }
                    />
                    <span>{t('times within')}</span>
                    <Input
                      className='w-16 text-center tabular-nums'
                      inputMode='numeric'
                      aria-label={t('Hours')}
                      aria-invalid={tried && Boolean(failureRangeError)}
                      value={windowHours}
                      onChange={(event) =>
                        setWindowHours(event.target.value.trim())
                      }
                    />
                    <span>{t('hours')}</span>
                  </div>
                  {tried && failureRangeError ? (
                    <p role='alert' className='text-destructive text-xs'>
                      {failureRangeError}
                    </p>
                  ) : null}
                </section>
              </TabsContent>

              <TabsContent value='replies' className='space-y-5'>
                <p className='text-muted-foreground text-xs'>
                  {t('At most 20 in each group')}
                </p>
                <SupportQuickRepliesField
                  label={t('Conversation replies')}
                  values={quickReplies.conversation}
                  onChange={(conversation) =>
                    setQuickReplies({ ...quickReplies, conversation })
                  }
                />
                <SupportQuickRepliesField
                  label={t('Failure notices')}
                  values={quickReplies.failureNotice}
                  onChange={(failureNotice) =>
                    setQuickReplies({ ...quickReplies, failureNotice })
                  }
                />
              </TabsContent>

              <TabsContent value='retention' className='space-y-2'>
                <Label htmlFor={`${id}-retention`}>
                  {t('Keep messages for')}
                </Label>
                <Select
                  value={String(retentionDays)}
                  onValueChange={(value) =>
                    value
                      ? setRetentionDays(
                          Number(value) as CanvasSupportRetentionDays
                        )
                      : undefined
                  }
                >
                  <SelectTrigger id={`${id}-retention`} className='w-40'>
                    <SelectValue>
                      {(value: string) =>
                        t('{{count}} days', { count: Number(value) })
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {RETENTION_DAYS.map((days) => (
                      <SelectItem key={days} value={String(days)}>
                        {t('{{count}} days', { count: days })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Messages and attachments past this are deleted every day and cannot be restored.'
                  )}
                </p>
                {shorter ? (
                  <p role='alert' className='text-destructive text-xs'>
                    {t(
                      'After saving, messages and attachments older than {{count}} days are deleted at the next cleanup.',
                      { count: retentionDays }
                    )}
                  </p>
                ) : null}
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className='border-t px-6 py-4'>
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
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

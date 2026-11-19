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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { setCanvasAdminSupportSettings, supportQueryKeys } from '../api'
import type {
  CanvasSupportQuickReplies,
  CanvasSupportRetentionDays,
  CanvasSupportSettings,
} from '../types'
import { CanvasFormDialog } from './CanvasFormDialog'
import { NotificationSendTo } from './NotificationSendTo'
import { SupportQuickRepliesField } from './SupportQuickRepliesField'

const RETENTION_DAYS: CanvasSupportRetentionDays[] = [3, 7, 15, 30]
type SettingsTab = 'alerts' | 'replies' | 'retention'
const THRESHOLD_RANGE = { min: 2, max: 20 }
const WINDOW_HOURS_RANGE = { min: 1, max: 168 }
const FOLLOW_UP_MINUTES_RANGE = { min: 1, max: 60 }
const REMINDER_MINUTES_RANGE = { min: 5, max: 240 }

const inRange = (value: string, range: { min: number; max: number }) =>
  /^\d+$/.test(value) &&
  Number(value) >= range.min &&
  Number(value) <= range.max
/** 客服设置: message retention, alert times, failure alerts and quick replies; where the alerts go is set in 运行管理 › 通知. */
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
  const [followUpMinutes, setFollowUpMinutes] = useState(
    String(props.settings.messageAlerts.followUpMinutes)
  )
  const [reminderMinutes, setReminderMinutes] = useState(
    String(props.settings.messageAlerts.reminderMinutes)
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
  const [tried, setTried] = useState(false)
  const shorter = retentionDays < props.settings.retentionDays
  const minutesError = (value: string, range: { min: number; max: number }) =>
    inRange(value, range) ? null : t('Enter {{min}}–{{max}} minutes', range)
  const followUpError = minutesError(followUpMinutes, FOLLOW_UP_MINUTES_RANGE)
  const reminderError = minutesError(reminderMinutes, REMINDER_MINUTES_RANGE)
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
    followUpMinutes !== String(props.settings.messageAlerts.followUpMinutes) ||
    reminderMinutes !== String(props.settings.messageAlerts.reminderMinutes) ||
    threshold !== String(props.settings.failureAlerts.threshold) ||
    windowHours !== String(props.settings.failureAlerts.windowHours) ||
    JSON.stringify(quickReplies) !== JSON.stringify(props.settings.quickReplies)

  const save = useMutation({
    mutationFn: () =>
      setCanvasAdminSupportSettings({
        retentionDays,
        messageAlerts: {
          followUpMinutes: Number(followUpMinutes),
          reminderMinutes: Number(reminderMinutes),
        },
        failureAlerts: {
          threshold: Number(threshold),
          windowHours: Number(windowHours),
        },
        quickReplies,
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(supportQueryKeys.settings, result)
      toast.success(t('Settings saved'))
      props.onClose()
    },
    onError: () =>
      toast.error(t('Unable to save the settings. Please try again.')),
  })
  const busy = save.isPending

  // Errors on submit are all in 提醒; the dialog shows that tab so they can be seen.
  const submit = () => {
    setTried(true)
    if (followUpError || reminderError || failureRangeError) {
      setTab('alerts')
      return
    }
    save.mutate()
  }

  return (
    <CanvasFormDialog
      title={t('Support settings')}
      onRequestClose={() => (busy ? undefined : props.onClose())}
      onSubmit={submit}
      footer={
        <>
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
        </>
      }
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
            <NotificationSendTo
              eventId='support.pending'
              label={t('Alerts go to')}
              help={t(
                'Alerts on new messages, and once more when a conversation stays unanswered, at the times below.'
              )}
              onBeforeLeave={() => {
                if (!dirty) return true
                toast.error(t('Save or cancel the changes before leaving.'))
                return false
              }}
            />

            <section
              className='space-y-3 border-t pt-5'
              aria-labelledby={`${id}-waiting`}
            >
              <h3 id={`${id}-waiting`} className='text-sm font-medium'>
                {t('Conversations awaiting reply')}
              </h3>
              <div className='space-y-1'>
                <div className='flex flex-wrap items-center gap-2 text-sm'>
                  <span>
                    {t('More messages in the same wait alert again after')}
                  </span>
                  <Input
                    className='w-16 text-center tabular-nums'
                    inputMode='numeric'
                    aria-label={t('Alert again after (minutes)')}
                    aria-invalid={tried && Boolean(followUpError)}
                    aria-describedby={
                      tried && followUpError
                        ? `${id}-follow-up-error`
                        : undefined
                    }
                    value={followUpMinutes}
                    onChange={(event) =>
                      setFollowUpMinutes(event.target.value.trim())
                    }
                  />
                  <span>{t('minutes')}</span>
                </div>
                {tried && followUpError ? (
                  <p
                    id={`${id}-follow-up-error`}
                    role='alert'
                    className='text-destructive text-xs'
                  >
                    {followUpError}
                  </p>
                ) : null}
              </div>
              <div className='space-y-1'>
                <div className='flex flex-wrap items-center gap-2 text-sm'>
                  <span>{t('Remind once when still unanswered after')}</span>
                  <Input
                    className='w-16 text-center tabular-nums'
                    inputMode='numeric'
                    aria-label={t('Reminder after (minutes)')}
                    aria-invalid={tried && Boolean(reminderError)}
                    aria-describedby={
                      tried && reminderError
                        ? `${id}-reminder-error`
                        : undefined
                    }
                    value={reminderMinutes}
                    onChange={(event) =>
                      setReminderMinutes(event.target.value.trim())
                    }
                  />
                  <span>{t('minutes')}</span>
                </div>
                {tried && reminderError ? (
                  <p
                    id={`${id}-reminder-error`}
                    role='alert'
                    className='text-destructive text-xs'
                  >
                    {reminderError}
                  </p>
                ) : null}
              </div>
            </section>

            <section
              className='space-y-2 border-t pt-5'
              aria-labelledby={`${id}-failures`}
            >
              <h3 id={`${id}-failures`} className='text-sm font-medium'>
                {t('Failure alerts')}
              </h3>
              <div className='flex flex-wrap items-center gap-2 text-sm'>
                <span>{t('Alert when one customer fails on one model')}</span>
                <Input
                  className='w-16 text-center tabular-nums'
                  inputMode='numeric'
                  aria-label={t('Failures')}
                  aria-invalid={tried && Boolean(failureRangeError)}
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value.trim())}
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
            <Label htmlFor={`${id}-retention`}>{t('Keep messages for')}</Label>
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
    </CanvasFormDialog>
  )
}

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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { notifyCanvasAdminSupportFailureAlerts, supportQueryKeys } from '../api'
import { SupportQuickReplyMenu } from './SupportQuickReplyMenu'

// The customer reads the model's name before the text; Cloud adds it and keeps the whole notice within 2000 characters.
const NOTICE_MAX = 1800

/** 通知客户结果: one system notice to each chosen customer, written here or taken from the 失败通知 quick replies. */
export function SupportFailureNoticeDialog(props: {
  modelKey: string
  modelName: string
  alertIds: string[]
  quickReplies: string[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const id = useId()
  const [text, setText] = useState('')
  // One key per dialog, so a retry after a lost answer is not sent twice.
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const trimmed = text.trim()
  const notify = useMutation({
    mutationFn: () =>
      notifyCanvasAdminSupportFailureAlerts({
        modelKey: props.modelKey,
        alertIds: props.alertIds,
        text: trimmed,
        idempotencyKey,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: supportQueryKeys.all })
      toast.success(
        t('Notified {{count}} customers', { count: result.notified })
      )
      props.onClose()
    },
    onError: () =>
      toast.error(t('Unable to send the notice. Please try again.')),
  })

  return (
    <Dialog
      open
      onOpenChange={(open) =>
        !open && !notify.isPending ? props.onClose() : undefined
      }
    >
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('Notify customers of the result')}</DialogTitle>
          <DialogDescription>
            {t('{{model}} · {{count}} customers', {
              model: props.modelName,
              count: props.alertIds.length,
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault()
            if (trimmed) notify.mutate()
          }}
        >
          <div className='space-y-2'>
            <div className='flex items-center justify-between gap-2'>
              <Label htmlFor={`${id}-text`}>{t('Notice')}</Label>
              <SupportQuickReplyMenu
                replies={{
                  conversation: [],
                  failureNotice: props.quickReplies,
                }}
                onPick={setText}
              />
            </div>
            <Textarea
              id={`${id}-text`}
              className='min-h-24'
              value={text}
              maxLength={NOTICE_MAX}
              placeholder={t('Write the result')}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <div className='bg-muted/50 rounded-xl border p-3 text-sm'>
            <span className='text-muted-foreground mb-1 block text-xs'>
              {t('What the customer sees')}
            </span>
            {`关于「${props.modelName}」：${trimmed || '……'}`}
          </div>
          <DialogFooter>
            <div className='flex gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={notify.isPending}
                onClick={props.onClose}
              >
                {t('Cancel')}
              </Button>
              <Button type='submit' disabled={!trimmed || notify.isPending}>
                {notify.isPending ? t('Sending…') : t('Send')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

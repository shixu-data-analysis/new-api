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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import {
  dismissCanvasAdminSupportFailureAlerts,
  supportQueryKeys,
} from '../api'
import type { CanvasSupportFailureAlerts } from '../types'
import { SupportFailureNoticeDialog } from './SupportFailureNoticeDialog'

/**
 * 客服会话 › 失败提醒: customers whose tasks on one model failed repeatedly, by model. The administrator investigates, then
 * notifies the chosen customers of the result or dismisses their alerts.
 */
export function SupportFailureAlerts(props: {
  alerts: CanvasSupportFailureAlerts
  quickReplies: string[]
  onOpenCustomer: (customerId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [modelKey, setModelKey] = useState<string | null>(null)
  // Alerts left out by the administrator; every other open alert of the model is chosen.
  const [leftOut, setLeftOut] = useState<Set<string>>(new Set())
  const [notifying, setNotifying] = useState(false)
  const model =
    props.alerts.models.find((item) => item.modelKey === modelKey) ??
    props.alerts.models[0] ??
    null
  const chosen = model
    ? model.customers.filter((row) => !leftOut.has(row.alertId))
    : []
  const chosenIds = chosen.map((row) => row.alertId)
  const time = (iso: string) =>
    new Intl.DateTimeFormat(toIntlLocale(i18n.language), {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso))

  const dismiss = useMutation({
    mutationFn: (target: { modelKey: string; alertIds: string[] }) =>
      dismissCanvasAdminSupportFailureAlerts({
        ...target,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: supportQueryKeys.failureAlerts,
      })
      toast.success(
        t('Dismissed {{count}} alerts', { count: result.dismissed })
      )
    },
    onError: () =>
      toast.error(t('Unable to dismiss the alerts. Please try again.')),
  })

  if (!model) {
    return (
      <Card className='p-4'>
        <p className='text-muted-foreground text-sm' role='status'>
          {t('No open failure alerts')}
        </p>
      </Card>
    )
  }

  return (
    <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]'>
      <Card className='gap-0 p-2'>
        <ul className='grid gap-0.5' aria-label={t('Failure alerts')}>
          {props.alerts.models.map((item) => (
            <li key={item.modelKey}>
              <button
                type='button'
                aria-pressed={item.modelKey === model.modelKey}
                className={cn(
                  'grid w-full gap-0.5 rounded-xl p-3 text-start',
                  item.modelKey === model.modelKey
                    ? 'bg-primary/10'
                    : 'hover:bg-muted/60'
                )}
                onClick={() => {
                  setModelKey(item.modelKey)
                  setLeftOut(new Set())
                }}
              >
                <span className='font-semibold'>{item.modelName}</span>
                <span className='text-muted-foreground text-sm'>
                  {t('{{count}} customers failed {{threshold}} times or more', {
                    count: item.customers.length,
                    threshold: props.alerts.threshold,
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className='min-w-0 gap-0 p-0'>
        <div className='flex flex-wrap items-center gap-2 border-b p-4'>
          <h2 className='text-base font-semibold'>{model.modelName}</h2>
          <span className='text-muted-foreground font-mono text-xs'>
            {model.modelKey}
          </span>
          <div className='ms-auto flex gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={chosen.length === 0 || dismiss.isPending}
              onClick={() =>
                dismiss.mutate({
                  modelKey: model.modelKey,
                  alertIds: chosenIds,
                })
              }
            >
              {t('Dismiss')}
            </Button>
            <Button
              type='button'
              size='sm'
              disabled={chosen.length === 0}
              onClick={() => setNotifying(true)}
            >
              {t('Notify customers of the result')}
            </Button>
          </div>
        </div>
        <div className='overflow-x-auto p-4'>
          <table className='w-full text-sm'>
            <thead className='text-muted-foreground text-start'>
              <tr className='border-b'>
                <th className='w-10 py-2 font-medium'>
                  <span className='sr-only'>{t('Choose')}</span>
                </th>
                <th className='py-2 text-start font-medium'>{t('Customer')}</th>
                <th className='py-2 text-start font-medium'>{t('Failures')}</th>
                <th className='py-2 text-start font-medium'>
                  {t('First failure')}
                </th>
                <th className='py-2 text-start font-medium'>
                  {t('Latest failure')}
                </th>
                <th className='py-2'>
                  <span className='sr-only'>{t('Actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {model.customers.map((row) => {
                const name = row.customer.name ?? t('Customer')
                return (
                  <tr key={row.alertId} className='border-b last:border-0'>
                    <td className='py-2'>
                      <Checkbox
                        aria-label={t('Choose {{name}}', { name })}
                        checked={!leftOut.has(row.alertId)}
                        onCheckedChange={(checked) =>
                          setLeftOut((previous) => {
                            const next = new Set(previous)
                            if (checked) next.delete(row.alertId)
                            else next.add(row.alertId)
                            return next
                          })
                        }
                      />
                    </td>
                    <td className='py-2'>
                      {name}{' '}
                      <span className='text-muted-foreground text-xs'>
                        ID {row.customer.userId}
                      </span>
                    </td>
                    <td className='py-2 tabular-nums'>{row.failureCount}</td>
                    <td className='py-2 tabular-nums'>
                      {time(row.firstFailedAt)}
                    </td>
                    <td className='py-2 tabular-nums'>
                      {time(row.lastFailedAt)}
                    </td>
                    <td className='py-2 text-end'>
                      <Button
                        type='button'
                        variant='link'
                        size='sm'
                        onClick={() => props.onOpenCustomer(row.customer.id)}
                      >
                        {t('Customer details')}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className='text-muted-foreground mt-3 text-xs'>
            {t(
              'Confirmed failures within {{hours}} hours; one task counts once. After a notice or a dismissal the earlier failures alert no more; {{threshold}} new failures alert again.',
              {
                hours: props.alerts.windowHours,
                threshold: props.alerts.threshold,
              }
            )}
          </p>
        </div>
      </Card>

      {notifying ? (
        <SupportFailureNoticeDialog
          modelKey={model.modelKey}
          modelName={model.modelName}
          alertIds={chosenIds}
          quickReplies={props.quickReplies}
          onClose={() => setNotifying(false)}
        />
      ) : null}
    </div>
  )
}

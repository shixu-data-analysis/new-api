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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import {
  dismissCanvasAdminSupportFailureAlerts,
  supportQueryKeys,
} from '../api'
import type { CanvasSupportFailureAlerts } from '../types'
import { SupportFailureNoticeDialog } from './SupportFailureNoticeDialog'

const NAMES_SHOWN = 3

/** Who failed on the model: up to three names, then how many in all. */
function customerNames(
  model: CanvasSupportFailureAlerts['models'][number],
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const names = model.customers
    .slice(0, NAMES_SHOWN)
    .map((row) => row.customer.name ?? t('Customer'))
    .join(t('、'))
  if (model.customers.length <= NAMES_SHOWN) {
    return names
  }
  return t('{{names}} and {{count}} customers in all', {
    names,
    count: model.customers.length,
  })
}

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
      <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]'>
        <Card className='gap-0 p-2'>
          <p className='text-muted-foreground p-3 text-sm' role='status'>
            {t('No open failure alerts')}
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className='grid items-start gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]'>
      <Card className='gap-0 p-2'>
        <ul className='grid gap-0.5' aria-label={t('Failure alerts')}>
          {props.alerts.models.map((item) => (
            <li key={item.modelKey}>
              <button
                type='button'
                aria-pressed={item.modelKey === model.modelKey}
                className={cn(
                  'flex w-full min-w-0 flex-col gap-0.5 rounded-xl p-2.5 text-start',
                  item.modelKey === model.modelKey
                    ? 'bg-muted'
                    : 'hover:bg-muted/60'
                )}
                onClick={() => {
                  setModelKey(item.modelKey)
                  setLeftOut(new Set())
                }}
              >
                <span className='truncate font-semibold'>{item.modelName}</span>
                <span className='text-muted-foreground truncate text-sm'>
                  {customerNames(item, t)}
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
        <div className='p-4'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-10'>
                  <span className='sr-only'>{t('Choose')}</span>
                </TableHead>
                <TableHead>{t('Customer')}</TableHead>
                <TableHead>{t('Failures')}</TableHead>
                <TableHead>{t('Latest failure')}</TableHead>
                <TableHead>{t('Last notice')}</TableHead>
                <TableHead>
                  <span className='sr-only'>{t('Actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {model.customers.map((row) => {
                const name = row.customer.name ?? t('Customer')
                return (
                  <TableRow key={row.alertId}>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      {name}{' '}
                      <span className='text-muted-foreground text-xs'>
                        ID {row.customer.userId}
                      </span>
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {row.failureCount}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {time(row.lastFailedAt)}
                    </TableCell>
                    <TableCell className='text-muted-foreground tabular-nums'>
                      {row.lastNotifiedAt
                        ? t('Still being worked on · {{time}}', {
                            time: time(row.lastNotifiedAt),
                          })
                        : '—'}
                    </TableCell>
                    <TableCell className='text-end'>
                      <Button
                        type='button'
                        variant='link'
                        size='sm'
                        onClick={() => props.onOpenCustomer(row.customer.id)}
                      >
                        {t('Customer details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
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

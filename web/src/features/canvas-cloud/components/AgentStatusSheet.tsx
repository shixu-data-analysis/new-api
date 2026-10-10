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
import { X } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { toIntlLocale } from '@/i18n/languages'

import {
  agentEarningsQueryKeys,
  changeAgentStatus,
  getAgentStatusPreview,
  newAgentStatusIdempotencyKey,
} from '../agent-earnings-api'
import { formatRmbMinor } from '../agent-earnings-format'
import { formatExactPointQuantity } from '../number-format'
import { useRequestIdempotencyKey } from '../use-request-idempotency-key'

/** Disables or restores an agent's qualification with a required reason, after showing what it affects. */
export function AgentStatusSheet(props: {
  agent:
    | { principalId: string; username: string; status: 'ACTIVE' | 'DISABLED' }
    | undefined
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const queryClient = useQueryClient()
  const reasonId = useId()
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const key = useRequestIdempotencyKey(() =>
    newAgentStatusIdempotencyKey(action)
  )
  const action = props.agent?.status === 'ACTIVE' ? 'disable' : 'enable'
  const principalId = props.agent?.principalId ?? ''
  const preview = useQuery({
    queryKey: [
      ...agentEarningsQueryKeys.all,
      'status-preview',
      props.agent?.principalId,
    ],
    queryFn: ({ signal }) => getAgentStatusPreview(principalId, signal),
    enabled: Boolean(props.agent),
  })
  const close = () => {
    setReason('')
    setTouched(false)
    key.reset()
    props.onOpenChange(false)
  }
  const change = useMutation({
    mutationFn: () =>
      changeAgentStatus(
        principalId,
        action,
        reason.trim(),
        key.keyFor(`${principalId}|${action}|${reason.trim()}`)
      ),
    onSuccess: async () => {
      toast.success(
        action === 'disable'
          ? t('Agent qualification disabled')
          : t('Agent qualification restored')
      )
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['canvas-cloud', 'agents'] }),
        queryClient.invalidateQueries({ queryKey: agentEarningsQueryKeys.all }),
      ])
      close()
    },
    onError: async (error) => {
      toast.error(
        t(
          'The agent qualification could not be changed. Refresh and try again.'
        )
      )
      key.settle(error)
      await preview.refetch()
    },
  })
  const reasonError =
    touched && !reason.trim() ? t('Enter a reason') : undefined
  const impacts =
    action === 'disable'
      ? [
          t(
            'Customers are not affected: accounts, price plans, available models and agent attribution stay unchanged.'
          ),
          t('Earnings stop from the moment of the disable.'),
          t(
            'The agent cannot apply for withdrawals; requests submitted before the disable are still paid or rejected.'
          ),
          t(
            'Active invite codes assigned to the agent are paused; restoring resumes the ones still valid.'
          ),
          t('The agent loses "My customers"; "My earnings" becomes read-only.'),
        ]
      : [
          t(
            'Earnings restart from the moment of the restore; nothing is added for the disabled period.'
          ),
          t(
            'The available balance and unsettled earnings from before the restore are cleared and not paid.'
          ),
          t(
            'Requests submitted before the disable and rejected after the restore are not returned to the balance.'
          ),
          t(
            'Invite codes paused by the disable resume if still valid; expired ones stay expired; codes paused manually before the disable stay paused.'
          ),
          t('An agent who needs new invite codes asks an administrator.'),
        ]
  return (
    <Sheet
      open={Boolean(props.agent)}
      onOpenChange={(open) => (open ? undefined : close())}
    >
      <SheetContent
        className={sideDrawerContentClassName('sm:max-w-xl')}
        showCloseButton={false}
      >
        <SheetHeader className={sideDrawerHeaderClassName('relative')}>
          <SheetTitle>
            {action === 'disable'
              ? t('Disable agent qualification')
              : t('Restore agent qualification')}
          </SheetTitle>
          <SheetDescription>{props.agent?.username}</SheetDescription>
          <SheetClose
            render={
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                className='absolute top-3 right-3'
                aria-label={t('Close')}
              />
            }
          >
            <X aria-hidden='true' />
          </SheetClose>
        </SheetHeader>
        <div className={sideDrawerFormClassName('gap-4')}>
          {preview.isPending ? <LoadingState /> : null}
          {preview.isError ? (
            <ErrorState onRetry={() => void preview.refetch()} />
          ) : null}
          {preview.data ? (
            <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm'>
              <dt className='text-muted-foreground'>{t('Agent')}</dt>
              <dd>{preview.data.username ?? '—'}</dd>
              <dt className='text-muted-foreground'>{t('Customers')}</dt>
              <dd className='tabular-nums'>
                {formatExactPointQuantity(
                  String(preview.data.customerCount),
                  locale
                )}
              </dd>
              <dt className='text-muted-foreground'>
                {t('Assigned invite codes')}
              </dt>
              <dd className='tabular-nums'>
                {formatExactPointQuantity(
                  String(preview.data.inviteCodeCount),
                  locale
                )}
              </dd>
              <dt className='text-muted-foreground'>
                {action === 'disable'
                  ? t('Available balance')
                  : t('Balance to be cleared')}
              </dt>
              <dd className='font-semibold tabular-nums'>
                {formatRmbMinor(preview.data.availableMinor, locale)}
              </dd>
            </dl>
          ) : null}
          <ul className='text-muted-foreground list-disc space-y-1 ps-5 text-sm'>
            {impacts.map((impact) => (
              <li key={impact}>{impact}</li>
            ))}
          </ul>
          <div className='grid gap-1.5'>
            <Label htmlFor={reasonId}>
              {t('Reason')} <span className='text-destructive'>*</span>
            </Label>
            <Textarea
              id={reasonId}
              value={reason}
              maxLength={500}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={`${reasonId}-error`}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
            />
            {reasonError ? (
              <p id={`${reasonId}-error`} className='text-destructive text-sm'>
                {reasonError}
              </p>
            ) : null}
          </div>
        </div>
        <SheetFooter className={sideDrawerFooterClassName()}>
          <Button
            type='button'
            variant='outline'
            disabled={change.isPending}
            onClick={close}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            variant={action === 'disable' ? 'destructive' : 'default'}
            disabled={change.isPending || !preview.data}
            onClick={() => {
              setTouched(true)
              if (reason.trim()) change.mutate()
            }}
          >
            {action === 'disable' ? t('Confirm disable') : t('Confirm restore')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

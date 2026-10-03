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

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import {
  revokeCanvasTaskProviderCostSettlement,
  settleCanvasTaskProviderCost,
} from '../api'
import { providerBalanceAlertsQueryKey } from '../operating-dashboard-api'
import { CopyableText } from './CopyableText'

const amountPattern = /^(0|[1-9]\d{0,11})(?:\.\d{1,4})?$/u
const REASON_LIMIT = 1_000

function errorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } }).response?.status
}

/** Refreshes everything that shows this Task's cost: its detail, the dashboard and its cost drawer. */
async function refreshCostViews(
  queryClient: ReturnType<typeof useQueryClient>,
  taskId: string
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'task-record', taskId],
    }),
    queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'operating-dashboard'],
    }),
    // A settled cost lowers the estimate and the incomplete-cost hint of its API provider.
    queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'provider-balances'],
    }),
    queryClient.invalidateQueries({ queryKey: providerBalanceAlertsQueryKey }),
  ])
}

/** "Settle cost": records what the API provider actually charged for a call whose cost data is incomplete. */
export function ProviderCostSettlementDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  callId: string | null
  upstreamTaskId?: string | null
  upstreamRequestId?: string | null
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const amountId = useId()
  const reasonId = useId()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [failure, setFailure] = useState(false)
  const amountValid = amountPattern.test(amount.trim())
  const reasonValid = reason.trim().length <= REASON_LIMIT
  const settle = useMutation({
    mutationFn: () =>
      settleCanvasTaskProviderCost(props.taskId, {
        callId: props.callId,
        amountRmb: amount.trim(),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: async () => {
      props.onOpenChange(false)
      setAmount('')
      setReason('')
      setTried(false)
      setConflict(false)
      setFailure(false)
      await refreshCostViews(queryClient, props.taskId)
      toast.success(t('Cost settled'))
    },
    onError: async (error) => {
      if (errorStatus(error) === 409) {
        setFailure(false)
        setConflict(true)
        await refreshCostViews(queryClient, props.taskId)
        return
      }
      setFailure(true)
    },
  })
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Settle cost')}</AlertDialogTitle>
          <AlertDialogDescription className='sr-only'>
            {t('Record what the API provider actually charged for this call.')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className='space-y-4'>
          {conflict ? (
            <p
              className='border-destructive/35 text-destructive rounded-md border p-3 text-sm'
              role='alert'
            >
              {t('The cost status of this call has changed.')}
            </p>
          ) : null}
          {props.upstreamTaskId || props.upstreamRequestId ? (
            <dl className='grid gap-3 text-sm sm:grid-cols-2'>
              {props.upstreamTaskId ? (
                <div className='min-w-0'>
                  <dt className='text-muted-foreground'>
                    {t('Upstream task ID')}
                  </dt>
                  <dd className='font-mono'>
                    <CopyableText value={props.upstreamTaskId} />
                  </dd>
                </div>
              ) : null}
              {props.upstreamRequestId ? (
                <div className='min-w-0'>
                  <dt className='text-muted-foreground'>
                    {t('Upstream request ID')}
                  </dt>
                  <dd className='font-mono'>
                    <CopyableText value={props.upstreamRequestId} />
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <div className='space-y-1'>
            <Label htmlFor={amountId}>
              {t('Amount the API provider actually charged (RMB)')}
            </Label>
            <Input
              id={amountId}
              inputMode='decimal'
              value={amount}
              placeholder={t('Enter 0 if not charged')}
              aria-invalid={tried && !amountValid}
              aria-describedby={
                tried && !amountValid ? `${amountId}-error` : undefined
              }
              onBlur={() => setTried(true)}
              onChange={(event) => setAmount(event.target.value)}
            />
            {tried && !amountValid ? (
              <p
                id={`${amountId}-error`}
                className='text-destructive text-xs'
                role='alert'
              >
                {t(
                  'Enter an amount of at least 0 with at most 4 decimal places.'
                )}
              </p>
            ) : null}
          </div>
          <div className='space-y-1'>
            <Label htmlFor={reasonId}>{t('Reason (optional)')}</Label>
            <Textarea
              id={reasonId}
              value={reason}
              maxLength={REASON_LIMIT}
              aria-describedby={`${reasonId}-help`}
              onChange={(event) => setReason(event.target.value)}
            />
            <div
              id={`${reasonId}-help`}
              className='text-muted-foreground flex justify-end text-xs'
            >
              <span className='tabular-nums'>
                {reason.trim().length} / {REASON_LIMIT}
              </span>
            </div>
          </div>
          {failure ? (
            <p className='text-destructive text-sm' role='alert'>
              {t('Unable to settle the cost. Please try again later.')}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={settle.isPending}
            onClick={(event) => {
              event.preventDefault()
              setTried(true)
              if (!amountValid) {
                document
                  .querySelector<HTMLElement>(`[id="${amountId}"]`)
                  ?.focus()
                return
              }
              if (!reasonValid) return
              settle.mutate()
            }}
          >
            {t(settle.isPending ? 'Submitting…' : 'Confirm settlement')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** "Revoke settlement": voids a manual cost so the call returns to incomplete. */
export function ProviderCostRevocationDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  taskId: string
  providerCostId: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const reasonId = useId()
  const [reason, setReason] = useState('')
  const [conflict, setConflict] = useState(false)
  const [failure, setFailure] = useState(false)
  const revoke = useMutation({
    mutationFn: () =>
      revokeCanvasTaskProviderCostSettlement(
        props.taskId,
        props.providerCostId,
        reason.trim() ? { reason: reason.trim() } : {}
      ),
    onSuccess: async () => {
      props.onOpenChange(false)
      setReason('')
      setConflict(false)
      setFailure(false)
      await refreshCostViews(queryClient, props.taskId)
      toast.success(t('Settlement revoked'))
    },
    onError: async (error) => {
      if (errorStatus(error) === 409) {
        setFailure(false)
        setConflict(true)
        await refreshCostViews(queryClient, props.taskId)
        return
      }
      setFailure(true)
    },
  })
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Revoke settlement')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'The call returns to incomplete cost data. The manual cost is kept as voided and no longer counts as recorded cost.'
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className='space-y-4'>
          {conflict ? (
            <p
              className='border-destructive/35 text-destructive rounded-md border p-3 text-sm'
              role='alert'
            >
              {t('The cost status of this call has changed.')}
            </p>
          ) : null}
          <div className='space-y-1'>
            <Label htmlFor={reasonId}>{t('Reason (optional)')}</Label>
            <Textarea
              id={reasonId}
              value={reason}
              maxLength={REASON_LIMIT}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {failure ? (
            <p className='text-destructive text-sm' role='alert'>
              {t('Unable to revoke the settlement. Please try again later.')}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={revoke.isPending}
            onClick={(event) => {
              event.preventDefault()
              revoke.mutate()
            }}
          >
            {t(revoke.isPending ? 'Submitting…' : 'Revoke settlement')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

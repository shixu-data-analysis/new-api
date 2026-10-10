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
  getAdminAgentWithdrawal,
  getAgentWithdrawal,
  newAdminWithdrawalIdempotencyKey,
  payAgentWithdrawal,
  rejectAgentWithdrawal,
} from '../agent-earnings-api'
import { formatRmbMinor } from '../agent-earnings-format'
import type {
  AdminAgentWithdrawalDetail,
  AgentWithdrawalDetail,
} from '../agent-earnings-types'
import { readAgentImage } from '../agent-withdrawal-image'
import { useRequestIdempotencyKey } from '../use-request-idempotency-key'
import {
  WithdrawalImage,
  WithdrawalImageUploadButton,
  WithdrawalSummaryCard,
} from './AgentWithdrawalParts'

function SheetFrame(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        className={sideDrawerContentClassName('sm:max-w-xl')}
        showCloseButton={false}
      >
        <SheetHeader className={sideDrawerHeaderClassName('relative')}>
          <SheetTitle>{props.title}</SheetTitle>
          <SheetDescription className='sr-only'>{props.title}</SheetDescription>
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
        <div className={sideDrawerFormClassName('gap-4')}>{props.children}</div>
        <SheetFooter
          className={sideDrawerFooterClassName(
            'grid-cols-1 sm:flex sm:justify-end'
          )}
        >
          {props.footer}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/** What a processed request shows: the payment proof, or the reject reason; never the QR code. */
function ViewContent(props: {
  withdrawal: AgentWithdrawalDetail | AdminAgentWithdrawalDetail
  admin: boolean
}) {
  const { t } = useTranslation()
  const withdrawal = props.withdrawal
  if (withdrawal.status === 'PAID') {
    return (
      <div className='grid gap-2'>
        <h3 className='text-sm font-medium'>{t('Payment proof')}</h3>
        {withdrawal.proof ? (
          <WithdrawalImage
            file={withdrawal.proof}
            alt={t('Payment proof')}
            retentionDays={withdrawal.proofRetentionDays}
          />
        ) : (
          <p className='text-muted-foreground text-sm'>
            {t('Expired (deleted after {{days}} days)', {
              days: withdrawal.proofRetentionDays ?? 0,
            })}
          </p>
        )}
      </div>
    )
  }
  if (withdrawal.status === 'REJECTED') {
    return (
      <div className='grid gap-2 text-sm'>
        <h3 className='font-medium'>{t('Reject reason')}</h3>
        <p className='whitespace-pre-wrap'>{withdrawal.rejectReason}</p>
        <p className='text-muted-foreground'>
          {withdrawal.returnedToBalance
            ? t('The amount was returned to the available balance.')
            : t(
                'The agent was restored after this request, so the amount was not returned.'
              )}
        </p>
      </div>
    )
  }
  return (
    <p className='text-muted-foreground text-sm'>
      {props.admin
        ? t('Waiting to be processed.')
        : t('The platform processes requests within 24 hours of submission.')}
    </p>
  )
}

export function AgentWithdrawalViewSheet(props: {
  withdrawalId: string | undefined
  admin: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const detail = useQuery({
    queryKey: [
      ...agentEarningsQueryKeys.all,
      'withdrawal',
      props.admin ? 'admin' : 'agent',
      props.withdrawalId,
    ],
    // Runs only while a request is open (`enabled`).
    queryFn: ({ signal }) =>
      props.admin
        ? getAdminAgentWithdrawal(String(props.withdrawalId), signal)
        : getAgentWithdrawal(String(props.withdrawalId), signal),
    enabled: Boolean(props.withdrawalId),
  })
  return (
    <SheetFrame
      open={Boolean(props.withdrawalId)}
      onOpenChange={props.onOpenChange}
      title={t('Withdrawal request')}
      footer={
        <SheetClose render={<Button type='button' variant='outline' />}>
          {t('Close')}
        </SheetClose>
      }
    >
      {detail.isPending ? <LoadingState /> : null}
      {detail.isError ? (
        <ErrorState onRetry={() => void detail.refetch()} />
      ) : null}
      {detail.data ? (
        <>
          <WithdrawalSummaryCard
            kind='withdrawal'
            withdrawal={detail.data}
            admin={props.admin}
          />
          <ViewContent withdrawal={detail.data} admin={props.admin} />
        </>
      ) : null}
    </SheetFrame>
  )
}

/** The administrator pays against the QR code with a required proof, or switches to reject with a visible reason. */
export function AdminWithdrawalProcessSheet(props: {
  withdrawalId: string | undefined
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const queryClient = useQueryClient()
  const reasonId = useId()
  const proofId = useId()
  const [mode, setMode] = useState<'pay' | 'reject'>('pay')
  const [proof, setProof] = useState<{
    base64: string
    previewUrl: string
  } | null>(null)
  const [proofError, setProofError] = useState<string>()
  const [reason, setReason] = useState('')
  const [reasonTouched, setReasonTouched] = useState(false)
  const payKey = useRequestIdempotencyKey(() =>
    newAdminWithdrawalIdempotencyKey('pay')
  )
  const rejectKey = useRequestIdempotencyKey(() =>
    newAdminWithdrawalIdempotencyKey('reject')
  )
  const detail = useQuery({
    queryKey: [
      ...agentEarningsQueryKeys.all,
      'withdrawal',
      'admin',
      props.withdrawalId,
    ],
    queryFn: ({ signal }) =>
      getAdminAgentWithdrawal(String(props.withdrawalId), signal),
    enabled: Boolean(props.withdrawalId),
  })
  const close = () => {
    setMode('pay')
    setProof(null)
    setProofError(undefined)
    setReason('')
    setReasonTouched(false)
    payKey.reset()
    rejectKey.reset()
    props.onOpenChange(false)
  }
  const finished = async (message: string) => {
    toast.success(message)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: agentEarningsQueryKeys.admin }),
      queryClient.invalidateQueries({ queryKey: agentEarningsQueryKeys.all }),
    ])
    close()
  }
  const failed = (error: unknown) => {
    payKey.settle(error)
    rejectKey.settle(error)
    const code = (error as { response?: { data?: { code?: string } } }).response
      ?.data?.code
    if (code === 'QR_CODE_EXPIRED') {
      toast.error(
        t('The QR code expired and cannot be paid. Reject the request.')
      )
    } else if (code === 'INVALID_STATE_TRANSITION') {
      toast.error(t('This request was already processed.'))
    } else toast.error(t('The request could not be processed. Try again.'))
    void detail.refetch()
  }
  const pay = useMutation({
    mutationFn: (proofImage: string) =>
      payAgentWithdrawal(
        String(props.withdrawalId),
        proofImage,
        payKey.keyFor(`${props.withdrawalId}|${proofImage}`)
      ),
    onSuccess: () => finished(t('Marked as paid')),
    onError: failed,
  })
  const reject = useMutation({
    mutationFn: () =>
      rejectAgentWithdrawal(
        String(props.withdrawalId),
        reason.trim(),
        rejectKey.keyFor(`${props.withdrawalId}|${reason.trim()}`)
      ),
    onSuccess: () => finished(t('Request rejected')),
    onError: failed,
  })
  const busy = pay.isPending || reject.isPending
  const withdrawal = detail.data
  const qrExpired = Boolean(
    withdrawal && (withdrawal.qrExpired || !withdrawal.qr)
  )
  const reasonError =
    reasonTouched && !reason.trim() ? t('Enter a reject reason') : undefined
  let footer: React.ReactNode
  if (mode === 'reject') {
    footer = (
      <>
        <Button
          type='button'
          variant='outline'
          disabled={busy}
          onClick={() => setMode('pay')}
        >
          {t('Back')}
        </Button>
        <Button
          type='button'
          variant='destructive'
          disabled={busy}
          onClick={() => {
            setReasonTouched(true)
            if (reason.trim()) reject.mutate()
          }}
        >
          {t('Confirm rejection')}
        </Button>
      </>
    )
  } else {
    footer = (
      <>
        <Button type='button' variant='outline' disabled={busy} onClick={close}>
          {t('Cancel')}
        </Button>
        <Button
          type='button'
          variant='outline'
          disabled={busy}
          onClick={() => setMode('reject')}
        >
          {t('Reject')}
        </Button>
        <Button
          type='button'
          disabled={busy || qrExpired}
          onClick={() => {
            if (!proof) {
              setProofError(t('Upload the payment proof'))
              return
            }
            pay.mutate(proof.base64)
          }}
        >
          {t('Confirm paid')}
        </Button>
      </>
    )
  }
  return (
    <SheetFrame
      open={Boolean(props.withdrawalId)}
      onOpenChange={(open) => (open ? undefined : close())}
      title={t('Process withdrawal request')}
      footer={footer}
    >
      {detail.isPending ? <LoadingState /> : null}
      {detail.isError ? (
        <ErrorState onRetry={() => void detail.refetch()} />
      ) : null}
      {withdrawal ? (
        <>
          <WithdrawalSummaryCard
            kind='withdrawal'
            withdrawal={withdrawal}
            admin
          />
          {mode === 'pay' ? (
            <>
              {qrExpired ? (
                <p className='text-destructive text-sm'>
                  {t(
                    'The QR code expired and cannot be paid. Reject the request and ask the agent to upload a new QR code and apply again.'
                  )}
                </p>
              ) : (
                <div className='grid gap-2'>
                  <p className='text-sm font-medium tabular-nums'>
                    {t('Pay {{amount}} with this QR code', {
                      amount: formatRmbMinor(withdrawal.netMinor, locale),
                    })}
                  </p>
                  <WithdrawalImage
                    file={withdrawal.qr}
                    alt={t('Payment QR code')}
                    retentionDays={withdrawal.qrRetentionDays}
                    size='large'
                  />
                </div>
              )}
              <div className='grid gap-2'>
                <Label htmlFor={proofId}>
                  {t('Payment proof')}{' '}
                  <span className='text-destructive'>*</span>
                </Label>
                {proof ? (
                  <WithdrawalImage
                    file={null}
                    previewUrl={proof.previewUrl}
                    alt={t('Payment proof')}
                    retentionDays={null}
                  />
                ) : null}
                <WithdrawalImageUploadButton
                  id={proofId}
                  label={t('Upload payment proof')}
                  disabled={qrExpired || busy}
                  invalid={Boolean(proofError)}
                  describedBy={`${proofId}-help ${proofId}-error`}
                  onSelect={async (file) => {
                    const result = await readAgentImage(file)
                    if (!result.ok) {
                      setProof(null)
                      setProofError(
                        result.reason === 'type'
                          ? t('Only JPG, PNG and WEBP images are supported')
                          : t('The image must not exceed 5MB')
                      )
                      return
                    }
                    setProof(result)
                    setProofError(undefined)
                  }}
                />
                <p
                  id={`${proofId}-help`}
                  className='text-muted-foreground text-xs'
                >
                  {t('JPG, PNG or WEBP, up to 5MB per image.')}
                </p>
                {proofError ? (
                  <p
                    id={`${proofId}-error`}
                    className='text-destructive text-sm'
                  >
                    {proofError}
                  </p>
                ) : null}
              </div>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'After confirming, the status becomes "Paid" and the agent can view the payment proof. This cannot be undone.'
                )}
              </p>
            </>
          ) : (
            <div className='grid gap-2'>
              <Label htmlFor={reasonId}>
                {t('Reject reason')} <span className='text-destructive'>*</span>
              </Label>
              <Textarea
                id={reasonId}
                value={reason}
                maxLength={500}
                aria-invalid={Boolean(reasonError)}
                aria-describedby={`${reasonId}-help ${reasonId}-error`}
                onChange={(event) => setReason(event.target.value)}
                onBlur={() => setReasonTouched(true)}
              />
              {reasonError ? (
                <p
                  id={`${reasonId}-error`}
                  className='text-destructive text-sm'
                >
                  {reasonError}
                </p>
              ) : null}
              <p
                id={`${reasonId}-help`}
                className='text-muted-foreground text-sm'
              >
                {t(
                  "After rejection, the amount returns to the agent's available balance. The reason is visible to the agent."
                )}
              </p>
            </div>
          )}
        </>
      ) : null}
    </SheetFrame>
  )
}

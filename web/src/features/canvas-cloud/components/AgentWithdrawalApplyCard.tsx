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

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toIntlLocale } from '@/i18n/languages'

import {
  agentEarningsQueryKeys,
  newWithdrawalIdempotencyKey,
  submitAgentWithdrawal,
} from '../agent-earnings-api'
import {
  formatRmbMinor,
  parseRmbInput,
  rmbMinorToInput,
  withholdingTaxMinor,
} from '../agent-earnings-format'
import type { AgentEarningsSummary } from '../agent-earnings-types'
import { readAgentImage } from '../agent-withdrawal-image'
import { useRequestIdempotencyKey } from '../use-request-idempotency-key'
import {
  WithdrawalImage,
  WithdrawalImageUploadButton,
  WithdrawalSummaryCard,
} from './AgentWithdrawalParts'

type ServerError = {
  response?: { data?: { code?: string; details?: Record<string, string> } }
}

/** "Apply for a withdrawal": amount and QR code, then a confirmation with the large QR code before the request is submitted. */
export function AgentWithdrawalApplyCard(props: {
  summary: AgentEarningsSummary
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const queryClient = useQueryClient()
  const amountId = useId()
  const qrId = useId()
  const [amount, setAmount] = useState('')
  const [touched, setTouched] = useState(false)
  const [qr, setQr] = useState<{ base64: string; previewUrl: string } | null>(
    null
  )
  const [qrError, setQrError] = useState<string>()
  const [confirming, setConfirming] = useState(false)
  const submitKey = useRequestIdempotencyKey(newWithdrawalIdempotencyKey)
  const policy = props.summary.policy
  const balance = BigInt(props.summary.availableMinor)
  const disabled = props.summary.status === 'DISABLED'
  const belowMinimum = balance < BigInt(policy.minWithdrawalMinor)
  const blocked = disabled || belowMinimum
  const previous = props.summary.previousQr
  const reusable =
    previous && !previous.expired && previous.file ? previous : null
  const rmb = (minor: bigint | number | string) => formatRmbMinor(minor, locale)
  const amountMinor = parseRmbInput(amount)
  let amountError: string | undefined
  if (amountMinor === null) {
    amountError = t('Enter a positive number with at most 2 decimals')
  } else if (amountMinor < BigInt(policy.minWithdrawalMinor)) {
    amountError = t(
      'The withdrawal amount cannot be lower than the minimum withdrawal amount {{amount}}',
      { amount: rmb(policy.minWithdrawalMinor) }
    )
  } else if (amountMinor > BigInt(policy.maxWithdrawalMinor)) {
    amountError = t(
      'The withdrawal amount cannot exceed the maximum single withdrawal amount {{amount}}',
      { amount: rmb(policy.maxWithdrawalMinor) }
    )
  } else if (amountMinor > balance) {
    amountError = t(
      'The withdrawal amount cannot exceed the available balance {{amount}}',
      { amount: rmb(balance) }
    )
  }
  const shownAmountError = touched ? amountError : undefined
  const taxMinor =
    amountMinor !== null
      ? withholdingTaxMinor(amountMinor, policy.taxRateBasisPoints)
      : 0n
  const submit = useMutation({
    mutationFn: (minor: bigint) => {
      const request = {
        amount: rmbMinorToInput(minor),
        qrImage: qr?.base64 ?? null,
      }
      return submitAgentWithdrawal(
        request,
        submitKey.keyFor(`${request.amount}|${request.qrImage ?? 'PREVIOUS'}`)
      )
    },
    onSuccess: async () => {
      toast.success(t('Withdrawal request submitted'))
      setAmount('')
      setTouched(false)
      setQr(null)
      setConfirming(false)
      submitKey.settle()
      await queryClient.invalidateQueries({
        queryKey: agentEarningsQueryKeys.all,
      })
    },
    onError: async (error: ServerError) => {
      // An unknown outcome keeps the key, so retrying the same request replays it instead of creating a second one.
      submitKey.settle(error)
      setConfirming(false)
      const data = error.response?.data
      const reason = data?.details?.reason
      if (reason === 'QR_REQUIRED' || reason === 'PREVIOUS_QR_EXPIRED') {
        setQrError(t('Upload a QR code'))
      } else if (reason === 'IMAGE_TYPE_INVALID') {
        setQrError(t('Only JPG, PNG and WEBP images are supported'))
      } else if (reason === 'IMAGE_TOO_LARGE') {
        setQrError(t('The image must not exceed 5MB'))
      } else if (data?.code === 'AGENT_DISABLED') {
        toast.error(
          t('The agent qualification is disabled; withdrawals are unavailable.')
        )
      } else if (reason) {
        toast.error(
          t(
            'The amount no longer passes the withdrawal rules. Check the amount and try again.'
          )
        )
      } else {
        toast.error(
          t('The withdrawal request could not be submitted. Try again.')
        )
      }
      await queryClient.invalidateQueries({
        queryKey: agentEarningsQueryKeys.all,
      })
    },
  })
  const description = disabled
    ? t(
        'Withdrawals are unavailable while the agent qualification is disabled. Restoring the qualification clears the balance that was not withdrawn before the disable.'
      )
    : t(
        'Available balance {{balance}}; each withdrawal can be {{min}} to {{max}}. Requests are processed within 24 hours of submission.',
        {
          balance: rmb(balance),
          min: rmb(policy.minWithdrawalMinor),
          max: rmb(policy.maxWithdrawalMinor),
        }
      )
  const preview = qr?.previewUrl
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Apply for a withdrawal')}</CardTitle>
        <CardDescription className='tabular-nums'>
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-4'>
        <div className='grid gap-1.5'>
          <Label htmlFor={amountId}>
            {t('Withdrawal amount (CNY)')}{' '}
            <span className='text-destructive'>*</span>
          </Label>
          <Input
            id={amountId}
            className='w-full max-w-[16rem] tabular-nums'
            inputMode='decimal'
            autoComplete='off'
            value={amount}
            disabled={blocked || submit.isPending}
            aria-invalid={Boolean(shownAmountError)}
            aria-describedby={`${amountId}-error ${amountId}-net`}
            onChange={(event) => setAmount(event.target.value)}
            onBlur={() => setTouched(true)}
          />
          {shownAmountError ? (
            <p id={`${amountId}-error`} className='text-destructive text-sm'>
              {shownAmountError}
            </p>
          ) : null}
          {!amountError && amountMinor !== null ? (
            <p
              id={`${amountId}-net`}
              className='text-muted-foreground text-sm tabular-nums'
              aria-live='polite'
            >
              {t('Withholding tax {{tax}} · Net payment {{net}}', {
                tax: rmb(taxMinor),
                net: rmb(amountMinor - taxMinor),
              })}
            </p>
          ) : null}
        </div>
        <div className='grid gap-1.5'>
          <Label htmlFor={qrId}>
            {t('Payment QR code')} <span className='text-destructive'>*</span>
          </Label>
          {preview || reusable ? (
            <div className='flex items-end gap-3'>
              <WithdrawalImage
                file={reusable?.file ?? null}
                {...(preview ? { previewUrl: preview } : {})}
                alt={t('Payment QR code')}
                retentionDays={
                  preview ? null : (reusable?.retentionDays ?? null)
                }
              />
              <span className='text-muted-foreground text-sm'>
                {preview
                  ? t('QR code uploaded this time')
                  : t('QR code used last time')}
              </span>
            </div>
          ) : null}
          {previous && !reusable && !preview ? (
            <p className='text-muted-foreground text-sm'>
              {t(
                'The QR code used last time expired (kept for {{days}} days). Upload a new one.',
                { days: previous.retentionDays }
              )}
            </p>
          ) : null}
          <WithdrawalImageUploadButton
            id={qrId}
            label={
              preview || reusable ? t('Change QR code') : t('Upload QR code')
            }
            disabled={blocked || submit.isPending}
            invalid={Boolean(qrError)}
            describedBy={`${qrId}-help ${qrId}-error`}
            onSelect={async (file) => {
              const result = await readAgentImage(file)
              if (!result.ok) {
                setQr(null)
                setQrError(
                  result.reason === 'type'
                    ? t('Only JPG, PNG and WEBP images are supported')
                    : t('The image must not exceed 5MB')
                )
                return
              }
              setQr(result)
              setQrError(undefined)
            }}
          />
          <p id={`${qrId}-help`} className='text-muted-foreground text-xs'>
            {t('JPG, PNG or WEBP, up to 5MB per image.')}
          </p>
          {qrError ? (
            <p id={`${qrId}-error`} className='text-destructive text-sm'>
              {qrError}
            </p>
          ) : null}
        </div>
        <div className='grid gap-1.5'>
          <Button
            type='button'
            className='w-fit'
            disabled={blocked || submit.isPending}
            onClick={() => {
              setTouched(true)
              if (!qr && !reusable) setQrError(t('Upload a QR code'))
              if (amountError || (!qr && !reusable)) return
              setConfirming(true)
            }}
          >
            {t('Apply for withdrawal')}
          </Button>
          {belowMinimum && !disabled ? (
            <p className='text-muted-foreground text-sm'>
              {t(
                'The available balance is below the minimum withdrawal amount {{amount}}; withdrawals are unavailable for now.',
                { amount: rmb(policy.minWithdrawalMinor) }
              )}
            </p>
          ) : null}
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) =>
          submit.isPending ? undefined : setConfirming(open)
        }
        title={t('Confirm withdrawal request')}
        desc={t(
          'Make sure the QR code is correct; the administrator pays with this QR code.'
        )}
        cancelBtnText={t('Back to edit')}
        confirmText={t('Confirm and submit')}
        isLoading={submit.isPending}
        handleConfirm={() => {
          if (amountMinor !== null) submit.mutate(amountMinor)
        }}
      >
        {amountMinor !== null ? (
          <div className='grid gap-3'>
            <WithdrawalSummaryCard
              kind='confirmation'
              amountMinor={amountMinor.toString()}
              taxMinor={taxMinor.toString()}
              netMinor={(amountMinor - taxMinor).toString()}
              taxRateBasisPoints={policy.taxRateBasisPoints}
              balanceBeforeMinor={balance.toString()}
              balanceAfterMinor={(balance - amountMinor).toString()}
            />
            <WithdrawalImage
              file={reusable?.file ?? null}
              {...(preview ? { previewUrl: preview } : {})}
              alt={t('Payment QR code')}
              retentionDays={null}
              size='large'
            />
            <p className='text-muted-foreground text-sm'>
              {t(
                'A request cannot be withdrawn after submission. The platform processes it within 24 hours.'
              )}
            </p>
          </div>
        ) : null}
      </ConfirmDialog>
    </Card>
  )
}

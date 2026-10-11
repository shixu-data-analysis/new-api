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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'

import {
  agentEarningsQueryKeys,
  newPaymentQrIdempotencyKey,
  replaceAgentPaymentQr,
} from '../agent-earnings-api'
import { formatBeijingDateTime } from '../agent-earnings-format'
import type { AgentPaymentQr } from '../agent-earnings-types'
import { readAgentImage } from '../agent-withdrawal-image'
import { useRequestIdempotencyKey } from '../use-request-idempotency-key'
import {
  WithdrawalImage,
  WithdrawalImageUploadButton,
} from './AgentWithdrawalParts'

type ServerError = {
  response?: { data?: { details?: Record<string, string> } }
}

/**
 * The agent's one payment QR code, kept apart from the withdrawal form: it can be uploaded or replaced whether or not a
 * withdrawal is possible, is saved as soon as an image is chosen, and moves every requested withdrawal to the new code.
 */
export function AgentPaymentQrCard(props: {
  paymentQr: AgentPaymentQr | null
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const queryClient = useQueryClient()
  const qrId = useId()
  const [qrError, setQrError] = useState<string>()
  const qrKey = useRequestIdempotencyKey(newPaymentQrIdempotencyKey)
  const current = props.paymentQr
  const saveQr = useMutation({
    mutationFn: (image: string) =>
      replaceAgentPaymentQr(image, qrKey.keyFor(image)),
    onSuccess: async (result) => {
      toast.success(
        result.pendingWithdrawalCount > 0
          ? t(
              'Payment QR code replaced; {{count}} pending requests will be paid to the new code.',
              { count: result.pendingWithdrawalCount }
            )
          : t('Payment QR code saved')
      )
      setQrError(undefined)
      qrKey.settle()
      await queryClient.invalidateQueries({
        queryKey: agentEarningsQueryKeys.all,
      })
    },
    onError: (error: ServerError) => {
      // An unknown outcome keeps the key, so saving the same image again replays it.
      qrKey.settle(error)
      const reason = error.response?.data?.details?.reason
      if (reason === 'IMAGE_TYPE_INVALID') {
        setQrError(t('Only JPG, PNG and WEBP images are supported'))
      } else if (reason === 'IMAGE_TOO_LARGE') {
        setQrError(t('The image must not exceed 5MB'))
      } else {
        toast.error(t('The payment QR code could not be saved. Try again.'))
      }
    },
  })
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Payment QR code')}</CardTitle>
        <CardDescription>
          {t(
            'Every withdrawal request is paid to this code, including pending ones.'
          )}
        </CardDescription>
      </CardHeader>
      {/* Thumbnail on the left; upload time, the action and the format note stacked on the right. */}
      <CardContent className='flex items-start gap-4'>
        {current ? (
          <WithdrawalImage
            file={current}
            alt={t('Payment QR code')}
            retentionDays={null}
          />
        ) : null}
        <div className='grid min-w-0 justify-items-start gap-2'>
          {current ? (
            <span className='text-muted-foreground text-sm tabular-nums'>
              {t('Uploaded {{time}} (Beijing time)', {
                time: formatBeijingDateTime(current.uploadedAt, locale),
              })}
            </span>
          ) : null}
          <WithdrawalImageUploadButton
            id={qrId}
            label={current ? t('Change QR code') : t('Upload QR code')}
            disabled={saveQr.isPending}
            invalid={Boolean(qrError)}
            describedBy={`${qrId}-help ${qrId}-error`}
            onSelect={async (file) => {
              const result = await readAgentImage(file)
              if (!result.ok) {
                setQrError(
                  result.reason === 'type'
                    ? t('Only JPG, PNG and WEBP images are supported')
                    : t('The image must not exceed 5MB')
                )
                return
              }
              setQrError(undefined)
              saveQr.mutate(result.base64)
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
      </CardContent>
    </Card>
  )
}

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
import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import {
  formatBasisPointsPercent,
  formatBeijingDateTime,
  formatRmbMinor,
  withdrawalStatusLabelKey,
} from '../agent-earnings-format'
import type {
  AdminAgentWithdrawal,
  AgentWithdrawal,
  AgentWithdrawalFile,
  AgentWithdrawalStatus,
} from '../agent-earnings-types'
import {
  AGENT_IMAGE_ACCEPT,
  useWithdrawalImageUrl,
} from '../agent-withdrawal-image'
import { CanvasStatusBadge } from './CanvasStatusBadge'

export function WithdrawalStatus(props: {
  status: AgentWithdrawalStatus
  overdue?: boolean
}) {
  const { t } = useTranslation()
  return (
    <span className='inline-flex flex-wrap items-center gap-1'>
      <CanvasStatusBadge
        status={props.status}
        label={t(withdrawalStatusLabelKey(props.status))}
      />
      {props.overdue ? (
        <Badge variant='destructive'>{t('Overdue')}</Badge>
      ) : null}
    </span>
  )
}

/** "Withdraw ¥X · Withholding tax ¥Y (10%)"; the rate is shown only when it is not zero. */
export function WithdrawalAmountLine(props: {
  amountMinor: string
  taxMinor: string
  taxRateBasisPoints: number
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const tax = formatRmbMinor(props.taxMinor, locale)
  return (
    <span className='tabular-nums'>
      {t('Withdraw {{amount}}', {
        amount: formatRmbMinor(props.amountMinor, locale),
      })}{' '}
      ·{' '}
      {props.taxRateBasisPoints > 0
        ? t('Withholding tax {{tax}} ({{rate}})', {
            tax,
            rate: formatBasisPointsPercent(props.taxRateBasisPoints),
          })
        : t('Withholding tax {{tax}}', { tax })}
    </span>
  )
}

/** The summary card every withdrawal view starts with; the confirmation before submitting shows the balance change instead. */
export function WithdrawalSummaryCard(
  props:
    | {
        kind: 'withdrawal'
        withdrawal: AgentWithdrawal | AdminAgentWithdrawal
        admin?: boolean
      }
    | {
        kind: 'confirmation'
        amountMinor: string
        taxMinor: string
        netMinor: string
        taxRateBasisPoints: number
        balanceBeforeMinor: string
        balanceAfterMinor: string
      }
) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const values = props.kind === 'withdrawal' ? props.withdrawal : props
  let timeline: React.ReactNode = null
  if (props.kind === 'withdrawal') {
    const requested = t('{{time}} submitted', {
      time: formatBeijingDateTime(props.withdrawal.requestedAt, locale),
    })
    const processed = props.withdrawal.processedAt
      ? t(
          props.withdrawal.status === 'PAID'
            ? '{{time}} paid'
            : '{{time}} rejected',
          { time: formatBeijingDateTime(props.withdrawal.processedAt, locale) }
        )
      : null
    timeline = `${requested}${processed ? ` → ${processed}` : ''} ${t('(Beijing time)')}`
  }
  const adminRow =
    props.kind === 'withdrawal' && props.admin
      ? (props.withdrawal as AdminAgentWithdrawal)
      : null
  return (
    <div className='bg-muted/30 grid gap-2 rounded-lg border p-4 text-sm'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          {props.kind === 'withdrawal' ? (
            <WithdrawalStatus
              status={props.withdrawal.status}
              overdue={adminRow?.overdue}
            />
          ) : (
            <span className='tabular-nums'>
              {t('Available balance {{before}} → {{after}}', {
                before: formatRmbMinor(props.balanceBeforeMinor, locale),
                after: formatRmbMinor(props.balanceAfterMinor, locale),
              })}
            </span>
          )}
        </div>
        <div className='text-right'>
          <p className='text-muted-foreground text-xs'>{t('Net payment')}</p>
          <p className='text-lg font-semibold tabular-nums'>
            {formatRmbMinor(values.netMinor, locale)}
          </p>
        </div>
      </div>
      <WithdrawalAmountLine
        amountMinor={values.amountMinor}
        taxMinor={values.taxMinor}
        taxRateBasisPoints={values.taxRateBasisPoints}
      />
      {props.kind === 'withdrawal' && props.withdrawal.fullBalance ? (
        <p className='text-muted-foreground'>
          {t(
            'Whole-balance withdrawal while disabled; single withdrawal limits do not apply.'
          )}
        </p>
      ) : null}
      {timeline ? (
        <p className='text-muted-foreground tabular-nums'>{timeline}</p>
      ) : null}
      {adminRow ? (
        <p className='text-muted-foreground'>
          {adminRow.agentUsername ?? '—'}
          {adminRow.processedByUsername
            ? ` · ${adminRow.processedByUsername}`
            : ''}
        </p>
      ) : null}
    </div>
  )
}

/** A visible upload button for one withdrawal image; the native file input stays hidden behind it. */
export function WithdrawalImageUploadButton(props: {
  id: string
  label: string
  disabled: boolean
  invalid: boolean
  describedBy: string
  onSelect: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <Button
        type='button'
        variant='outline'
        size='sm'
        className='w-fit'
        disabled={props.disabled}
        aria-invalid={props.invalid}
        aria-describedby={props.describedBy}
        onClick={() => input.current?.click()}
      >
        <Upload aria-hidden='true' />
        {props.label}
      </Button>
      {/* The field label points at the input, so clicking it opens the picker; the button keeps its own name. */}
      <input
        ref={input}
        id={props.id}
        type='file'
        accept={AGENT_IMAGE_ACCEPT}
        className='hidden'
        tabIndex={-1}
        aria-label={props.label}
        disabled={props.disabled}
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Clearing the value lets the same file be picked again after an error.
          event.target.value = ''
          if (file) props.onSelect(file)
        }}
      />
    </>
  )
}

/** A thumbnail that opens the large image. `retentionDays` is a payment proof's frozen retention; null shows none. */
export function WithdrawalImage(props: {
  file: AgentWithdrawalFile | null
  previewUrl?: string
  alt: string
  retentionDays: number | null
  size?: 'thumbnail' | 'large'
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const image = useWithdrawalImageUrl(props.previewUrl ? null : props.file)
  const url = props.previewUrl ?? image.url
  if (!props.previewUrl && !props.file) {
    return <span className='text-muted-foreground'>{t('Expired')}</span>
  }
  if (!url) {
    if (image.isError) {
      return (
        <span className='text-muted-foreground'>
          {t('Failed to load image')}
        </span>
      )
    }
    return (
      <Skeleton
        className={props.size === 'large' ? 'h-64 w-64' : 'h-20 w-20'}
      />
    )
  }
  return (
    <>
      <button
        type='button'
        className='grid w-fit gap-1 text-start'
        onClick={() => setOpen(true)}
      >
        <img
          src={url}
          alt={props.alt}
          className={cn(
            'rounded border object-contain',
            props.size === 'large' ? 'max-h-72 w-64' : 'h-20 w-20'
          )}
        />
        <span className='text-muted-foreground text-xs'>
          {t('Click to enlarge')}
        </span>
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={props.alt}
        contentClassName='sm:max-w-2xl'
        contentHeight='auto'
      >
        <div className='grid gap-3'>
          <img
            src={url}
            alt={props.alt}
            className='max-h-[70vh] w-full rounded border object-contain'
          />
          {props.retentionDays !== null ? (
            <p className='text-muted-foreground text-sm'>
              {t(
                'Kept for {{days}} days after upload, then deleted automatically.',
                { days: props.retentionDays }
              )}
            </p>
          ) : null}
        </div>
      </Dialog>
    </>
  )
}

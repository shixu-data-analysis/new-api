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
import { AlarmClock, CircleCheck, Clock, ExternalLink } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'

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

import { formatCanvasDateTimeMinutes } from '../formatters'
import type {
  CanvasCustomerPointSummary,
  CanvasRechargeCodeRedemptionResult,
} from '../types'

interface RechargeCodeCardProps {
  code: string
  onCodeChange: (value: string) => void
  onRedeem: () => void
  purchaseUrl: string | null
  redeeming: boolean
  error?: string | null
  summary?: CanvasCustomerPointSummary
  redemption?: CanvasRechargeCodeRedemptionResult | null
  onViewLots: () => void
}

const emphasis = {
  b: <b className='text-foreground font-semibold' />,
}

// A 0-yuan code issues only bonus points, so its message names no paid points.
function redemptionMessageKey(redemption: {
  purchasedPoints: string
  bonusPoints: string
}) {
  if (redemption.purchasedPoints === '0') {
    return '<ok>Redeemed successfully</ok>: <b>{{bonus}}</b> bonus points <b>{{bonusExpiry}}</b> have been credited.'
  }
  if (redemption.bonusPoints === '0') {
    return '<ok>Redeemed successfully</ok>: <b>{{paid}}</b> paid points <b>{{paidExpiry}}</b> have been credited.'
  }
  return '<ok>Redeemed successfully</ok>: <b>{{paid}}</b> paid points <b>{{paidExpiry}}</b> and <b>{{bonus}}</b> bonus points <b>{{bonusExpiry}}</b> have been credited.'
}

export function RechargeCodeCard(props: RechargeCodeCardProps) {
  const { t, i18n } = useTranslation()
  const externalPurchase =
    props.purchaseUrl !== null && !props.purchaseUrl.startsWith('/')
  const formatPoints = (value: string) =>
    new Intl.NumberFormat(toIntlLocale(i18n.language)).format(BigInt(value))
  const expiringSoonPoints = props.summary?.expiringSoonPoints ?? '0'
  const lotExpiry = (type: 'PAID' | 'BONUS') => {
    const expiresAt = props.redemption?.issuedLots.find(
      (lot) => lot.type === type
    )?.expiresAt
    if (!expiresAt) return ''
    return t('(expires {{date}})', {
      date: formatCanvasDateTimeMinutes(expiresAt),
      interpolation: { escapeValue: false },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Redeem recharge code')}</CardTitle>
        <CardDescription>
          {t('Points are issued only after a valid code is redeemed.')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {BigInt(expiringSoonPoints) > 0n ? (
          <p
            role='status'
            className='border-destructive/35 bg-destructive/5 text-muted-foreground flex flex-wrap items-start gap-x-2 gap-y-1.5 rounded-lg border px-3 py-2.5 text-sm'
          >
            <AlarmClock
              className='text-destructive mt-0.5 size-4 shrink-0'
              aria-hidden='true'
            />
            <span className='min-w-0 flex-[1_1_260px]'>
              <Trans
                i18nKey='<b>{{points}} points will expire within 30 days</b>. Please use them soon.'
                values={{ points: formatPoints(expiringSoonPoints) }}
                components={emphasis}
              />
            </span>
            <button
              type='button'
              className='text-destructive font-semibold whitespace-nowrap hover:underline'
              onClick={props.onViewLots}
            >
              {t('View point lots')}
            </button>
          </p>
        ) : null}
        <div>
          <div className='mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1'>
            <Label htmlFor='canvas-recharge-code'>{t('Recharge code')}</Label>
            {props.purchaseUrl ? (
              <a
                className='inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:underline dark:text-amber-400'
                href={props.purchaseUrl}
                target={externalPurchase ? '_blank' : undefined}
                rel={externalPurchase ? 'noopener noreferrer' : undefined}
              >
                <span>{t('No recharge code? Purchase one')}</span>
                <ExternalLink className='size-3.5' aria-hidden='true' />
              </a>
            ) : null}
          </div>
          <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]'>
            <Input
              id='canvas-recharge-code'
              value={props.code}
              autoComplete='off'
              spellCheck={false}
              onChange={(event) => props.onCodeChange(event.target.value)}
              aria-invalid={Boolean(props.error)}
              aria-describedby={
                props.error ? 'canvas-recharge-code-error' : undefined
              }
            />
            <Button
              disabled={
                props.code.trim().length < 8 ||
                props.code.trim().length > 191 ||
                props.redeeming
              }
              onClick={props.onRedeem}
            >
              {t('Redeem')}
            </Button>
          </div>
          {props.error ? (
            <p
              id='canvas-recharge-code-error'
              className='text-destructive mt-2 text-sm'
            >
              {props.error}
            </p>
          ) : null}
          {/* One line under the field: the validity rule, replaced by the result after a redemption. */}
          {props.redemption ? (
            <p
              role='status'
              className='text-muted-foreground mt-2.5 flex items-start gap-2 text-sm tabular-nums'
            >
              <CircleCheck
                className='mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400'
                aria-hidden='true'
              />
              <span>
                <Trans
                  i18nKey={redemptionMessageKey(props.redemption)}
                  tOptions={{ interpolation: { escapeValue: false } }}
                  values={{
                    paid: formatPoints(props.redemption.purchasedPoints),
                    paidExpiry: lotExpiry('PAID'),
                    bonus: formatPoints(props.redemption.bonusPoints),
                    bonusExpiry: lotExpiry('BONUS'),
                  }}
                  components={{
                    ...emphasis,
                    ok: (
                      <b className='font-semibold text-green-700 dark:text-green-400' />
                    ),
                  }}
                />
              </span>
            </p>
          ) : (
            <p className='text-muted-foreground mt-2.5 flex items-start gap-2 text-sm'>
              <Clock
                className='mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-400'
                aria-hidden='true'
              />
              <span>
                {props.summary ? (
                  <Trans
                    i18nKey='Paid points are <b>valid for {{days}} days</b> after redemption; any unused part expires automatically. Each recharge code can be used only once.'
                    values={{ days: props.summary.paidExpiryDays }}
                    components={{
                      b: (
                        <b className='font-semibold text-amber-700 dark:text-amber-400' />
                      ),
                    }}
                  />
                ) : (
                  t(
                    'Each recharge code can be used only once. Check it before redeeming.'
                  )
                )}
              </span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

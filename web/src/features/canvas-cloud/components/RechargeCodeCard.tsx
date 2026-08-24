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
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface RechargeCodeCardProps {
  code: string
  onCodeChange: (value: string) => void
  onRedeem: () => void
  purchaseUrl: string | null
  redeeming: boolean
}

export function RechargeCodeCard(props: RechargeCodeCardProps) {
  const { t } = useTranslation()
  const externalPurchase =
    props.purchaseUrl !== null && !props.purchaseUrl.startsWith('/')

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Redeem recharge code')}</CardTitle>
        <CardDescription>
          {t('Points are issued only after a valid code is redeemed.')}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {props.purchaseUrl && (
          <div className='bg-muted/50 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='space-y-1'>
              <p className='text-sm font-medium'>
                {t('Need a recharge code?')}
              </p>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Purchase a one-time code from the configured store, then return here to redeem it.'
                )}
              </p>
            </div>
            <a
              className={buttonVariants({
                variant: 'outline',
                className: 'shrink-0',
              })}
              href={props.purchaseUrl}
              target={externalPurchase ? '_blank' : undefined}
              rel={externalPurchase ? 'noopener noreferrer' : undefined}
            >
              <span>{t('Purchase recharge code')}</span>
              <ExternalLink className='size-4' aria-hidden='true' />
            </a>
          </div>
        )}
        <div className='space-y-2'>
          <Label htmlFor='canvas-recharge-code'>{t('Recharge code')}</Label>
          <div className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]'>
            <Input
              id='canvas-recharge-code'
              value={props.code}
              autoComplete='off'
              spellCheck={false}
              onChange={(event) => props.onCodeChange(event.target.value)}
            />
            <Button
              disabled={props.code.trim().length < 8 || props.redeeming}
              onClick={props.onRedeem}
            >
              {t('Redeem')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

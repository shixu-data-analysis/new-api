/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program.
If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { pointsUnitKey } from '../lib/billing-unit-labels'
import { tokenRateSummary } from '../lib/token-rate-summary'
import type {
  CanvasBillingUnit,
  CanvasCatalogModelBadge,
  CanvasTokenRateVector,
} from '../types'
import { ModelBadges } from './ModelBadges'
import { ModelIconTile } from './ModelIconTile'

/** One model as the model center shows it; the agent's current model prices reuse it. */
export function ModelCatalogCard(props: {
  name: string
  capability: unknown
  iconKey: string | null
  iconColor: string | null
  badges: CanvasCatalogModelBadge[]
  tags: Array<{ id: string; name: string }>
  description?: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Card className='ring-foreground/15 hover:ring-primary/55 shadow-xs transition-shadow motion-reduce:transition-none'>
      <CardHeader className='grid-cols-[auto_minmax(0,1fr)] gap-x-3'>
        <ModelIconTile
          iconKey={props.iconKey}
          iconColor={props.iconColor}
          capability={props.capability}
          className='row-span-2'
        />
        <CardTitle className='flex min-w-0 flex-wrap items-center gap-1.5 break-words'>
          <span className='min-w-0 break-words'>{props.name}</span>
          <ModelBadges badges={props.badges} />
        </CardTitle>
        <CardDescription className='flex min-w-0 flex-wrap items-center gap-1.5'>
          <span>
            {props.capability ? t(String(props.capability)) : t('Canvas model')}
          </span>
          {props.tags.map((tag) => (
            <Badge key={tag.id} variant='secondary'>
              {tag.name}
            </Badge>
          ))}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-2'>
        {props.children}
        {props.description?.trim() && (
          <p className='text-muted-foreground text-[13px] break-words whitespace-pre-wrap'>
            {props.description}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * One specification's price: its parameters on the left, the customer points and unit on the right. `extra` follows the
 * points on the same line; `below` sits under them, for figures too long for one line.
 */
export function ModelPriceRow(props: {
  parameters: Record<string, unknown>
  billingUnit: CanvasBillingUnit
  points: string
  tokenRates: Partial<CanvasTokenRateVector> | null
  extra?: ReactNode
  below?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className='bg-muted flex items-center justify-between gap-2 rounded-lg border px-3 py-2'>
      <span className='truncate font-medium'>
        {Object.values(props.parameters).join(' · ') || t('Default')}
      </span>
      <span className='flex shrink-0 flex-col items-end tabular-nums'>
        <span>
          <span className='text-[15px] font-bold'>
            {props.billingUnit === 'MILLION_TOKENS' && props.tokenRates
              ? tokenRateSummary(props.tokenRates, t)
              : props.points}
          </span>
          <span className='text-muted-foreground ms-1 text-xs'>
            {t(pointsUnitKey(props.billingUnit))}
          </span>
          {props.extra}
        </span>
        {props.below}
      </span>
    </div>
  )
}

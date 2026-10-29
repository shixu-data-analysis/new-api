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

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

import { pointsUnitKey } from '../lib/billing-unit-labels'
import {
  tokenCategoryLabel,
  tokenCategoryLabelKey,
} from '../lib/token-rate-summary'
import type {
  CanvasBillingUnit,
  CanvasCatalogModelBadge,
  CanvasTokenCategory,
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
  description?: string
  /** False while the administrator hides model icons; the header then has no icon column. */
  showIcon: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Card className='ring-foreground/15 hover:ring-primary/55 shadow-xs transition-shadow motion-reduce:transition-none'>
      <CardHeader
        className={cn(
          'gap-x-3',
          props.showIcon
            ? 'grid-cols-[auto_minmax(0,1fr)]'
            : 'grid-cols-[minmax(0,1fr)]'
        )}
      >
        {props.showIcon && (
          <ModelIconTile
            iconKey={props.iconKey}
            iconColor={props.iconColor}
            capability={props.capability}
            className='row-span-2'
          />
        )}
        <CardTitle className='flex min-w-0 flex-wrap items-center gap-1.5 break-words'>
          <span className='min-w-0 break-words'>{props.name}</span>
          <ModelBadges badges={props.badges} />
        </CardTitle>
        <CardDescription className='flex min-w-0 flex-wrap items-center gap-1.5'>
          <span>
            {props.capability ? t(String(props.capability)) : t('Canvas model')}
          </span>
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
 * points on the same line; `below` sits under them, for figures too long for one line. A Token price lists one category
 * per line in one block, like the rows of other specifications; a single default spec is not named.
 */
export function ModelPriceRow(props: {
  parameters: Record<string, unknown>
  billingUnit: CanvasBillingUnit
  points: string
  tokenRates: Partial<CanvasTokenRateVector> | null
  extra?: ReactNode
  below?: ReactNode
  /** After a Token category's points, such as the agent's model price of that category. */
  categoryExtra?: (category: CanvasTokenCategory) => ReactNode
  /** Categories to list although the customer rates lack them (the agent's model price has them). */
  categories?: CanvasTokenCategory[]
}) {
  const { t } = useTranslation()
  const name = Object.values(props.parameters).join(' · ')
  if (props.billingUnit === 'MILLION_TOKENS' && props.tokenRates) {
    const rates = props.tokenRates
    const listed = props.categories ?? []
    // Every category priced on either side keeps its line; a side without it shows a dash.
    const categories = (
      Object.keys(tokenCategoryLabel) as CanvasTokenCategory[]
    ).filter(
      (category) =>
        typeof rates[category] === 'string' || listed.includes(category)
    )
    return (
      <div className='bg-muted grid gap-1 rounded-lg border px-3 py-2'>
        {name ? (
          <span className='text-muted-foreground text-xs'>{name}</span>
        ) : null}
        {categories.map((category) => (
          <div
            key={category}
            className='flex items-baseline justify-between gap-3'
          >
            <span className='font-medium'>
              {t(tokenCategoryLabelKey(category, categories))}
            </span>
            <span className='tabular-nums'>
              <span className='text-[15px] font-bold'>
                {rates[category] ?? '—'}
              </span>
              <span className='text-muted-foreground ms-1 text-xs'>
                {t(pointsUnitKey(props.billingUnit))}
              </span>
              {props.categoryExtra?.(category)}
            </span>
          </div>
        ))}
        {props.extra ? (
          <div className='text-right tabular-nums'>{props.extra}</div>
        ) : null}
      </div>
    )
  }
  return (
    <div className='bg-muted flex items-center justify-between gap-2 rounded-lg border px-3 py-2'>
      <span className='truncate font-medium'>{name || t('Default')}</span>
      <span className='flex shrink-0 flex-col items-end tabular-nums'>
        <span>
          <span className='text-[15px] font-bold'>{props.points}</span>
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

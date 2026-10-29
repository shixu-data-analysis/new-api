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
import type { ReactNode } from 'react'

import { oneTokenPrice } from '../lib/one-token-price'
import {
  ratesAtMultiplier,
  sharedTimeOfDaySchedule,
  timeOfDayNowState,
} from '../lib/time-of-day-display'
import type {
  CanvasBillingUnit,
  CanvasTimeOfDaySchedule,
  CanvasTokenCategory,
  CanvasTokenRateVector,
} from '../types'
import { ModelPriceRow } from './ModelCatalogCard'
import { TimeOfDayPricing } from './TimeOfDayPricing'

export interface ModelCardPrice {
  key: string
  parameters: Record<string, unknown>
  billingUnit: CanvasBillingUnit
  points: string
  tokenRates: Partial<CanvasTokenRateVector> | null
  timeOfDaySchedule?: CanvasTimeOfDaySchedule
  extra?: ReactNode
  below?: ReactNode
  categories?: CanvasTokenCategory[]
  /** Given the multiplier now, after a category's points (the agent's model price of that category). */
  categoryExtra?: (
    category: CanvasTokenCategory,
    multiplier: string
  ) => ReactNode
  /** What else must agree for specs to share one price block (the agent's model price). */
  priceIdentity?: string
}

/**
 * A card's price rows at the multiplier in force now, with "分时段计价" under them: once when every spec shares the
 * schedule, otherwise under each spec that has one.
 */
export function ModelCardPrices(props: {
  prices: ModelCardPrice[]
  /** The model's generation type: only an image has one Token price for the whole model (IMAGE-TOKEN-BILLING-001). */
  capability: string | undefined
  now: Date
  /** False when the card shows the schedule once itself (the agent card, under every plan). */
  showSchedule?: boolean
}) {
  // A video's resolutions keep their rows even at equal rates (VIDEO-TOKEN-BILLING-001).
  const prices =
    props.capability === 'image.generate'
      ? oneTokenPrice(props.prices)
      : props.prices
  const showSchedule = props.showSchedule ?? true
  const shared = showSchedule ? sharedTimeOfDaySchedule(prices) : null
  return (
    <>
      {prices.map((price) => {
        const multiplier = price.timeOfDaySchedule
          ? timeOfDayNowState(price.timeOfDaySchedule, props.now).multiplier
          : '1'
        return (
          <div key={price.key} className='space-y-2'>
            <ModelPriceRow
              parameters={price.parameters}
              billingUnit={price.billingUnit}
              points={price.points}
              tokenRates={
                price.tokenRates
                  ? ratesAtMultiplier(price.tokenRates, multiplier)
                  : null
              }
              extra={price.extra}
              below={price.below}
              categories={price.categories}
              categoryExtra={
                price.categoryExtra
                  ? (category) => price.categoryExtra?.(category, multiplier)
                  : undefined
              }
            />
            {showSchedule && price.timeOfDaySchedule && !shared ? (
              <TimeOfDayPricing
                schedule={price.timeOfDaySchedule}
                now={props.now}
              />
            ) : null}
          </div>
        )
      })}
      {shared ? <TimeOfDayPricing schedule={shared} now={props.now} /> : null}
    </>
  )
}

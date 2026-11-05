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
import { useTranslation } from 'react-i18next'

import { pointsUnitKey } from '../lib/billing-unit-labels'
import { oneTokenPrice } from '../lib/one-token-price'
import {
  ratesAtMultiplier,
  sharedTimeOfDaySchedule,
  timeOfDayNowState,
} from '../lib/time-of-day-display'
import type {
  CanvasBillingUnit,
  CanvasInputSurcharge,
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
  /** INPUT-ASSET-BILLING-001: the reference-material surcharge in force, and the price's own while a special discounts it. */
  inputSurcharge?: CanvasInputSurcharge
  baseInputSurcharge?: CanvasInputSurcharge
  /** After a surcharge item's points ('video', 'video:<tier>' or 'image'): the agent's model price of that item. */
  surchargeExtra?: (item: string) => ReactNode
  /** What else must agree for specs to share the tier and image blocks (the agent's model price of those items). */
  surchargeIdentity?: string
  /** The price's own points while a limited-time special lowers them. */
  basePoints?: string
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
  const surcharge = sharedSurcharge(prices)
  return (
    <>
      {prices.map((price) => {
        const ownSurcharge =
          !surcharge && price.inputSurcharge ? (
            <SurchargeBlocks price={price} spec={specName(price)} />
          ) : null
        if (price.inputSurcharge?.video?.basis === 'OUTPUT_QUALITY') {
          return (
            <div key={price.key} className='space-y-2'>
              <ReferenceVideoSpecBlock price={price} />
              {ownSurcharge}
            </div>
          )
        }
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
            {ownSurcharge}
          </div>
        )
      })}
      {shared ? <TimeOfDayPricing schedule={shared} now={props.now} /> : null}
      {surcharge ? <SurchargeBlocks price={surcharge} /> : null}
    </>
  )
}

const specName = (price: ModelCardPrice) =>
  Object.values(price.parameters).join(' · ')

// The tier and image items of a surcharge, which every spec of a model prices alike.
const sharedSurchargeItems = (surcharge: CanvasInputSurcharge | undefined) => ({
  video: surcharge?.video?.basis === 'INPUT_TIER' ? surcharge.video : null,
  image: surcharge?.image ?? null,
})

/**
 * Tier and image prices are one price of the model, shown once after the specs while every spec has the same; a
 * limited-time special discounting them for some specs only puts each spec's own under it.
 */
function sharedSurcharge(prices: ModelCardPrice[]) {
  const identity = (price: ModelCardPrice) =>
    JSON.stringify([
      sharedSurchargeItems(price.inputSurcharge),
      sharedSurchargeItems(price.baseInputSurcharge),
      price.surchargeIdentity ?? null,
    ])
  const surcharged = prices.filter((price) => price.inputSurcharge)
  const first = surcharged[0]
  if (!first) return null
  return surcharged.every((price) => identity(price) === identity(first))
    ? first
    : null
}

// One line of a surcharge block: name, points with its unit, the struck price's own points under a special, and what
// follows the points (the agent's model price).
function SurchargeLine(props: {
  name: string
  points: string
  basePoints?: string
  unit: string
  extra?: ReactNode
}) {
  return (
    <div className='flex items-baseline justify-between gap-3'>
      <span className='font-medium'>{props.name}</span>
      <span className='tabular-nums'>
        {props.basePoints && props.basePoints !== props.points ? (
          <span className='text-muted-foreground me-1.5 text-xs line-through'>
            {props.basePoints}
          </span>
        ) : null}
        <span className='text-[15px] font-bold'>{props.points}</span>
        <span className='text-muted-foreground ms-1 text-xs'>{props.unit}</span>
        {props.extra}
      </span>
    </div>
  )
}

// By the generated quality each spec is a block: "720P" over "生成视频" and "参考视频".
function ReferenceVideoSpecBlock(props: { price: ModelCardPrice }) {
  const { t } = useTranslation()
  const { price } = props
  const video = price.inputSurcharge?.video
  const base = price.baseInputSurcharge?.video
  const unit = t(pointsUnitKey('SECOND'))
  return (
    <div className='bg-muted grid gap-1 rounded-lg border px-3 py-2'>
      <span className='text-muted-foreground text-xs'>
        {specName(price) || t('Default')}
      </span>
      <SurchargeLine
        name={t('Generated video')}
        points={price.points}
        basePoints={price.basePoints}
        unit={t(pointsUnitKey(price.billingUnit))}
        extra={price.extra}
      />
      <SurchargeLine
        name={t('Reference video')}
        points={video?.basis === 'OUTPUT_QUALITY' ? video.points : ''}
        basePoints={base?.basis === 'OUTPUT_QUALITY' ? base.points : undefined}
        unit={unit}
        extra={price.surchargeExtra?.('video')}
      />
    </div>
  )
}

// By the reference video's own quality one block lists the tiers; reference images have a block of their own. A spec's
// own blocks carry its name.
function SurchargeBlocks(props: { price: ModelCardPrice; spec?: string }) {
  const { t } = useTranslation()
  const {
    inputSurcharge: surcharge,
    baseInputSurcharge: base,
    surchargeExtra,
  } = props.price
  const video = surcharge?.video
  const baseVideo = base?.video
  const title = (name: string) =>
    props.spec === undefined ? name : `${props.spec || t('Default')} · ${name}`
  return (
    <>
      {video?.basis === 'INPUT_TIER' ? (
        <div className='bg-muted grid gap-1 rounded-lg border px-3 py-2'>
          <span className='text-muted-foreground text-xs'>
            {title(t('Reference video'))}
          </span>
          {video.tiers.map((tier) => (
            <SurchargeLine
              key={tier.name}
              name={t('{{name}} (short edge ≤ {{px}})', {
                name: tier.name,
                px: tier.maxShortEdgePx,
              })}
              points={tier.points}
              basePoints={
                baseVideo?.basis === 'INPUT_TIER'
                  ? baseVideo.tiers.find((item) => item.name === tier.name)
                      ?.points
                  : undefined
              }
              unit={t(pointsUnitKey('SECOND'))}
              extra={surchargeExtra?.(`video:${tier.name}`)}
            />
          ))}
        </div>
      ) : null}
      {surcharge?.image ? (
        <div className='bg-muted grid gap-1 rounded-lg border px-3 py-2'>
          <span className='text-muted-foreground text-xs'>
            {title(t('Reference images'))}
          </span>
          <SurchargeLine
            name={
              surcharge.image.freeCount
                ? t('Up to {{count}} free, beyond that', {
                    count: surcharge.image.freeCount,
                  })
                : t('Each image')
            }
            points={surcharge.image.points}
            basePoints={base?.image?.points}
            unit={t('points per image')}
            extra={surchargeExtra?.('image')}
          />
        </div>
      ) : null}
    </>
  )
}

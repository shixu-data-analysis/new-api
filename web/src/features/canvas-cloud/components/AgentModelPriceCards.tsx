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
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import {
  rateAtMultiplier,
  sharedTimeOfDaySchedule,
} from '../lib/time-of-day-display'
import {
  tokenCategoryLabel,
  tokenCategoryLabelKey,
} from '../lib/token-rate-summary'
import { formatExactRmbReference } from '../number-format'
import type { CanvasAgentModelPrice, CanvasTokenCategory } from '../types'
import { ModelCardPrices, type ModelCardPrice } from './ModelCardPrices'
import { ModelCatalogCard } from './ModelCatalogCard'
import { useMinuteNow } from './time-of-day-text'
import { TimeOfDayPricing } from './TimeOfDayPricing'

type AgentPrice = CanvasAgentModelPrice['priceGroups'][number]['prices'][number]
type Translate = (key: string, options?: Record<string, unknown>) => string

const PLANS_SHOWN_FOLDED = 1

/**
 * A plan's price rows: the customer points and, after them, the agent's model price (yuan), both at the multiplier in
 * force now.
 */
function agentPrices(
  prices: AgentPrice[],
  t: Translate,
  locale: string | undefined
): ModelCardPrice[] {
  const rmb = (amount: string) => `¥${formatExactRmbReference(amount, locale)}`
  return prices.map((price) => {
    const modelPrice = price.modelPriceCny
    const perCategory =
      modelPrice !== null && typeof modelPrice === 'object' ? modelPrice : null
    const tokenRows =
      price.billingUnit === 'MILLION_TOKENS' &&
      Boolean(price.customerTokenRates)
    const label = <span className='sr-only'>{t('Model price')} </span>
    // A single model price follows the points; per-category model prices follow each category, or sit under a
    // price that is not per Token.
    const single = perCategory ? undefined : (
      <span
        className='text-muted-foreground ms-1 text-xs'
        title={t('Model price')}
      >
        · {label}
        {typeof modelPrice === 'string' ? rmb(modelPrice) : '—'}
      </span>
    )
    const below =
      perCategory && !tokenRows ? (
        <span
          className='text-muted-foreground text-xs'
          title={t('Model price')}
        >
          {label}
          {(Object.keys(tokenCategoryLabel) as CanvasTokenCategory[])
            .filter((category) => typeof perCategory[category] === 'string')
            .map(
              (category) =>
                `${t(tokenCategoryLabelKey(category, Object.keys(perCategory)))} ${rmb(perCategory[category] as string)}`
            )
            .join(' · ')}
        </span>
      ) : undefined
    return {
      key: `${price.combinationKey}:${price.billingUnit}`,
      parameters: price.parameters,
      billingUnit: price.billingUnit,
      points: price.customerPoints,
      tokenRates: price.customerTokenRates,
      timeOfDaySchedule: price.timeOfDaySchedule,
      extra: single,
      below,
      categories: perCategory
        ? (Object.keys(perCategory) as CanvasTokenCategory[])
        : undefined,
      priceIdentity: JSON.stringify(modelPrice),
      categoryExtra:
        perCategory && tokenRows
          ? (category, multiplier) => {
              const amount = perCategory[category]
              return (
                <span
                  className='text-muted-foreground ms-1.5 text-xs'
                  title={t('Model price')}
                >
                  · {label}
                  {typeof amount === 'string'
                    ? rmb(rateAtMultiplier(amount, multiplier))
                    : '—'}
                </span>
              )
            }
          : undefined,
    }
  })
}

/**
 * Current model prices laid out like the model center, one section per price plan of the agent's customers. More than
 * two plans keep the first open and fold the rest under one toggle; the open state is not kept.
 */
export function AgentModelPriceCards(props: {
  models: CanvasAgentModelPrice[]
  showModelIcons: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const [openModels, setOpenModels] = useState<ReadonlySet<string>>(new Set())
  const now = useMinuteNow(
    props.models.some((model) =>
      model.priceGroups.some((group) =>
        group.prices.some((price) => price.timeOfDaySchedule)
      )
    )
  )
  return (
    <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
      {props.models.map((model) => {
        const folds = model.priceGroups.length > 2
        const open = openModels.has(model.customerModelId)
        const groups =
          folds && !open
            ? model.priceGroups.slice(0, PLANS_SHOWN_FOLDED)
            : model.priceGroups
        // Every plan of a model shares the spec's schedule, so it is shown once under the plans.
        const schedule = sharedTimeOfDaySchedule(
          model.priceGroups.flatMap((group) =>
            agentPrices(group.prices, t, locale)
          )
        )
        return (
          <ModelCatalogCard
            key={model.customerModelId}
            name={model.effectiveDisplayName}
            capability={model.capability}
            iconKey={model.iconKey}
            iconColor={model.iconColor}
            showIcon={props.showModelIcons}
            badges={model.badges}
            description={model.description ?? undefined}
          >
            {groups.map((group) => (
              <section key={group.priceGroupId} className='space-y-2'>
                <h4 className='text-muted-foreground text-xs font-medium'>
                  {group.priceGroupName}
                </h4>
                <ModelCardPrices
                  prices={agentPrices(group.prices, t, locale)}
                  capability={model.capability}
                  now={now}
                  showSchedule={!schedule}
                />
              </section>
            ))}
            {folds ? (
              <button
                type='button'
                aria-expanded={open}
                className='text-primary focus-visible:ring-ring inline-flex items-center gap-1 rounded text-[12.5px] focus-visible:ring-2 focus-visible:outline-none'
                onClick={() =>
                  setOpenModels((current) => {
                    const next = new Set(current)
                    if (next.has(model.customerModelId)) {
                      next.delete(model.customerModelId)
                    } else {
                      next.add(model.customerModelId)
                    }
                    return next
                  })
                }
              >
                <ChevronRight
                  className={cn(
                    'size-3.5 transition-transform motion-reduce:transition-none',
                    open && 'rotate-90'
                  )}
                />
                <span>
                  {open
                    ? t('Collapse')
                    : t('Other {{count}} price plans', {
                        count: model.priceGroups.length - PLANS_SHOWN_FOLDED,
                      })}
                </span>
              </button>
            ) : null}
            {schedule ? (
              <TimeOfDayPricing schedule={schedule} now={now} />
            ) : null}
          </ModelCatalogCard>
        )
      })}
    </div>
  )
}

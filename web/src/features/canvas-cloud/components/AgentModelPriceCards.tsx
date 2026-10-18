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
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'

import { tokenCategoryLabel } from '../lib/token-rate-summary'
import { formatExactRmbReference } from '../number-format'
import type { CanvasAgentModelPrice, CanvasTokenCategory } from '../types'
import { ModelCatalogCard, ModelPriceRow } from './ModelCatalogCard'

type AgentPrice = CanvasAgentModelPrice['priceGroups'][number]['prices'][number]

/** The model price after the customer points: one figure on the same line, Token categories on the line below. */
function AgentPriceRow(props: { price: AgentPrice }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const { price } = props
  const rmb = (amount: string) => `¥${formatExactRmbReference(amount, locale)}`
  const modelPrice = price.modelPriceCny
  const perCategory =
    modelPrice !== null && typeof modelPrice === 'object'
      ? (Object.keys(tokenCategoryLabel) as CanvasTokenCategory[])
          .filter((category) => typeof modelPrice[category] === 'string')
          .map(
            (category) =>
              `${t(tokenCategoryLabel[category])} ${rmb(modelPrice[category] as string)}`
          )
          .join(' · ')
      : null
  return (
    <ModelPriceRow
      parameters={price.parameters}
      billingUnit={price.billingUnit}
      points={price.customerPoints}
      tokenRates={price.customerTokenRates}
      extra={
        perCategory === null ? (
          <span
            className='text-muted-foreground ms-1 text-xs'
            title={t('Model price')}
          >
            · <span className='sr-only'>{t('Model price')} </span>
            {typeof modelPrice === 'string' ? rmb(modelPrice) : '—'}
          </span>
        ) : undefined
      }
      below={
        perCategory === null ? undefined : (
          <span
            className='text-muted-foreground text-xs'
            title={t('Model price')}
          >
            <span className='sr-only'>{t('Model price')} </span>
            {perCategory}
          </span>
        )
      }
    />
  )
}

/** Current model prices laid out like the model center, one section per price plan of the agent's customers. */
export function AgentModelPriceCards(props: {
  models: CanvasAgentModelPrice[]
}) {
  return (
    <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
      {props.models.map((model) => (
        <ModelCatalogCard
          key={model.customerModelId}
          name={model.effectiveDisplayName}
          capability={model.capability}
          iconKey={model.iconKey}
          iconColor={model.iconColor}
          badges={model.badges}
          description={model.description ?? undefined}
        >
          {model.priceGroups.map((group) => (
            <section key={group.priceGroupId} className='space-y-2'>
              <h4 className='text-muted-foreground text-xs font-medium'>
                {group.priceGroupName}
              </h4>
              {group.prices.map((price) => (
                <AgentPriceRow
                  key={`${price.combinationKey}:${price.billingUnit}`}
                  price={price}
                />
              ))}
            </section>
          ))}
        </ModelCatalogCard>
      ))}
    </div>
  )
}

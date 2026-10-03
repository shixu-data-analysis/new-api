/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { toIntlLocale } from '@/i18n/languages'

import { formatExactRmbReference } from '../number-format'
import { pricingScopeLabel } from '../pricing-scope-label'
import type { CanvasAgentModelPrice, CanvasBillingUnit } from '../types'
import { CapabilityIcon } from './CustomerModelCenter'

type AgentPrice = CanvasAgentModelPrice['priceGroups'][number]['prices'][number]

// Cards keep one height: they show the first price plan's first rows and the rest opens in a popover.
const CARD_PRICE_ROWS = 2

const billingUnitKeys: Record<CanvasBillingUnit, string> = {
  REQUEST: 'Per request',
  SECOND: 'Per second',
  MILLION_TOKENS: 'Per million tokens',
}
const tokenCategoryKeys: Record<string, string> = {
  input: 'Input',
  output: 'Output',
  cacheRead: 'Cache read',
  cacheWrite: 'Cache write',
}

function PriceRow(props: { price: AgentPrice }) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.language)
  const { price } = props
  const tokenLabel = (category: string) =>
    t(tokenCategoryKeys[category] ?? category)
  const rmb = (amount: string) => `¥${formatExactRmbReference(amount, locale)}`
  const modelPrice = (value: AgentPrice['modelPriceCny']) => {
    if (value === null) return '—'
    if (typeof value === 'string') return rmb(value)
    return Object.entries(value)
      .map(([category, amount]) => `${tokenLabel(category)}: ${rmb(amount)}`)
      .join(' · ')
  }
  const rates = price.customerTokenRates
  const modelPrices =
    price.modelPriceCny !== null && typeof price.modelPriceCny === 'object'
      ? (price.modelPriceCny as Record<string, string | undefined>)
      : null
  // Per-category layout needs a per-category model price; any other mix keeps the joined text.
  // Categories priced on only one side still get a cell so no figure is dropped.
  const perCategory =
    rates !== null && typeof price.modelPriceCny !== 'string'
      ? [...new Set([...Object.keys(rates), ...Object.keys(modelPrices ?? {})])]
      : null
  const scope = `${pricingScopeLabel(
    { key: price.combinationKey, parameters: price.parameters },
    t
  )} · ${t(billingUnitKeys[price.billingUnit])}`

  return (
    <div className='bg-muted space-y-1 rounded-lg border px-3 py-2 text-sm'>
      <div className='flex items-baseline justify-between gap-2'>
        <span className='min-w-0 truncate font-medium' title={scope}>
          {scope}
        </span>
        {perCategory ? (
          <span className='text-muted-foreground shrink-0 text-xs'>
            {t('Customer points')} / {t('Model price')}
          </span>
        ) : null}
      </div>
      {perCategory ? (
        <div
          className='grid gap-2 tabular-nums'
          style={{
            gridTemplateColumns: `repeat(${perCategory.length}, minmax(0, 1fr))`,
          }}
        >
          {perCategory.map((category) => {
            const points = (rates as Record<string, string | undefined>)[
              category
            ]
            const amount = modelPrices?.[category]
            return (
              <div key={category} className='min-w-0'>
                <div className='text-muted-foreground text-xs'>
                  {tokenLabel(category)}
                </div>
                <div className='break-words'>
                  <span className='font-bold'>{points ?? '—'}</span> /{' '}
                  {amount === undefined ? '—' : rmb(amount)}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className='grid grid-cols-2 gap-2 tabular-nums'>
          <div className='min-w-0'>
            <div className='text-muted-foreground text-xs'>
              {t('Customer points')}
            </div>
            <div className='text-base font-bold break-words'>
              {rates
                ? Object.entries(rates)
                    .map(([key, value]) => `${tokenLabel(key)}: ${value}`)
                    .join(' · ')
                : price.customerPoints}
            </div>
          </div>
          <div className='min-w-0'>
            <div className='text-muted-foreground text-xs'>
              {t('Model price')}
            </div>
            <div className='break-words'>{modelPrice(price.modelPriceCny)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function PriceGroupSection(props: {
  group: CanvasAgentModelPrice['priceGroups'][number]
  limit?: number
}) {
  const { group, limit } = props
  return (
    <section className='space-y-2'>
      <h4 className='text-muted-foreground text-xs font-medium'>
        {group.priceGroupName}
      </h4>
      {group.prices.slice(0, limit).map((price) => (
        <PriceRow
          key={`${price.combinationKey}:${price.billingUnit}`}
          price={price}
        />
      ))}
    </section>
  )
}

function ModelPriceCard(props: { model: CanvasAgentModelPrice }) {
  const { t } = useTranslation()
  const { model } = props
  const [firstGroup] = model.priceGroups
  const priceCount = model.priceGroups.reduce(
    (count, group) => count + group.prices.length,
    0
  )
  const hasMore =
    model.priceGroups.length > 1 ||
    priceCount > CARD_PRICE_ROWS ||
    Boolean(model.description)

  return (
    <Card className='ring-foreground/15 hover:ring-primary/55 h-full shadow-xs transition-shadow motion-reduce:transition-none'>
      <CardHeader className='grid-cols-[auto_minmax(0,1fr)] gap-x-3'>
        <CapabilityIcon capability={model.capability} />
        <CardTitle className='min-w-0 break-words'>
          {model.effectiveDisplayName}
        </CardTitle>
        <CardDescription className='flex min-w-0 flex-wrap items-center gap-1.5'>
          <span>{t(model.capability)}</span>
          {model.tags.map((tag) => (
            <Badge key={tag.id} variant='secondary'>
              {tag.name}
            </Badge>
          ))}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex-1'>
        {firstGroup ? (
          <PriceGroupSection group={firstGroup} limit={CARD_PRICE_ROWS} />
        ) : null}
      </CardContent>
      <CardFooter className='text-muted-foreground min-h-12 justify-between gap-2 text-xs'>
        <span>
          {t('Price plans: {{groups}} · Prices: {{prices}}', {
            groups: model.priceGroups.length,
            prices: priceCount,
          })}
        </span>
        {hasMore ? (
          <Popover>
            <PopoverTrigger
              render={<Button type='button' size='sm' variant='outline' />}
            >
              {t('View all prices')}
            </PopoverTrigger>
            <PopoverContent
              align='end'
              sideOffset={8}
              className='max-h-[60vh] w-[min(26rem,calc(100vw-2rem))] space-y-3 overflow-y-auto p-3'
            >
              <div className='text-foreground text-sm font-medium'>
                {model.effectiveDisplayName}
              </div>
              {model.description ? (
                <p className='text-muted-foreground text-sm'>
                  {model.description}
                </p>
              ) : null}
              {model.priceGroups.map((group) => (
                <PriceGroupSection key={group.priceGroupId} group={group} />
              ))}
            </PopoverContent>
          </Popover>
        ) : null}
      </CardFooter>
    </Card>
  )
}

export function AgentModelPriceCards(props: {
  models: CanvasAgentModelPrice[]
}) {
  return (
    <div className='grid auto-rows-fr gap-3 md:grid-cols-2 xl:grid-cols-3'>
      {props.models.map((model) => (
        <ModelPriceCard key={model.customerModelId} model={model} />
      ))}
    </div>
  )
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useEffect, useContext, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SelectContent as BaseSelectContent } from '@/components/ui/select'

import { ActivityRecordNavigationContext, minorToCny } from '../activity-shared'
import type {
  CanvasEligibilityBasis,
  CanvasTokenCategoryCostReference,
} from '../activity-types'
import { formatCanvasDateTime } from '../formatters'

export function SelectContent(props: { children: ReactNode }) {
  return (
    <BaseSelectContent
      align='start'
      alignItemWithTrigger={false}
      className='w-max max-w-[calc(100vw-2rem)] min-w-(--anchor-width) **:data-[slot=select-item-text]:min-w-0 **:data-[slot=select-item-text]:break-words **:data-[slot=select-item-text]:whitespace-normal'
    >
      {props.children}
    </BaseSelectContent>
  )
}

export function ActivityRecordLink(props: {
  href: string
  focusId: string
  children: ReactNode
  className?: string
}) {
  const navigation = useContext(ActivityRecordNavigationContext)
  const ref = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (navigation?.restoreFocusId !== props.focusId) return
    window.scrollTo({ top: navigation.restoreScrollY ?? 0 })
    ref.current?.focus()
  }, [navigation?.restoreFocusId, navigation?.restoreScrollY, props.focusId])
  return (
    <a
      ref={ref}
      href={props.href}
      className={props.className ?? 'text-primary hover:underline'}
      onClick={() => navigation?.capture(props.focusId)}
    >
      {props.children}
    </a>
  )
}

export type TokenCategoryCostReferenceDisplay = Omit<
  CanvasTokenCategoryCostReference,
  'basePoints' | 'specialPoints'
> & {
  basePoints: string | null
  specialPoints: string | null
}

export function TokenCategoryCostReferences(props: {
  references: TokenCategoryCostReferenceDisplay[] | null
  historical?: boolean
}) {
  const { t } = useTranslation()
  if (!props.references?.length) return null
  return (
    <div className='space-y-3 rounded-md border p-3 text-sm lg:col-span-2'>
      <p className='font-medium'>{t('Token category pricing reference')}</p>
      {props.references.map((reference) => {
        const cannotEvaluate =
          reference.specialPriceRmb === null ||
          reference.differenceRmb === null ||
          reference.belowCostReference === null
        let belowCostReference = '—'
        if (reference.belowCostReference !== null) {
          belowCostReference = reference.belowCostReference ? t('Yes') : t('No')
        }
        return (
          <div
            className='space-y-2 border-t pt-3 first:border-t-0 first:pt-0'
            key={reference.category}
          >
            <p className='font-medium'>
              {t(`Token category ${reference.category}`)}
            </p>
            <dl className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              <TokenCategoryCostFact
                label={t('Base → special')}
                value={`${reference.basePoints ?? '—'} → ${reference.specialPoints ?? '—'}`}
              />
              <TokenCategoryCostFact
                label={t('Points per RMB')}
                value={reference.baseRatePointsPerRmb ?? '—'}
              />
              <TokenCategoryCostFact
                label={t('Pricing cost reference')}
                value={reference.kPricingRmb ?? '—'}
                rmb
              />
              <TokenCategoryCostFact
                label={t('Special price (RMB)')}
                value={reference.specialPriceRmb ?? '—'}
                rmb
              />
              <TokenCategoryCostFact
                label={t('Difference (RMB)')}
                value={reference.differenceRmb ?? '—'}
                rmb
              />
              <TokenCategoryCostFact
                label={t('Below cost reference')}
                value={belowCostReference}
              />
            </dl>
            {cannotEvaluate ? (
              <p className='text-muted-foreground'>
                {t('This category cannot be evaluated yet.')}
              </p>
            ) : null}
          </div>
        )
      })}
      {props.historical ? (
        <p className='text-muted-foreground'>
          {t(
            'Historical pricing facts are frozen at publication and may differ from current pricing.'
          )}
        </p>
      ) : null}
    </div>
  )
}

function TokenCategoryCostFact(props: {
  label: string
  value: string
  rmb?: boolean
}) {
  return (
    <div>
      <dt className='text-muted-foreground'>{props.label}</dt>
      <dd className='tabular-nums'>
        {props.rmb && props.value !== '—' ? `¥${props.value}` : props.value}
      </dd>
    </div>
  )
}

export function EligibilityBasisContent(props: {
  basis: CanvasEligibilityBasis
}) {
  const { t } = useTranslation()
  return (
    <>
      <p>
        {t('Checked at')}: {formatCanvasDateTime(props.basis.checkedAt)}
      </p>
      <p>
        {t('Qualifying recharge amount')}: ¥
        {minorToCny(props.basis.qualifyingAmountMinor)}
      </p>
      <div className='space-y-2'>
        {props.basis.orders.map((order) => (
          <div className='border-b pb-2' key={order.rechargeOrderId}>
            <p>{order.orderNumber}</p>
            <p className='text-muted-foreground'>
              {t('Original amount')}: ¥{minorToCny(order.originalAmountMinor)} ·{' '}
              {t('Returned reference')}: ¥
              {minorToCny(order.returnedReferenceAmountMinor)}
            </p>
            <p>
              {t('Qualifying amount')}: ¥
              {minorToCny(order.qualifyingAmountMinor)}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}

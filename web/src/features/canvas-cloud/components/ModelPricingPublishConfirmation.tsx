/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import dayjs from '@/lib/dayjs'

import { billingUnitLabelKey } from '../lib/billing-unit-labels'
import {
  draftValue,
  isRowIncluded,
  isSideChanged,
  originalValue,
  PRICING_SIDE_LABEL_KEYS,
  type PricingEditorRow,
  type PricingEditorState,
  type PricingSide,
} from '../lib/model-pricing-editor'
import {
  pricingRowLabel,
  type PricingRowLabeling,
} from '../lib/model-pricing-row-label'
import type {
  CanvasModelPricingDetail,
  CanvasModelPricingPreview,
  CanvasModelPricingPriceSnapshot,
} from '../types'
import type { PricingEffectiveMode } from './ModelPricingPublishBar'
import {
  PricingActionConfirmation,
  type ConfirmationDetail,
} from './PricingActionConfirmation'

const SIDES: PricingSide[] = ['provider', 'inviter', 'customer']

function snapshotPoints(
  price: CanvasModelPricingPriceSnapshot | null | undefined,
  field: PricingEditorRow['field']
) {
  if (!price) return ''
  return field === 'scalar' ? price.points : (price.tokenRates?.[field] ?? '')
}

/** "确认发布定价": every published row with its old → new values, then the effective mode and reason. */
export function ModelPricingPublishConfirmation(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: CanvasModelPricingDetail
  state: PricingEditorState
  labeling: PricingRowLabeling
  preview: CanvasModelPricingPreview | undefined
  effectiveMode: PricingEffectiveMode
  effectiveAt: string
  reason: string
  pending: boolean
  /** "old → new" of a changed time-of-day schedule. */
  timeOfDayChange?: string
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const { state } = props
  const model = props.detail.model
  const proposedPoints = (row: PricingEditorRow) =>
    snapshotPoints(
      props.preview?.scopes
        .find(
          (scope) =>
            scope.parameterCombinationId === row.scope.parameterCombinationId
        )
        ?.prices.find((price) => price.priceGroupId === row.price.priceGroupId)
        ?.proposed,
      row.field
    )
  const rowLines = (row: PricingEditorRow): string[] => {
    const label = (side: PricingSide) => t(PRICING_SIDE_LABEL_KEYS[side])
    // After a unit change old prices are in another unit, so only the new values are listed.
    if (state.unitChange) {
      return [
        ...SIDES.map(
          (side) =>
            `${label(side)} ${t('{{amount}} yuan', { amount: draftValue(state, row, side) })}`
        ),
        t('Customer points {{to}} points', { to: proposedPoints(row) }),
      ]
    }
    const changed = SIDES.filter((side) => isSideChanged(state, row, side))
    const lines = changed.map((side) => {
      const before = originalValue(state, row, side)
      const after = draftValue(state, row, side)
      if (before) {
        return `${label(side)} ${t('{{from}} → {{to}} yuan', { from: before, to: after })}`
      }
      return `${label(side)} ${t('{{from}} → {{to}} yuan', {
        from: row.price.current ? t('Not recorded') : t('Not priced'),
        to: after,
      })}`
    })
    if (changed.includes('customer')) {
      const from = snapshotPoints(row.price.current, row.field)
      lines.push(
        t('Customer points {{from}} → {{to}} points', {
          from: from || t('Not priced'),
          to: proposedPoints(row),
        })
      )
    }
    if (!changed.includes('inviter') && !changed.includes('customer')) {
      lines.push(t('Inviter display price and customer sale price unchanged'))
    }
    return lines
  }
  const unitFrom =
    model.billingUnitState === 'MIXED'
      ? model.publishedBillingUnits
          .map((unit) => t(billingUnitLabelKey(unit)))
          .join(t(', '))
      : t(billingUnitLabelKey(model.billingUnit ?? state.billingUnit))
  const details: ConfirmationDetail[] = [
    ...(state.unitChange
      ? [
          {
            label: t('Billing unit'),
            value: `${unitFrom} → ${t(billingUnitLabelKey(state.billingUnit))}`,
          },
        ]
      : []),
    ...state.rows
      .filter((row) => isRowIncluded(state, row))
      .map((row) => ({
        key: row.id,
        label: pricingRowLabel(row, props.labeling, t),
        value: (
          <span className='whitespace-pre-line'>
            {rowLines(row).join('\n')}
          </span>
        ),
      })),
    ...(props.timeOfDayChange
      ? [{ label: t('Time-of-day multipliers'), value: props.timeOfDayChange }]
      : []),
    {
      label: t('Effective mode'),
      value:
        props.effectiveMode === 'SCHEDULED'
          ? `${t('Schedule for later')} · ${dayjs(props.effectiveAt).format('YYYY/MM/DD HH:mm')}`
          : t('Immediately'),
    },
    { label: t('Change reason'), value: props.reason.trim() || '—' },
  ]
  return (
    <PricingActionConfirmation
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Confirm pricing publication')}
      description={t('Review the changes and their effective schedule.')}
      details={details}
      cancelLabel={t('Return to editing')}
      confirmLabel={t('Confirm and publish')}
      confirmDisabled={!props.preview?.canPublish}
      pending={props.pending}
      onConfirm={props.onConfirm}
    />
  )
}

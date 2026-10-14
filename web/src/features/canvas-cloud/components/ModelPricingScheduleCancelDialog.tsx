/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  cancelCanvasModelPricingSchedule,
  getCanvasModelPricingPublication,
} from '../api'
import { formatCanvasDateTime } from '../formatters'
import { pricingRowLabeling } from '../lib/model-pricing-row-label'
import { pricingScopeLabel } from '../pricing-scope-label'
import type {
  CanvasModelPricingDetail,
  CanvasModelPricingPublication,
} from '../types'
import { PricingActionConfirmation } from './PricingActionConfirmation'

type PublicationItem = CanvasModelPricingPublication['scopeSummary'][number]

// Empty in Chinese and Japanese, a space elsewhere.
const SENTENCE_SEPARATOR_KEY = 'sentence separator'

/**
 * Confirms cancelling a schedule. From the pricing table (`scopeId` set) only that pricing scope is withdrawn; from
 * the history tab every still-pending price is. A billing-unit change is always cancelled as a whole.
 */
export function ModelPricingScheduleCancelDialog(props: {
  publicationId: string | null
  scopeId?: string
  detail: CanvasModelPricingDetail | undefined
  onClose: () => void
  onCancelled?: () => void
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const publication = useQuery({
    queryKey: [
      'canvas-cloud',
      'model-pricing',
      'publication',
      props.publicationId,
    ],
    queryFn: () => getCanvasModelPricingPublication(props.publicationId ?? ''),
    enabled: Boolean(props.publicationId),
  })
  const item = publication.data
  const whole = !props.scopeId || item?.change === 'UNIT'
  const pending = (item?.scopeSummary ?? []).filter(
    (entry, _index, entries) =>
      entry.status === 'SCHEDULED' &&
      // A scope listed by its prices needs no separate cost line.
      (entry.priceGroupId !== null ||
        !entries.some(
          (other) =>
            other.combinationId === entry.combinationId &&
            other.priceGroupId !== null &&
            other.status === 'SCHEDULED'
        ))
  )
  const cancelled = whole
    ? pending
    : pending.filter((entry) => entry.combinationId === props.scopeId)
  const multiplePlans = (props.detail?.priceGroups.length ?? 0) > 1
  // Named like the pricing table rows.
  const qualityOnly = props.detail
    ? pricingRowLabeling(props.detail, false).qualityOnly
    : false
  const scopeName = (entry: PublicationItem) =>
    qualityOnly
      ? String(entry.parameters.quality)
      : pricingScopeLabel(
          { key: entry.combinationKey, parameters: entry.parameters },
          t
        )
  const entryLabel = (entry: PublicationItem) => {
    const plan = props.detail?.priceGroups.find(
      (group) => group.id === entry.priceGroupId
    )?.internalName
    return multiplePlans && plan
      ? `${scopeName(entry)} · ${plan}`
      : scopeName(entry)
  }
  const firstPrice = cancelled.some(
    (entry) =>
      entry.priceGroupId !== null &&
      !props.detail?.pricingScopes
        .find((scope) => scope.parameterCombinationId === entry.combinationId)
        ?.prices.find((price) => price.priceGroupId === entry.priceGroupId)
        ?.current
  )
  const others = [
    ...new Set(
      pending
        .filter((entry) => !cancelled.includes(entry))
        .map((entry) => scopeName(entry))
    ),
  ]
  const sentences = [
    props.scopeId && item?.change === 'UNIT'
      ? t(
          'This schedule changes the billing unit, so every pricing scope must take effect together and the whole schedule is cancelled. Current prices stay in effect.'
        )
      : t(
          whole
            ? 'Cancel every pending price of this schedule; current prices stay in effect.'
            : 'Only the prices below are cancelled; current prices stay in effect.'
        ),
    ...(firstPrice
      ? [
          t(
            'First-time prices among them return to unpriced; customers cannot see those specifications until they are priced again.'
          ),
        ]
      : []),
    ...(others.length
      ? [
          t(
            'Other pricing scopes of this schedule ({{scopes}}) are not affected.',
            { scopes: others.join(t(', ')) }
          ),
        ]
      : []),
  ]
  const scopeIds = whole || !props.scopeId ? undefined : [props.scopeId]
  const cancellation = useMutation({
    mutationFn: () =>
      cancelCanvasModelPricingSchedule(props.publicationId ?? '', scopeIds),
    onSuccess: async () => {
      props.onClose()
      toast.success(t('Schedule cancelled'))
      props.onCancelled?.()
      await client.invalidateQueries({
        queryKey: ['canvas-cloud', 'model-pricing'],
      })
    },
    onError: () => toast.error(t('Scheduled pricing could not be cancelled')),
  })
  return (
    <PricingActionConfirmation
      open={Boolean(props.publicationId)}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={t('Cancel scheduled prices')}
      description={item ? sentences.join(t(SENTENCE_SEPARATOR_KEY)) : ''}
      details={[
        { label: t('Model'), value: item?.displayNameSnapshot ?? '—' },
        {
          label: t('Effective at'),
          value: formatCanvasDateTime(item?.effectiveAt ?? null),
        },
        {
          label: t('To cancel'),
          value: cancelled.length ? (
            <span className='whitespace-pre-line'>
              {cancelled.map(entryLabel).join('\n')}
            </span>
          ) : (
            '—'
          ),
        },
      ]}
      cancelLabel={t('Back')}
      confirmLabel={t('Cancel schedule')}
      destructive
      confirmDisabled={!item || cancelled.length === 0}
      pending={cancellation.isPending}
      onConfirm={() => cancellation.mutate()}
    />
  )
}

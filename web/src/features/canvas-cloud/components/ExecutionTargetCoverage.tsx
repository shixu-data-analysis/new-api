/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import type { CanvasExecutionTargetPricingCoverage } from '../types'

const invisibleReasonLabels: Record<string, string> = {
  PRESENTATION_DISABLED: 'Display switch is off',
  MISSING_PRICING: 'Missing pricing',
  NO_ENABLED_PARAMETER_COMBINATIONS: 'No enabled parameter combinations',
  MANUALLY_DISABLED: 'Model manually disabled',
  MODEL_UNAVAILABLE: 'Model unavailable',
  PROVIDER_UNAVAILABLE: 'Provider unavailable',
  INTERNAL_ROUTING_UNAVAILABLE: 'Internal routing unavailable',
}

export function ExecutionTargetCoverage(props: {
  coverage: CanvasExecutionTargetPricingCoverage[]
  parameterCombinations: Array<{
    id: string
    label: string
    controlEnabled: boolean
  }>
}) {
  const { t } = useTranslation()
  const disabledSpecifications = props.parameterCombinations
    .filter((combination) => !combination.controlEnabled)
    .map((combination) => t(combination.label))
  const disabledLine = disabledSpecifications.length ? (
    <p className='text-muted-foreground'>
      {t('{{label}}: ', { label: t('Disabled specifications') })}
      {disabledSpecifications.join(' · ')}
    </p>
  ) : null
  if (!props.coverage.length) {
    return (
      <div className='space-y-1 text-sm'>
        <span className='text-muted-foreground'>
          {t('No published price plans')}
        </span>
        {disabledLine}
      </div>
    )
  }
  const visibleGroupCount = props.coverage.filter(
    (coverage) => coverage.customerVisible
  ).length
  let visibilitySummary: string
  if (visibleGroupCount === props.coverage.length) {
    visibilitySummary = t('All price plans visible ({{visible}}/{{total}})', {
      visible: visibleGroupCount,
      total: props.coverage.length,
    })
  } else if (visibleGroupCount === 0) {
    visibilitySummary = t('No price plans visible ({{visible}}/{{total}})', {
      visible: visibleGroupCount,
      total: props.coverage.length,
    })
  } else {
    visibilitySummary = t(
      'Partially visible ({{visible}}/{{total}} price plans)',
      {
        visible: visibleGroupCount,
        total: props.coverage.length,
      }
    )
  }
  return (
    <div className='space-y-1 text-sm'>
      <p className='font-medium'>{visibilitySummary}</p>
      <ul className='space-y-1'>
        {props.coverage.map((coverage) => (
          <li key={coverage.priceGroupId} className='space-y-0.5 break-words'>
            <span>
              {t('{{label}}: ', { label: t('Price plan') })}
              {coverage.priceGroupName} · {coverage.pricedCount}/
              {coverage.requiredCount}{' '}
              {coverage.customerVisible
                ? t('Visible to customers')
                : t('Not shown to customers')}
            </span>
            {!coverage.customerVisible && coverage.invisibleReasons.length ? (
              <p className='text-muted-foreground'>
                {t('{{label}}: ', { label: t('Reason') })}
                {coverage.invisibleReasons
                  .map((reason) =>
                    t(invisibleReasonLabels[reason] ?? 'Unavailable')
                  )
                  .join(' · ')}
              </p>
            ) : null}
            {coverage.missingCombinationIds.length ? (
              <p className='text-muted-foreground'>
                {t('{{label}}: ', { label: t('Missing specifications') })}
                {coverage.missingCombinationIds
                  .map(
                    (id) =>
                      props.parameterCombinations.find(
                        (combination) => combination.id === id
                      )?.label
                  )
                  .filter((label): label is string => Boolean(label))
                  .map((label) => t(label))
                  .join(' · ')}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {disabledLine}
    </div>
  )
}

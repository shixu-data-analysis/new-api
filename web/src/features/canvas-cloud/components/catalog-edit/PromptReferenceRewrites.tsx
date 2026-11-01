/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import type { CatalogEditPlan } from '../../catalog-edit-api'
import { catalogPlanDiagnosticText } from '../catalog-plan-labels'

/** A sample request cannot show this change, so every page that confirms a publication states it. */
export function PromptReferenceRewrites(props: { plan: Pick<CatalogEditPlan, 'diagnostics'> }) {
  const { t } = useTranslation()
  return props.plan.diagnostics
    .filter((diagnostic) => diagnostic.code === 'CATALOG_PROMPT_REFERENCES_REWRITTEN')
    .map((diagnostic) => {
      const text = catalogPlanDiagnosticText(t, diagnostic, [])
      return <p key={diagnostic.jsonPath} className='text-sm [overflow-wrap:anywhere]'>{text?.message} {text?.remedy}</p>
    })
}

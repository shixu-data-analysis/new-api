/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import z from 'zod'

import { ErrorState } from '@/components/error-state'
import { AdminModelCatalog } from '@/features/canvas-cloud/components/AdminModelCatalog'
import { modelManagementReturnStateKey } from '@/features/canvas-cloud/model-management-navigation-state'

const searchSchema = z.object({
  tab: z.string().optional(),
  legacyError: z
    .enum(['invalid-model', 'invalid-publication', 'missing-model'])
    .optional(),
})

export const Route = createFileRoute(
  '/_authenticated/canvas-cloud/model-management/'
)({
  validateSearch: searchSchema,
  component: ModelManagementIndex,
})

function ModelManagementIndex() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const search = Route.useSearch()
  if (search.legacyError) {
    let description = t('The model parameter is invalid.')
    if (search.legacyError === 'missing-model') {
      description = t('A model is required to open this pricing publication.')
    } else if (search.legacyError === 'invalid-publication') {
      description = t('The pricing publication parameter is invalid.')
    }
    return (
      <ErrorState
        title={t('Invalid model-management link')}
        description={description}
      />
    )
  }
  const tab = search.tab === 'import' ? 'import' : 'published'
  return (
    <AdminModelCatalog
      tab={tab}
      onTabChange={(next) =>
        void navigate({
          to: '/canvas-cloud/model-management',
          search: next === 'import' ? { tab: 'import' } : {},
        })
      }
      onManagePricing={(modelId, returnContext) =>
        void navigate({
          to: '/canvas-cloud/model-management/$modelId/pricing',
          params: { modelId },
          state: returnContext
            ? (previous) => ({
                ...previous,
                [modelManagementReturnStateKey]: returnContext,
              })
            : undefined,
        })
      }
      onManageMonitoring={(modelId, executionTargetId, returnContext) =>
        void navigate({
          to: '/canvas-cloud/model-management/$modelId/monitoring/$executionTargetId',
          params: { modelId, executionTargetId },
          state: returnContext
            ? (previous) => ({
                ...previous,
                [modelManagementReturnStateKey]: returnContext,
              })
            : undefined,
        })
      }
      onManageBindings={(modelId, returnContext) =>
        void navigate({
          to: '/canvas-cloud/$section',
          params: { section: 'provider-configuration' },
          search: { modelId },
          state: returnContext
            ? (previous) => ({
                ...previous,
                [modelManagementReturnStateKey]: returnContext,
              })
            : undefined,
        })
      }
    />
  )
}

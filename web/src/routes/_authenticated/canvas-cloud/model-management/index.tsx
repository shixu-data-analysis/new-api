/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import z from 'zod'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { AdminModelCatalog } from '@/features/canvas-cloud/components/AdminModelCatalog'
import { modelManagementReturnStateKey } from '@/features/canvas-cloud/model-management-navigation'

const searchSchema = z.object({
  tab: z.string().optional(),
  legacyError: z.enum(['invalid-model', 'invalid-publication', 'missing-model']).optional(),
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
    const description =
      search.legacyError === 'missing-model'
        ? t('A model is required to open this pricing publication.')
        : search.legacyError === 'invalid-publication'
          ? t('The pricing publication parameter is invalid.')
          : t('The model parameter is invalid.')
    return <ErrorState title={t('Invalid model-management link')} description={description} />
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
            ? { [modelManagementReturnStateKey]: returnContext }
            : undefined,
        })
      }
      onManageMonitoring={(modelId, executionTargetId, returnContext) =>
        void navigate({
          to: '/canvas-cloud/model-management/$modelId/monitoring/$executionTargetId',
          params: { modelId, executionTargetId },
          state: returnContext
            ? { [modelManagementReturnStateKey]: returnContext }
            : undefined,
        })
      }
      onManageBindings={(modelId, returnContext) =>
        void navigate({
          to: '/canvas-cloud/$section',
          params: { section: 'provider-configuration' },
          search: { modelId },
          state: returnContext
            ? { [modelManagementReturnStateKey]: returnContext }
            : undefined,
        })
      }
    />
  )
}

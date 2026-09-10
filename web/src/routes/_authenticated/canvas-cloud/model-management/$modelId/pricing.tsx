/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createFileRoute, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import z from 'zod'

import { ErrorState } from '@/components/error-state'
import { UnifiedModelPricing } from '@/features/canvas-cloud/components/UnifiedModelPricing'
import { modelManagementReturnStateKey } from '@/features/canvas-cloud/model-management-navigation'

const searchSchema = z.object({
  tab: z.string().optional(),
  publicationId: z.string().optional(),
})

export const Route = createFileRoute(
  '/_authenticated/canvas-cloud/model-management/$modelId/pricing'
)({
  validateSearch: searchSchema,
  component: ModelPricingRoute,
})

function ModelPricingRoute() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = Route.useParams()
  const search = Route.useSearch()
  const locationState = useLocation({ select: (location) => location.state })
  const modelId = z.string().uuid().safeParse(params.modelId)
  const publicationId = search.publicationId
    ? z.string().uuid().safeParse(search.publicationId)
    : undefined
  const tab =
    publicationId?.success || publicationId === undefined
      ? search.tab === 'set' || search.tab === 'history'
        ? search.tab
        : 'current'
      : 'current'
  const resolvedTab = publicationId?.success ? 'history' : tab
  useEffect(() => {
    if (!modelId.success || (publicationId && !publicationId.success)) return
    const validTab =
      search.tab === 'current' || search.tab === 'set' || search.tab === 'history'
    if (publicationId?.success && search.tab !== 'history') {
      void navigate({
        to: '/canvas-cloud/model-management/$modelId/pricing',
        params: { modelId: modelId.data },
        search: { tab: 'history', publicationId: publicationId.data },
        replace: true,
      })
    } else if (search.tab !== undefined && !validTab) {
      void navigate({
        to: '/canvas-cloud/model-management/$modelId/pricing',
        params: { modelId: modelId.data },
        search: {},
        replace: true,
      })
    }
  }, [modelId, navigate, publicationId, search.tab])
  if (!modelId.success) {
    return <ErrorState title={t('Invalid model parameter')} />
  }
  if (publicationId && !publicationId.success) {
    return <ErrorState title={t('Invalid publication parameter')} />
  }
  return (
    <UnifiedModelPricing
      initialModelId={modelId.data}
      initialPublicationId={publicationId?.data}
      tab={resolvedTab}
      onTabChange={(next) =>
        void navigate({
          to: '/canvas-cloud/model-management/$modelId/pricing',
          params: { modelId: modelId.data },
          search:
            next === 'history'
              ? {
                  tab: next,
                  ...(publicationId?.data
                    ? { publicationId: publicationId.data }
                    : {}),
                }
              : { tab: next },
        })
      }
      onBack={() =>
        void navigate({
          to: '/canvas-cloud/model-management',
          search: {},
          state: locationState[modelManagementReturnStateKey]
            ? { [modelManagementReturnStateKey]: locationState[modelManagementReturnStateKey] }
            : undefined,
        })
      }
    />
  )
}

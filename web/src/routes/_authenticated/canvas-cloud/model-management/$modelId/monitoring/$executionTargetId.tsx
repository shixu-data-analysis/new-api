/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  createFileRoute,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import z from 'zod'

import { ErrorState } from '@/components/error-state'
import { ModelMonitoring } from '@/features/canvas-cloud/components/ModelMonitoring'
import { forwardModelManagementReturnState } from '@/features/canvas-cloud/model-management-navigation-state'
import { executionTargetRouteIdSchema } from '@/features/canvas-cloud/model-monitoring-route-params'

export const Route = createFileRoute(
  '/_authenticated/canvas-cloud/model-management/$modelId/monitoring/$executionTargetId'
)({
  component: ModelMonitoringRoute,
})

function ModelMonitoringRoute() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = Route.useParams()
  const locationState = useLocation({ select: (location) => location.state })
  const modelId = z.string().uuid().safeParse(params.modelId)
  const executionTargetId = executionTargetRouteIdSchema.safeParse(
    params.executionTargetId
  )
  if (!modelId.success || !executionTargetId.success) {
    return <ErrorState title={t('Invalid model monitoring target')} />
  }
  return (
    <ModelMonitoring
      key={executionTargetId.data}
      modelId={modelId.data}
      executionTargetId={executionTargetId.data}
      onSelectTarget={(nextExecutionTargetId) =>
        void navigate({
          to: '/canvas-cloud/model-management/$modelId/monitoring/$executionTargetId',
          params: {
            modelId: modelId.data,
            executionTargetId: nextExecutionTargetId,
          },
          state: (previous) => ({
            ...previous,
            ...forwardModelManagementReturnState(locationState),
          }),
        })
      }
      onBack={() =>
        void navigate({
          to: '/canvas-cloud/model-management',
          search: {},
          state: (previous) => ({
            ...previous,
            ...forwardModelManagementReturnState(locationState),
          }),
        })
      }
    />
  )
}

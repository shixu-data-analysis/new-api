/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import z from 'zod'

import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { getServerErrorStatus } from '@/lib/server-error-message'
import { getCanvasModelMonitoringTargets } from '@/features/canvas-cloud/api'

export const Route = createFileRoute(
  '/_authenticated/canvas-cloud/model-management/$modelId/monitoring/'
)({
  component: LegacyModelMonitoringRoute,
})

function LegacyModelMonitoringRoute() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = Route.useParams()
  const modelId = z.string().uuid().safeParse(params.modelId)
  const validModelId = modelId.success ? modelId.data : ''
  const targets = useQuery({
    queryKey: ['canvas-cloud', 'model-monitoring-targets', validModelId],
    queryFn: ({ signal }) => getCanvasModelMonitoringTargets(validModelId, signal),
    enabled: modelId.success,
  })

  useEffect(() => {
    if (!modelId.success || targets.data?.targets.length !== 1) return
    void navigate({
      to: '/canvas-cloud/model-management/$modelId/monitoring/$executionTargetId',
      params: { modelId: validModelId, executionTargetId: targets.data.targets[0].id },
      replace: true,
    })
  }, [modelId.success, navigate, targets.data, validModelId])

  if (!modelId.success) {
    return <ErrorState title={t('Invalid model monitoring target')} />
  }
  if (targets.isError) {
    const status = getServerErrorStatus(targets.error)
    const title =
      status === 401 || status === 403
        ? t('You are not allowed to view this model monitoring.')
        : status === 404
          ? t('The requested model was not found or is unavailable.')
          : t('Unable to load execution targets')
    return <ErrorState title={title} onRetry={() => void targets.refetch()} />
  }
  if (!targets.data) return <p>{t('Loading model monitoring...')}</p>
  if (targets.data.customerModel.id !== validModelId) {
    return <ErrorState title={t('Invalid model monitoring target')} />
  }
  if (targets.data.targets.length === 0) {
    return <ErrorState title={t('No execution targets are available for this model.')} />
  }
  if (targets.data.targets.length === 1) {
    return <p role='status'>{t('Loading model monitoring...')}</p>
  }

  return (
    <section className='space-y-4' aria-label={t('Execution targets')}>
      <div className='space-y-1'>
        <Button
          variant='outline'
          onClick={() =>
            void navigate({ to: '/canvas-cloud/model-management', search: {} })
          }
        >
          {t('Back to model list')}
        </Button>
        <h2 className='text-sm font-medium'>{targets.data.customerModel.name}</h2>
        <p className='text-muted-foreground text-sm'>
          {t('Select an execution target to view its monitoring.')}
        </p>
      </div>
      <div className='grid gap-2'>
        {targets.data.targets.map((target) => (
          <Button
            key={target.id}
            type='button'
            variant='outline'
            className='h-auto justify-start whitespace-normal p-3 text-start'
            onClick={() =>
              void navigate({
                to: '/canvas-cloud/model-management/$modelId/monitoring/$executionTargetId',
                params: { modelId: validModelId, executionTargetId: target.id },
              })
            }
          >
            <span>
              {target.channelId} · {target.upstreamModelId}
              {target.parameterCombinations.length
                ? ` · ${target.parameterCombinations.map((combination) => combination.label).join(' · ')}`
                : ''}
            </span>
          </Button>
        ))}
      </div>
    </section>
  )
}

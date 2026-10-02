/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle } from '@/components/ui/card'

import {
  cancelCanvasExecutorDrain,
  startCanvasExecutorDrain,
} from '../execution-api'
import type { ExecutorDrainState } from '../execution-types'
import { formatCanvasDateTime } from '../formatters'
import { executorDrainQueryKey, useExecutorDrain } from '../use-executor-drain'
import { PricingActionConfirmation } from './PricingActionConfirmation'

type DrainAction = 'start' | 'extend' | 'cancel'

const factValueClass = {
  warning: 'text-lg font-semibold tabular-nums text-destructive',
  good: 'text-lg font-semibold tabular-nums text-green-600 dark:text-green-400',
  plain: 'text-lg font-semibold tabular-nums',
} as const

function Fact(props: {
  label: string
  value: number
  hint: string
  emphasis?: keyof typeof factValueClass
}) {
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground text-sm'>{props.label}</dt>
      <dd className={factValueClass[props.emphasis ?? 'plain']}>
        {props.value}
      </dd>
      <p className='text-muted-foreground text-xs'>{props.hint}</p>
    </div>
  )
}

export function ExecutorDrain() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const drain = useExecutorDrain()
  const [confirming, setConfirming] = useState(false)
  const update = useMutation({
    mutationFn: (action: DrainAction) =>
      action === 'cancel'
        ? cancelCanvasExecutorDrain()
        : startCanvasExecutorDrain(),
    onSuccess: (state: ExecutorDrainState, action) => {
      // The row may be a few seconds old: extending a drain that has just expired starts a new one, and says so.
      const previous = queryClient.getQueryData<ExecutorDrainState>(
        executorDrainQueryKey
      )
      const startedAnew =
        action === 'extend' && previous?.drainId !== state.drainId
      queryClient.setQueryData(executorDrainQueryKey, state)
      setConfirming(false)
      if (action === 'cancel') {
        toast.success(t('Draining cancelled'))
      } else if (action === 'start' || startedAnew) {
        toast.success(t('Draining started'))
      } else {
        toast.success(t('Draining extended by 60 minutes'))
      }
    },
    onError: () => toast.error(t('Draining update failed')),
  })
  const state = drain.data
  const draining = state?.draining === true
  let summary: string
  if (drain.isPending) {
    summary = t('Loading')
  } else if (drain.isError) {
    summary = t('Draining state could not be loaded')
  } else if (draining) {
    summary = t('Started {{started}} · Resumes automatically {{expires}}', {
      started: formatCanvasDateTime(state.startedAt),
      expires: formatCanvasDateTime(state.expiresAt),
    })
  } else {
    summary = t(
      'Use before a restart or maintenance. Only stops claiming new tasks.'
    )
  }
  let actions: React.ReactNode
  if (drain.isError) {
    actions = (
      <Button variant='outline' onClick={() => void drain.refetch()}>
        {t('Retry')}
      </Button>
    )
  } else if (draining) {
    actions = (
      <>
        <Button
          variant='outline'
          disabled={update.isPending}
          onClick={() => update.mutate('extend')}
        >
          {t('Extend by 60 minutes')}
        </Button>
        <Button
          variant='outline'
          disabled={update.isPending}
          onClick={() => update.mutate('cancel')}
        >
          {t('Cancel draining')}
        </Button>
      </>
    )
  } else {
    actions = (
      <Button
        disabled={!state || update.isPending}
        onClick={() => setConfirming(true)}
      >
        {t('Start draining')}
      </Button>
    )
  }
  return (
    <>
      <Card size='sm'>
        <CardContent>
          <section
            aria-labelledby='executor-drain-title'
            className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'
          >
            <div className='min-w-0 space-y-1 lg:max-w-sm'>
              <div className='flex flex-wrap items-center gap-2'>
                <CardTitle id='executor-drain-title'>{t('Drain')}</CardTitle>
                {state ? (
                  <Badge variant={draining ? 'secondary' : 'outline'}>
                    {draining ? t('Draining') : t('Accepting tasks')}
                  </Badge>
                ) : null}
              </div>
              <p className='text-muted-foreground text-sm'>{summary}</p>
            </div>
            {state ? (
              <dl className='grid flex-1 gap-4 sm:grid-cols-2 lg:max-w-xl'>
                <Fact
                  label={t('Restart would harm')}
                  value={state.inFlight.harmedByRestart}
                  hint={t('Being submitted, no upstream task ID yet')}
                  emphasis={
                    state.inFlight.harmedByRestart === 0 ? 'good' : 'warning'
                  }
                />
                <Fact
                  label={t('Continues after restart')}
                  value={state.inFlight.continuingAfterRestart}
                  hint={t(
                    'Submitted to the API provider, waiting for the result or retrieving it'
                  )}
                />
              </dl>
            ) : (
              <div className='flex-1' />
            )}
            <div className='flex flex-wrap gap-2 lg:justify-end'>{actions}</div>
          </section>
        </CardContent>
      </Card>
      <PricingActionConfirmation
        open={confirming}
        onOpenChange={setConfirming}
        title={t('Start draining')}
        description={t(
          'All executor instances stop claiming new tasks. Tasks already being processed finish, and newly submitted tasks are still accepted and queued.'
        )}
        details={[
          {
            label: t('Scope'),
            value: t('All executor instances of this environment'),
          },
          { label: t('Automatic expiry'), value: t('After 60 minutes') },
          {
            label: t('Resumes when'),
            value: t(
              'Draining is cancelled, an executor instance restarts, or it expires'
            ),
          },
          {
            label: t('Restart would harm now'),
            value: String(state?.inFlight.harmedByRestart ?? 0),
          },
        ]}
        confirmLabel={t('Start draining')}
        pending={update.isPending}
        onConfirm={() => update.mutate('start')}
      />
    </>
  )
}

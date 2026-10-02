/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle } from '@/components/ui/card'

import {
  cancelCanvasExecutorDrain,
  getCanvasExecutorDrain,
  startCanvasExecutorDrain,
} from '../execution-api'
import type { ExecutorDrainState } from '../execution-types'
import { formatCanvasDateTime } from '../formatters'
import { PricingActionConfirmation } from './PricingActionConfirmation'

// Under the execution key so the page's own refresh also refreshes the drain row.
export const executorDrainQueryKey = [
  'canvas-cloud',
  'execution',
  'drain',
] as const

/** Shared by the drain row and the tab marker; refreshes every 5 seconds only while draining. */
export function useExecutorDrain() {
  return useQuery({
    queryKey: executorDrainQueryKey,
    queryFn: ({ signal }) => getCanvasExecutorDrain(signal),
    refetchInterval: (query) => (query.state.data?.draining ? 5_000 : false),
  })
}

function Fact(props: {
  label: string
  value: number
  hint: string
  emphasis?: 'warning' | 'good'
}) {
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground text-sm'>{props.label}</dt>
      <dd
        className={
          props.emphasis === 'warning'
            ? 'text-lg font-semibold tabular-nums text-destructive'
            : props.emphasis === 'good'
              ? 'text-lg font-semibold tabular-nums text-green-600 dark:text-green-400'
              : 'text-lg font-semibold tabular-nums'
        }
      >
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
    mutationFn: (action: 'start' | 'extend' | 'cancel') =>
      action === 'cancel'
        ? cancelCanvasExecutorDrain()
        : startCanvasExecutorDrain(),
    onSuccess: (state: ExecutorDrainState, action) => {
      queryClient.setQueryData(executorDrainQueryKey, state)
      setConfirming(false)
      toast.success(
        action === 'start'
          ? t('Draining started')
          : action === 'extend'
            ? t('Draining extended by 60 minutes')
            : t('Draining cancelled')
      )
    },
    onError: () => toast.error(t('Draining update failed')),
  })
  const state = drain.data
  const draining = state?.draining === true
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
              {drain.isPending ? (
                <p className='text-muted-foreground text-sm'>{t('Loading')}</p>
              ) : drain.isError ? (
                <p className='text-muted-foreground text-sm'>
                  {t('Draining state could not be loaded')}
                </p>
              ) : draining ? (
                <p className='text-muted-foreground text-sm'>
                  {t('Started {{started}} · Resumes automatically {{expires}}', {
                    started: formatCanvasDateTime(state.startedAt),
                    expires: formatCanvasDateTime(state.expiresAt),
                  })}
                </p>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'Use before a restart or maintenance. Only stops claiming new tasks.'
                  )}
                </p>
              )}
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
            <div className='flex flex-wrap gap-2 lg:justify-end'>
              {drain.isError ? (
                <Button variant='outline' onClick={() => void drain.refetch()}>
                  {t('Retry')}
                </Button>
              ) : draining ? (
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
              ) : (
                <Button
                  disabled={!state || update.isPending}
                  onClick={() => setConfirming(true)}
                >
                  {t('Start draining')}
                </Button>
              )}
            </div>
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

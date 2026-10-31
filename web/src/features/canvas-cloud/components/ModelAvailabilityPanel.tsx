/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getServerErrorStatus } from '@/lib/server-error-message'

import { formatCanvasDateTime } from '../formatters'
import {
  getModelAvailability,
  modelAvailabilityBadgeQueryKey,
  modelAvailabilityQueryKey,
  probeFailureKey,
  startModelAvailabilityProbe,
  type AvailabilityTarget,
  type MissingModel,
} from '../model-availability-api'
import { probedUpstreamIds } from '../model-availability-rules'
import { LogicalModelControlDialog } from './LogicalModelControlDialog'
import { ModelAvailabilityBulkDisableDialog } from './ModelAvailabilityBulkDisableDialog'
import { ModelAvailabilitySettingsDialog } from './ModelAvailabilitySettingsDialog'

function MissingTable(props: {
  title: string
  models: MissingModel[]
  onControl: (model: MissingModel) => void
}) {
  const { t } = useTranslation()
  return (
    <div className='overflow-x-auto rounded-lg border'>
      <Table className='min-w-[680px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{props.title}</TableHead>
            <TableHead>{t('API provider')}</TableHead>
            <TableHead>{t('First missing')}</TableHead>
            <TableHead className='text-center'>{t('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.models.map((model) => (
            <TableRow key={model.modelKey}>
              <TableCell>
                <div className='font-medium'>{model.displayName}</div>
                <div className='text-muted-foreground font-mono text-xs'>
                  {model.upstreamIds.join(', ')}
                </div>
              </TableCell>
              <TableCell>
                {model.providerName}
                {model.credentialGroupName ? (
                  <div className='text-muted-foreground text-xs'>
                    {t('API Key group: {{name}}', {
                      name: model.credentialGroupName,
                    })}
                  </div>
                ) : null}
              </TableCell>
              <TableCell className='tabular-nums'>
                {formatCanvasDateTime(model.firstMissingAt)}
              </TableCell>
              <TableCell className='text-center'>
                <Button
                  size='sm'
                  variant={model.enabled ? 'destructive' : 'outline'}
                  onClick={() => props.onControl(model)}
                >
                  {model.enabled ? t('Disable model') : t('Restore model')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function failureText(
  target: AvailabilityTarget,
  t: ReturnType<typeof useTranslation>['t'],
  autoProbeEnabled: boolean
) {
  if (target.awaitingConfirmation) {
    return autoProbeEnabled
      ? t('The rule was changed. The next round will confirm it.')
      : t('The rule was changed. Click Probe now to confirm it.')
  }
  if (target.failureReason === 'UNDETERMINED') {
    return t(
      '{{count}} models need checking: the answer matches no rule. They may be gone, or the error may have changed.',
      { count: target.failureDetail?.models?.length ?? 0 }
    )
  }
  return t(probeFailureKey(target.failureReason))
}

export function ModelAvailabilityPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editRuleFor, setEditRuleFor] = useState<string | null>(null)
  const [control, setControl] = useState<MissingModel | null>(null)
  const [showHandled, setShowHandled] = useState(false)
  const query = useQuery({
    queryKey: modelAvailabilityQueryKey,
    queryFn: ({ signal }) => getModelAvailability(signal),
    // Every page shows a round that any administrator or the schedule started.
    refetchInterval: (state) => (state.state.data?.run ? 2_000 : 60_000),
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: modelAvailabilityQueryKey })
    void queryClient.invalidateQueries({
      queryKey: modelAvailabilityBadgeQueryKey,
    })
  }
  const probe = useMutation({
    mutationFn: startModelAvailabilityProbe,
    onSettled: refresh,
  })

  // A MOCK environment has no probing service, because probes reach real providers.
  if (query.isError && getServerErrorStatus(query.error) === 503) {
    return (
      <p className='text-muted-foreground py-10 text-center text-sm'>
        {t('Probing is not available in this environment.')}
      </p>
    )
  }
  if (query.isError) {
    return (
      <div className='space-y-3 py-10 text-center'>
        <p className='font-medium'>{t('The alert failed to load')}</p>
        <Button variant='outline' onClick={() => void query.refetch()}>
          {t('Retry')}
        </Button>
      </div>
    )
  }
  const data = query.data
  if (!data) {
    return <p className='text-muted-foreground text-sm'>{t('Loading...')}</p>
  }

  const { counts, coverage, settings, run } = data
  const pending = data.models.filter((model) => model.enabled)
  const handled = data.models.filter((model) => !model.enabled)
  const failed = data.targets.filter(
    (target) => target.alerting && target.failureReason !== 'COST_RISK'
  )
  const paused = data.providers.filter((provider) => provider.pause)
  const paidRequests = data.providers.reduce((total, provider) => {
    if (provider.source !== 'CUSTOM' || provider.rule?.type !== 'REQUEST') {
      return total
    }
    if (provider.pause) return total
    return total + probedUpstreamIds(provider.models, provider.rule.auth).length
  }, 0)
  const openRule = (providerId: string) => {
    setEditRuleFor(providerId)
    setSettingsOpen(true)
  }
  const startProbe = () => {
    if (
      paidRequests > 0 &&
      !window.confirm(
        t(
          'This round sends {{count}} requests that may be charged. Check the cost in the provider console afterwards. Continue?',
          { count: paidRequests }
        )
      )
    ) {
      return
    }
    probe.mutate()
  }
  let probeLabel = t('Probe now')
  // A round with no progress lost its process: the next one takes it over.
  const running = Boolean(run) && !run?.stale
  if (run && running) {
    probeLabel = t(
      run.trigger === 'SCHEDULED'
        ? 'System probing ({{done}} / {{total}})'
        : 'Probing ({{done}} / {{total}})',
      { done: run.doneTargets, total: run.totalTargets }
    )
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='space-y-1'>
          <p className='text-sm font-medium'>
            {t(
              'Missing models {{missing}} · Failed probes {{failed}} · Paused {{paused}}',
              counts
            )}
          </p>
          <p className='text-muted-foreground text-sm'>
            {settings.autoProbeEnabled
              ? t('Probes automatically every {{hours}} hours.', {
                  hours: settings.intervalHours,
                })
              : t(
                  'Automatic probing is off. Click Probe now to probe by hand.'
                )}{' '}
            {t('An alert appears after {{count}} absences in a row.', {
              count: settings.threshold,
            })}{' '}
            {t('Probed {{done}} / {{total}} targets.', {
              done: coverage.probedTargets,
              total: coverage.totalTargets,
            })}{' '}
            {coverage.unboundProviders.length
              ? `${t('{{count}} providers have no API Key group and cannot be probed: {{names}}.', { count: coverage.unboundProviders.length, names: coverage.unboundProviders.join(', ') })} `
              : ''}
            {coverage.offProviders.length
              ? `${t('{{count}} providers are set not to probe: {{names}}.', { count: coverage.offProviders.length, names: coverage.offProviders.join(', ') })} `
              : ''}
            {t('Last successful probe: {{time}}', {
              time: data.lastSuccessAt
                ? formatCanvasDateTime(data.lastSuccessAt)
                : t('None'),
            })}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            disabled={running || probe.isPending}
            onClick={startProbe}
          >
            {probeLabel}
          </Button>
          <Button
            variant='outline'
            disabled={pending.length === 0}
            onClick={() => setBulkOpen(true)}
          >
            {t('Disable all ({{count}})', { count: pending.length })}
          </Button>
          <Button variant='outline' onClick={() => setSettingsOpen(true)}>
            {t('Settings')}
          </Button>
        </div>
      </div>

      {probe.isError ? (
        <p role='alert' className='text-destructive text-sm'>
          {getServerErrorStatus(probe.error) === 409
            ? t('A probe round is already running.')
            : t('The probe could not start. Try again.')}
        </p>
      ) : null}

      {paused.map((provider) => (
        <div
          key={provider.providerId}
          className='border-destructive/40 bg-destructive/5 flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3'
        >
          <div className='space-y-1'>
            <p className='text-sm font-medium'>
              {t('Probing of {{name}} is paused: it may have been charged', {
                name: provider.providerName,
              })}
            </p>
            <p className='text-muted-foreground text-sm'>
              {t(
                provider.pause?.reason === 'TIMEOUT'
                  ? 'Probing {{model}} timed out at {{time}}. The provider may still be generating.'
                  : 'Probing {{model}} succeeded at {{time}}, so the provider did not reject the request.',
                {
                  model: provider.pause?.modelKey,
                  time: formatCanvasDateTime(provider.pause?.pausedAt ?? ''),
                }
              )}{' '}
              {t(
                'Check the cost in the provider console, change the request, then test it again. No model was disabled.'
              )}
            </p>
          </div>
          <Button
            size='sm'
            variant='outline'
            onClick={() => openRule(provider.providerId)}
          >
            {t('Handle')}
          </Button>
        </div>
      ))}

      {failed.length ? (
        <div className='rounded-lg border border-amber-500/40 bg-amber-500/5 p-3'>
          <p className='text-sm font-medium'>
            {t('{{count}} failed probes. This does not mean a model is gone.', {
              count: failed.length,
            })}
          </p>
          <ul className='mt-2 space-y-2'>
            {failed.map((target) => (
              <li
                key={target.key}
                className='flex flex-wrap items-start justify-between gap-3'
              >
                <div className='text-muted-foreground min-w-0 text-sm'>
                  <p>
                    {target.providerName}
                    {target.credentialGroupName
                      ? ` (${t('API Key group: {{name}}', { name: target.credentialGroupName })})`
                      : ''}
                    {': '}
                    {failureText(target, t, settings.autoProbeEnabled)}{' '}
                    {t('Last success: {{time}}', {
                      time: target.lastSuccessAt
                        ? formatCanvasDateTime(target.lastSuccessAt)
                        : t('None'),
                    })}
                  </p>
                  {target.failureDetail?.models?.length ? (
                    <p className='font-mono text-xs break-all'>
                      {target.failureDetail.models.join(', ')}
                    </p>
                  ) : null}
                  {target.failureDetail?.response ? (
                    <p className='font-mono text-xs break-all'>
                      {target.failureDetail.response}
                    </p>
                  ) : null}
                </div>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => openRule(target.providerId)}
                >
                  {t('View settings')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.models.length === 0 ? (
        <div className='space-y-1 py-10 text-center'>
          <p className='font-medium'>{t('No confirmed model absences')}</p>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Models not yet probed, with failed probes, or below the count do not appear here.'
            )}
          </p>
        </div>
      ) : (
        <>
          {pending.length ? (
            <MissingTable
              title={t('Missing models to handle ({{count}})', {
                count: pending.length,
              })}
              models={pending}
              onControl={setControl}
            />
          ) : null}
          {handled.length ? (
            <div className='space-y-2'>
              <Button
                variant='link'
                className='h-auto p-0'
                aria-expanded={showHandled}
                onClick={() => setShowHandled((value) => !value)}
              >
                {t(
                  showHandled
                    ? 'Hide handled ({{count}})'
                    : 'Show handled ({{count}})',
                  {
                    count: handled.length,
                  }
                )}
              </Button>
              {showHandled ? (
                <MissingTable
                  title={t('Disabled models')}
                  models={handled}
                  onControl={setControl}
                />
              ) : null}
            </div>
          ) : null}
        </>
      )}

      {settingsOpen ? (
        <ModelAvailabilitySettingsDialog
          overview={data}
          initialRuleProviderId={editRuleFor}
          onClose={() => {
            setSettingsOpen(false)
            setEditRuleFor(null)
          }}
          onSaved={refresh}
        />
      ) : null}
      {bulkOpen ? (
        <ModelAvailabilityBulkDisableDialog
          models={pending}
          onClose={() => setBulkOpen(false)}
          onChanged={refresh}
        />
      ) : null}
      {control ? (
        <LogicalModelControlDialog
          modelKey={control.modelKey}
          name={control.displayName}
          manualEnabled={control.enabled}
          controlVersion={control.controlVersion}
          onClose={() => setControl(null)}
          onChanged={refresh}
        />
      ) : null}
    </div>
  )
}

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
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { getServerErrorStatus } from '@/lib/server-error-message'

import { formatCanvasDateTime } from '../formatters'
import {
  getModelAvailability,
  modelAvailabilityBadgeQueryKey,
  modelAvailabilityQueryKey,
  probeFailureAction,
  probeFailureKey,
  startModelAvailabilityProbe,
  type AvailabilityTarget,
} from '../model-availability-api'
import {
  disabledRows,
  type AvailabilityControl,
} from '../model-availability-rows'
import { probedUpstreamIds } from '../model-availability-rules'
import { LogicalModelControlDialog } from './LogicalModelControlDialog'
import { ModelAvailabilityBulkDisableDialog } from './ModelAvailabilityBulkDisableDialog'
import { ModelAvailabilityModelTable } from './ModelAvailabilityModelTable'
import { ModelAvailabilitySettingsDialog } from './ModelAvailabilitySettingsDialog'
import {
  IgnoreAllListingsButton,
  ModelListingTable,
} from './ModelListingSection'

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
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editRuleFor, setEditRuleFor] = useState<string | null>(null)
  const [control, setControl] = useState<AvailabilityControl | null>(null)
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
        <p className='font-medium'>{t('The listing monitor failed to load')}</p>
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

  const { counts, coverage, settings, run, listing } = data
  // One sentence per failed target, punctuated by each language.
  const failedRowValues = (target: AvailabilityTarget) => ({
    provider: target.providerName,
    group: target.credentialGroupName,
    reason: failureText(target, t, settings.autoProbeEnabled),
    time: target.lastSuccessAt
      ? formatCanvasDateTime(target.lastSuccessAt)
      : t('None'),
  })
  // What the probes do not cover, one kind per line, so long name lists stay readable.
  // Names joined the way the language joins a list: “A、B和C” in Chinese, “A, B, and C” in English.
  const nameList = new Intl.ListFormat(
    toIntlLocale(i18n.resolvedLanguage || i18n.language),
    { type: 'conjunction' }
  )
  const named = (names: string[]) => ({
    count: names.length,
    names: nameList.format(names),
  })
  const gaps = [
    coverage.unboundProviders.length
      ? t(
          '{{count}} providers have no API Key group and cannot be probed: {{names}}.',
          named(coverage.unboundProviders)
        )
      : null,
    coverage.unboundModels.length
      ? t(
          '{{count}} models have no API Key group and are not probed: {{names}}.',
          named(coverage.unboundModels)
        )
      : null,
    coverage.offProviders.length
      ? t(
          '{{count}} providers are set not to probe: {{names}}.',
          named(coverage.offProviders)
        )
      : null,
    listing.pendingBaselineProviders.length
      ? t(
          '{{count}} providers have no listing baseline yet: {{names}}.',
          named(listing.pendingBaselineProviders)
        )
      : null,
    listing.requestRuleProviders.length
      ? t(
          '{{count}} providers use a per-model request rule and are not checked for new models: {{names}}.',
          named(listing.requestRuleProviders)
        )
      : null,
  ].filter((gap): gap is string => gap !== null)
  const pending = data.missingModels
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
  if (run && running && run.trigger === 'TEST') {
    probeLabel = t('Request test running')
  } else if (run && running) {
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
              'Missing models {{missing}} · Disabled {{disabled}} · Failed probes {{failed}} · Paused {{paused}} · New models {{listed}}',
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
            {t('Last successful probe: {{time}}', {
              time: data.lastSuccessAt
                ? formatCanvasDateTime(data.lastSuccessAt)
                : t('None'),
            })}
          </p>
          {gaps.length ? (
            <ul className='text-muted-foreground list-disc space-y-0.5 ps-5 text-sm'>
              {gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          ) : null}
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
          <IgnoreAllListingsButton
            models={listing.models}
            onChanged={refresh}
          />
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
                    {target.credentialGroupName
                      ? t(
                          '{{provider}} (API Key group: {{group}}): {{reason}} Last success: {{time}}',
                          failedRowValues(target)
                        )
                      : t(
                          '{{provider}}: {{reason}} Last success: {{time}}',
                          failedRowValues(target)
                        )}
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
                {probeFailureAction(target) === 'SETTINGS' ? (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => openRule(target.providerId)}
                  >
                    {t('View settings')}
                  </Button>
                ) : null}
                {probeFailureAction(target) === 'PROVIDER_CONFIG' ? (
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() =>
                      void navigate({
                        to: '/canvas-cloud/$section',
                        params: { section: 'runtime' },
                        search: { view: 'provider' },
                      })
                    }
                  >
                    {t('Open API provider configuration')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pending.length === 0 ? (
        <div className='space-y-1 py-10 text-center'>
          <p className='font-medium'>{t('No confirmed model absences')}</p>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Models not yet probed, with failed probes, or below the count do not appear here.'
            )}
          </p>
        </div>
      ) : (
        <ModelAvailabilityModelTable
          title={t('Missing models to handle ({{count}})', {
            count: pending.length,
          })}
          rows={pending.map((model) => ({ kind: 'missing', model }))}
          onControl={setControl}
        />
      )}
      {data.disabledModels.length ? (
        <ModelAvailabilityModelTable
          title={t('Disabled models ({{count}})', {
            count: data.disabledModels.length,
          })}
          rows={disabledRows(data.disabledModels)}
          onControl={setControl}
        />
      ) : null}

      <ModelListingTable models={listing.models} onChanged={refresh} />

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
        />
      ) : null}
      {control ? (
        <LogicalModelControlDialog
          modelKey={control.modelKey}
          name={control.displayName}
          manualEnabled={control.enabled}
          controlVersion={control.controlVersion}
          onClose={() => setControl(null)}
        />
      ) : null}
    </div>
  )
}

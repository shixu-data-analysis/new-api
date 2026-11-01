/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StaticDataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { channelDraftFrom } from '../../catalog-channel-draft'
import {
  getCurrentCatalog,
  planCatalogEdit,
  publishCatalogEdit,
  type CatalogEditPlan,
} from '../../catalog-edit-api'
import { contractOfProfile, profileOfChannel } from '../../catalog-edit-logic'
import type {
  CatalogEditDraft,
  CatalogProviderDefinition,
  CurrentCatalogView,
} from '../../catalog-edit-types'
import { catalogEditErrorText, catalogEditFailure } from './catalog-edit-errors'
import { PromptReferenceRewrites } from './PromptReferenceRewrites'

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function ProviderEditDialog(props: {
  provider: CatalogProviderDefinition
  catalog: CurrentCatalogView
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { provider } = props
  const [name, setName] = useState(provider.internalName)
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl)
  const [confirmHost, setConfirmHost] = useState(false)
  const [plan, setPlan] = useState<CatalogEditPlan | null>(null)
  const [error, setError] = useState<string>()
  const idempotencyKey = useRef(crypto.randomUUID())
  const hostChanged =
    hostOf(baseUrl) !== null && hostOf(baseUrl) !== hostOf(provider.baseUrl)
  const validUrl = (() => {
    try {
      const url = new URL(baseUrl)
      return url.protocol === 'https:' && !url.username && !url.password
    } catch {
      return false
    }
  })()
  const draft: CatalogEditDraft = {
    providers: [
      {
        id: provider.id,
        internalName: name.trim(),
        baseUrl,
        sourceKind: provider.sourceKind,
        credentialSchemes: provider.credentialSchemes,
        confirmHostChange: hostChanged,
      },
    ],
    channels: [],
    models: [],
  }
  const preview = useMutation({
    mutationFn: () => planCatalogEdit(draft),
    onSuccess: (result) => {
      setPlan(result)
      setError(undefined)
    },
    onError: (failure) =>
      setError(catalogEditErrorText(catalogEditFailure(failure), t)),
  })
  const publish = useMutation({
    mutationFn: (expectedPlanToken: string) =>
      publishCatalogEdit({
        draft,
        expectedPlanToken,
        idempotencyKey: idempotencyKey.current,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['canvas-cloud'] })
      toast.success(t('Published'))
      props.onClose()
    },
    onError: (failure) => {
      idempotencyKey.current = crypto.randomUUID()
      setPlan(null)
      setError(catalogEditErrorText(catalogEditFailure(failure), t))
    },
  })
  const channels =
    plan?.changes.filter(
      (change) =>
        change.resourceType === 'PROVIDER_CHANNEL' && change.action !== 'REUSE'
    ) ?? []
  const broken = plan?.requestChanges.filter((change) => !change.after.ok) ?? []
  const versionOf = (productKey: string) => {
    const model = plan?.models.find((entry) => entry.productKey === productKey)
    return model ? `v${model.currentVersion} → v${model.proposedVersion}` : ''
  }
  const { catalog } = props
  const channelsOfProvider = catalog.bundle.channels.filter(
    (channel) => channel.providerId === provider.id
  )
  const impact = channelsOfProvider.map((channel) => {
    const profile = profileOfChannel(catalog, channel.id)
    const contract = profile ? contractOfProfile(catalog, profile) : undefined
    return {
      id: channel.id,
      models: catalog.bundle.models.filter(
        (model) => model.release.channelId === channel.id
      ).length,
      url: `${baseUrl.replace(/\/$/, '')}${profile && contract ? channelDraftFrom(profile, contract).submit.path : ''}`,
    }
  })
  const totalModels = impact.reduce((sum, entry) => sum + entry.models, 0)
  const urlChanged = baseUrl !== provider.baseUrl
  const changes = [
    name.trim() !== provider.internalName
      ? t('Internal name: {{before}} → {{after}}', {
          before: provider.internalName,
          after: name.trim(),
        })
      : '',
    urlChanged
      ? t('Base address: {{before}} → {{after}}', {
          before: provider.baseUrl,
          after: baseUrl,
        })
      : '',
  ].filter(Boolean)
  if (plan) {
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) props.onClose()
        }}
      >
        <DialogContent className='sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>
              {urlChanged
                ? t(
                    'Confirm the base address: {{channels}} Channel configurations and {{models}} models are affected',
                    { channels: impact.length, models: totalModels }
                  )
                : t('Confirm the API provider change')}
            </DialogTitle>
          </DialogHeader>
          <div className='space-y-3 text-sm'>
            <ul className='list-disc space-y-1 pl-5'>
              {changes.map((change) => (
                <li key={change} className='[overflow-wrap:anywhere]'>
                  {change}
                </li>
              ))}
            </ul>
            {urlChanged ? (
              <div className='max-h-64 overflow-auto'>
                <StaticDataTable
                  data={impact}
                  getRowKey={(entry) => entry.id}
                  emptyContent={t('No Channel configurations')}
                  columns={[
                    {
                      id: 'channel',
                      header: t('Channel configuration'),
                      cell: (entry) => (
                        <span className='font-mono text-xs'>{entry.id}</span>
                      ),
                    },
                    {
                      id: 'models',
                      header: t('Model count'),
                      cell: (entry) => (
                        <span className='tabular-nums'>{entry.models}</span>
                      ),
                    },
                    {
                      id: 'url',
                      header: t('Submit address after the change'),
                      cell: (entry) => (
                        <span className='font-mono text-xs [overflow-wrap:anywhere]'>
                          {entry.url}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            ) : null}
            {urlChanged ? (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'New tasks use the new address; quoted and running tasks keep the old one.'
                )}
              </p>
            ) : null}
            {channels.length ? (
              <ul className='font-mono text-xs tabular-nums'>
                {channels.map((change) => (
                  <li key={change.key}>
                    {change.key} v{change.currentVersion} → v
                    {change.proposedVersion}
                  </li>
                ))}
              </ul>
            ) : null}
            {plan.models.length ? (
              <ul className='max-h-32 overflow-auto font-mono text-xs tabular-nums'>
                {plan.models
                  .filter((model) => model.action !== 'NO_OP')
                  .map((model) => (
                    <li key={model.productKey}>
                      {model.productKey} {versionOf(model.productKey)}
                    </li>
                  ))}
              </ul>
            ) : null}
            {hostChanged ? (
              <div className='flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3'>
                <Checkbox
                  id='provider-host'
                  checked={confirmHost}
                  onCheckedChange={(next) => setConfirmHost(next === true)}
                />
                <Label htmlFor='provider-host' className='font-normal'>
                  {t(
                    'The domain changes. The API Key of this provider will be sent to {{host}}. I confirm this address belongs to the same provider.',
                    { host: hostOf(baseUrl) }
                  )}
                </Label>
              </div>
            ) : null}
            <PromptReferenceRewrites plan={plan} />
            {broken.length ? (
              <p role='alert' className='text-destructive'>
                {t('Cannot publish: {{count}} models would not work', {
                  count: broken.length,
                })}
              </p>
            ) : null}
            {error ? (
              <p role='alert' className='text-destructive'>
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setPlan(null)}>
              {t('Back')}
            </Button>
            <Button
              variant={hostChanged ? 'destructive' : 'default'}
              disabled={
                plan.blocking ||
                publish.isPending ||
                (hostChanged && !confirmHost)
              }
              onClick={() => publish.mutate(plan.planToken)}
            >
              {t('Publish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {t('Edit API provider: {{name}}', { name: provider.internalName })}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-3 text-sm'>
          {error ? (
            <p role='alert' className='text-destructive'>
              {error}
            </p>
          ) : null}
          <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
            <dt className='text-muted-foreground'>{t('Code')}</dt>
            <dd className='m-0 font-mono'>
              {t('{{code}} (cannot change after creation)', {
                code: provider.id,
              })}
            </dd>
            <dt className='text-muted-foreground'>{t('Source type')}</dt>
            <dd className='m-0 font-mono'>{provider.sourceKind}</dd>
            <dt className='text-muted-foreground'>
              {t('Authentication scheme')}
            </dt>
            <dd className='m-0 font-mono'>
              {provider.credentialSchemes.join(t(', '))}
            </dd>
          </dl>
          <div className='grid gap-1.5'>
            <Label htmlFor='provider-name'>{t('Internal name')}</Label>
            <Input
              id='provider-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='provider-url'>{t('Base address')}</Label>
            <Input
              id='provider-url'
              aria-invalid={!validUrl}
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value)
                setConfirmHost(false)
              }}
            />
            <p className='text-muted-foreground text-xs'>
              {t(
                'The requests of all its Channel configurations go to this address.'
              )}
            </p>
            {!validUrl ? (
              <p role='alert' className='text-destructive text-xs'>
                {t('Use an HTTPS address without an account or password')}
              </p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={
              !validUrl ||
              !name.trim() ||
              (name.trim() === provider.internalName && !urlChanged) ||
              preview.isPending
            }
            onClick={() => preview.mutate()}
          >
            {t('Next: view the impact')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProvidersPanel() {
  const { t } = useTranslation()
  const catalog = useQuery({
    queryKey: ['canvas-cloud', 'model-catalog', 'current'],
    queryFn: getCurrentCatalog,
  })
  const [editing, setEditing] = useState<CatalogProviderDefinition | null>(null)
  if (catalog.isPending) {
    return <p className='text-muted-foreground text-sm'>{t('Loading')}</p>
  }
  if (catalog.isError) {
    return (
      <p role='alert' className='text-destructive text-sm'>
        {t('The catalog could not be loaded.')}
      </p>
    )
  }
  const { bundle, sources } = catalog.data
  const channelsOf = (providerId: string) =>
    bundle.channels.filter((channel) => channel.providerId === providerId)
  return (
    <Card>
      <CardContent>
        <StaticDataTable
          data={[...bundle.providers].sort((left, right) =>
            left.internalName.localeCompare(right.internalName)
          )}
          getRowKey={(provider) => provider.id}
          emptyContent={t('No API providers')}
          columns={[
            {
              id: 'name',
              header: t('API provider'),
              cell: (provider) => (
                <>
                  <div className='font-medium'>{provider.internalName}</div>
                  <div className='text-muted-foreground font-mono text-xs'>
                    {provider.id}
                  </div>
                </>
              ),
            },
            {
              id: 'url',
              header: t('Base address'),
              cell: (provider) => (
                <span className='font-mono text-xs break-all'>
                  {provider.baseUrl}
                </span>
              ),
            },
            {
              id: 'channels',
              header: t('Channel configuration'),
              cell: (provider) => (
                <span className='tabular-nums'>
                  {channelsOf(provider.id).length}
                </span>
              ),
            },
            {
              id: 'models',
              header: t('Model count'),
              cell: (provider) => (
                <span className='tabular-nums'>
                  {
                    bundle.models.filter((model) =>
                      channelsOf(provider.id).some(
                        (channel) => channel.id === model.release.channelId
                      )
                    ).length
                  }
                </span>
              ),
            },
            {
              id: 'source',
              header: t('Source'),
              cell: (provider) =>
                sources.providers[provider.id] === 'ADMIN'
                  ? t('Admin edit')
                  : t('Bundle, short'),
            },
            {
              id: 'actions',
              header: t('Actions'),
              cell: (provider) => (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setEditing(provider)}
                >
                  {t('Edit')}
                </Button>
              ),
            },
          ]}
        />
      </CardContent>
      {editing ? (
        <ProviderEditDialog
          provider={editing}
          catalog={catalog.data}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </Card>
  )
}

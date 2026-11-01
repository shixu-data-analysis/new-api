/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { StaticDataTable } from '@/components/data-table'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

import { getCurrentCatalog } from '../../catalog-edit-api'
import { unsupportedProfileFields } from '../../catalog-channel-draft'
import { contractOfProfile, profileOfChannel } from '../../catalog-edit-logic'
import { useOptionalModelManagementNavigation } from '../../model-management-navigation-hooks'
import { initialListState } from '../../model-management-navigation-state'
import { ChannelEditor, type ChannelEditorMode } from './ChannelEditor'
import { ChannelRetireDialog } from './ChannelRetireDialog'
import { ModelEditor } from './ModelEditor'
import { UnsupportedFieldsBadge, workflowShortLabel } from './EditFields'
import { NewModelsPage } from './NewModelsPage'

export function ChannelsPanel(props: {
  onEditPresentation?: (modelKey: string) => void
  /** Opened from a model: this row is marked and brought into view. */
  focusChannel?: string | null
  onViewModels?: () => void
}) {
  const { t } = useTranslation()
  const catalog = useQuery({ queryKey: ['canvas-cloud', 'model-catalog', 'current'], queryFn: getCurrentCatalog })
  const [editor, setEditor] = useState<ChannelEditorMode | null>(null)
  const [addingModel, setAddingModel] = useState<string | null>(null)
  const [editingModel, setEditingModel] = useState<string | null>(null)
  const navigation = useOptionalModelManagementNavigation()
  const [capability, setCapability] = useState('all')
  const [provider, setProvider] = useState('all')
  const [workflow, setWorkflow] = useState('all')
  const focusChannel = props.focusChannel ?? null
  const loaded = catalog.isSuccess
  useEffect(() => {
    if (!focusChannel || !loaded) return
    document.querySelector(`[data-channel-row="${CSS.escape(focusChannel)}"]`)?.scrollIntoView({ block: 'center' })
  }, [focusChannel, loaded])
  const [viewing, setViewing] = useState<string | null>(null)
  const [retiring, setRetiring] = useState<string | null>(null)
  const editPresentation = props.onEditPresentation ?? (() => undefined)
  if (editingModel) return <ModelEditor mode={{ kind: 'edit', modelKey: editingModel }} onClose={() => setEditingModel(null)} onEditPresentation={editPresentation} />
  if (editor) return <ChannelEditor mode={editor} onClose={() => setEditor(null)} onEditPresentation={editPresentation} onEditModel={(modelKey) => { setEditor(null); setEditingModel(modelKey) }} />
  if (addingModel) return <NewModelsPage channelId={addingModel} shared={{ extraDraft: { providers: [], channels: [] }, onNewChannel: () => { setAddingModel(null); setEditor({ kind: 'new' }) } }} onClose={() => setAddingModel(null)} onEditPresentation={editPresentation} />
  if (catalog.isPending) return <p className='text-muted-foreground text-sm'>{t('Loading')}</p>
  if (catalog.isError) return <p role='alert' className='text-destructive text-sm'>{t('The catalog could not be loaded.')}</p>
  const { bundle, sources } = catalog.data
  const capabilityLabels: Record<string, string> = { 'image.generate': t('Image generation'), 'video.generate': t('Video generation'), 'chat.generate': t('Text generation') }
  const documentsOf = (channelId: string) => {
    const profile = profileOfChannel(catalog.data, channelId)
    return { profile, contract: profile ? contractOfProfile(catalog.data, profile) : undefined }
  }
  const profileOf = (channelId: string) => profileOfChannel(catalog.data, channelId)
  const present = (values: unknown[]) => [...new Set(values.map(String))]
  const filterGroups: Array<{ label: string; value: string; set: (next: string) => void; options: Array<[string, string]> }> = [
    { label: t('API provider'), value: provider, set: setProvider, options: [['all', t('All API providers')], ...present(bundle.channels.map((channel) => channel.providerId)).map((id): [string, string] => [id, bundle.providers.find((entry) => entry.id === id)?.internalName ?? id])] },
    { label: t('Generation type'), value: capability, set: setCapability, options: [['all', t('All types')], ...present(bundle.channels.map((channel) => profileOf(channel.id)?.kind)).map((kind): [string, string] => [kind, capabilityLabels[kind] ?? kind])] },
    { label: t('Call method'), value: workflow, set: setWorkflow, options: [['all', t('All call methods')], ...present(bundle.channels.map((channel) => profileOf(channel.id)?.workflow)).map((value): [string, string] => [value, workflowShortLabel(t, value)])] },
  ]
  const filterGroup = (group: (typeof filterGroups)[number]) => (
    <section key={group.label} className='space-y-2' aria-label={group.label}>
      <p className='text-sm font-medium'>{group.label}</p>
      <div className='flex flex-wrap gap-2' role='group' aria-label={group.label}>
        {group.options.map(([value, label]) => (
          <Button key={value} variant={group.value === value ? 'default' : 'outline'} aria-pressed={group.value === value} onClick={() => group.set(value)}>{label}</Button>
        ))}
      </div>
    </section>
  )
  // A row opened from a model stays visible whatever the filters say.
  const rows = bundle.channels.filter((channel) => channel.id === focusChannel || (
    (capability === 'all' || String(profileOf(channel.id)?.kind) === capability)
    && (provider === 'all' || channel.providerId === provider)
    && (workflow === 'all' || String(profileOf(channel.id)?.workflow) === workflow)
  )).sort((left, right) => left.id.localeCompare(right.id))
  const modelCounts = new Map<string, number>()
  for (const model of bundle.models) modelCounts.set(model.release.channelId, (modelCounts.get(model.release.channelId) ?? 0) + 1)
  const viewModels = (channelId: string) => {
    if (navigation) {
      // The count is of this Channel's models, so nothing from an earlier look at the list may narrow them; how the list is laid out stays.
      const { pagination, disabledPagination, sorting, columnVisibility } = navigation.listState
      navigation.updateListState({
        ...initialListState,
        channel: channelId,
        showDisabled: true,
        pagination: { ...pagination, pageIndex: 0 },
        disabledPagination: { ...disabledPagination, pageIndex: 0 },
        sorting,
        columnVisibility,
      })
    }
    props.onViewModels?.()
  }
  return (
    <Card>
      <CardContent className='space-y-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0 flex-1 space-y-4'>
          {filterGroup(filterGroups[0]!)}
          <div className='flex flex-wrap gap-x-8 gap-y-4'>
            {filterGroups.slice(1).map(filterGroup)}
          </div>
        </div>
        <Button onClick={() => setEditor({ kind: 'new' })}><Plus aria-hidden='true' />{t('New Channel configuration')}</Button>
      </div>
      <StaticDataTable
        data={rows}
        getRowKey={(channel) => channel.id}
        emptyContent={t('No Channel configurations')}
        columns={[
          {
            id: 'code',
            header: t('Channel configuration'),
            cell: (channel) => (
              <span data-channel-row={channel.id} className={`font-mono font-medium break-all ${channel.id === focusChannel ? 'bg-primary/10 text-primary rounded-md px-1.5 py-0.5' : ''}`}>
                {channel.id}
                <UnsupportedFieldsBadge paths={unsupportedProfileFields(profileOfChannel(catalog.data, channel.id))} />
                {viewing === channel.id ? <pre className='mt-2 max-h-80 max-w-xl overflow-auto rounded-lg border p-2 text-xs'>{JSON.stringify(documentsOf(channel.id), null, 2)}</pre> : null}
              </span>
            ),
          },
          { id: 'provider', header: t('API provider'), cell: (channel) => bundle.providers.find((entry) => entry.id === channel.providerId)?.internalName },
          { id: 'type', header: t('Generation type'), cell: (channel) => capabilityLabels[String(profileOfChannel(catalog.data, channel.id)?.kind)] },
          { id: 'workflow', header: t('Call method'), cell: (channel) => workflowShortLabel(t, profileOfChannel(catalog.data, channel.id)?.workflow) },
          { id: 'models', header: t('Model count'), cell: (channel) => {
            const count = modelCounts.get(channel.id) ?? 0
            if (!count) return <span className='tabular-nums'>0</span>
            return <button type='button' className='text-primary tabular-nums hover:underline' aria-label={t('View the {{count}} models of {{channel}}', { count, channel: channel.id })} onClick={() => viewModels(channel.id)}>{count}</button>
          } },
          { id: 'source', header: t('Source'), cell: (channel) => (sources.channels[channel.id] !== 'ADMIN' ? t('Bundle, short') : catalog.data.versions.channels[channel.id] === 1 ? t('Admin new') : t('Admin edit')) },
          {
            id: 'actions',
            header: t('Actions'),
            cell: (channel) => (
              <div className='flex flex-wrap gap-2'>
                <Button variant='outline' size='sm' onClick={() => setAddingModel(channel.id)}>{t('Add a model')}</Button>
                <Button variant='outline' size='sm' onClick={() => setEditor({ kind: 'edit', channelId: channel.id })}>{t('Edit')}</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant='outline' size='sm' />}>{t('More')}<ChevronDown aria-hidden='true' /></DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setViewing((current) => (current === channel.id ? null : channel.id))}>{viewing === channel.id ? t('Collapse') : t('Look at')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditor({ kind: 'copy', channelId: channel.id })}>{t('Copy as a new Channel configuration')}</DropdownMenuItem>
                    <DropdownMenuItem variant='destructive' disabled={(modelCounts.get(channel.id) ?? 0) > 0} onClick={() => setRetiring(channel.id)}>{(modelCounts.get(channel.id) ?? 0) > 0 ? t('Retire (delete its models first)') : t('Retire')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ),
          },
        ]}
      />
      {retiring ? <ChannelRetireDialog channelCode={retiring} providerName={bundle.providers.find((entry) => entry.id === bundle.channels.find((channel) => channel.id === retiring)?.providerId)?.internalName ?? ''} version={catalog.data.versions.channels[retiring] ?? 0} onClose={() => setRetiring(null)} /> : null}
      </CardContent>
    </Card>
  )
}

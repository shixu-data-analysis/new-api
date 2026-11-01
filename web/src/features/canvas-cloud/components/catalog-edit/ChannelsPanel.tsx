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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

import { getCurrentCatalog } from '../../catalog-edit-api'
import { unsupportedProfileFields } from '../../catalog-channel-draft'
import { contractOfProfile, profileOfChannel } from '../../catalog-edit-logic'
import { ChannelEditor, type ChannelEditorMode } from './ChannelEditor'
import { ModelEditor } from './ModelEditor'
import { UnsupportedFieldsBadge, workflowShortLabel } from './EditFields'
import { NewModelsPage } from './NewModelsPage'

export function ChannelsPanel(props: { onEditPresentation?: (modelKey: string) => void }) {
  const { t } = useTranslation()
  const catalog = useQuery({ queryKey: ['canvas-cloud', 'model-catalog', 'current'], queryFn: getCurrentCatalog })
  const [editor, setEditor] = useState<ChannelEditorMode | null>(null)
  const [addingModel, setAddingModel] = useState<string | null>(null)
  const [editingModel, setEditingModel] = useState<string | null>(null)
  const [capability, setCapability] = useState('all')
  const [viewing, setViewing] = useState<string | null>(null)
  const editPresentation = props.onEditPresentation ?? (() => undefined)
  if (editingModel) return <ModelEditor mode={{ kind: 'edit', modelKey: editingModel }} onClose={() => setEditingModel(null)} onEditPresentation={editPresentation} />
  if (editor) return <ChannelEditor mode={editor} onClose={() => setEditor(null)} onEditPresentation={editPresentation} onEditModel={(modelKey) => { setEditor(null); setEditingModel(modelKey) }} />
  if (addingModel) return <NewModelsPage channelId={addingModel} shared={{ extraDraft: { providers: [], channels: [] }, onNewChannel: () => { setAddingModel(null); setEditor({ kind: 'new' }) } }} onClose={() => setAddingModel(null)} onEditPresentation={editPresentation} />
  if (catalog.isPending) return <p className='text-muted-foreground text-sm'>{t('Loading')}</p>
  if (catalog.isError) return <p role='alert' className='text-destructive text-sm'>{t('The catalog could not be loaded.')}</p>
  const { bundle, sources } = catalog.data
  const filters: Array<[string, string]> = [['all', t('All types')], ['video.generate', t('Video generation')], ['image.generate', t('Image generation')], ['chat.generate', t('Text generation')]]
  const capabilityLabels: Record<string, string> = { 'image.generate': t('Image generation'), 'video.generate': t('Video generation'), 'chat.generate': t('Text generation') }
  const documentsOf = (channelId: string) => {
    const profile = profileOfChannel(catalog.data, channelId)
    return { profile, contract: profile ? contractOfProfile(catalog.data, profile) : undefined }
  }
  const rows = bundle.channels.filter((channel) => capability === 'all' || profileOfChannel(catalog.data, channel.id)?.kind === capability).sort((left, right) => left.id.localeCompare(right.id))
  return (
    <Card>
      <CardContent className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap gap-2' role='group' aria-label={t('Generation type')}>
          {filters.map(([value, label]) => (
            <Button key={value} variant={capability === value ? 'default' : 'outline'} aria-pressed={capability === value} onClick={() => setCapability(value)}>{label}</Button>
          ))}
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
              <span className='font-mono font-medium break-all'>
                {channel.id}
                <UnsupportedFieldsBadge paths={unsupportedProfileFields(profileOfChannel(catalog.data, channel.id))} />
                {viewing === channel.id ? <pre className='mt-2 max-h-80 max-w-xl overflow-auto rounded-lg border p-2 text-xs'>{JSON.stringify(documentsOf(channel.id), null, 2)}</pre> : null}
              </span>
            ),
          },
          { id: 'provider', header: t('API provider'), cell: (channel) => bundle.providers.find((entry) => entry.id === channel.providerId)?.internalName },
          { id: 'type', header: t('Generation type'), cell: (channel) => capabilityLabels[String(profileOfChannel(catalog.data, channel.id)?.kind)] },
          { id: 'workflow', header: t('Call method'), cell: (channel) => workflowShortLabel(t, profileOfChannel(catalog.data, channel.id)?.workflow) },
          { id: 'models', header: t('Model count'), cell: (channel) => <span className='tabular-nums'>{bundle.models.filter((model) => model.release.channelId === channel.id).length}</span> },
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
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ),
          },
        ]}
      />
      </CardContent>
    </Card>
  )
}

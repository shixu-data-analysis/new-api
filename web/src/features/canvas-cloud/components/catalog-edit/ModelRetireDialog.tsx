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

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import { catalogSourceLabel } from '../catalog-plan-labels'
import { getModelRetirementImpact, retireCatalogModel } from '../../catalog-edit-api'
import type { CanvasAdminTestingModel } from '../../types'

export function ModelRetireDialog(props: { model: CanvasAdminTestingModel; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { model } = props
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState('')
  const idempotencyKey = useRef(crypto.randomUUID())
  const impact = useQuery({ queryKey: ['canvas-cloud', 'model-catalog', 'retirement', model.modelKey], queryFn: () => getModelRetirementImpact(model.modelKey) })
  const retire = useMutation({
    mutationFn: () => retireCatalogModel({ modelKey: model.modelKey, expectedVersion: model.version, reasonCode: reason, confirmedModelKey: confirmed.trim(), idempotencyKey: idempotencyKey.current }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['canvas-cloud'] })
      toast.success(t('Deleted: {{name}}', { name: model.effectiveDisplayName }))
      props.onClose()
    },
    onError: () => {
      idempotencyKey.current = crypto.randomUUID()
    },
  })
  const upstream = [...new Set(model.executionTargets.map((target) => target.upstreamModelId))].join(', ')
  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onClose() }}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{t('Delete the model?')}</DialogTitle>
        </DialogHeader>
        <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm'>
          <dt className='text-muted-foreground'>{t('Model')}</dt>
          <dd>{model.effectiveDisplayName}</dd>
          <dt className='text-muted-foreground'>{t('API provider')}</dt>
          <dd>{model.provider.name}</dd>
          <dt className='text-muted-foreground'>{t('Channel configuration')}</dt>
          <dd className='font-mono break-all'>{impact.data?.channelId ?? '—'}</dd>
          <dt className='text-muted-foreground'>{t('Upstream model ID')}</dt>
          <dd className='font-mono break-all'>{upstream}</dd>
          <dt className='text-muted-foreground'>{t('Source')}</dt>
          <dd>{catalogSourceLabel(t, model.catalogSource)}</dd>
          <dt className='text-muted-foreground'>{t('History')}</dt>
          <dd>{impact.data ? t('{{quotes}} quotes, {{tasks}} tasks. All kept and still readable after deletion.', { quotes: impact.data.quotes, tasks: impact.data.tasks }) : t('Loading')}</dd>
          <dt className='text-muted-foreground'>{t('Tasks in progress')}</dt>
          <dd>{impact.data?.inFlightTasks ? t('{{count}}; they finish and settle as usual', { count: impact.data.inFlightTasks }) : t('None')}</dd>
        </dl>
        <p className='text-sm'>{t('After deletion the model leaves the model list, pricing, API Key bindings, monitoring and the customer catalog, and no new quote or task is accepted; unexpired quotes cannot be submitted. Deletion cannot be undone, and the product key cannot be used again for a new model, a copy or a Bundle.')}</p>
        <div className='space-y-1'>
          <Label htmlFor='retire-reason'>{t('Reason for deletion')}</Label>
          <NativeSelect id='retire-reason' value={reason} onChange={(event) => setReason(event.target.value)}>
            <NativeSelectOption value=''>{t('Please select')}</NativeSelectOption>
            <NativeSelectOption value='UPSTREAM_DISCONTINUED'>{t('Discontinued by the upstream')}</NativeSelectOption>
            <NativeSelectOption value='REPLACED'>{t('Replaced by another model')}</NativeSelectOption>
            <NativeSelectOption value='CONFIGURATION_MISTAKE'>{t('Set up by mistake')}</NativeSelectOption>
            <NativeSelectOption value='OTHER'>{t('Other')}</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className='space-y-1'>
          <Label htmlFor='retire-confirm'>{t('Type the complete product key {{key}} to confirm', { key: model.modelKey })}</Label>
          <Input id='retire-confirm' className='font-mono' autoComplete='off' value={confirmed} onChange={(event) => setConfirmed(event.target.value)} />
        </div>
        {retire.isError ? <p role='alert' className='text-destructive text-sm'>{t('The model could not be deleted. It may have changed; refresh and try again.')}</p> : null}
        <DialogFooter>
          <Button variant='outline' onClick={props.onClose}>{t('Cancel')}</Button>
          <Button variant='destructive' disabled={!reason || confirmed.trim() !== model.modelKey || retire.isPending} onClick={() => retire.mutate()}>{t('Delete the model')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

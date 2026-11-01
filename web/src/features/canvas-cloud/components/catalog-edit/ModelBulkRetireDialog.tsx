/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  getModelRetirementImpact,
  retireCatalogModel,
} from '../../catalog-edit-api'
import type { CanvasAdminTestingModel } from '../../types'
import { RetireReasonSelect } from './EditFields'

/** Each model goes through the single-model deletion, so it keeps its own version check and audit record. */
export function ModelBulkRetireDialog(props: {
  models: CanvasAdminTestingModel[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  // The list refreshes as models go, and this operation stays about the ones it was opened on.
  const [models] = useState(props.models)
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState('')
  const [running, setRunning] = useState(false)
  const [failed, setFailed] = useState<CanvasAdminTestingModel[]>([])
  const impacts = useQueries({
    queries: models.map((model) => ({
      queryKey: ['canvas-cloud', 'model-catalog', 'retirement', model.modelKey],
      queryFn: () => getModelRetirementImpact(model.modelKey),
    })),
  })
  const count = String(models.length)
  const retiring = failed.length ? failed : models
  const retireEach = async () => {
    setRunning(true)
    const stillFailing: CanvasAdminTestingModel[] = []
    for (const model of retiring) {
      try {
        await retireCatalogModel({
          modelKey: model.modelKey,
          expectedVersion: model.version,
          reasonCode: reason,
          confirmedModelKey: model.modelKey,
          idempotencyKey: crypto.randomUUID(),
        })
      } catch {
        stillFailing.push(model)
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['canvas-cloud'] })
    setFailed(stillFailing)
    setRunning(false)
    if (stillFailing.length) return
    toast.success(t('Deleted {{count}} models', { count: models.length }))
    props.onClose()
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !running) props.onClose()
      }}
    >
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {t('Delete {{count}} disabled models?', { count: models.length })}
          </DialogTitle>
        </DialogHeader>
        <ul className='max-h-60 space-y-1 overflow-auto rounded-lg border p-2 text-sm'>
          {models.map((model, index) => {
            const impact = impacts[index]?.data
            return (
              <li
                key={model.modelKey}
                className='flex flex-wrap justify-between gap-x-3'
              >
                <span className='min-w-0 [overflow-wrap:anywhere]'>
                  {model.effectiveDisplayName}{' '}
                  <span className='text-muted-foreground'>
                    {model.provider.name}
                  </span>
                </span>
                <span className='text-muted-foreground'>
                  {t('Tasks in progress')}:{' '}
                  {impact ? impact.inFlightTasks : t('Loading')}
                </span>
              </li>
            )
          })}
        </ul>
        <p className='text-sm'>
          {t(
            'After deletion they leave the model list, pricing, API Key bindings, monitoring and the customer catalog, and no new quote or task is accepted. Their product keys cannot be used again. Tasks in progress finish and settle as usual, and history stays readable.'
          )}
        </p>
        <div className='space-y-1'>
          <Label htmlFor='bulk-retire-reason'>{t('Reason for deletion')}</Label>
          <RetireReasonSelect
            id='bulk-retire-reason'
            value={reason}
            onChange={setReason}
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='bulk-retire-confirm'>
            {t('Type {{count}} to confirm', { count: models.length })}
          </Label>
          <Input
            id='bulk-retire-confirm'
            className='font-mono'
            autoComplete='off'
            value={confirmed}
            onChange={(event) => setConfirmed(event.target.value)}
          />
        </div>
        {failed.length ? (
          <div role='alert' className='text-destructive space-y-1 text-sm'>
            <p>
              {t(
                '{{count}} models could not be deleted. They may have changed; close, refresh and try again if a retry fails.',
                { count: failed.length }
              )}
            </p>
            <ul className='list-disc pl-5'>
              {failed.map((model) => (
                <li key={model.modelKey} className='[overflow-wrap:anywhere]'>
                  {model.effectiveDisplayName}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant='outline' disabled={running} onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button
            variant='destructive'
            disabled={!reason || confirmed.trim() !== count || running}
            onClick={() => void retireEach()}
          >
            {failed.length
              ? t('Retry failed ({{count}})', { count: failed.length })
              : t('Delete {{count}} models', { count: models.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

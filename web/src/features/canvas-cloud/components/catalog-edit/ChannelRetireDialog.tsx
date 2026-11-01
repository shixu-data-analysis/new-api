/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
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

import { retireCatalogChannel } from '../../catalog-edit-api'
import { RetireReasonSelect } from './EditFields'

/** A Channel no live model is on; the list offers it only then, and Cloud checks it again. */
export function ChannelRetireDialog(props: {
  channelCode: string
  providerName: string
  version: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState('')
  const idempotencyKey = useRef(crypto.randomUUID())
  const retire = useMutation({
    mutationFn: () =>
      retireCatalogChannel({
        channelCode: props.channelCode,
        expectedVersion: props.version,
        reasonCode: reason,
        confirmedChannelCode: confirmed.trim(),
        idempotencyKey: idempotencyKey.current,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['canvas-cloud'] })
      toast.success(t('Deleted: {{name}}', { name: props.channelCode }))
      props.onClose()
    },
    onError: () => {
      idempotencyKey.current = crypto.randomUUID()
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{t('Delete the Channel configuration?')}</DialogTitle>
        </DialogHeader>
        <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm'>
          <dt className='text-muted-foreground'>
            {t('Channel configuration')}
          </dt>
          <dd className='font-mono break-all'>{props.channelCode}</dd>
          <dt className='text-muted-foreground'>{t('API provider')}</dt>
          <dd>{props.providerName}</dd>
        </dl>
        <p className='text-sm'>
          {t(
            'After deletion it leaves this list, the model forms and the export. Past and running tasks are not affected, and its history stays. The code cannot be used for a new Channel configuration here; a Bundle that states it brings it back.'
          )}
        </p>
        <div className='space-y-1'>
          <Label htmlFor='retire-channel-reason'>
            {t('Reason for deletion')}
          </Label>
          <RetireReasonSelect
            id='retire-channel-reason'
            value={reason}
            onChange={setReason}
          />
        </div>
        <div className='space-y-1'>
          <Label htmlFor='retire-channel-confirm'>
            {t('Type the complete code {{code}} to confirm', {
              code: props.channelCode,
            })}
          </Label>
          <Input
            id='retire-channel-confirm'
            className='font-mono'
            autoComplete='off'
            value={confirmed}
            onChange={(event) => setConfirmed(event.target.value)}
          />
        </div>
        {retire.isError ? (
          <p role='alert' className='text-destructive text-sm'>
            {t(
              'The Channel configuration could not be deleted. A model may be on it, or it may have changed; refresh and try again.'
            )}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={props.onClose}>
            {t('Cancel')}
          </Button>
          <Button
            variant='destructive'
            disabled={
              !reason ||
              confirmed.trim() !== props.channelCode ||
              retire.isPending
            }
            onClick={() => retire.mutate()}
          >
            {t('Delete the Channel configuration')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

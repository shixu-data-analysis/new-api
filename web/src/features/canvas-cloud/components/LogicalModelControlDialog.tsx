/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { getServerErrorStatus } from '@/lib/server-error-message'

import { controlCanvasLogicalModel } from '../api'
import {
  modelControlFormSchema,
  modelDisableReasons,
  modelEnableReasons,
  modelMonitoringReasonLabels,
} from '../model-monitoring-control'

type ReasonForm = { reasonCode: string; note: string }

export function LogicalModelControlDialog(props: {
  modelKey: string
  name: string
  manualEnabled: boolean
  controlVersion: number
  onClose: () => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const enabled = !props.manualEnabled
  const form = useForm<ReasonForm>({
    resolver: zodResolver(modelControlFormSchema(enabled)),
    mode: 'onTouched',
    defaultValues: { reasonCode: '', note: '' },
  })
  const mutation = useMutation({
    mutationFn: (value: ReasonForm) =>
      controlCanvasLogicalModel(props.modelKey, {
        enabled,
        expectedVersion: props.controlVersion,
        reasonCode: value.reasonCode,
        note: value.note.trim(),
        confirmed: true,
      }),
    onSuccess: () => {
      props.onChanged()
      props.onClose()
    },
  })
  const action = enabled ? t('Restore model') : t('Disable model')
  const impact = enabled
    ? t('Restoring allows new quotes and new task acceptance for this model.')
    : t(
        'Disabling blocks new quotes and new task acceptance for this model. Accepted tasks continue.'
      )
  const error =
    getServerErrorStatus(mutation.error) === 409
      ? t('The model state changed. Refresh and review before retrying.')
      : t('Model change failed. Refresh the model state before retrying.')

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) props.onClose()
      }}
    >
      <DialogContent className='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{action}</DialogTitle>
          <DialogDescription>{props.name}</DialogDescription>
        </DialogHeader>
        <p className='text-muted-foreground text-sm'>{impact}</p>
        <form
          noValidate
          className='space-y-4'
          onSubmit={form.handleSubmit((value) => mutation.mutate(value))}
        >
          <div className='space-y-1'>
            <Label htmlFor='logical-model-control-reason'>
              {t('Reason')} *
            </Label>
            <NativeSelect
              id='logical-model-control-reason'
              {...form.register('reasonCode')}
              aria-invalid={Boolean(form.formState.errors.reasonCode)}
              aria-describedby='logical-model-control-reason-error'
            >
              <NativeSelectOption value=''>
                {t(
                  enabled
                    ? 'Select a restore reason'
                    : 'Select a disable reason'
                )}
              </NativeSelectOption>
              {(enabled ? modelEnableReasons : modelDisableReasons).map(
                (reason) => (
                  <NativeSelectOption key={reason} value={reason}>
                    {t(modelMonitoringReasonLabels[reason])}
                  </NativeSelectOption>
                )
              )}
            </NativeSelect>
            {form.formState.errors.reasonCode ? (
              <p
                id='logical-model-control-reason-error'
                role='alert'
                className='text-destructive text-sm'
              >
                {t('Select a reason')}
              </p>
            ) : null}
          </div>
          <div className='space-y-1'>
            <Label htmlFor='logical-model-control-note'>
              {t('Additional explanation (required for Other)')}
            </Label>
            <Textarea
              id='logical-model-control-note'
              {...form.register('note')}
              maxLength={1000}
              aria-invalid={Boolean(form.formState.errors.note)}
              aria-describedby='logical-model-control-note-error'
            />
            {form.formState.errors.note ? (
              <p
                id='logical-model-control-note-error'
                role='alert'
                className='text-destructive text-sm'
              >
                {t('Provide an explanation of up to 1000 characters')}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              disabled={mutation.isPending}
              onClick={props.onClose}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='submit'
              variant={enabled ? 'default' : 'destructive'}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? t('Saving...') : action}
            </Button>
          </DialogFooter>
        </form>
        {mutation.isError ? (
          <p role='alert' className='text-destructive text-sm'>
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

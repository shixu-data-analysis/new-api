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

import { controlCanvasModelMonitoring } from '../api'
import {
  channelControlFormSchema,
  channelDisableReasons,
  channelEnableReasons,
  channelReasonLabels,
} from '../channel-health'
import type { CanvasModelMonitoring } from '../types'
import { executionTargetLabel } from './execution-target-label'

type ReasonForm = { reasonCode: string; note: string }

const blockingReasonLabels: Record<string, string> = {
  MODEL_UNAVAILABLE: 'Model unavailable',
  PROVIDER_UNAVAILABLE: 'Provider unavailable',
  INTERNAL_ROUTING_UNAVAILABLE: 'Internal routing unavailable',
}

export function ModelControlDialog(props: {
  monitoring: CanvasModelMonitoring
  onClose: () => void
  onChanged: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  const enabled = !props.monitoring.manualEnabled
  const form = useForm<ReasonForm>({
    resolver: zodResolver(channelControlFormSchema(enabled)),
    mode: 'onTouched',
    defaultValues: { reasonCode: '', note: '' },
  })
  const mutation = useMutation({
    mutationFn: (value: ReasonForm) =>
      controlCanvasModelMonitoring(
        props.monitoring.customerModel.id,
        props.monitoring.executionTarget.id,
        {
          enabled,
          expectedVersion: props.monitoring.controlVersion,
          reasonCode: value.reasonCode,
          note: value.note.trim(),
          confirmed: true,
        }
      ),
    onSuccess: () => {
      props.onChanged(enabled)
      props.onClose()
    },
  })
  const action = enabled ? t('Restore model') : t('Disable model')
  const upperLevelBlockingReasons = props.monitoring.blockingReasons.filter(
    (reason) => reason !== 'MANUALLY_DISABLED'
  )
  const impact = enabled
    ? t(
        'Restoring starts a new monitoring round for this execution target and keeps prior history. New quotes and new task acceptance resume when upper-level controls allow it.'
      )
    : t(
        'Disabling affects only this execution target. It blocks new quotes, tasks from quotes accepted before the disablement, and new task acceptance. Accepted tasks continue. Other execution targets are unaffected.'
      )
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
          <DialogDescription>
            {props.monitoring.customerModel.name} ·{' '}
            {executionTargetLabel(props.monitoring.executionTarget, t)}
          </DialogDescription>
        </DialogHeader>
        <p className='text-muted-foreground text-sm'>{impact}</p>
        {upperLevelBlockingReasons.length > 0 ? (
          <p className='text-muted-foreground text-sm'>
            {t('Upper-level availability still applies')}:{' '}
            {upperLevelBlockingReasons
              .map((reason) => t(blockingReasonLabels[reason] ?? 'Unavailable'))
              .join(' · ')}
          </p>
        ) : null}
        <form
          noValidate
          className='space-y-4'
          onSubmit={form.handleSubmit((value) => {
            mutation.mutate(value)
          })}
        >
          <div className='space-y-1'>
            <Label htmlFor='model-control-reason'>{t('Reason')} *</Label>
            <NativeSelect
              id='model-control-reason'
              {...form.register('reasonCode')}
              aria-invalid={Boolean(form.formState.errors.reasonCode)}
              aria-describedby='model-control-reason-error'
            >
              <NativeSelectOption value=''>
                {t(
                  enabled
                    ? 'Select a restore reason'
                    : 'Select a disable reason'
                )}
              </NativeSelectOption>
              {(enabled ? channelEnableReasons : channelDisableReasons).map(
                (reason) => (
                  <NativeSelectOption key={reason} value={reason}>
                    {t(channelReasonLabels[reason])}
                  </NativeSelectOption>
                )
              )}
            </NativeSelect>
            {form.formState.errors.reasonCode ? (
              <p
                id='model-control-reason-error'
                role='alert'
                className='text-destructive text-sm'
              >
                {t('Select a reason')}
              </p>
            ) : null}
          </div>
          <div className='space-y-1'>
            <Label htmlFor='model-control-note'>
              {t('Additional explanation (required for Other)')}
            </Label>
            <Textarea
              id='model-control-note'
              {...form.register('note')}
              maxLength={1000}
              aria-invalid={Boolean(form.formState.errors.note)}
              aria-describedby='model-control-note-error'
            />
            {form.formState.errors.note ? (
              <p
                id='model-control-note-error'
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
            {t('Model change failed. Refresh the model state before retrying.')}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

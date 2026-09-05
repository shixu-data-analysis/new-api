/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import { controlCanvasChannel } from '../api'
import {
  channelControlFormSchema,
  channelDisableReasons,
  channelEnableReasons,
  channelReasonLabels,
} from '../channel-health'
import type { ChannelHealthItem } from '../types'
import { PricingActionConfirmation } from './PricingActionConfirmation'

type ReasonForm = { reasonCode: string; note: string }
export function ChannelControlDialog(props: {
  channel: ChannelHealthItem
  onClose: () => void
  onChanged: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  const enabled = !props.channel.enabled
  const [review, setReview] = useState<(ReasonForm & { key: string }) | null>(
    null
  )
  const form = useForm<ReasonForm>({
    resolver: zodResolver(channelControlFormSchema(enabled)),
    mode: 'onTouched',
    defaultValues: { reasonCode: '', note: '' },
  })
  const mutation = useMutation({
    mutationFn: (value: NonNullable<typeof review>) =>
      controlCanvasChannel(
        props.channel.id,
        {
          enabled,
          expectedVersion: props.channel.controlVersion,
          reasonCode: value.reasonCode,
          note: value.note,
        },
        value.key
      ),
    onSuccess: () => {
      toast.success(t('Channel state updated'))
      props.onChanged(enabled)
      props.onClose()
    },
    onError: () =>
      toast.error(
        t('Channel change failed. Refresh the channel state before retrying.')
      ),
  })
  const action = enabled ? t('Restore channel') : t('Disable channel')
  return (
    <>
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
              {props.channel.providerName} · {props.channel.code}
            </DialogDescription>
          </DialogHeader>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Existing tasks continue. New quotes and tasks are blocked while disabled. History is preserved.'
            )}
          </p>
          <p className='text-sm break-words'>
            {t('Affected models')}:{' '}
            {props.channel.affectedModels.map((m) => m.name).join(', ') ||
              t('No data')}
          </p>
          <form
            noValidate
            className='space-y-4'
            onSubmit={form.handleSubmit((value) =>
              setReview({
                ...value,
                key: `channel-control:${crypto.randomUUID()}`,
              })
            )}
          >
            <div className='space-y-1'>
              <Label htmlFor='channel-reason'>{t('Reason')} *</Label>
              <NativeSelect
                id='channel-reason'
                {...form.register('reasonCode')}
                aria-invalid={Boolean(form.formState.errors.reasonCode)}
                aria-describedby='channel-reason-error'
              >
                <NativeSelectOption value=''>
                  {t('Select a reason')}
                </NativeSelectOption>
                {(enabled ? channelEnableReasons : channelDisableReasons).map(
                  (reason) => (
                    <NativeSelectOption key={reason} value={reason}>
                      {t(channelReasonLabels[reason])}
                    </NativeSelectOption>
                  )
                )}
              </NativeSelect>
              {form.formState.errors.reasonCode && (
                <p
                  id='channel-reason-error'
                  role='alert'
                  className='text-destructive text-sm'
                >
                  {t('Select a reason')}
                </p>
              )}
            </div>
            <div className='space-y-1'>
              <Label htmlFor='channel-note'>
                {t('Additional explanation (optional; required for Other)')}
              </Label>
              <Input
                id='channel-note'
                {...form.register('note')}
                maxLength={1000}
                aria-invalid={Boolean(form.formState.errors.note)}
                aria-describedby='channel-note-error'
              />
              {form.formState.errors.note && (
                <p
                  id='channel-note-error'
                  role='alert'
                  className='text-destructive text-sm'
                >
                  {t('Provide an explanation of up to 1000 characters')}
                </p>
              )}
            </div>
            <div className='flex flex-wrap justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={mutation.isPending}
                onClick={props.onClose}
              >
                {t('Cancel')}
              </Button>
              <Button type='submit' disabled={mutation.isPending}>
                {t('Review change')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <PricingActionConfirmation
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setReview(null)
        }}
        title={action}
        description={
          enabled
            ? t(
                'Restoring starts a new monitoring round without deleting history.'
              )
            : t(
                'Existing tasks continue. New quotes and tasks are blocked while disabled. History is preserved.'
              )
        }
        details={[
          { label: t('Channel'), value: props.channel.code },
          {
            label: t('Reason'),
            value: review
              ? t(channelReasonLabels[review.reasonCode] ?? 'Other')
              : '',
          },
          {
            label: t('Additional explanation'),
            value: review?.note || t('None'),
          },
        ]}
        confirmLabel={action}
        destructive={!enabled}
        pending={mutation.isPending}
        onConfirm={() => {
          if (review) mutation.mutate(review)
        }}
      />
    </>
  )
}

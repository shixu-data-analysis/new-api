/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import { publishCanvasTaskMediaStorage } from '../api'
import type { CanvasRuntimeInputStorage } from '../types'
import { PresentationSegmented } from './PresentationSegmented'
import { Field } from './RuntimeStorageParts'

const httpsUrl = z.string().trim().url().startsWith('https://')
/** Qiniu's upload address that also serves uploads from Hong Kong and abroad (measured 2026-11-10). */
const QINIU_UPLOAD_ADDRESS = 'https://upload.qiniup.com'
const formSchema = z
  .object({
    driver: z.enum(['S3', 'QINIU']),
    storageKey: z
      .string()
      .regex(
        /^[a-z][a-z0-9-]{0,63}$/,
        'Use lowercase letters, digits and hyphens'
      ),
    endpoint: httpsUrl,
    bucket: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'Enter a valid bucket name'),
    region: z.string().trim().min(1).max(64),
    addressing: z.enum(['path', 'virtual']),
    uploadEndpoint: z.union([z.literal(''), httpsUrl]),
    contentLock: z.enum(['sha256', 'md5']),
    accessKeyId: z.string().trim().max(255),
    secretAccessKey: z.string().max(65_536),
    inputRetentionHours: z.number().int().min(1).max(8760),
    downloadUrlTtlSeconds: z.number().int().min(60).max(3600),
    reason: z.string().trim().max(255),
  })
  .refine(
    (value) => Boolean(value.accessKeyId) === Boolean(value.secretAccessKey),
    {
      path: ['secretAccessKey'],
      message: 'Enter both credential fields or leave both blank',
    }
  )
  .refine((value) => value.driver === 'S3' || Boolean(value.uploadEndpoint), {
    path: ['uploadEndpoint'],
    message: 'Qiniu needs its upload address',
  })
type FormValues = z.infer<typeof formSchema>

/**
 * Adds an input storage, or publishes a new version of one. A new storage needs its credentials; an existing one keeps them when
 * both credential fields stay blank.
 */
export function InputStorageForm(props: {
  storage?: CanvasRuntimeInputStorage
  /** Called with the published version's id, or without one when the form is cancelled. */
  onDone: (publishedVersionId?: string) => void
}) {
  const { t } = useTranslation()
  const { storage } = props
  const form = useForm<FormValues>({
    resolver: zodResolver(
      storage
        ? formSchema
        : formSchema.refine((value) => Boolean(value.accessKeyId), {
            path: ['accessKeyId'],
            message: 'A new storage needs its credentials',
          })
    ),
    defaultValues: {
      driver: storage?.driver ?? 'S3',
      storageKey: storage?.storageKey ?? '',
      endpoint: storage?.endpoint ?? '',
      bucket: storage?.bucket ?? '',
      region: storage?.driverConfig.region ?? 'auto',
      addressing:
        storage?.driverConfig.forcePathStyle === false ? 'virtual' : 'path',
      uploadEndpoint: storage?.driverConfig.uploadEndpoint ?? '',
      contentLock: storage?.driverConfig.contentLock ?? 'sha256',
      accessKeyId: '',
      secretAccessKey: '',
      inputRetentionHours: storage?.inputRetentionHours ?? 24,
      downloadUrlTtlSeconds: storage?.downloadUrlTtlSeconds ?? 900,
      reason: '',
    },
  })
  const publish = useMutation({
    mutationFn: (value: FormValues) =>
      publishCanvasTaskMediaStorage({
        storageKey: value.storageKey,
        driver: value.driver,
        driverConfig: {
          region: value.region,
          forcePathStyle: value.addressing === 'path',
          ...(value.uploadEndpoint
            ? { uploadEndpoint: value.uploadEndpoint }
            : {}),
          contentLock: value.contentLock,
        },
        endpoint: value.endpoint,
        mediaBucket: value.bucket,
        ...(value.accessKeyId
          ? {
              mediaCredentials: {
                accessKeyId: value.accessKeyId,
                secretAccessKey: value.secretAccessKey,
              },
            }
          : {}),
        inputRetentionHours: value.inputRetentionHours,
        downloadUrlTtlSeconds: value.downloadUrlTtlSeconds,
        ...(value.reason ? { reason: value.reason } : {}),
      }),
    onSuccess: (published: { id: string }) => props.onDone(published.id),
    onError: () => toast.error(t('The storage was not published')),
  })
  const { errors } = form.formState
  const qiniu = useWatch({ control: form.control, name: 'driver' }) === 'QINIU'
  return (
    <form
      aria-label={
        storage
          ? t('Update storage {{storage}}', { storage: storage.storageKey })
          : t('Add storage')
      }
      className='grid gap-3 sm:grid-cols-2'
      onSubmit={form.handleSubmit((value) => publish.mutate(value))}
    >
      <div className='min-w-0 space-y-1 sm:col-span-2'>
        <p className='text-sm font-medium'>{t('Type')}</p>
        <Controller
          control={form.control}
          name='driver'
          render={({ field }) => (
            <PresentationSegmented
              label={t('Type')}
              value={field.value}
              options={[
                { value: 'S3', label: t('S3 compatible') },
                { value: 'QINIU', label: t('Qiniu') },
              ]}
              onChange={(driver) => {
                field.onChange(driver)
                if (driver === 'QINIU' && !form.getValues('uploadEndpoint')) {
                  form.setValue('uploadEndpoint', QINIU_UPLOAD_ADDRESS)
                }
              }}
            />
          )}
        />
      </div>
      <Field label={t('Name')} error={errors.storageKey?.message}>
        <Input
          className='font-mono'
          disabled={Boolean(storage)}
          {...form.register('storageKey')}
        />
      </Field>
      <Field label={t('Bucket')} error={errors.bucket?.message}>
        <Input {...form.register('bucket')} />
      </Field>
      <Field label={t('Endpoint')} error={errors.endpoint?.message}>
        <Input placeholder='https://' {...form.register('endpoint')} />
      </Field>
      <Field label={t('Region')} error={errors.region?.message}>
        <Input {...form.register('region')} />
      </Field>
      {!qiniu && (
        <div className='min-w-0 space-y-1'>
          <p className='text-sm font-medium'>{t('Bucket name position')}</p>
          <Controller
            control={form.control}
            name='addressing'
            render={({ field }) => (
              <PresentationSegmented
                label={t('Bucket name position')}
                value={field.value}
                options={[
                  { value: 'path', label: t('In the path') },
                  { value: 'virtual', label: t('In the host') },
                ]}
                onChange={field.onChange}
              />
            )}
          />
          <p className='text-muted-foreground text-xs'>
            {t(
              'In the path: https://endpoint/bucket/file · In the host: https://bucket.endpoint/file'
            )}
          </p>
        </div>
      )}
      <div className='min-w-0 space-y-1'>
        <Field
          label={qiniu ? t('Upload address') : t('Upload address (optional)')}
          error={errors.uploadEndpoint?.message}
        >
          <Input placeholder='https://' {...form.register('uploadEndpoint')} />
        </Field>
        {!qiniu && (
          <p className='text-muted-foreground text-xs'>
            {t('Left blank, the endpoint is used.')}
          </p>
        )}
      </div>
      <Field label={t('Access key ID')} error={errors.accessKeyId?.message}>
        <Input autoComplete='off' {...form.register('accessKeyId')} />
      </Field>
      <Field
        label={t('Secret access key')}
        error={errors.secretAccessKey?.message}
      >
        <Input
          type='password'
          autoComplete='new-password'
          {...form.register('secretAccessKey')}
        />
      </Field>
      {!qiniu && (
        <div className='min-w-0 space-y-1'>
          <Field label={t('Content lock')}>
            <NativeSelect {...form.register('contentLock')}>
              <NativeSelectOption value='sha256'>SHA-256</NativeSelectOption>
              <NativeSelectOption value='md5'>MD5</NativeSelectOption>
            </NativeSelect>
          </Field>
          <p className='text-muted-foreground text-xs'>
            {t(
              'MD5 is weaker; use it only when the storage does not support SHA-256.'
            )}
          </p>
        </div>
      )}
      <Field
        label={t('Input retention hours')}
        error={errors.inputRetentionHours?.message}
      >
        <Input
          type='number'
          min={1}
          max={8760}
          {...form.register('inputRetentionHours', { valueAsNumber: true })}
        />
      </Field>
      <Field
        label={t('Download URL seconds')}
        error={errors.downloadUrlTtlSeconds?.message}
      >
        <Input
          type='number'
          min={60}
          max={3600}
          {...form.register('downloadUrlTtlSeconds', { valueAsNumber: true })}
        />
      </Field>
      <Field label={t('Reason (optional)')} error={errors.reason?.message}>
        <Input {...form.register('reason')} />
      </Field>
      <div className='flex flex-wrap justify-end gap-2 sm:col-span-2'>
        <Button
          type='button'
          variant='outline'
          disabled={publish.isPending}
          onClick={() => props.onDone()}
        >
          {t('Cancel')}
        </Button>
        <Button type='submit' disabled={publish.isPending}>
          {t('Publish')}
        </Button>
      </div>
    </form>
  )
}

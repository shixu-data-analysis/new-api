/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import {
  bindCanvasProviderCredentials,
  checkCanvasProviderCredentialGroup,
  checkCanvasRuntimeStorage,
  getCanvasRuntimeConfiguration,
  publishCanvasProviderCredentialGroup,
  publishCanvasRuntimeStorage,
} from '../api'
import { formatCanvasDateTime } from '../formatters'
import type { CanvasRuntimeConnectionCheck } from '../types'
import { BusinessTerm } from './BusinessTerm'
import { PricingActionConfirmation } from './PricingActionConfirmation'

function isHttpsOrigin(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

const storageSchema = z
  .object({
    environment: z.enum(['UAT', 'STG', 'PROD']),
    endpoint: z.string().url().refine(isHttpsOrigin),
    mediaBucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
    backupBucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
    mediaAccessKeyId: z.string().min(1),
    mediaSecretAccessKey: z.string().min(1),
    backupAccessKeyId: z.string().min(1),
    backupSecretAccessKey: z.string().min(1),
    inputRetentionHours: z.number().int().min(1).max(8760),
    outputRetentionHours: z.number().int().min(1).max(8760),
    downloadUrlTtlSeconds: z.number().int().min(60).max(3600),
    reason: z.string().trim().min(1).max(255),
  })
  .refine((value) => value.mediaBucket !== value.backupBucket, {
    path: ['backupBucket'],
  })
type StorageForm = z.infer<typeof storageSchema>

const credentialSchema = z.object({
  providerId: z.string().uuid(),
  credentialGroupId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(191),
  entries: z
    .array(
      z.object({
        schemeName: z.string().regex(/^[A-Za-z][A-Za-z0-9._-]{0,127}$/),
        secret: z.string().min(1),
      })
    )
    .min(1)
    .max(32)
    .refine(
      (entries) =>
        new Set(entries.map((entry) => entry.schemeName)).size ===
        entries.length
    ),
  reason: z.string().trim().min(1).max(255),
})
type CredentialForm = z.infer<typeof credentialSchema>
const bindingSchema = z.object({
  credentialGroupVersionId: z.string().uuid(),
  reason: z.string().trim().min(1).max(255),
})
type BindingForm = z.infer<typeof bindingSchema>

export function RuntimeConfiguration() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [confirmation, setConfirmation] = useState<
    'storage' | 'credential' | 'binding' | null
  >(null)
  const [modelSearch, setModelSearch] = useState('')
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const runtime = useQuery({
    queryKey: ['canvas-cloud', 'runtime-configuration'],
    queryFn: getCanvasRuntimeConfiguration,
  })
  const storage = useForm<StorageForm>({
    resolver: zodResolver(storageSchema),
    defaultValues: {
      environment: 'UAT',
      endpoint: '',
      mediaBucket: 'canvas-uat-task-media',
      backupBucket: 'canvas-uat-db-backups',
      mediaAccessKeyId: '',
      mediaSecretAccessKey: '',
      backupAccessKeyId: '',
      backupSecretAccessKey: '',
      inputRetentionHours: 24,
      outputRetentionHours: 72,
      downloadUrlTtlSeconds: 900,
      reason: '',
    },
  })
  const credential = useForm<CredentialForm>({
    resolver: zodResolver(credentialSchema),
    defaultValues: {
      providerId: '',
      credentialGroupId: undefined,
      name: '',
      entries: [{ schemeName: '', secret: '' }],
      reason: '',
    },
  })
  const credentialEntries = useFieldArray({
    control: credential.control,
    name: 'entries',
  })
  const binding = useForm<BindingForm>({
    resolver: zodResolver(bindingSchema),
    defaultValues: { credentialGroupVersionId: '', reason: '' },
  })

  const refresh = async () =>
    queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'runtime-configuration'],
    })
  const storageMutation = useMutation({
    mutationFn: (value: StorageForm) =>
      publishCanvasRuntimeStorage({
        environment: value.environment,
        endpoint: value.endpoint,
        mediaBucket: value.mediaBucket,
        backupBucket: value.backupBucket,
        mediaCredentials: {
          accessKeyId: value.mediaAccessKeyId,
          secretAccessKey: value.mediaSecretAccessKey,
        },
        backupCredentials: {
          accessKeyId: value.backupAccessKeyId,
          secretAccessKey: value.backupSecretAccessKey,
        },
        inputRetentionHours: value.inputRetentionHours,
        outputRetentionHours: value.outputRetentionHours,
        downloadUrlTtlSeconds: value.downloadUrlTtlSeconds,
        reason: value.reason,
      }),
    onSuccess: async () => {
      setConfirmation(null)
      storage.resetField('mediaAccessKeyId')
      storage.resetField('mediaSecretAccessKey')
      storage.resetField('backupAccessKeyId')
      storage.resetField('backupSecretAccessKey')
      toast.success(t('Runtime storage configuration published'))
      await refresh()
    },
    onError: () => toast.error(t('Runtime storage configuration failed')),
  })
  const credentialMutation = useMutation({
    mutationFn: (value: CredentialForm) =>
      publishCanvasProviderCredentialGroup({
        providerId: value.providerId,
        ...(value.credentialGroupId
          ? { credentialGroupId: value.credentialGroupId }
          : {}),
        name: value.name,
        credentials: Object.fromEntries(
          value.entries.map((entry) => [entry.schemeName, entry.secret])
        ),
        reason: value.reason,
      }),
    onSuccess: async () => {
      setConfirmation(null)
      credential.reset({
        providerId: '',
        credentialGroupId: undefined,
        name: '',
        entries: [{ schemeName: '', secret: '' }],
        reason: '',
      })
      toast.success(t('Provider credential group published'))
      await refresh()
    },
    onError: () => toast.error(t('Provider credential group failed')),
  })
  const bindingMutation = useMutation({
    mutationFn: (value: BindingForm) =>
      bindCanvasProviderCredentials({
        ...value,
        customerModelIds: selectedModels,
      }),
    onSuccess: async () => {
      setConfirmation(null)
      setSelectedModels([])
      toast.success(t('Model credential bindings published'))
      await refresh()
    },
    onError: () => toast.error(t('Model credential bindings failed')),
  })
  const reportCheck = async (result: CanvasRuntimeConnectionCheck) => {
    if (result.outcome === 'PASSED') toast.success(t('Connection check passed'))
    else {
      toast.error(
        `${t('Connection check failed')}: ${connectionCheckReason(result.reasonCode, t)}`
      )
    }
    await refresh()
  }
  const checkStorage = useMutation({
    mutationFn: (input: { id: string; role: 'TASK_MEDIA' | 'DB_BACKUP' }) =>
      checkCanvasRuntimeStorage(input.id, input.role),
    onSuccess: reportCheck,
    onError: () => toast.error(t('Connection check failed')),
  })
  const checkCredential = useMutation({
    mutationFn: checkCanvasProviderCredentialGroup,
    onSuccess: reportCheck,
    onError: () => toast.error(t('Connection check failed')),
  })

  const selectedGroup = runtime.data?.credentialGroups.find(
    (item) => item.id === binding.watch('credentialGroupVersionId')
  )
  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLocaleLowerCase()
    return (runtime.data?.models ?? []).filter(
      (model) =>
        (!selectedGroup || model.providerId === selectedGroup.providerId) &&
        (!query ||
          `${model.publicName} ${model.modelKey} ${model.providerCode}`
            .toLocaleLowerCase()
            .includes(query))
    )
  }, [modelSearch, runtime.data?.models, selectedGroup])
  const allFilteredSelected =
    filteredModels.length > 0 &&
    filteredModels.every((model) => selectedModels.includes(model.id))
  let confirmationDetails = [
    { label: t('Selected models'), value: String(selectedModels.length) },
  ]
  if (confirmation === 'storage') {
    confirmationDetails = [
      { label: t('Environment'), value: storage.getValues('environment') },
      {
        label: t('Buckets'),
        value: `${storage.getValues('mediaBucket')} · ${storage.getValues('backupBucket')}`,
      },
    ]
  }
  if (confirmation === 'credential') {
    confirmationDetails = [
      {
        label: t('Provider credential group'),
        value: credential.getValues('name') || '—',
      },
      {
        label: t('Credential entries'),
        value: String(credential.getValues('entries').length),
      },
    ]
  }
  if (confirmation === 'binding') {
    confirmationDetails = [
      {
        label: t('Credential group'),
        value: selectedGroup
          ? `${selectedGroup.providerCode} · ${selectedGroup.name} v${selectedGroup.version}`
          : '—',
      },
      { label: t('Selected models'), value: String(selectedModels.length) },
    ]
  }

  if (runtime.isPending) {
    return <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
  }
  if (runtime.isError) {
    return (
      <Button variant='outline' onClick={() => void runtime.refetch()}>
        {t('Retry')}
      </Button>
    )
  }

  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Runtime storage')}</CardTitle>
          <CardDescription>
            {t(
              'Configure private task-media and database-backup buckets separately. Secret values can be replaced but never viewed again.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-3 lg:grid-cols-3'>
            {runtime.data.storage.map((item) => (
              <div key={item.id} className='rounded-lg border p-3 text-sm'>
                <div className='flex items-center justify-between gap-2'>
                  <strong>
                    {item.environment} · v{item.version}
                  </strong>
                  <BusinessTerm kind='configStatus' value={item.status} />
                </div>
                <dl className='mt-3 grid gap-1 text-xs'>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('Task media bucket')}
                    </dt>
                    <dd className='break-all'>{item.mediaBucket}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('Database backup bucket')}
                    </dt>
                    <dd className='break-all'>{item.backupBucket}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('Retention and download')}
                    </dt>
                    <dd>
                      {item.inputRetentionHours}h · {item.outputRetentionHours}h
                      · {item.downloadUrlTtlSeconds}s
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>{t('Updated by')}</dt>
                    <dd>
                      {item.updatedBy} · {formatCanvasDateTime(item.createdAt)}
                    </dd>
                  </div>
                  <ConnectionCheck
                    label={t('Task media check')}
                    value={item.checks.taskMedia}
                  />
                  <ConnectionCheck
                    label={t('Backup check')}
                    value={item.checks.databaseBackup}
                  />
                </dl>
                <div className='mt-3 flex flex-wrap gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={checkStorage.isPending}
                    onClick={() =>
                      checkStorage.mutate({ id: item.id, role: 'TASK_MEDIA' })
                    }
                  >
                    {t('Check task media')}
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={checkStorage.isPending}
                    onClick={() =>
                      checkStorage.mutate({ id: item.id, role: 'DB_BACKUP' })
                    }
                  >
                    {t('Check backup')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {runtime.data.storage.length === 0 && (
            <div className='text-muted-foreground text-sm'>
              {t('No runtime storage configured')}
            </div>
          )}
          <form
            aria-label={t('Publish runtime storage')}
            className='bg-muted/20 grid gap-3 rounded-xl border p-4 md:grid-cols-2 xl:grid-cols-4'
            onSubmit={storage.handleSubmit(() => setConfirmation('storage'))}
          >
            <Field
              label={t('Environment')}
              error={storage.formState.errors.environment?.message}
            >
              <NativeSelect
                className='w-full'
                {...storage.register('environment')}
              >
                <NativeSelectOption value='UAT'>UAT</NativeSelectOption>
                <NativeSelectOption value='STG'>STG</NativeSelectOption>
                <NativeSelectOption value='PROD'>PROD</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field
              label={t('R2 endpoint')}
              error={storage.formState.errors.endpoint?.message}
            >
              <Input
                {...storage.register('endpoint')}
                placeholder='https://…r2.cloudflarestorage.com'
              />
            </Field>
            <Field
              label={t('Task media bucket')}
              error={storage.formState.errors.mediaBucket?.message}
            >
              <Input {...storage.register('mediaBucket')} />
            </Field>
            <Field
              label={t('Database backup bucket')}
              error={storage.formState.errors.backupBucket?.message}
            >
              <Input {...storage.register('backupBucket')} />
            </Field>
            <Field
              label={t('Task media access key ID')}
              error={storage.formState.errors.mediaAccessKeyId?.message}
            >
              <Input
                autoComplete='off'
                {...storage.register('mediaAccessKeyId')}
              />
            </Field>
            <Field
              label={t('Task media secret access key')}
              error={storage.formState.errors.mediaSecretAccessKey?.message}
            >
              <Input
                type='password'
                autoComplete='new-password'
                {...storage.register('mediaSecretAccessKey')}
              />
            </Field>
            <Field
              label={t('Backup access key ID')}
              error={storage.formState.errors.backupAccessKeyId?.message}
            >
              <Input
                autoComplete='off'
                {...storage.register('backupAccessKeyId')}
              />
            </Field>
            <Field
              label={t('Backup secret access key')}
              error={storage.formState.errors.backupSecretAccessKey?.message}
            >
              <Input
                type='password'
                autoComplete='new-password'
                {...storage.register('backupSecretAccessKey')}
              />
            </Field>
            <Field
              label={t('Input retention hours')}
              error={storage.formState.errors.inputRetentionHours?.message}
            >
              <Input
                type='number'
                min={1}
                max={8760}
                {...storage.register('inputRetentionHours', {
                  valueAsNumber: true,
                })}
              />
            </Field>
            <Field
              label={t('Output retention hours')}
              error={storage.formState.errors.outputRetentionHours?.message}
            >
              <Input
                type='number'
                min={1}
                max={8760}
                {...storage.register('outputRetentionHours', {
                  valueAsNumber: true,
                })}
              />
            </Field>
            <Field
              label={t('Download URL seconds')}
              error={storage.formState.errors.downloadUrlTtlSeconds?.message}
            >
              <Input
                type='number'
                min={60}
                max={3600}
                {...storage.register('downloadUrlTtlSeconds', {
                  valueAsNumber: true,
                })}
              />
            </Field>
            <Field
              label={t('Reason')}
              error={storage.formState.errors.reason?.message}
            >
              <Input {...storage.register('reason')} />
            </Field>
            <div className='md:col-span-2 xl:col-span-4'>
              <Button type='submit'>{t('Review storage publication')}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Provider credential groups')}</CardTitle>
          <CardDescription>
            {t(
              'Keep multiple named credential groups per provider and replace secrets through immutable versions.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {runtime.data.credentialGroups.map((item) => (
              <div className='rounded-lg border p-3 text-sm' key={item.id}>
                <div className='flex items-center justify-between'>
                  <strong>
                    {item.providerCode} · {item.name}
                  </strong>
                  <BusinessTerm kind='configStatus' value={item.status} />
                </div>
                <dl className='mt-2 grid gap-1 text-xs'>
                  <div>
                    <dt className='text-muted-foreground'>
                      {t('Credential schemes')}
                    </dt>
                    <dd>
                      v{item.version} · {item.schemeNames.join(', ')}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>{t('Updated by')}</dt>
                    <dd>
                      {item.updatedBy} · {formatCanvasDateTime(item.createdAt)}
                    </dd>
                  </div>
                  <ConnectionCheck
                    label={t('Last check')}
                    value={item.latestCheck}
                  />
                </dl>
                <div className='mt-3 flex gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={checkCredential.isPending}
                    onClick={() => checkCredential.mutate(item.id)}
                  >
                    {t('Check connection')}
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => {
                      credential.reset({
                        providerId: item.providerId,
                        credentialGroupId: item.credentialGroupId,
                        name: item.name,
                        entries: item.schemeNames.map((schemeName) => ({
                          schemeName,
                          secret: '',
                        })),
                        reason: '',
                      })
                      requestAnimationFrame(() =>
                        credential.setFocus('entries.0.secret')
                      )
                    }}
                  >
                    {t('Replace secret')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <form
            aria-label={t('Publish provider credential group')}
            className='bg-muted/20 grid gap-3 rounded-xl border p-4 md:grid-cols-2 xl:grid-cols-3'
            onSubmit={credential.handleSubmit(() =>
              setConfirmation('credential')
            )}
          >
            <Field
              label={t('Provider')}
              error={credential.formState.errors.providerId?.message}
            >
              <NativeSelect
                className='w-full'
                disabled={Boolean(credential.watch('credentialGroupId'))}
                {...credential.register('providerId')}
              >
                <NativeSelectOption value=''>
                  {t('Select provider')}
                </NativeSelectOption>
                {runtime.data.providers.map((provider) => (
                  <NativeSelectOption key={provider.id} value={provider.id}>
                    {provider.code}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field
              label={t('Credential group')}
              error={credential.formState.errors.name?.message}
            >
              <Input
                disabled={Boolean(credential.watch('credentialGroupId'))}
                {...credential.register('name')}
              />
            </Field>
            <Field
              label={t('Reason')}
              error={credential.formState.errors.reason?.message}
            >
              <Input {...credential.register('reason')} />
            </Field>
            <div className='space-y-2 md:col-span-2 xl:col-span-3'>
              {credentialEntries.fields.map((entry, index) => (
                <div
                  key={entry.id}
                  className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]'
                >
                  <Field
                    label={t('Security scheme name')}
                    error={
                      credential.formState.errors.entries?.[index]?.schemeName
                        ?.message
                    }
                  >
                    <Input
                      {...credential.register(`entries.${index}.schemeName`)}
                      placeholder='bearerAuth'
                    />
                  </Field>
                  <Field
                    label={t('Secret value')}
                    error={
                      credential.formState.errors.entries?.[index]?.secret
                        ?.message
                    }
                  >
                    <Input
                      type='password'
                      autoComplete='new-password'
                      {...credential.register(`entries.${index}.secret`)}
                    />
                  </Field>
                  <Button
                    className='self-end'
                    type='button'
                    variant='outline'
                    disabled={credentialEntries.fields.length === 1}
                    onClick={() => credentialEntries.remove(index)}
                  >
                    {t('Remove')}
                  </Button>
                </div>
              ))}
              <Button
                type='button'
                variant='outline'
                onClick={() =>
                  credentialEntries.append({ schemeName: '', secret: '' })
                }
              >
                {t('Add credential')}
              </Button>
            </div>
            <div className='md:col-span-2 xl:col-span-3'>
              <Button type='submit'>
                {t('Review credential publication')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Model credential bindings')}</CardTitle>
          <CardDescription>
            {t(
              'Search and select models, including all current filtered results. Publication is atomic for every selected model.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          <form
            aria-label={t('Publish model credential bindings')}
            className='space-y-3'
            onSubmit={binding.handleSubmit(
              () => selectedModels.length > 0 && setConfirmation('binding')
            )}
          >
            <div className='grid gap-3 md:grid-cols-3'>
              <Field
                label={t('Credential group')}
                error={
                  binding.formState.errors.credentialGroupVersionId?.message
                }
              >
                <NativeSelect
                  className='w-full'
                  {...binding.register('credentialGroupVersionId')}
                  onChange={(event) => {
                    binding.setValue(
                      'credentialGroupVersionId',
                      event.target.value,
                      { shouldValidate: true }
                    )
                    setSelectedModels([])
                  }}
                >
                  <NativeSelectOption value=''>
                    {t('Select credential group')}
                  </NativeSelectOption>
                  {runtime.data.credentialGroups.map((group) => (
                    <NativeSelectOption key={group.id} value={group.id}>
                      {group.providerCode} · {group.name} v{group.version}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label={t('Search models')}>
                <Input
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event.target.value)}
                />
              </Field>
              <Field
                label={t('Reason')}
                error={binding.formState.errors.reason?.message}
              >
                <Input {...binding.register('reason')} />
              </Field>
            </div>
            <div className='overflow-hidden rounded-lg border'>
              <label className='bg-muted/30 flex items-center gap-3 border-b p-3 text-sm font-medium'>
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={(checked) =>
                    setSelectedModels(
                      checked
                        ? [
                            ...new Set([
                              ...selectedModels,
                              ...filteredModels.map((model) => model.id),
                            ]),
                          ]
                        : selectedModels.filter(
                            (id) =>
                              !filteredModels.some((model) => model.id === id)
                          )
                    )
                  }
                />
                {t('Select current filtered results')} ({filteredModels.length})
              </label>
              <div className='max-h-72 overflow-auto'>
                {filteredModels.map((model) => (
                  <label
                    key={model.id}
                    className='hover:bg-muted/20 flex items-start gap-3 border-b p-3 text-sm last:border-b-0'
                  >
                    <Checkbox
                      checked={selectedModels.includes(model.id)}
                      onCheckedChange={(checked) =>
                        setSelectedModels(
                          checked
                            ? [...selectedModels, model.id]
                            : selectedModels.filter((id) => id !== model.id)
                        )
                      }
                    />
                    <span>
                      <span className='font-medium'>{model.publicName}</span>
                      <span className='text-muted-foreground block text-xs'>
                        {model.providerCode} · {model.modelKey} ·{' '}
                        {model.credentialGroupName ?? t('Not configured')}
                      </span>
                    </span>
                  </label>
                ))}
                {filteredModels.length === 0 && (
                  <div className='text-muted-foreground p-4 text-center text-sm'>
                    {t('No matching models')}
                  </div>
                )}
              </div>
            </div>
            <Button type='submit' disabled={selectedModels.length === 0}>
              {t('Review model bindings')} ({selectedModels.length})
            </Button>
          </form>
        </CardContent>
      </Card>

      <PricingActionConfirmation
        open={confirmation !== null}
        onOpenChange={(open) => !open && setConfirmation(null)}
        title={t('Confirm runtime configuration change')}
        description={t(
          'This publishes immutable configuration versions. Secret values will not be shown again.'
        )}
        details={confirmationDetails}
        confirmLabel={t('Confirm publication')}
        pending={
          storageMutation.isPending ||
          credentialMutation.isPending ||
          bindingMutation.isPending
        }
        onConfirm={() => {
          if (confirmation === 'storage') {
            storageMutation.mutate(storage.getValues())
          }
          if (confirmation === 'credential') {
            credentialMutation.mutate(credential.getValues())
          }
          if (confirmation === 'binding') {
            bindingMutation.mutate(binding.getValues())
          }
        }}
      />
    </div>
  )
}

function Field(props: { label: string; error?: unknown; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className='min-w-0 space-y-1'>
      <Label className='block'>
        {props.label}
        <span className='mt-1 block font-normal'>{props.children}</span>
      </Label>
      {Boolean(props.error) && (
        <div className='text-destructive text-xs' role='alert'>
          {t('Please check this field')}
        </div>
      )}
    </div>
  )
}

function ConnectionCheck(props: {
  label: string
  value: CanvasRuntimeConnectionCheck | null
}) {
  const { t } = useTranslation()
  let statusClass = 'text-muted-foreground'
  if (props.value?.outcome === 'PASSED') {
    statusClass = 'text-emerald-600 dark:text-emerald-400'
  }
  if (props.value?.outcome === 'FAILED') statusClass = 'text-destructive'
  let statusLabel = t('Not checked')
  if (props.value?.outcome === 'PASSED') statusLabel = t('Passed')
  if (props.value?.outcome === 'FAILED') statusLabel = t('Failed')
  return (
    <div>
      <dt className='text-muted-foreground'>{props.label}</dt>
      <dd>
        <span className={statusClass}>{statusLabel}</span>
        {props.value && (
          <>
            {' '}
            · {formatCanvasDateTime(props.value.checkedAt)}
            {props.value.checkedBy ? ` · ${props.value.checkedBy}` : ''}
          </>
        )}
        {props.value?.outcome === 'FAILED' && (
          <span className='text-muted-foreground block'>
            {connectionCheckReason(props.value.reasonCode, t)}
          </span>
        )}
      </dd>
    </div>
  )
}

function connectionCheckReason(
  reasonCode: string | null,
  translate: (key: string) => string
) {
  if (reasonCode === 'PROVIDER_CHECK_REQUIRES_CHANNEL') {
    return translate('A safe provider check requires a bound provider channel')
  }
  if (reasonCode === 'R2_CONNECTION_FAILED') {
    return translate('The R2 connection could not be verified')
  }
  return reasonCode ?? translate('Connection check failed')
}

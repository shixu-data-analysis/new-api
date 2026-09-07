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
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import {
  bindCanvasProviderCredentials,
  checkCanvasDatabaseBackupStorage,
  checkCanvasProviderCredentialGroup,
  checkCanvasTaskMediaStorage,
  getCanvasProviderConfiguration,
  getCanvasRuntimeConfiguration,
  publishCanvasDatabaseBackupStorage,
  publishCanvasProviderCredentialGroup,
  publishCanvasTaskMediaStorage,
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

const taskMediaSchema = z.object({
  endpoint: z.string().url().refine(isHttpsOrigin),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  inputRetentionHours: z.number().int().min(1).max(8760),
  outputRetentionHours: z.number().int().min(1).max(8760),
  downloadUrlTtlSeconds: z.number().int().min(60).max(3600),
  reason: z.string().trim().min(1).max(255),
})
type TaskMediaForm = z.infer<typeof taskMediaSchema>
const databaseBackupSchema = z.object({
  endpoint: z.string().url().refine(isHttpsOrigin),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  reason: z.string().trim().min(1).max(255),
})
type DatabaseBackupForm = z.infer<typeof databaseBackupSchema>

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

export function RuntimeConfiguration(props: { providerOnly?: boolean } = {}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [activeSection, setActiveSection] = useState<
    'taskMedia' | 'databaseBackup' | 'providerCredentials'
  >('taskMedia')
  const [openEditor, setOpenEditor] = useState<
    'taskMedia' | 'databaseBackup' | 'credential' | 'binding' | null
  >(null)
  const [confirmation, setConfirmation] = useState<
    'taskMedia' | 'databaseBackup' | 'credential' | 'binding' | null
  >(null)
  const [modelSearch, setModelSearch] = useState('')
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const runtime = useQuery({
    queryKey: [
      'canvas-cloud',
      props.providerOnly ? 'provider-configuration' : 'runtime-configuration',
    ],
    queryFn: props.providerOnly
      ? getCanvasProviderConfiguration
      : getCanvasRuntimeConfiguration,
  })
  const taskMedia = useForm<TaskMediaForm>({
    resolver: zodResolver(taskMediaSchema),
    defaultValues: {
      endpoint: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
      inputRetentionHours: 24,
      outputRetentionHours: 72,
      downloadUrlTtlSeconds: 900,
      reason: '',
    },
  })
  const databaseBackup = useForm<DatabaseBackupForm>({
    resolver: zodResolver(databaseBackupSchema),
    defaultValues: {
      endpoint: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
      reason: '',
    },
  })
  const credential = useForm<CredentialForm>({
    resolver: zodResolver(credentialSchema),
    defaultValues: {
      providerId: '',
      credentialGroupId: undefined,
      name: '',
      entries: [],
      reason: '',
    },
  })
  const binding = useForm<BindingForm>({
    resolver: zodResolver(bindingSchema),
    defaultValues: { credentialGroupVersionId: '', reason: '' },
  })

  const refresh = async () =>
    queryClient.invalidateQueries({
      queryKey: [
        'canvas-cloud',
        props.providerOnly ? 'provider-configuration' : 'runtime-configuration',
      ],
    })
  const taskMediaMutation = useMutation({
    mutationFn: (value: TaskMediaForm) =>
      publishCanvasTaskMediaStorage({
        endpoint: value.endpoint,
        mediaBucket: value.bucket,
        mediaCredentials: {
          accessKeyId: value.accessKeyId,
          secretAccessKey: value.secretAccessKey,
        },
        inputRetentionHours: value.inputRetentionHours,
        outputRetentionHours: value.outputRetentionHours,
        downloadUrlTtlSeconds: value.downloadUrlTtlSeconds,
        reason: value.reason,
      }),
    onSuccess: async () => {
      setConfirmation(null)
      setOpenEditor(null)
      taskMedia.resetField('accessKeyId')
      taskMedia.resetField('secretAccessKey')
      toast.success(t('Task media configuration published'))
      await refresh()
    },
    onError: () => toast.error(t('Task media configuration failed')),
  })
  const databaseBackupMutation = useMutation({
    mutationFn: (value: DatabaseBackupForm) =>
      publishCanvasDatabaseBackupStorage({
        endpoint: value.endpoint,
        backupBucket: value.bucket,
        backupCredentials: {
          accessKeyId: value.accessKeyId,
          secretAccessKey: value.secretAccessKey,
        },
        reason: value.reason,
      }),
    onSuccess: async () => {
      setConfirmation(null)
      setOpenEditor(null)
      databaseBackup.resetField('accessKeyId')
      databaseBackup.resetField('secretAccessKey')
      toast.success(t('Database backup configuration published'))
      await refresh()
    },
    onError: () => toast.error(t('Database backup configuration failed')),
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
      setOpenEditor(null)
      credential.reset({
        providerId: '',
        credentialGroupId: undefined,
        name: '',
        entries: [],
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
      setOpenEditor(null)
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
  const checkTaskMedia = useMutation({
    mutationFn: checkCanvasTaskMediaStorage,
    onSuccess: reportCheck,
    onError: () => toast.error(t('Connection check failed')),
  })
  const checkDatabaseBackup = useMutation({
    mutationFn: checkCanvasDatabaseBackupStorage,
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
  if (confirmation === 'taskMedia') {
    confirmationDetails = [
      { label: t('Environment'), value: runtime.data?.environment ?? '—' },
      { label: t('Task media bucket'), value: taskMedia.getValues('bucket') },
    ]
  }
  if (confirmation === 'databaseBackup') {
    confirmationDetails = [
      { label: t('Environment'), value: runtime.data?.environment ?? '—' },
      {
        label: t('Database backup bucket'),
        value: databaseBackup.getValues('bucket'),
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
    <Tabs
      value={props.providerOnly ? 'providerCredentials' : activeSection}
      onValueChange={(value) => {
        setActiveSection(
          value as 'taskMedia' | 'databaseBackup' | 'providerCredentials'
        )
        setOpenEditor(null)
      }}
      className='space-y-4'
    >
      {!props.providerOnly && (
        <Card>
          <CardHeader>
            <CardTitle>{t('Runtime storage')}</CardTitle>
            <CardDescription>
              {t(
                'Task media and database backups use independent buckets, credentials, publications, and connection checks.'
              )}
            </CardDescription>
            <CardAction>
              <div className='bg-muted rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap'>
                {t('Current environment')}: {runtime.data.environment}
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <TabsList className='h-10 w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden p-1'>
              <TabsTrigger
                value='taskMedia'
                className='h-8 min-h-8 flex-none px-3'
              >
                {t('Task media')}
              </TabsTrigger>
              <TabsTrigger
                value='databaseBackup'
                className='h-8 min-h-8 flex-none px-3'
              >
                {t('Database backups')}
              </TabsTrigger>
              <TabsTrigger
                value='providerCredentials'
                className='h-8 min-h-8 flex-none px-3'
              >
                {t('Provider credential groups')}
              </TabsTrigger>
            </TabsList>
          </CardContent>
        </Card>
      )}

      {!props.providerOnly && (
        <TabsContent value='taskMedia'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Task media')}</CardTitle>
              <CardDescription>
                {t(
                  'Stores task inputs and generated outputs with separate retention controls.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-5'>
              {runtime.data.taskMedia ? (
                <StorageSummary
                  bucketLabel={t('Task media bucket')}
                  item={runtime.data.taskMedia}
                  details={`${t('Input retention hours')}: ${runtime.data.taskMedia.inputRetentionHours}h · ${t('Output retention hours')}: ${runtime.data.taskMedia.outputRetentionHours}h · ${t('Download URL seconds')}: ${runtime.data.taskMedia.downloadUrlTtlSeconds}s`}
                  checkLabel={t('Task media check')}
                  buttonLabel={t('Check task media')}
                  editLabel={t('Update configuration')}
                  onCheck={() =>
                    checkTaskMedia.mutate(runtime.data.taskMedia!.id)
                  }
                  checking={checkTaskMedia.isPending}
                  editing={openEditor === 'taskMedia'}
                  onEdit={() =>
                    setOpenEditor(
                      openEditor === 'taskMedia' ? null : 'taskMedia'
                    )
                  }
                />
              ) : (
                <p className='text-muted-foreground text-sm'>
                  {t('Not configured')}
                </p>
              )}
              {!runtime.data.taskMedia && (
                <Button
                  variant='outline'
                  onClick={() => setOpenEditor('taskMedia')}
                  aria-expanded={openEditor === 'taskMedia'}
                >
                  {t('Update configuration')}
                </Button>
              )}
              {openEditor === 'taskMedia' && (
                <form
                  aria-label={t('Publish task media configuration')}
                  className='bg-muted/20 grid gap-3 rounded-lg border p-3 sm:grid-cols-2'
                  onSubmit={taskMedia.handleSubmit(() =>
                    setConfirmation('taskMedia')
                  )}
                >
                  <Field
                    label={t('R2 endpoint')}
                    error={taskMedia.formState.errors.endpoint?.message}
                  >
                    <Input
                      {...taskMedia.register('endpoint')}
                      placeholder='https://…r2.cloudflarestorage.com'
                    />
                  </Field>
                  <Field
                    label={t('Task media bucket')}
                    error={taskMedia.formState.errors.bucket?.message}
                  >
                    <Input {...taskMedia.register('bucket')} />
                  </Field>
                  <Field
                    label={t('Access key ID')}
                    error={taskMedia.formState.errors.accessKeyId?.message}
                  >
                    <Input
                      autoComplete='off'
                      {...taskMedia.register('accessKeyId')}
                    />
                  </Field>
                  <Field
                    label={t('Secret access key')}
                    error={taskMedia.formState.errors.secretAccessKey?.message}
                  >
                    <Input
                      type='password'
                      autoComplete='new-password'
                      {...taskMedia.register('secretAccessKey')}
                    />
                  </Field>
                  <Field
                    label={t('Input retention hours')}
                    error={
                      taskMedia.formState.errors.inputRetentionHours?.message
                    }
                  >
                    <Input
                      type='number'
                      min={1}
                      max={8760}
                      {...taskMedia.register('inputRetentionHours', {
                        valueAsNumber: true,
                      })}
                    />
                  </Field>
                  <Field
                    label={t('Output retention hours')}
                    error={
                      taskMedia.formState.errors.outputRetentionHours?.message
                    }
                  >
                    <Input
                      type='number'
                      min={1}
                      max={8760}
                      {...taskMedia.register('outputRetentionHours', {
                        valueAsNumber: true,
                      })}
                    />
                  </Field>
                  <Field
                    label={t('Download URL seconds')}
                    error={
                      taskMedia.formState.errors.downloadUrlTtlSeconds?.message
                    }
                  >
                    <Input
                      type='number'
                      min={60}
                      max={3600}
                      {...taskMedia.register('downloadUrlTtlSeconds', {
                        valueAsNumber: true,
                      })}
                    />
                  </Field>
                  <Field
                    label={t('Reason')}
                    error={taskMedia.formState.errors.reason?.message}
                  >
                    <Input {...taskMedia.register('reason')} />
                  </Field>
                  <div className='sm:col-span-2'>
                    <Button type='submit'>
                      {t('Review task media publication')}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      )}

      {!props.providerOnly && (
        <TabsContent value='databaseBackup'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Database backups')}</CardTitle>
              <CardDescription>
                {t(
                  'Stores database backups with dedicated credentials and lifecycle managed outside task media.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-5'>
              {runtime.data.databaseBackup ? (
                <StorageSummary
                  bucketLabel={t('Database backup bucket')}
                  item={runtime.data.databaseBackup}
                  checkLabel={t('Backup check')}
                  buttonLabel={t('Check backup')}
                  editLabel={t('Update configuration')}
                  onCheck={() =>
                    checkDatabaseBackup.mutate(runtime.data.databaseBackup!.id)
                  }
                  checking={checkDatabaseBackup.isPending}
                  editing={openEditor === 'databaseBackup'}
                  onEdit={() =>
                    setOpenEditor(
                      openEditor === 'databaseBackup' ? null : 'databaseBackup'
                    )
                  }
                />
              ) : (
                <p className='text-muted-foreground text-sm'>
                  {t('Not configured')}
                </p>
              )}
              {!runtime.data.databaseBackup && (
                <Button
                  variant='outline'
                  onClick={() => setOpenEditor('databaseBackup')}
                  aria-expanded={openEditor === 'databaseBackup'}
                >
                  {t('Update configuration')}
                </Button>
              )}
              {openEditor === 'databaseBackup' && (
                <form
                  aria-label={t('Publish database backup configuration')}
                  className='bg-muted/20 grid gap-3 rounded-lg border p-3 sm:grid-cols-2'
                  onSubmit={databaseBackup.handleSubmit(() =>
                    setConfirmation('databaseBackup')
                  )}
                >
                  <Field
                    label={t('R2 endpoint')}
                    error={databaseBackup.formState.errors.endpoint?.message}
                  >
                    <Input
                      {...databaseBackup.register('endpoint')}
                      placeholder='https://…r2.cloudflarestorage.com'
                    />
                  </Field>
                  <Field
                    label={t('Database backup bucket')}
                    error={databaseBackup.formState.errors.bucket?.message}
                  >
                    <Input {...databaseBackup.register('bucket')} />
                  </Field>
                  <Field
                    label={t('Access key ID')}
                    error={databaseBackup.formState.errors.accessKeyId?.message}
                  >
                    <Input
                      autoComplete='off'
                      {...databaseBackup.register('accessKeyId')}
                    />
                  </Field>
                  <Field
                    label={t('Secret access key')}
                    error={
                      databaseBackup.formState.errors.secretAccessKey?.message
                    }
                  >
                    <Input
                      type='password'
                      autoComplete='new-password'
                      {...databaseBackup.register('secretAccessKey')}
                    />
                  </Field>
                  <Field
                    label={t('Reason')}
                    error={databaseBackup.formState.errors.reason?.message}
                  >
                    <Input {...databaseBackup.register('reason')} />
                  </Field>
                  <div className='self-end sm:col-span-2'>
                    <Button type='submit'>
                      {t('Review database backup publication')}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      )}

      <TabsContent value='providerCredentials' className='space-y-4'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Provider credential groups')}</CardTitle>
            <CardDescription>
              {t(
                'Keep multiple named credential groups per provider and replace secrets through immutable versions.'
              )}
            </CardDescription>
            <CardAction>
              <Button
                variant='outline'
                aria-expanded={openEditor === 'credential'}
                onClick={() => {
                  if (openEditor === 'credential') {
                    setOpenEditor(null)
                    return
                  }
                  credential.reset({
                    providerId: '',
                    credentialGroupId: undefined,
                    name: '',
                    entries: [],
                    reason: '',
                  })
                  setOpenEditor('credential')
                }}
              >
                {t('Manage credential groups')}
              </Button>
            </CardAction>
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
                      <dt className='text-muted-foreground'>
                        {t('Updated by')}
                      </dt>
                      <dd>
                        {item.updatedBy} ·{' '}
                        {formatCanvasDateTime(item.createdAt)}
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
                          entries:
                            runtime.data.providers
                              .find(
                                (provider) => provider.id === item.providerId
                              )
                              ?.credentialSchemes.map((schemeName) => ({
                                schemeName,
                                secret: '',
                              })) ?? [],
                          reason: '',
                        })
                        setOpenEditor('credential')
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
            {openEditor === 'credential' && (
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
                    {...credential.register('providerId', {
                      onChange: (event) => {
                        const provider = runtime.data.providers.find(
                          (item) => item.id === event.target.value
                        )
                        credential.setValue(
                          'entries',
                          (provider?.credentialSchemes ?? []).map(
                            (schemeName) => ({
                              schemeName,
                              secret: '',
                            })
                          )
                        )
                      },
                    })}
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
                  {credential.watch('entries').map((entry, index) => (
                    <div
                      key={entry.schemeName}
                      className='grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'
                    >
                      <div className='min-w-0 space-y-1'>
                        <div className='text-sm font-medium'>
                          {t('Security scheme name')}
                        </div>
                        <div className='bg-muted rounded-lg border px-2.5 py-1.5 font-mono text-sm'>
                          {entry.schemeName}
                        </div>
                      </div>
                      <Field
                        label={`${t('Secret value')} · ${entry.schemeName}`}
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
                    </div>
                  ))}
                  {credential.watch('entries').length === 0 && (
                    <div className='text-muted-foreground text-sm'>
                      {t('Not configured')}
                    </div>
                  )}
                </div>
                <div className='md:col-span-2 xl:col-span-3'>
                  <Button type='submit'>
                    {t('Review credential publication')}
                  </Button>
                </div>
              </form>
            )}
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
            <CardAction>
              <Button
                variant='outline'
                aria-expanded={openEditor === 'binding'}
                onClick={() =>
                  setOpenEditor(openEditor === 'binding' ? null : 'binding')
                }
              >
                {t('Manage model bindings')}
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className='space-y-3'>
            {openEditor === 'binding' && (
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
                                  !filteredModels.some(
                                    (model) => model.id === id
                                  )
                              )
                        )
                      }
                    />
                    {t('Select current filtered results')} (
                    {filteredModels.length})
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
                          <span className='font-medium'>
                            {model.publicName}
                          </span>
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
            )}
          </CardContent>
        </Card>
      </TabsContent>

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
          taskMediaMutation.isPending ||
          databaseBackupMutation.isPending ||
          credentialMutation.isPending ||
          bindingMutation.isPending
        }
        onConfirm={() => {
          if (confirmation === 'taskMedia') {
            taskMediaMutation.mutate(taskMedia.getValues())
          }
          if (confirmation === 'databaseBackup') {
            databaseBackupMutation.mutate(databaseBackup.getValues())
          }
          if (confirmation === 'credential') {
            credentialMutation.mutate(credential.getValues())
          }
          if (confirmation === 'binding') {
            bindingMutation.mutate(binding.getValues())
          }
        }}
      />
    </Tabs>
  )
}

function StorageSummary(props: {
  bucketLabel: string
  item: {
    version: number
    status: string
    endpoint: string
    bucket: string
    updatedBy: string
    createdAt: string
    latestCheck: CanvasRuntimeConnectionCheck | null
  }
  details?: string
  checkLabel: string
  buttonLabel: string
  editLabel: string
  checking: boolean
  editing: boolean
  onCheck: () => void
  onEdit: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className='space-y-5 text-sm'>
      <div className='flex flex-wrap items-center gap-2'>
        <BusinessTerm kind='configStatus' value={props.item.status} />
        <span className='bg-muted rounded-md px-2 py-1 text-xs font-medium tabular-nums'>
          v{props.item.version}
        </span>
      </div>
      <dl className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
        <div className='bg-muted/30 min-w-0 rounded-lg p-3 xl:col-span-2'>
          <dt className='text-muted-foreground text-xs'>{t('R2 endpoint')}</dt>
          <dd className='mt-1 font-medium break-all'>{props.item.endpoint}</dd>
        </div>
        <div className='bg-muted/30 min-w-0 rounded-lg p-3'>
          <dt className='text-muted-foreground text-xs'>{props.bucketLabel}</dt>
          <dd className='mt-1 font-medium break-all'>{props.item.bucket}</dd>
        </div>
        {props.details && (
          <div className='bg-muted/30 min-w-0 rounded-lg p-3 md:col-span-2'>
            <dt className='text-muted-foreground text-xs'>
              {t('Retention and download')}
            </dt>
            <dd className='mt-1 font-medium'>{props.details}</dd>
          </div>
        )}
        <div className='bg-muted/30 min-w-0 rounded-lg p-3'>
          <dt className='text-muted-foreground text-xs'>{t('Updated by')}</dt>
          <dd className='mt-1 font-medium'>
            {props.item.updatedBy} ·{' '}
            {formatCanvasDateTime(props.item.createdAt)}
          </dd>
        </div>
      </dl>
      <div className='bg-muted/30 flex flex-col gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
        <dl className='min-w-0 text-xs'>
          <ConnectionCheck
            label={props.checkLabel}
            value={props.item.latestCheck}
          />
        </dl>
        <div className='flex shrink-0 flex-wrap gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={props.checking}
            onClick={props.onCheck}
          >
            {props.buttonLabel}
          </Button>
          <Button
            size='sm'
            aria-expanded={props.editing}
            onClick={props.onEdit}
          >
            {props.editLabel}
          </Button>
        </div>
      </div>
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

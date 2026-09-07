/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { Badge } from '@/components/ui/badge'
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
import { Textarea } from '@/components/ui/textarea'

import { getCanvasProviderPricingMatrix } from '../api'
import {
  getCanvasChannelExecution,
  getCanvasExecutionOverview,
  previewCanvasExecutionError,
  publishCanvasExecutionPolicy,
} from '../execution-api'
import type {
  ChannelExecutionConfig,
  ErrorCategory,
  ErrorRule,
  ExecutionLocale,
  GlobalExecutionConfig,
  LimitRule,
} from '../execution-types'
import { formatCanvasDateTime } from '../formatters'
import { BusinessTerm } from './BusinessTerm'
import { PricingActionConfirmation } from './PricingActionConfirmation'

const executorModeLabelKeys: Record<string, string> = {
  MOCK: 'Mock mode',
  REAL: 'Real mode',
}

const integer = (minimum: number, maximum: number) =>
  z.number().int().min(minimum).max(maximum)
const globalSchema = z
  .object({
    instanceConcurrency: integer(1, 10_000),
    queryReservedConcurrency: integer(0, 10_000),
    userOutputLimit: integer(1, 10_000),
  })
  .refine(
    (value) => value.queryReservedConcurrency <= value.instanceConcurrency,
    { path: ['queryReservedConcurrency'] }
  )
const channelSchema = z.object({
  requestTimeoutMs: integer(0, 604_800_000),
  streamIdleTimeoutMs: integer(1_000, 604_800_000),
  pollIntervalMs: integer(1_000, 3_600_000),
  deadlineMs: integer(1_000, 2_592_000_000),
  requestConcurrency: integer(1, 10_000),
  asyncInFlightLimit: integer(1, 100_000),
})
const errorRuleSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  version: integer(1, 2_147_483_647),
  enabled: z.boolean(),
  httpStatus: z.union([z.literal(''), z.number().int().min(100).max(599)]),
  upstreamCode: z.string().max(128),
  messageContains: z.string().max(512),
  category: z.enum([
    'INVALID_REQUEST',
    'PROVIDER_AUTH_FAILED',
    'PROVIDER_BALANCE_INSUFFICIENT',
    'PROVIDER_ACCESS_DENIED',
    'PROVIDER_ENDPOINT_NOT_FOUND',
    'PROVIDER_REQUEST_TIMEOUT',
    'PROVIDER_RATE_LIMITED',
    'PROVIDER_INTERNAL_ERROR',
    'PROVIDER_BAD_GATEWAY',
    'PROVIDER_UNAVAILABLE',
    'PROVIDER_GATEWAY_TIMEOUT',
    'PROVIDER_UNKNOWN_ERROR',
  ]),
  priority: integer(-100_000, 100_000),
  clientMessages: z.object({
    zhCN: z.string().min(1).max(1_024),
    en: z.string().min(1).max(1_024),
    fr: z.string().min(1).max(1_024),
    ru: z.string().min(1).max(1_024),
    ja: z.string().min(1).max(1_024),
    vi: z.string().min(1).max(1_024),
    zhTW: z.string().min(1).max(1_024),
  }),
  adminNote: z.string().max(2_048),
  source: z.enum(['SYSTEM', 'OVERRIDE', 'CUSTOM']),
})
const errorSchema = z.object({ rules: z.array(errorRuleSchema).max(500) })
const limitRuleSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  enabled: z.boolean(),
  scope: z.enum([
    'CHANNEL',
    'CREDENTIAL',
    'MODEL',
    'MODEL_GROUP',
    'CREDENTIAL_MODEL',
  ]),
  credentialGroupId: z.string(),
  modelIds: z.array(z.string()),
  sharedGroup: z.string().max(191),
  metric: z.enum(['CONCURRENCY', 'RPM', 'TPM', 'ASYNC_IN_FLIGHT']),
  limit: z.string().regex(/^[1-9][0-9]*$/),
  tokenIncludes: z.object({
    input: z.boolean(),
    output: z.boolean(),
    cacheRead: z.boolean(),
    cacheWrite: z.boolean(),
  }),
})
const limitSchema = z
  .object({ rules: z.array(limitRuleSchema).max(500) })
  .superRefine(({ rules }, context) => {
    const ids = new Set<string>()
    for (const [index, rule] of rules.entries()) {
      if (ids.has(rule.id)) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'id'],
          message: 'Duplicate rule ID',
        })
      }
      ids.add(rule.id)
      const needsCredential = ['CREDENTIAL', 'CREDENTIAL_MODEL'].includes(
        rule.scope
      )
      const needsModels = ['MODEL', 'MODEL_GROUP', 'CREDENTIAL_MODEL'].includes(
        rule.scope
      )
      if (needsCredential && !rule.credentialGroupId) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'credentialGroupId'],
          message: 'Credential group is required',
        })
      }
      if (needsModels && rule.modelIds.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'modelIds'],
          message: 'Select at least one model',
        })
      }
      if (rule.scope === 'MODEL' && rule.modelIds.length !== 1) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'modelIds'],
          message: 'Select exactly one model',
        })
      }
      if (
        rule.sharedGroup &&
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(rule.sharedGroup.trim())
      ) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'sharedGroup'],
          message: 'Shared group is invalid',
        })
      }
      if (
        /^[1-9][0-9]*$/.test(rule.limit) &&
        BigInt(rule.limit) > 9_223_372_036_854_775_807n
      ) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'limit'],
          message: 'Limit is too large',
        })
      }
    }
  })

type GlobalForm = z.infer<typeof globalSchema>
type ChannelForm = z.infer<typeof channelSchema>
type ErrorForm = z.infer<typeof errorSchema>
type LimitForm = z.infer<typeof limitSchema>
type Confirmation = {
  title: string
  description: string
  details: Array<{ label: string; value: string }>
  confirmLabel: string
  run: () => void
}
const locales: ExecutionLocale[] = [
  'zhCN',
  'en',
  'fr',
  'ru',
  'ja',
  'vi',
  'zhTW',
]
const categories: ErrorCategory[] = [
  'INVALID_REQUEST',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_BALANCE_INSUFFICIENT',
  'PROVIDER_ACCESS_DENIED',
  'PROVIDER_ENDPOINT_NOT_FOUND',
  'PROVIDER_REQUEST_TIMEOUT',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_INTERNAL_ERROR',
  'PROVIDER_BAD_GATEWAY',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_GATEWAY_TIMEOUT',
  'PROVIDER_UNKNOWN_ERROR',
]

const emptyLimitRule = (): LimitForm['rules'][number] => ({
  id: `custom.limit.${crypto.randomUUID()}`,
  enabled: true,
  scope: 'CHANNEL',
  credentialGroupId: '',
  modelIds: [],
  sharedGroup: '',
  metric: 'CONCURRENCY',
  limit: '1',
  tokenIncludes: {
    input: true,
    output: true,
    cacheRead: false,
    cacheWrite: false,
  },
})
const emptyErrorRule = (): ErrorForm['rules'][number] => ({
  id: `custom.error.${crypto.randomUUID()}`,
  version: 1,
  enabled: true,
  httpStatus: '',
  upstreamCode: '',
  messageContains: '',
  category: 'PROVIDER_UNKNOWN_ERROR',
  priority: 100,
  clientMessages: Object.fromEntries(
    locales.map((locale) => [locale, ''])
  ) as Record<ExecutionLocale, string>,
  adminNote: '',
  source: 'CUSTOM',
})

function fieldError(message: string) {
  return (
    <p className='text-destructive text-xs' role='alert'>
      {message}
    </p>
  )
}

export function ExecutionSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedChannelId, setSelectedChannelId] = useState('')
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const overview = useQuery({
    queryKey: ['canvas-cloud', 'execution'],
    queryFn: ({ signal }) => getCanvasExecutionOverview(signal),
    refetchInterval: 10_000,
  })
  const matrix = useQuery({
    queryKey: ['canvas-cloud', 'provider-pricing-matrix'],
    queryFn: getCanvasProviderPricingMatrix,
  })
  const channels = useMemo(() => {
    const result = new Map<
      string,
      { id: string; label: string; providerId: string }
    >()
    for (const model of matrix.data ?? []) {
      if (!model.channelId) continue
      result.set(model.channelId, {
        id: model.channelId,
        providerId: model.providerId,
        label: `${model.providerCode} · ${model.channelId}`,
      })
    }
    return [...result.values()]
  }, [matrix.data])
  useEffect(() => {
    if (!selectedChannelId && channels[0]) setSelectedChannelId(channels[0].id)
  }, [channels, selectedChannelId])
  const channel = useQuery({
    queryKey: ['canvas-cloud', 'execution', selectedChannelId],
    queryFn: ({ signal }) =>
      getCanvasChannelExecution(selectedChannelId, signal),
    enabled: Boolean(selectedChannelId),
  })
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['canvas-cloud', 'execution'],
    })
  }
  const publish = useMutation({
    mutationFn: publishCanvasExecutionPolicy,
    onSuccess: async () => {
      setConfirmation(null)
      toast.success(t('Execution policy published'))
      await refresh()
    },
    onError: () => toast.error(t('Execution policy publication failed')),
  })

  return (
    <Tabs defaultValue='global' className='space-y-4'>
      <TabsList className='h-10 w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden p-1'>
        <TabsTrigger className='h-8 min-h-8 flex-none px-3' value='global'>
          {t('Global execution limits')}
        </TabsTrigger>
        <TabsTrigger className='h-8 min-h-8 flex-none px-3' value='channel'>
          {t('Channel execution policy')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value='global' className='mt-0'>
        {overview.isPending && (
          <Card size='sm'>
            <CardContent className='text-muted-foreground text-sm'>
              {t('Loading')}
            </CardContent>
          </Card>
        )}
        {overview.isError && (
          <Card size='sm'>
            <CardContent>
              <Button variant='outline' onClick={() => void overview.refetch()}>
                {t('Retry')}
              </Button>
            </CardContent>
          </Card>
        )}
        {overview.data && (
          <GlobalSection
            data={overview.data.global.effective}
            version={overview.data.global.version}
            recovery={overview.data.systemRecovery}
            instances={overview.data.instances}
            onReview={setConfirmation}
            onPublish={(config) =>
              publish.mutate({
                kind: 'GLOBAL_LIMITS',
                scopeKey: 'GLOBAL',
                config,
              })
            }
            pending={publish.isPending}
          />
        )}
      </TabsContent>

      <TabsContent value='channel' className='mt-0'>
        <Card>
          <CardHeader>
            <CardTitle>{t('Channel execution policy')}</CardTitle>
            <CardDescription>
              {t(
                'Select a published runtime channel before editing its policy.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='bg-muted/30 max-w-2xl space-y-1 rounded-lg border p-3'>
              <Label htmlFor='execution-channel'>{t('Provider channel')}</Label>
              <NativeSelect
                id='execution-channel'
                value={selectedChannelId}
                onChange={(event) => setSelectedChannelId(event.target.value)}
              >
                <NativeSelectOption value=''>
                  {t('Select a channel')}
                </NativeSelectOption>
                {channels.map((item) => (
                  <NativeSelectOption key={item.id} value={item.id}>
                    {item.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            {matrix.isPending && (
              <p className='text-muted-foreground text-sm'>{t('Loading')}</p>
            )}
            {matrix.isError && (
              <Button variant='outline' onClick={() => void matrix.refetch()}>
                {t('Retry')}
              </Button>
            )}
            {selectedChannelId && channel.isPending && (
              <p className='text-muted-foreground text-sm'>{t('Loading')}</p>
            )}
            {channel.isError && (
              <Button variant='outline' onClick={() => void channel.refetch()}>
                {t('Retry')}
              </Button>
            )}
            {channel.data && matrix.data && (
              <Tabs defaultValue='channel'>
                <TabsList className='h-10 w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden p-1'>
                  <TabsTrigger
                    className='h-8 min-h-8 flex-none px-3'
                    value='channel'
                  >
                    {t('Timeouts and concurrency')}
                  </TabsTrigger>
                  <TabsTrigger
                    className='h-8 min-h-8 flex-none px-3'
                    value='limits'
                  >
                    {t('Limit rules')}
                  </TabsTrigger>
                  <TabsTrigger
                    className='h-8 min-h-8 flex-none px-3'
                    value='errors'
                  >
                    {t('Error mappings')}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value='channel' className='mt-4'>
                  <ChannelSection
                    data={channel.data.channel.effective}
                    version={channel.data.channel.version}
                    onReview={setConfirmation}
                    onPublish={(config) =>
                      publish.mutate({
                        kind: 'CHANNEL_POLICY',
                        scopeKey: selectedChannelId,
                        config,
                      })
                    }
                    pending={publish.isPending}
                  />
                </TabsContent>
                <TabsContent value='limits' className='mt-4'>
                  <LimitSection
                    key={`limits-${selectedChannelId}-${channel.data.limits.version}`}
                    rules={channel.data.limits.effective.rules}
                    credentialGroups={
                      overview.data?.credentialGroups
                        .filter(
                          (item) => item.providerId === channel.data.providerId
                        )
                        .map((item) => ({
                          credentialGroupId: item.id,
                          name: item.name,
                        })) ?? []
                    }
                    models={[
                      ...new Map(
                        matrix.data
                          .filter(
                            (item) => item.channelId === selectedChannelId
                          )
                          .map((item) => [
                            item.customerModelId,
                            {
                              id: item.customerModelId,
                              publicName: item.modelName,
                            },
                          ])
                      ).values(),
                    ]}
                    onReview={setConfirmation}
                    onPublish={(rules) =>
                      publish.mutate({
                        kind: 'LIMIT_RULES',
                        scopeKey: selectedChannelId,
                        config: { rules },
                      })
                    }
                    pending={publish.isPending}
                  />
                </TabsContent>
                <TabsContent value='errors' className='mt-4'>
                  <ErrorSection
                    key={`errors-${channel.data.providerId}-${channel.data.errors.version}`}
                    channelId={selectedChannelId}
                    providerId={channel.data.providerId}
                    rules={channel.data.errors.effective.rules}
                    onReview={setConfirmation}
                    onPublish={(rules) =>
                      publish.mutate({
                        kind: 'ERROR_MAPPING',
                        scopeKey: channel.data.providerId,
                        config: { rules },
                      })
                    }
                    pending={publish.isPending}
                  />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      <PricingActionConfirmation
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
        title={confirmation?.title ?? ''}
        description={confirmation?.description ?? ''}
        details={confirmation?.details ?? []}
        confirmLabel={confirmation?.confirmLabel ?? t('Publish')}
        pending={publish.isPending}
        onConfirm={() => confirmation?.run()}
      />
    </Tabs>
  )
}

function GlobalSection(props: {
  data: GlobalExecutionConfig
  version: number | null
  recovery: {
    heartbeatMs: number
    leaseMs: number
    scanMs: number
    defaultInstances: number
  }
  instances: Array<{
    queueName: string
    mode: string
    workerId: string
    status: string
    credentialsConfigured: boolean
    heartbeatAt: string | null
    leaseExpiresAt: string | null
  }>
  pending: boolean
  onReview: (value: Confirmation) => void
  onPublish: (config: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const visibleInstances = props.instances.filter(
    (instance) =>
      instance.status !== 'STOPPED' &&
      instance.leaseExpiresAt !== null &&
      Date.parse(instance.leaseExpiresAt) > Date.now()
  )
  const form = useForm<GlobalForm>({
    resolver: zodResolver(globalSchema),
    values: props.data,
  })
  const review = form.handleSubmit((values) =>
    props.onReview({
      title: t('Publish global execution limits'),
      description: t(
        'This creates a new version and changes executor capacity.'
      ),
      details: Object.entries(values).map(([label, value]) => ({
        label: t(label),
        value: String(value),
      })),
      confirmLabel: t('Publish'),
      run: () => props.onPublish(values),
    })
  )
  return (
    <div className='space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Global execution limits')}</CardTitle>
          <CardDescription>
            {t('This creates a new version and changes executor capacity.')}
          </CardDescription>
          <CardAction>
            <Badge variant='secondary'>
              {t('Version')} {props.version ?? t('Default')}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <form
            aria-label={t('Global execution limits')}
            className='space-y-4'
            onSubmit={review}
          >
            <div className='grid gap-4 md:grid-cols-3'>
              <NumberField
                id='instance-concurrency'
                label={t('Instance concurrency')}
                registration={form.register('instanceConcurrency', {
                  valueAsNumber: true,
                })}
                error={form.formState.errors.instanceConcurrency?.message}
              />
              <NumberField
                id='query-reserved-concurrency'
                label={t('Query reserved concurrency')}
                registration={form.register('queryReservedConcurrency', {
                  valueAsNumber: true,
                })}
                error={form.formState.errors.queryReservedConcurrency?.message}
              />
              <NumberField
                id='user-output-limit'
                label={t('User output limit')}
                registration={form.register('userOutputLimit', {
                  valueAsNumber: true,
                })}
                error={form.formState.errors.userOutputLimit?.message}
              />
            </div>
            <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
              <Button
                type='button'
                variant='outline'
                disabled={props.pending}
                onClick={() =>
                  props.onReview({
                    title: t('Restore global defaults'),
                    description: t(
                      'The next version will inherit every global default.'
                    ),
                    details: [{ label: t('Scope'), value: 'GLOBAL' }],
                    confirmLabel: t('Restore defaults'),
                    run: () => props.onPublish({}),
                  })
                }
              >
                {t('Restore defaults')}
              </Button>
              <Button type='submit' disabled={props.pending}>
                {t('Review publication')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className='grid gap-4 xl:grid-cols-2'>
        <Card size='sm'>
          <CardHeader>
            <CardTitle>{t('System recovery')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReadOnlyFacts
              facts={Object.entries(props.recovery).map(([label, value]) => [
                t(label),
                String(value),
              ])}
            />
          </CardContent>
        </Card>
        <Card size='sm'>
          <CardHeader>
            <CardTitle>{t('Running workers')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            {visibleInstances.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {t('No running executor instances')}
              </p>
            ) : (
              visibleInstances.map((instance) => (
                <div
                  key={`${instance.queueName}-${instance.workerId}`}
                  className='bg-muted/30 rounded-lg border p-3 text-sm'
                >
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='font-medium'>{instance.queueName}</span>
                    <Badge variant='outline'>
                      {t(executorModeLabelKeys[instance.mode] ?? 'Unknown')}
                    </Badge>
                    <BusinessTerm
                      kind='executorStatus'
                      value={instance.status}
                    />
                  </div>
                  <p className='text-muted-foreground mt-1 break-all'>
                    {instance.workerId}
                  </p>
                  <p className='text-muted-foreground mt-1'>
                    {t('Credentials configured')}:{' '}
                    {instance.credentialsConfigured ? t('Yes') : t('No')} ·{' '}
                    {t('Heartbeat')}:{' '}
                    {formatCanvasDateTime(instance.heartbeatAt)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ChannelSection(props: {
  data: ChannelExecutionConfig
  version: number | null
  pending: boolean
  onReview: (value: Confirmation) => void
  onPublish: (config: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const form = useForm<ChannelForm>({
    resolver: zodResolver(channelSchema),
    values: props.data,
  })
  const review = form.handleSubmit((values) =>
    props.onReview({
      title: t('Publish channel execution policy'),
      description: t(
        'This creates a new policy version for the selected channel.'
      ),
      details: Object.entries(values).map(([label, value]) => ({
        label: t(label),
        value: String(value),
      })),
      confirmLabel: t('Publish'),
      run: () => props.onPublish(values),
    })
  )
  return (
    <form
      aria-label={t('Timeouts and concurrency')}
      className='space-y-4'
      onSubmit={review}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <h3 className='font-semibold'>{t('Timeouts and concurrency')}</h3>
        <Badge variant='secondary'>
          {t('Version')} {props.version ?? t('Default')}
        </Badge>
      </div>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {(
          [
            'requestTimeoutMs',
            'streamIdleTimeoutMs',
            'pollIntervalMs',
            'deadlineMs',
            'requestConcurrency',
            'asyncInFlightLimit',
          ] as const
        ).map((name) => (
          <NumberField
            key={name}
            id={`channel-${name}`}
            label={t(name)}
            registration={form.register(name, { valueAsNumber: true })}
            error={form.formState.errors[name]?.message}
          />
        ))}
      </div>
      <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
        <Button
          type='button'
          variant='outline'
          disabled={props.pending}
          onClick={() =>
            props.onReview({
              title: t('Restore channel defaults'),
              description: t(
                'The next version will inherit every channel default.'
              ),
              details: [{ label: t('Scope'), value: t('Selected channel') }],
              confirmLabel: t('Restore defaults'),
              run: () => props.onPublish({}),
            })
          }
        >
          {t('Restore defaults')}
        </Button>
        <Button type='submit' disabled={props.pending}>
          {t('Review publication')}
        </Button>
      </div>
    </form>
  )
}

function LimitSection(props: {
  rules: LimitRule[]
  credentialGroups: Array<{ credentialGroupId: string; name: string }>
  models: Array<{ id: string; publicName: string }>
  pending: boolean
  onReview: (value: Confirmation) => void
  onPublish: (rules: LimitRule[]) => void
}) {
  const { t } = useTranslation()
  const form = useForm<LimitForm>({
    resolver: zodResolver(limitSchema),
    defaultValues: {
      rules: props.rules.map((rule) => ({
        ...emptyLimitRule(),
        ...rule,
        credentialGroupId: rule.credentialGroupId ?? '',
        modelIds: rule.modelIds ?? [],
        sharedGroup: rule.sharedGroup ?? '',
        tokenIncludes: rule.tokenIncludes ?? emptyLimitRule().tokenIncludes,
      })),
    },
  })
  const fields = useFieldArray({ control: form.control, name: 'rules' })
  const review = form.handleSubmit((values) => {
    const rules = values.rules.map((rule) => ({
      id: rule.id,
      enabled: rule.enabled,
      scope: rule.scope,
      ...(rule.credentialGroupId
        ? { credentialGroupId: rule.credentialGroupId }
        : {}),
      ...(rule.modelIds.length ? { modelIds: rule.modelIds } : {}),
      ...(rule.sharedGroup.trim()
        ? { sharedGroup: rule.sharedGroup.trim() }
        : {}),
      metric: rule.metric,
      limit: rule.limit,
      ...(rule.metric === 'TPM' ? { tokenIncludes: rule.tokenIncludes } : {}),
    })) as LimitRule[]
    props.onReview({
      title: t('Publish limit rules'),
      description: t(
        'This replaces the configured limit-rule list for the selected channel.'
      ),
      details: [{ label: t('Rules'), value: String(rules.length) }],
      confirmLabel: t('Publish'),
      run: () => props.onPublish(rules),
    })
  })
  return (
    <form aria-label={t('Limit rules')} className='space-y-4' onSubmit={review}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h3 className='font-semibold'>{t('Scoped limit rules')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Configure channel, credential, model, shared-group, and token limits.'
            )}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          onClick={() => fields.append(emptyLimitRule())}
        >
          {t('Add rule')}
        </Button>
      </div>
      {fields.fields.length === 0 && (
        <p className='text-muted-foreground rounded-lg border p-4 text-sm'>
          {t('No configured limit rules')}
        </p>
      )}
      {fields.fields.map((field, index) => {
        const scope = form.watch(`rules.${index}.scope`)
        const metric = form.watch(`rules.${index}.metric`)
        return (
          <div key={field.id} className='space-y-4 rounded-xl border p-4'>
            <div className='flex justify-between gap-2'>
              <Controller
                control={form.control}
                name={`rules.${index}.enabled`}
                render={({ field: item }) => (
                  <label className='flex items-center gap-2 text-sm font-medium'>
                    <Checkbox
                      checked={item.value}
                      onCheckedChange={(checked) =>
                        item.onChange(checked === true)
                      }
                    />
                    {t('Enabled')}
                  </label>
                )}
              />
              <Button
                type='button'
                variant='ghost'
                onClick={() => fields.remove(index)}
              >
                {t('Remove')}
              </Button>
            </div>
            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
              <TextField
                id={`limit-id-${index}`}
                label={t('Rule ID')}
                registration={form.register(`rules.${index}.id`)}
              />
              <SelectField
                id={`limit-scope-${index}`}
                label={t('Scope')}
                registration={form.register(`rules.${index}.scope`)}
                options={[
                  'CHANNEL',
                  'CREDENTIAL',
                  'MODEL',
                  'MODEL_GROUP',
                  'CREDENTIAL_MODEL',
                ]}
              />
              <SelectField
                id={`limit-metric-${index}`}
                label={t('Metric')}
                registration={form.register(`rules.${index}.metric`)}
                options={['CONCURRENCY', 'RPM', 'TPM', 'ASYNC_IN_FLIGHT']}
              />
              <TextField
                id={`limit-value-${index}`}
                label={t('Limit')}
                registration={form.register(`rules.${index}.limit`)}
              />
            </div>
            <div className='grid gap-4 md:grid-cols-2'>
              {['CREDENTIAL', 'CREDENTIAL_MODEL'].includes(scope) && (
                <SelectField
                  id={`limit-credential-${index}`}
                  label={t('Credential group')}
                  registration={form.register(
                    `rules.${index}.credentialGroupId`
                  )}
                  options={props.credentialGroups.map((item) => ({
                    value: item.credentialGroupId,
                    label: item.name,
                  }))}
                  includeBlank
                />
              )}
              <TextField
                id={`limit-shared-${index}`}
                label={t('Shared group (optional)')}
                registration={form.register(`rules.${index}.sharedGroup`)}
              />
            </div>
            {['MODEL', 'MODEL_GROUP', 'CREDENTIAL_MODEL'].includes(scope) && (
              <Controller
                control={form.control}
                name={`rules.${index}.modelIds`}
                render={({ field: item }) => (
                  <fieldset className='space-y-2'>
                    <legend className='text-sm font-medium'>
                      {t('Models')}
                    </legend>
                    <div className='grid gap-2 md:grid-cols-2'>
                      {props.models.map((model) => (
                        <label
                          key={model.id}
                          className='flex items-center gap-2 rounded-md border p-2 text-sm'
                        >
                          <Checkbox
                            checked={item.value.includes(model.id)}
                            onCheckedChange={(checked) =>
                              item.onChange(
                                checked === true
                                  ? [...item.value, model.id]
                                  : item.value.filter((id) => id !== model.id)
                              )
                            }
                          />
                          {model.publicName}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              />
            )}
            {metric === 'TPM' && (
              <fieldset className='space-y-2'>
                <legend className='text-sm font-medium'>
                  {t('Counted tokens')}
                </legend>
                <div className='flex flex-wrap gap-4'>
                  {(
                    ['input', 'output', 'cacheRead', 'cacheWrite'] as const
                  ).map((name) => (
                    <Controller
                      key={name}
                      control={form.control}
                      name={`rules.${index}.tokenIncludes.${name}`}
                      render={({ field: item }) => (
                        <label className='flex items-center gap-2 text-sm'>
                          <Checkbox
                            checked={item.value}
                            onCheckedChange={(checked) =>
                              item.onChange(checked === true)
                            }
                          />
                          {t(name)}
                        </label>
                      )}
                    />
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )
      })}
      {Object.keys(form.formState.errors).length > 0 &&
        fieldError(t('Fix the highlighted rule fields'))}
      <div className='flex justify-end border-t pt-4'>
        <Button type='submit' disabled={props.pending}>
          {t('Review publication')}
        </Button>
      </div>
    </form>
  )
}

function ErrorSection(props: {
  channelId: string
  providerId: string
  rules: ErrorRule[]
  pending: boolean
  onReview: (value: Confirmation) => void
  onPublish: (rules: ErrorRule[]) => void
}) {
  const { t } = useTranslation()
  const form = useForm<ErrorForm>({
    resolver: zodResolver(errorSchema),
    defaultValues: {
      rules: props.rules.map((rule) => ({
        ...rule,
        httpStatus: rule.httpStatus ?? '',
        upstreamCode: rule.upstreamCode ?? '',
        messageContains: rule.messageContains ?? '',
        clientMessages: Object.fromEntries(
          locales.map((locale) => [locale, rule.clientMessages[locale] ?? ''])
        ) as Record<ExecutionLocale, string>,
      })),
    },
  })
  const fields = useFieldArray({ control: form.control, name: 'rules' })
  const [previewStatus, setPreviewStatus] = useState('429')
  const [previewLocale, setPreviewLocale] = useState<ExecutionLocale>('en')
  const [previewJson, setPreviewJson] = useState(
    '{\n  "error": { "code": "RATE_LIMIT", "message": "Too many requests" }\n}'
  )
  const [previewError, setPreviewError] = useState('')
  const preview = useMutation({
    mutationFn: () =>
      previewCanvasExecutionError({
        channelId: props.channelId,
        ...(previewStatus ? { httpStatus: Number(previewStatus) } : {}),
        response: JSON.parse(previewJson) as Record<string, unknown>,
        locale: previewLocale,
        rules: normalizeErrors(form.getValues().rules),
      }),
    onError: () =>
      setPreviewError(
        t('Preview input must be valid JSON and match the rule contract')
      ),
  })
  const review = form.handleSubmit((values) => {
    const rules = normalizeErrors(values.rules)
    props.onReview({
      title: t('Publish error mappings'),
      description: t(
        'This replaces provider-level overrides and custom mappings for every channel of this provider.'
      ),
      details: [
        { label: t('Provider'), value: props.providerId },
        { label: t('Rules'), value: String(rules.length) },
      ],
      confirmLabel: t('Publish'),
      run: () => props.onPublish(rules),
    })
  })
  return (
    <div className='grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]'>
      <form
        aria-label={t('Error mappings')}
        className='space-y-4'
        onSubmit={review}
      >
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div>
            <h3 className='font-semibold'>{t('Provider error mappings')}</h3>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Client-safe messages are required in all seven supported languages.'
              )}
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() => fields.append(emptyErrorRule())}
          >
            {t('Add custom mapping')}
          </Button>
        </div>
        {fields.fields.map((field, index) => (
          <details
            key={field.id}
            className='rounded-xl border p-4'
            open={index === 0}
          >
            <summary className='cursor-pointer font-medium'>
              {form.watch(`rules.${index}.id`)} ·{' '}
              {form.watch(`rules.${index}.category`)}
            </summary>
            <div className='mt-4 space-y-4'>
              <div className='flex justify-between gap-2'>
                <Controller
                  control={form.control}
                  name={`rules.${index}.enabled`}
                  render={({ field: item }) => (
                    <label className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={item.value}
                        onCheckedChange={(checked) =>
                          item.onChange(checked === true)
                        }
                      />
                      {t('Enabled')}
                    </label>
                  )}
                />
                {form.watch(`rules.${index}.source`) === 'CUSTOM' && (
                  <Button
                    type='button'
                    variant='ghost'
                    onClick={() => fields.remove(index)}
                  >
                    {t('Remove')}
                  </Button>
                )}
              </div>
              <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                <TextField
                  id={`error-id-${index}`}
                  label={t('Rule ID')}
                  registration={form.register(`rules.${index}.id`)}
                  disabled={form.watch(`rules.${index}.source`) !== 'CUSTOM'}
                />
                <TextField
                  id={`error-status-${index}`}
                  label={t('HTTP status (optional)')}
                  registration={form.register(`rules.${index}.httpStatus`, {
                    setValueAs: (value) => (value === '' ? '' : Number(value)),
                  })}
                  disabled={form.watch(`rules.${index}.source`) !== 'CUSTOM'}
                />
                <TextField
                  id={`error-code-${index}`}
                  label={t('Upstream code (optional)')}
                  registration={form.register(`rules.${index}.upstreamCode`)}
                  disabled={form.watch(`rules.${index}.source`) !== 'CUSTOM'}
                />
                <TextField
                  id={`error-message-${index}`}
                  label={t('Message contains (optional)')}
                  registration={form.register(`rules.${index}.messageContains`)}
                  disabled={form.watch(`rules.${index}.source`) !== 'CUSTOM'}
                />
                <SelectField
                  id={`error-category-${index}`}
                  label={t('Category')}
                  registration={form.register(`rules.${index}.category`)}
                  options={categories}
                />
                <TextField
                  id={`error-priority-${index}`}
                  label={t('Priority')}
                  registration={form.register(`rules.${index}.priority`, {
                    valueAsNumber: true,
                  })}
                />
              </div>
              <div className='grid gap-4 md:grid-cols-2'>
                {locales.map((locale) => (
                  <TextField
                    key={locale}
                    id={`error-message-${index}-${locale}`}
                    label={`${t('Client message')} · ${locale}`}
                    registration={form.register(
                      `rules.${index}.clientMessages.${locale}`
                    )}
                  />
                ))}
              </div>
              <TextField
                id={`error-note-${index}`}
                label={t('Administrator note')}
                registration={form.register(`rules.${index}.adminNote`)}
              />
            </div>
          </details>
        ))}
        {Object.keys(form.formState.errors).length > 0 &&
          fieldError(t('Fix the highlighted rule fields'))}
        <div className='flex justify-end border-t pt-4'>
          <Button type='submit' disabled={props.pending}>
            {t('Review publication')}
          </Button>
        </div>
      </form>
      <Card className='h-fit'>
        <CardHeader>
          <CardTitle className='text-base'>
            {t('Error mapping preview')}
          </CardTitle>
          <CardDescription>
            {t('Preview data is sanitized by the server and is never saved.')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <TextField
              id='preview-status'
              label={t('HTTP status (optional)')}
              value={previewStatus}
              onChange={setPreviewStatus}
            />
            <SelectField
              id='preview-locale'
              label={t('Preview language')}
              value={previewLocale}
              onChange={(value) => setPreviewLocale(value as ExecutionLocale)}
              options={locales}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='preview-response'>
              {t('Sanitized provider response JSON')}
            </Label>
            <Textarea
              id='preview-response'
              rows={8}
              value={previewJson}
              onChange={(event) => setPreviewJson(event.target.value)}
            />
          </div>
          {previewError && fieldError(previewError)}
          <div className='flex justify-end border-t pt-4'>
            <Button
              type='button'
              variant='outline'
              disabled={preview.isPending}
              onClick={() => {
                setPreviewError('')
                try {
                  JSON.parse(previewJson)
                  preview.mutate()
                } catch {
                  setPreviewError(t('Enter valid JSON'))
                }
              }}
            >
              {t('Run preview')}
            </Button>
          </div>
          {preview.data && (
            <ReadOnlyFacts
              title={t('Preview result')}
              facts={[
                [t('Matched rule'), preview.data.match.ruleId],
                [t('Category'), preview.data.match.category],
                [t('Client message'), preview.data.match.clientMessage],
                [
                  t('Upstream request ID'),
                  preview.data.upstreamRequestId ?? '—',
                ],
                [t('Upstream task ID'), preview.data.upstreamTaskId ?? '—'],
              ]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function normalizeErrors(rules: ErrorForm['rules']): ErrorRule[] {
  return rules.map((rule) => ({
    ...rule,
    httpStatus: rule.httpStatus === '' ? null : Number(rule.httpStatus),
    upstreamCode: rule.upstreamCode.trim() || null,
    messageContains: rule.messageContains.trim() || null,
    source: rule.source === 'SYSTEM' ? 'OVERRIDE' : rule.source,
  }))
}
function NumberField(props: {
  id: string
  label: string
  registration: Record<string, unknown>
  error?: string
}) {
  return (
    <div className='space-y-1'>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input id={props.id} type='number' {...props.registration} />
      {props.error && fieldError(props.error)}
    </div>
  )
}
function TextField(props: {
  id: string
  label: string
  registration?: Record<string, unknown>
  disabled?: boolean
  value?: string
  onChange?: (value: string) => void
}) {
  return (
    <div className='space-y-1'>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        disabled={props.disabled}
        {...props.registration}
        {...(props.value === undefined
          ? {}
          : {
              value: props.value,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                props.onChange?.(event.target.value),
            })}
      />
    </div>
  )
}
function SelectField(props: {
  id: string
  label: string
  registration?: Record<string, unknown>
  value?: string
  onChange?: (value: string) => void
  options: Array<string | { value: string; label: string }>
  includeBlank?: boolean
}) {
  return (
    <div className='space-y-1'>
      <Label htmlFor={props.id}>{props.label}</Label>
      <NativeSelect
        id={props.id}
        {...props.registration}
        {...(props.value === undefined
          ? {}
          : {
              value: props.value,
              onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
                props.onChange?.(event.target.value),
            })}
      >
        {props.includeBlank && (
          <NativeSelectOption value=''>—</NativeSelectOption>
        )}
        {props.options.map((option) => {
          const value = typeof option === 'string' ? option : option.value
          return (
            <NativeSelectOption key={value} value={value}>
              {typeof option === 'string' ? option : option.label}
            </NativeSelectOption>
          )
        })}
      </NativeSelect>
    </div>
  )
}
function ReadOnlyFacts(props: {
  title?: string
  facts: Array<[string, string]>
}) {
  return (
    <div className='space-y-2'>
      {props.title && <h3 className='font-semibold'>{props.title}</h3>}
      <dl className='grid gap-2 rounded-lg border p-3 text-sm'>
        {props.facts.map(([label, value]) => (
          <div
            key={label}
            className='grid grid-cols-[minmax(0,1fr)_auto] gap-3'
          >
            <dt className='text-muted-foreground'>{label}</dt>
            <dd className='text-right font-medium break-all'>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

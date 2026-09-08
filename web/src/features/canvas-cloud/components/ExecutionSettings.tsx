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

import { MultiSelect } from '@/components/multi-select'
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
import { Textarea } from '@/components/ui/textarea'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'

import {
  getCanvasCredentialGroupExecution,
  getCanvasExecutionOverview,
  previewCanvasExecutionError,
  publishCanvasExecutionPolicy,
} from '../execution-api'
import type {
  ChannelExecutionConfig,
  ErrorCategory,
  ErrorConditionValueType,
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
const errorConditionSchema = z.object({
  clientKey: z.string(),
  path: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/),
  operator: z.enum(['EQUALS', 'CONTAINS']),
  valueType: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'NULL']),
  value: z.string().max(512),
})
const errorRuleSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  version: integer(1, 2_147_483_647),
  enabled: z.boolean(),
  ruleType: z.enum(['HTTP_STATUS', 'JSON']),
  httpStatus: z.union([z.literal(''), z.number().int().min(100).max(599)]),
  conditions: z.array(errorConditionSchema).max(20),
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
  customMessagesEnabled: z.boolean(),
  clientMessages: z.object({
    zhCN: z.string().max(1_024),
    en: z.string().max(1_024),
    fr: z.string().max(1_024),
    ru: z.string().max(1_024),
    ja: z.string().max(1_024),
    vi: z.string().max(1_024),
    zhTW: z.string().max(1_024),
  }),
  adminNote: z.string().max(2_048),
  source: z.enum(['SYSTEM', 'OVERRIDE', 'CUSTOM']),
})
const errorSchema = z
  .object({ rules: z.array(errorRuleSchema).max(500) })
  .superRefine(({ rules }, context) => {
    const statuses = new Map<number, number>()
    for (const [ruleIndex, rule] of rules.entries()) {
      if (rule.ruleType === 'HTTP_STATUS') {
        if (rule.httpStatus === '') {
          context.addIssue({
            code: 'custom',
            path: ['rules', ruleIndex, 'httpStatus'],
            message: 'HTTP status is required',
          })
        } else {
          const previous = statuses.get(rule.httpStatus)
          if (previous !== undefined) {
            context.addIssue({
              code: 'custom',
              path: ['rules', ruleIndex, 'httpStatus'],
              message: 'HTTP status already has a mapping',
            })
          } else {
            statuses.set(rule.httpStatus, ruleIndex)
          }
        }
      } else if (rule.conditions.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['rules', ruleIndex, 'conditions'],
          message: 'Add at least one JSON condition',
        })
      }

      const conditionKeys = new Set<string>()
      for (const [conditionIndex, condition] of rule.conditions.entries()) {
        if (
          condition.operator === 'CONTAINS' &&
          condition.valueType !== 'STRING'
        ) {
          context.addIssue({
            code: 'custom',
            path: [
              'rules',
              ruleIndex,
              'conditions',
              conditionIndex,
              'valueType',
            ],
            message: 'Contains requires a string value',
          })
        }
        if (
          condition.valueType === 'NUMBER' &&
          (condition.value.trim() === '' ||
            !Number.isFinite(Number(condition.value)))
        ) {
          context.addIssue({
            code: 'custom',
            path: ['rules', ruleIndex, 'conditions', conditionIndex, 'value'],
            message: 'Enter a valid number',
          })
        }
        const comparableValue =
          condition.valueType === 'NULL' ? '' : condition.value
        const key = JSON.stringify([
          condition.path,
          condition.operator,
          condition.valueType,
          comparableValue,
        ])
        if (conditionKeys.has(key)) {
          context.addIssue({
            code: 'custom',
            path: ['rules', ruleIndex, 'conditions', conditionIndex],
            message: 'Duplicate JSON condition',
          })
        }
        conditionKeys.add(key)
      }
    }
  })
const limitRuleSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  enabled: z.boolean(),
  scope: z.enum(['CREDENTIAL_GROUP', 'MODEL', 'MODEL_GROUP']),
  credentialGroupId: z.string(),
  modelIds: z.array(z.string()),
  sharedGroup: z.string().max(191),
  metric: z.enum(['CONCURRENCY', 'RPM', 'TPM', 'ASYNC_IN_FLIGHT']),
  limit: z.string().regex(/^[1-9][0-9]*$/, 'Enter a positive whole number'),
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
      const needsModels = ['MODEL', 'MODEL_GROUP'].includes(rule.scope)
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
const conditionValueTypes: ErrorConditionValueType[] = [
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'NULL',
]
const limitMetricLabelKeys: Record<LimitRule['metric'], string> = {
  CONCURRENCY: 'Concurrent requests',
  RPM: 'Requests per minute',
  TPM: 'Tokens per minute',
  ASYNC_IN_FLIGHT: 'Asynchronous in-flight requests',
}
const categoryDescriptionKeys: Record<ErrorCategory, string> = {
  INVALID_REQUEST: 'Invalid request',
  PROVIDER_AUTH_FAILED: 'Provider authentication failed',
  PROVIDER_BALANCE_INSUFFICIENT: 'Provider balance insufficient',
  PROVIDER_ACCESS_DENIED: 'Provider access denied',
  PROVIDER_ENDPOINT_NOT_FOUND: 'Provider endpoint not found',
  PROVIDER_REQUEST_TIMEOUT: 'Provider request timed out',
  PROVIDER_RATE_LIMITED: 'Provider rate limited',
  PROVIDER_INTERNAL_ERROR: 'Provider internal error',
  PROVIDER_BAD_GATEWAY: 'Provider bad gateway',
  PROVIDER_UNAVAILABLE: 'Provider unavailable',
  PROVIDER_GATEWAY_TIMEOUT: 'Provider gateway timed out',
  PROVIDER_UNKNOWN_ERROR: 'Unknown provider error',
}
const localeLabels: Record<ExecutionLocale, string> = {
  zhCN: '简体中文',
  en: 'English',
  fr: 'Français',
  ru: 'Русский',
  ja: '日本語',
  vi: 'Tiếng Việt',
  zhTW: '繁體中文',
}

const emptyLimitRule = (): LimitForm['rules'][number] => ({
  id: `custom.limit.${crypto.randomUUID()}`,
  enabled: true,
  scope: 'CREDENTIAL_GROUP',
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
  ruleType: 'JSON',
  httpStatus: '',
  conditions: [emptyErrorCondition()],
  category: 'PROVIDER_UNKNOWN_ERROR',
  customMessagesEnabled: false,
  clientMessages: Object.fromEntries(
    locales.map((locale) => [locale, ''])
  ) as Record<ExecutionLocale, string>,
  adminNote: '',
  source: 'CUSTOM',
})

function fieldError(message: string, id?: string) {
  return (
    <p id={id} className='text-destructive text-xs' role='alert'>
      {message}
    </p>
  )
}

export function ExecutionSettings(
  props: {
    view?: 'overview' | 'credentialGroup'
    credentialGroupId?: string
    credentialGroupName?: string
    providerName?: string
    onDirtyChange?: (dirty: boolean) => void
  } = {}
) {
  const { t } = useTranslation()
  const onDirtyChange = props.onDirtyChange
  const queryClient = useQueryClient()
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [globalDirty, setGlobalDirty] = useState(false)
  const [groupDirty, setGroupDirty] = useState(false)
  const [limitsDirty, setLimitsDirty] = useState(false)
  const [errorsDirty, setErrorsDirty] = useState(false)
  const anyDirty = globalDirty || groupDirty || limitsDirty || errorsDirty
  useEffect(() => {
    onDirtyChange?.(anyDirty)
  }, [anyDirty, onDirtyChange])
  useEffect(
    () => () => {
      onDirtyChange?.(false)
    },
    [onDirtyChange]
  )
  const view = props.view ?? 'overview'
  const credentialGroupId = props.credentialGroupId ?? ''
  const overview = useQuery({
    queryKey: ['canvas-cloud', 'execution'],
    queryFn: ({ signal }) => getCanvasExecutionOverview(signal),
    refetchInterval: 10_000,
    enabled: view === 'overview',
  })
  const group = useQuery({
    queryKey: [
      'canvas-cloud',
      'execution',
      'credential-group',
      credentialGroupId,
    ],
    queryFn: ({ signal }) =>
      getCanvasCredentialGroupExecution(credentialGroupId, signal),
    enabled: view === 'credentialGroup' && Boolean(credentialGroupId),
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

  if (view === 'overview') {
    return (
      <>
        <FormNavigationGuard when={anyDirty} />
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
            onDirtyChange={setGlobalDirty}
          />
        )}
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
      </>
    )
  }

  if (!credentialGroupId) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t('Select a credential group to edit its execution policy.')}
      </p>
    )
  }

  return (
    <>
      <FormNavigationGuard when={anyDirty} />
      {group.isPending && (
        <p className='text-muted-foreground text-sm'>{t('Loading')}</p>
      )}
      {group.isError && (
        <Button variant='outline' onClick={() => void group.refetch()}>
          {t('Retry')}
        </Button>
      )}
      {group.data && (
        <Card>
          <CardHeader>
            <CardTitle>{t('Credential group execution policy')}</CardTitle>
            <CardDescription>
              {t(
                'Timeouts, concurrency, and shared limits apply to every bound model. Error mappings remain shared by the provider.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <CredentialGroupSection
              data={group.data.group.effective}
              version={group.data.group.version}
              providerName={props.providerName ?? group.data.providerId}
              credentialGroupName={
                props.credentialGroupName ?? credentialGroupId
              }
              onReview={setConfirmation}
              onPublish={(config) =>
                publish.mutate({
                  kind: 'CREDENTIAL_GROUP_POLICY',
                  scopeKey: credentialGroupId,
                  config,
                })
              }
              pending={publish.isPending}
              onDirtyChange={setGroupDirty}
            />
            <div className='border-t pt-6'>
              <LimitSection
                key={`limits-${credentialGroupId}-${group.data.limits.version}`}
                rules={group.data.limits.effective.rules.filter(
                  (rule): rule is EditableLimitRule =>
                    rule.scope === 'CREDENTIAL_GROUP' ||
                    rule.scope === 'MODEL' ||
                    rule.scope === 'MODEL_GROUP'
                )}
                credentialGroups={[
                  {
                    credentialGroupId,
                    name:
                      props.credentialGroupName ??
                      t('Selected credential group'),
                  },
                ]}
                models={group.data.models}
                providerName={props.providerName ?? group.data.providerId}
                credentialGroupName={
                  props.credentialGroupName ?? credentialGroupId
                }
                onReview={setConfirmation}
                onPublish={(rules) =>
                  publish.mutate({
                    kind: 'CREDENTIAL_GROUP_LIMITS',
                    scopeKey: credentialGroupId,
                    config: { rules },
                  })
                }
                pending={publish.isPending}
                onDirtyChange={setLimitsDirty}
              />
            </div>
            <div className='border-t pt-6'>
              <ErrorSection
                key={`errors-${group.data.providerId}-${group.data.errors.version}`}
                providerId={group.data.providerId}
                providerName={props.providerName ?? group.data.providerId}
                rules={group.data.errors.effective.rules}
                onReview={setConfirmation}
                onPublish={(rules) =>
                  publish.mutate({
                    kind: 'ERROR_MAPPING',
                    scopeKey: group.data.providerId,
                    config: { rules },
                  })
                }
                pending={publish.isPending}
                onDirtyChange={setErrorsDirty}
              />
            </div>
          </CardContent>
        </Card>
      )}
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
    </>
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
  onDirtyChange: (dirty: boolean) => void
}) {
  const { t } = useTranslation()
  const onDirtyChange = props.onDirtyChange
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
  useEffect(() => {
    onDirtyChange(form.formState.isDirty)
  }, [form.formState.isDirty, onDirtyChange])
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

function CredentialGroupSection(props: {
  data: ChannelExecutionConfig
  version: number | null
  providerName: string
  credentialGroupName: string
  pending: boolean
  onReview: (value: Confirmation) => void
  onPublish: (config: Record<string, unknown>) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const { t } = useTranslation()
  const onDirtyChange = props.onDirtyChange
  const form = useForm<ChannelForm>({
    resolver: zodResolver(channelSchema),
    values: props.data,
  })
  useEffect(() => {
    onDirtyChange(form.formState.isDirty)
  }, [form.formState.isDirty, onDirtyChange])
  const review = form.handleSubmit((values) =>
    props.onReview({
      title: t('Publish credential group execution policy'),
      description: t(
        'This creates a new policy version for the selected credential group.'
      ),
      details: [
        { label: t('Provider'), value: props.providerName },
        {
          label: t('Credential group'),
          value: props.credentialGroupName,
        },
        {
          label: t('Current version'),
          value: props.version == null ? t('Default') : `v${props.version}`,
        },
        ...Object.entries(values)
          .filter(
            ([name, value]) =>
              value !== props.data[name as keyof ChannelExecutionConfig]
          )
          .map(([label, value]) => ({
            label: t(label),
            value: `${props.data[label as keyof ChannelExecutionConfig]} → ${value}`,
          })),
      ],
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
            id={`credential-group-${name}`}
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
              title: t('Restore credential group defaults'),
              description: t(
                'The next version will inherit every credential group default.'
              ),
              details: [
                { label: t('Scope'), value: t('Selected credential group') },
              ],
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

type EditableLimitRule = Omit<LimitRule, 'scope'> & {
  scope: 'CREDENTIAL_GROUP' | 'MODEL' | 'MODEL_GROUP'
}

function LimitSection(props: {
  rules: EditableLimitRule[]
  credentialGroups: Array<{ credentialGroupId: string; name: string }>
  models: Array<{ id: string; publicName: string }>
  pending: boolean
  onReview: (value: Confirmation) => void
  onPublish: (rules: LimitRule[]) => void
  providerName: string
  credentialGroupName: string
  onDirtyChange: (dirty: boolean) => void
}) {
  const { t } = useTranslation()
  const onDirtyChange = props.onDirtyChange
  const localizeError = (message?: string) =>
    message === undefined ? undefined : t(message)
  const currentCredentialGroup = props.credentialGroups[0]
  const initialRules = useMemo(
    () =>
      props.rules.map((rule) => ({
        ...emptyLimitRule(),
        ...rule,
        credentialGroupId: rule.credentialGroupId ?? '',
        modelIds: rule.modelIds ?? [],
        sharedGroup: rule.sharedGroup ?? '',
        tokenIncludes: rule.tokenIncludes ?? emptyLimitRule().tokenIncludes,
      })),
    [props.rules]
  )
  const form = useForm<LimitForm>({
    resolver: zodResolver(limitSchema),
    defaultValues: { rules: initialRules },
    mode: 'onBlur',
    reValidateMode: 'onBlur',
  })
  const fields = useFieldArray({ control: form.control, name: 'rules' })
  useEffect(() => {
    onDirtyChange(form.formState.isDirty)
  }, [form.formState.isDirty, onDirtyChange])
  const review = form.handleSubmit((values) => {
    const rules: EditableLimitRule[] = values.rules.map((rule) => ({
      id: rule.id,
      enabled: rule.enabled,
      scope: rule.scope,
      ...(rule.credentialGroupId
        ? { credentialGroupId: rule.credentialGroupId }
        : {}),
      ...(rule.modelIds.length ? { modelIds: rule.modelIds } : {}),
      ...(rule.sharedGroup ? { sharedGroup: rule.sharedGroup } : {}),
      metric: rule.metric,
      limit: rule.limit,
      ...(rule.metric === 'TPM' ? { tokenIncludes: rule.tokenIncludes } : {}),
    }))
    const modelNamesFor = (rule: EditableLimitRule) =>
      (rule.modelIds ?? []).map(
        (modelId) =>
          props.models.find((model) => model.id === modelId)?.publicName ??
          modelId
      )
    const formatTarget = (rule: EditableLimitRule) => {
      if (rule.scope === 'CREDENTIAL_GROUP') {
        return t('Entire API Key group: {{group}}', {
          group: props.credentialGroupName,
        })
      }
      const models = modelNamesFor(rule).join(', ')
      if (rule.scope === 'MODEL') {
        return t('Single model: {{models}}', { models })
      }
      return t('Multiple models share: {{models}}', { models })
    }
    const formatLimit = (rule: EditableLimitRule) => {
      const tokenTypes = Object.entries(rule.tokenIncludes ?? {})
        .filter(([, included]) => included)
        .map(([name]) => t(name))
      const tokens =
        rule.metric === 'TPM' && tokenTypes.length > 0
          ? ` · ${t('Counted token types: {{types}}', {
              types: tokenTypes.join(', '),
            })}`
          : ''
      return `${t(limitMetricLabelKeys[rule.metric])} · ${rule.limit}${tokens}`
    }
    const formatRule = (rule: EditableLimitRule) =>
      `${formatTarget(rule)} · ${t(rule.enabled ? 'Enabled' : 'Disabled')} · ${formatLimit(rule)}`
    props.onReview({
      title: t('Publish limit rules'),
      description: t(
        'This replaces the configured limit-rule list for the selected credential group.'
      ),
      details: [
        { label: t('Provider'), value: props.providerName },
        { label: t('Credential group'), value: props.credentialGroupName },
        { label: t('Rules'), value: String(rules.length) },
        ...rules.flatMap((rule, index) => {
          const previous = initialRules.find((item) => item.id === rule.id)
          return [
            {
              label: `${t('Previous limit target')} ${index + 1}`,
              value: previous ? formatRule(previous) : t('No prior rule'),
            },
            {
              label: `${t('New limit target')} ${index + 1}`,
              value: `${formatRule(rule)}${
                rule.scope === 'MODEL_GROUP'
                  ? ` · ${t('Selected models share this limit.')}`
                  : ''
              }`,
            },
          ]
        }),
        ...initialRules
          .filter((previous) => !rules.some((rule) => rule.id === previous.id))
          .map((previous, index) => ({
            label: `${t('Removed limit target')} ${index + 1}`,
            value: `${formatRule(previous)} · ${t('No longer configured')}`,
          })),
      ],
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
              'Configure credential-group, credential, model, shared-group, and token limits.'
            )}
          </p>
        </div>
        <Button type='button' onClick={() => fields.append(emptyLimitRule())}>
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
        const ruleId = form.watch(`rules.${index}.id`)
        const ruleErrors = form.formState.errors.rules?.[index]
        return (
          <div key={field.id} className='space-y-4 rounded-xl border p-4'>
            <input type='hidden' {...form.register(`rules.${index}.id`)} />
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
                size='sm'
                variant='destructive'
                onClick={() => fields.remove(index)}
              >
                {t('Remove')}
              </Button>
            </div>
            <div className='grid gap-4 md:grid-cols-3'>
              <Controller
                control={form.control}
                name={`rules.${index}.scope`}
                render={({ field: item }) => (
                  <SelectField
                    id={`limit-scope-${index}`}
                    label={t('Limit target')}
                    value={item.value}
                    onBlur={item.onBlur}
                    onChange={(value) => {
                      const nextScope =
                        value as LimitForm['rules'][number]['scope']
                      item.onChange(nextScope)
                      form.setValue(`rules.${index}.credentialGroupId`, '', {
                        shouldDirty: true,
                      })
                      form.setValue(`rules.${index}.modelIds`, [], {
                        shouldDirty: true,
                      })
                      form.resetField(`rules.${index}.modelIds`, {
                        defaultValue: [],
                        keepDirty: true,
                      })
                      form.clearErrors([
                        `rules.${index}.credentialGroupId`,
                        `rules.${index}.modelIds`,
                        `rules.${index}.scope`,
                      ])
                    }}
                    options={[
                      {
                        value: 'CREDENTIAL_GROUP',
                        label: t('Entire API Key group'),
                      },
                      { value: 'MODEL', label: t('Single model') },
                      {
                        value: 'MODEL_GROUP',
                        label: t('Multiple models share'),
                      },
                    ]}
                    error={localizeError(ruleErrors?.scope?.message)}
                  />
                )}
              />
              <SelectField
                id={`limit-metric-${index}`}
                label={t('Metric')}
                registration={form.register(`rules.${index}.metric`)}
                options={[
                  { value: 'CONCURRENCY', label: t('Concurrent requests') },
                  { value: 'RPM', label: t('Requests per minute') },
                  { value: 'TPM', label: t('Tokens per minute') },
                  {
                    value: 'ASYNC_IN_FLIGHT',
                    label: t('Asynchronous in-flight requests'),
                  },
                ]}
                error={localizeError(ruleErrors?.metric?.message)}
              />
              <TextField
                id={`limit-value-${index}`}
                label={t('Limit')}
                registration={form.register(`rules.${index}.limit`)}
                error={localizeError(ruleErrors?.limit?.message)}
              />
            </div>
            {scope === 'CREDENTIAL_GROUP' && currentCredentialGroup && (
              <ReadOnlyFacts
                facts={[
                  [t('Limit target'), currentCredentialGroup.name],
                  [
                    t('Shared limit meaning'),
                    t(
                      'All bound models in this API Key group share this limit.'
                    ),
                  ],
                ]}
              />
            )}
            {scope === 'MODEL_GROUP' &&
              (props.models.length === 0 ? (
                <p className='text-muted-foreground text-sm' role='status'>
                  {t(
                    'No bound models are available. Manage bindings before adding a model limit.'
                  )}
                </p>
              ) : (
                <Controller
                  control={form.control}
                  name={`rules.${index}.modelIds`}
                  render={({ field: item }) => (
                    <div className='space-y-2'>
                      <Label htmlFor={`limit-models-${index}`}>
                        {t('Models')}
                      </Label>
                      <MultiSelect
                        id={`limit-models-${index}`}
                        options={props.models.map((model) => ({
                          value: model.id,
                          label: model.publicName,
                        }))}
                        selected={item.value}
                        onChange={(value) => item.onChange(value)}
                        onBlur={item.onBlur}
                        ariaInvalid={Boolean(ruleErrors?.modelIds?.message)}
                        ariaDescribedBy={`limit-models-error-${index}`}
                        placeholder={t('Search bound models')}
                        renderSelectedSummary={(values) =>
                          t('Selected models ({{count}})', {
                            count: values.length,
                          })
                        }
                      />
                      <p className='text-muted-foreground text-sm'>
                        {t('Selected models share this limit.')}
                      </p>
                      {ruleErrors?.modelIds?.message &&
                        fieldError(
                          t(ruleErrors.modelIds.message),
                          `limit-models-error-${index}`
                        )}
                    </div>
                  )}
                />
              ))}
            {scope === 'MODEL' &&
              (props.models.length === 0 ? (
                <p className='text-muted-foreground text-sm' role='status'>
                  {t(
                    'No bound models are available. Manage bindings before adding a model limit.'
                  )}
                </p>
              ) : (
                <Controller
                  control={form.control}
                  name={`rules.${index}.modelIds`}
                  render={({ field: item }) => (
                    <SelectField
                      id={`limit-model-${index}`}
                      label={t('Model')}
                      value={item.value[0] ?? ''}
                      onChange={(value) => item.onChange(value ? [value] : [])}
                      onBlur={item.onBlur}
                      options={props.models.map((model) => ({
                        value: model.id,
                        label: model.publicName,
                      }))}
                      includeBlank
                      blankLabel={t('Select a bound model')}
                      error={localizeError(ruleErrors?.modelIds?.message)}
                    />
                  )}
                />
              ))}
            <details className='border-t pt-4'>
              <summary className='cursor-pointer text-sm font-semibold'>
                {t('Rule details')}
              </summary>
              <div className='mt-3 space-y-1'>
                <Label>{t('Rule ID')}</Label>
                <code className='bg-muted block overflow-x-auto rounded-md px-3 py-2 text-xs'>
                  {ruleId}
                </code>
              </div>
            </details>
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
      <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
        <Button type='submit' disabled={props.pending}>
          {t('Review publication')}
        </Button>
      </div>
    </form>
  )
}

function ErrorSection(props: {
  providerId: string
  providerName: string
  rules: ErrorRule[]
  pending: boolean
  onReview: (value: Confirmation) => void
  onPublish: (rules: ErrorRule[]) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const onDirtyChange = props.onDirtyChange
  const form = useForm<ErrorForm>({
    resolver: zodResolver(errorSchema),
    defaultValues: {
      rules: props.rules.map((rule) => ({
        ...rule,
        httpStatus: rule.httpStatus ?? '',
        conditions: rule.conditions.map((condition) => ({
          ...condition,
          clientKey: crypto.randomUUID(),
          value: condition.value === null ? '' : String(condition.value),
        })),
        customMessagesEnabled:
          rule.source !== 'SYSTEM' &&
          Object.values(rule.clientMessages).some(
            (message) => message?.trim() !== ''
          ),
        clientMessages: Object.fromEntries(
          locales.map((locale) => [
            locale,
            rule.source === 'SYSTEM' ? '' : (rule.clientMessages[locale] ?? ''),
          ])
        ) as Record<ExecutionLocale, string>,
      })),
    },
  })
  const fields = useFieldArray({ control: form.control, name: 'rules' })
  useEffect(() => {
    onDirtyChange(form.formState.isDirty)
  }, [form.formState.isDirty, onDirtyChange])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewStatus, setPreviewStatus] = useState('429')
  const [previewLocale, setPreviewLocale] = useState<ExecutionLocale>(() =>
    executionLocaleForLanguage(i18n.language)
  )
  const [previewJson, setPreviewJson] = useState(
    '{\n  "error": { "code": "RATE_LIMIT", "message": "Too many requests" }\n}'
  )
  const [previewError, setPreviewError] = useState('')
  const [previewSnapshot, setPreviewSnapshot] = useState<{
    fingerprint: string
    locale: ExecutionLocale
  } | null>(null)
  const preview = useMutation({
    mutationFn: (input: {
      fingerprint: string
      httpStatus?: number
      locale: ExecutionLocale
      response: Record<string, unknown>
      rules: ErrorRule[]
    }) =>
      previewCanvasExecutionError({
        providerId: props.providerId,
        ...(input.httpStatus === undefined
          ? {}
          : { httpStatus: input.httpStatus }),
        response: input.response,
        locale: input.locale,
        rules: input.rules,
      }),
    onSuccess: (_result, input) => {
      setPreviewError('')
      setPreviewSnapshot({
        fingerprint: input.fingerprint,
        locale: input.locale,
      })
    },
    onError: (error) =>
      setPreviewError(
        (error as { response?: { status?: number } }).response?.status === 422
          ? t('Preview fields do not match the error rule contract')
          : t('Error mapping preview request failed')
      ),
  })
  const review = form.handleSubmit((values) => {
    const draft = normalizeErrorDraft(values.rules, props.rules)
    const rules = draft.filter((rule) => rule.source !== 'SYSTEM')
    const originalById = new Map(props.rules.map((rule) => [rule.id, rule]))
    const draftById = new Map(draft.map((rule) => [rule.id, rule]))
    const changes = [
      ...draft
        .filter((rule) => !originalById.has(rule.id))
        .map((rule) => `${t('Added')}: ${errorRuleReviewSummary(rule, t)}`),
      ...draft
        .filter((rule) => {
          const original = originalById.get(rule.id)
          if (!original) return false
          if (original.source === 'SYSTEM') return rule.source !== 'SYSTEM'
          return JSON.stringify(original) !== JSON.stringify(rule)
        })
        .map((rule) => {
          const original = originalById.get(rule.id)
          if (!original) {
            return `${t('Updated')}: ${errorRuleReviewSummary(rule, t)}`
          }
          return `${t('Updated')}: ${t('From')}: ${errorRuleReviewSummary(original, t)} → ${t('To')}: ${errorRuleReviewSummary(rule, t)}`
        }),
      ...props.rules
        .filter((rule) => !draftById.has(rule.id))
        .map((rule) => `${t('Removed')}: ${errorRuleReviewSummary(rule, t)}`),
    ]
    const previousOrder = props.rules
      .filter((rule) => rule.source === 'CUSTOM' && rule.ruleType === 'JSON')
      .map((rule) => errorRuleOrderSummary(rule, t))
    const nextOrder = draft
      .filter((rule) => rule.source === 'CUSTOM' && rule.ruleType === 'JSON')
      .map((rule) => errorRuleOrderSummary(rule, t))
    props.onReview({
      title: t('Publish error mappings'),
      description: t(
        'This replaces provider-level overrides and custom mappings for every channel of this provider.'
      ),
      details: [
        { label: t('Provider'), value: props.providerName },
        {
          label: t('Changes'),
          value: changes.join(' · ') || t('No changes'),
        },
        {
          label: t('Previous custom JSON order'),
          value: previousOrder.join(' → ') || '—',
        },
        {
          label: t('New custom JSON order'),
          value: nextOrder.join(' → ') || '—',
        },
      ],
      confirmLabel: t('Publish'),
      run: () => props.onPublish(rules),
    })
  })
  const watchedRules = form.watch('rules')
  const currentLocale = executionLocaleForLanguage(i18n.language)
  const customJsonIndices = watchedRules.flatMap((rule, index) =>
    rule.source === 'CUSTOM' && rule.ruleType === 'JSON' ? [index] : []
  )
  const currentPreviewFingerprint = errorPreviewFingerprint({
    status: previewStatus,
    locale: previewLocale,
    responseJson: previewJson,
    rules: normalizeErrorDraft(watchedRules, props.rules),
  })
  const previewIsStale = Boolean(
    preview.data &&
    previewSnapshot &&
    previewSnapshot.fingerprint !== currentPreviewFingerprint
  )
  const moveCustomJson = (index: number, offset: -1 | 1) => {
    const position = customJsonIndices.indexOf(index)
    const target = customJsonIndices[position + offset]
    if (target !== undefined) fields.move(index, target)
  }
  const runPreview = async () => {
    setPreviewError('')
    preview.reset()
    if (!(await form.trigger())) return
    if (
      previewStatus !== '' &&
      (!/^\d+$/.test(previewStatus) ||
        Number(previewStatus) < 100 ||
        Number(previewStatus) > 599)
    ) {
      setPreviewError(t('Upstream HTTP status must be between 100 and 599'))
      return
    }
    let response: Record<string, unknown>
    try {
      const parsed = JSON.parse(previewJson) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setPreviewError(t('Upstream error JSON must be an object'))
        return
      }
      response = parsed as Record<string, unknown>
    } catch {
      setPreviewError(t('Enter valid JSON'))
      return
    }
    const rules = normalizeErrorDraft(form.getValues().rules, props.rules)
    preview.mutate({
      fingerprint: errorPreviewFingerprint({
        status: previewStatus,
        locale: previewLocale,
        responseJson: previewJson,
        rules,
      }),
      ...(previewStatus ? { httpStatus: Number(previewStatus) } : {}),
      locale: previewLocale,
      response,
      rules,
    })
  }
  return (
    <form
      aria-label={t('Error mappings')}
      className='space-y-4'
      onSubmit={review}
    >
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h3 className='font-semibold'>{t('Provider error mappings')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Custom JSON mappings run in list order, followed by the HTTP status mapping and the system default message.'
            )}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            aria-expanded={previewOpen}
            onClick={() => setPreviewOpen((open) => !open)}
          >
            {t('Test error mappings')}
          </Button>
          <Button type='button' onClick={() => fields.append(emptyErrorRule())}>
            {t('Add custom mapping')}
          </Button>
        </div>
      </div>
      {previewOpen && (
        <Card size='sm'>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('Test current edits without saving')}
            </CardTitle>
            <CardDescription>
              {t(
                'This simulates the final mapping result for the current unsaved rule list and does not call the provider.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-4 md:grid-cols-2'>
              <TextField
                id='preview-status'
                label={t('Upstream HTTP status (optional)')}
                value={previewStatus}
                onChange={setPreviewStatus}
              />
              <SelectField
                id='preview-locale'
                label={t('Client response language')}
                value={previewLocale}
                onChange={(value) => setPreviewLocale(value as ExecutionLocale)}
                options={locales.map((locale) => ({
                  value: locale,
                  label: localeLabels[locale],
                }))}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='preview-response'>
                {t('Upstream error response JSON')}
              </Label>
              <Textarea
                id='preview-response'
                rows={7}
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
                onClick={() => void runPreview()}
              >
                {t('Run preview')}
              </Button>
            </div>
            {preview.data && (
              <div className='space-y-3'>
                {previewIsStale && (
                  <p
                    className='text-sm text-amber-700 dark:text-amber-300'
                    role='status'
                  >
                    {t('Test result is out of date. Run preview again.')}
                  </p>
                )}
                <ReadOnlyFacts
                  title={t('Client output')}
                  facts={[
                    [
                      t('Upstream HTTP status'),
                      preview.data.facts.httpStatus == null
                        ? '—'
                        : String(preview.data.facts.httpStatus),
                    ],
                    [t('Matched rule'), preview.data.match.ruleId],
                    [
                      t('Client HTTP status'),
                      String(preview.data.match.clientHttpStatus),
                    ],
                    [t('Stable error code'), preview.data.match.category],
                    [t('Client message'), preview.data.match.clientMessage],
                    [
                      t('Language'),
                      localeLabels[previewSnapshot?.locale ?? previewLocale],
                    ],
                    [
                      t('Message source'),
                      preview.data.match.messageSource === 'CUSTOM'
                        ? t('Custom message')
                        : t('System default'),
                    ],
                  ]}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {fields.fields.map((field, index) => (
        <div
          key={field.id}
          className='bg-card text-card-foreground rounded-xl border p-4 shadow-sm'
        >
          <div className='flex flex-wrap items-center gap-2 font-medium'>
            <span
              className='min-w-0 truncate'
              title={errorRuleSummary(watchedRules[index], t)}
            >
              {errorRuleSummary(watchedRules[index], t)}
            </span>
            <Badge
              variant={
                watchedRules[index].source === 'CUSTOM'
                  ? 'default'
                  : 'secondary'
              }
            >
              {watchedRules[index].source === 'CUSTOM'
                ? t('Custom mapping')
                : t('System built-in')}
            </Badge>
          </div>
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
              {watchedRules[index].source === 'CUSTOM' && (
                <div className='flex flex-wrap justify-end gap-1'>
                  {watchedRules[index].ruleType === 'JSON' && (
                    <>
                      <Button
                        type='button'
                        size='sm'
                        variant='ghost'
                        aria-label={t('Move mapping up')}
                        disabled={customJsonIndices.indexOf(index) <= 0}
                        onClick={() => moveCustomJson(index, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        type='button'
                        size='sm'
                        variant='ghost'
                        aria-label={t('Move mapping down')}
                        disabled={
                          customJsonIndices.indexOf(index) ===
                          customJsonIndices.length - 1
                        }
                        onClick={() => moveCustomJson(index, 1)}
                      >
                        ↓
                      </Button>
                    </>
                  )}
                  <Button
                    type='button'
                    size='sm'
                    variant='destructive'
                    onClick={() => fields.remove(index)}
                  >
                    {t('Remove')}
                  </Button>
                </div>
              )}
            </div>
            <section className='space-y-3 border-t pt-4'>
              <h4 className='text-sm font-semibold'>
                {t('Match upstream error')}
              </h4>
              {watchedRules[index].source !== 'CUSTOM' ? (
                <div className='bg-muted/30 rounded-lg border p-3 text-sm'>
                  <p>{errorRuleMatchDescription(watchedRules[index], t)}</p>
                  <p className='text-muted-foreground mt-1'>
                    {t('The built-in matching condition cannot be changed.')}
                  </p>
                </div>
              ) : (
                <>
                  <div className='grid gap-4 md:grid-cols-2'>
                    <Controller
                      control={form.control}
                      name={`rules.${index}.ruleType`}
                      render={({ field: item }) => (
                        <SelectField
                          id={`error-rule-type-${index}`}
                          label={t('Mapping type')}
                          value={item.value}
                          onChange={(value) => {
                            item.onChange(value)
                            if (
                              value === 'JSON' &&
                              form.getValues(`rules.${index}.conditions`)
                                .length === 0
                            ) {
                              form.setValue(
                                `rules.${index}.conditions`,
                                [emptyErrorCondition()],
                                { shouldDirty: true }
                              )
                            }
                          }}
                          options={[
                            {
                              value: 'JSON',
                              label: t('Custom JSON mapping'),
                            },
                            {
                              value: 'HTTP_STATUS',
                              label: t('HTTP status mapping'),
                            },
                          ]}
                        />
                      )}
                    />
                    {watchedRules[index].ruleType === 'HTTP_STATUS' && (
                      <TextField
                        id={`error-status-${index}`}
                        label={t('Upstream HTTP status')}
                        registration={form.register(
                          `rules.${index}.httpStatus`,
                          {
                            setValueAs: (value) =>
                              value === '' ? '' : Number(value),
                          }
                        )}
                        error={
                          form.formState.errors.rules?.[index]?.httpStatus
                            ?.message
                        }
                      />
                    )}
                  </div>
                  <div className='space-y-3'>
                    {watchedRules[index].conditions.map(
                      (condition, conditionIndex) => (
                        <div
                          key={condition.clientKey}
                          className='bg-muted/20 grid gap-3 rounded-lg border p-3 md:grid-cols-2 xl:grid-cols-[minmax(10rem,1.4fr)_minmax(8rem,0.8fr)_minmax(8rem,0.8fr)_minmax(10rem,1fr)_auto]'
                        >
                          <TextField
                            id={`error-path-${index}-${conditionIndex}`}
                            label={t('JSON field path')}
                            registration={form.register(
                              `rules.${index}.conditions.${conditionIndex}.path`
                            )}
                            error={
                              form.formState.errors.rules?.[index]
                                ?.conditions?.[conditionIndex]?.path?.message
                            }
                          />
                          <SelectField
                            id={`error-operator-${index}-${conditionIndex}`}
                            label={t('Match method')}
                            registration={form.register(
                              `rules.${index}.conditions.${conditionIndex}.operator`
                            )}
                            options={[
                              { value: 'EQUALS', label: t('Equals') },
                              { value: 'CONTAINS', label: t('Contains') },
                            ]}
                          />
                          <SelectField
                            id={`error-value-type-${index}-${conditionIndex}`}
                            label={t('Value type')}
                            registration={form.register(
                              `rules.${index}.conditions.${conditionIndex}.valueType`
                            )}
                            options={conditionValueTypes}
                            error={
                              form.formState.errors.rules?.[index]
                                ?.conditions?.[conditionIndex]?.valueType
                                ?.message
                            }
                          />
                          {errorConditionValueInput({
                            id: `error-value-${index}-${conditionIndex}`,
                            valueType: condition.valueType,
                            registration: form.register(
                              `rules.${index}.conditions.${conditionIndex}.value`
                            ),
                            error:
                              form.formState.errors.rules?.[index]
                                ?.conditions?.[conditionIndex]?.value?.message,
                            t,
                          })}
                          <div className='flex items-end'>
                            <Button
                              type='button'
                              size='sm'
                              variant='ghost'
                              onClick={() =>
                                form.setValue(
                                  `rules.${index}.conditions`,
                                  form
                                    .getValues(`rules.${index}.conditions`)
                                    .filter(
                                      (_, itemIndex) =>
                                        itemIndex !== conditionIndex
                                    ),
                                  {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  }
                                )
                              }
                            >
                              {t('Remove condition')}
                            </Button>
                          </div>
                        </div>
                      )
                    )}
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() =>
                        form.setValue(
                          `rules.${index}.conditions`,
                          [
                            ...form.getValues(`rules.${index}.conditions`),
                            emptyErrorCondition(),
                          ],
                          { shouldDirty: true }
                        )
                      }
                    >
                      {t('Add JSON condition')}
                    </Button>
                  </div>
                </>
              )}
            </section>
            <section className='space-y-3 border-t pt-4'>
              <h4 className='text-sm font-semibold'>{t('Return to client')}</h4>
              <div className='grid gap-4 md:grid-cols-2'>
                <SelectField
                  id={`error-category-${index}`}
                  label={t('Category')}
                  registration={form.register(`rules.${index}.category`)}
                  options={categories.map((category) => ({
                    value: category,
                    label: `${category} — ${t(categoryDescriptionKeys[category])}`,
                  }))}
                />
              </div>
              <p className='text-muted-foreground text-xs'>
                {t(categoryDescriptionKeys[watchedRules[index].category])}
              </p>
              <Controller
                control={form.control}
                name={`rules.${index}.customMessagesEnabled`}
                render={({ field: item }) => (
                  <label className='flex items-center gap-2 text-sm'>
                    <Checkbox
                      checked={item.value}
                      onCheckedChange={(checked) =>
                        item.onChange(checked === true)
                      }
                    />
                    {t('Use custom client messages')}
                  </label>
                )}
              />
              <p className='text-muted-foreground text-xs'>
                {watchedRules[index].customMessagesEnabled
                  ? t(
                      'Blank languages use the system message for the selected category.'
                    )
                  : t(
                      'Every language uses the system message for the selected category.'
                    )}
              </p>
              {watchedRules[index].customMessagesEnabled && (
                <div className='space-y-3'>
                  <TextareaField
                    id={`error-message-${index}-${currentLocale}`}
                    label={`${t('Client message')} · ${localeLabels[currentLocale]}`}
                    registration={form.register(
                      `rules.${index}.clientMessages.${currentLocale}`
                    )}
                    error={
                      form.formState.errors.rules?.[index]?.clientMessages?.[
                        currentLocale
                      ]?.message
                    }
                  />
                  <details className='rounded-lg border p-3'>
                    <summary className='cursor-pointer text-sm font-medium'>
                      {t('Other languages')}
                    </summary>
                    <div className='mt-3 grid gap-4 md:grid-cols-2'>
                      {locales
                        .filter((locale) => locale !== currentLocale)
                        .map((locale) => (
                          <TextareaField
                            key={locale}
                            id={`error-message-${index}-${locale}`}
                            label={`${localeLabels[locale]} · ${watchedRules[index].clientMessages[locale]?.trim() ? t('Customized') : t('Uses system default')}`}
                            registration={form.register(
                              `rules.${index}.clientMessages.${locale}`
                            )}
                            error={
                              form.formState.errors.rules?.[index]
                                ?.clientMessages?.[locale]?.message
                            }
                          />
                        ))}
                    </div>
                  </details>
                </div>
              )}
            </section>
            <details className='border-t pt-4'>
              <summary className='cursor-pointer text-sm font-semibold'>
                {t('Rule details')}
              </summary>
              <div className='mt-3 space-y-4'>
                <div className='space-y-1'>
                  <Label>{t('Rule ID')}</Label>
                  <div className='flex min-w-0 items-center gap-2'>
                    <code className='bg-muted min-w-0 flex-1 overflow-x-auto rounded-md px-3 py-2 text-xs'>
                      {watchedRules[index].id}
                    </code>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() =>
                        void navigator.clipboard?.writeText(
                          watchedRules[index].id
                        )
                      }
                    >
                      {t('Copy')}
                    </Button>
                  </div>
                </div>
                <TextareaField
                  id={`error-note-${index}`}
                  label={t('Administrator note')}
                  registration={form.register(`rules.${index}.adminNote`)}
                  error={
                    form.formState.errors.rules?.[index]?.adminNote?.message
                  }
                />
              </div>
            </details>
          </div>
        </div>
      ))}
      {Object.keys(form.formState.errors).length > 0 &&
        fieldError(t('Fix the highlighted rule fields'))}
      <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
        <Button type='submit' disabled={props.pending}>
          {t('Review publication')}
        </Button>
      </div>
    </form>
  )
}

function emptyErrorCondition(): ErrorForm['rules'][number]['conditions'][number] {
  return {
    clientKey: crypto.randomUUID(),
    path: '',
    operator: 'EQUALS',
    valueType: 'STRING',
    value: '',
  }
}

function errorConditionValueInput(props: {
  id: string
  valueType: ErrorConditionValueType
  registration: Record<string, unknown>
  error?: string
  t: (key: string) => string
}) {
  if (props.valueType === 'BOOLEAN') {
    return (
      <SelectField
        id={props.id}
        label={props.t('Match value')}
        registration={props.registration}
        options={['true', 'false']}
        error={props.error}
      />
    )
  }
  if (props.valueType === 'NULL') {
    return (
      <div className='space-y-1'>
        <Label>{props.t('Match value')}</Label>
        <p className='text-muted-foreground rounded-md border px-3 py-2 text-sm'>
          null
        </p>
      </div>
    )
  }
  return (
    <TextField
      id={props.id}
      label={props.t('Match value')}
      registration={props.registration}
      error={props.error}
    />
  )
}

function normalizeErrorConditionValue(
  valueType: ErrorConditionValueType,
  value: string
): string | number | boolean | null {
  if (valueType === 'NULL') return null
  if (valueType === 'NUMBER') return Number(value)
  if (valueType === 'BOOLEAN') return value === 'true'
  return value
}

function executionLocaleForLanguage(language: string): ExecutionLocale {
  const normalized = language.replaceAll('_', '-').toLowerCase()
  if (
    normalized === 'zh-tw' ||
    normalized === 'zh-hk' ||
    normalized.startsWith('zh-hant')
  ) {
    return 'zhTW'
  }
  if (normalized === 'zh' || normalized.startsWith('zh-hans')) return 'zhCN'
  const base = normalized.split('-')[0]
  return locales.includes(base as ExecutionLocale)
    ? (base as ExecutionLocale)
    : 'en'
}

function errorRuleSummary(
  rule: ErrorForm['rules'][number],
  t: (key: string) => string
): string {
  const firstCondition = rule.conditions.find(
    (condition) => condition.path.trim() || condition.value.trim()
  )
  if (rule.source === 'CUSTOM' && rule.httpStatus === '' && !firstCondition) {
    return t('New custom mapping')
  }
  const parts = [t(categoryDescriptionKeys[rule.category])]
  if (rule.ruleType === 'HTTP_STATUS' && rule.httpStatus !== '') {
    parts.push(`HTTP ${rule.httpStatus}`)
  }
  if (firstCondition) {
    const match = `${firstCondition.path} ${firstCondition.operator} ${
      firstCondition.valueType === 'NULL' ? 'null' : firstCondition.value
    }`.trim()
    if (match) parts.push(match)
  }
  return parts.join(' · ')
}

function errorRuleMatchDescription(
  rule: ErrorForm['rules'][number],
  t: (key: string) => string
): string {
  const parts: string[] = []
  if (rule.ruleType === 'HTTP_STATUS' && rule.httpStatus !== '') {
    parts.push(`${t('Upstream HTTP status')} ${rule.httpStatus}`)
  }
  for (const condition of rule.conditions) {
    parts.push(
      `${condition.path} ${condition.operator} ${
        condition.valueType === 'NULL' ? 'null' : condition.value
      }`
    )
  }
  return parts.join(' · ')
}

function errorRuleReviewSummary(
  rule: ErrorRule,
  t: (key: string) => string
): string {
  const parts = [t(categoryDescriptionKeys[rule.category])]
  if (!rule.enabled) parts.push(t('Disabled'))
  if (rule.ruleType === 'HTTP_STATUS' && rule.httpStatus !== null) {
    parts.push(`HTTP ${rule.httpStatus}`)
  }
  if (rule.conditions.length > 0) {
    parts.push(
      `${t('Conditions')}: ${rule.conditions
        .map(
          (condition) =>
            `${condition.path} ${condition.operator} ${
              condition.valueType === 'NULL' ? 'null' : String(condition.value)
            }`
        )
        .join(' & ')}`
    )
  }
  const messages = Object.entries(rule.clientMessages).filter(
    ([, message]) => message?.trim() !== ''
  )
  if (messages.length > 0) {
    parts.push(
      `${t('Client message')}: ${messages
        .map(([locale, message]) => `${locale}: ${message}`)
        .join(' / ')}`
    )
  }
  return parts.join(' · ')
}

function errorRuleOrderSummary(
  rule: ErrorRule,
  t: (key: string) => string
): string {
  const parts = [t(categoryDescriptionKeys[rule.category])]
  const condition = rule.conditions[0]
  if (condition) {
    parts.push(
      `${condition.path} ${condition.operator} ${
        condition.valueType === 'NULL' ? 'null' : String(condition.value)
      }`
    )
  }
  return parts.join(' · ')
}

function errorPreviewFingerprint(input: {
  status: string
  locale: ExecutionLocale
  responseJson: string
  rules: ErrorRule[]
}): string {
  return JSON.stringify(input)
}

function normalizeErrorDraft(
  rules: ErrorForm['rules'],
  originals: ErrorRule[]
): ErrorRule[] {
  const originalById = new Map(originals.map((rule) => [rule.id, rule]))
  return rules.map((rule) => {
    const clientMessages = rule.customMessagesEnabled
      ? (Object.fromEntries(
          Object.entries(rule.clientMessages)
            .map(([locale, message]) => [locale, message.trim()])
            .filter(([, message]) => message !== '')
        ) as Partial<Record<ExecutionLocale, string>>)
      : {}
    const normalized: ErrorRule = {
      id: rule.id,
      version: rule.version,
      enabled: rule.enabled,
      ruleType: rule.ruleType,
      httpStatus: rule.httpStatus === '' ? null : Number(rule.httpStatus),
      conditions: rule.conditions.map((condition) => ({
        path: condition.path.trim(),
        operator: condition.operator,
        valueType: condition.valueType,
        value: normalizeErrorConditionValue(
          condition.valueType,
          condition.value
        ),
      })),
      category: rule.category,
      clientMessages,
      adminNote: rule.adminNote,
      source: rule.source,
    }
    if (rule.source !== 'SYSTEM') return normalized
    const original = originalById.get(rule.id)
    const changed =
      !original ||
      rule.enabled !== original.enabled ||
      rule.category !== original.category ||
      rule.adminNote !== original.adminNote ||
      Object.keys(clientMessages).length > 0
    return changed ? { ...normalized, source: 'OVERRIDE' } : normalized
  })
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
  onBlur?: () => void
  error?: string
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
      {props.error && fieldError(props.error)}
    </div>
  )
}
function TextareaField(props: {
  id: string
  label: string
  registration: Record<string, unknown>
  error?: string
}) {
  return (
    <div className='space-y-1'>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Textarea id={props.id} rows={3} {...props.registration} />
      {props.error && fieldError(props.error)}
    </div>
  )
}
function SelectField(props: {
  id: string
  label: string
  registration?: Record<string, unknown>
  value?: string
  onChange?: (value: string) => void
  onBlur?: () => void
  options: Array<string | { value: string; label: string }>
  includeBlank?: boolean
  blankLabel?: string
  error?: string
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
              onBlur: props.onBlur,
            })}
      >
        {props.includeBlank && (
          <NativeSelectOption value=''>
            {props.blankLabel ?? '—'}
          </NativeSelectOption>
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
      {props.error && fieldError(props.error)}
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

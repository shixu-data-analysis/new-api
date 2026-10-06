/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { MultiSelect } from '@/components/multi-select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'
import { toIntlLocale } from '@/i18n/languages'

import { formatErrorRuleMatch } from '../error-rule-format'
import {
  errorRuleJsonFieldReference,
  errorRuleJsonKeys,
  lockedSystemRuleFields,
} from '../error-rule-json-reference'
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
  ExecutionInstance,
  ExecutionLocale,
  GlobalExecutionConfig,
  LimitRule,
} from '../execution-types'
import { formatCanvasDateTime } from '../formatters'
import { BusinessTerm } from './BusinessTerm'
import { canvasStaticColumnWidth } from './canvas-table-layout'
import { CanvasStatusBadge } from './CanvasStatusBadge'
import { ExecutionAttentionCard } from './ExecutionAttention'
import { ExecutionCapacityOverview } from './ExecutionCapacityOverview'
import { ExecutorDrain } from './ExecutorDrain'
import { ModelIdentityTooltip } from './ModelIdentityTooltip'
import { PricingActionConfirmation } from './PricingActionConfirmation'

// Cloud's defaults of an API Key group, shown in the form by "Restore defaults"; the poll interval is left empty.
const credentialGroupDefaults: Omit<ChannelExecutionConfig, 'pollIntervalMs'> =
  {
    requestTimeoutMs: 120_000,
    streamIdleTimeoutMs: 300_000,
    deadlineMs: 86_400_000,
    unknownReleaseMs: 14_400_000,
    requestConcurrency: 16,
    asyncInFlightLimit: 30,
  }

const executorModeLabelKeys: Record<string, string> = {
  MOCK: 'Mock mode',
  REAL: 'Real mode',
}

const integer = (minimum: number, maximum: number) =>
  z.number().int().min(minimum).max(maximum)
const adminNoteSchema = z
  .string()
  .refine(
    (value) => new TextEncoder().encode(value).length <= 2_048,
    'Administrator note must not exceed 2048 bytes'
  )
const globalSchema = z
  .object({
    instanceConcurrency: integer(1, 10_000),
    queryReservedConcurrency: integer(0, 10_000),
    userOutputLimit: integer(1, 10_000),
    defaultPollIntervalMs: integer(1_000, 3_600_000),
  })
  .refine(
    (value) => value.queryReservedConcurrency <= value.instanceConcurrency,
    { path: ['queryReservedConcurrency'] }
  )
const channelSchema = z.object({
  requestTimeoutMs: integer(0, 604_800_000),
  streamIdleTimeoutMs: integer(1_000, 604_800_000),
  // Empty: the group follows the global default and the field is not saved.
  pollIntervalMs: integer(1_000, 3_600_000).optional(),
  deadlineMs: integer(1_000, 2_592_000_000),
  unknownReleaseMs: integer(1_000, 86_400_000),
  requestConcurrency: integer(1, 10_000),
  asyncInFlightLimit: integer(1, 100_000),
})
const errorConditionSchema = z.object({
  clientKey: z.string(),
  path: z
    .string()
    .max(512)
    .refine(
      (value) =>
        value === '' ||
        /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/.test(value),
      'Enter a valid JSON field path'
    ),
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
  adminNote: adminNoteSchema,
  executionDisposition: z.enum(['', 'CONFIRMED_FAILED', 'UNKNOWN']),
  hideUpstreamReason: z.boolean(),
  source: z.enum(['SYSTEM', 'OVERRIDE', 'CUSTOM']),
})
const editableErrorRuleJsonSchema = z
  .object({
    enabled: z.boolean(),
    ruleType: z.enum(['HTTP_STATUS', 'JSON']),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    conditions: z.array(
      z
        .object({
          path: z.string(),
          operator: z.enum(['EQUALS', 'CONTAINS']),
          valueType: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'NULL']),
          value: z.unknown(),
        })
        .strict()
        .superRefine((condition, context) => {
          const matchesValueType =
            (condition.valueType === 'STRING' &&
              typeof condition.value === 'string') ||
            (condition.valueType === 'NUMBER' &&
              typeof condition.value === 'number' &&
              Number.isFinite(condition.value)) ||
            (condition.valueType === 'BOOLEAN' &&
              typeof condition.value === 'boolean') ||
            (condition.valueType === 'NULL' && condition.value === null)
          if (!matchesValueType) {
            context.addIssue({
              code: 'custom',
              path: ['value'],
              message: 'Value does not match valueType',
            })
          }
        })
    ),
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
    clientMessages: z
      .object({
        zhCN: z.string().optional(),
        en: z.string().optional(),
        fr: z.string().optional(),
        ru: z.string().optional(),
        ja: z.string().optional(),
        vi: z.string().optional(),
        zhTW: z.string().optional(),
      })
      .strict(),
    adminNote: adminNoteSchema,
    executionDisposition: z.enum(['CONFIRMED_FAILED', 'UNKNOWN']).optional(),
    hideUpstreamReason: z.boolean().optional(),
  })
  .strict()
  .superRefine((rule, context) => {
    const expected = rule.httpStatus === null ? 'JSON' : 'HTTP_STATUS'
    if (rule.ruleType !== expected) {
      context.addIssue({
        code: 'custom',
        path: ['ruleType'],
        message: 'ruleType does not match httpStatus',
      })
    }
  })
const errorSchema = z
  .object({
    rules: z.array(errorRuleSchema).max(500),
    showSafeErrorDetailsToCustomer: z.boolean(),
  })
  .superRefine(({ rules }, context) => {
    const unconditionalStatuses = new Set<number>()
    const exactRules = new Set<string>()
    for (const [ruleIndex, rule] of rules.entries()) {
      const activeConditions = rule.conditions.filter(
        (condition) => condition.path.trim() !== ''
      )
      if (rule.httpStatus === '' && activeConditions.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['rules', ruleIndex, 'conditions'],
          message: 'Add an HTTP status or JSON condition',
        })
      }
      if (rule.httpStatus !== '' && activeConditions.length === 0) {
        if (unconditionalStatuses.has(rule.httpStatus)) {
          context.addIssue({
            code: 'custom',
            path: ['rules', ruleIndex, 'httpStatus'],
            message: 'HTTP status already has an unconditional mapping',
          })
        }
        unconditionalStatuses.add(rule.httpStatus)
      }

      const conditionKeys = new Set<string>()
      for (const [conditionIndex, condition] of activeConditions.entries()) {
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
      const exactKey = JSON.stringify([
        rule.httpStatus,
        activeConditions.map((condition) => [
          condition.path,
          condition.operator,
          condition.valueType,
          condition.valueType === 'NULL' ? '' : condition.value,
        ]),
      ])
      if (exactRules.has(exactKey)) {
        context.addIssue({
          code: 'custom',
          path: ['rules', ruleIndex],
          message: 'Duplicate error mapping',
        })
      }
      exactRules.add(exactKey)
    }
  })
const limitRuleSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),
  enabled: z.boolean(),
  scope: z.enum(['CREDENTIAL_GROUP', 'MODEL', 'MODEL_GROUP']),
  credentialGroupId: z.string(),
  modelKeys: z.array(z.string()),
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
      if (needsModels && rule.modelKeys.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'modelKeys'],
          message: 'Select at least one model',
        })
      }
      if (rule.scope === 'MODEL' && rule.modelKeys.length !== 1) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'modelKeys'],
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
  cancelLabel?: string
  confirmLabel: string
  requiresAcknowledgement?: boolean
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
const limitMetricLabelKeys: Record<LimitRule['metric'], string> = {
  CONCURRENCY: 'Concurrency · Simultaneous requests',
  RPM: 'RPM · Requests per minute',
  TPM: 'TPM · Tokens per minute',
  ASYNC_IN_FLIGHT: 'Unfinished asynchronous tasks',
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

// Mirrors Cloud `HTTP_DEFAULTS`: the HTTP status each system rule maps to its category.
const systemDefaultStatusByCategory: Partial<Record<ErrorCategory, number>> = {
  INVALID_REQUEST: 400,
  PROVIDER_AUTH_FAILED: 401,
  PROVIDER_BALANCE_INSUFFICIENT: 402,
  PROVIDER_ACCESS_DENIED: 403,
  PROVIDER_ENDPOINT_NOT_FOUND: 404,
  PROVIDER_REQUEST_TIMEOUT: 408,
  PROVIDER_RATE_LIMITED: 429,
  PROVIDER_INTERNAL_ERROR: 500,
  PROVIDER_BAD_GATEWAY: 502,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_GATEWAY_TIMEOUT: 504,
}
const systemDefaultCategoryByStatus = new Map(
  Object.entries(systemDefaultStatusByCategory).map(([category, status]) => [
    status,
    category as ErrorCategory,
  ])
)
type ErrorRuleExampleKind = 'MISSING_TASK_ID' | 'SERVER_ERROR_502'
const errorRuleExampleGuidance: Record<
  ErrorRuleExampleKind,
  { situation: string; change: string; caution: string }
> = {
  MISSING_TASK_ID: {
    situation:
      'The provider returned HTTP 200 without a task ID, with success set to false and a message.',
    change:
      'Match HTTP 200 and success = false, keep the result pending confirmation, and choose the category that matches the provider explanation.',
    caution:
      'Do not publish “Mark failed and release points” until the provider confirms that this response means the task was not accepted.',
  },
  SERVER_ERROR_502: {
    situation:
      'The provider returned HTTP 502 with error.code = "server_error" and no task ID.',
    change:
      'Match HTTP 502 and error.code = "server_error" so that other 502 responses keep the system judgement.',
    caution:
      'Do not publish “Mark failed and release points” until the provider contract or support confirms that this response is a terminal failure.',
  },
}
const errorRuleExampleLabels: Record<ErrorRuleExampleKind, string> = {
  MISSING_TASK_ID: 'HTTP 200 without task ID',
  SERVER_ERROR_502: 'HTTP 502 + server_error',
}
// Placeholder text for the customer message; mirrors Cloud SYSTEM_MESSAGES.
const defaultCustomerMessageKeys: Record<ErrorCategory, string> = {
  INVALID_REQUEST: 'Default customer message INVALID_REQUEST',
  PROVIDER_AUTH_FAILED: 'Default customer message PROVIDER_AUTH_FAILED',
  PROVIDER_BALANCE_INSUFFICIENT:
    'Default customer message PROVIDER_BALANCE_INSUFFICIENT',
  PROVIDER_ACCESS_DENIED: 'Default customer message PROVIDER_ACCESS_DENIED',
  PROVIDER_ENDPOINT_NOT_FOUND:
    'Default customer message PROVIDER_ENDPOINT_NOT_FOUND',
  PROVIDER_REQUEST_TIMEOUT: 'Default customer message PROVIDER_REQUEST_TIMEOUT',
  PROVIDER_RATE_LIMITED: 'Default customer message PROVIDER_RATE_LIMITED',
  PROVIDER_INTERNAL_ERROR: 'Default customer message PROVIDER_INTERNAL_ERROR',
  PROVIDER_BAD_GATEWAY: 'Default customer message PROVIDER_BAD_GATEWAY',
  PROVIDER_UNAVAILABLE: 'Default customer message PROVIDER_UNAVAILABLE',
  PROVIDER_GATEWAY_TIMEOUT: 'Default customer message PROVIDER_GATEWAY_TIMEOUT',
  PROVIDER_UNKNOWN_ERROR: 'Default customer message PROVIDER_UNKNOWN_ERROR',
}
const firstErrorPreviewSample = {
  label: '200 without task ID',
  status: '200',
  response: { success: false, message: 'Task creation failed' },
}
const errorPreviewSamples: Array<{
  label: string
  status: string
  response: Record<string, unknown>
}> = [
  firstErrorPreviewSample,
  {
    label: '502 server_error',
    status: '502',
    response: { error: { code: 'server_error', message: 'Bad gateway' } },
  },
  {
    label: 'Control: 502 without an error code',
    status: '502',
    response: { error: { message: 'Bad gateway' } },
  },
]

const emptyLimitRule = (): LimitForm['rules'][number] => ({
  id: `custom.limit.${crypto.randomUUID()}`,
  enabled: true,
  scope: 'CREDENTIAL_GROUP',
  credentialGroupId: '',
  modelKeys: [],
  sharedGroup: '',
  metric: 'RPM',
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
  executionDisposition: '',
  hideUpstreamReason: false,
  source: 'CUSTOM',
})

function errorRuleExample(
  example: ErrorRuleExampleKind
): ErrorForm['rules'][number] {
  const rule = emptyErrorRule()
  if (example === 'MISSING_TASK_ID') {
    return {
      ...rule,
      ruleType: 'HTTP_STATUS',
      httpStatus: 200,
      conditions: [
        {
          clientKey: crypto.randomUUID(),
          path: 'success',
          operator: 'EQUALS',
          valueType: 'BOOLEAN',
          value: 'false',
        },
      ],
      category: 'PROVIDER_INTERNAL_ERROR',
      executionDisposition: 'UNKNOWN',
    }
  }
  return {
    ...rule,
    ruleType: 'HTTP_STATUS',
    httpStatus: 502,
    conditions: [
      {
        clientKey: crypto.randomUUID(),
        path: 'error.code',
        operator: 'EQUALS',
        valueType: 'STRING',
        value: 'server_error',
      },
    ],
    category: 'PROVIDER_BAD_GATEWAY',
    executionDisposition: 'CONFIRMED_FAILED',
  }
}

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
  const [confirmationAcknowledged, setConfirmationAcknowledged] =
    useState(false)
  const openConfirmation = (value: Confirmation) => {
    setConfirmationAcknowledged(false)
    setConfirmation(value)
  }
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
        <div className='space-y-6'>
          <ExecutorDrain />
          {overview.data && (
            <ExecutionAttentionCard attention={overview.data.attention} />
          )}
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
                <Button
                  variant='outline'
                  onClick={() => void overview.refetch()}
                >
                  {t('Retry')}
                </Button>
              </CardContent>
            </Card>
          )}
          {overview.data && (
            <GlobalSection
              data={overview.data.global.effective}
              version={overview.data.global.version}
              onReview={openConfirmation}
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
          <ExecutionCapacityOverview />
          {overview.data && (
            <ExecutionRuntimeFacts
              recovery={overview.data.systemRecovery}
              instances={overview.data.instances}
            />
          )}
        </div>
        <PricingActionConfirmation
          open={Boolean(confirmation)}
          onOpenChange={(open) => {
            if (!open) setConfirmation(null)
          }}
          title={confirmation?.title ?? ''}
          description={confirmation?.description ?? ''}
          details={confirmation?.details ?? []}
          cancelLabel={confirmation?.cancelLabel}
          confirmLabel={confirmation?.confirmLabel ?? t('Publish')}
          pending={publish.isPending}
          confirmDisabled={
            confirmation?.requiresAcknowledgement === true &&
            !confirmationAcknowledged
          }
          onConfirm={() => confirmation?.run()}
        >
          {confirmation?.requiresAcknowledgement ? (
            <label className='flex items-start gap-2'>
              <Checkbox
                checked={confirmationAcknowledged}
                onCheckedChange={(checked) =>
                  setConfirmationAcknowledged(checked === true)
                }
              />
              <span>
                {t(
                  'I confirm the rationale comes from the provider contract or verified evidence.'
                )}
              </span>
            </label>
          ) : null}
        </PricingActionConfirmation>
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
            <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
              <CardTitle>{t('Credential group execution policy')}</CardTitle>
              <Badge variant='secondary'>
                {t('Version')} {group.data.group.version ?? t('Default')}
              </Badge>
            </div>
            <CardDescription>
              {t(
                'Set timeouts and base capacity for this group. Additional limits below apply by target. Error mappings are shared by the provider.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <CredentialGroupSection
              data={group.data.group.effective}
              configured={group.data.group.configured}
              globalDefaultPollIntervalMs={
                group.data.global.effective.defaultPollIntervalMs
              }
              models={group.data.models}
              version={group.data.group.version}
              providerName={props.providerName ?? group.data.providerId}
              credentialGroupName={
                props.credentialGroupName ?? credentialGroupId
              }
              onReview={openConfirmation}
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
                models={group.data.models}
                providerName={props.providerName ?? group.data.providerId}
                credentialGroupName={
                  props.credentialGroupName ?? credentialGroupId
                }
                onReview={openConfirmation}
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
                releaseWaitMs={Math.min(
                  group.data.group.effective.unknownReleaseMs,
                  group.data.group.effective.deadlineMs
                )}
                showSafeErrorDetailsToCustomer={
                  group.data.errors.effective.showSafeErrorDetailsToCustomer ??
                  true
                }
                onReview={openConfirmation}
                onPublish={(config) =>
                  publish.mutate({
                    kind: 'ERROR_MAPPING',
                    scopeKey: group.data.providerId,
                    config,
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
        cancelLabel={confirmation?.cancelLabel}
        confirmLabel={confirmation?.confirmLabel ?? t('Publish')}
        pending={publish.isPending}
        confirmDisabled={
          confirmation?.requiresAcknowledgement === true &&
          !confirmationAcknowledged
        }
        onConfirm={() => confirmation?.run()}
      >
        {confirmation?.requiresAcknowledgement ? (
          <label className='flex items-start gap-2'>
            <Checkbox
              checked={confirmationAcknowledged}
              onCheckedChange={(checked) =>
                setConfirmationAcknowledged(checked === true)
              }
            />
            <span>
              {t(
                'I confirm the rationale comes from the provider contract or verified evidence.'
              )}
            </span>
          </label>
        ) : null}
      </PricingActionConfirmation>
    </>
  )
}

function GlobalSection(props: {
  data: GlobalExecutionConfig
  version: number | null
  pending: boolean
  onReview: (value: Confirmation) => void
  onPublish: (config: Record<string, unknown>) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const { t } = useTranslation()
  const onDirtyChange = props.onDirtyChange
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
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
            <CardTitle>{t('Task submission and execution limits')}</CardTitle>
            <Badge variant='secondary'>
              {t('Version')} {props.version ?? t('Default')}
            </Badge>
          </div>
          <CardDescription>
            {t(
              'Instance concurrency is the number of tasks each executor instance works on at once; tasks waiting for the API provider to produce a result do not count. The same number limits simultaneous upstream requests, and the result-query reservation takes part of it. The unfinished-result limit applies per user at task admission.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            aria-label={t('Global execution limits')}
            className='space-y-4'
            onSubmit={review}
          >
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(10rem,14rem))]'>
              <NumberField
                id='instance-concurrency'
                label={t('Instance concurrency')}
                registration={form.register('instanceConcurrency', {
                  valueAsNumber: true,
                })}
                error={form.formState.errors.instanceConcurrency?.message}
                help={t(
                  'Tasks each executor instance works on at once; tasks waiting for the API provider to produce a result do not count. The same number limits simultaneous upstream requests, shared by all API Key groups.'
                )}
              />
              <NumberField
                id='query-reserved-concurrency'
                label={t('Query reserved concurrency')}
                registration={form.register('queryReservedConcurrency', {
                  valueAsNumber: true,
                })}
                error={form.formState.errors.queryReservedConcurrency?.message}
                help={t(
                  'Slots reserved within instance concurrency for result queries; no extra slots are added.'
                )}
              />
              <NumberField
                id='user-output-limit'
                label={t('User output limit')}
                registration={form.register('userOutputLimit', {
                  valueAsNumber: true,
                })}
                error={form.formState.errors.userOutputLimit?.message}
                help={t(
                  'Maximum unfinished results per user; a task that would exceed it is not admitted.'
                )}
              />
              <NumberField
                id='default-poll-interval'
                label={t('Default poll interval (milliseconds)')}
                registration={form.register('defaultPollIntervalMs', {
                  valueAsNumber: true,
                })}
                error={form.formState.errors.defaultPollIntervalMs?.message}
                help={t(
                  'Used when an API Key group sets no poll interval. Models whose channel sets a query interval follow the channel.'
                )}
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
                    details: [
                      {
                        label: t('Scope'),
                        value: t('Task submission and execution limits'),
                      },
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
        </CardContent>
      </Card>
    </div>
  )
}

function ExecutionRuntimeFacts(props: {
  recovery: {
    heartbeatMs: number
    leaseMs: number
    scanMs: number
    defaultInstances: number
  }
  instances: ExecutionInstance[]
}) {
  const { t } = useTranslation()
  const visibleInstances = props.instances.filter(
    (instance) =>
      instance.status !== 'STOPPED' &&
      instance.leaseExpiresAt !== null &&
      Date.parse(instance.leaseExpiresAt) > Date.now()
  )
  const workerColumns: StaticDataTableColumn<
    (typeof visibleInstances)[number]
  >[] = [
    {
      id: 'worker',
      header: t('Executor instance'),
      cell: (instance) => (
        <span className='font-mono text-xs break-all'>{instance.workerId}</span>
      ),
    },
    {
      id: 'queue',
      header: t('Queue'),
      cell: (instance) => instance.queueName,
    },
    {
      id: 'mode',
      header: t('Mode'),
      cell: (instance) => t(executorModeLabelKeys[instance.mode] ?? 'Unknown'),
    },
    {
      id: 'status',
      header: t('Status'),
      cell: (instance) => (
        <BusinessTerm kind='executorStatus' value={instance.status} />
      ),
    },
    {
      id: 'credentials',
      header: t('Credentials'),
      cell: (instance) =>
        instance.credentialsConfigured ? t('Configured') : t('Not configured'),
    },
    {
      id: 'heartbeat',
      header: t('Latest heartbeat'),
      cell: (instance) => formatCanvasDateTime(instance.heartbeatAt),
    },
    {
      id: 'waitingArea',
      header: t('Tasks waiting for results'),
      cell: (instance) => <WaitingAreaUsage area={instance.waitingArea} />,
    },
    {
      id: 'database',
      header: t('Database communication'),
      cell: (instance) =>
        instance.databaseCommunication.status === 'RECENT_FAILURES' ? (
          <span className='text-destructive font-medium'>
            {t('{{count}} failures in a row in the last 10 minutes', {
              count: instance.databaseCommunication.failureStreak,
            })}
          </span>
        ) : (
          t('Database communication normal')
        ),
    },
  ]
  return (
    <div className='space-y-6'>
      <section className='space-y-3' aria-labelledby='running-workers-title'>
        <Card>
          <CardHeader>
            <CardTitle id='running-workers-title'>
              {t('Running workers')}
            </CardTitle>
            <CardAction>
              <span className='text-muted-foreground text-sm'>
                {t(
                  visibleInstances.length === 1
                    ? '1 worker'
                    : '{{count}} workers',
                  { count: visibleInstances.length }
                )}
              </span>
            </CardAction>
          </CardHeader>
          <CardContent>
            <StaticDataTable
              columns={workerColumns}
              data={visibleInstances}
              getRowKey={(instance) =>
                `${instance.queueName}-${instance.workerId}`
              }
              emptyContent={t('No running executor instances')}
              tableClassName='min-w-[1100px]'
              containerProps={{
                tabIndex: 0,
                role: 'region',
                'aria-label': t('Running workers'),
              }}
            />
          </CardContent>
        </Card>
      </section>

      <section className='space-y-3' aria-labelledby='system-recovery-title'>
        <Card>
          <CardHeader>
            <CardTitle id='system-recovery-title'>
              {t('System recovery')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className='grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2'>
              {[
                [
                  t('Heartbeat interval (milliseconds)'),
                  String(props.recovery.heartbeatMs),
                ],
                [
                  t('Lease duration (milliseconds)'),
                  String(props.recovery.leaseMs),
                ],
                [
                  t('Scan interval (milliseconds)'),
                  String(props.recovery.scanMs),
                ],
                [
                  t('Deployment target instances'),
                  String(props.recovery.defaultInstances),
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className='grid grid-cols-[minmax(0,1fr)_auto] gap-3'
                >
                  <dt className='text-muted-foreground'>{label}</dt>
                  <dd className='text-right font-medium tabular-nums'>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
type PollIntervalModel = {
  id: string
  modelKey: string
  effectiveDisplayName: string
  catalogDefaultName: string
  channelPollIntervalMs: number | null
  upstreamModelIds: string[]
}

/** Tasks in an instance's waiting area against its limit; at 80% of the limit it is shown as a warning. */
function WaitingAreaUsage(props: { area: ExecutionInstance['waitingArea'] }) {
  const { t } = useTranslation()
  const { count, limit, nearlyFull } = props.area
  if (limit === null) return <span className='tabular-nums'>{count} / —</span>
  const percent = Math.min(100, Math.round((count / limit) * 100))
  return (
    <div className='min-w-28 space-y-1'>
      <span
        className={
          nearlyFull
            ? 'text-destructive font-medium tabular-nums'
            : 'tabular-nums'
        }
      >
        {count} / {limit}
      </span>
      <div
        role='progressbar'
        aria-label={t('Tasks waiting for results')}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={count}
        className='bg-muted h-1.5 overflow-hidden rounded-full'
      >
        <div
          className={nearlyFull ? 'bg-destructive h-full' : 'bg-primary h-full'}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function CredentialGroupSection(props: {
  data: ChannelExecutionConfig
  configured: Partial<ChannelExecutionConfig>
  globalDefaultPollIntervalMs: number
  models: PollIntervalModel[]
  version: number | null
  providerName: string
  credentialGroupName: string
  pending: boolean
  onReview: (value: Confirmation) => void
  onPublish: (config: Record<string, unknown>) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const onDirtyChange = props.onDirtyChange
  // The poll interval shows what this group configured; empty follows the global default.
  const initial: ChannelForm = {
    ...props.data,
    pollIntervalMs: props.configured.pollIntervalMs,
  }
  const form = useForm<ChannelForm>({
    resolver: zodResolver(channelSchema),
    values: initial,
  })
  // After "Restore defaults", a field still equal to the default is left out of the publication and follows the default again.
  const [restored, setRestored] = useState(false)
  useEffect(() => setRestored(false), [props.version])
  const followsDefault = (name: keyof ChannelForm, value: unknown) =>
    restored &&
    (name === 'pollIntervalMs'
      ? value === undefined
      : value === credentialGroupDefaults[name])
  useEffect(() => {
    onDirtyChange(form.formState.isDirty)
  }, [form.formState.isDirty, onDirtyChange])
  const shown = (value: number | undefined) =>
    value === undefined ? t('Default') : String(value)
  const review = form.handleSubmit((values) =>
    props.onReview({
      title: t('Publish credential group execution policy'),
      description: t(
        'This creates a new policy version for the selected credential group.'
      ),
      details: [
        { label: t('Service provider'), value: props.providerName },
        {
          label: t('Credential group'),
          value: props.credentialGroupName,
        },
        {
          label: t('Current version'),
          value: props.version == null ? t('Default') : `v${props.version}`,
        },
        ...Object.entries(values).flatMap(([label, value]) => {
          const name = label as keyof ChannelForm
          // After a restore the dialog compares what the group stores; otherwise the form values, as before.
          const before = restored ? props.configured[name] : initial[name]
          const after = followsDefault(name, value)
            ? undefined
            : (value as number | undefined)
          if (after === before) return []
          return [
            { label: t(label), value: `${shown(before)} → ${shown(after)}` },
          ]
        }),
      ],
      confirmLabel: t('Publish'),
      run: () =>
        props.onPublish(
          Object.fromEntries(
            Object.entries(values).filter(
              ([name, value]) =>
                value !== undefined &&
                !followsDefault(name as keyof ChannelForm, value)
            )
          )
        ),
    })
  )
  const seconds = (milliseconds: number) =>
    new Intl.NumberFormat(
      toIntlLocale(i18n.resolvedLanguage || i18n.language),
      {
        maximumFractionDigits: 3,
      }
    ).format(milliseconds / 1000)
  // Judged on the group's current models: a field no model uses cannot be edited.
  const fixed = props.models.flatMap((model) =>
    typeof model.channelPollIntervalMs === 'number'
      ? [{ ...model, channelPollIntervalMs: model.channelPollIntervalMs }]
      : []
  )
  const allFixed =
    props.models.length > 0 && fixed.length === props.models.length
  const fixedSeconds = new Intl.ListFormat(
    toIntlLocale(i18n.resolvedLanguage || i18n.language),
    { type: 'conjunction' }
  ).format([
    ...new Set(fixed.map((model) => seconds(model.channelPollIntervalMs))),
  ])
  const groupPollIntervalMs = form.watch('pollIntervalMs')
  const pollHelp = [
    t(
      'How often to query the provider for the result; this does not control client refresh. Leave empty to use the default.'
    ),
  ]
  if (allFixed) {
    pollHelp.push(
      t(
        'Every model of this group has its interval fixed by its channel at {{seconds}} seconds; this setting has no effect.',
        { seconds: fixedSeconds }
      )
    )
  } else if (fixed.length > 0) {
    pollHelp.push(
      t(
        '{{count}} of the models have their interval fixed by their channel at {{seconds}} seconds.',
        { count: fixed.length, seconds: fixedSeconds }
      )
    )
  }
  return (
    <form
      aria-label={t('Timeouts and concurrency')}
      className='space-y-4'
      onSubmit={review}
    >
      <h3 className='font-semibold'>{t('Timeouts and concurrency')}</h3>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {(
          [
            'requestTimeoutMs',
            'streamIdleTimeoutMs',
            'pollIntervalMs',
            'deadlineMs',
            'unknownReleaseMs',
            'requestConcurrency',
            'asyncInFlightLimit',
          ] as const
        ).map((name) => {
          if (name === 'pollIntervalMs') {
            return (
              <NumberField
                key={name}
                id={`credential-group-${name}`}
                label={t(name)}
                registration={form.register(name, {
                  setValueAs: (value: unknown) =>
                    value === '' || value === null || value === undefined
                      ? undefined
                      : Number(value),
                })}
                placeholder={t('Default {{value}}', {
                  value: props.globalDefaultPollIntervalMs,
                })}
                disabled={allFixed}
                error={form.formState.errors[name]?.message}
                help={pollHelp.join(' ')}
              />
            )
          }
          let help: string | undefined
          if (name === 'requestTimeoutMs') {
            help = t(
              'The maximum wait for one non-streaming upstream request or result download.'
            )
          } else if (name === 'streamIdleTimeoutMs') {
            help = t(
              'The maximum time a streaming response may go without new data.'
            )
          } else if (name === 'deadlineMs') {
            help = t('{{description}} {{current}}', {
              description: t(
                'Measured from task acceptance; after it the system stops submitting or querying upstream and releases still-frozen points as a timeout.'
              ),
              current: t('Currently {{duration}}.', {
                duration: humanDuration(form.watch('deadlineMs'), t),
              }),
            })
          } else if (name === 'unknownReleaseMs') {
            const deadline = form.watch('deadlineMs')
            const wait = form.watch('unknownReleaseMs')
            help = t('{{description}} {{current}}', {
              description: t(
                'When the result cannot be confirmed and there is no upstream task ID, frozen points are released after this wait.'
              ),
              current:
                wait >= deadline
                  ? t(
                      'Currently within {{duration}} after acceptance (limited by the execution deadline).',
                      { duration: humanDuration(deadline, t) }
                    )
                  : t('Currently {{duration}}.', {
                      duration: humanDuration(wait, t),
                    }),
            })
          } else if (name === 'requestConcurrency') {
            help = t(
              'Concurrent upstream requests across all instances for this API Key group; full capacity queues admitted tasks.'
            )
          } else if (name === 'asyncInFlightLimit') {
            help = t(
              'Unfinished upstream asynchronous tasks for this group; full capacity queues new asynchronous submissions. Result queries do not use this allowance.'
            )
          }
          let label = t(name)
          if (name === 'asyncInFlightLimit') {
            label = t('Upstream unfinished asynchronous task limit')
          } else if (name === 'deadlineMs') {
            label = t('Execution deadline (milliseconds)')
          } else if (name === 'unknownReleaseMs') {
            label = t('Unknown result release wait (milliseconds)')
          }
          return (
            <NumberField
              key={name}
              id={`credential-group-${name}`}
              label={label}
              registration={form.register(name, { valueAsNumber: true })}
              error={form.formState.errors[name]?.message}
              help={help}
            />
          )
        })}
      </div>
      {props.models.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className='text-primary text-sm underline underline-offset-4'>
            {t('View each model ({{count}})', { count: props.models.length })}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul
              className='divide-y pt-2 text-sm'
              aria-label={t('Poll interval of each model')}
            >
              {props.models.map((model) => {
                let source = t('Poll interval source default')
                let value = props.globalDefaultPollIntervalMs
                if (typeof model.channelPollIntervalMs === 'number') {
                  source = t('Poll interval source channel')
                  value = model.channelPollIntervalMs
                } else if (groupPollIntervalMs !== undefined) {
                  source = t('Poll interval source group')
                  value = groupPollIntervalMs
                }
                return (
                  <li
                    key={model.id}
                    className='flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2'
                  >
                    <span className='min-w-0 break-words'>
                      {model.effectiveDisplayName}
                      <ModelIdentityTooltip
                        effectiveDisplayName={model.effectiveDisplayName}
                        catalogDefaultName={model.catalogDefaultName}
                        modelKey={model.modelKey}
                        upstreamModelIds={model.upstreamModelIds}
                      />
                    </span>
                    <span className='text-muted-foreground tabular-nums'>
                      {t('{{seconds}} seconds · {{source}}', {
                        seconds: Number.isFinite(value) ? seconds(value) : '—',
                        source,
                      })}
                    </span>
                  </li>
                )
              })}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
        <Button
          type='button'
          variant='outline'
          disabled={props.pending}
          onClick={() => {
            // Only the form changes; the defaults take effect when the reviewed publication is confirmed.
            for (const [name, value] of Object.entries(
              credentialGroupDefaults
            )) {
              form.setValue(name as keyof ChannelForm, value, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
            form.setValue('pollIntervalMs', undefined, {
              shouldDirty: true,
              shouldValidate: true,
            })
            setRestored(true)
          }}
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

type LimitModel = {
  modelKey: string
  effectiveDisplayName: string
  catalogDefaultName: string
}

function LimitModelIdentity({ model }: { model: LimitModel }) {
  return (
    <span
      data-model-identity='limit-model'
      className='inline-grid max-w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-1'
    >
      <span className='min-w-0 break-all'>
        <span className='break-all'>{model.effectiveDisplayName}</span> ·{' '}
        <span className='text-muted-foreground font-mono text-xs break-all'>
          {model.modelKey}
        </span>
      </span>
      <span className='shrink-0'>
        <ModelIdentityTooltip
          effectiveDisplayName={model.effectiveDisplayName}
          catalogDefaultName={model.catalogDefaultName}
          modelKey={model.modelKey}
          modelKeyShown
        />
      </span>
    </span>
  )
}

function LimitSection(props: {
  rules: EditableLimitRule[]
  models: LimitModel[]
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
  const initialRules = useMemo(
    () =>
      props.rules.map((rule) => ({
        ...emptyLimitRule(),
        ...rule,
        credentialGroupId: rule.credentialGroupId ?? '',
        modelKeys: rule.modelKeys ?? [],
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
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  useEffect(() => {
    onDirtyChange(form.formState.isDirty)
  }, [form.formState.isDirty, onDirtyChange])
  const showReview = (values: LimitForm, change: string) => {
    const rules: EditableLimitRule[] = values.rules.map((rule) => ({
      id: rule.id,
      enabled: rule.enabled,
      scope: rule.scope,
      ...(rule.credentialGroupId
        ? { credentialGroupId: rule.credentialGroupId }
        : {}),
      ...(rule.modelKeys.length ? { modelKeys: rule.modelKeys } : {}),
      ...(rule.sharedGroup ? { sharedGroup: rule.sharedGroup } : {}),
      metric: rule.metric,
      limit: rule.limit,
      ...(rule.metric === 'TPM' ? { tokenIncludes: rule.tokenIncludes } : {}),
    }))
    const modelNamesFor = (rule: EditableLimitRule) =>
      (rule.modelKeys ?? []).map(
        (modelKey) =>
          props.models.find((model) => model.modelKey === modelKey)
            ?.effectiveDisplayName ?? modelKey
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
      title: t('Review publication'),
      cancelLabel: t('Return to editing'),
      description: t(
        'This replaces the configured limit-rule list for the selected credential group.'
      ),
      details: [
        { label: t('Service provider'), value: props.providerName },
        { label: t('Credential group'), value: props.credentialGroupName },
        { label: t('Change'), value: t(change) },
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
  }
  const review = form.handleSubmit((values) => {
    if (editingIndex === null) return
    const activeRule = values.rules[editingIndex]
    if (!activeRule) return
    if (
      activeRule.scope === 'CREDENTIAL_GROUP' &&
      activeRule.metric !== 'RPM' &&
      activeRule.metric !== 'TPM'
    ) {
      form.setError(`rules.${editingIndex}.metric`, {
        type: 'custom',
        message: 'Select RPM or TPM for the entire API Key group',
      })
      return
    }
    showReview(
      values,
      initialRules.some((rule) => rule.id === activeRule.id)
        ? 'Edit rule'
        : 'Add rule'
    )
  })
  return (
    <form aria-label={t('Limit rules')} className='space-y-4' onSubmit={review}>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h3 className='font-semibold'>{t('Additional limit rules')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Additional rules apply only to this API Key group and its bound models. Group request concurrency and unfinished asynchronous task limits are set above.'
            )}
          </p>
        </div>
        <Button
          type='button'
          disabled={editingIndex !== null}
          aria-controls={
            editingIndex !== null ? 'limit-rule-editor' : undefined
          }
          aria-expanded={editingIndex !== null}
          onClick={() => {
            fields.append(emptyLimitRule())
            setEditingIndex(fields.fields.length)
          }}
        >
          {t('Add rule')}
        </Button>
      </div>
      <StaticDataTable
        className='max-w-full overflow-x-auto'
        tableClassName='min-w-max'
        columns={
          [
            {
              id: 'target',
              className: canvasStaticColumnWidth.wide,
              header: t('Limit target'),
              cell: (rule: EditableLimitRule) => {
                if (rule.scope === 'CREDENTIAL_GROUP') {
                  return t('Entire API Key group')
                }
                const models = (rule.modelKeys ?? []).map((modelKey) =>
                  props.models.find((model) => model.modelKey === modelKey)
                )
                const label =
                  rule.scope === 'MODEL_GROUP'
                    ? t('Multiple models share')
                    : t('Single model')
                return (
                  <span className='block min-w-0'>
                    <span className='block'>{label}</span>
                    <span className='mt-1 flex flex-wrap gap-x-3 gap-y-1'>
                      {(rule.modelKeys ?? []).map((modelKey, index) => {
                        const model = models[index]
                        return model ? (
                          <LimitModelIdentity key={modelKey} model={model} />
                        ) : (
                          <span key={modelKey}>{modelKey}</span>
                        )
                      })}
                    </span>
                  </span>
                )
              },
            },
            {
              id: 'metric',
              className: canvasStaticColumnWidth.wide,
              header: t('Metric'),
              cell: (rule: EditableLimitRule) => (
                <span className='break-words'>
                  {t(limitMetricLabelKeys[rule.metric])}
                </span>
              ),
            },
            {
              id: 'limit',
              className: canvasStaticColumnWidth.compact,
              header: t('Upper limit'),
              cell: (rule: EditableLimitRule) => rule.limit,
            },
            {
              id: 'status',
              className: canvasStaticColumnWidth.compact,
              header: t('Status'),
              cell: (rule: EditableLimitRule) => (
                <CanvasStatusBadge
                  status={rule.enabled ? 'ACTIVE' : 'DISABLED'}
                  label={t(rule.enabled ? 'Enabled' : 'Disabled')}
                />
              ),
            },
            {
              id: 'actions',
              className: canvasStaticColumnWidth.compact,
              header: t('Actions'),
              cell: (rule: EditableLimitRule) => {
                const index = form
                  .getValues('rules')
                  .findIndex((item) => item.id === rule.id)
                return (
                  <div className='flex gap-2'>
                    <Button
                      type='button'
                      variant='outline'
                      disabled={editingIndex !== null}
                      onClick={() => setEditingIndex(index)}
                    >
                      {t('Edit')}
                    </Button>
                    <Button
                      type='button'
                      variant='outline'
                      className='text-destructive hover:text-destructive'
                      disabled={editingIndex !== null}
                      onClick={() =>
                        showReview(
                          {
                            rules: form
                              .getValues('rules')
                              .filter((_, ruleIndex) => ruleIndex !== index),
                          },
                          'Delete rule'
                        )
                      }
                    >
                      {t('Delete')}
                    </Button>
                  </div>
                )
              },
            },
          ] as StaticDataTableColumn<EditableLimitRule>[]
        }
        data={initialRules}
        getRowKey={(rule) => rule.id}
        emptyContent={t(
          'No additional rules are configured; the group capacity above and platform limits still apply.'
        )}
        containerProps={{
          tabIndex: 0,
          role: 'region',
          'aria-label': t('Additional limit rules'),
        }}
      />
      {fields.fields.map((field, index) => {
        if (editingIndex !== index) return null
        const scope = form.watch(`rules.${index}.scope`)
        const metric = form.watch(`rules.${index}.metric`)
        const ruleId = form.watch(`rules.${index}.id`)
        const isEditingExisting = initialRules.some(
          (rule) => rule.id === ruleId
        )
        const unsupportedGroupMetric =
          scope === 'CREDENTIAL_GROUP' && metric !== 'RPM' && metric !== 'TPM'
        const ruleErrors = form.formState.errors.rules?.[index]
        let editorHelpKey =
          'Set group concurrency and unfinished asynchronous task limits above.'
        if (unsupportedGroupMetric) {
          editorHelpKey =
            'This existing group rule uses a metric configured above. Choose RPM or TPM before publishing changes.'
        } else if (scope === 'MODEL') {
          editorHelpKey =
            'Only models bound to this API Key group can be selected; this limit remains subject to group capacity.'
        } else if (scope === 'MODEL_GROUP') {
          editorHelpKey =
            'Only models bound to this API Key group can be selected; selected models share the limit and remain subject to group capacity.'
        }
        return (
          <div
            key={field.id}
            id='limit-rule-editor'
            className='space-y-4 rounded-xl border p-4'
          >
            <input type='hidden' {...form.register(`rules.${index}.id`)} />
            <div className='flex items-center justify-between gap-2'>
              <h4 className='font-semibold'>
                {t(isEditingExisting ? 'Edit rule' : 'Add rule')}
              </h4>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => {
                  if (
                    !initialRules.some(
                      (rule) => rule.id === form.getValues(`rules.${index}.id`)
                    )
                  ) {
                    fields.remove(index)
                  } else {
                    form.reset({ rules: initialRules })
                  }
                  setEditingIndex(null)
                }}
              >
                {t('Cancel')}
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
                      if (
                        nextScope === 'CREDENTIAL_GROUP' &&
                        metric !== 'RPM' &&
                        metric !== 'TPM'
                      ) {
                        form.setValue(`rules.${index}.metric`, 'RPM', {
                          shouldDirty: true,
                        })
                      }
                      form.setValue(`rules.${index}.credentialGroupId`, '', {
                        shouldDirty: true,
                      })
                      form.setValue(`rules.${index}.modelKeys`, [], {
                        shouldDirty: true,
                      })
                      form.resetField(`rules.${index}.modelKeys`, {
                        defaultValue: [],
                        keepDirty: true,
                      })
                      form.clearErrors([
                        `rules.${index}.credentialGroupId`,
                        `rules.${index}.modelKeys`,
                        `rules.${index}.scope`,
                        `rules.${index}.metric`,
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
              <Controller
                control={form.control}
                name={`rules.${index}.metric`}
                render={({ field: item }) => (
                  <SelectField
                    id={`limit-metric-${index}`}
                    label={t('Metric')}
                    value={unsupportedGroupMetric ? '' : item.value}
                    onBlur={item.onBlur}
                    onChange={(value) => {
                      item.onChange(value)
                      form.clearErrors(`rules.${index}.metric`)
                    }}
                    options={(scope === 'CREDENTIAL_GROUP'
                      ? (['RPM', 'TPM'] as const)
                      : ([
                          'RPM',
                          'TPM',
                          'CONCURRENCY',
                          'ASYNC_IN_FLIGHT',
                        ] as const)
                    ).map((value) => ({
                      value,
                      label: t(limitMetricLabelKeys[value]),
                    }))}
                    includeBlank={unsupportedGroupMetric}
                    blankLabel={t('Choose RPM or TPM')}
                    error={localizeError(ruleErrors?.metric?.message)}
                  />
                )}
              />
              <TextField
                id={`limit-value-${index}`}
                label={t('Upper limit')}
                registration={form.register(`rules.${index}.limit`)}
                error={localizeError(ruleErrors?.limit?.message)}
              />
            </div>
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
                  name={`rules.${index}.modelKeys`}
                  render={({ field: item }) => (
                    <div className='space-y-2'>
                      <Label htmlFor={`limit-models-${index}`}>
                        {t('Models')}
                      </Label>
                      <MultiSelect
                        id={`limit-models-${index}`}
                        options={props.models.map((model) => ({
                          value: model.modelKey,
                          label: model.effectiveDisplayName,
                        }))}
                        selected={item.value}
                        onChange={(value) => item.onChange(value)}
                        onBlur={item.onBlur}
                        ariaInvalid={Boolean(ruleErrors?.modelKeys?.message)}
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
                      <div className='flex flex-wrap gap-x-3 gap-y-1'>
                        {item.value.map((modelKey) => {
                          const model = props.models.find(
                            (candidate) => candidate.modelKey === modelKey
                          )
                          return model ? (
                            <LimitModelIdentity key={modelKey} model={model} />
                          ) : null
                        })}
                      </div>
                      {ruleErrors?.modelKeys?.message &&
                        fieldError(
                          t(ruleErrors.modelKeys.message),
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
                  name={`rules.${index}.modelKeys`}
                  render={({ field: item }) => (
                    <div className='space-y-2'>
                      <SelectField
                        id={`limit-model-${index}`}
                        label={t('Model')}
                        value={item.value[0] ?? ''}
                        onChange={(value) =>
                          item.onChange(value ? [value] : [])
                        }
                        onBlur={item.onBlur}
                        options={props.models.map((model) => ({
                          value: model.modelKey,
                          label: model.effectiveDisplayName,
                        }))}
                        includeBlank
                        blankLabel={t('Select a bound model')}
                        error={localizeError(ruleErrors?.modelKeys?.message)}
                      />
                      {(() => {
                        const model = props.models.find(
                          (candidate) => candidate.modelKey === item.value[0]
                        )
                        return model ? (
                          <LimitModelIdentity model={model} />
                        ) : null
                      })()}
                    </div>
                  )}
                />
              ))}
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
            <p className='text-muted-foreground text-xs'>{t(editorHelpKey)}</p>
            {isEditingExisting && (
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
            )}
            {Object.keys(form.formState.errors).length > 0 &&
              fieldError(t('Fix the highlighted rule fields'))}
            <div className='flex flex-wrap justify-end gap-2 border-t pt-4'>
              <Button type='submit' disabled={props.pending}>
                {t('Review publication')}
              </Button>
            </div>
          </div>
        )
      })}
    </form>
  )
}

function compareErrorRulePriority(
  left: { httpStatus: number | '' | null; conditions: unknown[] },
  right: { httpStatus: number | '' | null; conditions: unknown[] }
) {
  return errorRulePriority(left) - errorRulePriority(right)
}

function errorRulePriority(rule: {
  httpStatus: number | '' | null
  conditions: unknown[]
}) {
  if (
    rule.httpStatus !== null &&
    rule.httpStatus !== '' &&
    rule.conditions.length > 0
  ) {
    return 0
  }
  if (rule.conditions.length > 0) return 1
  return 2
}

type ErrorRuleOutcome =
  | 'CONFIRMED_FAILED'
  | 'UNKNOWN'
  | 'SYSTEM_CONFIRMED_FAILED'
  | 'SYSTEM_UNKNOWN'
  | 'SYSTEM_BY_RESPONSE'

const outcomeBadgeVariants: Record<
  ErrorRuleOutcome,
  'destructive' | 'secondary' | 'outline'
> = {
  CONFIRMED_FAILED: 'destructive',
  UNKNOWN: 'secondary',
  SYSTEM_CONFIRMED_FAILED: 'outline',
  SYSTEM_UNKNOWN: 'outline',
  SYSTEM_BY_RESPONSE: 'outline',
}
const errorRuleOutcomeLabelKeys: Record<ErrorRuleOutcome, string> = {
  CONFIRMED_FAILED: 'Mark failed',
  UNKNOWN: 'Keep pending confirmation',
  SYSTEM_CONFIRMED_FAILED: 'System judgement · mark failed',
  SYSTEM_UNKNOWN: 'System judgement · pending confirmation',
  SYSTEM_BY_RESPONSE: 'Use system judgement',
}

/** The task result a submission gets when this rule matches (Cloud `resolveExecutionStatus`). */
function errorRuleOutcome(rule: {
  httpStatus: number | '' | null
  executionDisposition: ErrorForm['rules'][number]['executionDisposition']
}): ErrorRuleOutcome {
  if (rule.executionDisposition) return rule.executionDisposition
  if (rule.httpStatus === '' || rule.httpStatus === null) {
    return 'SYSTEM_BY_RESPONSE'
  }
  const status = Number(rule.httpStatus)
  if (status >= 400 && status < 500) return 'SYSTEM_CONFIRMED_FAILED'
  if (status >= 500) return 'SYSTEM_UNKNOWN'
  return 'SYSTEM_BY_RESPONSE'
}

function formRuleMatchFacts(rule: ErrorForm['rules'][number]) {
  return {
    httpStatus: rule.httpStatus === '' ? null : Number(rule.httpStatus),
    conditions: rule.conditions
      .filter((condition) => condition.path.trim() !== '')
      .map((condition) => ({
        path: condition.path.trim(),
        operator: condition.operator,
        valueType: condition.valueType,
        value: normalizeErrorConditionValue(
          condition.valueType,
          condition.value
        ),
      })),
  }
}

type ErrorRuleDraft = ErrorForm['rules'][number]
type RuleEditorState = {
  index: number | null
  draft: ErrorRuleDraft
  initial: ErrorRuleDraft
  example?: ErrorRuleExampleKind
  showJson: boolean
  jsonText: string
  jsonError: string
  // Business-rule issues of JSON that was not written back to the form.
  jsonIssues: Map<string, string>
  tried: boolean
}

/** Validation issues for one rule, keyed by form field, using the shared list schema. */
function errorRuleDraftIssues(
  draft: ErrorRuleDraft,
  others: ErrorRuleDraft[],
  showSafeErrorDetailsToCustomer: boolean
): Map<string, string> {
  const rules = [...others, draft]
  const index = rules.length - 1
  const result = errorSchema.safeParse({
    rules,
    showSafeErrorDetailsToCustomer,
  })
  const issues = new Map<string, string>()
  if (result.success) return issues
  for (const issue of result.error.issues) {
    if (issue.path[0] !== 'rules' || issue.path[1] !== index) continue
    const [field, conditionIndex, conditionField] = issue.path.slice(2)
    let key = String(field ?? 'rule')
    if (field === 'conditions' && typeof conditionIndex === 'number') {
      key = `conditions.${conditionIndex}.${conditionField === 'path' ? 'path' : 'value'}`
    } else if (field === 'conditions' || field === 'ruleType') {
      key = 'when'
    }
    if (!issues.has(key)) issues.set(key, issue.message)
  }
  return issues
}

function jsonFieldForIssue(key: string): string {
  const condition = /^conditions\.(\d+)\.(path|value)$/.exec(key)
  if (condition) return `conditions[${condition[1]}].${condition[2]}`
  if (key === 'when') return 'ruleType / httpStatus / conditions'
  if (key === 'clientMessages') return 'clientMessages'
  return key
}

function jsonSyntaxError(error: unknown, text: string, t: TFunction): string {
  const message = error instanceof Error ? error.message : ''
  const lineColumn = /line (\d+) column (\d+)/.exec(message)
  if (lineColumn) {
    return t('Invalid JSON near line {{line}}, column {{column}}.', {
      line: lineColumn[1],
      column: lineColumn[2],
    })
  }
  const position = /position (\d+)/.exec(message)
  if (!position) return t('Invalid JSON: check quotes, commas, and brackets.')
  const before = text.slice(0, Number(position[1])).split('\n')
  return t('Invalid JSON near line {{line}}, column {{column}}.', {
    line: before.length,
    column: (before.at(-1)?.length ?? 0) + 1,
  })
}

/** Parses edited JSON back into the form draft; system match fields stay locked. */
function ruleDraftFromJson(
  text: string,
  base: ErrorRuleDraft,
  t: TFunction
): { draft: ErrorRuleDraft } | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { error: jsonSyntaxError(error, text, t) }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: t('The JSON must be an object.') }
  }
  const keys = Object.keys(parsed)
  const managed = keys.filter((key) =>
    ['id', 'source', 'version'].includes(key)
  )
  if (managed.length) {
    return {
      error: t(
        '{{fields}} are maintained by the system and cannot be entered here.',
        { fields: managed.join(', ') }
      ),
    }
  }
  const unknown = keys.filter(
    (key) => !(errorRuleJsonKeys as readonly string[]).includes(key)
  )
  if (unknown.length) {
    return {
      error: t(
        'Unsupported fields: {{fields}}. See “Field descriptions” below.',
        { fields: unknown.join(', ') }
      ),
    }
  }
  const missing = errorRuleJsonKeys.filter(
    (key) =>
      key !== 'executionDisposition' &&
      key !== 'hideUpstreamReason' &&
      !keys.includes(key)
  )
  if (missing.length) {
    return {
      error: t('Missing fields: {{fields}}', { fields: missing.join(', ') }),
    }
  }
  const structure = editableErrorRuleJsonSchema.safeParse(parsed)
  if (!structure.success) {
    const issue = structure.error.issues[0]
    return {
      error: `${issue?.path.join('.') || 'rule'} · ${t(issue?.message ?? '')}`,
    }
  }
  const next: ErrorRuleDraft = {
    ...base,
    enabled: structure.data.enabled,
    ruleType: structure.data.ruleType,
    httpStatus: structure.data.httpStatus ?? '',
    conditions: structure.data.conditions.map((condition) => ({
      clientKey: crypto.randomUUID(),
      path: condition.path,
      operator: condition.operator,
      valueType: condition.valueType,
      value: conditionValueForEditor(
        condition.valueType,
        condition.value as string | number | boolean | null
      ),
    })),
    category: structure.data.category,
    clientMessages: Object.fromEntries(
      locales.map((locale) => [
        locale,
        structure.data.clientMessages[locale] ?? '',
      ])
    ) as Record<ExecutionLocale, string>,
    customMessagesEnabled: Object.values(structure.data.clientMessages).some(
      (message) => message?.trim()
    ),
    adminNote: structure.data.adminNote,
    executionDisposition: structure.data.executionDisposition ?? '',
    hideUpstreamReason: structure.data.hideUpstreamReason ?? false,
  }
  if (
    base.source !== 'CUSTOM' &&
    (next.httpStatus !== base.httpStatus ||
      next.ruleType !== base.ruleType ||
      next.conditions.length > 0)
  ) {
    return {
      error: t(
        'System mapping match fields (ruleType, httpStatus, conditions) cannot be changed.'
      ),
    }
  }
  return { draft: next }
}

function JsonValidationStatus(props: {
  jsonError: string
  issues: Map<string, string>
}) {
  const { t } = useTranslation()
  if (props.jsonError) {
    return (
      <div
        className='border-destructive/35 text-destructive rounded-md border p-3 text-sm'
        role='alert'
      >
        <strong>{t('JSON not applied')}</strong>: {props.jsonError}
        <p className='text-muted-foreground mt-1 text-xs'>
          {t(
            'The form keeps the last valid content and syncs again once the JSON is fixed.'
          )}
        </p>
      </div>
    )
  }
  if (props.issues.size) {
    return (
      <div
        className='border-destructive/35 text-destructive rounded-md border p-3 text-sm'
        role='alert'
      >
        <strong>{t('Validation failed')}</strong>
        {[...props.issues].map(([key, message]) => (
          <p key={key} className='mt-1'>
            <span className='font-mono'>{jsonFieldForIssue(key)}</span>:{' '}
            {t(message)}
          </p>
        ))}
      </div>
    )
  }
  return (
    <p className='text-xs'>
      {t('✓ Validation passed and synced with the form.')}
    </p>
  )
}

function ErrorSection(props: {
  providerId: string
  providerName: string
  rules: ErrorRule[]
  showSafeErrorDetailsToCustomer: boolean
  releaseWaitMs: number
  pending: boolean
  onReview: (value: Confirmation) => void
  onPublish: (config: {
    rules: ErrorRule[]
    showSafeErrorDetailsToCustomer: boolean
  }) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const onDirtyChange = props.onDirtyChange
  const form = useForm<ErrorForm>({
    resolver: zodResolver(errorSchema),
    defaultValues: {
      showSafeErrorDetailsToCustomer: props.showSafeErrorDetailsToCustomer,
      rules: props.rules
        .map(
          (rule): ErrorRuleDraft => ({
            ...rule,
            executionDisposition: rule.executionDisposition ?? '',
            hideUpstreamReason: rule.hideUpstreamReason ?? false,
            httpStatus: rule.httpStatus ?? '',
            conditions: rule.conditions.map((condition) => ({
              ...condition,
              clientKey: crypto.randomUUID(),
              value: conditionValueForEditor(
                condition.valueType,
                condition.value
              ),
            })),
            customMessagesEnabled:
              rule.source !== 'SYSTEM' &&
              Object.values(rule.clientMessages).some(
                (message) => message?.trim() !== ''
              ),
            clientMessages: Object.fromEntries(
              locales.map((locale) => [
                locale,
                rule.source === 'SYSTEM'
                  ? ''
                  : (rule.clientMessages[locale] ?? ''),
              ])
            ) as Record<ExecutionLocale, string>,
          })
        )
        .sort(compareErrorRulePriority),
    },
  })
  const fields = useFieldArray({ control: form.control, name: 'rules' })
  useEffect(() => {
    onDirtyChange(form.formState.isDirty)
  }, [form.formState.isDirty, onDirtyChange])
  const currentLocale = executionLocaleForLanguage(i18n.language)
  const [testOpen, setTestOpen] = useState(false)
  const [previewStatus, setPreviewStatus] = useState(
    firstErrorPreviewSample.status
  )
  const [previewJson, setPreviewJson] = useState(
    JSON.stringify(firstErrorPreviewSample.response)
  )
  // A 2xx response is either a task the provider reported failed or a response that breaks the contract.
  const [previewResponseKind, setPreviewResponseKind] = useState<
    'FAILED_TASK' | 'SCHEMA_MISMATCH'
  >('FAILED_TASK')
  const previewIsSuccessStatus = /^2\d\d$/.test(previewStatus)
  const [previewError, setPreviewError] = useState('')
  const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(
    null
  )
  const [showSystem, setShowSystem] = useState(false)
  const [editor, setEditor] = useState<RuleEditorState | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const editorTrigger = useRef<HTMLElement | null>(null)
  const finishEditing = () => {
    setEditor(null)
    const trigger = editorTrigger.current
    window.setTimeout(() => trigger?.focus(), 0)
  }
  const watchedRules = form.watch('rules')
  const watchedShowSafeDetails = form.watch('showSafeErrorDetailsToCustomer')
  const originalRulesById = new Map(props.rules.map((rule) => [rule.id, rule]))
  const draftRules = normalizeErrorDraft(watchedRules, props.rules)
  const draftRulesById = new Map(draftRules.map((rule) => [rule.id, rule]))
  const ruleIsUnpublished = (ruleId: string) => {
    const original = originalRulesById.get(ruleId)
    const draft = draftRulesById.get(ruleId)
    if (!original || !draft) return true
    if (draft.source === 'SYSTEM') return original.source !== 'SYSTEM'
    return stableJson(original) !== stableJson(draft)
  }
  const unpublishedCount =
    draftRules.filter((rule) => ruleIsUnpublished(rule.id)).length +
    props.rules.filter((rule) => !draftRulesById.has(rule.id)).length +
    (watchedShowSafeDetails === props.showSafeErrorDetailsToCustomer ? 0 : 1)
  const restoreSystemDefault = (index: number) => {
    const rule = form.getValues(`rules.${index}`)
    const status = rule.httpStatus === '' ? null : Number(rule.httpStatus)
    form.setValue(
      `rules.${index}`,
      {
        ...rule,
        enabled: true,
        category:
          (status !== null && systemDefaultCategoryByStatus.get(status)) ||
          rule.category,
        adminNote: '',
        executionDisposition: '',
        hideUpstreamReason: false,
        customMessagesEnabled: false,
        clientMessages: Object.fromEntries(
          locales.map((locale) => [locale, ''])
        ) as Record<ExecutionLocale, string>,
        source: 'SYSTEM',
      },
      { shouldDirty: true }
    )
    toast.success(t('Restored to default. It takes effect after publishing.'))
  }
  const preview = useMutation({
    mutationFn: (input: {
      fingerprint: string
      httpStatus: number
      response: Record<string, unknown>
      rules: ErrorRule[]
      showSafeErrorDetailsToCustomer: boolean
      responseKind?: 'FAILED_TASK' | 'SCHEMA_MISMATCH'
    }) =>
      previewCanvasExecutionError({
        providerId: props.providerId,
        httpStatus: input.httpStatus,
        response: input.response,
        locale: currentLocale,
        rules: input.rules,
        showSafeErrorDetailsToCustomer: input.showSafeErrorDetailsToCustomer,
        responseKind: input.responseKind,
      }),
    onSuccess: (_result, input) => {
      setPreviewError('')
      setPreviewFingerprint(input.fingerprint)
    },
    onError: (error) =>
      setPreviewError(
        (error as { response?: { status?: number } }).response?.status === 422
          ? t('Preview fields do not match the error rule contract')
          : t('Error mapping preview request failed')
      ),
  })
  const currentPreviewFingerprint = JSON.stringify([
    previewStatus,
    previewJson,
    stableJson(draftRules),
    watchedShowSafeDetails,
    previewIsSuccessStatus ? previewResponseKind : null,
  ])
  const runPreview = (status: string, json: string) => {
    setPreviewError('')
    preview.reset()
    if (
      !/^\d{3}$/.test(status) ||
      Number(status) < 100 ||
      Number(status) > 599
    ) {
      setPreviewError(t('Enter a three-digit HTTP status.'))
      return
    }
    let response: Record<string, unknown>
    try {
      const parsed = JSON.parse(json || '{}') as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setPreviewError(t('The response must be a valid JSON object.'))
        return
      }
      response = parsed as Record<string, unknown>
    } catch {
      setPreviewError(t('The response must be a valid JSON object.'))
      return
    }
    preview.mutate({
      fingerprint: JSON.stringify([
        status,
        json,
        stableJson(draftRules),
        watchedShowSafeDetails,
        /^2\d\d$/.test(status) ? previewResponseKind : null,
      ]),
      httpStatus: Number(status),
      response,
      rules: draftRules,
      showSafeErrorDetailsToCustomer: watchedShowSafeDetails,
      ...(/^2\d\d$/.test(status) ? { responseKind: previewResponseKind } : {}),
    })
  }
  const review = form.handleSubmit((values) => {
    const draft = normalizeErrorDraft(values.rules, props.rules)
    const rules = draft.filter((rule) => rule.source !== 'SYSTEM')
    const originalById = new Map(props.rules.map((rule) => [rule.id, rule]))
    const draftById = new Map(draft.map((rule) => [rule.id, rule]))
    const outcome = (rule: ErrorRule) =>
      t(
        errorRuleOutcomeLabelKeys[
          errorRuleOutcome({
            httpStatus: rule.httpStatus,
            executionDisposition: rule.executionDisposition ?? '',
          })
        ]
      )
    const changes = [
      ...draft
        .filter((rule) => !originalById.has(rule.id))
        .map(
          (rule) =>
            `${t('Added')}  ${formatErrorRuleMatch(rule, t)} → ${outcome(rule)}`
        ),
      ...draft
        .filter(
          (rule) => originalById.has(rule.id) && ruleIsUnpublished(rule.id)
        )
        .map(
          (rule) =>
            `${t('Updated')}  ${formatErrorRuleMatch(rule, t)} → ${outcome(rule)}`
        ),
      ...props.rules
        .filter((rule) => !draftById.has(rule.id))
        .map((rule) => `${t('Removed')}  ${formatErrorRuleMatch(rule, t)}`),
      ...(values.showSafeErrorDetailsToCustomer ===
      props.showSafeErrorDetailsToCustomer
        ? []
        : [
            `${t('Show the upstream reason to customers')}: ${t(
              values.showSafeErrorDetailsToCustomer ? 'Enabled' : 'Disabled'
            )}`,
          ]),
    ]
    const newlyFailed = draft.filter(
      (rule) =>
        rule.enabled &&
        rule.executionDisposition === 'CONFIRMED_FAILED' &&
        originalById.get(rule.id)?.executionDisposition !== 'CONFIRMED_FAILED'
    )
    props.onReview({
      title: t('Publish error mappings'),
      description: t(
        'This affects every channel of this provider and only tasks accepted after publishing.'
      ),
      details: [
        ...(newlyFailed.length
          ? [
              {
                label: t('Newly marked failed'),
                value: `${t(
                  '{{count}} mappings will mark tasks failed and release frozen points immediately.',
                  { count: newlyFailed.length }
                )}${newlyFailed.some((rule) => !rule.adminNote.trim()) ? ` ${t('Some mappings have no rationale.')}` : ''}`,
              },
            ]
          : []),
        { label: t('Service provider'), value: props.providerName },
        {
          label: t('Changes'),
          value: changes.join(' · ') || t('No changes'),
        },
      ],
      confirmLabel: t('Publish'),
      requiresAcknowledgement: newlyFailed.length > 0,
      run: () =>
        props.onPublish({
          rules,
          showSafeErrorDetailsToCustomer: values.showSafeErrorDetailsToCustomer,
        }),
    })
  })

  const openEditor = (index: number | null) => {
    editorTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const draft =
      index === null ? emptyErrorRule() : form.getValues(`rules.${index}`)
    setEditor({
      index,
      draft: structuredClone(draft),
      initial: structuredClone(draft),
      showJson: false,
      jsonText: editableRuleJson(draft),
      jsonError: '',
      jsonIssues: new Map(),
      tried: false,
    })
  }
  const updateDraft = (next: ErrorRuleDraft, example?: ErrorRuleExampleKind) =>
    setEditor((current) =>
      current
        ? {
            ...current,
            draft: next,
            ...(example ? { example } : {}),
            jsonText: editableRuleJson(next),
            jsonError: '',
            jsonIssues: new Map(),
          }
        : current
    )
  const closeEditor = (force = false) => {
    if (!editor) return
    if (!force && stableJson(editor.draft) !== stableJson(editor.initial)) {
      setConfirmDiscard(true)
      return
    }
    setConfirmDiscard(false)
    finishEditing()
  }
  const otherRules = editor
    ? watchedRules.filter((_, index) => index !== editor.index)
    : []
  const editorIssues = editor
    ? errorRuleDraftIssues(editor.draft, otherRules, watchedShowSafeDetails)
    : new Map<string, string>()
  const showIssue = (key: string) =>
    editor?.tried ? editorIssues.get(key) : undefined
  const issueText = (key: string) => {
    const issue = showIssue(key)
    return issue ? fieldError(t(issue)) : null
  }
  const saveEditor = () => {
    if (!editor) return
    setEditor({ ...editor, tried: true })
    if (editor.jsonError || editor.jsonIssues.size || editorIssues.size) return
    const saved: ErrorRuleDraft = {
      ...editor.draft,
      conditions: editor.draft.conditions.filter(
        (condition) => condition.path.trim() || condition.value.trim()
      ),
      customMessagesEnabled: Object.values(editor.draft.clientMessages).some(
        (message) => message.trim()
      ),
      adminNote:
        editor.draft.source === 'CUSTOM' && !editor.draft.executionDisposition
          ? ''
          : editor.draft.adminNote,
    }
    if (editor.index === null) fields.append(saved)
    else form.setValue(`rules.${editor.index}`, saved, { shouldDirty: true })
    finishEditing()
    toast.success(t('Saved. It takes effect after publishing.'))
  }

  const ordered = watchedRules
    .map((rule, index) => ({ rule, index }))
    .sort((left, right) => {
      const priority =
        errorRulePriority(left.rule) - errorRulePriority(right.rule)
      if (priority) return priority
      if (errorRulePriority(left.rule) === 2) {
        return Number(left.rule.httpStatus) - Number(right.rule.httpStatus)
      }
      return left.index - right.index
    })
  const customRows = ordered.filter(({ rule }) => rule.source === 'CUSTOM')
  const systemRows = ordered.filter(({ rule }) => rule.source !== 'CUSTOM')
  const changedSystemRows = systemRows.filter(
    ({ rule }) =>
      draftRulesById.get(rule.id)?.source === 'OVERRIDE' ||
      ruleIsUnpublished(rule.id)
  )
  const shownSystemRows = showSystem ? systemRows : changedSystemRows
  const conditionalStatuses = new Set(
    watchedRules
      .filter(
        (rule) =>
          rule.enabled &&
          rule.httpStatus !== '' &&
          rule.conditions.some((condition) => condition.path.trim())
      )
      .map((rule) => Number(rule.httpStatus))
  )
  const renderRow = ({
    rule,
    index,
  }: {
    rule: ErrorRuleDraft
    index: number
  }) => {
    const facts = formRuleMatchFacts(rule)
    const outcome = errorRuleOutcome(rule)
    const hasCustomMessage = Object.values(rule.clientMessages).some(
      (message) => message.trim()
    )
    const isOverride = draftRulesById.get(rule.id)?.source === 'OVERRIDE'
    return (
      <div
        key={fields.fields[index]?.id ?? rule.id}
        role='group'
        aria-label={formatErrorRuleMatch(facts, t) || t('New custom mapping')}
        className={`bg-card grid items-center gap-3 rounded-lg border p-3 text-sm md:grid-cols-[4rem_minmax(12rem,1.4fr)_minmax(12rem,1fr)_auto] ${rule.enabled ? '' : 'opacity-60'}`}
      >
        <span className='flex items-center gap-2'>
          {ruleIsUnpublished(rule.id) ? (
            <span
              className='bg-primary size-2 shrink-0 rounded-full'
              role='img'
              aria-label={t('Unpublished')}
              title={t('Unpublished')}
            />
          ) : null}
          <Switch
            checked={rule.enabled}
            aria-label={t('Enabled')}
            onCheckedChange={(checked) =>
              form.setValue(`rules.${index}.enabled`, checked, {
                shouldDirty: true,
              })
            }
          />
        </span>
        <div className='min-w-0'>
          <div className='font-mono text-xs [overflow-wrap:anywhere]'>
            {formatErrorRuleMatch(facts, t) || '—'}
          </div>
          {rule.source !== 'CUSTOM' &&
          facts.httpStatus !== null &&
          conditionalStatuses.has(facts.httpStatus) ? (
            <p className='text-muted-foreground text-xs'>
              {t('Conditional HTTP {{status}} mappings take priority', {
                status: facts.httpStatus,
              })}
            </p>
          ) : null}
          {rule.source === 'CUSTOM' &&
          facts.httpStatus !== null &&
          facts.conditions.length > 0 ? (
            <p className='text-muted-foreground text-xs'>
              {t('Takes priority over system HTTP {{status}}', {
                status: facts.httpStatus,
              })}
            </p>
          ) : null}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant={outcomeBadgeVariants[outcome]}>
            {t(errorRuleOutcomeLabelKeys[outcome])}
          </Badge>
          <span className='text-muted-foreground text-xs'>
            {t(categoryDescriptionKeys[rule.category])}
            {hasCustomMessage ? ` · ${t('Custom message')}` : ''}
          </span>
        </div>
        <div className='flex justify-end gap-1'>
          <Button
            type='button'
            size='sm'
            variant='ghost'
            onClick={() => openEditor(index)}
          >
            {t('Edit')}
          </Button>
          {rule.source === 'CUSTOM' ? (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              className='text-destructive'
              onClick={() => {
                fields.remove(index)
                toast.success(t('Deleted. It takes effect after publishing.'))
              }}
            >
              {t('Delete')}
            </Button>
          ) : null}
          {rule.source !== 'CUSTOM' && isOverride ? (
            <Button
              type='button'
              size='sm'
              variant='ghost'
              onClick={() => restoreSystemDefault(index)}
            >
              {t('Restore')}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  const matchedDraft = preview.data
    ? watchedRules.find((rule) => rule.id === preview.data.match.ruleId)
    : undefined
  const matchedFacts = matchedDraft ? formRuleMatchFacts(matchedDraft) : null
  const previewFailed =
    preview.data?.match.executionDisposition === 'CONFIRMED_FAILED'
  let previewReason = t('Set by this mapping')
  const previewStatusCode = preview.data?.facts.httpStatus
  if (preview.data?.match.executionDispositionSource === 'SYSTEM') {
    if (!previewFailed) {
      previewReason = t('System rule: no clear failure evidence')
    } else if (previewStatusCode !== undefined && previewStatusCode >= 400) {
      previewReason = t(
        'System rule: a 4xx response means the provider rejected the request'
      )
    } else {
      previewReason = t(
        'System rule: the provider reported that the task failed'
      )
    }
  }
  const releaseAt = formatCanvasDateTime(
    new Date(Date.now() + props.releaseWaitMs).toISOString(),
    i18n.language
  )

  const draft = editor?.draft
  const draftOutcome = draft?.executionDisposition ?? ''
  return (
    <form
      aria-label={t('Error mappings')}
      className='space-y-4'
      onSubmit={review}
    >
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='max-w-2xl'>
          <h3 className='font-semibold'>{t('Provider error mappings')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t(
              'More specific conditions match first, and matching stops at the first hit. All conditions must be met; add another mapping for alternatives. If unsure, start from an example in “Add mapping”.'
            )}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            aria-expanded={testOpen}
            onClick={() => setTestOpen((open) => !open)}
          >
            {t(testOpen ? 'Hide test' : 'Test error mappings')}
          </Button>
          <Button type='button' onClick={() => openEditor(null)}>
            {t('Add mapping')}
          </Button>
        </div>
      </div>
      <div className='space-y-1'>
        <Controller
          control={form.control}
          name='showSafeErrorDetailsToCustomer'
          render={({ field }) => (
            <label className='flex items-center gap-2 text-sm font-medium'>
              <Checkbox
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              {t('Show the upstream reason to customers')}
            </label>
          )}
        />
        <p className='text-muted-foreground ml-6 text-xs'>
          {t(
            'When enabled, failures the customer can act on (an HTTP 400/422 rejection or a failed task) show the provider’s own reason under the customer message, in its original language with links and request IDs removed. A mapping can hide it for its matches. Preview it in “Test error mappings”.'
          )}
        </p>
      </div>
      {testOpen ? (
        <div className='space-y-3 rounded-lg border p-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-muted-foreground text-xs'>
              {t('Use a sample response:')}
            </span>
            {errorPreviewSamples.map((sample) => (
              <Button
                key={sample.label}
                type='button'
                size='sm'
                variant='outline'
                onClick={() => {
                  const json = JSON.stringify(sample.response)
                  setPreviewStatus(sample.status)
                  setPreviewJson(json)
                  runPreview(sample.status, json)
                }}
              >
                {t(sample.label)}
              </Button>
            ))}
          </div>
          <div className='grid gap-2 md:grid-cols-[8rem_minmax(0,1fr)_auto]'>
            <Input
              aria-label={t('Upstream HTTP status')}
              inputMode='numeric'
              placeholder={t('Status code')}
              value={previewStatus}
              onChange={(event) => setPreviewStatus(event.target.value.trim())}
            />
            <Input
              className='font-mono'
              aria-label={t('Upstream response JSON')}
              placeholder='{ "error": { "code": "server_error" } }'
              value={previewJson}
              onChange={(event) => setPreviewJson(event.target.value)}
            />
            <Button
              type='button'
              variant='outline'
              disabled={preview.isPending}
              onClick={() => runPreview(previewStatus, previewJson)}
            >
              {t('Test')}
            </Button>
          </div>
          {previewIsSuccessStatus ? (
            <div className='flex flex-wrap items-center gap-2'>
              <Label htmlFor='error-preview-response-kind' className='text-xs'>
                {t('This 2xx response is')}
              </Label>
              <NativeSelect
                id='error-preview-response-kind'
                value={previewResponseKind}
                onChange={(event) =>
                  setPreviewResponseKind(
                    event.target.value as 'FAILED_TASK' | 'SCHEMA_MISMATCH'
                  )
                }
              >
                <NativeSelectOption value='FAILED_TASK'>
                  {t('A task the provider reported failed')}
                </NativeSelectOption>
                <NativeSelectOption value='SCHEMA_MISMATCH'>
                  {t('A response that does not match the interface contract')}
                </NativeSelectOption>
              </NativeSelect>
            </div>
          ) : null}
          {previewError ? fieldError(previewError) : null}
          {preview.data ? (
            <div className='space-y-3'>
              {previewFingerprint !== currentPreviewFingerprint ? (
                <p className='text-muted-foreground text-xs' role='status'>
                  {t(
                    'Mappings changed; the result may be out of date. Test again.'
                  )}
                </p>
              ) : null}
              <div className='grid gap-4 lg:grid-cols-2'>
                <section className='space-y-2 rounded-lg border p-3'>
                  <h4 className='text-sm font-semibold'>
                    {t('We see · Administrator task call record')}
                  </h4>
                  <dl className='grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm'>
                    <dt className='text-muted-foreground'>
                      {t('Matched mapping')}
                    </dt>
                    <dd>
                      <span className='font-mono text-xs'>
                        {matchedFacts
                          ? formatErrorRuleMatch(matchedFacts, t)
                          : t('None (fallback: unknown provider error)')}
                      </span>
                      {matchedFacts &&
                      matchedFacts.httpStatus !== null &&
                      matchedFacts.conditions.length > 0 &&
                      watchedRules.some(
                        (rule) =>
                          rule.enabled &&
                          rule.httpStatus === matchedFacts.httpStatus &&
                          !rule.conditions.some((condition) =>
                            condition.path.trim()
                          )
                      ) ? (
                        <p className='text-muted-foreground text-xs'>
                          {t('Takes priority over system HTTP {{status}}', {
                            status: matchedFacts.httpStatus,
                          })}
                        </p>
                      ) : null}
                    </dd>
                    <dt className='text-muted-foreground'>
                      {t('Task result')}
                    </dt>
                    <dd>
                      <Badge
                        variant={previewFailed ? 'destructive' : 'secondary'}
                      >
                        {t(
                          previewFailed
                            ? 'Confirmed failed'
                            : 'Result pending confirmation'
                        )}
                      </Badge>
                      <p className='text-muted-foreground text-xs'>
                        {previewReason}
                      </p>
                    </dd>
                    <dt className='text-muted-foreground'>{t('Points')}</dt>
                    <dd>
                      {previewFailed ? (
                        t('Released immediately')
                      ) : (
                        <>
                          {t('Frozen; released automatically by {{time}}', {
                            time: releaseAt,
                          })}
                          <p className='text-muted-foreground text-xs'>
                            {t('Calculated without an upstream task ID')}
                          </p>
                        </>
                      )}
                    </dd>
                    <dt className='text-muted-foreground'>
                      {t('Canvas error code')}
                    </dt>
                    <dd className='font-mono text-xs'>
                      {preview.data.canvasErrorCode ? (
                        <>
                          {preview.data.canvasErrorCode}{' '}
                          <span className='text-muted-foreground font-sans'>
                            {t(
                              '(the response does not match the interface contract)'
                            )}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </dd>
                    <dt className='text-muted-foreground'>
                      {t('Upstream error code')}
                    </dt>
                    <dd className='font-mono text-xs'>
                      {preview.data.upstreamErrorCode ?? '—'}
                    </dd>
                    <dt className='text-muted-foreground'>
                      {t('Error category')}
                    </dt>
                    <dd>
                      {t(categoryDescriptionKeys[preview.data.errorCategory])}
                    </dd>
                    {preview.data.adminNote &&
                    matchedDraft?.executionDisposition ? (
                      <>
                        <dt className='text-muted-foreground'>
                          {t('Administrator rationale')}
                        </dt>
                        <dd>{preview.data.adminNote}</dd>
                      </>
                    ) : null}
                    <dt className='text-muted-foreground'>
                      {t('Sanitized upstream response')}
                    </dt>
                    <dd>
                      <pre className='bg-muted max-h-60 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap'>
                        {JSON.stringify(
                          preview.data.sanitizedResponse,
                          null,
                          2
                        )}
                      </pre>
                    </dd>
                  </dl>
                </section>
                <section className='space-y-3 rounded-lg border p-3'>
                  <h4 className='text-sm font-semibold'>
                    {t('Customer sees · Canvas node and “Task information”')}
                  </h4>
                  <div className='flex flex-wrap items-center justify-between gap-2'>
                    <span
                      className={
                        previewFailed
                          ? 'text-destructive text-sm font-medium'
                          : 'text-muted-foreground text-sm font-medium'
                      }
                    >
                      {t(
                        previewFailed
                          ? 'Customer task view failed points released'
                          : 'Customer task view verifying'
                      )}
                    </span>
                    <span className='text-muted-foreground rounded-md border px-2 py-0.5 text-xs'>
                      {t('Customer task view task information')}
                    </span>
                  </div>
                  <dl className='space-y-3 rounded-md border p-3 text-sm shadow-sm'>
                    <div className='font-medium'>
                      {t('Customer task view task information')}
                    </div>
                    {previewFailed ? null : (
                      <div>
                        <dt className='text-muted-foreground'>
                          {t('Customer task view deadline')}
                        </dt>
                        <dd>{releaseAt}</dd>
                        <dd className='text-muted-foreground text-xs'>
                          {t('Customer task view release notice')}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className='text-muted-foreground'>
                        {t('Customer task view points')}
                      </dt>
                      <dd>
                        {t(
                          previewFailed
                            ? 'Customer task view points released'
                            : 'Customer task view points frozen'
                        )}
                      </dd>
                    </div>
                    {previewFailed ? (
                      <div>
                        <dt className='text-muted-foreground'>
                          {t('Customer task view error')}
                        </dt>
                        <dd>{preview.data.customerView.message}</dd>
                        {preview.data.customerView.upstreamReason ? (
                          <dd className='text-muted-foreground text-xs [overflow-wrap:anywhere]'>
                            {t('Customer task view upstream reason', {
                              reason: preview.data.customerView.upstreamReason,
                            })}
                          </dd>
                        ) : null}
                      </div>
                    ) : null}
                  </dl>
                </section>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className='space-y-2'>
        <div className='text-muted-foreground hidden gap-3 px-3 text-xs font-medium md:grid md:grid-cols-[4rem_minmax(12rem,1.4fr)_minmax(12rem,1fr)_auto]'>
          <span>{t('Enabled')}</span>
          <span>{t('When upstream returns')}</span>
          <span>{t('Handle this way')}</span>
          <span />
        </div>
        {customRows.length ? (
          customRows.map(renderRow)
        ) : (
          <p className='text-muted-foreground rounded-lg border p-3 text-sm'>
            {t('No custom mappings yet.')}
          </p>
        )}
        {shownSystemRows.map(renderRow)}
        <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3 text-xs'>
          <span className='text-muted-foreground'>
            {t('System defaults handle HTTP {{statuses}}', {
              statuses: systemRows
                .map(({ rule }) => rule.httpStatus)
                .filter((status) => status !== '')
                .join(', '),
            })}
            {!showSystem && changedSystemRows.length
              ? ` ${t('({{count}} modified shown above)', {
                  count: changedSystemRows.length,
                })}`
              : ''}
          </span>
          <Button
            type='button'
            size='sm'
            variant='link'
            aria-expanded={showSystem}
            onClick={() => setShowSystem((open) => !open)}
          >
            {t(showSystem ? 'Hide' : 'View / modify')}
          </Button>
        </div>
      </div>
      {Object.keys(form.formState.errors).length > 0 &&
        fieldError(t('Fix the highlighted rule fields'))}
      {unpublishedCount > 0 ? (
        <div className='flex flex-wrap items-center justify-end gap-2 border-t pt-4'>
          <span className='text-muted-foreground mr-auto text-sm' role='status'>
            {t('{{count}} unpublished changes', { count: unpublishedCount })}
          </span>
          <Button
            type='button'
            variant='outline'
            disabled={props.pending}
            onClick={() => form.reset()}
          >
            {t('Discard')}
          </Button>
          <Button type='submit' disabled={props.pending}>
            {t('Publish')}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor()
        }}
      >
        {editor && draft ? (
          <DialogContent className='max-h-[90vh] gap-0 overflow-y-auto sm:max-w-2xl'>
            <DialogHeader className='pb-4'>
              <DialogTitle>
                {t(editor.index === null ? 'Add mapping' : 'Edit mapping')}
              </DialogTitle>
            </DialogHeader>
            {editor.index === null ? (
              <section className='space-y-3 pb-5'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-muted-foreground text-sm'>
                    {t('Start from an example:')}
                  </span>
                  {(['MISSING_TASK_ID', 'SERVER_ERROR_502'] as const).map(
                    (kind) => (
                      <Button
                        key={kind}
                        type='button'
                        size='sm'
                        variant={
                          editor.example === kind ? 'secondary' : 'outline'
                        }
                        aria-pressed={editor.example === kind}
                        onClick={() =>
                          updateDraft(
                            { ...errorRuleExample(kind), id: draft.id },
                            kind
                          )
                        }
                      >
                        {t(errorRuleExampleLabels[kind])}
                      </Button>
                    )
                  )}
                </div>
                {editor.example ? (
                  <dl className='bg-muted/40 grid gap-2.5 rounded-lg px-4 py-3 text-sm'>
                    {(
                      [
                        ['What happened', 'situation'],
                        ['How to configure', 'change'],
                        ['Caution', 'caution'],
                      ] as const
                    ).map(([label, key]) => (
                      <div key={key} className='space-y-0.5'>
                        <dt className='text-muted-foreground text-xs'>
                          {t(label)}
                        </dt>
                        <dd>
                          {editor.example
                            ? t(errorRuleExampleGuidance[editor.example][key])
                            : null}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </section>
            ) : null}
            <section className='space-y-4 border-t py-5'>
              <h4 className='text-sm font-semibold'>
                {t('When upstream returns')}
              </h4>
              {draft.source !== 'CUSTOM' ? (
                <div className='space-y-1 text-sm'>
                  <p className='font-mono'>HTTP {draft.httpStatus}</p>
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'System mapping conditions cannot be changed. To narrow it down, add an “HTTP {{status}} + response content” mapping.',
                      { status: draft.httpStatus }
                    )}
                  </p>
                </div>
              ) : (
                <>
                  <div className='space-y-1.5'>
                    <div className='flex flex-wrap items-baseline gap-x-2'>
                      <Label htmlFor='error-editor-status'>
                        {t('HTTP status')}
                      </Label>
                      <span className='text-muted-foreground text-xs'>
                        {t('Optional; leave blank for any status')}
                      </span>
                    </div>
                    <Input
                      id='error-editor-status'
                      className='w-32'
                      inputMode='numeric'
                      value={
                        draft.httpStatus === '' ? '' : String(draft.httpStatus)
                      }
                      aria-invalid={Boolean(showIssue('httpStatus'))}
                      onChange={(event) => {
                        const value = event.target.value.trim()
                        const status = /^\d+$/.test(value) ? Number(value) : ''
                        updateDraft({
                          ...draft,
                          httpStatus: value === '' ? '' : status,
                          ruleType: value === '' ? 'JSON' : 'HTTP_STATUS',
                        })
                      }}
                    />
                    {issueText('httpStatus')}
                  </div>
                  <div className='space-y-1.5'>
                    <div className='flex flex-wrap items-baseline gap-x-2'>
                      <span className='text-sm font-medium'>
                        {t('Response content')}
                      </span>
                      <span className='text-muted-foreground text-xs'>
                        {t('Optional; every condition must match')}
                      </span>
                    </div>
                    <div className='space-y-2'>
                      {draft.conditions.map((condition, conditionIndex) => {
                        const setCondition = (
                          patch: Partial<ErrorRuleDraft['conditions'][number]>
                        ) =>
                          updateDraft({
                            ...draft,
                            conditions: draft.conditions.map(
                              (item, itemIndex) =>
                                itemIndex === conditionIndex
                                  ? { ...item, ...patch }
                                  : item
                            ),
                          })
                        const pathIssue = showIssue(
                          `conditions.${conditionIndex}.path`
                        )
                        const valueIssue = showIssue(
                          `conditions.${conditionIndex}.value`
                        )
                        return (
                          <div
                            key={condition.clientKey}
                            className='flex items-start gap-2'
                          >
                            <div className='min-w-0 flex-1 space-y-1'>
                              <Input
                                className='font-mono'
                                aria-label={t('JSON field path')}
                                placeholder='error.code'
                                value={condition.path}
                                aria-invalid={Boolean(pathIssue)}
                                onChange={(event) =>
                                  setCondition({ path: event.target.value })
                                }
                              />
                              {pathIssue ? fieldError(t(pathIssue)) : null}
                            </div>
                            <NativeSelect
                              className='w-24 shrink-0'
                              aria-label={t('Match method')}
                              value={condition.operator}
                              onChange={(event) =>
                                setCondition({
                                  operator: event.target.value as
                                    | 'EQUALS'
                                    | 'CONTAINS',
                                })
                              }
                            >
                              <NativeSelectOption value='EQUALS'>
                                {t('Equals')}
                              </NativeSelectOption>
                              <NativeSelectOption value='CONTAINS'>
                                {t('Contains')}
                              </NativeSelectOption>
                            </NativeSelect>
                            <div className='min-w-0 flex-1 space-y-1'>
                              <Input
                                className='font-mono'
                                aria-label={t('Match value')}
                                placeholder='server_error'
                                value={condition.value}
                                aria-invalid={Boolean(valueIssue)}
                                onChange={(event) =>
                                  setCondition({
                                    value: event.target.value,
                                    valueType: inferConditionValueType(
                                      event.target.value
                                    ),
                                  })
                                }
                              />
                              {valueIssue ? fieldError(t(valueIssue)) : null}
                            </div>
                            <Button
                              type='button'
                              size='icon'
                              variant='ghost'
                              className='text-muted-foreground shrink-0'
                              aria-label={t('Remove condition')}
                              onClick={() =>
                                updateDraft({
                                  ...draft,
                                  conditions: draft.conditions.filter(
                                    (_, itemIndex) =>
                                      itemIndex !== conditionIndex
                                  ),
                                })
                              }
                            >
                              ✕
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                    <Button
                      type='button'
                      size='sm'
                      variant='link'
                      className='h-auto px-0'
                      onClick={() =>
                        updateDraft({
                          ...draft,
                          conditions: [
                            ...draft.conditions,
                            emptyErrorCondition(),
                          ],
                        })
                      }
                    >
                      {t('Add condition')}
                    </Button>
                  </div>
                  {showIssue('when') ? (
                    <p
                      className='border-destructive/35 text-destructive rounded-md border p-2 text-sm'
                      role='alert'
                    >
                      {t(showIssue('when') ?? '')}
                    </p>
                  ) : null}
                </>
              )}
            </section>
            <section className='space-y-4 border-t py-5'>
              <h4 className='text-sm font-semibold'>{t('Handle this way')}</h4>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-1.5'>
                  <Label htmlFor='error-editor-outcome'>
                    {t('Task result')}
                  </Label>
                  <NativeSelect
                    id='error-editor-outcome'
                    className='w-full'
                    value={draftOutcome}
                    onChange={(event) =>
                      updateDraft({
                        ...draft,
                        executionDisposition: event.target
                          .value as ErrorRuleDraft['executionDisposition'],
                      })
                    }
                  >
                    <NativeSelectOption value=''>
                      {t('Use system judgement')}
                    </NativeSelectOption>
                    <NativeSelectOption value='CONFIRMED_FAILED'>
                      {t('Mark failed and release points')}
                    </NativeSelectOption>
                    <NativeSelectOption value='UNKNOWN'>
                      {t('Keep pending confirmation')}
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='error-editor-category'>
                    {t('Error category')}
                  </Label>
                  <NativeSelect
                    id='error-editor-category'
                    className='w-full'
                    value={draft.category}
                    onChange={(event) =>
                      updateDraft({
                        ...draft,
                        category: event.target.value as ErrorCategory,
                      })
                    }
                  >
                    {categories.map((category) => (
                      <NativeSelectOption key={category} value={category}>
                        {systemDefaultStatusByCategory[category] === undefined
                          ? t(categoryDescriptionKeys[category])
                          : `${t(categoryDescriptionKeys[category])} (${systemDefaultStatusByCategory[category]})`}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <div className='space-y-2'>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    '“Task result” decides whether a matched task fails or keeps waiting and when points are released; it does not change the customer message. Effect of the current option:'
                  )}
                </p>
                <dl className='bg-muted/40 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-lg px-4 py-3 text-xs'>
                  {errorDispositionExplanation(draftOutcome, t).map(
                    ([label, value]) => (
                      <Fragment key={label}>
                        <dt className='text-muted-foreground'>{label}</dt>
                        <dd>{value}</dd>
                      </Fragment>
                    )
                  )}
                </dl>
              </div>
              {draftOutcome === 'CONFIRMED_FAILED' &&
              draft.source !== 'CUSTOM' ? (
                <p
                  className='border-destructive/35 text-destructive rounded-md border p-2 text-sm'
                  role='alert'
                >
                  {t(
                    'This marks every HTTP {{status}} response as failed. Prefer adding a mapping with response-content conditions that only catches confirmed rejections.',
                    { status: draft.httpStatus }
                  )}
                </p>
              ) : null}
              {draftOutcome === 'CONFIRMED_FAILED' &&
              draft.source === 'CUSTOM' &&
              draft.httpStatus === '' ? (
                <p
                  className='border-destructive/35 text-destructive rounded-md border p-2 text-sm'
                  role='alert'
                >
                  {t(
                    'Every matching response, including HTTP 200, will be marked failed and its frozen points released.'
                  )}
                </p>
              ) : null}
              {draftOutcome ? (
                <div className='space-y-1.5'>
                  <div className='flex flex-wrap items-baseline gap-x-2'>
                    <Label htmlFor='error-editor-rationale'>
                      {t('Rationale')}
                    </Label>
                    <span className='text-muted-foreground text-xs'>
                      {t(
                        'Optional; visible only to administrators and audit records'
                      )}
                    </span>
                  </div>
                  <Textarea
                    id='error-editor-rationale'
                    rows={3}
                    placeholder={t(
                      'For example: a provider ticket confirmed that 502 + server_error means the request was not queued'
                    )}
                    value={draft.adminNote}
                    aria-invalid={Boolean(showIssue('adminNote'))}
                    onChange={(event) =>
                      updateDraft({ ...draft, adminNote: event.target.value })
                    }
                  />
                  {issueText('adminNote')}
                </div>
              ) : null}
              <div className='space-y-1.5'>
                <div className='flex flex-wrap items-baseline gap-x-2'>
                  <Label htmlFor='error-editor-message'>
                    {t('Customer message')}
                  </Label>
                  <span className='text-muted-foreground text-xs'>
                    {t('Optional; leave blank to use the default')}
                  </span>
                </div>
                <Input
                  id='error-editor-message'
                  placeholder={t(defaultCustomerMessageKeys[draft.category])}
                  value={draft.clientMessages[currentLocale] ?? ''}
                  onChange={(event) =>
                    updateDraft({
                      ...draft,
                      clientMessages: {
                        ...draft.clientMessages,
                        [currentLocale]: event.target.value,
                      },
                    })
                  }
                />
                {issueText('clientMessages')}
              </div>
              <div className='space-y-1'>
                <label className='flex items-center gap-2 text-sm font-medium'>
                  <Checkbox
                    checked={draft.hideUpstreamReason}
                    onCheckedChange={(checked) =>
                      updateDraft({
                        ...draft,
                        hideUpstreamReason: checked === true,
                      })
                    }
                  />
                  {t('Hide the upstream reason from customers')}
                </label>
                <p className='text-muted-foreground ml-6 text-xs'>
                  {t(
                    'Use it when the provider’s wording is not suitable for customers, for example when it names a supplier; customers then only see the message above.'
                  )}
                </p>
              </div>
            </section>
            <section className='space-y-3 border-t py-5'>
              <Button
                type='button'
                size='sm'
                variant='link'
                className='h-auto px-0'
                aria-expanded={editor.showJson}
                onClick={() =>
                  setEditor({
                    ...editor,
                    showJson: !editor.showJson,
                    jsonText: editableRuleJson(draft),
                    jsonError: '',
                    jsonIssues: new Map(),
                  })
                }
              >
                {t(editor.showJson ? 'Hide JSON' : '{ } View / edit JSON')}
              </Button>
              {editor.showJson ? (
                <div className='space-y-3'>
                  <p className='text-muted-foreground text-xs'>
                    {t(
                      'This is the rule submitted to Canvas Cloud after saving, kept in sync with the form. See “Field descriptions” for each field; invalid content is not applied.'
                    )}
                  </p>
                  <dl className='grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs'>
                    <dt className='text-muted-foreground'>{t('Rule ID')}</dt>
                    <dd className='font-mono'>
                      {draft.id}{' '}
                      <span className='text-muted-foreground font-sans'>
                        ·{' '}
                        {t(
                          editor.index === null
                            ? 'Generated by the system'
                            : 'Cannot be changed after publishing'
                        )}
                      </span>
                    </dd>
                    <dt className='text-muted-foreground'>{t('Source')}</dt>
                    <dd className='font-mono'>
                      {normalizeErrorDraft([draft], props.rules)[0]?.source}{' '}
                      <span className='text-muted-foreground font-sans'>
                        ·{' '}
                        {t(
                          'Set automatically by whether it is custom or a changed system mapping'
                        )}
                      </span>
                    </dd>
                  </dl>
                  <Textarea
                    aria-label={t('Error mapping JSON')}
                    className='font-mono text-xs'
                    rows={16}
                    spellCheck={false}
                    value={editor.jsonText}
                    aria-invalid={Boolean(editor.jsonError)}
                    onChange={(event) => {
                      const text = event.target.value
                      const parsed = ruleDraftFromJson(text, draft, t)
                      if (!('draft' in parsed)) {
                        setEditor({
                          ...editor,
                          jsonText: text,
                          jsonError: parsed.error,
                          jsonIssues: new Map(),
                        })
                        return
                      }
                      // Business-rule failures stay in the JSON editor and are not written back.
                      const issues = errorRuleDraftIssues(
                        parsed.draft,
                        otherRules,
                        watchedShowSafeDetails
                      )
                      setEditor({
                        ...editor,
                        jsonText: text,
                        jsonError: '',
                        jsonIssues: issues,
                        ...(issues.size ? {} : { draft: parsed.draft }),
                      })
                    }}
                  />
                  <JsonValidationStatus
                    jsonError={editor.jsonError}
                    issues={
                      editor.jsonIssues.size ? editor.jsonIssues : editorIssues
                    }
                  />
                  <details open>
                    <summary className='cursor-pointer text-xs font-medium'>
                      {t('Field descriptions')}
                      {draft.source !== 'CUSTOM'
                        ? ` ${t('(system mapping: locked fields cannot be changed)')}`
                        : ''}
                    </summary>
                    <div className='text-muted-foreground mt-2 hidden grid-cols-[minmax(9rem,auto)_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-2 text-xs font-medium sm:grid'>
                      <span>{t('Field')}</span>
                      <span>{t('Meaning')}</span>
                      <span>{t('Allowed values')}</span>
                    </div>
                    <dl className='text-xs'>
                      {errorRuleJsonFieldReference.map(
                        ([field, meaning, values]) => {
                          const locked =
                            draft.source !== 'CUSTOM' &&
                            lockedSystemRuleFields.has(field)
                          return (
                            <div
                              key={field}
                              className={`grid gap-1 border-t p-2 sm:grid-cols-[minmax(9rem,auto)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3 ${locked ? 'opacity-60' : ''}`}
                            >
                              <dt
                                className={`font-mono ${field.includes('[]') ? 'sm:pl-4' : ''}`}
                              >
                                {field}
                                {locked ? ' 🔒' : ''}
                              </dt>
                              <dd>{t(meaning)}</dd>
                              <dd className='text-muted-foreground'>
                                {t(values)}
                              </dd>
                            </div>
                          )
                        }
                      )}
                    </dl>
                  </details>
                </div>
              ) : null}
            </section>
            <div className='flex justify-end gap-2 border-t pt-4'>
              <Button
                type='button'
                variant='outline'
                onClick={() => closeEditor()}
              >
                {t('Cancel')}
              </Button>
              <Button type='button' onClick={saveEditor}>
                {t('Save')}
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Discard unsaved changes?')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Keep editing')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => closeEditor(true)}
            >
              {t('Discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

function editableRuleJson(rule: ErrorForm['rules'][number]): string {
  return JSON.stringify(
    {
      enabled: rule.enabled,
      ruleType: rule.httpStatus === '' ? 'JSON' : 'HTTP_STATUS',
      httpStatus: rule.httpStatus === '' ? null : rule.httpStatus,
      conditions: rule.conditions
        .filter((condition) => condition.path.trim())
        .map((condition) => ({
          path: condition.path,
          operator: condition.operator,
          valueType: condition.valueType,
          value: normalizeErrorConditionValue(
            condition.valueType,
            condition.value
          ),
        })),
      category: rule.category,
      clientMessages: Object.fromEntries(
        Object.entries(rule.clientMessages).filter(([, value]) => value.trim())
      ),
      adminNote: rule.adminNote,
      ...(rule.executionDisposition
        ? { executionDisposition: rule.executionDisposition }
        : {}),
      ...(rule.hideUpstreamReason ? { hideUpstreamReason: true } : {}),
    },
    null,
    2
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

function normalizeErrorConditionValue(
  valueType: ErrorConditionValueType,
  value: string
): string | number | boolean | null {
  if (valueType === 'NULL') return null
  if (valueType === 'NUMBER') return Number(value)
  if (valueType === 'BOOLEAN') return value === 'true'
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value) as unknown
      if (typeof parsed === 'string') return parsed
    } catch {
      return value
    }
  }
  return value
}

function inferConditionValueType(value: string): ErrorConditionValueType {
  if (value.startsWith('"') && value.endsWith('"')) return 'STRING'
  if (value === 'true' || value === 'false') return 'BOOLEAN'
  if (value === 'null') return 'NULL'
  if (value.trim() !== '' && Number.isFinite(Number(value))) return 'NUMBER'
  return 'STRING'
}

function conditionValueForEditor(
  valueType: ErrorConditionValueType,
  value: string | number | boolean | null
): string {
  if (valueType === 'NULL') return 'null'
  const text = String(value)
  if (valueType !== 'STRING') return text
  return inferConditionValueType(text) === 'STRING'
    ? text
    : JSON.stringify(text)
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

function errorDispositionExplanation(
  disposition: ErrorForm['rules'][number]['executionDisposition'],
  t: (key: string) => string
): Array<[string, string]> {
  const rows = (values: [string, string, string, string, string]) =>
    (
      [
        'Task status',
        'Points',
        'Customer sees',
        'Afterwards',
        'Best for',
      ] as const
    ).map((label, index): [string, string] => [
      t(label),
      t(values[index] ?? ''),
    ])
  if (disposition === 'CONFIRMED_FAILED') {
    return rows([
      'Confirmed failed (final)',
      'Released in full immediately',
      '“Cloud generation failed. Points released”',
      'Stops querying and never resubmits. If the provider later succeeds, the platform bears the cost and the customer is not charged.',
      'The provider contract or a support ticket confirms this response means the request was never accepted',
    ])
  }
  if (disposition === 'UNKNOWN') {
    return rows([
      'Result pending confirmation',
      'Stay frozen: without an upstream task ID they are released after the unknown-result release wait; with one, the system keeps querying and releases by the execution deadline at the latest',
      '“Confirming cloud result” with the result confirmation deadline',
      'Never resubmits; keeps querying when there is an upstream task ID',
      'Responses the system would mark failed (such as some 4xx) although the provider may have accepted them, for example a 409 duplicate submission',
    ])
  }
  return rows([
    '4xx is confirmed failed; 5xx, timeouts, and response structure errors are pending confirmation',
    'Follows the task result: released immediately on failure, frozen until the deadline while pending',
    'Follows the task result',
    'Exactly as without a mapping',
    'The default. Use it when you only want to change the error category or customer message',
  ])
}

function normalizeErrorDraft(
  rules: ErrorForm['rules'],
  originals: ErrorRule[]
): ErrorRule[] {
  const originalById = new Map(originals.map((rule) => [rule.id, rule]))
  return rules
    .map((rule, originalIndex) => {
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
        ruleType: rule.httpStatus === '' ? 'JSON' : 'HTTP_STATUS',
        httpStatus: rule.httpStatus === '' ? null : Number(rule.httpStatus),
        conditions: rule.conditions
          .filter((condition) => condition.path.trim() !== '')
          .map((condition) => ({
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
        ...(rule.executionDisposition
          ? { executionDisposition: rule.executionDisposition }
          : {}),
        ...(rule.hideUpstreamReason ? { hideUpstreamReason: true } : {}),
        source: rule.source,
      }
      if (rule.source !== 'SYSTEM') {
        return { ...normalized, __originalIndex: originalIndex }
      }
      const original = originalById.get(rule.id)
      // A system rule restored from an override is compared with the system default.
      const baseline =
        original?.source === 'SYSTEM'
          ? original
          : {
              enabled: true,
              category:
                (rule.httpStatus !== '' &&
                  systemDefaultCategoryByStatus.get(Number(rule.httpStatus))) ||
                rule.category,
              adminNote: '',
              executionDisposition: undefined,
              hideUpstreamReason: undefined,
            }
      const changed =
        rule.enabled !== baseline.enabled ||
        rule.category !== baseline.category ||
        rule.adminNote !== baseline.adminNote ||
        rule.executionDisposition !== (baseline.executionDisposition ?? '') ||
        rule.hideUpstreamReason !== (baseline.hideUpstreamReason ?? false) ||
        Object.keys(clientMessages).length > 0
      return {
        ...(changed
          ? { ...normalized, source: 'OVERRIDE' as const }
          : normalized),
        __originalIndex: originalIndex,
      }
    })
    .sort((left, right) => {
      const priority = (rule: ErrorRule) => {
        if (rule.httpStatus !== null && rule.conditions.length > 0) return 0
        if (rule.conditions.length > 0) return 1
        return 2
      }
      return (
        priority(left) - priority(right) ||
        left.__originalIndex - right.__originalIndex
      )
    })
    .map(({ __originalIndex: _index, ...rule }) => rule)
}
function humanDuration(
  milliseconds: number,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!Number.isFinite(milliseconds)) return '—'
  if (milliseconds >= 3_600_000) {
    const hours = milliseconds / 3_600_000
    return Number.isInteger(hours)
      ? t('{{value}} hours', { value: hours })
      : t('About {{value}} hours', { value: hours.toFixed(1) })
  }
  if (milliseconds >= 60_000) {
    return t('{{value}} minutes', { value: Math.round(milliseconds / 60_000) })
  }
  return t('{{value}} seconds', { value: milliseconds / 1000 })
}

function stableJson(value: unknown): string {
  const sorted = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(sorted)
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .filter(([, item]) => item !== undefined)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, sorted(item)])
      )
    }
    return entry
  }
  return JSON.stringify(sorted(value))
}

function NumberField(props: {
  id: string
  label: string
  registration: Record<string, unknown>
  error?: string
  help?: string
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <div className='space-y-1'>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        type='number'
        aria-describedby={props.help ? `${props.id}-help` : undefined}
        placeholder={props.placeholder}
        readOnly={props.disabled}
        aria-disabled={props.disabled || undefined}
        className={
          props.disabled
            ? 'bg-muted text-muted-foreground cursor-not-allowed'
            : undefined
        }
        {...props.registration}
      />
      {props.help && (
        <p id={`${props.id}-help`} className='text-muted-foreground text-xs'>
          {props.help}
        </p>
      )}
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

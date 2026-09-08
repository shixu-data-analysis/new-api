/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/

export type ExecutionPolicyKind =
  | 'GLOBAL_LIMITS'
  | 'CHANNEL_POLICY'
  | 'ERROR_MAPPING'
  | 'LIMIT_RULES'
  | 'CREDENTIAL_GROUP_POLICY'
  | 'CREDENTIAL_GROUP_LIMITS'

export type PublishableExecutionPolicyKind =
  | 'GLOBAL_LIMITS'
  | 'ERROR_MAPPING'
  | 'CREDENTIAL_GROUP_POLICY'
  | 'CREDENTIAL_GROUP_LIMITS'

export type ExecutionLocale = 'zhCN' | 'en' | 'fr' | 'ru' | 'ja' | 'vi' | 'zhTW'

export interface GlobalExecutionConfig {
  instanceConcurrency: number
  queryReservedConcurrency: number
  userOutputLimit: number
}

export interface ChannelExecutionConfig {
  requestTimeoutMs: number
  streamIdleTimeoutMs: number
  pollIntervalMs: number
  deadlineMs: number
  requestConcurrency: number
  asyncInFlightLimit: number
}

export type ErrorCategory =
  | 'INVALID_REQUEST'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_BALANCE_INSUFFICIENT'
  | 'PROVIDER_ACCESS_DENIED'
  | 'PROVIDER_ENDPOINT_NOT_FOUND'
  | 'PROVIDER_REQUEST_TIMEOUT'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_INTERNAL_ERROR'
  | 'PROVIDER_BAD_GATEWAY'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_GATEWAY_TIMEOUT'
  | 'PROVIDER_UNKNOWN_ERROR'

export type ErrorRuleType = 'HTTP_STATUS' | 'JSON'
export type ErrorConditionOperator = 'EQUALS' | 'CONTAINS'
export type ErrorConditionValueType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'NULL'

export interface ErrorJsonCondition {
  path: string
  operator: ErrorConditionOperator
  valueType: ErrorConditionValueType
  value: string | number | boolean | null
}

export interface ErrorRule {
  id: string
  version: number
  enabled: boolean
  ruleType: ErrorRuleType
  httpStatus: number | null
  conditions: ErrorJsonCondition[]
  category: ErrorCategory
  clientMessages: Partial<Record<ExecutionLocale, string>>
  adminNote: string
  source: 'SYSTEM' | 'OVERRIDE' | 'CUSTOM'
}

export interface TokenIncludes {
  input: boolean
  output: boolean
  cacheRead: boolean
  cacheWrite: boolean
}

export interface LimitRule {
  id: string
  enabled: boolean
  scope:
    | 'CHANNEL'
    | 'CREDENTIAL_GROUP'
    | 'CREDENTIAL'
    | 'MODEL'
    | 'MODEL_GROUP'
    | 'CREDENTIAL_MODEL'
  credentialGroupId?: string
  modelIds?: string[]
  sharedGroup?: string
  metric: 'CONCURRENCY' | 'RPM' | 'TPM' | 'ASYNC_IN_FLIGHT'
  limit: string
  tokenIncludes?: TokenIncludes
}

export interface PolicyResolution<TConfigured, TEffective> {
  kind: ExecutionPolicyKind
  scopeKey: string
  version: number | null
  configured: TConfigured
  effective: TEffective
  inherited: string[]
}

export type GlobalPolicy = PolicyResolution<
  Partial<GlobalExecutionConfig>,
  GlobalExecutionConfig
>
export type ChannelPolicy = PolicyResolution<
  Partial<ChannelExecutionConfig>,
  ChannelExecutionConfig
>
export type ErrorPolicy = PolicyResolution<
  { rules?: ErrorRule[] },
  { rules: ErrorRule[] }
>
export type LimitPolicy = PolicyResolution<
  { rules?: LimitRule[] },
  { rules: LimitRule[] }
>

export interface ExecutionInstance {
  queueName: string
  mode: string
  workerId: string
  status: string
  credentialsConfigured: boolean
  startedAt: string | null
  heartbeatAt: string | null
  leaseExpiresAt: string | null
  stoppedAt: string | null
  updatedAt: string | null
}

export interface ExecutionOverview {
  global: GlobalPolicy
  credentialGroups: Array<{
    id: string
    name: string
    providerId: string
  }>
  instances: ExecutionInstance[]
  systemRecovery: {
    heartbeatMs: number
    leaseMs: number
    scanMs: number
    defaultInstances: number
  }
}

export interface CredentialGroupExecutionOverview {
  global: GlobalPolicy
  credentialGroupId: string
  providerId: string
  group: ChannelPolicy
  errors: ErrorPolicy
  limits: LimitPolicy
  models: Array<{
    id: string
    publicName: string
    providerChannelId: string
  }>
}

export interface ErrorPreviewResult {
  facts: {
    httpStatus?: number
    upstreamCode?: string
    message?: string
  }
  upstreamRequestId: string | null
  upstreamRequestIdSource: string | null
  upstreamTaskId: string | null
  upstreamTaskIdSource: string | null
  match: {
    ruleId: string
    ruleVersion: number
    category: ErrorCategory
    clientMessage: string
    messageSource: 'CUSTOM' | 'SYSTEM_DEFAULT'
    clientHttpStatus: number
  }
}

export type PublishedExecutionPolicy =
  | GlobalPolicy
  | ChannelPolicy
  | ErrorPolicy
  | LimitPolicy

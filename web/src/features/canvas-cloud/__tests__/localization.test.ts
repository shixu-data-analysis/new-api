/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { canvasBusinessTermConfig } from '../business-terms'

const localizedResources = { fr, ja, ru, vi, 'zh-TW': zhTW, zh }
const unifiedPricingSources = [
  'UnifiedModelPricing.tsx',
  'UnifiedModelPricingHistory.tsx',
  'PricingQuestionnaire.tsx',
]
const unifiedPricingKeys = [
  'Cancel the scheduled customer price before publishing a new change.',
  'Cancel the scheduled provider rate before publishing a new change.',
  'Resolve the limited-price special conflict before publishing.',
  'Resolve the price validation issue before publishing.',
  'Initial',
  'Provider cost and customer price',
  'Customer price retained',
  'Scheduled',
  'Current',
  'Partially current',
  'Superseded',
  'Cancelled',
  'Input tokens',
  'Output tokens',
  'Cache read',
  'Cache write',
  ...new Set(
    unifiedPricingSources.flatMap((file) => {
      const source = readFileSync(
        resolve('src/features/canvas-cloud/components', file),
        'utf8'
      )
      return [...source.matchAll(/\bt\(\s*(['"])(.*?)\1/gs)].map(
        (match) => match[2]
      )
    })
  ),
]
const adminRework004Sources = [
  'AdminPointAdjustments.tsx',
  'AdminCustomerOperations.tsx',
  'CustomerPointHistory.tsx',
  'CustomerPriceAssignment.tsx',
  'CustomerBusinessFacts.tsx',
]
const adminRework004Keys = [
  ...new Set(
    adminRework004Sources.flatMap((file) => {
      const source = readFileSync(
        resolve('src/features/canvas-cloud/components', file),
        'utf8'
      )
      return [...source.matchAll(/\bt\(\s*(['"])(.*?)\1/gs)].map(
        (match) => match[2]
      )
    })
  ),
]
const adminRework005Sources = [
  'AdminTaskLogs.tsx',
  'AdminTaskRecordDetails.tsx',
  'TaskCallHistory.tsx',
]
const taskParameterLabelKeys = [
  'Quality',
  'Size',
  'Resolution',
  'Output aspect ratio',
  'Quantity',
  'Duration',
  'Max Tokens',
  'Seed',
  'Generate audio',
]
const adminRework005Keys = [
  ...new Set(
    adminRework005Sources.flatMap((file) => {
      const source = readFileSync(
        resolve('src/features/canvas-cloud/components', file),
        'utf8'
      )
      return [...source.matchAll(/\bt\(\s*(['"])(.*?)\1/gs)].map(
        (match) => match[2]
      )
    })
  ),
  'Task deduction from paid points',
  'Task deduction from bonus points',
  'Task deduction from grace bonus points',
  'Paid points debt repayment',
  'Bonus points debt repayment',
  'Grace bonus points debt repayment',
  'Task released points',
  'Lot remaining points',
  'Lot frozen points',
  ...taskParameterLabelKeys,
]
const adminRework006Sources = [
  'ModelControlDialog.tsx',
  'ExecutionTargetCoverage.tsx',
  'ModelManagementLayout.tsx',
  'ModelMonitoring.tsx',
  'PublishedModelCatalog.tsx',
  'TaskRecordDetailsSheet.tsx',
  'UnifiedModelPricing.tsx',
  'UnifiedModelPricingHistory.tsx',
]
const adminRework006RouteSources = [
  'src/routes/_authenticated/canvas-cloud/model-management/index.tsx',
  'src/routes/_authenticated/canvas-cloud/model-management/$modelId/pricing.tsx',
  'src/routes/_authenticated/canvas-cloud/model-management/$modelId/monitoring/$executionTargetId.tsx',
  'src/routes/_authenticated/canvas-cloud/model-management/$modelId/monitoring/index.tsx',
  'src/features/canvas-cloud/model-pricing-error.ts',
]
const adminRework006Keys = [
  ...new Set(
    [
      ...adminRework006Sources.map((file) =>
        resolve('src/features/canvas-cloud/components', file)
      ),
      ...adminRework006RouteSources,
    ].flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(/\bt\(\s*(['"])(.*?)\1/gs)].map(
        (match) => match[2]
      )
    })
  ),
  'Missing pricing',
  'Model unavailable',
  'Internal routing unavailable',
]

it.each(Object.entries({ en, ...localizedResources }))(
  'defines every ADMIN-REWORK-004 customer-management message in %s',
  (locale, resource) => {
    const translations = resource.translation as Record<string, string>
    for (const key of adminRework004Keys) {
      expect(translations[key], `${locale}: ${key}`).toBeTypeOf('string')
      expect(translations[key], `${locale}: ${key}`).not.toBe('')
    }
  }
)

it.each(Object.entries({ en, ...localizedResources }))(
  'defines every ADMIN-REWORK-005 task-record message in %s',
  (locale, resource) => {
    const translations = resource.translation as Record<string, string>
    for (const key of adminRework005Keys) {
      expect(translations[key], `${locale}: ${key}`).toBeTypeOf('string')
      expect(translations[key], `${locale}: ${key}`).not.toBe('')
    }
  }
)

it.each(Object.entries({ en, ...localizedResources }))(
  'defines every ADMIN-REWORK-006 model-management message in %s',
  (locale, resource) => {
    const translations = resource.translation as Record<string, string>
    for (const key of adminRework006Keys) {
      expect(translations[key], `${locale}: ${key}`).toBeTypeOf('string')
      expect(translations[key], `${locale}: ${key}`).not.toBe('')
    }
  }
)

it.each(Object.entries(localizedResources))(
  'does not fall back to English for model availability reasons in %s',
  (_locale, resource) => {
    const translations = resource.translation as Record<string, string>
    const english = en.translation as Record<string, string>
    for (const key of [
      'Model manually disabled',
      'Model unavailable',
      'Provider unavailable',
      'Internal routing unavailable',
    ]) {
      expect(translations[key]).toBeTruthy()
      expect(translations[key]).not.toBe(english[key])
    }
  }
)

it.each(Object.entries({ en, ...localizedResources }))(
  'defines every unified pricing UI message in %s without missing-key fallback',
  (locale, resource) => {
    const translations = resource.translation as Record<string, string>
    for (const key of unifiedPricingKeys) {
      expect(translations[key], `${locale}: ${key}`).toBeTypeOf('string')
      expect(translations[key], `${locale}: ${key}`).not.toBe('')
    }
  }
)
const canvasKeys = Object.keys(en.translation).filter((key) =>
  key.includes('Canvas')
)
const businessTermKeys = Object.values(canvasBusinessTermConfig).flatMap(
  (group) => [group.helpKey, ...Object.values(group.labels)]
)
const guidedPricingKeys = [
  'Published point issuance rate',
  'How often do you expect this task to succeed?',
  'What does one attempt cost?',
  'Service provider cost when successful',
  'Unrecoverable service provider cost when failed',
  'How many points should the customer pay?',
  'Pricing recommendation',
] as const
const modelIdentityKeys = ['Search model name or ID', 'Model ID'] as const
const canvasCloudCoverageKeys = [
  'Publish a versioned REQUEST × quality cost. Customer point prices remain unchanged.',
  'Upstream task ID',
  'records',
  'Production',
  'Quality',
  'Pricing risk',
  'No active risk',
] as const
const inviteBonusKeys = [
  'Bonus promotion',
  'Initial Bonus points',
  'Bonus validity days',
  'Initial Bonus',
  'Optional',
] as const
const inviteStatusKeys = [
  'Invite status DRAFT',
  'Invite status ACTIVE',
  'Invite status PAUSED',
  'Invite status REVOKED',
  'Invite status EXPIRED',
] as const
const paidExpiryKeys = [
  'Decision summary (optional)',
  'Default configuration',
  'Pricing and point rules',
  'Price plans',
  'Recharge rules',
  'Quote and release rules',
  'Task and point policy settings',
  'Paid points validity',
  'Whole days from 1 to 3650. Default: 90 days (3 months).',
  'This applies only to Paid points issued by recharge-code redemption after publication. Existing Paid points without an expiry remain valid, and Bonus points keep their separate validity.',
  'Enter a whole number from 1 to 3650',
  'Published settings are versioned. Paid validity applies only to newly redeemed Paid points; Bonus keeps its own independent validity and failure-grace rules.',
] as const

it('uses the confirmed concise Chinese pricing labels', () => {
  expect(zh.translation['Decision summary (optional)']).toBe('决策摘要（选填）')
  expect(zh.translation['Default configuration']).toBe('默认配置')
  expect(zh.translation['Price group name']).toBe('方案名称')
  expect(zh.translation['Price group code']).toBe('方案编码')
  expect(zh.translation['Group version']).toBe('方案版本')
  expect(zh.translation['Price group records']).toBe('方案记录')
  expect(zh.translation['Review new price group']).toBe('核对新方案')
  expect(zh.translation['points per RMB']).toBe('积分／元')
})
const runtimeConfigurationKeys = [
  'Current environment',
  'Task media',
  'Database backups',
  'Publish task media configuration',
  'Publish database backup configuration',
  'Access key ID',
  'Secret access key',
  'Review task media publication',
  'Review database backup publication',
  'Credential entries',
  'Current credential group',
  'Provider credential group',
  'Credential group and version',
  'Selected models',
  'Mock mode',
  'Real mode',
  'Updated by',
  'Task media check',
  'Backup check',
  'Credential schemes',
  'Last check',
  'Not checked',
  'Please check this field',
  'No matching models',
  'Passed',
  'Runtime management',
  'Monitor executor capacity, manage provider credential groups, and maintain storage through separate operational boundaries.',
  'Execution overview',
  'Storage and backups',
  'Choose one provider and credential group. The overview keeps current status, bound models, and version history together.',
  'Add credential group',
  'Select credential group',
  'Overview',
  'Current version',
  'Bound models',
  'Eligible models',
  'Select this page ({{count}})',
  'Selected models: {{count}}',
  'Reason (optional)',
  'Finish managing bindings',
  'No eligible models',
  'No bound models',
  'Binding time',
  'Credential version history',
  'Model credential bindings',
  'Publish model credential bindings',
  'Version rows are read-only. Expand a row to load its recorded affected models.',
  'Expand affected models',
  'Collapse affected models',
  'No recorded affected-model snapshot is available for this version.',
  'Affected model',
  'No affected models',
  'Binding target',
  'Select model',
  'Binding history',
  'No binding history',
  'Version change',
  'Select a credential group to edit its execution policy.',
  'Credential group execution policy',
  'Timeouts, concurrency, and shared limits apply to every bound model. Error mappings remain shared by the provider.',
  'Selected credential group',
  'Publish credential group execution policy',
  'This creates a new policy version for the selected credential group.',
  'Restore credential group defaults',
  'The next version will inherit every credential group default.',
  'This replaces the configured limit-rule list for the selected credential group.',
  'Configure credential-group, credential, model, shared-group, and token limits.',
  'Bind at least one model before previewing provider errors.',
  'Discard unsaved changes?',
  'Changing the provider or credential group will discard the current unsubmitted form and model selection.',
  'Discard changes',
  'This model is not bound to a credential group. Select the intended group before managing bindings.',
  'Configuration changed. Preview again before confirming.',
  'The credential version changed. Refresh and select the current version.',
  'Some selected models no longer belong to this provider. Review the filters and selection.',
  'The credential scheme no longer matches every selected model. Update the credential group or selection.',
  'The configuration no longer exists. Refresh and try again.',
  'Credential publication failed. Check the required schemes and preview again.',
  'Model binding failed. Refresh the model list and preview the selection again.',
  'Preview failed. Refresh the configuration and try again.',
  'Enter a credential group name',
  'Use no more than 191 characters',
  'Enter an API Key',
  'Use no more than 65536 characters',
  'API Key contains an invalid character',
  'Enter a reason',
  'Use no more than 255 characters',
] as const
const limitEditorKeys = [
  'Limit target',
  'Entire API Key group',
  'Single model',
  'Multiple models share',
  'Current API Key group',
  'All bound models in this API Key group share this limit.',
  'Select a bound model',
  'Select bound models',
  'Search bound models',
  'Selected models ({{count}})',
  'No bound models are available. Manage bindings before adding a model limit.',
  'Selected models share this limit.',
  'Models',
  'Previous limit target',
  'New limit target',
  'Removed limit target',
  'No prior rule',
  'No longer configured',
  'Single model: {{models}}',
  'Multiple models share: {{models}}',
  'Entire API Key group: {{group}}',
  'Shared counting key',
  'Counted token types: {{types}}',
  'Select at least one model',
  'Select exactly one model',
  'Enter a positive whole number',
  'Limit is too large',
  'Fix the highlighted rule fields',
] as const
const executionPolicyKeys = [
  'Add JSON condition',
  'All models in this credential group share this limit.',
  ...limitEditorKeys,
  'Asynchronous in-flight requests',
  'Blank languages use the system message for the selected category.',
  'Client HTTP status',
  'Client output',
  'Client response language',
  'Concurrent requests',
  'Credential',
  'Credential and model scope',
  'Credential group scope',
  'Credential scope',
  'Custom JSON mapping',
  'Custom JSON mappings run in list order, followed by the HTTP status mapping and the system default message.',
  'Custom JSON order',
  'Custom mapping',
  'Custom message',
  'Customized',
  'Error mapping preview request failed',
  'Every language uses the system message for the selected category.',
  'HTTP status mapping',
  'Invalid request',
  'JSON field path',
  'Language',
  'Mapping type',
  'Match method',
  'Match upstream error',
  'Match value',
  'Message source',
  'Model group',
  'Model group scope',
  'Move mapping down',
  'Move mapping up',
  'New custom mapping',
  'No model-group source is available. Configure model groups before publishing this scope.',
  'Other languages',
  'Preview fields do not match the error rule contract',
  'Return to client',
  'Rule details',
  'Shared limit meaning',
  'Stable error code',
  'System built-in',
  'Test current edits without saving',
  'Test error mappings',
  'The built-in matching condition cannot be changed.',
  'This simulates the final mapping result for the current unsaved rule list and does not call the provider.',
  'Upstream HTTP status',
  'Upstream HTTP status (optional)',
  'Upstream HTTP status must be between 100 and 599',
  'Upstream error JSON must be an object',
  'Upstream error response JSON',
  'Use custom client messages',
  'Uses system default',
  'Value type',
  'Test result is out of date. Run preview again.',
  'Changes',
  'Added',
  'Previous custom JSON order',
  'New custom JSON order',
] as const
const pointAdjustmentKeys = [
  'Username',
  'Search username',
  'Record externally confirmed refund',
  'Refund point recovery',
  'Open refund point recovery',
  'Prefilled customer',
  'Canvas recharge order number or customer',
  'Fuzzy matches the Canvas recharge order number or username. A customer opened from Customers & Points remains scoped to that customer.',
  'Canvas recharge order',
  'Customer confirmation reference',
  'Calculated points',
  'Grant Bonus points',
  'Correct Paid points',
  'Deduct from a Point Lot',
  'Unknown status',
  'In review',
  'Recovered',
  'Waived',
  'CONFIGURATION',
  'PAYMENT',
  'TASK_EXECUTION',
  'Unknown category',
  'Unknown action',
  'Unknown outcome',
  'Unknown actor',
  'Unknown resource',
  'Unknown reason',
] as const

describe('Canvas interface localization', () => {
  it('uses business language instead of internal model names in rule tooltips', () => {
    const fields = [
      'GROUP_VERSION',
      'GROUP_STATUS',
      'GROUP_CREATED',
      'GROUP_EFFECTIVE',
      'RATE_VERSION',
      'RATE_STATUS',
      'RATE_DECISION',
      'RATE_CREATED',
    ] as const
    for (const resource of [en, ...Object.values(localizedResources)]) {
      const translations = resource.translation as Record<string, string>
      for (const field of fields) {
        const key = canvasBusinessTermConfig.pricingField.helpKeys[field]
        expect(translations[key]).toBeTruthy()
        expect(translations[key]).not.toMatch(
          /PriceGroup|ConfigVersion|payload/
        )
      }
    }
    expect(
      (zh.translation as Record<string, string>)[
        canvasBusinessTermConfig.pricingField.helpKeys.GROUP_EFFECTIVE
      ]
    ).toBe('此版本发布后，可用于新的定价和客户方案分配。')
  })

  it.each(Object.entries(localizedResources))(
    'translates runtime configuration labels in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of runtimeConfigurationKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
      }
    }
  )
  it.each(Object.entries(localizedResources))(
    'translates execution-policy labels in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of executionPolicyKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
      }
    }
  )
  it.each(Object.entries({ en, ...localizedResources }))(
    'defines every limit-editor label in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of limitEditorKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe('')
      }
    }
  )
  it.each(Object.entries(localizedResources))(
    'translates every Canvas label in %s without retaining the English word',
    (_locale, resource) => {
      for (const key of canvasKeys) {
        const value =
          resource.translation[key as keyof typeof resource.translation]
        expect(value, key).toBeTypeOf('string')
        expect(value, key).not.toMatch(/Canvas/i)
      }
    }
  )

  it.each(Object.entries({ en, ...localizedResources }))(
    'defines every configured business term in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of businessTermKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe('')
      }
    }
  )

  it('uses customer-facing Chinese instead of raw point codes', () => {
    expect(zh.translation.Points).toBe('积分')
    expect(zh.translation['Bonus points']).toBe('赠送积分')
    expect(zh.translation.Issued).toBe('发放')
    expect(zh.translation['Invite registration']).toBe('邀请注册')
    expect(zh.translation['Provider channel']).toBe('服务商渠道')
    expect(
      zh.translation[
        'The reviewed RMB Provider cost of one successful chargeable attempt. A confirmed change creates a new immutable published version.'
      ]
    ).not.toMatch(/Provider/i)
  })

  it.each(Object.entries(localizedResources))(
    'translates every guided pricing label in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of guidedPricingKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
      }
    }
  )

  it.each(Object.entries(localizedResources))(
    'translates model identity labels in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of modelIdentityKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
      }
    }
  )

  it.each(Object.entries({ en, ...localizedResources }))(
    'defines the Canvas Cloud page coverage keys in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of canvasCloudCoverageKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe('')
      }
    }
  )

  it('does not expose upstream pricing implementation terms in Chinese', () => {
    expect(
      zh.translation[
        'Publish a versioned REQUEST × quality cost. Customer point prices remain unchanged.'
      ]
    ).not.toMatch(/REQUEST|quality/i)
    expect(zh.translation.Quality).toBe('质量')
    expect(zh.translation['Pricing risk']).toBe('定价风险')
    expect(zh.translation['No active risk']).toBe('当前无风险')
  })

  it.each(Object.entries(localizedResources))(
    'localizes invite promotional-point labels in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of inviteBonusKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
        expect(translations[key], key).not.toMatch(/Bonus|Optional/i)
      }
    }
  )

  it.each(Object.entries(localizedResources))(
    'localizes Paid expiry policy in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of paidExpiryKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
      }
    }
  )

  it.each(Object.entries(localizedResources))(
    'localizes administrator point adjustment and recovery states in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of pointAdjustmentKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
      }
    }
  )

  it.each(Object.entries(localizedResources))(
    'localizes every invite status in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of inviteStatusKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
      }
    }
  )

  it('distinguishes valid code states from activation actions in Chinese', () => {
    expect(zh.translation['Invite status ACTIVE']).toBe('有效')
    expect(zh.translation.Valid).toBe('有效')
    expect(zh.translation['Activation time']).toBe('生效时间')
    expect(zhTW.translation['Invite status ACTIVE']).toBe('有效')
    expect(zhTW.translation.Valid).toBe('有效')
    expect(zhTW.translation['Activation time']).toBe('生效時間')
  })

  it('uses display wording for the Chinese column visibility control', () => {
    expect(zh.translation.View).toBe('显示')
    expect(zhTW.translation.View).toBe('顯示')
  })

  it('uses the confirmed Chinese model-selection wording', () => {
    expect(zh.translation['Current credential group']).toBe('当前 API Key 组')
    expect(zh.translation['Select this page ({{count}})']).toBe(
      '选择本页（{{count}}）'
    )
    expect(zh.translation['Selected models: {{count}}']).toBe(
      '已选 {{count}} 个模型'
    )
    expect(zh.translation['Reason (optional)']).toBe('原因（选填）')
  })

  it.each([
    ['en', en, 'API Key group', 'Add API Key group', 'Provider API Key groups'],
    ['zh', zh, 'API Key 组', '新增 API Key 组', '服务商 API Key 组'],
    ['zh-TW', zhTW, 'API Key 群組', '新增 API Key 群組', '供應商 API Key 群組'],
    [
      'fr',
      fr,
      'Groupe d’API Key',
      'Ajouter un groupe d’API Key',
      'Groupes d’API Key du fournisseur',
    ],
    [
      'ru',
      ru,
      'Группа API Key',
      'Добавить группу API Key',
      'Группы API Key поставщика',
    ],
    [
      'ja',
      ja,
      'API Key グループ',
      'API Key グループを追加',
      'プロバイダー API Key グループ',
    ],
    [
      'vi',
      vi,
      'Nhóm API Key',
      'Thêm nhóm API Key',
      'Nhóm API Key của nhà cung cấp',
    ],
  ] as const)(
    'uses the API Key group product term in %s',
    (_locale, resource, group, addGroup, providerGroups) => {
      expect(resource.translation['Credential group']).toBe(group)
      expect(resource.translation['Add credential group']).toBe(addGroup)
      expect(resource.translation['Provider credential groups']).toBe(
        providerGroups
      )
      expect(resource.translation['Replace API Key']).toBeTruthy()
    }
  )
})

it('localizes customer price assignment labels in every supported language', () => {
  const keys = [
    'Confirm',
    'Confirm price plan change',
    'Current',
    'Current price plan',
    'Customer',
    'Customer price plan',
    'Customer price plan updated',
    'Effective at',
    'Ended at',
    'New price plan',
    'No other published price plans',
    'No price plan history',
    'Only new quotes use the new plan. Existing quotes and tasks keep their original prices.',
    'Operator',
    'Price plan',
    'Price plan change failed. Refresh the current plan before retrying.',
    'Price plan history',
    'Reason',
    'Refresh',
    'Review price plan change',
    'Select a published price plan',
    'Unable to load price plans or assignment history',
    'Unknown',
  ]
  for (const resource of Object.values(localizedResources)) {
    for (const key of keys) {
      expect((resource.translation as Record<string, string>)[key]).toBeTruthy()
    }
  }
})

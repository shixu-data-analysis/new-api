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
import type { TFunction } from 'i18next'

import {
  catalogModelName,
  type CatalogModelChangeKind,
  type CatalogPlanModel,
  type CatalogSharedChangeKind,
  type CatalogSharedResourceType,
} from '../catalog-plan-review'
import type { ModelCatalogDiagnostic } from '../generated/model-catalog-import'

export function catalogListText(t: TFunction, items: string[]): string {
  return items.join(t(', '))
}

export function catalogPriceReasonLabel(t: TFunction, reasonCode: string) {
  return (
    {
      NEW_MODEL: t('New model'),
      NEW_SPECIFICATION: t('New specification'),
      UNPRICED_SOURCE: t('Never priced'),
      PROVIDER_CHANGED: t('API provider changed'),
      CHANNEL_CHANGED: t('Upstream model changed'),
      BILLING_DIMENSIONS_CHANGED: t('Billing dimensions changed'),
      TOKEN_CATEGORIES_CHANGED: t('Token categories changed'),
      BILLING_UNIT_CHANGED: t('Billing unit changed'),
      MODEL_BILLING_UNIT_CONFLICT: t('Inconsistent billing units'),
      SCHEDULED_PRICE_CONFLICT: t('Scheduled price conflict'),
      SCHEDULED_COST_CONFLICT: t('Scheduled cost conflict'),
      PROMOTION_CONFLICT: t('Limited-price special conflict'),
      PUBLISHED_PRICE_CONFLICT: t('Published price conflict'),
    }[reasonCode] ?? t('Unknown')
  )
}

export function catalogBindingReasonLabel(t: TFunction, reasonCode: string) {
  return (
    {
      CURRENT_BINDING: t('Current binding kept'),
      MATCHED_PUBLISHED_BINDING: t('Historical binding kept'),
      UNBOUND_SOURCE: t('No previous binding'),
      CREDENTIAL_GROUP_UNAVAILABLE: t('Previous API Key group unavailable'),
      PROVIDER_CHANGED: t('API provider changed'),
      CREDENTIAL_SCHEME_MISMATCH: t('Authentication scheme mismatch'),
      BINDING_CONFLICT: t('Historical binding conflict'),
    }[reasonCode] ?? t('Unknown')
  )
}

export function catalogBindingStatusLabel(
  t: TFunction,
  status: CatalogPlanModel['credential']['status']
) {
  return {
    REUSE: t('API Key binding kept'),
    NEEDS_BINDING: t('API Key binding required'),
    BLOCKED: t('API Key binding cannot be kept'),
  }[status]
}

export function catalogModelChangeLabel(
  t: TFunction,
  kind: CatalogModelChangeKind
) {
  return {
    CREATE: t('New'),
    NEW_VERSION: t('New version'),
    DESCRIPTION: t('Description updated'),
    CONFLICT: t('In conflict'),
    UNCHANGED: t('Unchanged'),
  }[kind]
}

export function catalogSharedChangeLabel(
  t: TFunction,
  kind: CatalogSharedChangeKind
) {
  return {
    CREATE: t('New'),
    NEW_VERSION: t('New version'),
    CONFLICT: t('In conflict'),
    UNCHANGED: t('Unchanged'),
  }[kind]
}

export function catalogResourceTypeLabel(
  t: TFunction,
  resourceType: CatalogSharedResourceType
) {
  return {
    PROVIDER: t('API provider'),
    PROVIDER_CHANNEL: t('Provider channel'),
    MODEL_DEFINITION_ARTIFACT: t('Model definition file'),
  }[resourceType]
}

// New blue, new version purple, description light blue-grey, conflict red, unchanged grey.
const changeBadgeTone = {
  CREATE: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200',
  NEW_VERSION:
    'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200',
  DESCRIPTION:
    'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',
  CONFLICT: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  UNCHANGED: 'bg-muted text-muted-foreground',
} as const

export function catalogChangeBadgeClass(
  kind: CatalogModelChangeKind | CatalogSharedChangeKind
) {
  return changeBadgeTone[kind]
}

export function catalogCredentialRemedy(
  t: TFunction,
  reasonCode: unknown
): string {
  if (reasonCode === 'PROVIDER_CHANGED') {
    return t(
      'The same model key cannot change its API provider. Use a new model key in the Catalog.'
    )
  }
  if (reasonCode === 'CREDENTIAL_SCHEME_MISMATCH') {
    return t(
      'Make this API Key group support the required authentication first.'
    )
  }
  return t('Resolve the conflicting historical API Key bindings first.')
}

/**
 * Text for diagnostics the publication preview explains itself; null for other diagnostics,
 * which keep the generic Cloud message rendering.
 */
export function catalogPlanDiagnosticText(
  t: TFunction,
  diagnostic: ModelCatalogDiagnostic,
  models: CatalogPlanModel[]
): { message: string; remedy: string } | null {
  const { params } = diagnostic
  const modelName = () => {
    const model = models.find((entry) => entry.productKey === params.modelKey)
    return model ? catalogModelName(model) : String(params.modelKey ?? '')
  }
  switch (diagnostic.code) {
    case 'BUNDLE_VERSION_CONFLICT':
      return {
        message: t(
          'Bundle version {{bundleVersion}} is already published with different content.',
          { bundleVersion: params.bundleVersion }
        ),
        remedy: t('Increase the Bundle version and upload it again.'),
      }
    case 'PROVIDER_CONFLICT':
      return {
        message: t(
          'The internal name of API provider {{providerId}} differs from the published one.',
          { providerId: params.providerId }
        ),
        remedy: t(
          'Restore the original internal name, or use a new API provider ID.'
        ),
      }
    case 'ARTIFACT_VERSION_CONFLICT':
      return {
        message: t(
          'Model definition file {{artifactKey}} has different content under the same version.',
          { artifactKey: params.artifactKey }
        ),
        remedy: t('Increase the version of this file.'),
      }
    case 'CREDENTIAL_BINDING_BLOCKED': {
      const message = t(
        'The API Key binding of {{model}} cannot be kept: {{reason}}.',
        {
          model: modelName(),
          reason: catalogBindingReasonLabel(t, String(params.reasonCode)),
        }
      )
      const schemes =
        params.reasonCode === 'CREDENTIAL_SCHEME_MISMATCH'
          ? ` ${t(
              'Required authentication: {{required}}. API Key group {{group}} supports: {{supported}}.',
              {
                required: params.requiredScheme ?? '—',
                group: params.credentialGroupName ?? '—',
                supported: Array.isArray(params.supportedSchemes)
                  ? catalogListText(t, params.supportedSchemes.map(String)) ||
                    '—'
                  : '—',
              }
            )}`
          : ''
      return {
        message: `${message}${schemes}`,
        remedy: catalogCredentialRemedy(t, params.reasonCode),
      }
    }
    case 'PRICING_SOURCE_CONFLICT':
      if (typeof params.modelKey !== 'string') return null
      if (typeof params.specification === 'string' && params.reasonCode === 'PROMOTION_CONFLICT') {
        return {
          message: t('{{specification}} · {{plan}} has a running limited-price special.', { specification: params.specification, plan: params.priceGroupName }),
          remedy: t('End the special on the pricing page first, then publish.'),
        }
      }
      if (typeof params.specification === 'string' && typeof params.effectiveAt === 'string' && String(params.reasonCode).startsWith('SCHEDULED_')) {
        return {
          message: t('{{specification}} · {{plan}} has a scheduled change (effective {{time}}).', { specification: params.specification, plan: params.priceGroupName, time: new Date(params.effectiveAt).toLocaleString() }),
          remedy: t('Cancel it on the pricing page first, or publish after it takes effect.'),
        }
      }
      return {
        message: t('Price source conflict for {{model}}: {{reason}}.', {
          model: modelName(),
          reason: catalogPriceReasonLabel(t, String(params.reasonCode)),
        }),
        remedy: t(
          'Resolve the conflicting published price, scheduled price or limited-price special first.'
        ),
      }
    case 'PROVIDER_ADMIN_EDITED':
    case 'CHANNEL_ADMIN_EDITED':
    case 'MODEL_ADMIN_EDITED':
      return {
        message: t('An administrator changed {{key}}; the current version stays by default.', { key: params.key }),
        remedy: t('Select the Bundle version only if it should replace the change.'),
      }
    case 'CHANNEL_OVERRIDE_BREAKS_MODEL':
      return {
        message: t('The Bundle version cannot be used: the request of {{model}} would not match the contract.', { model: modelName() }),
        remedy: t('Change the Bundle.'),
      }
    case 'MODEL_UPSTREAM_ID_DUPLICATE':
      return {
        message: t('Upstream model ID {{upstream}} is already used by {{owner}} on this Channel.', { upstream: params.upstreamModelId, owner: params.usedBy }),
        remedy: t('Use another upstream model ID, or delete the other model first.'),
      }
    case 'MODEL_KEY_RETIRED':
      return {
        message: t('Product key {{key}} belongs to a deleted model.', { key: params.modelKey }),
        remedy: t('Use another product key.'),
      }
    case 'CATALOG_PROMPT_REFERENCES_REWRITTEN':
      return {
        message: t('catalog.plan.promptReferencesRewritten', { channelId: params.channelId }),
        remedy: t('Try a prompt with a reference image before publishing.'),
      }
    case 'CATALOG_DESCRIPTION_REPLACES_PRESENTATION':
      return {
        message: t('The Bundle description of {{model}} replaces the current display description.', { model: modelName() }),
        remedy: t('Publish only if the Bundle description should be shown to customers.'),
      }
    case 'CATALOG_ADMIN_REQUEST_INVALID':
      return {
        message: t('The request of {{model}} does not match the contract.', { model: modelName() }),
        remedy: t('Correct the request fields or the model parameters.'),
      }
    default:
      return null
  }
}

// Every code of the Cloud contract: anything else came from a Cloud newer than this page.
const KNOWN_DIAGNOSTICS: ReadonlySet<string> = new Set([
  'API_CAPABILITY_MISSING',
  'ARTIFACT_VERSION_CONFLICT',
  'AUDIT_UNAVAILABLE',
  'BUNDLE_VERSION_CONFLICT',
  'CATALOG_ADMIN_BASE_VERSION_CHANGED',
  'CATALOG_ADMIN_CHANNEL_INVALID',
  'CATALOG_ADMIN_DEFINITION_INVALID',
  'CATALOG_ADMIN_HOST_CHANGE_UNCONFIRMED',
  'CATALOG_ADMIN_IMMUTABLE_FIELD',
  'CATALOG_ADMIN_MODEL_KEY_RETIRED',
  'CATALOG_ADMIN_REFERENCE_MISSING',
  'CATALOG_ADMIN_REQUEST_INVALID',
  'CATALOG_DESCRIPTION_REPLACES_PRESENTATION',
  'CATALOG_DUPLICATE_IDENTIFIER',
  'CATALOG_PROMPT_REFERENCES_REWRITTEN',
  'CATALOG_IMPORT_EXPIRED',
  'CATALOG_MANIFEST_INVALID',
  'CATALOG_MANIFEST_REFERENCE_DUPLICATE',
  'CATALOG_MANIFEST_REFERENCE_INVALID',
  'CATALOG_PLAN_ACTOR_MISMATCH',
  'CATALOG_PLAN_BLOCKING',
  'CATALOG_PLAN_HASH_MISMATCH',
  'CATALOG_PLAN_NO_CHANGES',
  'CATALOG_PLAN_PUBLICATION_CONFLICT',
  'CATALOG_PLAN_SNAPSHOT_INVALID',
  'CATALOG_PLAN_STALE',
  'CATALOG_PLAN_TOKEN_MISMATCH',
  'CATALOG_PLAN_VALIDATOR_CHANGED',
  'CATALOG_REFERENCE_INVALID',
  'CATALOG_SCHEMA_INVALID',
  'CATALOG_SECRET_FORBIDDEN',
  'CATALOG_SOURCE_BASE64_INVALID',
  'CATALOG_SOURCE_ENVELOPE_INVALID',
  'CATALOG_SOURCE_FILE_IGNORED',
  'CATALOG_SOURCE_FILE_TOO_LARGE',
  'CATALOG_SOURCE_JSON_INVALID',
  'CATALOG_SOURCE_PATH_DUPLICATE',
  'CATALOG_SOURCE_PATH_INVALID',
  'CATALOG_SOURCE_REFERENCE_MISSING',
  'CATALOG_SOURCE_TOO_MANY_FILES',
  'CATALOG_SOURCE_TOTAL_TOO_LARGE',
  'CATALOG_SOURCE_UTF8_INVALID',
  'CHANNEL_ADMIN_EDITED',
  'CHANNEL_OVERRIDE_BREAKS_MODEL',
  'CLIENT_CAPABILITY_MISSING',
  'CREDENTIAL_BINDING_BLOCKED',
  'DATABASE_CAPABILITY_MISSING',
  'MODEL_ADMIN_EDITED',
  'MODEL_KEY_RETIRED',
  'MODEL_UPSTREAM_ID_DUPLICATE',
  'PAYLOAD_TOO_LARGE',
  'PRICING_SOURCE_CONFLICT',
  'PROGRAM_CAPABILITY_MISSING',
  'PROVIDER_ADMIN_EDITED',
  'PROVIDER_CONFLICT',
  'SOURCE_FIELD_REQUIRED',
  'SOURCE_FIELD_UNKNOWN',
  'TEMPLATE_INVALID',
  'TEMPLATE_LANGUAGE_UNSUPPORTED',
])

export function catalogDiagnosticKnown(code: string): boolean {
  return KNOWN_DIAGNOSTICS.has(code)
}

const KNOWN_PLAN_ACTIONS: ReadonlySet<string> = new Set(['PUBLISH', 'REPLAY', 'RECOVER_PRICING', 'RECOVER_CONTINUITY', 'NO_CHANGES', 'CONFLICT'])

export function catalogPlanActionKnown(action: string): boolean {
  return KNOWN_PLAN_ACTIONS.has(action)
}

/** Five common Bundle errors in the reader's language, from the facts Cloud reports; undefined keeps the original text. */
export function catalogDiagnosticSentence(
  diagnostic: Pick<ModelCatalogDiagnostic, 'params' | 'jsonPath'> | { params?: Record<string, unknown>; jsonPath?: string },
  t: TFunction
): string | undefined {
  const params = diagnostic.params ?? {}
  const field = (diagnostic.jsonPath ?? '').split('.').at(-1) ?? ''
  switch (params.sentence) {
    case 'MISSING_FIELD':
      return t('Field {{field}} is missing.', { field })
    case 'WRONG_TYPE':
      return t('Field {{field}} has the wrong type; it should be {{expected}}.', { field, expected: params.expected })
    case 'UNKNOWN_FIELD':
      return t('Unknown field: {{fields}}.', { fields: Array.isArray(params.keys) ? params.keys.join(', ') : '' })
    case 'VALUE_NOT_ALLOWED':
      return t('The value of {{field}} is not allowed.', { field })
    case 'DUPLICATE_IDENTIFIER':
      return t('This identifier occurs more than once.')
    default:
      return undefined
  }
}

export function catalogDiagnosticDetails(
  diagnostic: Partial<ModelCatalogDiagnostic>,
  t: TFunction
): string {
  const fallback = [diagnostic.recommendation, diagnostic.valueSummary]
    .filter(
      (value, index, values) =>
        Boolean(value) && values.indexOf(value) === index
    )
    .join(' · ')
  const fallbackMessage = catalogDiagnosticSentence(diagnostic, t) ?? (fallback || diagnostic.code || t('Unknown'))
  const message = diagnostic.messageKey
    ? t(diagnostic.messageKey, {
        ...diagnostic.params,
        defaultValue: fallbackMessage,
      })
    : fallbackMessage
  // A localized message replaces Cloud's English text; without one the Cloud text is the reason.
  // A generic localized message (no parameters) would lose the specifics, such as the field
  // name of a schema error, so Cloud's summary follows it as the details.
  const localized = message !== fallbackMessage
  const generic = Object.keys(diagnostic.params ?? {}).length === 0
  const details =
    localized && generic && diagnostic.valueSummary
      ? t('Details: {{text}}', { text: diagnostic.valueSummary })
      : null
  return [
    diagnostic.profileKey &&
      `${t('{{label}}: ', { label: t('Adapter Profile') })}${diagnostic.profileKey}`,
    diagnostic.operation &&
      `${t('{{label}}: ', { label: t('Operation') })}${diagnostic.operation}`,
    diagnostic.sourceFile,
    diagnostic.jsonPath &&
      diagnostic.jsonPath !== '$' &&
      `${t('{{label}}: ', { label: t('Path') })}${diagnostic.jsonPath}`,
    `${t('{{label}}: ', { label: t('Reason') })}${message}`,
    details,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function catalogSourceLabel(t: TFunction, source: string): string {
  switch (source) {
    case 'BUNDLE':
      return t('Bundle, short')
    case 'ADMIN_EDIT':
      return t('Admin edit')
    case 'ADMIN_NEW':
      return t('Admin new')
    case 'ADMIN_COPY':
      return t('Admin copy')
    default:
      return t('All')
  }
}

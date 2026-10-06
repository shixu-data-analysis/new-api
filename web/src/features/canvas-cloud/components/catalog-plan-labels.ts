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

const changeBadgeVariant = {
  CREATE: 'default',
  NEW_VERSION: 'secondary',
  DESCRIPTION: 'outline',
  CONFLICT: 'destructive',
  UNCHANGED: 'ghost',
} as const

export function catalogChangeBadgeVariant(
  kind: CatalogModelChangeKind | CatalogSharedChangeKind
) {
  return changeBadgeVariant[kind]
}

function credentialRemedy(t: TFunction, reasonCode: unknown): string {
  if (reasonCode === 'PROVIDER_CHANGED') {
    return t(
      'The same model key cannot change its API provider. Use a new model key in the Catalog.'
    )
  }
  if (reasonCode === 'CREDENTIAL_SCHEME_MISMATCH') {
    return t('Make this API Key group support the required authentication first.')
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
        remedy: credentialRemedy(t, params.reasonCode),
      }
    }
    case 'PRICING_SOURCE_CONFLICT':
      if (typeof params.modelKey !== 'string') return null
      return {
        message: t('Price source conflict for {{model}}: {{reason}}.', {
          model: modelName(),
          reason: catalogPriceReasonLabel(t, String(params.reasonCode)),
        }),
        remedy: t(
          'Resolve the conflicting published price, scheduled price or limited-price special first.'
        ),
      }
    default:
      return null
  }
}

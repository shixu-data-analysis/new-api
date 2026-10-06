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
import type {
  CatalogPlanModel,
  CatalogPricingItem,
} from '../catalog-plan-review'
import type {
  ModelCatalogChange,
  ModelCatalogDiagnostic,
} from '../generated/model-catalog-import'

export function catalogPriceItem(
  overrides: Partial<CatalogPricingItem> = {}
): CatalogPricingItem {
  return {
    combinationKey: 'default',
    label: 'Default',
    parameters: {},
    billingDimensions: { dimensions: [], tokenUsageCategories: [] },
    priceGroupId: 'standard',
    priceGroupCode: 'STANDARD',
    priceGroupName: 'Standard',
    status: 'REUSE',
    reasonCode: 'CURRENT_PRICE',
    billingUnit: 'REQUEST',
    points: '100',
    tokenRates: null,
    sourcePriceVersionId: null,
    sourceProviderRateVersionId: null,
    sourceModelVersion: 1,
    effectiveAt: null,
    ...overrides,
  }
}

export function catalogPlanModel(
  overrides: Partial<CatalogPlanModel> = {}
): CatalogPlanModel {
  const productKey = overrides.productKey ?? 'canvas.image.model'
  return {
    productKey,
    displayName: 'Bundle model',
    presentationDisplayName: null,
    channelId: 'image-channel',
    providerId: 'image-provider',
    capability: 'image.generate',
    action: 'NO_OP',
    currentVersion: 1,
    proposedVersion: 1,
    currentModelId: null,
    currentBundleVersion: null,
    customerVisibleAfterPublish: true,
    publicInteraction: { defaultParams: {}, paramSchema: {}, referenceLimits: {} },
    pricing: [catalogPriceItem()],
    credential: {
      status: 'REUSE',
      reasonCode: 'CURRENT_BINDING',
      sourceBindingId: null,
      sourceModelId: null,
      credentialGroupVersionId: null,
      credentialGroupName: 'Image group',
    },
    definition: {
      current: { productKey },
      proposed: { productKey },
    },
    ...overrides,
  }
}

export function catalogChange(
  overrides: Partial<ModelCatalogChange> &
    Pick<ModelCatalogChange, 'resourceType' | 'key'>
): ModelCatalogChange {
  return {
    action: 'REUSE',
    currentVersion: null,
    proposedVersion: null,
    detail: {},
    ...overrides,
  }
}

export function catalogDiagnostic(
  overrides: Partial<ModelCatalogDiagnostic> &
    Pick<ModelCatalogDiagnostic, 'code' | 'params'>
): ModelCatalogDiagnostic {
  return {
    severity: 'ERROR',
    sourceFile: 'database',
    jsonPath: overrides.code,
    valueSummary: overrides.code,
    capability: 'catalog.import.publication',
    ownerModule: 'model-catalog',
    recommendation: 'Cloud recommendation',
    internalTestingAllowed: false,
    messageKey: 'catalog.plan.blocking',
    ...overrides,
  }
}

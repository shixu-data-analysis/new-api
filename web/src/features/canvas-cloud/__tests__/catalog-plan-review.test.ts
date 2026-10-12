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
import { describe, expect, it } from 'vitest'

import {
  catalogDiagnosticTarget,
  catalogModelHasPending,
  catalogSharedChanges,
  catalogSharedImpact,
  emptyCatalogModelFilters,
  matchesCatalogModelFilters,
  reviewCatalogModel,
  sortCatalogModelReviews,
  sortCatalogSharedChanges,
} from '../catalog-plan-review'
import {
  catalogChange,
  catalogDiagnostic,
  catalogPlanModel,
  catalogPriceItem,
} from './catalog-plan-fixtures'

describe('catalog plan model review', () => {
  it.each([
    ['CREATE', [], 'CREATE'],
    ['CREATE_VERSION', [], 'NEW_VERSION'],
    [
      'NO_OP',
      [
        catalogChange({
          resourceType: 'MODEL_DESCRIPTION_DEFAULT',
          key: 'canvas.image.model',
          action: 'CREATE_VERSION',
        }),
      ],
      'DESCRIPTION',
    ],
    ['NO_OP', [], 'UNCHANGED'],
  ] as const)('classifies a %s model as %s', (action, changes, kind) => {
    expect(
      reviewCatalogModel(catalogPlanModel({ action }), [...changes]).kind
    ).toBe(kind)
  })

  it('counts price items that need pricing but treats price conflicts as blockers', () => {
    const review = reviewCatalogModel(
      catalogPlanModel({
        pricing: [
          catalogPriceItem({
            status: 'NEEDS_PRICING',
            reasonCode: 'NEW_SPECIFICATION',
          }),
          catalogPriceItem({
            priceGroupId: 'premium',
            status: 'NEEDS_PRICING',
            reasonCode: 'NEW_SPECIFICATION',
          }),
          catalogPriceItem({
            combinationKey: 'quality=4K',
            status: 'NEEDS_PRICING',
            reasonCode: 'PROMOTION_CONFLICT',
          }),
        ],
      }),
      []
    )

    expect(review.pricingCount).toBe(2)
    expect(review.blockers).toEqual([
      { source: 'pricing', reasonCode: 'PROMOTION_CONFLICT' },
    ])
  })

  it('treats a binding that needs work as pending and a blocked binding as a blocker', () => {
    const needsBinding = reviewCatalogModel(
      catalogPlanModel({
        credential: {
          ...catalogPlanModel().credential,
          status: 'NEEDS_BINDING',
          reasonCode: 'CREDENTIAL_GROUP_UNAVAILABLE',
        },
      }),
      []
    )
    const blocked = reviewCatalogModel(
      catalogPlanModel({
        credential: {
          ...catalogPlanModel().credential,
          status: 'BLOCKED',
          reasonCode: 'PROVIDER_CHANGED',
        },
      }),
      []
    )

    expect(needsBinding.needsBinding).toBe(true)
    expect(needsBinding.blockers).toEqual([])
    expect(catalogModelHasPending(needsBinding)).toBe(true)
    expect(blocked.blockers).toEqual([
      { source: 'credential', reasonCode: 'PROVIDER_CHANGED' },
    ])
  })

  it('sorts blocked, pending, new, new version, description and unchanged models, then by key', () => {
    const description = catalogChange({
      resourceType: 'MODEL_DESCRIPTION_DEFAULT',
      key: 'f.description',
      action: 'CREATE_VERSION',
    })
    const reviews = [
      catalogPlanModel({ productKey: 'g.unchanged' }),
      catalogPlanModel({ productKey: 'f.description' }),
      catalogPlanModel({ productKey: 'e.version', action: 'CREATE_VERSION' }),
      catalogPlanModel({ productKey: 'd.new', action: 'CREATE' }),
      catalogPlanModel({
        productKey: 'c.pending',
        pricing: [
          catalogPriceItem({
            status: 'NEEDS_PRICING',
            reasonCode: 'NEW_MODEL',
          }),
        ],
      }),
      catalogPlanModel({
        productKey: 'b.blocked',
        credential: {
          ...catalogPlanModel().credential,
          status: 'BLOCKED',
          reasonCode: 'BINDING_CONFLICT',
        },
      }),
      catalogPlanModel({ productKey: 'a.unchanged' }),
    ].map((model) => reviewCatalogModel(model, [description]))

    expect(
      sortCatalogModelReviews(reviews).map((review) => review.model.productKey)
    ).toEqual([
      'b.blocked',
      'c.pending',
      'd.new',
      'e.version',
      'f.description',
      'a.unchanged',
      'g.unchanged',
    ])
  })

  it('filters by capability, API provider, change and attention state', () => {
    const review = reviewCatalogModel(
      catalogPlanModel({
        action: 'CREATE',
        capability: 'video.generate',
        providerId: 'video-provider',
      }),
      []
    )
    const matches = (filters: Partial<typeof emptyCatalogModelFilters>) =>
      matchesCatalogModelFilters(review, {
        ...emptyCatalogModelFilters,
        ...filters,
      })

    expect(matches({})).toBe(true)
    expect(matches({ capability: 'image.generate' })).toBe(false)
    expect(matches({ providerId: 'video-provider', change: 'CHANGED' })).toBe(
      true
    )
    expect(matches({ change: 'NEW_VERSION' })).toBe(false)
    expect(matches({ pending: 'NONE' })).toBe(true)
    expect(matches({ pending: 'PRICING' })).toBe(false)
  })
})

describe('catalog plan shared resources', () => {
  const channel = catalogChange({
    resourceType: 'PROVIDER_CHANNEL',
    key: 'image-channel',
    action: 'CREATE_VERSION',
    currentVersion: 1,
    proposedVersion: 2,
    detail: { adapterProfile: 'image-profile@2.0.0' },
  })
  const profile = catalogChange({
    resourceType: 'MODEL_DEFINITION_ARTIFACT',
    key: 'image-profile@2.0.0',
    action: 'CREATE',
    detail: { kind: 'ADAPTER_PROFILE' },
    definition: { current: null, proposed: { api: 'image-api@2.0.0' } },
  })
  const openapi = catalogChange({
    resourceType: 'MODEL_DEFINITION_ARTIFACT',
    key: 'image-api@2.0.0',
    action: 'CREATE',
    detail: { kind: 'OPENAPI' },
  })
  const provider = catalogChange({
    resourceType: 'PROVIDER',
    key: 'image-provider',
    action: 'CONFLICT',
  })
  const unchanged = catalogChange({
    resourceType: 'PROVIDER',
    key: 'other-provider',
  })
  const models = [
    catalogPlanModel({
      productKey: 'a.version',
      displayName: 'Version model',
      action: 'CREATE_VERSION',
    }),
    catalogPlanModel({
      productKey: 'b.new',
      displayName: 'New model',
      presentationDisplayName: 'Renamed new model',
      action: 'CREATE',
    }),
    catalogPlanModel({
      productKey: 'c.same',
      channelId: 'other-channel',
      action: 'CREATE_VERSION',
    }),
  ]
  const diagnostics = [
    catalogDiagnostic({
      code: 'PROVIDER_CONFLICT',
      params: { providerId: 'image-provider' },
    }),
  ]
  const plan = {
    changes: [channel, profile, openapi, provider, unchanged],
    models,
    diagnostics,
  }
  const reviews = models.map((model) => reviewCatalogModel(model, plan.changes))

  it('keeps only providers, channels and model definition files and puts conflicts first', () => {
    const shared = catalogSharedChanges([
      ...plan.changes,
      catalogChange({
        resourceType: 'CUSTOMER_MODEL',
        key: 'a.version',
        action: 'CREATE_VERSION',
      }),
    ])

    expect(
      sortCatalogSharedChanges(shared).map((change) => change.key)
    ).toEqual([
      'image-provider',
      'image-channel',
      'image-api@2.0.0',
      'image-profile@2.0.0',
      'other-provider',
    ])
  })

  it('lists models that a channel version moves to a new version or newly serves', () => {
    expect(
      catalogSharedImpact(catalogSharedChanges([channel])[0], plan, reviews)
    ).toEqual({
      kind: 'CHANNEL',
      newVersions: ['Version model'],
      newModels: ['Renamed new model'],
    })
  })

  it('links a Profile to its channels and an OpenAPI file to its Profiles', () => {
    expect(
      catalogSharedImpact(catalogSharedChanges([profile])[0], plan, reviews)
    ).toEqual({ kind: 'PROFILE', channels: ['image-channel'] })
    expect(
      catalogSharedImpact(catalogSharedChanges([openapi])[0], plan, reviews)
    ).toEqual({ kind: 'OPENAPI', profiles: ['image-profile@2.0.0'] })
  })

  it('attaches the blocking diagnostic to a conflict and nothing to an unchanged row', () => {
    expect(
      catalogSharedImpact(catalogSharedChanges([provider])[0], plan, reviews)
    ).toEqual({ kind: 'CONFLICT', diagnostic: diagnostics[0] })
    expect(
      catalogSharedImpact(catalogSharedChanges([unchanged])[0], plan, reviews)
    ).toEqual({ kind: 'NONE' })
  })

  it('locates model and shared-resource diagnostics, and none for a Bundle-level conflict', () => {
    expect(
      catalogDiagnosticTarget(
        catalogDiagnostic({
          code: 'PRICING_SOURCE_CONFLICT',
          params: { modelKey: 'a.version' },
        })
      )
    ).toEqual({ tab: 'models', key: 'a.version' })
    expect(catalogDiagnosticTarget(diagnostics[0])).toEqual({
      tab: 'shared',
      resourceType: 'PROVIDER',
      key: 'image-provider',
    })
    expect(
      catalogDiagnosticTarget(
        catalogDiagnostic({
          code: 'BUNDLE_VERSION_CONFLICT',
          params: { bundleVersion: '1' },
        })
      )
    ).toBeNull()
  })
})

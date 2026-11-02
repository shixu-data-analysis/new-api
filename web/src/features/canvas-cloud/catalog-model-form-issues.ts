/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// The checks of the model form. They run on any model of the page, not only the one on screen, so a model added
// without being opened is checked before the page publishes it.
import { defaultParamsIssues } from '@pixmiao/model-catalog/request-validator'
import type { TFunction } from 'i18next'

import {
  groupIssues,
  groupsOfProvider,
  type GroupChoice,
  type NewGroupDraft,
} from './catalog-credential-groups'
import {
  contractOfProfile,
  profileOfChannel,
  sentFieldsOf,
  sizeParamOf,
  upstreamModelIdsOf,
  type SentFields,
} from './catalog-edit-logic'
import type {
  CatalogModelDefinition,
  CurrentCatalogView,
} from './catalog-edit-types'

/** What a model's Channel sends, which decides the rows the form asks for. */
export interface ChannelSends {
  sent: SentFields
  sizeParam: string | undefined
}

export function channelSendsOf(
  catalog: CurrentCatalogView,
  channelId: string
): ChannelSends {
  const profile = profileOfChannel(catalog, channelId)
  const contract = profile ? contractOfProfile(catalog, profile) : undefined
  return {
    sent: sentFieldsOf(profile, contract),
    sizeParam: sizeParamOf(profile),
  }
}

export interface ModelFormCheck extends ChannelSends {
  draft: CatalogModelDefinition
  kind: 'new' | 'copy' | 'edit'
  /** The model copied or edited. */
  source: CatalogModelDefinition | null
  /** The other models published with this one. */
  others: CatalogModelDefinition[]
  groupChoice: GroupChoice
  newGroup: NewGroupDraft
  catalog: CurrentCatalogView
}

/** What the form marks on a model, by field: translated messages. */
export function modelFormIssues(
  check: ModelFormCheck,
  t: TFunction
): Record<string, string> {
  const {
    draft,
    kind,
    source,
    others,
    groupChoice,
    newGroup,
    catalog,
    sent,
    sizeParam,
  } = check
  const providerId = catalog.bundle.providers.find(
    (entry) =>
      entry.id ===
      catalog.bundle.channels.find(
        (channel) => channel.id === draft.release.channelId
      )?.providerId
  )?.id
  const found: Record<string, string> = {}
  const interaction = draft.release.publicInteraction
  const qualityList = (interaction.paramSchema.qualities ?? []) as string[]
  if (!draft.release.channelId) {
    found.channel = t('Choose a Channel configuration')
  }
  const providerModel = draft.release.execution.providerModel
  const upstreamIds =
    'modelId' in providerModel
      ? [providerModel.modelId]
      : qualityList.map(
          (quality) => providerModel.modelIdByQuality[quality] ?? ''
        )
  if (draft.release.channelId) {
    const sameChannel = (model: CatalogModelDefinition) =>
      model.release.channelId === draft.release.channelId &&
      upstreamModelIdsOf(model).some((id) => upstreamIds.includes(id))
    const clash = catalog.bundle.models.find(
      (model) =>
        !(kind === 'edit' && model.productKey === source?.productKey) &&
        sameChannel(model)
    )
    if (!upstreamIds.length) found.upstream = t('Add at least one resolution')
    else if (upstreamIds.some((id) => !id.trim())) {
      found.upstream = t('Enter the upstream model ID')
    } else if (clash) {
      found.upstream = t(
        'This Channel already has a model using this upstream model ID: {{name}} ({{key}})',
        { name: clash.displayName, key: clash.productKey }
      )
    } else if (others.some(sameChannel)) {
      found.upstream = t(
        'Another model added this time has the same upstream model ID'
      )
    }
  }
  if (kind !== 'edit') {
    const name = draft.displayName.trim()
    if (!name) found.displayName = t('Enter a display name')
    else if (
      kind === 'copy' &&
      source &&
      (name === source.displayName ||
        name === t('{{name}} copy', { name: source.displayName }))
    ) {
      found.displayName = t(
        'Change the name: it cannot match the source model or the default copy name'
      )
    }
    if (!draft.productKey) found.productKey = t('Enter a product key')
    else if (
      !/^[a-z0-9-]+\.(image|video|chat)\.[a-z0-9.-]+$/.test(draft.productKey)
    ) {
      found.productKey = t(
        'Use lowercase letters, numbers, dots and hyphens, as API provider.type.name'
      )
    } else if (draft.productKey.length > 128) {
      found.productKey = t('The product key can have at most 128 characters')
    } else if (catalog.retiredModelKeys.includes(draft.productKey)) {
      found.productKey = t('This product key belongs to a deleted model.')
    } else if (
      catalog.bundle.models.some(
        (model) => model.productKey === draft.productKey
      )
    ) {
      found.productKey = t('This product key already exists')
    } else if (others.some((entry) => entry.productKey === draft.productKey)) {
      found.productKey = t(
        'Another model added this time has the same product key'
      )
    }
    for (const [field, key] of Object.entries(
      groupIssues(groupChoice, newGroup, groupsOfProvider(catalog, providerId))
    )) {
      found[field] = t(key)
    }
  }
  const ratios = (interaction.paramSchema.aspectRatios ?? []) as string[]
  if (draft.capability !== 'chat.generate') {
    if (sent.aspectRatio.length && !ratios.length) {
      found['paramSchema.aspectRatios'] = t(
        'Choose at least one aspect ratio: the Channel sends it'
      )
    }
    if (sizeParam) {
      const sizeMap = (interaction.defaultParams.sizeMap ?? {}) as Record<
        string,
        Record<string, string>
      >
      const missing = ratios.flatMap((ratio) =>
        qualityList
          .filter((quality) => !sizeMap[ratio]?.[quality])
          .map((quality) => `${ratio} × ${quality}`)
      )
      if (missing.length > 4) {
        found['defaultParams.sizeMap'] = t(
          'The size table has {{count}} empty cells: {{cells}} and more',
          { count: missing.length, cells: missing.slice(0, 4).join(', ') }
        )
      } else if (missing.length) {
        found['defaultParams.sizeMap'] = t(
          'The size table has {{count}} empty cells: {{cells}}',
          { count: missing.length, cells: missing.join(', ') }
        )
      }
    }
  }
  for (const field of sent.modelFields) {
    if (
      !((interaction.paramSchema.options ?? []) as Array<{ key: string }>).some(
        (option) => option.key === field.key
      ) &&
      interaction.defaultParams[field.key] === undefined
    ) {
      found[`defaultParams.${field.key}`] = t('Please fill in')
    }
  }
  // The shared request validator, as the Cloud checks a task; only worth reading once the form itself is complete.
  if (draft.capability !== 'chat.generate' && Object.keys(found).length === 0) {
    const labels: Record<string, string> = {
      aspectRatio: t('Aspect ratio'),
      quality: t('Quality tier'),
      apiQuality: t('Image quality'),
      durationSeconds: t('Length'),
      batchSize: t('Count'),
      generateAudio: t('Generate audio'),
    }
    for (const issue of defaultParamsIssues(interaction)) {
      found[`defaultParams.${issue.field}`] = t(
        'The default {{field}} is outside the parameter range',
        { field: labels[issue.field] ?? issue.field }
      )
    }
  }
  return found
}

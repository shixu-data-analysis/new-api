/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// Fill from JSON: the Catalog's own objects, pasted, fill the form, which then checks and publishes them as usual.
// An object comes after what it needs: API provider, then Channel configuration, then model.
import { modelDefinitionIssue } from '@pixmiao/model-catalog/catalog-definitions'

import { findOperation } from './catalog-channel-draft'
import { contractOfProfile, profileOfChannel } from './catalog-edit-logic'
import type {
  CatalogJson,
  CatalogModelDefinition,
  CurrentCatalogView,
} from './catalog-edit-types'

/** A problem as an i18n key; `inner` is a problem of one item, translated into `issue`. */
export interface JsonIssue {
  key: string
  values?: Record<string, string | number>
  inner?: JsonIssue
}

const isObject = (value: unknown): value is CatalogJson =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** A parse error names the line, so a long paste can be fixed where it broke. */
export function jsonSyntaxIssue(text: string, error: SyntaxError): JsonIssue {
  const message = error.message
    .replace(/ in JSON at position \d+.*$/, '')
    .replace(/ \(line \d+ column \d+\)$/, '')
  const located = /line (\d+) column (\d+)/.exec(error.message)
  if (located) {
    return {
      key: 'The JSON is not valid at line {{line}}, near character {{column}}: {{message}}',
      values: { line: located[1], column: located[2], message },
    }
  }
  const at = Number(/position (\d+)/.exec(error.message)?.[1])
  if (!Number.isInteger(at)) {
    return { key: 'The JSON is not valid: {{message}}', values: { message } }
  }
  const lines = text.slice(0, at).split('\n')
  return {
    key: 'The JSON is not valid at line {{line}}, near character {{column}}: {{message}}',
    values: {
      line: lines.length,
      column: (lines.at(-1)?.length ?? 0) + 1,
      message,
    },
  }
}

/** What a pasted model must be before it can fill the form; the form's own checks cover the rest. */
function modelShapeIssue(model: unknown): JsonIssue | null {
  if (!isObject(model)) {
    return { key: 'Paste one model object: an item of models in models.json' }
  }
  // The Catalog's own structure check: the form reads every field it defines, so a wrong kind of value is refused here.
  const issue = modelDefinitionIssue(model)
  return issue
    ? { key: 'Not a model of models.json: {{issue}}', values: { issue } }
    : null
}

/**
 * A pasted model as the form holds it. A model of models.json may leave out its product key and name, which the page
 * generates or asks for; the form holds them as empty text until they are filled in.
 */
export function formModel(
  model: CatalogModelDefinition
): CatalogModelDefinition {
  return {
    ...model,
    productKey: model.productKey ?? '',
    displayName: model.displayName ?? '',
  }
}

export interface ChannelJson {
  provider?: CatalogJson
  channel: CatalogJson & { id: string; providerId: string }
  profile: CatalogJson
  openapi: CatalogJson
  models?: CatalogModelDefinition[]
}

/** What keeps a pasted Channel configuration from filling the form; null when it can. */
export function channelJsonIssue(
  json: unknown,
  catalog: CurrentCatalogView,
  capabilities: string[]
): JsonIssue | null {
  if (!isObject(json)) {
    return { key: 'Paste one object holding channel, profile and openapi' }
  }
  const missing = ['channel', 'profile', 'openapi'].filter(
    (key) => !isObject(json[key])
  )
  if (missing.length) {
    return { key: 'Missing: {{keys}}', values: { keys: missing.join(', ') } }
  }
  const { provider, models } = json
  const channel = json.channel as CatalogJson
  const profile = json.profile as CatalogJson
  const openapi = json.openapi as CatalogJson
  if (!capabilities.includes(String(profile.kind))) {
    return {
      key: 'profile.kind must be one of {{kinds}}',
      values: { kinds: capabilities.join(', ') },
    }
  }
  const providerId = String(channel.providerId ?? '')
  if (!providerId || !String(channel.id ?? '').startsWith(`${providerId}.`)) {
    return {
      key: 'channel.id must start with the API provider code and a dot, such as acme.wan-video, and channel.providerId must be given',
    }
  }
  if ((channel.adapterProfile as CatalogJson | undefined)?.id !== profile.id) {
    return { key: 'channel.adapterProfile.id must equal profile.id' }
  }
  if (provider !== undefined && (provider as CatalogJson)?.id !== providerId) {
    return {
      key: 'provider.id must equal channel.providerId ({{id}}): paste the API provider the Channel configuration belongs to',
      values: { id: providerId },
    }
  }
  const known = catalog.bundle.providers.some(
    (entry) => entry.id === providerId
  )
  if (!known && provider === undefined) {
    return {
      key: 'API provider {{id}} does not exist. A Channel configuration needs its API provider first: use an existing one, or paste provider with it to create it',
      values: { id: providerId },
    }
  }
  const operations = (profile.operations ?? {}) as CatalogJson
  if (!operations.submit) return { key: 'profile.operations has no submit' }
  const missingOperations = Object.values(operations).filter(
    (id) => !findOperation(openapi, id)
  )
  if (missingOperations.length) {
    return {
      key: 'openapi has no operationId {{ids}}',
      values: { ids: missingOperations.join(', ') },
    }
  }
  if (models === undefined) return null
  if (!Array.isArray(models)) return { key: 'models must be an array' }
  for (const [index, model] of models.entries()) {
    const inner =
      modelShapeIssue(model) ??
      pastedModelIssue(model as CatalogJson, String(profile.kind), channel.id)
    if (inner) {
      return {
        key: 'Model {{n}} of models: {{issue}}',
        values: { n: index + 1 },
        inner,
      }
    }
  }
  return null
}

function pastedModelIssue(
  model: CatalogJson,
  kind: string,
  channelId: unknown
): JsonIssue | null {
  if (model.capability !== kind) {
    return { key: 'capability must be {{kind}}', values: { kind } }
  }
  const release = model.release as CatalogJson
  if (release.channelId !== channelId) {
    return {
      key: 'release.channelId must be {{id}}',
      values: { id: String(channelId) },
    }
  }
  return null
}

/** Values the page sets by its own rules and so does not take from the paste, listed so nothing changes unseen. */
export function pastedNotes(
  json: ChannelJson,
  catalog: CurrentCatalogView
): JsonIssue[] {
  const { provider, channel } = json
  const known = catalog.bundle.providers.some(
    (entry) => entry.id === channel.providerId
  )
  const differs = (
    pasted: CatalogJson | undefined,
    kept: CatalogJson,
    prefix: string
  ) =>
    Object.keys(pasted ?? {})
      .filter(
        (key) =>
          !(key in kept) ||
          JSON.stringify(pasted?.[key]) !== JSON.stringify(kept[key])
      )
      .map((key) => `${prefix}.${key}`)
  const notes: JsonIssue[] = []
  if (known && provider) {
    notes.push({
      key: 'API provider {{id}} already exists, so its settings stay and the pasted provider is not used. To change its root address, edit it on the API providers tab',
      values: { id: channel.providerId },
    })
  }
  const ignored = [
    ...(known || !provider
      ? []
      : differs(
          provider,
          {
            id: provider.id,
            internalName: provider.internalName,
            sourceKind: provider.sourceKind,
            baseUrl: provider.baseUrl,
            internalOnly: true,
            trustPolicy: 'public-only',
            credentialSchemes: ['bearerAuth'],
          },
          'provider'
        )),
    ...differs(
      channel,
      {
        id: channel.id,
        providerId: channel.providerId,
        adapterProfile: channel.adapterProfile,
        internalOnly: true,
      },
      'channel'
    ),
  ]
  if (ignored.length) {
    notes.push({
      key: 'These values follow the rules of the page and are not taken from the paste: {{fields}}',
      values: { fields: ignored.join(', ') },
    })
  }
  return notes
}

/** A live Channel configuration under a new code, with one of its models, so the example fills in without a clash. */
export function channelJsonExample(
  catalog: CurrentCatalogView,
  channelId: string
): string {
  const channel = catalog.bundle.channels.find(
    (entry) => entry.id === channelId
  )
  const profile = profileOfChannel(catalog, channelId)
  if (!channel || !profile) return ''
  const copyId = `${channelId}-copy`
  const model = catalog.bundle.models.find(
    (entry) => entry.release.channelId === channelId
  )
  const { productKey: _key, ...definition } = model
    ? structuredClone(model)
    : ({} as CatalogModelDefinition)
  return JSON.stringify(
    {
      channel: {
        ...structuredClone(channel),
        id: copyId,
        adapterProfile: { ...channel.adapterProfile, id: copyId },
      },
      profile: { ...structuredClone(profile), id: copyId },
      openapi: contractOfProfile(catalog, profile) ?? {},
      ...(model
        ? {
            models: [
              {
                ...definition,
                release: { ...definition.release, channelId: copyId },
              },
            ],
          }
        : {}),
    },
    null,
    2
  )
}

/** Where a pasted model must fit: the Channel configuration a page is for, and the key of an edited model. */
export interface ModelJsonPlace {
  channelId?: string
  productKey?: string
}

/** What keeps a pasted model from filling the form; null when it can. */
export function modelJsonIssue(
  model: unknown,
  catalog: CurrentCatalogView,
  place: ModelJsonPlace
): JsonIssue | null {
  const shape = modelShapeIssue(model)
  if (shape) return shape
  const definition = model as CatalogModelDefinition
  const channelId = definition.release.channelId
  const profile = profileOfChannel(catalog, channelId)
  if (!profile) {
    return {
      key: 'Channel configuration {{id}} does not exist. A model needs its Channel configuration first: create it (its JSON can hold the models too), or use an existing one',
      values: { id: channelId },
    }
  }
  if (place.channelId && channelId !== place.channelId) {
    return {
      key: 'This model belongs to Channel configuration {{id}}; only models of {{fixed}} can be filled here',
      values: { id: channelId, fixed: place.channelId },
    }
  }
  if (definition.capability !== profile.kind) {
    return {
      key: 'capability is {{capability}}, but Channel configuration {{id}} is a {{kind}} interface',
      values: {
        capability: String(definition.capability ?? ''),
        id: channelId,
        kind: String(profile.kind),
      },
    }
  }
  if (place.productKey && definition.productKey !== place.productKey) {
    return {
      key: 'The product key cannot change when editing; it must be {{key}}',
      values: { key: place.productKey },
    }
  }
  return null
}

/** A live model without its product key, so the form makes a new one. */
export function modelJsonExample(
  catalog: CurrentCatalogView,
  productKey: string
): string {
  const model = catalog.bundle.models.find(
    (entry) => entry.productKey === productKey
  )
  if (!model) return ''
  const { productKey: _key, ...definition } = structuredClone(model)
  return JSON.stringify(definition, null, 2)
}

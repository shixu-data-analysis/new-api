/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type {
  CatalogCapability,
  CatalogEditorOptions,
  CatalogJson,
  CatalogModelDefinition,
  CurrentCatalogView,
  ProviderRequestPreview,
} from './catalog-edit-types'

const CAPABILITY_TYPE: Record<CatalogCapability, string> = {
  'image.generate': 'image',
  'video.generate': 'video',
  'chat.generate': 'chat',
}

/** Design 7.2: provider id, type and upstream model ID; other characters become hyphens. */
export function generatedProductKey(
  providerId: string,
  capability: CatalogCapability,
  upstreamModelId: string
): string {
  const id = upstreamModelId
    .toLowerCase()
    .replaceAll(/[^a-z0-9.-]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
  return `${providerId}.${CAPABILITY_TYPE[capability]}.${id}`
}

/** Same rule as the canvas and the Cloud check: positive numbers on both sides. */
export function isValidAspectRatio(value: string): boolean {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(value)
  return match !== null && Number(match[1]) > 0 && Number(match[2]) > 0
}

export function normalizedQuality(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidQuality(value: string): boolean {
  return /^[A-Z0-9._-]+$/.test(value)
}

// D37: a form default only, taken from the Catalog where every model agrees. 2:1 x 4K has two values in use, so it stays empty.
const SIZE_DEFAULTS: Record<string, Record<string, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '5:4': '1040x832',
    '9:16': '720x1280',
    '16:9': '1280x720',
    '4:3': '1024x768',
    '3:2': '1008x672',
    '4:5': '832x1040',
    '3:4': '768x1024',
    '2:3': '672x1008',
    '21:9': '1344x576',
    '2:1': '1440x720',
  },
  '2K': {
    '1:1': '2048x2048',
    '5:4': '2080x1664',
    '9:16': '1152x2048',
    '16:9': '2048x1152',
    '4:3': '2048x1536',
    '3:2': '2016x1344',
    '4:5': '1664x2080',
    '3:4': '1536x2048',
    '2:3': '1344x2016',
    '21:9': '2016x864',
    '2:1': '2048x1024',
  },
  '4K': {
    '1:1': '2880x2880',
    '5:4': '3200x2560',
    '9:16': '2160x3840',
    '16:9': '3840x2160',
    '4:3': '3264x2448',
    '3:2': '3504x2336',
    '4:5': '2560x3200',
    '3:4': '2448x3264',
    '2:3': '2336x3504',
    '21:9': '3696x1584',
  },
}

export function suggestedSize(
  ratio: string,
  quality: string
): string | undefined {
  return SIZE_DEFAULTS[quality]?.[ratio]
}

type SizeMap = Record<string, Record<string, string>>

/**
 * Offers each new cell once, so a cell the administrator cleared stays cleared. Returns the filled map, the cells it
 * offered and how many it filled.
 */
export function prefillSizeMap(
  sizeMap: SizeMap,
  ratios: string[],
  qualities: string[],
  offered: ReadonlySet<string>
): { sizeMap: SizeMap; offered: Set<string>; filled: number } {
  const next: SizeMap = Object.fromEntries(
    Object.entries(sizeMap).map(([ratio, sizes]) => [ratio, { ...sizes }])
  )
  const seen = new Set(offered)
  let filled = 0
  for (const ratio of ratios) {
    for (const quality of qualities) {
      const cell = `${ratio}|${quality}`
      if (seen.has(cell)) continue
      seen.add(cell)
      if (next[ratio]?.[quality]) continue
      const size = suggestedSize(ratio, quality)
      if (!size) continue
      next[ratio] = { ...next[ratio], [quality]: size }
      filled++
    }
  }
  return { sizeMap: next, offered: seen, filled }
}

function sameMembers(left: string[], right: string[]): boolean {
  return (
    left.length === right.length && left.every((entry) => right.includes(entry))
  )
}

/**
 * What follows the chosen aspect ratios and resolutions (design 7.6-6). A value selected again gets its published
 * content back, and the published selection gets its published order, so turning a value off and on is not a change.
 */
export function followSelections(
  previous: CatalogModelDefinition,
  edited: CatalogModelDefinition,
  context: {
    base: CatalogModelDefinition | null
    autoDefaultQuality: boolean
    lastModelId: string
  }
): { model: CatalogModelDefinition; autoDefaultQuality: boolean } {
  const list = (
    model: CatalogModelDefinition | null | undefined,
    field: string
  ) => (model?.release.publicInteraction.paramSchema[field] ?? []) as string[]
  const qualities = list(edited, 'qualities')
  const ratios = list(edited, 'aspectRatios')
  const qualitiesChanged =
    JSON.stringify(list(previous, 'qualities')) !== JSON.stringify(qualities)
  const ratiosChanged =
    JSON.stringify(list(previous, 'aspectRatios')) !== JSON.stringify(ratios)
  const providerModel = edited.release.execution.providerModel
  const defaultQuality = edited.release.publicInteraction.defaultParams.quality
  let autoDefaultQuality = context.autoDefaultQuality
  if (
    !qualitiesChanged &&
    previous.release.publicInteraction.defaultParams.quality !== defaultQuality
  ) {
    autoDefaultQuality = false
  }
  const staleDefaultQuality =
    'modelIdByQuality' in providerModel &&
    defaultQuality !== undefined &&
    providerModel.defaultQuality !== defaultQuality
  if (!qualitiesChanged && !ratiosChanged && !staleDefaultQuality) {
    return { model: edited, autoDefaultQuality }
  }

  const model = structuredClone(edited)
  const interaction = model.release.publicInteraction
  const schema = interaction.paramSchema
  const defaults = interaction.defaultParams
  const baseInteraction = context.base?.release.publicInteraction
  if (
    qualitiesChanged &&
    sameMembers(qualities, list(context.base, 'qualities'))
  ) {
    schema.qualities = [...list(context.base, 'qualities')]
  }
  if (
    ratiosChanged &&
    sameMembers(ratios, list(context.base, 'aspectRatios'))
  ) {
    schema.aspectRatios = [...list(context.base, 'aspectRatios')]
  }

  if (qualitiesChanged) {
    const byQuality = schema.durationRangeByQuality as
      | Record<string, unknown>
      | undefined
    if (byQuality) {
      const baseRanges = (baseInteraction?.paramSchema.durationRangeByQuality ??
        {}) as Record<string, unknown>
      for (const quality of Object.keys(byQuality)) {
        if (!qualities.includes(quality)) delete byQuality[quality]
      }
      for (const quality of qualities) {
        if (baseRanges[quality] && !byQuality[quality]) {
          byQuality[quality] = structuredClone(baseRanges[quality])
        }
      }
    }
    const baseDefault = baseInteraction?.defaultParams.quality as
      | string
      | undefined
    if (
      autoDefaultQuality &&
      baseDefault !== undefined &&
      qualities.includes(baseDefault)
    ) {
      defaults.quality = baseDefault
      autoDefaultQuality = false
    } else if (!qualities.includes(defaults.quality as string)) {
      if (qualities.length) defaults.quality = qualities[0]
      else delete defaults.quality
      autoDefaultQuality = defaults.quality !== baseDefault
    }
  }

  const followedModel = model.release.execution.providerModel
  if ('modelIdByQuality' in followedModel) {
    if (qualitiesChanged) {
      const baseIds =
        (
          context.base?.release.execution.providerModel as
            | { modelIdByQuality?: Record<string, string> }
            | undefined
        )?.modelIdByQuality ?? {}
      // Only the very first row reuses the fixed ID; a further resolution starts empty so it cannot be left unchanged by accident.
      const first = Object.keys(followedModel.modelIdByQuality).length === 0
      followedModel.modelIdByQuality = Object.fromEntries(
        qualities.map((quality) => [
          quality,
          followedModel.modelIdByQuality[quality] ??
            baseIds[quality] ??
            (first ? context.lastModelId : ''),
        ])
      )
    }
    if (typeof defaults.quality === 'string') {
      followedModel.defaultQuality = defaults.quality
    }
  }

  const sizeMap = defaults.sizeMap as SizeMap | undefined
  if (sizeMap && (qualitiesChanged || ratiosChanged)) {
    for (const ratio of Object.keys(sizeMap)) {
      if (!ratios.includes(ratio)) {
        delete sizeMap[ratio]
        continue
      }
      for (const quality of Object.keys(sizeMap[ratio])) {
        if (!qualities.includes(quality)) delete sizeMap[ratio][quality]
      }
    }
    const baseSizes = (baseInteraction?.defaultParams.sizeMap ?? {}) as SizeMap
    for (const ratio of ratios) {
      for (const quality of qualities) {
        const size = baseSizes[ratio]?.[quality]
        if (size !== undefined && sizeMap[ratio]?.[quality] === undefined) {
          sizeMap[ratio] = { ...sizeMap[ratio], [quality]: size }
        }
      }
    }
  }
  return { model, autoDefaultQuality }
}

export function profileOfChannel(
  catalog: CurrentCatalogView,
  channelId: string
): CatalogJson | undefined {
  const channel = catalog.bundle.channels.find(
    (entry) => entry.id === channelId
  )
  if (!channel) return undefined
  return catalog.bundle.adapterProfiles.find(
    (entry) =>
      entry.profile.id === channel.adapterProfile.id &&
      entry.profile.version === channel.adapterProfile.version
  )?.profile
}

export function contractOfProfile(
  catalog: CurrentCatalogView,
  profile: CatalogJson
): CatalogJson | undefined {
  return catalog.bundle.openapiContracts.find((entry) => {
    const name = (entry.path.split('/').at(-1) ?? '').replace(
      '.openapi.json',
      ''
    )
    const version = (entry.document.info as CatalogJson | undefined)?.version
    return `${name}@${String(version)}` === profile.api
  })?.document
}

function path(value: unknown, keys: string[]): unknown {
  let current = value
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as CatalogJson)[key]
  }
  return current
}

export function usageProtocolOf(
  profile: CatalogJson | undefined
): string | undefined {
  const protocol = path(profile, ['advanced', 'response', 'usageProtocol'])
  return typeof protocol === 'string' ? protocol : undefined
}

export function sizeParamOf(
  profile: CatalogJson | undefined
): string | undefined {
  const param = path(profile, [
    'advanced',
    'request',
    'parameterPolicy',
    'sizeParam',
  ])
  return typeof param === 'string' ? param : undefined
}

export interface SentFields {
  aspectRatio: string[]
  quality: string[]
  apiQuality: string[]
  durationSeconds: string[]
  generateAudio: string[]
  watermark: string[]
  batchSize: string[]
  background: string[]
  media: { image: boolean; video: boolean; audio: boolean }
  /** Fields whose value each model sets: a direct reference to a request.rawParams key. */
  modelFields: Array<{
    key: string
    field: string
    type: 'string' | 'number' | 'boolean'
  }>
}

const REQUEST_PARAMS: Array<
  [keyof Omit<SentFields, 'media' | 'modelFields'>, string]
> = [
  ['aspectRatio', 'request.aspectRatio'],
  ['quality', 'request.quality'],
  ['apiQuality', 'request.apiQuality'],
  ['durationSeconds', 'request.durationSeconds'],
  ['generateAudio', 'request.generateAudio'],
  ['watermark', 'request.watermark'],
  ['batchSize', 'request.batchSize'],
  ['background', 'request.background'],
]

function dereferenced(
  contract: CatalogJson | undefined,
  schema: unknown
): CatalogJson | undefined {
  let current = schema as CatalogJson | undefined
  while (typeof current?.$ref === 'string') {
    current = path(contract, current.$ref.replace(/^#\//, '').split('/')) as
      | CatalogJson
      | undefined
  }
  return current
}

function requestSchema(
  contract: CatalogJson | undefined,
  operationId: unknown
): CatalogJson | undefined {
  const paths = (contract?.paths ?? {}) as Record<
    string,
    Record<string, CatalogJson>
  >
  for (const methods of Object.values(paths)) {
    for (const definition of Object.values(methods)) {
      if (definition?.operationId !== operationId) continue
      const content = path(definition, ['requestBody', 'content']) as
        | CatalogJson
        | undefined
      const media = content && Object.values(content)[0]
      return dereferenced(contract, path(media, ['schema']))
    }
  }
  return undefined
}

/** The type the contract declares for a field, following its dotted path through nested objects and references. */
function contractFieldType(
  contract: CatalogJson | undefined,
  schema: CatalogJson | undefined,
  field: string
): unknown {
  let current = schema
  for (const part of field.split('.')) {
    current = dereferenced(contract, path(current, ['properties', part]))
  }
  const type = current?.type
  return Array.isArray(type) ? type.find((entry) => entry !== 'null') : type
}

/** What this Channel sends, read from its templates: design 12.2 decides which form rows appear from this. */
export function sentFieldsOf(
  profile: CatalogJson | undefined,
  contract?: CatalogJson
): SentFields {
  const sent: SentFields = {
    aspectRatio: [],
    quality: [],
    apiQuality: [],
    durationSeconds: [],
    generateAudio: [],
    watermark: [],
    batchSize: [],
    background: [],
    media: { image: false, video: false, audio: false },
    modelFields: [],
  }
  const request = path(profile, ['advanced', 'request']) as
    | CatalogJson
    | undefined
  if (!request) return sent
  const schemas = ['submit', 'submitWithImages'].map((operation) =>
    requestSchema(contract, path(profile, ['operations', operation]))
  )
  const fieldType = (field: string): 'string' | 'number' | 'boolean' => {
    const type = schemas
      .map((schema) => contractFieldType(contract, schema, field))
      .find(Boolean)
    if (type === 'integer' || type === 'number') return 'number'
    return type === 'boolean' ? 'boolean' : 'string'
  }
  const seenModelFields = new Set<string>()
  const walk = (node: unknown, trail: string[]) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry, trail)
      return
    }
    const object = node as CatalogJson
    const call = object.$call
    const ref =
      call === 'omitEmpty' ? path(object, ['args', '0', '$ref']) : object.$ref
    if (typeof ref === 'string') {
      const field = trail.join('.')
      for (const [param, reference] of REQUEST_PARAMS) {
        if (ref === reference && !sent[param].includes(field)) {
          sent[param].push(field)
        }
      }
      const raw = /^request\.rawParams\.([A-Za-z][A-Za-z0-9_]*)$/.exec(ref)
      if (raw && raw[1] !== 'size' && !seenModelFields.has(raw[1])) {
        seenModelFields.add(raw[1])
        sent.modelFields.push({ key: raw[1], field, type: fieldType(field) })
      }
      return
    }
    if (typeof call === 'string' || '$merge' in object || '$if' in object) {
      const text = JSON.stringify(object)
      const field = trail.join('.')
      for (const [param, reference] of REQUEST_PARAMS) {
        if (text.includes(`"${reference}"`) && !sent[param].includes(field)) {
          sent[param].push(field)
        }
      }
      if ('$merge' in object) walk((object.$merge as unknown[]).at(-1), trail)
      return
    }
    for (const [key, value] of Object.entries(object)) {
      walk(value, [...trail, key])
    }
  }
  walk(request.body, [])
  walk(request.bodyWithImages, [])
  const policy = (request.parameterPolicy ?? {}) as CatalogJson
  const add = (
    param: keyof Omit<SentFields, 'media' | 'modelFields'>,
    field: unknown
  ) => {
    if (typeof field === 'string' && !sent[param].includes(field)) {
      sent[param].push(field)
    }
  }
  add('batchSize', policy.countParam)
  add('apiQuality', policy.qualityParam)
  add('aspectRatio', policy.aspectRatioParam)
  add('aspectRatio', policy.sizeParam)
  add('quality', policy.sizeParam)
  const body = JSON.stringify(request)
  sent.media = {
    image: body.includes('media.images'),
    video: body.includes('media.videos'),
    audio: body.includes('media.audios'),
  }
  return sent
}

function leafPaths(value: unknown, prefix: string): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix]
  }
  const entries = Object.entries(value as CatalogJson)
  if (entries.length === 0) return [prefix]
  return entries.flatMap(([key, entry]) =>
    leafPaths(entry, prefix ? `${prefix}\u0000${key}` : key)
  )
}

export function readPath(value: unknown, joined: string): unknown {
  return path(value, joined.split('\u0000'))
}

export function writePath<T>(value: T, joined: string, next: unknown): T {
  const copy = structuredClone(value) as CatalogJson
  const keys = joined.split('\u0000')
  let cursor = copy
  for (const key of keys.slice(0, -1)) {
    if (cursor[key] === null || typeof cursor[key] !== 'object') {
      cursor[key] = {}
    }
    cursor = cursor[key] as CatalogJson
  }
  const [leaf = ''] = keys.slice(-1)
  if (next === undefined) delete cursor[leaf]
  else cursor[leaf] = next
  return copy as T
}

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right)

export function changedPaths(base: unknown, draft: unknown): string[] {
  const paths = new Set([...leafPaths(base, ''), ...leafPaths(draft, '')])
  return [...paths].filter(
    (entry) => entry && !same(readPath(base, entry), readPath(draft, entry))
  )
}

export function displayPath(joined: string): string {
  return joined.replaceAll('\u0000', '.')
}

export interface ReplayConflict {
  path: string
  mine: unknown
  theirs: unknown
}

/** Fields both sides changed to different values: only these need a choice (design 6.2). */
export function replayConflicts(
  base: unknown,
  draft: unknown,
  latest: unknown
): ReplayConflict[] {
  return changedPaths(base, draft)
    .filter(
      (entry) =>
        !same(readPath(base, entry), readPath(latest, entry)) &&
        !same(readPath(draft, entry), readPath(latest, entry))
    )
    .map((entry) => ({
      path: entry,
      mine: readPath(draft, entry),
      theirs: readPath(latest, entry),
    }))
}

/** The new version with my changes applied again, except fields where I chose the new version. */
export function replayChanges<T>(
  base: T,
  draft: T,
  latest: T,
  keepTheirs: ReadonlySet<string>
): T {
  let next = structuredClone(latest)
  for (const entry of changedPaths(base, draft)) {
    if (keepTheirs.has(entry)) continue
    next = writePath(next, entry, structuredClone(readPath(draft, entry)))
  }
  return next
}

function unsupported(
  value: unknown,
  known: readonly string[],
  prefix: string
): string[] {
  if (value === null || typeof value !== 'object') return []
  return Object.keys(value as CatalogJson)
    .filter((key) => !known.includes(key))
    .map((key) => `${prefix}.${key}`)
}

/**
 * Fields with no form control (design 6.3). The known list is the one Cloud owns, plus the two kinds of values that do
 * get a control: declared options, and rawParams keys the Channel reads directly.
 */
export function unsupportedModelFields(
  model: CatalogModelDefinition,
  options: CatalogEditorOptions['supportedFields'],
  profile: CatalogJson | undefined,
  contract?: CatalogJson
): string[] {
  const interaction = model.release.publicInteraction
  const optionKeys = (
    (interaction.paramSchema.options ?? []) as Array<{ key: string }>
  ).map((option) => option.key)
  const modelFieldKeys = sentFieldsOf(profile, contract).modelFields.map(
    (field) => field.key
  )
  const mediaConstraints = (interaction.mediaConstraints ?? {}) as CatalogJson
  return [
    ...unsupported(interaction.paramSchema, options.paramSchema, 'paramSchema'),
    ...unsupported(
      interaction.defaultParams,
      [...options.defaultParams, ...optionKeys, ...modelFieldKeys],
      'defaultParams'
    ),
    ...unsupported(
      interaction.referenceLimits,
      options.referenceLimits,
      'referenceLimits'
    ),
    ...Object.entries(mediaConstraints).flatMap(([kind, value]) =>
      unsupported(value, options.mediaConstraints, `mediaConstraints.${kind}`)
    ),
  ]
}

/** Every live model with fields the form has no control for; it reads two documents per model, so callers memoize it. */
export function unsupportedFieldsOfCatalog(
  catalog: CurrentCatalogView,
  options: CatalogEditorOptions['supportedFields']
): Map<string, string[]> {
  return new Map(
    catalog.bundle.models.flatMap((model) => {
      const profile = profileOfChannel(catalog, model.release.channelId)
      const paths = unsupportedModelFields(
        model,
        options,
        profile,
        profile ? contractOfProfile(catalog, profile) : undefined
      )
      return paths.length
        ? [[model.productKey, paths] as [string, string[]]]
        : []
    })
  )
}

/** The same for a plan: the documents a model will use are those of the plan, which the live catalog may not have yet. */
export function unsupportedFieldsOfPlan(
  models: Array<{
    productKey: string
    channelId: string
    definition: { proposed: CatalogJson }
  }>,
  changes: Array<{
    resourceType: string
    key: string
    detail: CatalogJson
    definition?: { proposed: CatalogJson } | null
  }>,
  options: CatalogEditorOptions['supportedFields']
): Map<string, string[]> {
  const artifact = (key: unknown) =>
    changes.find(
      (change) =>
        change.resourceType === 'MODEL_DEFINITION_ARTIFACT' &&
        change.key === key
    )?.definition?.proposed
  return new Map(
    models.flatMap((model) => {
      const channel = changes.find(
        (change) =>
          change.resourceType === 'PROVIDER_CHANNEL' &&
          change.key === model.channelId
      )
      const profile = artifact(channel?.detail.adapterProfile)
      const paths = unsupportedModelFields(
        model.definition.proposed as unknown as CatalogModelDefinition,
        options,
        profile,
        profile ? artifact(profile.api) : undefined
      )
      return paths.length
        ? [[model.productKey, paths] as [string, string[]]]
        : []
    })
  )
}

export function upstreamModelIdsOf(model: CatalogModelDefinition): string[] {
  const providerModel = model.release.execution.providerModel
  return 'modelId' in providerModel
    ? [providerModel.modelId]
    : Object.values(providerModel.modelIdByQuality)
}

export function requestText(
  request: Extract<ProviderRequestPreview, { ok: true }>,
  keyLabel: string
): string {
  const body =
    request.body === null ? '' : `\n\n${JSON.stringify(request.body, null, 2)}`
  return `${request.method} ${request.url}\nAuthorization: Bearer <${keyLabel}>\nContent-Type: ${request.contentType ?? '-'}${body}`
}

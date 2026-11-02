/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  compileParts,
  contentTemplate,
  defaultListParts,
  parseParts,
  type ShapeParts,
} from './catalog-channel-shapes'
// The Channel form's state: reads a Profile and contract into rows, and writes them back. Only what the form controls is
// rewritten, so opening a Channel and changing nothing produces the same documents.
import type { CatalogJson } from './catalog-edit-types'
import { normalizedProviderRequest } from './executor-shared/providerRequestValues'
import {
  evaluateTemplate,
  TemplateLanguageError,
  type TemplateContext,
} from './executor-shared/templateLanguageV1'

const REF = (path: string) => ({ $ref: path })
const OMIT_EMPTY = (node: unknown) => ({ $call: 'omitEmpty', args: [node] })
const LIST = (from: string) =>
  OMIT_EMPTY({
    $map: { from: REF(from), as: 'item', template: REF('item.url') },
  })
const MAP_FIELD = (from: string, field: string) => ({
  $map: { from: REF(from), as: 'item', template: REF(`item.${field}`) },
})
const BY_ROLE = (name: string, role: string) =>
  OMIT_EMPTY({ $call: name, args: [REF('media.images'), role] })

export const SCALAR_REFS: Record<string, string> = {
  upstreamId: 'model.upstreamId',
  prompt: 'request.prompt',
  aspectRatio: 'request.aspectRatio',
  quality: 'request.quality',
  durationSeconds: 'request.durationSeconds',
  generateAudio: 'request.generateAudio',
  batchSize: 'request.batchSize',
  watermark: 'request.watermark',
  background: 'request.background',
  maxTokens: 'request.maxTokens',
}

type RoleMap = Record<string, string>
export const MEDIA_TEMPLATES: Record<string, (roles: RoleMap) => unknown> = {
  promptOptional: () => OMIT_EMPTY(REF('request.prompt')),
  imageOne: (roles) =>
    BY_ROLE('mediaUrlByRole', roles['image-reference'] || 'image-reference'),
  messages: () => [{ role: 'user', content: REF('request.prompt') }],
  negativePrompt: () => OMIT_EMPTY(REF('request.negativePrompt')),
  orientation: () => ({
    $call: 'orientationForRatio',
    args: [REF('request.aspectRatio')],
  }),
  modelSize: () => OMIT_EMPTY(REF('request.rawParams.size')),
  imageFiles: () => MAP_FIELD('media.images', 'file'),
  imagesBase64: () => MAP_FIELD('media.images', 'data'),
  videoFiles: () => MAP_FIELD('media.videos', 'file'),
  videosBase64: () => MAP_FIELD('media.videos', 'data'),
  audioFiles: () => MAP_FIELD('media.audios', 'file'),
  audiosBase64: () => MAP_FIELD('media.audios', 'data'),
  imagesAlways: () => MAP_FIELD('media.images', 'url'),
  images: () => LIST('media.images'),
  videos: () => LIST('media.videos'),
  audios: () => LIST('media.audios'),
  imagesByRole: (roles) =>
    BY_ROLE('mediaUrlsByRole', roles['image-reference'] || 'image-reference'),
  firstFrame: (roles) =>
    BY_ROLE('mediaUrlByRole', roles['first-frame'] || 'first-frame'),
  lastFrame: (roles) =>
    BY_ROLE('mediaUrlByRole', roles['last-frame'] || 'last-frame'),
}

const POLICY_KEYS: Record<string, string> = {
  size: 'sizeParam',
  apiQuality: 'qualityParam',
  count: 'countParam',
  ratio: 'aspectRatioParam',
}
const TRANSFORMS = new Set([
  'lowercase',
  'uppercase',
  'trim',
  'number',
  'integer',
  'boolean',
])
const OPTION_REF = /^request\.rawParams\.([A-Za-z][A-Za-z0-9_]*)$/

export interface RequestRow {
  field: string
  source: string
  transform: string
  optionKey?: string
  direct?: boolean
  paramType?: 'string' | 'number' | 'boolean'
  fixed?: string
  fixedType?: 'string' | 'number' | 'boolean'
  rawDefault?: boolean
  expr?: string
  /** contentParts (text and materials in one list) and shaped (items with a shape) keep each part's send content. */
  parts?: ShapeParts
  /** A frame alone in its field sent as a list holding only it. */
  asList?: boolean
  /** The shape every image shared before a frame or the references took their own. */
  sharedShape?: string
}

// Cloud stores a Profile as jsonb, which reorders keys, so a template is compared by content and never by its text.
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as CatalogJson)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortedKeys(entry)])
  )
}
export const sameDocument = (left: unknown, right: unknown) =>
  JSON.stringify(sortedKeys(left)) === JSON.stringify(sortedKeys(right))

// Only video and image forms edit send content; elsewhere the same template stays an expression.
function parseValue(
  node: unknown,
  roles: RoleMap,
  shapes: boolean
): Omit<RequestRow, 'field'> {
  let inner = node as CatalogJson | null
  let transform = ''
  if (
    inner &&
    TRANSFORMS.has(String(inner.$call)) &&
    Array.isArray(inner.args) &&
    inner.args.length === 1
  ) {
    transform = String(inner.$call)
    inner = inner.args[0] as CatalogJson
  }
  const scalar = Object.entries(SCALAR_REFS).find(
    ([, path]) => inner?.$ref === path
  )
  if (scalar) return { source: scalar[0], transform }
  const option = OPTION_REF.exec(String(inner?.$ref ?? ''))
  if (option && option[1] !== 'size') {
    return { source: 'option', optionKey: option[1], transform, direct: true }
  }
  const call = node as CatalogJson | null
  const optional =
    call?.$call === 'omitEmpty'
      ? OPTION_REF.exec(
          String((call.args as CatalogJson[] | undefined)?.[0]?.$ref ?? '')
        )
      : null
  if (optional && optional[1] !== 'size') {
    return { source: 'option', optionKey: optional[1], transform: '' }
  }
  for (const video of [true, false]) {
    for (const audio of [true, false]) {
      if (sameDocument(node, contentTemplate(roles, { video, audio }))) {
        return {
          source: 'contentParts',
          parts: defaultListParts(roles, { video, audio }),
          transform: '',
        }
      }
    }
  }
  const media = Object.entries(MEDIA_TEMPLATES).find(([, make]) =>
    sameDocument(node, make(roles))
  )
  if (media) return { source: media[0], transform: '' }
  // A template that does not come back unchanged from its parts stays an expression.
  const parts =
    shapes && node && typeof node === 'object' ? parseParts(node, roles) : null
  if (
    parts &&
    sameDocument(node, compileParts(parts, roles, 'text' in parts))
  ) {
    return {
      source: 'text' in parts ? 'contentParts' : 'shaped',
      parts,
      transform: '',
    }
  }
  if (parts && sameDocument(node, compileParts(parts, roles, false, true))) {
    return { source: 'shaped', parts, asList: true, transform: '' }
  }
  if (node === null || typeof node !== 'object') {
    return {
      source: 'fixed',
      fixed: String(node),
      fixedType:
        typeof node === 'number' || typeof node === 'boolean'
          ? (typeof node as 'number' | 'boolean')
          : 'string',
      transform: '',
    }
  }
  return { source: 'expr', expr: JSON.stringify(node, null, 2), transform: '' }
}

export function parseRows(
  template: unknown,
  policy: CatalogJson | null,
  roles: RoleMap,
  shapes = false
): { rows: RequestRow[]; wrap: boolean } {
  const merge = (template as CatalogJson | null)?.$merge as
    | unknown[]
    | undefined
  const wrap =
    Array.isArray(merge) &&
    (merge[0] as CatalogJson)?.$ref === 'request.rawParams'
  const fields = ((wrap ? merge[1] : template) ?? {}) as CatalogJson
  const isPlain = (node: unknown) =>
    Boolean(node) &&
    typeof node === 'object' &&
    !Array.isArray(node) &&
    Object.keys(node as object).length > 0 &&
    !Object.keys(node as object).some(
      (key) => key.startsWith('$') || key.includes('.')
    )
  const flatten = (prefix: string, object: CatalogJson): RequestRow[] =>
    Object.entries(object).flatMap(([key, node]) =>
      isPlain(node)
        ? flatten(`${prefix}${key}.`, node as CatalogJson)
        : [{ field: `${prefix}${key}`, ...parseValue(node, roles, shapes) }]
    )
  const rows = flatten('', fields)
  if (policy) {
    for (const [source, key] of Object.entries(POLICY_KEYS)) {
      if (policy[key]) {
        rows.push({ field: String(policy[key]), source, transform: '' })
      }
    }
    for (const [field, value] of Object.entries(
      (policy.rawDefaults ?? {}) as CatalogJson
    )) {
      rows.push({
        field,
        source: 'fixed',
        fixed: String(value),
        fixedType:
          typeof value === 'number' || typeof value === 'boolean'
            ? (typeof value as 'number' | 'boolean')
            : 'string',
        transform: '',
        rawDefault: true,
      })
    }
  }
  return { rows, wrap }
}

export function paramKeyOf(field: string): string {
  const path = field.trim().replaceAll('.', '_')
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(path)
    ? path
    : `p_${[...path].map((character) => character.charCodeAt(0).toString(36)).join('')}`
}

function fixedValue(row: RequestRow): unknown {
  const text = String(row.fixed ?? '').trim()
  if (row.fixedType === 'number') return text === '' ? null : Number(text)
  if (row.fixedType === 'boolean') return text === 'true'
  return String(row.fixed ?? '')
}

/** The template one request row sends. */
export function requestRowTemplate(row: RequestRow, roles: RoleMap): unknown {
  if (row.source === 'fixed') return fixedValue(row)
  if (row.source === 'expr') {
    try {
      return JSON.parse(row.expr || 'null')
    } catch {
      return null
    }
  }
  if (row.source === 'contentParts' || row.source === 'shaped') {
    return compileParts(
      row.parts ?? defaultListParts(roles),
      roles,
      row.source === 'contentParts',
      row.asList
    )
  }
  const media = MEDIA_TEMPLATES[row.source]
  if (media) return media(roles)
  if (row.source === 'option') {
    const reference = REF(
      `request.rawParams.${row.optionKey ?? paramKeyOf(row.field)}`
    )
    return row.direct ? reference : OMIT_EMPTY(reference)
  }
  const reference = REF(SCALAR_REFS[row.source] ?? '')
  return row.transform ? { $call: row.transform, args: [reference] } : reference
}

function requestTemplate(
  rows: RequestRow[],
  wrap: boolean,
  roles: RoleMap
): unknown {
  const fields: CatalogJson = {}
  const named = rows.filter(
    (row) =>
      row.field.trim() &&
      !rows.some((other) =>
        other.field.trim().startsWith(`${row.field.trim()}.`)
      )
  )
  for (const row of named.filter(
    (entry) => !POLICY_KEYS[entry.source] && !entry.rawDefault
  )) {
    const parts = row.field.trim().split('.')
    let parent = fields
    for (const part of parts.slice(0, -1)) {
      parent = (parent[part] ??= {}) as CatalogJson
    }
    const [leaf = ''] = parts.slice(-1)
    parent[leaf] = requestRowTemplate(row, roles)
  }
  return wrap ? { $merge: [REF('request.rawParams'), fields] } : fields
}

export type MaterialKind = 'first' | 'last' | 'reference' | 'video' | 'audio'
export type Accepts = Partial<Record<MaterialKind, boolean>>
export type Slot = 'prompt' | 'first' | 'last' | 'images' | 'videos' | 'audios'

/** What the form remembers while it edits materials by mode; none of it is stored in the Profile. */
export interface MaterialsMemory {
  /** The acceptance switches: a loaded interface starts from what it measurably sends, a blank one from nothing. */
  accepts: Accepts | null
  slotAbsent: Partial<Record<'first' | 'last', boolean>>
  shapeMemory: Partial<Record<Slot, string>>
  fieldRows: RequestRow[]
  exprRows: RequestRow[]
  listField?: string
  listParts?: ShapeParts
  partMemory: Partial<Record<MaterialKind, string>>
  /** Role names replaced to tell frames from references, put back when nothing picks by role any more. */
  roleMemory: Record<string, string | undefined> | null
}

export const blankMaterialsMemory = (): MaterialsMemory => ({
  accepts: null,
  slotAbsent: {},
  shapeMemory: {},
  fieldRows: [],
  exprRows: [],
  partMemory: {},
  roleMemory: null,
})

export type OperationDraft = { method: string; path: string; format?: string }

export interface ChannelDraft {
  name: string
  displayName: string
  description: string
  capability: string
  workflow: string
  submit: OperationDraft
  images: OperationDraft | null
  poll: OperationDraft & { taskIdIn: 'path' | 'query'; queryName: string }
  prepareAsset: OperationDraft
  pollAsset: OperationDraft
  asset: Record<MediaKind, AssetPrepareDraft>
  rows: RequestRow[]
  imageRows: RequestRow[]
  wrap: boolean
  roleMap: RoleMap
  media: Record<'image' | 'video' | 'audio', string>
  taskIdPath: string
  statusPath: string
  outputPaths: string
  errorPaths: string
  states: Record<'pending' | 'running' | 'succeeded' | 'failed', string>
  usageProtocol: string
  streaming: boolean
  submitTaskId: string
  submitStatus: string
  idempotencyHeader: string
  maxMultipartBytes: string
  promptImage: string
  promptVideo: string
  promptAudio: string
  pollIntervalMs: string
  baseUrlMode: string
  materials: MaterialsMemory
}

export type MediaKind = 'image' | 'video' | 'audio'

/** The placeholder of a task or material ID in a path; `{model}` is the upstream model ID instead. */
export const POLL_ID = /\{(?!model\})([^}]+)\}/

type PollDraft = ChannelDraft['poll']

/** The task ID lives in one place, so moving it edits the path and the parameter name together. */
export function movePollTaskId(
  poll: PollDraft,
  taskIdIn: PollDraft['taskIdIn']
): PollDraft {
  const path = poll.path.trim()
  if (taskIdIn === 'query') {
    const found = path.match(POLL_ID)
    if (!found) return { ...poll, taskIdIn }
    return {
      ...poll,
      taskIdIn,
      path: path.replace(`/${found[0]}`, '').replace(found[0], '') || '/',
      queryName: found[1],
    }
  }
  if (!path || POLL_ID.test(path)) return { ...poll, taskIdIn }
  return {
    ...poll,
    taskIdIn,
    path: `${path.replace(/\/$/, '')}/{${poll.queryName.trim() || 'taskId'}}`,
  }
}

/** How one kind of material is uploaded to the upstream before the task is submitted. */
export interface AssetPrepareDraft {
  body: string
  remoteIdPaths: string
  statusPaths: string
  readyValues: string
  pendingValues: string
  failedValues: string
  expiresInSeconds: string
}

const blankAssetPrepare = (): AssetPrepareDraft => ({
  body: '{}',
  remoteIdPaths: '',
  statusPaths: '',
  readyValues: '',
  pendingValues: '',
  failedValues: '',
  expiresInSeconds: '',
})

function assetPrepareFrom(prepare: CatalogJson | undefined): AssetPrepareDraft {
  if (!prepare) return blankAssetPrepare()
  const list = (key: string) => ((prepare[key] ?? []) as string[]).join(', ')
  return {
    body: JSON.stringify(prepare.body ?? {}, null, 2),
    remoteIdPaths: list('remoteIdPaths'),
    statusPaths: list('statusPaths'),
    readyValues: list('readyValues'),
    pendingValues: list('pendingValues'),
    failedValues: list('failedValues'),
    expiresInSeconds:
      prepare.expiresInSeconds === undefined
        ? ''
        : String(prepare.expiresInSeconds),
  }
}

function assetPrepareOf(draft: AssetPrepareDraft): CatalogJson {
  let body: unknown = {}
  try {
    body = JSON.parse(draft.body)
  } catch {
    /* channelIssues refuses invalid JSON before anything is sent */
  }
  const seconds = Number(draft.expiresInSeconds)
  return {
    body,
    remoteIdPaths: toList(draft.remoteIdPaths),
    statusPaths: toList(draft.statusPaths),
    readyValues: toList(draft.readyValues),
    pendingValues: toList(draft.pendingValues),
    failedValues: toList(draft.failedValues),
    ...(Number.isSafeInteger(seconds) && seconds > 0
      ? { expiresInSeconds: seconds }
      : {}),
  }
}

export const toList = (text: string) =>
  text
    .split(/[,，]/)
    .map((entry) => entry.trim())
    .filter(Boolean)

/** `data.id` in the form, `/data/id` stored; a pasted pointer is accepted as it is. */
export function pathToPointer(path: string): string {
  const trimmed = path.trim()
  if (trimmed.startsWith('/')) return trimmed
  return `/${trimmed
    .replaceAll('[]', '/0')
    .replaceAll(/\[(\d+)\]/g, '/$1')
    .replaceAll('.', '/')}`
}

export function pointerToPath(pointer: string): string {
  return pointer
    .replace(/^\//, '')
    .replaceAll(/\/(\d+)(?=\/|$)/g, '[$1]')
    .replaceAll('/', '.')
}

function pointersAsPaths(value: unknown): string {
  return [value ?? []]
    .flat()
    .map((entry) => pointerToPath(String(entry)))
    .join(', ')
}

type Operation = { method: string; path: string; definition: CatalogJson }

export function findOperation(
  contract: CatalogJson,
  id: unknown
): Operation | undefined {
  for (const [path, methods] of Object.entries(
    (contract.paths ?? {}) as Record<string, Record<string, CatalogJson>>
  )) {
    for (const [method, definition] of Object.entries(methods)) {
      if (definition?.operationId === id) {
        return { method: method.toUpperCase(), path, definition }
      }
    }
  }
  return undefined
}

function operationDraft(
  contract: CatalogJson,
  id: unknown
): OperationDraft | null {
  const found = findOperation(contract, id)
  if (!found) return null
  const content = ((found.definition.requestBody as CatalogJson | undefined)
    ?.content ?? {}) as CatalogJson
  return {
    method: found.method,
    path: found.path,
    format: Object.keys(content)[0] ?? 'application/json',
  }
}

const STREAM_OPTIONS: RequestRow = {
  field: 'stream_options.include_usage',
  source: 'fixed',
  fixed: 'true',
  fixedType: 'boolean',
  transform: '',
}
const STREAM_OUTPUT = 'outputs[]'

/** The request asks for a stream through these fields, and a stream has no result path to read. */
export function withChatStreaming(
  draft: ChannelDraft,
  streaming: boolean
): Partial<ChannelDraft> {
  const rows = draft.rows
    .filter((row) => row.field.split('.')[0] !== 'stream_options')
    .map((row) =>
      row.field === 'stream'
        ? {
            ...row,
            source: 'fixed',
            fixed: String(streaming),
            fixedType: 'boolean' as const,
          }
        : row
    )
  return {
    streaming,
    rows: streaming ? [...rows, STREAM_OPTIONS] : rows,
    outputPaths: streaming ? STREAM_OUTPUT : '',
  }
}

export function blankChannelDraft(capability: string): ChannelDraft {
  const isChat = capability === 'chat.generate'
  const isImage = capability === 'image.generate'
  const row = (field: string, source: string): RequestRow => ({
    field,
    source,
    transform: '',
  })
  const starterRows = (): RequestRow[] => {
    if (isImage) {
      return [
        row('model', 'upstreamId'),
        row('prompt', 'prompt'),
        row('size', 'size'),
        row('n', 'count'),
        {
          field: 'response_format',
          source: 'fixed',
          fixed: 'url',
          fixedType: 'string',
          transform: '',
          rawDefault: true,
        },
      ]
    }
    if (isChat) {
      return [
        row('model', 'upstreamId'),
        row('messages', 'messages'),
        row('max_tokens', 'maxTokens'),
        {
          field: 'stream',
          source: 'fixed',
          fixed: 'true',
          fixedType: 'boolean',
          transform: '',
        },
        STREAM_OPTIONS,
      ]
    }
    return [
      row('model', 'upstreamId'),
      row('prompt', 'prompt'),
      row('ratio', 'aspectRatio'),
      row('resolution', 'quality'),
      row('duration', 'durationSeconds'),
      row('images', 'images'),
    ]
  }
  return {
    name: '',
    displayName: '',
    description: '',
    capability,
    workflow: isChat || isImage ? 'sync' : 'async',
    submit: { method: 'POST', path: '', format: 'application/json' },
    images: null,
    poll: { method: 'GET', path: '', taskIdIn: 'path', queryName: '' },
    prepareAsset: { method: 'POST', path: '', format: 'application/json' },
    pollAsset: { method: 'GET', path: '' },
    asset: {
      image: blankAssetPrepare(),
      video: blankAssetPrepare(),
      audio: blankAssetPrepare(),
    },
    rows: starterRows(),
    imageRows: [],
    wrap: isImage,
    roleMap: {},
    media: { image: 'public-url', video: 'public-url', audio: 'public-url' },
    taskIdPath: '',
    statusPath: '',
    outputPaths: isChat ? STREAM_OUTPUT : '',
    errorPaths: isChat ? 'error.message' : '',
    states: { pending: '', running: '', succeeded: '', failed: '' },
    usageProtocol: isChat ? 'OPENAI_CHAT' : '',
    streaming: isChat,
    submitTaskId: '',
    submitStatus: '',
    idempotencyHeader: '',
    maxMultipartBytes: '',
    promptImage: '',
    promptVideo: '',
    promptAudio: '',
    pollIntervalMs: '',
    baseUrlMode: '',
    materials: blankMaterialsMemory(),
  }
}

export function channelDraftFrom(
  profile: CatalogJson,
  contract: CatalogJson
): ChannelDraft {
  const advanced = (profile.advanced ?? {}) as CatalogJson
  const request = (advanced.request ?? {}) as CatalogJson
  const media = (advanced.media ?? {}) as Record<
    string,
    CatalogJson | undefined
  >
  const response = (advanced.response ?? {}) as CatalogJson
  const operations = (profile.operations ?? {}) as CatalogJson
  const map = (profile.map ?? {}) as Record<string, CatalogJson | undefined>
  const states = (profile.states ?? {}) as Record<string, string[] | undefined>
  const roleMap = (media.roleMap ?? {}) as unknown as RoleMap
  const pollQuery = (request.pollQuery ?? {}) as Record<string, CatalogJson>
  const queryName =
    Object.keys(pollQuery).find(
      (name) => pollQuery[name]?.$ref === 'request.taskId'
    ) ?? ''
  // Video and image forms edit materials by mode, which reads send content and lists from the templates.
  const shapes =
    profile.kind === 'video.generate' || profile.kind === 'image.generate'
  const parsed = parseRows(
    request.body,
    (request.parameterPolicy ?? {}) as CatalogJson,
    roleMap,
    shapes
  )
  const format = (request.promptReferenceFormat ?? {}) as Record<
    string,
    string | undefined
  >
  const policy = (request.parameterPolicy ?? {}) as CatalogJson
  const status = (advanced.status ?? {}) as CatalogJson
  return {
    name: String(profile.id ?? ''),
    displayName: String(profile.displayName ?? ''),
    description: String(profile.description ?? ''),
    capability: String(profile.kind),
    workflow: String(profile.workflow),
    submit: operationDraft(contract, operations.submit) ?? {
      method: 'POST',
      path: '',
      format: 'application/json',
    },
    images: operations.submitWithImages
      ? operationDraft(contract, operations.submitWithImages)
      : null,
    poll: {
      ...(operations.poll
        ? (operationDraft(contract, operations.poll) ?? {
            method: 'GET',
            path: '',
          })
        : { method: 'GET', path: '' }),
      taskIdIn: queryName ? 'query' : 'path',
      queryName,
    },
    prepareAsset: (operations.prepareAsset
      ? operationDraft(contract, operations.prepareAsset)
      : null) ?? { method: 'POST', path: '', format: 'application/json' },
    pollAsset: (operations.pollAsset
      ? operationDraft(contract, operations.pollAsset)
      : null) ?? { method: 'GET', path: '' },
    asset: {
      image: assetPrepareFrom(media.image?.prepare as CatalogJson | undefined),
      video: assetPrepareFrom(media.video?.prepare as CatalogJson | undefined),
      audio: assetPrepareFrom(media.audio?.prepare as CatalogJson | undefined),
    },
    rows: parsed.rows,
    imageRows: request.bodyWithImages
      ? parseRows(request.bodyWithImages, null, roleMap, shapes).rows
      : [],
    wrap: parsed.wrap,
    roleMap,
    media: {
      image: String(media.image?.delivery ?? 'public-url'),
      video: String(media.video?.delivery ?? 'public-url'),
      audio: String(media.audio?.delivery ?? 'public-url'),
    },
    taskIdPath: pointersAsPaths(map.response?.taskId),
    statusPath: pointersAsPaths(map.response?.status),
    outputPaths: ((response.outputPaths ?? []) as string[]).join(', '),
    errorPaths: ((response.errorPaths ?? []) as string[]).join(', '),
    states: {
      pending: (states.pending ?? []).join(', '),
      running: (states.running ?? []).join(', '),
      succeeded: (states.succeeded ?? []).join(', '),
      failed: (states.failed ?? []).join(', '),
    },
    usageProtocol: String(response.usageProtocol ?? ''),
    streaming: response.streaming === true,
    submitTaskId: pointersAsPaths(map.submitResponse?.taskId),
    submitStatus: pointersAsPaths(map.submitResponse?.status),
    idempotencyHeader: String(request.idempotencyHeader ?? ''),
    maxMultipartBytes: String(request.maxMultipartBytes ?? ''),
    promptImage: format.image ?? '',
    promptVideo: format.video ?? '',
    promptAudio: format.audio ?? '',
    pollIntervalMs: String(status.pollIntervalMs ?? ''),
    baseUrlMode: String(policy.baseUrlMode ?? ''),
    materials: blankMaterialsMemory(),
  }
}

/** The Profile this form describes, on top of the base: fields the form has no control for are kept (design 6.3). */
export function buildProfile(
  draft: ChannelDraft,
  base: CatalogJson | null,
  prefix: string
): CatalogJson {
  const profile = (
    base
      ? structuredClone(base)
      : {
          schemaVersion: 1,
          templateLanguageVersion: 1,
          securityScheme: 'bearerAuth',
          advanced: {},
        }
  ) as CatalogJson
  const pollsTask = draft.workflow !== 'sync'
  profile.kind = draft.capability
  profile.workflow = draft.workflow
  if (draft.displayName) profile.displayName = draft.displayName
  if (draft.description) profile.description = draft.description
  const baseOperations = (base?.operations ?? {}) as CatalogJson
  const operationId = (role: string, suffix: string) =>
    baseOperations[role] ?? `${prefix}${suffix}`
  const operations: CatalogJson = { submit: operationId('submit', 'Submit') }
  if (draft.images) {
    operations.submitWithImages = operationId(
      'submitWithImages',
      'SubmitWithImages'
    )
  }
  if (pollsTask) operations.poll = operationId('poll', 'Poll')
  if (draft.workflow === 'asset-async') {
    operations.prepareAsset = operationId('prepareAsset', 'PrepareAsset')
    if (draft.pollAsset.path.trim()) {
      operations.pollAsset = operationId('pollAsset', 'PollAsset')
    }
  }
  profile.operations = operations
  const map = { ...((profile.map ?? {}) as CatalogJson) }
  if (pollsTask) {
    const taskIds = toList(draft.taskIdPath).map(pathToPointer)
    const statuses = toList(draft.statusPath).map(pathToPointer)
    const before = (map.response ?? {}) as CatalogJson
    const beforeText = base
      ? {
          taskId: pointersAsPaths(before.taskId),
          status: pointersAsPaths(before.status),
        }
      : null
    if (
      !beforeText ||
      beforeText.taskId !== draft.taskIdPath ||
      beforeText.status !== draft.statusPath
    ) {
      map.response = {
        ...before,
        taskId: taskIds.length > 1 ? taskIds : taskIds[0],
        status: statuses.length > 1 ? statuses : statuses[0],
      }
    }
    const submitResponse = {
      ...(toList(draft.submitTaskId).length
        ? { taskId: toList(draft.submitTaskId).map(pathToPointer) }
        : {}),
      ...(toList(draft.submitStatus).length
        ? { status: toList(draft.submitStatus).map(pathToPointer) }
        : {}),
    }
    const baseSubmit =
      (before && (map.submitResponse as CatalogJson | undefined)) ?? undefined
    if (Object.keys(submitResponse).length) {
      if (
        !baseSubmit ||
        pointersAsPaths(baseSubmit.taskId) !== draft.submitTaskId ||
        pointersAsPaths(baseSubmit.status) !== draft.submitStatus
      ) {
        map.submitResponse = submitResponse
      }
    } else delete map.submitResponse
    profile.map = map
    profile.states = Object.fromEntries(
      ['pending', 'running', 'succeeded', 'failed']
        .map((key) => [
          key,
          [...new Set(toList(draft.states[key as 'pending']))],
        ])
        .filter(
          ([key, values]) => (values as string[]).length || key !== 'pending'
        )
    )
    if (
      base &&
      (base.states as CatalogJson | undefined)?.pending &&
      !(profile.states as CatalogJson).pending
    ) {
      ;(profile.states as CatalogJson).pending = []
    }
  } else {
    delete profile.map
    delete profile.states
  }
  const advanced = (profile.advanced ??= {}) as CatalogJson
  const request = (advanced.request ??= {}) as CatalogJson
  request.body = requestTemplate(draft.rows, draft.wrap, draft.roleMap)
  if (draft.images) {
    request.bodyWithImages = requestTemplate(
      draft.imageRows,
      draft.wrap,
      draft.roleMap
    )
  } else delete request.bodyWithImages
  const basePollQuery = (
    (base?.advanced as CatalogJson | undefined)?.request as
      | CatalogJson
      | undefined
  )?.pollQuery as Record<string, CatalogJson> | undefined
  const extras = Object.entries(basePollQuery ?? {}).filter(
    ([, value]) => value?.$ref !== 'request.taskId'
  )
  const queryName =
    draft.poll.taskIdIn === 'query' ? draft.poll.queryName.trim() : ''
  const nextQuery = Object.fromEntries([
    ...extras,
    ...(queryName
      ? [[queryName, REF('request.taskId')] as [string, unknown]]
      : []),
  ])
  if (pollsTask && Object.keys(nextQuery).length) request.pollQuery = nextQuery
  else delete request.pollQuery
  const policy = { ...((request.parameterPolicy ?? {}) as CatalogJson) }
  for (const key of Object.values(POLICY_KEYS)) delete policy[key]
  delete policy.rawDefaults
  for (const row of draft.rows) {
    const key = POLICY_KEYS[row.source]
    if (key && row.field.trim()) policy[key] = row.field.trim()
    if (row.rawDefault && row.field.trim()) {
      ;((policy.rawDefaults ??= {}) as CatalogJson)[row.field.trim()] =
        fixedValue(row)
    }
  }
  if (draft.baseUrlMode) policy.baseUrlMode = draft.baseUrlMode
  else delete policy.baseUrlMode
  if (Object.keys(policy).length) request.parameterPolicy = policy
  else delete request.parameterPolicy
  if (draft.idempotencyHeader.trim() && pollsTask) {
    request.idempotencyHeader = draft.idempotencyHeader.trim()
  } else delete request.idempotencyHeader
  if (draft.maxMultipartBytes.trim()) {
    request.maxMultipartBytes = Number(draft.maxMultipartBytes)
  } else delete request.maxMultipartBytes
  const anyFormat = [
    draft.promptImage,
    draft.promptVideo,
    draft.promptAudio,
  ].some((value) => value.trim())
  // Cloud requires all three together: an empty one takes the written form the canvas uses.
  if (anyFormat && draft.capability !== 'chat.generate') {
    request.promptReferenceFormat = {
      image: draft.promptImage.trim() || '@图片{n}',
      video: draft.promptVideo.trim() || '@视频{n}',
      audio: draft.promptAudio.trim() || '@音频{n}',
    }
  } else delete request.promptReferenceFormat
  if (draft.pollIntervalMs.trim() && pollsTask) {
    advanced.status = {
      ...((advanced.status ?? {}) as CatalogJson),
      pollIntervalMs: Number(draft.pollIntervalMs),
    }
  } else if (advanced.status) {
    const { pollIntervalMs: _removed, ...rest } = advanced.status as CatalogJson
    if (Object.keys(rest).length) advanced.status = rest
    else delete advanced.status
  }
  if (draft.capability !== 'chat.generate') {
    const media = (advanced.media ??= {}) as CatalogJson
    for (const kind of ['image', 'video', 'audio'] as const) {
      if (draft.capability !== 'video.generate' && kind !== 'image') continue
      const current = (media[kind] ?? {}) as CatalogJson
      const { prepare: storedPrepare, ...rest } = current
      const prepare =
        draft.media[kind] === 'provider-asset'
          ? assetPrepareOf(draft.asset[kind])
          : undefined
      if (
        !base ||
        (current.delivery ?? 'public-url') !== draft.media[kind] ||
        !sameDocument(prepare, storedPrepare)
      ) {
        media[kind] = {
          ...rest,
          delivery: draft.media[kind],
          ...(prepare ? { prepare } : {}),
        }
      }
    }
    const roles = Object.fromEntries(
      Object.entries(draft.roleMap).filter(([, value]) => String(value).trim())
    )
    if (Object.keys(roles).length) media.roleMap = roles
    else delete media.roleMap
  }
  const response = (advanced.response ??= {}) as CatalogJson
  const paths = (key: 'outputPaths' | 'errorPaths', text: string) => {
    const next = toList(text)
    if (next.length || response[key] !== undefined) response[key] = next
  }
  paths('outputPaths', draft.outputPaths)
  paths('errorPaths', draft.errorPaths)
  if (draft.usageProtocol) response.usageProtocol = draft.usageProtocol
  else delete response.usageProtocol
  if (draft.capability === 'chat.generate') {
    if (draft.streaming) response.streaming = true
    else delete response.streaming
  }
  return profile
}

function bodySchema(
  rows: RequestRow[],
  old: CatalogJson | undefined
): CatalogJson {
  const named = rows.filter(
    (row) =>
      row.field.trim() &&
      !rows.some((other) =>
        other.field.trim().startsWith(`${row.field.trim()}.`)
      )
  )
  const properties: CatalogJson = structuredClone(
    (old?.properties ?? {}) as CatalogJson
  )
  for (const row of named) {
    const parts = row.field.trim().split('.')
    let level = properties
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        level[part] ??= {}
        if (row.source === 'option') {
          level[part] = {
            ...(level[part] as CatalogJson),
            type: row.paramType ?? 'string',
          }
        }
        if (row.source === 'upstreamId') level[part] = { type: 'string' }
        return
      }
      const node = (level[part] ??= {
        type: 'object',
        properties: {},
      }) as CatalogJson
      level = (node.properties ??= {}) as CatalogJson
    })
  }
  const required = ((old?.required ?? []) as string[]).filter((name) =>
    named.some((row) => row.field.trim().split('.')[0] === name)
  )
  const baseRequired = old
    ? required
    : named
        .filter(
          (row) => row.source === 'upstreamId' && !row.field.includes('.')
        )
        .map((row) => row.field.trim())
  const { required: _old, ...rest } = (old ?? {}) as CatalogJson
  return {
    ...rest,
    type: 'object',
    properties,
    ...(baseRequired.length ? { required: baseRequired } : {}),
  }
}

function resolved(
  contract: CatalogJson,
  schema: unknown
): CatalogJson | undefined {
  let current = schema as CatalogJson | undefined
  while (current && typeof current.$ref === 'string') {
    let node: unknown = contract
    for (const part of current.$ref.replace(/^#\//, '').split('/')) {
      node = (node as CatalogJson | undefined)?.[part]
    }
    current = node as CatalogJson | undefined
  }
  return current
}

const sameRequestLine = (left: OperationDraft, right: OperationDraft) =>
  left.method === right.method &&
  left.path === right.path &&
  (left.format ?? '') === (right.format ?? '')

/**
 * The contract describes the shape only (D9): paths, fields and what must be there, never value lists. An operation the
 * form did not change stays as it is written, including its references and constraints the form has no controls for.
 */
export function buildContract(
  draft: ChannelDraft,
  base: CatalogJson | null,
  baseProfile: CatalogJson | null,
  prefix: string,
  title: string
): CatalogJson {
  const baseOperations = (baseProfile?.operations ?? {}) as CatalogJson
  const initial =
    base && baseProfile ? channelDraftFrom(baseProfile, base) : null
  const operationId = (role: string, suffix: string) =>
    String(baseOperations[role] ?? `${prefix}${suffix}`)
  const paths = structuredClone(base?.paths ?? {}) as Record<
    string,
    CatalogJson
  >
  const remove = (id: unknown) => {
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, definition] of Object.entries(methods)) {
        if ((definition as CatalogJson | undefined)?.operationId === id) {
          delete methods[method]
        }
      }
      if (!Object.keys(methods).length) delete paths[path]
    }
  }
  const put = (
    operation: OperationDraft,
    id: string,
    rows: RequestRow[] | null,
    before: OperationDraft | null | undefined,
    rowsBefore: RequestRow[]
  ) => {
    const old = base ? findOperation(base, id)?.definition : undefined
    const format = operation.format ?? 'application/json'
    const content = ((old?.requestBody as CatalogJson | undefined)?.content ??
      {}) as Record<string, CatalogJson>
    const oldSchema = base
      ? resolved(base, (content[format] ?? Object.values(content)[0])?.schema)
      : undefined
    const sameBody =
      !rows ||
      sameDocument(
        bodySchema(rows, oldSchema),
        bodySchema(rowsBefore, oldSchema)
      )
    if (old && before && sameRequestLine(operation, before) && sameBody) return
    remove(id)
    const oldParameters = (old?.parameters ?? []) as CatalogJson[]
    const readParameter = (parameter: CatalogJson) =>
      base ? resolved(base, parameter) : undefined
    const oldPathParameter = (name: string) =>
      oldParameters.find((parameter) => {
        const read = readParameter(parameter)
        return read?.in === 'path' && read.name === name
      })
    const placeholders = [...operation.path.matchAll(/\{([^}]+)\}/g)].map(
      (match) =>
        oldPathParameter(match[1]) ?? {
          name: match[1],
          in: 'path',
          required: true,
          schema: { type: 'string' },
        }
    )
    const otherParameters = oldParameters.filter(
      (parameter) => readParameter(parameter)?.in !== 'path'
    )
    const next: CatalogJson = {
      ...structuredClone(old ?? {}),
      operationId: id,
      responses: old?.responses ?? { 200: { description: 'OK' } },
    }
    if (placeholders.length || otherParameters.length) {
      next.parameters = [...placeholders, ...otherParameters]
    } else delete next.parameters
    if (rows) {
      next.requestBody = {
        required: true,
        content: { [format]: { schema: bodySchema(rows, oldSchema) } },
      }
    }
    ;((paths[operation.path || '/'] ??= {}) as CatalogJson)[
      operation.method.toLowerCase()
    ] = next
  }
  put(
    draft.submit,
    operationId('submit', 'Submit'),
    draft.rows,
    initial?.submit,
    initial?.rows ?? []
  )
  if (draft.images) {
    put(
      draft.images,
      operationId('submitWithImages', 'SubmitWithImages'),
      draft.imageRows,
      initial?.images,
      initial?.imageRows ?? []
    )
  } else if (baseOperations.submitWithImages) {
    remove(baseOperations.submitWithImages)
  }
  if (draft.workflow !== 'sync') {
    put(draft.poll, operationId('poll', 'Poll'), null, initial?.poll, [])
  }
  if (draft.workflow === 'asset-async') {
    put(
      draft.prepareAsset,
      operationId('prepareAsset', 'PrepareAsset'),
      [],
      initial?.prepareAsset,
      []
    )
    if (draft.pollAsset.path.trim()) {
      put(
        draft.pollAsset,
        operationId('pollAsset', 'PollAsset'),
        null,
        initial?.pollAsset,
        []
      )
    } else if (baseOperations.pollAsset) remove(baseOperations.pollAsset)
  } else {
    if (baseOperations.prepareAsset) remove(baseOperations.prepareAsset)
    if (baseOperations.pollAsset) remove(baseOperations.pollAsset)
  }
  if (base) return { ...structuredClone(base), paths }
  return {
    openapi: '3.1.0',
    info: { title, version: '1.0.0' },
    security: [{ bearerAuth: [] }],
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
    },
  }
}

export interface ChannelIssue {
  path: string
  key: string
  values?: Record<string, unknown>
}

/** Checks the page can make locally. Cloud checks everything again and is the source of truth. */
/** `baseProfile` is the configuration this draft edits or copies, whose fields are already known to work. */
export function channelIssues(
  draft: ChannelDraft,
  baseProfile?: CatalogJson | null
): ChannelIssue[] {
  const issues: ChannelIssue[] = []
  const states = Object.entries(draft.states).map(
    ([group, text]) => [group, toList(text)] as const
  )
  const groupOf = new Map<string, string>()
  for (const [group, values] of states) {
    for (const value of values) {
      if (/\s/.test(value)) {
        issues.push({
          path: `states.${group}`,
          key: 'A state value cannot contain a space: {{value}}',
          values: { value },
        })
      }
      const other = groupOf.get(value)
      if (other && other !== group) {
        issues.push({
          path: `states.${group}`,
          key: 'A state value cannot be in two groups: {{value}}',
          values: { value },
        })
      }
      groupOf.set(value, group)
    }
  }
  if (!/^\/\S*$/.test(draft.submit.path.trim())) {
    issues.push({ path: 'submit.path', key: 'Enter a path that starts with /' })
  }
  if (draft.workflow !== 'sync') {
    if (!/^\/\S*$/.test(draft.poll.path.trim())) {
      issues.push({ path: 'poll.path', key: 'Enter a path that starts with /' })
    }
    const idInPath = draft.poll.path.match(POLL_ID)
    if (draft.poll.taskIdIn === 'path' && !idInPath) {
      issues.push({
        path: 'poll.path',
        key: 'The query path needs a placeholder for the task ID, such as {taskId}',
      })
    }
    if (draft.poll.taskIdIn === 'query' && idInPath) {
      issues.push({
        path: 'poll.path',
        key: 'The task ID goes in a query parameter; remove {{placeholder}} from the path',
        values: { placeholder: idInPath[0] },
      })
    }
    const queryName = draft.poll.queryName.trim()
    const usedQuery = ((
      baseProfile?.advanced as
        | { request?: { pollQuery?: Record<string, { $ref?: string }> } }
        | undefined
    )?.request?.pollQuery ?? {})[queryName]
    if (
      draft.poll.taskIdIn === 'query' &&
      !/^[A-Za-z0-9_.-]+$/.test(queryName)
    ) {
      issues.push({
        path: 'poll.queryName',
        key: 'Enter the query parameter that carries the task ID',
      })
    } else if (
      draft.poll.taskIdIn === 'query' &&
      usedQuery &&
      usedQuery.$ref !== 'request.taskId'
    ) {
      issues.push({
        path: 'poll.queryName',
        key: 'Query parameter {{name}} is used for something else; choose another name',
        values: { name: queryName },
      })
    }
    if (!toList(draft.taskIdPath).length) {
      issues.push({ path: 'taskIdPath', key: 'Enter the task ID path' })
    }
    if (!toList(draft.statusPath).length) {
      issues.push({ path: 'statusPath', key: 'Enter the status path' })
    }
    for (const group of ['running', 'succeeded', 'failed'] as const) {
      if (!toList(draft.states[group]).length) {
        issues.push({
          path: `states.${group}`,
          key: 'Enter at least one state value',
        })
      }
    }
  }
  const allRows = [...draft.rows, ...draft.imageRows]
  const isPath = (path: string) => /^\/\S*$/.test(path.trim())
  if (draft.images && !isPath(draft.images.path)) {
    issues.push({ path: 'images.path', key: 'Enter a path that starts with /' })
  }
  if (!toList(draft.outputPaths).length) {
    issues.push({ path: 'outputPaths', key: 'Fill in this field' })
  }
  if (
    draft.workflow !== 'sync' &&
    draft.pollIntervalMs.trim() &&
    !(
      Number.isInteger(Number(draft.pollIntervalMs)) &&
      Number(draft.pollIntervalMs) >= 1000 &&
      Number(draft.pollIntervalMs) <= 3600000
    )
  ) {
    issues.push({
      path: 'pollIntervalMs',
      key: 'Enter an integer from 1000 to 3600000',
    })
  }
  if (
    draft.maxMultipartBytes.trim() &&
    !(
      Number.isInteger(Number(draft.maxMultipartBytes)) &&
      Number(draft.maxMultipartBytes) > 0
    )
  ) {
    issues.push({ path: 'maxMultipartBytes', key: 'Enter a positive integer' })
  }
  const operationKey = (row: RequestRow) =>
    row.optionKey ?? paramKeyOf(row.field)
  for (const [name, rows, operation] of [
    ['rows', draft.rows, draft.submit],
    ['imageRows', draft.images ? draft.imageRows : [], draft.images],
  ] as const) {
    const names = rows.map((row) => row.field.trim())
    rows.forEach((row, index) => {
      const field = names[index]
      const path = `${name}.${index}`
      if (!field) {
        issues.push({ path: `${path}.field`, key: 'Enter the field name' })
      } else if (names.indexOf(field) !== index) {
        issues.push({
          path: `${path}.field`,
          key: 'Request field {{field}} occurs twice',
          values: { field },
        })
      } else if (field.split('.').some((part) => !part)) {
        issues.push({
          path: `${path}.field`,
          key: 'Dots need a field name on both sides, such as metadata.ratio',
        })
      } else if (names.some((other) => other.startsWith(`${field}.`))) {
        issues.push({
          path: `${path}.field`,
          key: '{{field}} has lower fields, so it cannot also be sent itself',
          values: { field },
        })
      } else if (
        field.includes('.') &&
        (['size', 'apiQuality', 'count', 'ratio'].includes(row.source) ||
          row.rawDefault)
      ) {
        issues.push({
          path: `${path}.field`,
          key: 'This value can only go to a top-level field, without dots',
        })
      }
      if (field && row.source === 'option') {
        const other = allRows.find(
          (entry) =>
            entry.source === 'option' &&
            entry.field.trim() &&
            entry.field.trim() !== field &&
            operationKey(entry) === operationKey(row)
        )
        if (other) {
          issues.push({
            path: `${path}.field`,
            key: '{{field}} would use the same model parameter {{key}}; choose another field name',
            values: { field: other.field.trim(), key: operationKey(row) },
          })
        }
        if (draft.wrap && !/^[A-Za-z][A-Za-z0-9_]*$/.test(field)) {
          issues.push({
            path: `${path}.field`,
            key: 'A custom parameter of this Channel can only use a top-level English field name',
          })
        }
      }
      if (row.source === 'expr') {
        try {
          JSON.parse(row.expr || '')
        } catch {
          issues.push({ path: `${path}.expr`, key: 'Not valid JSON' })
        }
      }
      if (row.source === 'fixed' && !String(row.fixed ?? '').trim()) {
        issues.push({ path: `${path}.fixed`, key: 'Enter the fixed value' })
      } else if (
        row.source === 'fixed' &&
        row.fixedType === 'number' &&
        Number.isNaN(Number(row.fixed))
      ) {
        issues.push({
          path: `${path}.fixed`,
          key: 'The type is a number, so enter a number',
        })
      }
    })
    if (
      operation &&
      !baseProfile &&
      !rows.some((row) => row.source === 'upstreamId') &&
      !/\{model\}/.test(operation.path)
    ) {
      issues.push({
        path: name,
        key: 'One field must send the upstream model ID, or the path must use {model}',
      })
    }
  }
  // Design 7.5.4: the field must read what the delivery method sets, or an empty value is sent.
  const delivery = draft.media
  for (const row of allRows) {
    const usesUrl = [
      'images',
      'imagesAlways',
      'imageOne',
      'imagesByRole',
      'firstFrame',
      'lastFrame',
    ].includes(row.source)
    if (
      usesUrl &&
      (delivery.image === 'multipart-file' || delivery.image === 'base64')
    ) {
      issues.push({
        path: 'media.image',
        // A form by mode picks the frames and references apart by address, which files and base64 do not have.
        key:
          draft.capability === 'video.generate'
            ? 'Images sent as files or base64 have no address, so modes cannot pick them apart; give the first frame, last frame and images the same field'
            : 'Field {{field}} reads an address, but images are not delivered as addresses',
        values: { field: row.field },
      })
    }
  }
  // A file can only travel in a multipart body; the operation that carries references is the one that matters.
  const kindsOfCapability =
    draft.capability === 'video.generate'
      ? (['image', 'video', 'audio'] as const)
      : (['image'] as const)
  if (
    draft.capability !== 'chat.generate' &&
    (draft.images ?? draft.submit).format !== 'multipart/form-data'
  ) {
    const key = draft.images
      ? 'With "File upload", the format of the submit with reference images must be "File form"; otherwise use a public address'
      : 'With "File upload", the format of the submit path must be "File form"; otherwise use a public address'
    for (const kind of kindsOfCapability) {
      if (delivery[kind] === 'multipart-file') {
        issues.push({ path: `media.${kind}`, key })
      }
    }
  }
  if (draft.workflow !== 'asset-async') {
    for (const kind of ['image', 'video', 'audio'] as const) {
      if (delivery[kind] === 'provider-asset') {
        issues.push({
          path: `media.${kind}`,
          key: 'Upload first needs the call method that uploads materials first',
        })
      }
    }
  }
  if (draft.workflow === 'asset-async') {
    const kinds = (['image', 'video', 'audio'] as const).filter(
      (kind) => delivery[kind] === 'provider-asset'
    )
    if (!kinds.length) {
      issues.push({
        path: 'media.image',
        key: 'With "Upload materials, then asynchronous", at least one material must be uploaded to the upstream first',
      })
    }
    if (!/^\/\S*$/.test(draft.prepareAsset.path.trim())) {
      issues.push({
        path: 'prepareAsset.path',
        key: 'Enter a path that starts with /',
      })
    }
    if (
      draft.pollAsset.path.trim() &&
      !/\{[^}]+\}/.test(draft.pollAsset.path)
    ) {
      issues.push({
        path: 'pollAsset.path',
        key: 'The path needs a placeholder for the material ID, such as /v1/assets/{assetId}',
      })
    }
    for (const kind of kinds) {
      const asset = draft.asset[kind]
      try {
        const body = JSON.parse(asset.body)
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new Error('not an object')
        }
      } catch {
        issues.push({
          path: `asset.${kind}.body`,
          key: 'Enter a valid JSON object',
        })
      }
      for (const key of [
        'remoteIdPaths',
        'readyValues',
        'failedValues',
      ] as const) {
        if (!toList(asset[key]).length) {
          issues.push({
            path: `asset.${kind}.${key}`,
            key: 'Fill in this field',
          })
        }
      }
    }
  }
  return issues
}

/**
 * What a sample request carries. A video form previews by canvas mode: first frame, both frames, or every reference
 * (omni); with images on a second interface, the first one previews video and audio only.
 */
export type SampleKind =
  | 'default'
  | 'reference'
  | 'video'
  | 'audio'
  | 'first'
  | 'last'
  | 'frames'
  | 'omni'
  | 'videoAudio'

type SampleMaterial = 'first' | 'last' | 'reference' | 'video' | 'audio'
const SAMPLE_MATERIALS: Record<SampleKind, SampleMaterial[]> = {
  default: [],
  reference: ['reference'],
  video: ['video'],
  audio: ['audio'],
  first: ['first'],
  last: ['last'],
  frames: ['first', 'last'],
  omni: ['reference', 'video', 'audio'],
  videoAudio: ['video', 'audio'],
}
// The file name of each sample is its marker: a request that holds it carries that material.
const SAMPLE_FILE: Record<
  SampleMaterial,
  { kind: MediaKind; role: string; name: string; mime: string }
> = {
  first: {
    kind: 'image',
    role: 'first-frame',
    name: 'first-frame-1.png',
    mime: 'image/png',
  },
  last: {
    kind: 'image',
    role: 'last-frame',
    name: 'last-frame-1.png',
    mime: 'image/png',
  },
  reference: {
    kind: 'image',
    role: 'image-reference',
    name: 'image-reference-1.png',
    mime: 'image/png',
  },
  video: {
    kind: 'video',
    role: 'video-reference',
    name: 'video-reference-1.mp4',
    mime: 'video/mp4',
  },
  audio: {
    kind: 'audio',
    role: 'audio-reference',
    name: 'audio-reference-1.mp3',
    mime: 'audio/mpeg',
  },
}

const remoteIdOf = (name: string) => `remote-${name}`
// The address the Cloud offline preview gives a sample input, so both previews show the same request.
const sampleUrl = (name: string) =>
  `https://media.preview.example/inputs/${name}`
const UPLOAD_SAMPLE: Record<MediaKind, SampleMaterial> = {
  image: 'reference',
  video: 'video',
  audio: 'audio',
}

/** The sample file one upload in the examples carries, and the ID the upstream gives it. */
export function sampleUpload(kind: MediaKind) {
  const { name } = SAMPLE_FILE[UPLOAD_SAMPLE[kind]]
  return {
    name,
    url: sampleUrl(name),
    remoteId: remoteIdOf(name),
  }
}

// As the Executor does, a material's canvas role reaches the template under the Channel's name for it.
function sampleMedia(
  draft: ChannelDraft,
  material: SampleMaterial
): CatalogJson {
  const { kind, role: canvasRole, name, mime } = SAMPLE_FILE[material]
  const common: CatalogJson = {
    role: draft.roleMap[canvasRole] || canvasRole,
    mimeType: mime,
    sizeBytes: 67,
    safeName: name,
    // A reference video or audio clip has a length; {{durationSeconds}} in send content reads it.
    ...(kind === 'image' ? {} : { durationSeconds: 5 }),
  }
  const byDelivery: Record<string, CatalogJson> = {
    'multipart-file': { ...common, file: `@${name};type=${mime}` },
    base64: { ...common, data: `<base64 of ${name}>` },
    'data-url': { ...common, url: `data:${mime};base64,<${name}>` },
    'provider-asset': { ...common, url: `asset://${remoteIdOf(name)}` },
  }
  return byDelivery[draft.media[kind]] ?? { ...common, url: sampleUrl(name) }
}

export interface SampleRequestText {
  prompt: string
  upstreamId: string
  option: (key: string) => string
  /** The default parameters of the model the example stands for. */
  defaults?: CatalogJson
  negativePrompt?: string
}

/** Why a template could not build the sample request, as the Executor would report it. */
/** A template failure names its field; a value the Executor refuses before building the request names none. */
export interface SampleRequestFailure {
  reason: string
  field?: string
}

/** The example request of the form, from the template the form builds, so it can never disagree with what is saved. */
export function sampleRequest(
  draft: ChannelDraft,
  profile: CatalogJson,
  sample: SampleKind,
  text: SampleRequestText
): {
  operation: OperationDraft
  body: CatalogJson
  failure?: SampleRequestFailure
} {
  const request = (((profile.advanced ?? {}) as CatalogJson).request ??
    {}) as CatalogJson
  const carried = SAMPLE_MATERIALS[sample]
  const media = {
    images: carried
      .filter((material) => SAMPLE_FILE[material].kind === 'image')
      .map((material) => sampleMedia(draft, material)),
    videos: carried
      .filter((material) => material === 'video')
      .map((material) => sampleMedia(draft, material)),
    audios: carried
      .filter((material) => material === 'audio')
      .map((material) => sampleMedia(draft, material)),
  }
  const imageOperation = media.images.length ? draft.images : null
  const useImages = Boolean(imageOperation)
  const rows = useImages ? draft.imageRows : draft.rows
  const operation = imageOperation ?? draft.submit
  // The Executor stops a task whose model lacks a value it needs, such as an image size; the example says so.
  let values: CatalogJson
  try {
    values = sampleRequestValues(draft, profile, rows, text)
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return { operation, body: {}, failure: { reason: error.message } }
  }
  const context: TemplateContext = {
    model: { upstreamId: text.upstreamId, protocolOptions: {} },
    request: values,
    media,
  }
  // The Executor's own template language builds the body, and JSON serialization drops what it leaves undefined.
  let built: unknown
  try {
    built = evaluateTemplate(
      useImages ? request.bodyWithImages : request.body,
      context
    )
  } catch (error) {
    if (!(error instanceof TemplateLanguageError)) throw error
    return {
      operation,
      body: {},
      failure: { reason: error.reason, field: error.field },
    }
  }
  const body = (
    built === undefined ? {} : JSON.parse(JSON.stringify(built))
  ) as CatalogJson
  return { operation, body }
}

// Without a model to read, an example uses these, as the prototype does.
const SAMPLE_DEFAULTS: Record<string, CatalogJson> = {
  'image.generate': {
    aspectRatio: '1:1',
    quality: '2K',
    apiQuality: 'medium',
    batchSize: 1,
    sizeMap: { '1:1': { '2K': '2048x2048' } },
  },
  'video.generate': {
    aspectRatio: '16:9',
    quality: '720P',
    durationSeconds: 5,
  },
}
// The request a canvas task carries, turned into the values the template reads by the Executor's own rules.
function sampleRequestValues(
  draft: ChannelDraft,
  profile: CatalogJson,
  rows: RequestRow[],
  text: SampleRequestText
): CatalogJson {
  const defaults = text.defaults ?? SAMPLE_DEFAULTS[draft.capability] ?? {}
  // A custom parameter no model has filled in yet still shows, with a sample value of its type.
  const chosen: CatalogJson = {}
  for (const row of rows) {
    const key = row.optionKey ?? paramKeyOf(row.field)
    if (row.source !== 'option' || !row.field.trim() || key in defaults) {
      continue
    }
    if (row.paramType === 'number') chosen[key] = 1
    else if (row.paramType === 'boolean') chosen[key] = true
    else chosen[key] = text.option(row.field.trim())
  }
  const fanout = defaults.multiResultMode === 'fanout'
  const request: CatalogJson = {
    prompt: text.prompt,
    aspectRatio: defaults.aspectRatio,
    quality: defaults.quality || undefined,
    batchSize: fanout ? 1 : Number(defaults.batchSize) || 1,
    apiQuality: defaults.apiQuality || undefined,
    rawParams: chosen,
    ...(text.negativePrompt ? { negativePrompt: text.negativePrompt } : {}),
    ...(draft.capability === 'chat.generate' ? { maxTokens: 1024 } : {}),
    ...(draft.capability === 'video.generate' &&
    defaults.durationSeconds !== undefined
      ? { durationSeconds: defaults.durationSeconds }
      : {}),
    ...(draft.capability === 'video.generate' &&
    typeof defaults.generateAudio === 'boolean'
      ? { generateAudio: defaults.generateAudio }
      : {}),
  }
  return normalizedProviderRequest(
    request,
    { canvasCapability: draft.capability, defaultParams: defaults },
    profile
  )
}

// Written from the form's controls, not from catalog data, so a new field in a Bundle is not taken for a supported one (design 6.3).
const PROFILE_FIELDS_WITH_CONTROLS: KnownFields = {
  schemaVersion: true,
  templateLanguageVersion: true,
  id: true,
  version: true,
  kind: true,
  displayName: true,
  description: true,
  notes: true,
  $comment: true,
  annotations: true,
  api: true,
  workflow: true,
  securityScheme: true,
  operations: true,
  states: true,
  map: {
    response: { taskId: true, status: true, outputs: true, error: true },
    submitResponse: { taskId: true, status: true },
  },
  advanced: {
    status: { pollIntervalMs: true },
    response: {
      usageProtocol: true,
      outputPaths: true,
      errorPaths: true,
      streaming: true,
      imageEvents: true,
      layers: true,
    },
    request: {
      body: true,
      bodyWithImages: true,
      pollQuery: true,
      idempotencyHeader: true,
      maxMultipartBytes: true,
      parameterPolicy: true,
      promptReferenceFormat: true,
    },
    media: {
      image: { delivery: true, prepare: true },
      video: { delivery: true, prepare: true },
      audio: { delivery: true, prepare: true },
      roleMap: true,
    },
  },
}
interface KnownFields {
  [key: string]: true | KnownFields
}

function fieldsWithoutControls(
  value: unknown,
  known: KnownFields,
  prefix: string
): string[] {
  return Object.entries((value ?? {}) as CatalogJson).flatMap(
    ([key, child]) => {
      const node = known[key]
      if (node === true) return []
      if (node === undefined) return [`${prefix}${key}`]
      return child && typeof child === 'object' && !Array.isArray(child)
        ? fieldsWithoutControls(child, node, `${prefix}${key}.`)
        : []
    }
  )
}

export function unsupportedProfileFields(
  profile: CatalogJson | null | undefined
): string[] {
  return fieldsWithoutControls(profile, PROFILE_FIELDS_WITH_CONTROLS, '')
}

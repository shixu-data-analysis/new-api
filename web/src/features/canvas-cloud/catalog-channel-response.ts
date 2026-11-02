/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// What the preview of a Channel form shows after the example request: the
// upload and poll requests, the answers the paths expect, and a pasted answer
// read with those paths. Nothing here calls the upstream.
import {
  pointerToPath,
  POLL_ID,
  sampleUpload,
  toList,
  type ChannelDraft,
  type MediaKind,
} from './catalog-channel-draft'
import type { CatalogJson } from './catalog-edit-types'
import { dotted } from './executor-shared/providerRequestValues'
import {
  errorMessageMatch,
  operationTaskIdMapping,
  outputMatch,
  pointerMatch,
  restrictedJsonPath,
} from './executor-shared/providerResponseValues'
import {
  evaluateTemplate,
  TemplateLanguageError,
} from './executor-shared/templateLanguageV1'

export type TaskState = 'pending' | 'running' | 'succeeded' | 'failed'
export type ResponseState = 'asset' | 'submit' | TaskState

const TASK_STATES: TaskState[] = ['pending', 'running', 'succeeded', 'failed']
const SAMPLE_TASK_ID = 'task_123'

function setPath(target: CatalogJson, path: string, value: unknown) {
  const parts = path.replace(/^\//, '').replaceAll('/', '.').split('.')
  let node = target
  parts.forEach((part, index) => {
    const many = part.endsWith('[]')
    const key = many ? part.slice(0, -2) : part
    const last = index === parts.length - 1
    if (many) {
      if (!Array.isArray(node[key])) node[key] = [last ? value : {}]
      if (!last) node = (node[key] as CatalogJson[])[0]
    } else if (last) node[key] = value
    else {
      if (
        !node[key] ||
        typeof node[key] !== 'object' ||
        Array.isArray(node[key])
      ) {
        node[key] = {}
      }
      node = node[key] as CatalogJson
    }
  })
}

// Field names follow Cloud's task/metering.ts.
const SAMPLE_USAGE: Record<string, CatalogJson> = {
  OPENAI_CHAT: {
    usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
  },
  OPENAI_RESPONSES: {
    usage: { input_tokens: 120, output_tokens: 80, total_tokens: 200 },
  },
  OPENAI_IMAGES: {
    usage: {
      input_tokens: 2137,
      input_tokens_details: { text_tokens: 89, image_tokens: 2048 },
      output_tokens: 196,
      total_tokens: 2333,
    },
  },
  ANTHROPIC: { usage: { input_tokens: 120, output_tokens: 80 } },
  GEMINI: {
    usageMetadata: {
      promptTokenCount: 120,
      candidatesTokenCount: 80,
      totalTokenCount: 200,
    },
  },
  ARK_VIDEO_TASK: {
    usage: { completion_tokens: 108000, total_tokens: 108000 },
  },
}
const SAMPLE_OUTPUT: Record<string, string> = {
  'video.generate': 'https://example.com/out.mp4',
  'image.generate': 'https://example.com/out.png',
  'chat.generate': 'Hello',
}

function textStreamEvents(protocol: string): CatalogJson[] {
  const usage = SAMPLE_USAGE[protocol] ?? {}
  const events: Record<string, CatalogJson[]> = {
    OPENAI_CHAT: [
      { choices: [{ delta: { content: 'Hel' } }] },
      { choices: [{ delta: { content: 'lo' }, finish_reason: 'stop' }] },
      usage,
    ],
    OPENAI_RESPONSES: [
      { type: 'response.output_text.delta', delta: 'Hello' },
      { type: 'response.completed', response: usage },
    ],
    ANTHROPIC: [{ delta: { text: 'Hello' } }, usage],
    GEMINI: [
      { candidates: [{ content: { parts: [{ text: 'Hello' }] } }], ...usage },
    ],
  }
  return events[protocol] ?? [usage]
}

/** The first kind of material uploaded to the upstream before the task is submitted. */
export function uploadedKind(draft: ChannelDraft): MediaKind | undefined {
  return (['image', 'video', 'audio'] as const).find(
    (kind) => draft.media[kind] === 'provider-asset'
  )
}

/** Where one value of the example answer comes from on the left. */
export type ResponseSource =
  | { what: 'taskId'; path: string; fromSubmit: boolean }
  | { what: 'status'; path: string; state: TaskState; value: string }
  | { what: 'result' | 'error'; path: string }
  | { what: 'usage' }
  | { what: 'assetId'; path: string; remoteId: string }
  | { what: 'assetStatus'; path: string; value: string }

export interface SampleResponse {
  text: string
  streamed: boolean
  sources: ResponseSource[]
  /** The paths and values after the first, which the example cannot show. */
  alsoRead: Array<{
    what: 'state' | 'taskId' | 'status' | 'result' | 'error'
    values: string
  }>
}

function assetResponse(draft: ChannelDraft): SampleResponse {
  const kind = uploadedKind(draft)
  const answer: CatalogJson = {}
  const sources: ResponseSource[] = []
  if (kind) {
    const { remoteId } = sampleUpload(kind)
    const [idPath] = toList(draft.asset[kind].remoteIdPaths)
    const [statusPath] = toList(draft.asset[kind].statusPaths)
    const ready = toList(draft.asset[kind].readyValues)[0] ?? ''
    if (idPath) {
      setPath(answer, idPath, remoteId)
      sources.push({ what: 'assetId', path: idPath, remoteId })
    }
    if (statusPath) {
      setPath(answer, statusPath, ready)
      sources.push({ what: 'assetStatus', path: statusPath, value: ready })
    }
  }
  return {
    text: JSON.stringify(answer, null, 2),
    streamed: false,
    sources,
    alsoRead: [],
  }
}

/** The answer the paths of the form expect. Not a real upstream response. */
export function sampleResponse(
  draft: ChannelDraft,
  state: ResponseState,
  errorText: string
): SampleResponse {
  if (state === 'asset') return assetResponse(draft)
  const polls = draft.workflow !== 'sync'
  if (
    draft.streaming &&
    draft.capability === 'chat.generate' &&
    state === 'succeeded'
  ) {
    return {
      text: `${textStreamEvents(draft.usageProtocol)
        .map((event) => `data: ${JSON.stringify(event, null, 2)}`)
        .join('\n\n')}\n\ndata: [DONE]`,
      streamed: true,
      sources: [],
      alsoRead: [],
    }
  }
  const fromSubmit = state === 'submit' && toList(draft.submitTaskId).length > 0
  const taskIds = fromSubmit
    ? toList(draft.submitTaskId)
    : toList(draft.taskIdPath)
  // The Executor reads only the task ID from the submit response.
  const statuses = state === 'submit' ? [] : toList(draft.statusPath)
  const outputs = state === 'succeeded' ? toList(draft.outputPaths) : []
  const errors = state === 'failed' ? toList(draft.errorPaths) : []
  const answer: CatalogJson = {}
  const sources: ResponseSource[] = []
  if (polls && taskIds[0]) {
    setPath(answer, taskIds[0], SAMPLE_TASK_ID)
    sources.push({ what: 'taskId', path: taskIds[0], fromSubmit })
  }
  if (polls && statuses[0] && state !== 'submit') {
    const value = toList(draft.states[state])[0] ?? ''
    setPath(answer, statuses[0], value)
    sources.push({ what: 'status', path: statuses[0], state, value })
  }
  if (outputs[0]) {
    setPath(answer, outputs[0], SAMPLE_OUTPUT[draft.capability] ?? '')
    sources.push({ what: 'result', path: outputs[0] })
  }
  if (errors[0]) {
    setPath(answer, errors[0], errorText)
    sources.push({ what: 'error', path: errors[0] })
  }
  if (state === 'succeeded' && SAMPLE_USAGE[draft.usageProtocol]) {
    Object.assign(answer, SAMPLE_USAGE[draft.usageProtocol])
    sources.push({ what: 'usage' })
  }
  const stateValues =
    polls && state !== 'submit' ? toList(draft.states[state]) : []
  const alsoRead = (
    [
      ['state', stateValues],
      ['taskId', taskIds],
      ['status', statuses],
      ['result', outputs],
      ['error', errors],
    ] as const
  )
    .filter(([, values]) => values.length > 1)
    .map(([what, values]) => ({ what, values: values.slice(1).join(', ') }))
  return {
    text: JSON.stringify(answer, null, 2),
    streamed: false,
    sources,
    alsoRead,
  }
}

/** One value read from a pasted answer: the path that read it, or every path tried. */
export interface ResponseReading {
  what: 'taskId' | 'status' | 'result' | 'error'
  found: unknown[]
  path?: string
  tried: string[]
  /** A path the Executor refuses to read, so a task fails on it. */
  refusedPath?: string
  /** The task state a read status means; null when it matches no state value. */
  state?: TaskState | null
  /** Nothing was read, or a status matched no state: a real task would go wrong here. */
  bad: boolean
}

const pathList = (value: unknown): string[] =>
  [value ?? []]
    .flat()
    .filter((entry): entry is string => typeof entry === 'string')
// The form shows pointers as paths; a restricted output path is shown as written.
const shownPath = (path: string) =>
  path.startsWith('/') ? pointerToPath(path) : path

/** The answer a pasted response is: the submit answer, or a query answer (the only one of a sync interface). */
export type ResponseStage = 'submit' | 'query'

/**
 * Reads a pasted upstream response as the Executor reads it at that stage, with the Profile the form builds: from a
 * submit answer the task ID; from a query answer the status by pointer, results by the mapped pointers and then the
 * output paths, and the failure reason. Throws on text that is not JSON.
 */
export function readResponseSample(
  profile: CatalogJson,
  pasted: string,
  stage: ResponseStage
): ResponseReading[] {
  const value: unknown = JSON.parse(pasted)
  const response = (
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  ) as CatalogJson
  const byPointer = (
    what: 'taskId' | 'status',
    candidate: unknown,
    usable: (found: unknown) => boolean
  ): ResponseReading => {
    const tried = pathList(candidate).map(shownPath)
    const match = pointerMatch(response, candidate)
    if (!match) return { what, found: [], tried, bad: true }
    return {
      what,
      found: [match.value],
      path: shownPath(match.path),
      tried,
      bad: !usable(match.value),
    }
  }
  const polls = profile.workflow !== 'sync'
  if (polls && stage === 'submit') {
    // The Executor takes the task ID from the submit answer, by its own mapping when it has one, and keeps only text.
    return [
      byPointer(
        'taskId',
        operationTaskIdMapping(profile, 'submit'),
        (found) => typeof found === 'string'
      ),
    ]
  }
  const readings: ResponseReading[] = []
  if (polls) {
    const status = byPointer(
      'status',
      dotted(profile, 'map.response.status'),
      () => true
    )
    if (status.found.length) {
      const states = (profile.states ?? {}) as CatalogJson
      status.state =
        TASK_STATES.find((group) =>
          pathList(states[group]).includes(String(status.found[0]))
        ) ?? null
      status.bad = status.state === null
    }
    readings.push(status)
  }
  const outputs = outputMatch(response, profile)
  readings.push({
    what: 'result',
    found: outputs.values,
    ...(outputs.path ? { path: shownPath(outputs.path) } : {}),
    tried: [
      ...pathList(dotted(profile, 'map.response.outputs')),
      ...pathList(dotted(profile, 'advanced.response.outputPaths')),
    ].map(shownPath),
    ...(outputs.unsupportedPath === undefined
      ? {}
      : { refusedPath: outputs.unsupportedPath }),
    bad: !outputs.values.length,
  })
  readings.push(errorReading(response, profile))
  return readings
}

// The failure reason the Executor reads first: the first error path that holds text.
function errorReading(
  response: CatalogJson,
  profile: CatalogJson
): ResponseReading {
  const paths = dotted(profile, 'advanced.response.errorPaths')
  const tried = pathList(paths)
  const match = errorMessageMatch(response, paths)
  if (match) {
    return {
      what: 'error',
      found: [match.value],
      path: match.path,
      tried,
      bad: false,
    }
  }
  const refusedPath = tried.find(
    (path) => restrictedJsonPath(response, path) === null
  )
  return {
    what: 'error',
    found: [],
    tried,
    ...(refusedPath === undefined ? {} : { refusedPath }),
    bad: true,
  }
}

/** The poll request as it goes out: the task ID from the submit answer, in the path or a query parameter. */
export type PollRequest =
  | { issue: 'empty' }
  | { issue: 'placeholderInPath'; placeholder: string }
  | { issue: 'noPlaceholder' }
  | {
      issue?: undefined
      method: string
      path: string
      queryName?: string
      taskId: string
      submitIdPath?: string
    }

export function pollRequest(draft: ChannelDraft): PollRequest {
  const path = draft.poll.path.trim()
  if (!path) return { issue: 'empty' }
  const placeholder = path.match(POLL_ID)
  const query = draft.poll.taskIdIn === 'query'
  if (query && placeholder) {
    return { issue: 'placeholderInPath', placeholder: placeholder[0] }
  }
  if (!query && !placeholder) return { issue: 'noPlaceholder' }
  return {
    method: draft.poll.method,
    path: query ? path : path.replace(POLL_ID, SAMPLE_TASK_ID),
    queryName: query ? draft.poll.queryName.trim() : undefined,
    taskId: SAMPLE_TASK_ID,
    submitIdPath: [
      ...toList(draft.submitTaskId),
      ...toList(draft.taskIdPath),
    ][0],
  }
}

/** The upload of one sample material and its status check, rendered from the body template with what the Executor gives it. */
export type AssetRequest =
  | { issue: 'noUpload' }
  | { issue: 'empty' }
  | {
      issue?: undefined
      kind: MediaKind
      method: string
      path: string
      format: string
      body: { text: string } | { reason: string; field?: string }
      poll:
        | { issue: 'none' }
        | { issue: 'noPlaceholder' }
        | {
            issue?: undefined
            method: string
            path: string
            remoteId: string
            idPath?: string
            readyValues: string[]
          }
    }

export function assetRequest(draft: ChannelDraft): AssetRequest {
  const kind = uploadedKind(draft)
  if (!kind) return { issue: 'noUpload' }
  const path = draft.prepareAsset.path.trim()
  if (!path) return { issue: 'empty' }
  const sample = sampleUpload(kind)
  const assetType = { image: 'Image', video: 'Video', audio: 'Audio' }[kind]
  let body: { text: string } | { reason: string; field?: string }
  try {
    const built = evaluateTemplate(JSON.parse(draft.asset[kind].body || '{}'), {
      model: { upstreamId: 'example-model', protocolOptions: {} },
      request: {
        mediaPublicUrl: sample.url,
        mediaSafeName: sample.name,
        mediaAssetType: assetType,
      },
      media: { images: [], videos: [], audios: [] },
    })
    body = { text: JSON.stringify(built ?? {}, null, 2) }
  } catch (error) {
    if (error instanceof SyntaxError) body = { reason: 'JSON' }
    else if (error instanceof TemplateLanguageError) {
      body = { reason: error.reason, field: error.field }
    } else throw error
  }
  return {
    kind,
    method: draft.prepareAsset.method,
    path,
    format: draft.prepareAsset.format ?? 'application/json',
    body,
    poll: assetPoll(draft, kind),
  }
}

function assetPoll(
  draft: ChannelDraft,
  kind: MediaKind
): Extract<AssetRequest, { kind: MediaKind }>['poll'] {
  const path = draft.pollAsset.path.trim()
  if (!path) return { issue: 'none' }
  if (!POLL_ID.test(path)) return { issue: 'noPlaceholder' }
  const { remoteId } = sampleUpload(kind)
  return {
    method: draft.pollAsset.method,
    path: path.replace(POLL_ID, remoteId),
    remoteId,
    idPath: toList(draft.asset[kind].remoteIdPaths)[0],
    readyValues: toList(draft.asset[kind].readyValues),
  }
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// A video or image Channel is filled in by canvas mode: how the prompt and materials are sent (by field, in one list, or
// by an expression), which materials each mode takes, and what each item looks like. The request rows stay what is
// stored; these functions read and change them on a working copy of the draft, which the form then keeps.
import {
  buildProfile,
  channelDraftFrom,
  requestRowTemplate,
  sampleRequest,
  type Accepts,
  type ChannelIssue,
  type ChannelDraft,
  type MaterialKind,
  type RequestRow,
  type SampleKind,
  type Slot,
} from './catalog-channel-draft'
import {
  CONTENT_ROLES,
  compileParts,
  defaultListParts,
  sameShape,
  shapeIssue,
  URL_SHAPE,
  type ShapeIssue,
  type ShapePart,
  type ShapeParts,
} from './catalog-channel-shapes'
import {
  TemplateLanguageError,
  validateTemplate,
} from './executor-shared/templateLanguageV1'

export type BodyName = 'rows' | 'imageRows'
export type MediaMode = 'text' | 'first' | 'frames' | 'reference'
export type SendStyle = 'fields' | 'list' | 'expr'
type FrameSlot = 'first' | 'last'
/** A slot that carries a material, as opposed to the prompt. */
export type MediaSlot = Exclude<Slot, 'prompt'>
type MediaPart = Exclude<ShapePart, 'text'>

/** Changes run on a copy, so the form keeps an untouched draft until it sets the new one. */
export function editMaterials(
  draft: ChannelDraft,
  change: (next: ChannelDraft) => void
): ChannelDraft {
  const next = structuredClone(draft)
  change(next)
  return next
}

const SLOT_SOURCES: Record<Slot, string[]> = {
  prompt: ['prompt', 'promptOptional'],
  first: ['firstFrame'],
  last: ['lastFrame'],
  images: [
    'images',
    'imagesAlways',
    'imagesByRole',
    'imageFiles',
    'imagesBase64',
  ],
  videos: ['videos', 'videoFiles', 'videosBase64'],
  audios: ['audios', 'audioFiles', 'audiosBase64'],
}
/** Sources the materials section shows, so the other field groups leave them out. */
export const MATERIAL_SOURCES = [
  ...Object.values(SLOT_SOURCES).flat(),
  'contentParts',
  'shaped',
  'negativePrompt',
]
const IMAGE_SLOTS = new Set<Slot>(['first', 'last', 'images'])
/** The material each slot carries; it is also the send content part of that slot. */
export const KIND_OF_SLOT: Record<MediaSlot, MaterialKind> = {
  first: 'first',
  last: 'last',
  images: 'reference',
  videos: 'video',
  audios: 'audio',
}
const PLAIN_SOURCE: Record<MediaPart, string> = {
  first: 'firstFrame',
  last: 'lastFrame',
  reference: 'imagesByRole',
  all: 'images',
  video: 'videos',
  audio: 'audios',
}
export const SHAPEABLE = [
  'shaped',
  'firstFrame',
  'lastFrame',
  'images',
  'imagesByRole',
  'videos',
  'audios',
]
const CONTENT_COVERS = new Set([
  'prompt',
  'promptOptional',
  'images',
  'videos',
  'audios',
  'firstFrame',
  'lastFrame',
])
const MEDIA_OF_PART: Record<MediaPart, 'image' | 'video' | 'audio'> = {
  first: 'image',
  last: 'image',
  reference: 'image',
  all: 'image',
  video: 'video',
  audio: 'audio',
}
const PICKED_ROLES = ['first-frame', 'last-frame', 'image-reference']
const FOLLOW_REFERENCE = ['connected-input', 'prompt-reference']
export const ACCEPT_SLOT: Record<MaterialKind, MediaSlot> = {
  first: 'first',
  last: 'last',
  reference: 'images',
  video: 'videos',
  audio: 'audios',
}
const SLOT_CARRIES: Record<Slot, keyof Carried> = {
  prompt: 'prompt',
  ...KIND_OF_SLOT,
}
/** The materials each mode's tab shows. */
export const MODE_SLOT_KEYS: Partial<Record<MediaMode, MediaSlot[]>> = {
  first: ['first'],
  frames: ['first', 'last'],
  reference: ['images', 'videos', 'audios'],
}
export const LIST_PARTS: Partial<Record<MediaMode, MaterialKind[]>> = {
  first: ['first'],
  frames: ['first', 'last'],
  reference: ['reference', 'video', 'audio'],
}
const MODE_SAMPLE: Record<MediaMode, SampleKind> = {
  text: 'default',
  first: 'first',
  frames: 'frames',
  reference: 'omni',
}
// Executor media-delivery.ts sets url, file or data on a reference, so the field has to read the same one.
// A request sent only with images reads every image whether or not it is picked, so it has a source of its own.
const LIST_SOURCES = {
  image: {
    url: 'images',
    urlWithImages: 'imagesAlways',
    file: 'imageFiles',
    data: 'imagesBase64',
  },
  video: {
    url: 'videos',
    urlWithImages: 'videos',
    file: 'videoFiles',
    data: 'videosBase64',
  },
  audio: {
    url: 'audios',
    urlWithImages: 'audios',
    file: 'audioFiles',
    data: 'audiosBase64',
  },
} as const

export interface Carried {
  prompt: boolean
  image: boolean
  first: boolean
  last: boolean
  reference: boolean
  video: boolean
  audio: boolean
}

/** What a request can carry, read from its template. An image reference not picked by role takes every image. */
export function carriedBy(
  template: unknown,
  roles: Record<string, string>
): Carried {
  const body = JSON.stringify(template) ?? ''
  const allImages = body
    .replaceAll(/"mediaUrls?ByRole","args":\[\{"\$ref":"media\.images"\}/g, '')
    .includes('media.images')
  const picks = (role: string, fallback: string) =>
    allImages ||
    (/"mediaUrls?ByRole"/.test(body) &&
      body.includes(`"${roles[role] || fallback}"`))
  return {
    prompt: body.includes('"request.prompt"'),
    image: body.includes('media.images'),
    first: picks('first-frame', 'first_frame'),
    last: picks('last-frame', 'last_frame'),
    reference: picks('image-reference', 'reference_image'),
    video: body.includes('media.videos'),
    audio: body.includes('media.audios'),
  }
}

const MEASURED: Array<[MaterialKind, SampleKind, string]> = [
  ['first', 'first', 'first-frame-1'],
  ['last', 'last', 'last-frame-1'],
  ['reference', 'reference', 'image-reference-1'],
  ['video', 'video', 'video-reference-1'],
  ['audio', 'audio', 'audio-reference-1'],
]
const measuredCache = new Map<string, Accepts>()
/**
 * What an interface accepts, measured: each material is rendered on its own by the Executor's template language, and
 * the request either holds it or not. An expression is judged by what it sends, not by how it is written.
 */
export function measuredSupport(draft: ChannelDraft): Accepts {
  if (!draft.submit.path.trim()) return {}
  const key = JSON.stringify([
    draft.capability,
    draft.rows,
    draft.imageRows,
    draft.roleMap,
    draft.media,
    draft.images,
    draft.wrap,
  ])
  const cached = measuredCache.get(key)
  if (cached) return cached
  const profile = buildProfile(draft, null, 'measure')
  const kinds =
    draft.capability === 'image.generate'
      ? MEASURED.filter(([kind]) => kind === 'reference')
      : MEASURED
  const value: Accepts = Object.fromEntries(
    kinds.map(([kind, sample, marker]) => {
      const request = sampleRequest(draft, profile, sample, {
        prompt: 'prompt',
        upstreamId: 'model',
        option: () => '',
      })
      return [
        kind,
        !request.failure && JSON.stringify(request.body).includes(marker),
      ]
    })
  )
  if (measuredCache.size > 200) measuredCache.clear()
  measuredCache.set(key, value)
  return value
}

const profileMeasures = new WeakMap<object, Accepts>()
/** What a published interface accepts, for the model form; measured once per Profile. */
export function measuredForProfile(
  profile: Record<string, unknown> | undefined,
  contract: Record<string, unknown> | undefined
): Accepts {
  if (!profile || !contract) return {}
  const cached = profileMeasures.get(profile)
  if (cached) return cached
  const value = isModeView(String(profile.kind))
    ? measuredSupport(channelDraftFrom(profile, contract))
    : {}
  profileMeasures.set(profile, value)
  return value
}

/** Modes a model can turn on, and which material each needs from the interface. */
export const MODE_NEEDS: Array<{
  flag: string
  needs: MaterialKind[]
}> = [
  { flag: 'supportsImageToVideo', needs: ['first'] },
  { flag: 'supportsStartEndFrames', needs: ['first', 'last'] },
  { flag: 'supportsImageReference', needs: ['reference'] },
  { flag: 'supportsVideoReference', needs: ['video'] },
  { flag: 'supportsAudioReference', needs: ['audio'] },
]
/** Modes a model turned on whose materials the interface does not accept. */
export function modeGaps(
  limits: Record<string, unknown> | undefined,
  accepted: Accepts
): Array<{ flag: string; missing: MaterialKind[] }> {
  return MODE_NEEDS.filter(
    ({ flag, needs }) =>
      limits?.[flag] === true && needs.some((kind) => !accepted[kind])
  ).map(({ flag, needs }) => ({
    flag,
    missing: needs.filter((kind) => !accepted[kind]),
  }))
}

/** The switches a draft opens with: what it measurably sends, so a blank one starts with nothing on. */
function startingAccepts(draft: ChannelDraft): Accepts {
  const kinds: MaterialKind[] =
    draft.capability === 'image.generate'
      ? ['reference']
      : ['first', 'last', 'reference', 'video', 'audio']
  return {
    ...Object.fromEntries(kinds.map((kind) => [kind, false])),
    ...measuredSupport(draft),
  }
}
/** A draft as the form opens it, with the acceptance switches set from what it sends. */
export function withMeasuredAccepts(draft: ChannelDraft): ChannelDraft {
  if (!isModeView(draft.capability)) return draft
  return editMaterials(draft, (x) => {
    x.materials.accepts = startingAccepts(x)
  })
}

export const isModeView = (capability: string) =>
  capability === 'video.generate' || capability === 'image.generate'

/** Every read and change of the materials of one request body; `x` is the working draft. */
export function materialsOf(x: ChannelDraft, body: BodyName) {
  const imageView = x.capability === 'image.generate'
  const memory = x.materials
  const bodyRows = () => x[body]
  const textBodyWithImagesElsewhere = Boolean(x.images) && body === 'rows'
  // A text request beside an image request carries only what the image request does not.
  const bodyKinds = (): MaterialKind[] => {
    if (textBodyWithImagesElsewhere) return imageView ? [] : ['video', 'audio']
    return imageView
      ? ['reference']
      : ['first', 'last', 'reference', 'video', 'audio']
  }
  const contentRow = () =>
    bodyRows().find((row) => row.source === 'contentParts')
  const slotRow = (slot: Slot) =>
    bodyRows().find(
      (row) =>
        SLOT_SOURCES[slot].includes(row.source) ||
        (row.source === 'shaped' &&
          slot !== 'prompt' &&
          (row.parts?.[KIND_OF_SLOT[slot]] !== undefined ||
            (IMAGE_SLOTS.has(slot) && row.parts?.all !== undefined)))
    )
  const rowTemplateOf = (row: RequestRow): unknown => {
    if (row.source === 'expr') {
      try {
        return JSON.parse(row.expr || 'null')
      } catch {
        return null
      }
    }
    return row.source
  }
  const mediaExprRows = () =>
    bodyRows().filter(
      (row) => row.source === 'expr' && /"media\./.test(row.expr ?? '')
    )
  const slotExprRow = (slot: Slot) =>
    bodyRows().find(
      (row) =>
        row.source === 'expr' &&
        carriedBy(rowTemplateOf(row), x.roleMap)[SLOT_CARRIES[slot]]
    )
  // Slot fields and an expression together stay "by field": the slots must stay visible, or they would be sent unseen.
  const mediaStyle = (): SendStyle => {
    if (contentRow()) return 'list'
    const slotFields = (Object.keys(SLOT_SOURCES) as Slot[]).some((slot) =>
      slotRow(slot)
    )
    return mediaExprRows().length && !slotFields ? 'expr' : 'fields'
  }
  // A request sent only with images takes the image modes; the other request takes the rest.
  const bodyModes = (): MediaMode[] => {
    const all: MediaMode[] = imageView
      ? ['text', 'reference']
      : ['text', 'first', 'frames', 'reference']
    if (!x.images) return all
    if (body === 'imageRows') return all.filter((mode) => mode !== 'text')
    return imageView ? ['text'] : ['text', 'reference']
  }
  const supportedModes = (acc: Accepts): MediaMode[] =>
    imageView
      ? ['text', ...(acc.reference ? (['reference'] as const) : [])]
      : [
          'text',
          ...(acc.first ? (['first'] as const) : []),
          ...(acc.first && acc.last ? (['frames'] as const) : []),
          ...(acc.reference || acc.video || acc.audio
            ? (['reference'] as const)
            : []),
        ]
  // Reading never changes the draft; the switches are written when a draft is opened and when they change.
  const accepts = (): Accepts =>
    mediaStyle() === 'expr'
      ? measuredSupport(x)
      : (memory.accepts ?? startingAccepts(x))
  const allowedModes = () =>
    bodyModes().filter((mode) => supportedModes(accepts()).includes(mode))
  const naturalMode = (): MediaMode =>
    mediaStyle() !== 'fields' ||
    mediaExprRows().length ||
    slotRow('images') ||
    slotRow('videos') ||
    slotRow('audios')
      ? 'reference'
      : 'text'
  /** The mode shown: the one picked when this body has it, else the one the stored fields suggest. */
  const currentMode = (picked?: MediaMode): MediaMode => {
    if (picked && bodyModes().includes(picked)) return picked
    const allowed = allowedModes()
    const natural = x.images ? bodyModes()[0] : naturalMode()
    return allowed.includes(natural)
      ? natural
      : (allowed.at(-1) ?? bodyModes()[0])
  }
  const modeSample = (mode: MediaMode): SampleKind => {
    if (mode !== 'reference') return MODE_SAMPLE[mode]
    if (imageView) return 'reference'
    return textBodyWithImagesElsewhere ? 'videoAudio' : MODE_SAMPLE[mode]
  }
  // A frame with no field of its own goes with the images when that list takes every image, as hfsyapi.video does.
  const slotField = (slot: Slot): string => {
    const row = slotRow(slot)
    if (row) return row.field
    const images = slotRow('images')
    return (slot === 'first' || slot === 'last') &&
      images &&
      images.source !== 'imagesByRole' &&
      !memory.slotAbsent[slot]
      ? images.field
      : ''
  }
  const rowOfSlot = (slot: Slot) =>
    slotRow(slot) ??
    ((slot === 'first' || slot === 'last') && slotField(slot)
      ? slotRow('images')
      : undefined)
  const shapeKey = (row: RequestRow, slot: MediaSlot): MediaPart =>
    IMAGE_SLOTS.has(slot) &&
    (row.source === 'images' || row.parts?.all !== undefined)
      ? 'all'
      : KIND_OF_SLOT[slot]
  const slotShape = (slot: MediaSlot): string => {
    const row = rowOfSlot(slot)
    return row?.source === 'shaped'
      ? (row.parts?.[shapeKey(row, slot)] ?? '')
      : URL_SHAPE
  }
  const removeRow = (target: RequestRow | undefined) => {
    if (target) bodyRows().splice(bodyRows().indexOf(target), 1)
  }

  // One shape for every image becomes one per frame and reference, so each can change or leave the field on its own.
  const splitShared = (row: RequestRow) => {
    const shared = row.parts?.all ?? URL_SHAPE
    const { all: _all, ...others } = row.parts ?? {}
    Object.assign(row, {
      source: 'shaped',
      sharedShape: shared,
      parts: { ...others, first: shared, last: shared, reference: shared },
    })
  }
  // Back to the same shape for all three, the field is the shared form again and the stored template stays what it was.
  const rejoinShared = (row: RequestRow) => {
    const parts = row.parts ?? {}
    const shared = row.sharedShape
    if (
      shared === undefined ||
      !(['first', 'last', 'reference'] as const).every(
        (part) => parts[part] !== undefined && sameShape(parts[part], shared)
      )
    ) {
      return
    }
    const { first: _f, last: _l, reference: _r, ...others } = parts
    row.parts = { ...others, all: shared }
    delete row.sharedShape
  }

  const picksByRole = () =>
    [...x.rows, ...x.imageRows].some(
      (row) =>
        ['firstFrame', 'lastFrame', 'imagesByRole', 'contentParts'].includes(
          row.source
        ) ||
        (row.source === 'shaped' &&
          (['first', 'last', 'reference'] as const).some(
            (key) => row.parts?.[key] !== undefined
          )) ||
        (row.source === 'expr' && /ByRole/.test(row.expr ?? ''))
    )
  // Picking an image by role needs each role named, and frames and references named apart: hfsyapi.video names all three
  // "image" because it sends every image in one list, and once a frame has its own field that name picks them all.
  // Names replaced for that come back when nothing picks by role any more, so splitting and rejoining changes nothing.
  const nameRolesPickedBy = (picks = picksByRole()) => {
    if (!picks) {
      if (!memory.roleMemory) return
      for (const [role, name] of Object.entries(memory.roleMemory)) {
        if (name === undefined) delete x.roleMap[role]
        else x.roleMap[role] = name
      }
      memory.roleMemory = null
      return
    }
    const named = { ...x.roleMap }
    for (const [role, name] of Object.entries(CONTENT_ROLES)) {
      if (!String(named[role] ?? '').trim()) named[role] = name
    }
    const names = PICKED_ROLES.map((role) => String(named[role]).trim())
    if (new Set(names).size < names.length) {
      for (const role of [...PICKED_ROLES, ...FOLLOW_REFERENCE]) {
        named[role] = CONTENT_ROLES[role]
      }
    }
    if (
      Object.keys(CONTENT_ROLES).every(
        (role) => named[role] === x.roleMap[role]
      )
    ) {
      return
    }
    memory.roleMemory ??= Object.fromEntries(
      Object.keys(CONTENT_ROLES).map((role) => [role, x.roleMap[role]])
    )
    x.roleMap = named
  }

  // One part left in its default, sent as it naturally is, is that part's plain source again.
  const plainIfDefault = (row: RequestRow) => {
    const keys = Object.keys(row.parts ?? {}) as MediaPart[]
    if (
      keys.length !== 1 ||
      !sameShape(row.parts?.[keys[0]], URL_SHAPE) ||
      row.asList
    ) {
      return
    }
    row.source = PLAIN_SOURCE[keys[0]]
    delete row.parts
    delete row.asList
  }
  // Everything default and shared is the plain list again; one part left in its default is that part's plain source.
  const settleShaped = (row: RequestRow) => {
    if (row.source !== 'shaped') return
    const keys = Object.keys(row.parts ?? {}) as ShapePart[]
    // A field whose last part moved to another field sends nothing, so it goes.
    if (!keys.length) {
      removeRow(row)
      return
    }
    rejoinShared(row)
    const parts = row.parts ?? {}
    if (parts.all !== undefined) {
      if (Object.keys(parts).length === 1 && sameShape(parts.all, URL_SHAPE)) {
        row.source = 'images'
        delete row.parts
        memory.slotAbsent = {}
      }
      return
    }
    const plainImages =
      keys.length === 3 &&
      (['first', 'last', 'reference'] as const).every((key) =>
        sameShape(parts[key], URL_SHAPE)
      )
    if (plainImages) {
      row.source = 'images'
      delete row.parts
      memory.slotAbsent = {}
      return
    }
    plainIfDefault(row)
  }

  // A field's source follows the delivery, so a file or data reaches the field that reads it.
  const followDelivery = (
    kind: keyof typeof LIST_SOURCES,
    delivery: string
  ) => {
    const sources = LIST_SOURCES[kind]
    const byDelivery: Record<string, string> = {
      'multipart-file': sources.file,
      base64: sources.data,
    }
    const target = byDelivery[delivery]
    const all = new Set<string>([
      sources.url,
      sources.urlWithImages,
      sources.file,
      sources.data,
    ])
    for (const [rows, urlSource] of [
      [x.rows, sources.url],
      [x.imageRows, sources.urlWithImages],
    ] as const) {
      for (const row of rows) {
        if (!all.has(row.source)) continue
        if (target) row.source = target
        else if (row.source === sources.file || row.source === sources.data) {
          row.source = urlSource
        }
      }
    }
    if (delivery === 'multipart-file') {
      const operation = x.images ?? x.submit
      operation.format = 'multipart/form-data'
    }
  }
  const followAllDelivery = () => {
    for (const kind of Object.keys(LIST_SOURCES) as Array<
      keyof typeof LIST_SOURCES
    >) {
      followDelivery(kind, x.media[kind])
    }
  }

  const setShape = (slot: MediaSlot, text: string) => {
    const row = rowOfSlot(slot)
    if (!row) return
    const key = KIND_OF_SLOT[slot]
    if (
      IMAGE_SLOTS.has(slot) &&
      (row.source === 'images' || row.parts?.all !== undefined)
    ) {
      splitShared(row)
    }
    row.source = 'shaped'
    row.parts = { ...row.parts, [key]: text }
    rejoinShared(row)
    plainIfDefault(row)
    nameRolesPickedBy()
  }
  // A frame alone in its field is one value by default; some upstreams take a list holding only that frame.
  const frameAlone = (slot: FrameSlot) => {
    const row = slotRow(slot)
    if (!row) return false
    return (
      row.source === 'firstFrame' ||
      row.source === 'lastFrame' ||
      (row.source === 'shaped' &&
        Object.keys(row.parts ?? {}).join() === KIND_OF_SLOT[slot])
    )
  }
  const setFrameForm = (slot: FrameSlot, form: 'single' | 'list') => {
    const row = slotRow(slot)
    if (!row) return
    const key = KIND_OF_SLOT[slot]
    if (row.source !== 'shaped') {
      Object.assign(row, { source: 'shaped', parts: { [key]: URL_SHAPE } })
    }
    row.asList = form === 'list'
    plainIfDefault(row)
    nameRolesPickedBy()
  }
  const slotSendsList = (slot: MediaSlot) => {
    if (!IMAGE_SLOTS.has(slot) || slot === 'images') return true
    const row = rowOfSlot(slot)
    if (!row) return false
    return (
      row.source === 'images' ||
      row.source === 'imageFiles' ||
      row.source === 'imagesBase64' ||
      Boolean(row.asList) ||
      (row.source === 'shaped' &&
        (row.parts?.all !== undefined ||
          Object.keys(row.parts ?? {}).length > 1))
    )
  }

  const applySlot = (slot: Slot, value: string) => {
    const name = value.trim()
    const row = slotRow(slot)
    const part = slot === 'prompt' ? undefined : KIND_OF_SLOT[slot]
    const sharing =
      name && part
        ? bodyRows().find(
            (other) =>
              other.source === 'shaped' &&
              other !== row &&
              other.field.trim() === name
          )
        : undefined
    // A frame leaving a field that shares one shape for all images takes only its own part with it.
    if (
      row?.source === 'shaped' &&
      row.parts?.all !== undefined &&
      (slot === 'first' || slot === 'last') &&
      name !== row.field.trim()
    ) {
      splitShared(row)
    }
    // Only a material is shaped; the prompt always has a plain field.
    if (row?.source === 'shaped' && slot !== 'prompt') {
      const key = shapeKey(row, slot)
      if (
        key === 'all' ||
        (Object.keys(row.parts ?? {}).length === 1 && !sharing)
      ) {
        if (name) row.field = name
        else {
          if (!sameShape(row.parts?.[key], URL_SHAPE) || row.asList) {
            memory.shapeMemory = {
              ...memory.shapeMemory,
              [slot]: row.parts?.[key],
            }
          }
          removeRow(row)
        }
        return
      }
      const { [key]: shape = URL_SHAPE, ...left } = row.parts ?? {}
      if (!name && !sameShape(shape, URL_SHAPE)) {
        memory.shapeMemory = { ...memory.shapeMemory, [slot]: shape }
      }
      row.parts = left
      if (sharing) sharing.parts = { ...sharing.parts, [key]: shape }
      else if (name) {
        bodyRows().push({
          field: name,
          source: 'shaped',
          parts: { [key]: shape },
          transform: '',
        })
      }
      settleShaped(row)
      if (sharing) settleShaped(sharing)
      return
    }
    if (sharing && part) {
      removeRow(row)
      if (!(IMAGE_SLOTS.has(slot) && sharing.parts?.all !== undefined)) {
        sharing.parts = { ...sharing.parts, [part]: URL_SHAPE }
      }
      settleShaped(sharing)
      return
    }
    const frame = slot === 'first' || slot === 'last'
    if (frame) {
      memory.slotAbsent = { ...memory.slotAbsent, [slot]: !name }
      if (!name || name === slotRow('images')?.field.trim()) removeRow(row)
      else if (row) row.field = name
      else {
        bodyRows().push({
          field: name,
          source: slot === 'first' ? 'firstFrame' : 'lastFrame',
          transform: '',
        })
      }
    } else if (!name) removeRow(row)
    else if (row) row.field = name
    else {
      bodyRows().push({ field: name, source: slot, transform: '' })
      followAllDelivery()
    }
    // With every shape plain, frames go with the images together or not at all; a shaped field holds each part on its own.
    const imagesRow = slotRow('images')
    const imagesField =
      imagesRow && ['images', 'imagesByRole'].includes(imagesRow.source)
        ? imagesRow.field.trim()
        : ''
    if (
      (imagesField &&
        [slotRow('first'), slotRow('last')].some(
          (frameRow) =>
            frameRow?.source !== 'shaped' &&
            frameRow?.field.trim() === imagesField
        )) ||
      (frame && name && name === imagesField)
    ) {
      removeRow(slotRow('first'))
      removeRow(slotRow('last'))
      memory.slotAbsent = {}
    }
    // With frames in fields of their own, the image list must leave them out, or they would be sent twice.
    const images = slotRow('images')
    if (images && ['images', 'imagesByRole'].includes(images.source)) {
      const absent = memory.slotAbsent
      // A frame left empty must not go out with the images, while the other frame can still share their field.
      if (
        !slotRow('first') &&
        !slotRow('last') &&
        Boolean(absent.first) !== Boolean(absent.last)
      ) {
        Object.assign(images, {
          source: 'shaped',
          parts: {
            [absent.first ? 'last' : 'first']: URL_SHAPE,
            reference: URL_SHAPE,
          },
        })
      } else {
        images.source =
          slotRow('first') || slotRow('last') || absent.first
            ? 'imagesByRole'
            : 'images'
      }
    }
  }
  const setSlot = (slot: Slot, value: string) => {
    applySlot(slot, value)
    const kept = memory.shapeMemory[slot]
    if (
      slot !== 'prompt' &&
      value.trim() &&
      kept !== undefined &&
      rowOfSlot(slot) &&
      sameShape(slotShape(slot), URL_SHAPE)
    ) {
      setShape(slot, kept)
      delete memory.shapeMemory[slot]
    }
    nameRolesPickedBy()
    followAllDelivery()
  }

  // Optional and outside the send styles: usually a field of its own, whichever way the prompt and materials go.
  const negativeRow = () =>
    bodyRows().find((row) => row.source === 'negativePrompt')
  const negativeExprRow = () =>
    bodyRows().find(
      (row) =>
        row.source === 'expr' &&
        /"request\.negativePrompt"/.test(row.expr ?? '')
    )
  const setNegative = (value: string) => {
    const name = value.trim()
    const row = negativeRow()
    if (!name) {
      removeRow(row)
      return
    }
    if (row) {
      row.field = name
      return
    }
    bodyRows().push({ field: name, source: 'negativePrompt', transform: '' })
  }

  const newListParts = (): ShapeParts =>
    defaultListParts(x.roleMap, imageView ? { reference: false } : undefined)
  const setMediaStyle = (style: SendStyle) => {
    const from = mediaStyle()
    if (style === from) return
    // Leaving an expression, its measured materials become the switches; a list starts with only the accepted parts.
    memory.accepts =
      from === 'expr' ? { ...measuredSupport(x) } : { ...accepts() }
    const exprs = mediaExprRows()
    const covered = () =>
      bodyRows().filter(
        (row) =>
          row.source === 'shaped' ||
          CONTENT_COVERS.has(row.source) ||
          exprs.includes(row) ||
          Object.values(SLOT_SOURCES).flat().includes(row.source)
      )
    const list = contentRow()
    // The materials return where they were, so switching does not reorder the request.
    const at = bodyRows().findIndex(
      (row) => row === list || covered().includes(row)
    )
    const put = (rows: RequestRow[]) =>
      bodyRows().splice(at < 0 ? bodyRows().length : at, 0, ...rows)
    const take = (rows: RequestRow[]) => {
      x[body] = bodyRows().filter((row) => !rows.includes(row))
      return rows
    }
    if (list) {
      memory.listField = list.field
      memory.listParts = list.parts
      take([list])
    }
    if (from === 'expr') memory.exprRows = take(exprs)
    if (from === 'fields') memory.fieldRows = take(covered())
    if (style === 'fields') {
      const hasPrompt = bodyRows().some((row) =>
        ['prompt', 'promptOptional'].includes(row.source)
      )
      put(
        memory.fieldRows.length
          ? memory.fieldRows
          : [
              ...(hasPrompt
                ? []
                : [{ field: 'prompt', source: 'prompt', transform: '' }]),
              { field: 'images', source: 'images', transform: '' },
            ]
      )
      memory.fieldRows = []
      followAllDelivery()
      nameRolesPickedBy()
      return
    }
    // What is left is a prompt field an expression was sent beside; the list and the template both carry the prompt.
    memory.fieldRows = [...memory.fieldRows, ...take(covered())]
    // The list and the expression pick images by role, so the roles are named before the parts are written with them.
    nameRolesPickedBy(true)
    const parts =
      memory.listParts ??
      (Object.fromEntries(
        Object.entries(newListParts()).filter(
          ([key]) => key === 'text' || memory.accepts?.[key as MaterialKind]
        )
      ) as ShapeParts)
    if (style === 'list') {
      put([
        {
          field: memory.listField ?? 'content',
          source: 'contentParts',
          parts,
          transform: '',
        },
      ])
      return
    }
    // The expression starts from the list's structure, so an upstream that differs only needs its keys changed.
    put(
      memory.exprRows.length
        ? memory.exprRows
        : [
            {
              field: memory.listField ?? 'content',
              source: 'expr',
              expr: JSON.stringify(
                compileParts(parts, x.roleMap, true),
                null,
                2
              ),
              transform: '',
            },
          ]
    )
  }

  const setAccept = (kind: MaterialKind, on: boolean) => {
    memory.accepts = { ...accepts(), [kind]: on }
    const list = contentRow()
    if (list) {
      const { [kind]: removed, ...kept } = list.parts ?? {}
      if (on) {
        list.parts = {
          ...list.parts,
          [kind]: memory.partMemory[kind] ?? newListParts()[kind],
        }
        return
      }
      memory.partMemory = { ...memory.partMemory, [kind]: removed }
      list.parts = kept
      return
    }
    if (!on) setSlot(ACCEPT_SLOT[kind], '')
  }
  const setListPart = (key: ShapePart, text: string) => {
    const list = contentRow()
    if (list) list.parts = { ...list.parts, [key]: text }
  }

  return {
    imageView,
    textBodyWithImagesElsewhere,
    bodyKinds,
    bodyRows,
    contentRow,
    slotRow,
    slotField,
    rowOfSlot,
    slotShape,
    slotExprRow,
    mediaExprRows,
    mediaStyle,
    bodyModes,
    supportedModes,
    allowedModes,
    accepts,
    currentMode,
    modeSample,
    frameAlone,
    slotSendsList,
    negativeRow,
    negativeExprRow,
    setSlot,
    setShape,
    setFrameForm,
    setNegative,
    setMediaStyle,
    setAccept,
    setListPart,
    nameRolesPickedBy,
  }
}
export type Materials = ReturnType<typeof materialsOf>

// ---- Expressions: checked by the Executor's validator, and edited part by part when they are a list of parts ----

/** An OpenAPI schema pasted as an expression: the structure belongs in the contract, not in the template. */
function openApiLike(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray(node)) return node.some(openApiLike)
  const record = node as Record<string, unknown>
  if (typeof record.$ref === 'string' && record.$ref.startsWith('#/')) {
    return true
  }
  if (
    (record.type === 'array' && record.items) ||
    (record.type === 'object' && record.properties) ||
    record.oneOf ||
    record.anyOf
  ) {
    return true
  }
  return Object.values(record).some(openApiLike)
}

/** What is wrong with an expression that parses, by the Executor's own validator; JSON errors are reported elsewhere. */
export function exprIssue(expr: string | undefined): ShapeIssue | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(expr || '')
  } catch {
    return null
  }
  if (openApiLike(parsed)) {
    return {
      key: 'This looks like an OpenAPI schema, not an expression. Write how the request is built here; the structure belongs in the contract',
    }
  }
  try {
    validateTemplate(parsed)
    return null
  } catch (error) {
    if (!(error instanceof TemplateLanguageError)) throw error
    return {
      key: 'The expression is not valid: {{reason}} at {{field}}',
      values: { reason: error.reason, field: error.field },
    }
  }
}

export type SegmentKind =
  | 'mixed'
  | 'prompt'
  | 'first'
  | 'last'
  | 'reference'
  | 'images'
  | 'video'
  | 'audio'
  | 'other'

/** What a part sends, read from the values it takes; a part that takes several materials cannot be named by one. */
export function materialsTaken(
  text: string,
  roles: Record<string, string>
): Array<Exclude<SegmentKind, 'mixed' | 'other'>> {
  const found: Array<Exclude<SegmentKind, 'mixed' | 'other'>> = []
  const role = (key: string, fallback: string) => `"${roles[key] || fallback}"`
  const picks = /"mediaUrls?ByRole"/.test(text)
  if (text.includes('"request.prompt"')) found.push('prompt')
  if (picks && text.includes(role('first-frame', 'first_frame'))) {
    found.push('first')
  }
  if (picks && text.includes(role('last-frame', 'last_frame'))) {
    found.push('last')
  }
  if (picks && text.includes(role('image-reference', 'reference_image'))) {
    found.push('reference')
  }
  if (/"media\.images"/.test(text) && !picks) found.push('images')
  if (text.includes('"media.videos"')) found.push('video')
  if (text.includes('"media.audios"')) found.push('audio')
  return found
}
export function segmentKind(
  text: string,
  roles: Record<string, string>
): SegmentKind {
  const taken = materialsTaken(text, roles)
  return taken.length > 1 ? 'mixed' : (taken[0] ?? 'other')
}

/** An expression made of parts joined into one list, split into its parts; null when it is not that structure. */
export interface ExprSegments {
  wrap: boolean
  layout: number[]
  texts: string[]
}
export function exprSegments(
  expr: string | undefined,
  roles: Record<string, string>
): ExprSegments | null {
  let template: Record<string, unknown> | null
  try {
    template = JSON.parse(expr ?? '')
  } catch {
    return null
  }
  const wrapped =
    template?.$call === 'omitEmpty' &&
    Array.isArray(template.args) &&
    template.args.length === 1
      ? (template.args as unknown[])
      : null
  const wrap = Boolean(wrapped)
  const inner = (wrapped ? wrapped[0] : template) as Record<
    string,
    unknown
  > | null
  if (inner?.$call !== 'concat' || !Array.isArray(inner.args)) return null
  const args = inner.args as unknown[]
  const layout = args.map((arg) => (Array.isArray(arg) ? arg.length : -1))
  const pieces = args.flatMap((arg) => (Array.isArray(arg) ? arg : [arg]))
  if (
    pieces.length < 2 ||
    pieces.some(
      (piece) => segmentKind(JSON.stringify(piece), roles) === 'mixed'
    )
  ) {
    return null
  }
  return {
    wrap,
    layout,
    texts: pieces.map((piece) => JSON.stringify(piece, null, 2)),
  }
}
// The parts go back into the same structure, so the stored template is what one box would have held.
export function composeSegments(segs: ExprSegments): string {
  const token = (n: number) => `__segment_${n}__`
  let n = 0
  const args = segs.layout.map((count) =>
    count < 0 ? token(n++) : Array.from({ length: count }, () => token(n++))
  )
  const concat = { $call: 'concat', args }
  let text = JSON.stringify(
    segs.wrap ? { $call: 'omitEmpty', args: [concat] } : concat,
    null,
    2
  )
  segs.texts.forEach((part, i) => {
    text = text.replace(`"${token(i)}"`, () => part)
  })
  return text
}
/** Where each material sits in one undivided expression, by the lines that take it. */
export function materialLines(
  expr: string | undefined,
  roles: Record<string, string>
): Array<{ kind: SegmentKind; lines: number[] }> {
  const at = new Map<SegmentKind, number[]>()
  String(expr ?? '')
    .split('\n')
    .forEach((line, i) => {
      for (const kind of materialsTaken(
        line.includes('ByRole') ? line : `${line} "mediaUrlByRole"`,
        roles
      )) {
        at.set(kind, [...(at.get(kind) ?? []), i + 1])
      }
    })
  return [...at.entries()].map(([kind, lines]) => ({ kind, lines }))
}

// ---- Checks the page can make before publishing; Cloud checks everything again ----

const ACCEPT_FIELD_KEYS: Record<MaterialKind, string> = {
  first: 'Receiving the first frame is on; fill in "First frame goes in"',
  last: 'Receiving the last frame is on; fill in "Last frame goes in"',
  reference: 'Receiving reference images is on; fill in "Images go in"',
  video: 'Receiving reference videos is on; fill in "Videos go in"',
  audio: 'Receiving reference audio is on; fill in "Audio goes in"',
}
const ACCEPT_PART_KEYS: Record<MaterialKind, string> = {
  first: 'Receiving the first frame is on; fill in its send content',
  last: 'Receiving the last frame is on; fill in its send content',
  reference: 'Receiving reference images is on; fill in their send content',
  video: 'Receiving reference videos is on; fill in their send content',
  audio: 'Receiving reference audio is on; fill in its send content',
}
const SHAPE_DELIVERY_KEYS: Record<'image' | 'video' | 'audio', string> = {
  image:
    'Images are sent as files or base64, so send content has no address; send them by address, or send by field with the default send content',
  video:
    'Videos are sent as files or base64, so send content has no address; send them by address, or send by field with the default send content',
  audio:
    'Audio is sent as files or base64, so send content has no address; send it by address, or send by field with the default send content',
}
const GAP_KEYS: Record<string, string> = {
  supportsImageToVideo:
    "{{count}} models turn on image to video ({{models}}), but this interface does not take the first frame. Turn on receiving it in that mode's tab, or turn the mode off on those models first",
  supportsStartEndFrames:
    "{{count}} models turn on first and last frames ({{models}}), but this interface does not take both frames. Turn on receiving them in that mode's tab, or turn the mode off on those models first",
  supportsImageReference:
    '{{count}} models turn on reference images ({{models}}), but this interface does not take images. Turn on receiving them in the reference tab, or turn the mode off on those models first',
  supportsVideoReference:
    '{{count}} models turn on reference videos ({{models}}), but this interface does not take videos. Turn on receiving them in the reference tab, or turn the mode off on those models first',
  supportsAudioReference:
    '{{count}} models turn on reference audio ({{models}}), but this interface does not take audio. Turn on receiving it in the reference tab, or turn the mode off on those models first',
}
const RENDER_KEYS: Array<[SampleKind, string]> = [
  [
    'reference',
    'With a reference image the request fails: {{reason}} at {{field}}',
  ],
  ['first', 'With a first frame the request fails: {{reason}} at {{field}}'],
  ['last', 'With a last frame the request fails: {{reason}} at {{field}}'],
  ['frames', 'With both frames the request fails: {{reason}} at {{field}}'],
  [
    'video',
    'With a reference video the request fails: {{reason}} at {{field}}',
  ],
  ['audio', 'With reference audio the request fails: {{reason}} at {{field}}'],
  [
    'omni',
    'With images, video and audio the request fails: {{reason}} at {{field}}',
  ],
]

/**
 * Checks of the prompt and materials of a video or image form. `models` are the models on the Channel being edited,
 * whose modes need the materials the interface takes.
 */
export function materialIssues(
  draft: ChannelDraft,
  models: Array<{ key: string; limits?: Record<string, unknown> }> = []
): ChannelIssue[] {
  if (!isModeView(draft.capability)) return []
  const issues: ChannelIssue[] = []
  const bodies: BodyName[] = draft.images ? ['rows', 'imageRows'] : ['rows']
  const anyExprIssue = [...draft.rows, ...draft.imageRows].some(
    (row) =>
      row.source === 'expr' &&
      (exprInvalidJson(row.expr) || exprIssue(row.expr))
  )
  for (const body of bodies) {
    const rows = draft[body]
    if (body === 'imageRows' && !rows.length) continue
    const hasList = rows.some((row) => row.source === 'contentParts')
    rows.forEach((row, i) => {
      if (row.source === 'expr') {
        const issue = exprIssue(row.expr)
        if (issue) issues.push({ path: `${body}.${i}.expr`, ...issue })
      }
      if (hasList && CONTENT_COVERS.has(row.source)) {
        issues.push({
          path: `${body}.${i}.source`,
          key: 'The list already sends the prompt and materials; delete this field',
        })
      }
      for (const [key, text] of Object.entries(row.parts ?? {}) as Array<
        [ShapePart, string]
      >) {
        const issue = shapeIssue(key, text)
        if (issue) issues.push({ path: `${body}.shape.${i}.${key}`, ...issue })
        // The Executor sets a file or data on such a material, so a shape built on its address would send nothing.
        const kind = key === 'text' ? null : MEDIA_OF_PART[key]
        if (
          kind &&
          String(text ?? '').trim() &&
          ['multipart-file', 'base64'].includes(draft.media[kind])
        ) {
          issues.push({
            path: `${body}.shapeDelivery.${kind}`,
            key: SHAPE_DELIVERY_KEYS[kind],
          })
        }
      }
    })
    // An expression that does not parse says so itself; what it sends cannot be read until it does.
    if (anyExprIssue) continue
    const senders = rows.filter(
      (row) =>
        carriedBy(templateOfRow(row, draft.roleMap), draft.roleMap).prompt
    )
    if (!senders.length) {
      const exprOnly =
        rows.some(
          (row) => row.source === 'expr' && /"media\./.test(row.expr ?? '')
        ) &&
        !rows.some(
          (row) =>
            Object.values(SLOT_SOURCES).flat().includes(row.source) ||
            row.source === 'shaped'
        )
      let key = 'Enter the field the prompt goes in'
      if (exprOnly) {
        key =
          'The expression does not send the prompt yet; add {"$ref": "request.prompt"}'
      }
      if (hasList) key = 'The prompt send content cannot be empty'
      issues.push({ path: `${body}.promptSent`, key })
    }
    if (senders.length > 1) {
      issues.push({
        path: `${body}.promptSent`,
        key: 'The prompt is sent {{count}} times ({{fields}}); keep one',
        values: {
          count: senders.length,
          fields: senders.map((row) => row.field.trim()).join(', '),
        },
      })
    }
  }
  if (materialsOf(draft, 'rows').mediaStyle() !== 'expr') {
    for (const body of bodies) {
      const view = materialsOf(structuredClone(draft), body)
      const list = view.contentRow()
      const kinds = view.bodyKinds()
      const accepted = view.accepts()
      for (const kind of kinds) {
        if (!accepted[kind]) continue
        if (list && !String(list.parts?.[kind] ?? '').trim()) {
          issues.push({
            path: `${body}.accept.${kind}`,
            key: ACCEPT_PART_KEYS[kind],
          })
        }
        if (
          !list &&
          !view.slotField(ACCEPT_SLOT[kind]).trim() &&
          !view.slotExprRow(ACCEPT_SLOT[kind])
        ) {
          issues.push({
            path: `${body}.accept.${kind}`,
            key: ACCEPT_FIELD_KEYS[kind],
          })
        }
      }
    }
  }
  if (anyExprIssue || !draft.submit.path.trim()) return issues
  if (models.length) {
    const carried = measuredSupport(draft)
    const gaps = models.flatMap((model) =>
      modeGaps(model.limits, carried).map((gap) => ({
        ...gap,
        model: model.key,
      }))
    )
    for (const flag of new Set(gaps.map((gap) => gap.flag))) {
      const own = gaps.filter((gap) => gap.flag === flag)
      issues.push({
        path: 'mediaModes',
        key: GAP_KEYS[flag],
        values: {
          count: own.length,
          models: own.map((gap) => gap.model).join(', '),
        },
      })
    }
  }
  // The plain sample carries no material, so a template that fails only on materials is found by rendering each one.
  const profile = buildProfile(draft, null, 'check')
  const samples =
    draft.capability === 'image.generate'
      ? RENDER_KEYS.slice(0, 1)
      : RENDER_KEYS
  for (const [sample, key] of samples) {
    const { failure } = sampleRequest(draft, profile, sample, {
      prompt: 'prompt',
      upstreamId: 'model',
      option: () => '',
    })
    if (failure) {
      issues.push({ path: 'materialsRender', key, values: { ...failure } })
      break
    }
  }
  return issues
}

const exprInvalidJson = (expr: string | undefined) => {
  try {
    JSON.parse(expr || '')
    return false
  } catch {
    return true
  }
}
// What a row sends, for reading which materials it carries; the full template comes from the draft module.
function templateOfRow(
  row: RequestRow,
  roles: Record<string, string>
): unknown {
  if (row.source === 'expr') {
    try {
      return JSON.parse(row.expr || 'null')
    } catch {
      return null
    }
  }
  if (row.source === 'contentParts' || row.source === 'shaped') {
    return compileParts(
      row.parts ?? {},
      roles,
      row.source === 'contentParts',
      row.asList
    )
  }
  return requestRowTemplate(row, roles)
}

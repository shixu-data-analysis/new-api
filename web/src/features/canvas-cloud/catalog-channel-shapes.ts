/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// What one material looks like in the request ("send content") is written as the upstream's JSON with placeholders.
// These turn it into the template language and read a template back; reading back must give the same template, or the
// field stays an expression.
type Json = Record<string, unknown>
type RoleMap = Record<string, string>

export const URL_SHAPE = '{{url}}'
const REF = (path: string) => ({ $ref: path })

/** The parts a list or a shaped field holds: text, first, last, reference, all (every image), video, audio. */
export type ShapeParts = Partial<Record<ShapePart, string>>
export type ShapePart =
  | 'text'
  | 'first'
  | 'last'
  | 'reference'
  | 'all'
  | 'video'
  | 'audio'

// A placeholder needs no quotes, and quotes copied from an upstream document are fine; everything else is plain JSON.
export const readShape = (text: string): unknown =>
  JSON.parse(
    String(text).replaceAll(/"(?:[^"\\]|\\.)*"|\{\{\w+\}\}/g, (token) =>
      token.startsWith('"') ? token : `"${token}"`
    )
  )
export const shapeText = (node: unknown) =>
  JSON.stringify(node).replaceAll(/"(\{\{\w+\}\})"/g, '$1')
export function sameShape(one: string | undefined, other: string): boolean {
  try {
    return (
      JSON.stringify(readShape(one ?? '')) === JSON.stringify(readShape(other))
    )
  } catch {
    return false
  }
}

function fillShape(node: unknown, values: Record<string, unknown>): unknown {
  if (typeof node === 'string') {
    const name = /^\{\{(\w+)\}\}$/.exec(node)?.[1]
    return name && values[name] ? values[name] : node
  }
  if (Array.isArray(node)) return node.map((child) => fillShape(child, values))
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node).map(([key, child]) => [
        key,
        fillShape(child, values),
      ])
    )
  }
  return node
}

function unfillShape(node: unknown, values: Record<string, unknown>): unknown {
  const named = Object.entries(values).find(
    ([, value]) => JSON.stringify(value) === JSON.stringify(node)
  )
  if (named) return `{{${named[0]}}}`
  if (Array.isArray(node)) {
    return node.map((child) => unfillShape(child, values))
  }
  if (node && typeof node === 'object') {
    if (Object.keys(node).some((key) => key.startsWith('$'))) {
      throw new Error('not a shape')
    }
    return Object.fromEntries(
      Object.entries(node).map(([key, child]) => [
        key,
        unfillShape(child, values),
      ])
    )
  }
  return node
}

const pickOne = (roles: RoleMap, role: string, fallback: string) => ({
  $call: 'mediaUrlByRole',
  args: [REF('media.images'), roles[role] || fallback],
})
const pickAll = (roles: RoleMap) => ({
  $call: 'mediaUrlsByRole',
  args: [REF('media.images'), roles['image-reference'] || 'reference_image'],
})
const ITEM_VALUES = {
  url: REF('item.url'),
  role: REF('item.role'),
  durationSeconds: REF('item.durationSeconds'),
}
const OMIT_EMPTY = (node: unknown) => ({ $call: 'omitEmpty', args: [node] })

/**
 * The template for a list (text and materials in one array) or for a field whose items have a shape.
 * Returns null when a part is not valid JSON.
 */
export function compileParts(
  parts: ShapeParts,
  roles: RoleMap,
  list: boolean,
  asList = false
): unknown {
  const parsed: Partial<Record<ShapePart, unknown>> = {}
  for (const [key, text] of Object.entries(parts) as Array<
    [ShapePart, string]
  >) {
    if (!String(text ?? '').trim()) continue
    try {
      parsed[key] = readShape(text)
    } catch {
      return null
    }
  }
  const frame = (key: ShapePart, role: string, fallback: string) => {
    const pick = pickOne(roles, role, fallback)
    return {
      $if: pick,
      // The template language's $if takes then and else; this is not a Promise.
      // eslint-disable-next-line unicorn/no-thenable
      then: fillShape(parsed[key], { url: pick, role: pick.args[1] }),
      else: { $omit: true },
    }
  }
  const each = (
    from: unknown,
    shape: unknown,
    as: string,
    values: Record<string, unknown>
  ) => ({ $map: { from, as, template: fillShape(shape, values) } })
  const head = [
    ...('text' in parsed
      ? [fillShape(parsed.text, { prompt: REF('request.prompt') })]
      : []),
    ...('first' in parsed
      ? [frame('first', 'first-frame', 'first_frame')]
      : []),
    ...('last' in parsed ? [frame('last', 'last-frame', 'last_frame')] : []),
  ]
  const rest = [
    ...('all' in parsed
      ? [each(REF('media.images'), parsed.all, 'item', ITEM_VALUES)]
      : []),
    ...('reference' in parsed
      ? [
          parsed.reference === URL_SHAPE && !list
            ? pickAll(roles)
            : each(pickAll(roles), parsed.reference, 'imageUrl', {
                url: REF('imageUrl'),
                role: pickAll(roles).args[1],
              }),
        ]
      : []),
    ...('video' in parsed
      ? [each(REF('media.videos'), parsed.video, 'item', ITEM_VALUES)]
      : []),
    ...('audio' in parsed
      ? [each(REF('media.audios'), parsed.audio, 'item', ITEM_VALUES)]
      : []),
  ]
  if (list) {
    return { $call: 'concat', args: [...(head.length ? [head] : []), ...rest] }
  }
  if (head.length === 1 && !rest.length && !asList) return head[0]
  return OMIT_EMPTY(
    !head.length && rest.length === 1
      ? rest[0]
      : { $call: 'concat', args: [...(head.length ? [head] : []), ...rest] }
  )
}

/** The parts a template was compiled from, or null when it is not one of these structures. */
export function parseParts(node: unknown, roles: RoleMap): ShapeParts | null {
  const record = node as Json | null
  const inner =
    record?.$call === 'omitEmpty' ? (record.args as unknown[])?.[0] : node
  const parts: ShapeParts = {}
  const readItem = (item: unknown) => {
    const entry = item as Json
    if (entry?.$if) {
      const condition = entry.$if as Json
      const role = (condition.args as unknown[])?.[1]
      const frameOf: Record<string, 'first' | 'last'> = {
        [roles['first-frame'] || 'first_frame']: 'first',
        [roles['last-frame'] || 'last_frame']: 'last',
      }
      const key = frameOf[String(role)] ?? ''
      if (
        !key ||
        condition.$call !== 'mediaUrlByRole' ||
        !(entry.else as Json | undefined)?.$omit
      ) {
        throw new Error('not a shape')
      }
      parts[key] = shapeText(unfillShape(entry.then, { url: condition }))
      return
    }
    parts.text = shapeText(unfillShape(item, { prompt: REF('request.prompt') }))
  }
  const readArg = (arg: unknown) => {
    if (Array.isArray(arg)) {
      arg.forEach(readItem)
      return
    }
    const entry = arg as Json | null
    if (entry?.$if) {
      readItem(arg)
      return
    }
    if (entry?.$call === 'mediaUrlsByRole') {
      parts.reference = URL_SHAPE
      return
    }
    const map = entry?.$map as Json | undefined
    if (!map) throw new Error('not a shape')
    if (map.as === 'imageUrl') {
      parts.reference = shapeText(
        unfillShape(map.template, { url: REF('imageUrl') })
      )
      return
    }
    const from = (map.from as Json | null)?.$ref
    const listOf: Record<string, 'all' | 'video' | 'audio'> = {
      'media.images': 'all',
      'media.videos': 'video',
      'media.audios': 'audio',
    }
    const key = listOf[String(from)] ?? ''
    if (!key || map.as !== 'item') throw new Error('not a shape')
    parts[key] = shapeText(unfillShape(map.template, ITEM_VALUES))
  }
  try {
    const args =
      (inner as Json | null)?.$call === 'concat'
        ? ((inner as Json).args as unknown[])
        : [inner]
    args.forEach(readArg)
  } catch {
    return null
  }
  return Object.keys(parts).length ? parts : null
}

/** Canvas roles a list or shape picks images by, with the names a blank Channel starts with. */
export const CONTENT_ROLES: Record<string, string> = {
  'first-frame': 'first_frame',
  'last-frame': 'last_frame',
  'image-reference': 'reference_image',
  'connected-input': 'reference_image',
  'prompt-reference': 'reference_image',
  'video-reference': 'reference_video',
  'audio-reference': 'reference_audio',
}

/** `sends` says which items name their role; an image interface sends reference images without one. */
export function defaultListParts(
  roles: RoleMap,
  sends: { reference?: boolean; video?: boolean; audio?: boolean } = {
    video: true,
    audio: true,
  }
): Required<
  Pick<ShapeParts, 'text' | 'first' | 'last' | 'reference' | 'video' | 'audio'>
> {
  const part = (type: string, role: string | false | undefined) =>
    shapeText({ type, [type]: { url: '{{url}}' }, ...(role ? { role } : {}) })
  const reference = roles['image-reference'] || 'reference_image'
  return {
    text: shapeText({ type: 'text', text: '{{prompt}}' }),
    first: part('image_url', roles['first-frame'] || 'first_frame'),
    last: part('image_url', roles['last-frame'] || 'last_frame'),
    reference: part('image_url', sends.reference !== false && reference),
    video: part(
      'video_url',
      sends.video && (roles['video-reference'] || 'reference_video')
    ),
    audio: part(
      'audio_url',
      sends.audio && (roles['audio-reference'] || 'reference_audio')
    ),
  }
}

export const contentTemplate = (
  roles: RoleMap,
  sends?: { video?: boolean; audio?: boolean }
) => compileParts(defaultListParts(roles, sends), roles, true)

/** Placeholders each part may use; {{role}} is offered only where a Channel already writes it. */
const SHAPE_ALLOWED: Record<ShapePart, string[]> = {
  text: ['prompt'],
  first: ['url', 'role'],
  last: ['url', 'role'],
  reference: ['url', 'role'],
  all: ['url', 'role'],
  video: ['url', 'role', 'durationSeconds'],
  audio: ['url', 'role', 'durationSeconds'],
}
export const usableHolders = (key: ShapePart, text: string) =>
  SHAPE_ALLOWED[key].filter(
    (name) => name !== 'role' || String(text ?? '').includes('{{role}}')
  )

export interface ShapeIssue {
  key: string
  values?: Record<string, unknown>
}

/** What is wrong with one send content, or null when it is fine. */
export function shapeIssue(key: ShapePart, text: string): ShapeIssue | null {
  if (!String(text ?? '').trim()) return null
  let parsed: unknown
  try {
    parsed = readShape(text)
  } catch {
    return {
      key: 'Not valid JSON. Text needs double quotes, such as "first_frame"',
    }
  }
  const used: string[] = []
  let problem: ShapeIssue | null = null
  const walk = (node: unknown) => {
    if (typeof node === 'string') {
      if (!node.includes('{{')) return
      const name = /^\{\{(\w+)\}\}$/.exec(node)?.[1]
      if (!name) {
        problem = {
          key: '{{value}}: a placeholder must be a whole value',
          values: { value: node },
        }
      } else if (!SHAPE_ALLOWED[key].includes(name)) {
        problem = {
          key: '{{placeholder}} is not available here; use {{usable}}',
          values: {
            placeholder: `{{${name}}}`,
            usable: usableHolders(key, text)
              .map((one) => `{{${one}}}`)
              .join(', '),
          },
        }
      } else used.push(name)
    } else if (Array.isArray(node)) node.forEach(walk)
    else if (node && typeof node === 'object') {
      for (const [name, child] of Object.entries(node)) {
        if (name.startsWith('$')) {
          problem = {
            key: 'Send content has no $ syntax. When it cannot be written, set the send style to an expression',
          }
        }
        walk(child)
      }
    }
  }
  walk(parsed)
  if (problem) return problem
  if (key === 'text') {
    if (used.includes('prompt')) return null
    return {
      key: 'Include {{placeholder}}; it becomes the prompt when sent',
      values: { placeholder: '{{prompt}}' },
    }
  }
  if (used.includes('url')) return null
  return {
    key: 'Include {{placeholder}}; it becomes the material address when sent',
    values: { placeholder: '{{url}}' },
  }
}

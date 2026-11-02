import { describe, expect, it } from 'vitest'

import {
  blankChannelDraft,
  buildProfile,
  sampleRequest,
  type ChannelDraft,
  type RequestRow,
} from '../catalog-channel-draft'
import {
  composeSegments,
  editMaterials,
  exprSegments,
  materialIssues,
  materialsOf,
  measuredSupport,
} from '../catalog-channel-materials'
import { shapeIssue } from '../catalog-channel-shapes'

const row = (field: string, source: string): RequestRow => ({
  field,
  source,
  transform: '',
})

// hfsyapi.video sends every image in one list and names all three image roles "image".
function oneImageList(): ChannelDraft {
  const draft = blankChannelDraft('video.generate')
  draft.submit.path = '/v1/videos'
  draft.rows = [
    row('model', 'upstreamId'),
    row('prompt', 'prompt'),
    row('images', 'images'),
    row('videos', 'videos'),
    row('audios', 'audios'),
  ]
  draft.roleMap = {
    'first-frame': 'image',
    'last-frame': 'image',
    'image-reference': 'image',
    'connected-input': 'image',
    'prompt-reference': 'image',
    'video-reference': 'video',
    'audio-reference': 'audio',
  }
  return draft
}

const bodyOf = (
  draft: ChannelDraft,
  sample: Parameters<typeof sampleRequest>[2]
) =>
  sampleRequest(draft, buildProfile(draft, null, 'x'), sample, {
    prompt: 'p',
    upstreamId: 'm',
    option: () => '',
  })

describe('materials of a video form', () => {
  it('measures every material when one list takes every image', () => {
    expect(measuredSupport(oneImageList())).toEqual({
      first: true,
      last: true,
      reference: true,
      video: true,
      audio: true,
    })
  })

  it('names the frames apart when a frame gets its own field, and restores the names when it rejoins', () => {
    const start = oneImageList()
    const split = editMaterials(start, (x) => {
      const view = materialsOf(x, 'rows')
      view.setSlot('first', 'first_image')
      view.setSlot('last', 'last_image')
    })
    const frames = bodyOf(split, 'frames')
    expect(frames.failure).toBeUndefined()
    expect(frames.body.first_image).toContain('first-frame-1')
    expect(frames.body.last_image).toContain('last-frame-1')
    expect(
      JSON.stringify(bodyOf(split, 'reference').body.images)
    ).not.toContain('first-frame')
    const rejoined = editMaterials(split, (x) => {
      const view = materialsOf(x, 'rows')
      view.setSlot('first', 'images')
      view.setSlot('last', 'images')
    })
    expect(rejoined.rows).toEqual(start.rows)
    expect(rejoined.roleMap).toEqual(start.roleMap)
  })

  it('switches to one list and back without changing the rows', () => {
    const start = oneImageList()
    const list = editMaterials(start, (x) =>
      materialsOf(x, 'rows').setMediaStyle('list')
    )
    expect(materialsOf(list, 'rows').mediaStyle()).toBe('list')
    expect(bodyOf(list, 'first').body.content).toEqual([
      { type: 'text', text: 'p' },
      {
        type: 'image_url',
        image_url: {
          url: 'https://media.preview.example/inputs/first-frame-1.png',
        },
        role: 'first_frame',
      },
    ])
    const back = editMaterials(list, (x) =>
      materialsOf(x, 'rows').setMediaStyle('fields')
    )
    expect(back.rows).toEqual(start.rows)
  })

  it('splits a shared shape for one frame and rejoins it when the shapes are the same again', () => {
    const start = oneImageList()
    const shaped = editMaterials(start, (x) =>
      materialsOf(x, 'rows').setShape(
        'first',
        '{"url": {{url}}, "type": "first"}'
      )
    )
    expect(bodyOf(shaped, 'frames').body.images).toEqual([
      {
        url: 'https://media.preview.example/inputs/first-frame-1.png',
        type: 'first',
      },
      'https://media.preview.example/inputs/last-frame-1.png',
    ])
    const back = editMaterials(shaped, (x) =>
      materialsOf(x, 'rows').setShape('first', '{{url}}')
    )
    expect(back.rows).toEqual(start.rows)
    expect(back.roleMap).toEqual(start.roleMap)
  })

  it('removes a list part when its material is no longer received, and brings it back', () => {
    const list = editMaterials(oneImageList(), (x) =>
      materialsOf(x, 'rows').setMediaStyle('list')
    )
    const edited = editMaterials(list, (x) => {
      materialsOf(x, 'rows').setListPart(
        'video',
        '{"type": "video", "url": {{url}}}'
      )
    })
    const off = editMaterials(edited, (x) =>
      materialsOf(x, 'rows').setAccept('video', false)
    )
    expect(materialsOf(off, 'rows').contentRow()?.parts?.video).toBeUndefined()
    const on = editMaterials(off, (x) =>
      materialsOf(x, 'rows').setAccept('video', true)
    )
    expect(materialsOf(on, 'rows').contentRow()?.parts?.video).toBe(
      '{"type": "video", "url": {{url}}}'
    )
  })

  it('reports a prompt sent twice and a received material without a field', () => {
    const draft = oneImageList()
    draft.rows.push(row('text', 'prompt'))
    const keys = materialIssues(draft).map((issue) => issue.key)
    expect(keys).toContain(
      'The prompt is sent {{count}} times ({{fields}}); keep one'
    )
    const noVideo = editMaterials(oneImageList(), (x) => {
      x.rows = x.rows.filter((entry) => entry.source !== 'videos')
      x.materials.accepts = {
        first: true,
        last: true,
        reference: true,
        video: true,
        audio: true,
      }
    })
    expect(materialIssues(noVideo).map((issue) => issue.key)).toContain(
      'Receiving reference videos is on; fill in "Videos go in"'
    )
  })

  it('reports models whose modes need a material the interface does not take', () => {
    const draft = editMaterials(oneImageList(), (x) => {
      x.rows = x.rows.filter((entry) => entry.source !== 'audios')
    })
    const issues = materialIssues(draft, [
      { key: 'm1', limits: { supportsAudioReference: true } },
    ])
    expect(issues.find((issue) => issue.path === 'mediaModes')?.values).toEqual(
      { count: 1, models: 'm1' }
    )
  })
})

describe('materials of an image form', () => {
  it('sends reference images in a list without a role name', () => {
    const draft = blankChannelDraft('image.generate')
    draft.workflow = 'sync'
    draft.submit.path = '/v1/images'
    draft.rows = [
      row('model', 'upstreamId'),
      row('prompt', 'prompt'),
      row('image', 'images'),
    ]
    const list = editMaterials(draft, (x) =>
      materialsOf(x, 'rows').setMediaStyle('list')
    )
    expect(bodyOf(list, 'reference').body.content).toEqual([
      { type: 'text', text: 'p' },
      {
        type: 'image_url',
        image_url: {
          url: 'https://media.preview.example/inputs/image-reference-1.png',
        },
      },
    ])
    expect(measuredSupport(list)).toEqual({ reference: true })
  })
})

describe('expressions and send content', () => {
  it('splits an expression into its parts and composes the same template back', () => {
    const draft = editMaterials(oneImageList(), (x) =>
      materialsOf(x, 'rows').setMediaStyle('expr')
    )
    const expr = draft.rows.find((entry) => entry.source === 'expr')?.expr ?? ''
    const segs = exprSegments(expr, draft.roleMap)
    if (!segs) throw new Error('the expression is not split into parts')
    expect(segs.texts.length).toBeGreaterThan(1)
    expect(JSON.parse(composeSegments(segs))).toEqual(JSON.parse(expr))
  })

  it('asks for the address placeholder and refuses template syntax in send content', () => {
    expect(shapeIssue('first', '{"type": "first"}')?.values).toEqual({
      placeholder: '{{url}}',
    })
    expect(shapeIssue('first', '{"url": {"$ref": "item.url"}}')?.key).toBe(
      'Send content has no $ syntax. When it cannot be written, set the send style to an expression'
    )
  })
})

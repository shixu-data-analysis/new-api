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
import { catalogChannel, catalogDraft } from './catalog-fixtures'

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

  it('keeps a material turned off while its rows are set aside out of the request', () => {
    const toList = (draft: ChannelDraft) =>
      editMaterials(draft, (x) => materialsOf(x, 'rows').setMediaStyle('list'))
    const toFields = (draft: ChannelDraft) =>
      editMaterials(draft, (x) =>
        materialsOf(x, 'rows').setMediaStyle('fields')
      )
    const videoOff = (draft: ChannelDraft) =>
      editMaterials(draft, (x) =>
        materialsOf(x, 'rows').setAccept('video', false)
      )

    const fields = toFields(videoOff(toList(oneImageList())))
    expect(fields.rows.map((entry) => entry.source)).not.toContain('videos')
    expect(bodyOf(fields, 'reference').body.videos).toBeUndefined()
    expect(materialIssues(fields)).toEqual([])

    const list = toList(videoOff(toFields(toList(oneImageList()))))
    expect(materialsOf(list, 'rows').contentRow()?.parts?.video).toBeUndefined()
    expect(JSON.stringify(bodyOf(list, 'reference').body)).not.toContain(
      'video_url'
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

  it('counts the prompt in the request each mode builds, not the rows that mention it', () => {
    const withExpr = (template: unknown) =>
      editMaterials(oneImageList(), (x) => {
        x.rows = [
          row('model', 'upstreamId'),
          {
            field: 'content',
            source: 'expr',
            expr: JSON.stringify(template),
            transform: '',
          },
        ]
      })
    const prompt = { $ref: 'request.prompt' }
    const keys = (template: unknown) =>
      materialIssues(withExpr(template)).map((issue) => issue.key)
    expect(keys({ text: prompt, again: prompt })).toContain(
      'The prompt is sent {{count}} times ({{fields}}); keep one'
    )
    expect(
      keys({
        // $if takes a branch by whether its value exists; this one never does.
        text: {
          $if: { $ref: 'request.rawParams.never' },
          // The template language's $if takes then and else; this is not a Promise.
          // eslint-disable-next-line unicorn/no-thenable
          then: prompt,
          else: '',
        },
      })
    ).toContain(
      'The prompt is not sent in every mode ({{fields}}); check the conditions around it'
    )
    expect(keys({ text: prompt })).not.toContain(
      'The prompt is sent {{count}} times ({{fields}}); keep one'
    )
  })

  it('counts the prompt in every mix of references the reference mode takes', () => {
    const draft = blankChannelDraft('video.generate')
    draft.submit.path = '/v1/videos'
    const prompt = { $ref: 'request.prompt' }
    const picks = (list: string, role: string) => ({
      $call: 'mediaUrlByRole',
      args: [{ $ref: list }, role],
    })
    // Once with a reference image or nothing at all, twice with a video but no reference image.
    const template = {
      text: {
        $if: picks('media.images', 'image-reference'),
        // The template language's $if takes then and else; this is not a Promise.
        // eslint-disable-next-line unicorn/no-thenable
        then: prompt,
        else: {
          $if: picks('media.videos', 'video-reference'),
          // eslint-disable-next-line unicorn/no-thenable
          then: [prompt, prompt],
          else: prompt,
        },
      },
    }
    draft.rows = [
      row('model', 'upstreamId'),
      {
        field: 'content',
        source: 'expr',
        expr: JSON.stringify(template),
        transform: '',
      },
    ]
    expect(materialIssues(draft)).toContainEqual(
      expect.objectContaining({
        key: 'The prompt is sent {{count}} times ({{fields}}); keep one',
        values: expect.objectContaining({ count: 2 }),
      })
    )
  })

  it('reports a request the template fails on in any mix of references, not only all of them', () => {
    const draft = blankChannelDraft('video.generate')
    draft.submit.path = '/v1/videos'
    const picks = (list: string, role: string) => ({
      $call: 'mediaUrlByRole',
      args: [{ $ref: list }, role],
    })
    // Fails only with a reference image and a video but no audio: `number` refuses text that is no number.
    const template = {
      text: { $ref: 'request.prompt' },
      size: {
        $if: picks('media.images', 'image-reference'),
        // The template language's $if takes then and else; this is not a Promise.
        // eslint-disable-next-line unicorn/no-thenable
        then: {
          $if: picks('media.videos', 'video-reference'),
          // eslint-disable-next-line unicorn/no-thenable
          then: {
            $if: picks('media.audios', 'audio-reference'),
            // eslint-disable-next-line unicorn/no-thenable
            then: 1,
            else: { $call: 'number', args: ['not a number'] },
          },
          else: 1,
        },
        else: 1,
      },
    }
    draft.rows = [
      row('model', 'upstreamId'),
      {
        field: 'content',
        source: 'expr',
        expr: JSON.stringify(template),
        transform: '',
      },
    ]
    expect(materialIssues(draft)).toContainEqual(
      expect.objectContaining({
        path: 'materialsRender',
        key: 'With a reference image and video the request fails: {{reason}} at {{field}}',
        values: expect.objectContaining({ reason: 'NUMBER_CONVERSION_FAILED' }),
      })
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

  // dklimage.gpt-image: a text request, and a second request that carries the images.
  it('switches the send style of two request bodies apart, each back to its own rows', () => {
    const draft = blankChannelDraft('image.generate')
    draft.workflow = 'sync'
    draft.submit.path = '/v1/images/generations'
    draft.images = { method: 'POST', path: '/v1/images/edits' }
    draft.rows = [row('model', 'upstreamId'), row('prompt', 'prompt')]
    draft.imageRows = [
      row('model', 'upstreamId'),
      row('prompt', 'prompt'),
      row('image[]', 'imagesAlways'),
    ]
    const switchTo =
      (body: 'rows' | 'imageRows', style: 'fields' | 'list') =>
      (x: ChannelDraft) =>
        materialsOf(x, body).setMediaStyle(style)
    const back = [
      switchTo('rows', 'list'),
      switchTo('imageRows', 'list'),
      switchTo('rows', 'fields'),
      switchTo('imageRows', 'fields'),
    ].reduce((current, change) => editMaterials(current, change), draft)
    expect(back.rows).toEqual(draft.rows)
    expect(back.imageRows).toEqual(draft.imageRows)
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

const switchStyle = (
  draft: ChannelDraft,
  body: 'rows' | 'imageRows',
  styles: Array<'fields' | 'list' | 'expr'>
) =>
  styles.reduce(
    (current, style) =>
      editMaterials(current, (x) => materialsOf(x, body).setMediaStyle(style)),
    draft
  )

describe('send styles of Catalog Channels', () => {
  it('keeps the frames that share the image field when references are turned off in a list', () => {
    const start = catalogDraft('hfsyapi-video')
    const off = editMaterials(switchStyle(start, 'rows', ['list']), (x) =>
      materialsOf(x, 'rows').setAccept('reference', false)
    )
    const back = switchStyle(off, 'rows', ['fields'])
    expect(materialsOf(back, 'rows').accepts()).toMatchObject({
      first: true,
      last: true,
      reference: false,
    })
    expect(JSON.stringify(bodyOf(back, 'frames').body)).toContain(
      'last-frame-1'
    )
    expect(JSON.stringify(bodyOf(back, 'reference').body)).not.toContain(
      'image-reference-1'
    )
    expect(materialIssues(back)).toEqual([])
  })

  it('brings back the image request of dklimage.gpt-image after an expression it never changed', () => {
    const start = catalogDraft('dklimage-gpt-image')
    const back = switchStyle(start, 'imageRows', ['expr', 'fields'])
    expect(back.imageRows).toEqual(start.imageRows)
    expect(materialsOf(back, 'imageRows').accepts()).toEqual(
      materialsOf(start, 'imageRows').accepts()
    )
    expect(materialIssues(back)).toEqual([])
  })

  it('tells an expression sending only the prompt from fields, and switches back from it', () => {
    const start = catalogDraft('whatstoken-gpt-image')
    const expr = switchStyle(start, 'rows', ['expr'])
    expect(materialsOf(expr, 'rows').mediaStyle()).toBe('expr')
    const back = switchStyle(expr, 'rows', ['fields'])
    expect(back.rows).toEqual(start.rows)
  })

  it('keeps a material turned off in fields out of the list, even after an expression in between', () => {
    const fields = switchStyle(catalogDraft('hfsyapi-video'), 'rows', [
      'list',
      'fields',
    ])
    const off = editMaterials(fields, (x) =>
      materialsOf(x, 'rows').setAccept('video', false)
    )
    const list = switchStyle(off, 'rows', ['expr', 'list'])
    expect(materialsOf(list, 'rows').contentRow()?.parts?.video).toBeUndefined()
    expect(JSON.stringify(bodyOf(list, 'reference').body)).not.toContain(
      'video-reference-1'
    )
    expect(materialIssues(list)).toEqual([])
  })

  // dklimage.gpt-image has a text request and an image request; role names belong to the whole draft.
  it('brings the role names back once both request bodies are back, in either order', () => {
    const { profile } = catalogChannel('dklimage-gpt-image')
    const start = catalogDraft('dklimage-gpt-image')
    const built = (draft: ChannelDraft) =>
      JSON.stringify(buildProfile(draft, profile, 'x'))
    const away = switchStyle(
      switchStyle(start, 'rows', ['list']),
      'imageRows',
      ['list']
    )
    const rowsFirst = switchStyle(
      switchStyle(away, 'rows', ['fields']),
      'imageRows',
      ['fields']
    )
    const imagesFirst = switchStyle(
      switchStyle(away, 'imageRows', ['fields']),
      'rows',
      ['fields']
    )
    expect(built(rowsFirst)).toBe(built(start))
    expect(built(imagesFirst)).toBe(built(start))
  })

  it('brings the role names back past an edit of another field, but not past an edit of a material', () => {
    const start = catalogDraft('dklimage-gpt-image')
    const away = switchStyle(start, 'rows', ['list'])
    expect(away.roleMap).not.toEqual(start.roleMap)
    // Edited in place, as a field name is, past every setter of the materials.
    const editRow = (source: string, field: string) =>
      editMaterials(away, (x) => {
        const row = x.imageRows.find((entry) => entry.source === source)
        if (row) row.field = field
      })
    const otherField = switchStyle(
      editRow('upstreamId', 'model_name'),
      'rows',
      ['fields']
    )
    expect(otherField.roleMap).toEqual(start.roleMap)
    expect(otherField.materials.roleSnapshot).toBeNull()
    const material = switchStyle(editRow('imageFiles', 'images[]'), 'rows', [
      'fields',
    ])
    expect(material.materials.roleSnapshot).not.toBeNull()
  })

  // manchuangai.video picks frames by role with names it leaves empty; a round trip must not name them.
  it('switches to a list or an expression and back without changing the Profile', () => {
    const { profile } = catalogChannel('manchuangai-video')
    const start = catalogDraft('manchuangai-video')
    const built = (draft: ChannelDraft) =>
      JSON.stringify(buildProfile(draft, profile, 'x'))
    for (const style of ['list', 'expr'] as const) {
      expect(built(switchStyle(start, 'rows', [style, 'fields']))).toBe(
        built(start)
      )
    }
  })
})

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  parseRows,
  buildContract,
  buildProfile,
  channelDraftFrom,
  channelIssues,
  unsupportedProfileFields,
  blankChannelDraft,
  pathToPointer,
  pointerToPath,
} from '../catalog-channel-draft'
import { materialIssues } from '../catalog-channel-materials'

const catalogRoot = path.resolve(process.cwd(), '../../pixmiao-catalog')

describe('Channel form', () => {
  it('converts dotted paths to pointers and back', () => {
    expect(pathToPointer('data.id')).toBe('/data/id')
    expect(pathToPointer('/data/id')).toBe('/data/id')
    expect(pathToPointer('data[].url')).toBe('/data/0/url')
    expect(pointerToPath('/data/0/url')).toBe('data[0].url')
  })

  it('reports a state value with a space or in two groups, as Cloud does', () => {
    const draft = blankChannelDraft('video.generate')
    draft.submit.path = '/v1/videos'
    draft.poll.path = '/v1/videos/{id}'
    draft.taskIdPath = 'id'
    draft.statusPath = 'status'
    draft.states = {
      pending: 'queued pending',
      running: 'run',
      succeeded: 'done',
      failed: 'done',
    }
    const keys = channelIssues(draft).map((issue) => issue.key)
    expect(keys).toContain('A state value cannot contain a space: {{value}}')
    expect(keys).toContain('A state value cannot be in two groups: {{value}}')
  })

  it('refuses a field that reads an address when images are not delivered as addresses', () => {
    const draft = blankChannelDraft('image.generate')
    draft.workflow = 'sync'
    draft.submit.path = '/v1/images'
    draft.media.image = 'base64'
    draft.rows.push({ field: 'image', source: 'images', transform: '' })
    expect(channelIssues(draft).map((issue) => issue.key)).toContain(
      'Field {{field}} reads an address, but images are not delivered as addresses'
    )
  })

  it('changes only the operation the form changed, and keeps what the form cannot show', () => {
    const contract = {
      openapi: '3.1.0',
      info: { title: 'x', version: '1.0.0' },
      paths: {
        '/submit': {
          post: {
            operationId: 'submit',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Body' },
                },
              },
            },
            responses: { 200: { description: 'OK' } },
          },
        },
        '/tasks/{id}': {
          get: {
            operationId: 'poll',
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string', maxLength: 64 },
              },
            ],
            responses: { 200: { description: 'OK' } },
          },
        },
      },
      components: {
        schemas: {
          Body: {
            type: 'object',
            properties: {
              model: { type: 'string' },
              prompt: { type: 'string' },
            },
            required: ['model'],
          },
        },
      },
    }
    const profile = {
      id: 'x.y',
      kind: 'image.generate',
      workflow: 'async',
      operations: { submit: 'submit', poll: 'poll' },
      advanced: {
        request: {
          body: {
            model: { $ref: 'model.upstreamId' },
            prompt: { $ref: 'request.prompt' },
          },
        },
      },
    }
    const draft = channelDraftFrom(profile, contract)
    draft.poll.path = '/v2/tasks/{id}'
    const built = buildContract(
      draft,
      contract,
      profile,
      'x',
      'x'
    ) as unknown as {
      paths: Record<
        string,
        { get: { parameters: Array<{ schema: { maxLength: number } }> } }
      >
    }
    expect(built.paths['/submit']).toEqual(contract.paths['/submit'])
    expect(built.paths['/tasks/{id}']).toBeUndefined()
    expect(
      built.paths['/v2/tasks/{id}'].get.parameters[0].schema.maxLength
    ).toBe(64)
  })

  it('recognises a template whatever order its keys are stored in', () => {
    const stored = {
      $call: undefined,
      args: [
        {
          $map: {
            as: 'item',
            from: { $ref: 'media.audios' },
            template: { $ref: 'item.url' },
          },
        },
      ],
    } as Record<string, unknown>
    delete stored.$call
    stored.$call = 'omitEmpty'
    expect(parseRows({ audios: stored }, null, {}).rows[0]).toMatchObject({
      field: 'audios',
      source: 'audios',
    })
  })

  it('keeps one set of operation IDs when a Channel is copied', () => {
    const contract = {
      openapi: '3.1.0',
      info: { title: 'x', version: '1.0.0' },
      paths: {
        '/submit': {
          post: {
            operationId: 'sourceSubmit',
            responses: { 200: { description: 'OK' } },
          },
        },
      },
    }
    const profile = {
      id: 'x.y',
      kind: 'chat.generate',
      workflow: 'sync',
      operations: { submit: 'sourceSubmit' },
      advanced: { request: { body: { model: { $ref: 'model.upstreamId' } } } },
    }
    const draft = channelDraftFrom(profile, contract)
    const built = buildContract(draft, contract, profile, 'copy', 'copy')
    expect(
      buildProfile(draft, { ...profile, id: undefined }, 'copy').operations
    ).toEqual(profile.operations)
    expect(built).toEqual(contract)
  })

  it('points a file upload without a file form at each material that uses it', () => {
    const draft = blankChannelDraft('video.generate')
    draft.submit.path = '/v1/videos'
    draft.media.image = 'multipart-file'
    draft.media.audio = 'multipart-file'
    const paths = channelIssues(draft)
      .filter((issue) => issue.key.startsWith('With "File upload"'))
      .map((issue) => issue.path)
    expect(paths).toEqual(['media.image', 'media.audio'])
  })

  it('does not take the {model} placeholder for the task ID, and keeps a query name in use', () => {
    const draft = blankChannelDraft('video.generate')
    draft.poll.path = '/v1/{model}/tasks'
    expect(channelIssues(draft).map((issue) => issue.path)).toContain(
      'poll.path'
    )
    draft.poll = {
      ...draft.poll,
      path: '/v1/tasks',
      taskIdIn: 'query',
      queryName: 'mode',
    }
    const base = { advanced: { request: { pollQuery: { mode: 'fast' } } } }
    expect(channelIssues(draft, base).map((issue) => issue.key)).toContain(
      'Query parameter {{name}} is used for something else; choose another name'
    )
  })

  it('flags profile fields the form has no control for', () => {
    expect(
      unsupportedProfileFields({
        id: 'x',
        advanced: {
          request: { body: {}, collapsePromptWhitespace: true },
          media: { image: { delivery: 'url', maxFileSizeBytes: 1 } },
        },
      })
    ).toEqual([
      'advanced.request.collapsePromptWhitespace',
      'advanced.media.image.maxFileSizeBytes',
    ])
    expect(unsupportedProfileFields(null)).toEqual([])
  })

  it('sends the count in a lower field, as the official group image request does', () => {
    const draft = blankChannelDraft('image.generate')
    draft.workflow = 'sync'
    draft.submit.path = '/v1/images'
    draft.rows = [
      { field: 'model', source: 'upstreamId', transform: '' },
      {
        field: 'sequential_image_generation',
        source: 'fixed',
        transform: '',
        fixed: 'auto',
        fixedType: 'string',
      },
      {
        field: 'sequential_image_generation_options.max_images',
        source: 'batchSize',
        transform: '',
      },
    ]
    const body = JSON.stringify(
      (
        buildProfile(draft, null, 'x').advanced as {
          request: { body: unknown }
        }
      ).request.body
    )
    expect(body).toContain('"sequential_image_generation":"auto"')
    expect(body).toContain(
      '"sequential_image_generation_options":{"max_images":{"$ref":"request.batchSize"}}'
    )
  })

  // Design 7.5.9: every Channel opens without being reported as changed.
  it.skipIf(!existsSync(catalogRoot))(
    'opens every Catalog Channel without changing it',
    () => {
      const read = (file: string) =>
        JSON.parse(readFileSync(path.join(catalogRoot, file), 'utf8'))
      const manifest = read('manifest.json')
      const profiles = (manifest.adapterProfiles as string[]).map(read)
      const contracts = new Map(
        (manifest.openapiContracts as string[]).map((file) => {
          const document = read(file)
          return [
            `${path.basename(file, '.openapi.json')}@${document.info.version}`,
            document,
          ]
        })
      )
      const differences: string[] = []
      for (const profile of profiles) {
        const contract = contracts.get(profile.api) as Record<string, unknown>
        const draft = channelDraftFrom(profile, contract)
        const rebuilt = buildProfile(draft, profile, 'x')
        if (
          JSON.stringify(sorted(rebuilt)) !== JSON.stringify(sorted(profile))
        ) {
          differences.push(`${profile.id} profile`)
        }
        const contractRebuilt = buildContract(
          draft,
          contract,
          profile,
          'x',
          'x'
        )
        if (
          JSON.stringify(sorted(contractRebuilt)) !==
          JSON.stringify(sorted(contract))
        ) {
          differences.push(`${profile.id} contract`)
        }
        for (const issue of [
          ...channelIssues(draft, profile),
          ...materialIssues(draft),
        ]) {
          differences.push(`${profile.id} ${issue.path}: ${issue.key}`)
        }
      }
      expect(differences).toEqual([])
    }
  )
})

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sorted(entry)])
    )
  }
  return value
}

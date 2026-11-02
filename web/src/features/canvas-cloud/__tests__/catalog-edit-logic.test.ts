import { describe, expect, it } from 'vitest'

import {
  changedPaths,
  displayPath,
  generatedProductKey,
  isValidAspectRatio,
  isValidQuality,
  normalizedQuality,
  followSelections,
  prefillSizeMap,
  replayChanges,
  replayConflicts,
  sentFieldsOf,
  unsupportedFieldsOfPlan,
  unsupportedModelFields,
} from '../catalog-edit-logic'
import type { CatalogModelDefinition } from '../catalog-edit-types'

describe('product key', () => {
  it('follows the provider, type and upstream model ID', () => {
    expect(generatedProductKey('hfsyapi', 'image.generate', 'mj_imagine')).toBe(
      'hfsyapi.image.mj-imagine'
    )
    expect(generatedProductKey('a', 'video.generate', '-X.1-')).toBe(
      'a.video.x.1'
    )
  })
})

describe('aspect ratio and resolution', () => {
  it('accepts positive numbers only', () => {
    for (const ratio of ['16:9', '2.39:1']) {
      expect(isValidAspectRatio(ratio)).toBe(true)
    }
    for (const ratio of ['16x9', '0:1', '1:0', 'a:b', '16:9 ']) {
      expect(isValidAspectRatio(ratio)).toBe(false)
    }
  })

  it('writes resolutions in capitals and allows dots', () => {
    expect(normalizedQuality(' 1.5k ')).toBe('1.5K')
    expect(isValidQuality('1.5K')).toBe(true)
    expect(isValidQuality('高清')).toBe(false)
  })
})

describe('size table prefill', () => {
  it('fills a new cell once, so a cleared cell stays cleared', () => {
    const first = prefillSizeMap({}, ['1:1', '2:1'], ['1K', '4K'], new Set())
    expect(first.sizeMap['1:1']).toEqual({
      '1K': '1024x1024',
      '4K': '2880x2880',
    })
    expect(first.sizeMap['2:1']).toEqual({ '1K': '1440x720' })
    expect(first.filled).toBe(3)
    const cleared = { ...first.sizeMap, '1:1': { '4K': '2880x2880' } }
    const second = prefillSizeMap(
      cleared,
      ['1:1', '2:1'],
      ['1K', '4K'],
      first.offered
    )
    expect(second.sizeMap['1:1']?.['1K']).toBeUndefined()
    expect(second.filled).toBe(0)
  })

  it('never replaces an existing size or fills an unknown cell', () => {
    const result = prefillSizeMap(
      { '1:1': { '1K': '999x999' } },
      ['1:1', '7:5'],
      ['1K', '1440P'],
      new Set()
    )
    expect(result.sizeMap['1:1']?.['1K']).toBe('999x999')
    expect(result.sizeMap['7:5']).toBeUndefined()
  })
})

describe('replay after a concurrent version', () => {
  const base = { a: 1, b: 1, c: { d: 1 } }

  it('lists only fields both sides changed to different values', () => {
    const conflicts = replayConflicts(
      base,
      { a: 2, b: 1, c: { d: 2 } },
      { a: 3, b: 5, c: { d: 2 } }
    )
    expect(conflicts.map((entry) => displayPath(entry.path))).toEqual(['a'])
  })

  it('keeps my change unless I chose the new version', () => {
    const latest = { a: 3, b: 5, c: { d: 1 } }
    const mine = { a: 2, b: 1, c: { d: 2 } }
    expect(replayChanges(base, mine, latest, new Set())).toEqual({
      a: 2,
      b: 5,
      c: { d: 2 },
    })
    const [conflict] = replayConflicts(base, mine, latest)
    expect(
      replayChanges(base, mine, latest, new Set([String(conflict?.path)]))
    ).toEqual({ a: 3, b: 5, c: { d: 2 } })
  })

  it('finds nothing to change in an unchanged draft', () => {
    expect(changedPaths(base, structuredClone(base))).toEqual([])
  })
})

describe('fields the Channel sends', () => {
  const profile = {
    operations: { submit: 'go' },
    advanced: {
      request: {
        body: {
          model: { $ref: 'model.upstreamId' },
          prompt: { $ref: 'request.prompt' },
          ratio: { $ref: 'request.aspectRatio' },
          images: {
            $call: 'omitEmpty',
            args: [{ $map: { from: { $ref: 'media.images' } } }],
          },
          style: { $ref: 'request.rawParams.style' },
        },
        parameterPolicy: { sizeParam: 'size', countParam: 'n' },
      },
    },
  }

  it('reads templates and the parameter policy', () => {
    const sent = sentFieldsOf(profile)
    expect(sent.aspectRatio).toEqual(['ratio', 'size'])
    expect(sent.quality).toEqual(['size'])
    expect(sent.batchSize).toEqual(['n'])
    expect(sent.modelFields.map((field) => field.key)).toEqual(['style'])
  })
})

describe('fields without a form control', () => {
  const model = (
    paramSchema: Record<string, unknown>,
    defaultParams: Record<string, unknown>
  ): CatalogModelDefinition => ({
    productKey: 'k',
    displayName: 'k',
    capability: 'image.generate',
    sourceKind: 'relay',
    release: {
      channelId: 'c',
      execution: { providerModel: { modelId: 'm' } },
      publicInteraction: { paramSchema, defaultParams, referenceLimits: {} },
    },
  })
  const supported = {
    paramSchema: ['aspectRatios', 'options'],
    defaultParams: ['aspectRatio'],
    referenceLimits: [],
    mediaConstraints: [],
    profile: [],
  }

  it('marks unknown fields, not declared options or values the Channel reads', () => {
    const profile = {
      operations: { submit: 'x' },
      advanced: {
        request: { body: { style: { $ref: 'request.rawParams.style' } } },
      },
    }
    const paths = unsupportedModelFields(
      model(
        {
          aspectRatios: ['1:1'],
          future: 1,
          options: [{ key: 'mood', label: 'm', type: 'boolean' }],
        },
        { aspectRatio: '1:1', mood: true, style: 'a', other: 1 }
      ),
      supported,
      profile
    )
    expect(paths).toEqual(['paramSchema.future', 'defaultParams.other'])
  })
})

describe('fields without a form control, across a plan', () => {
  const supported = {
    paramSchema: ['aspectRatios'],
    defaultParams: ['aspectRatio'],
    referenceLimits: [],
    mediaConstraints: [],
    profile: [],
  }
  const definition = (
    paramSchema: Record<string, unknown>,
    defaultParams: Record<string, unknown>
  ) => ({
    release: {
      publicInteraction: { paramSchema, defaultParams, referenceLimits: {} },
      execution: { providerModel: { modelId: 'u' } },
    },
  })
  const channel = {
    resourceType: 'PROVIDER_CHANNEL',
    key: 'c.image',
    detail: { adapterProfile: 'c@1' },
  }
  const artifact = (key: string, proposed: Record<string, unknown>) => ({
    resourceType: 'MODEL_DEFINITION_ARTIFACT',
    key,
    detail: {},
    definition: { proposed },
  })
  const profile = artifact('c@1', {
    api: 'c-api@1',
    operations: { submit: 'x' },
    advanced: {
      request: { body: { style: { $ref: 'request.rawParams.style' } } },
    },
  })

  it('reads each model through the Profile of its Channel, and lists only models with such fields', () => {
    const models = [
      {
        productKey: 'plain',
        channelId: 'c.image',
        definition: {
          proposed: definition(
            { aspectRatios: ['1:1'] },
            { aspectRatio: '1:1' }
          ),
        },
      },
      {
        productKey: 'marked',
        channelId: 'c.image',
        definition: {
          proposed: definition(
            { aspectRatios: ['1:1'], future: 1 },
            { aspectRatio: '1:1', style: 'a' }
          ),
        },
      },
    ]
    const marked = unsupportedFieldsOfPlan(
      models as never,
      [channel, profile, artifact('c-api@1', {})] as never,
      supported
    )
    expect([...marked]).toEqual([['marked', ['paramSchema.future']]])
  })

  it('marks a value only the Profile could read when the plan does not carry the Profile', () => {
    const models = [
      {
        productKey: 'm',
        channelId: 'gone',
        definition: { proposed: definition({}, { style: 'a' }) },
      },
    ]
    expect([
      ...unsupportedFieldsOfPlan(models as never, [] as never, supported),
    ]).toEqual([['m', ['defaultParams.style']]])
  })
})

describe('followSelections', () => {
  const model = (
    interaction: {
      qualities: string[]
      ratios: string[]
      quality?: string
      sizes?: Record<string, Record<string, string>>
    },
    providerModel: object = { modelId: 'm' }
  ) =>
    ({
      productKey: 'p.image.m',
      displayName: 'm',
      capability: 'image.generate',
      sourceKind: 'relay',
      release: {
        channelId: 'c',
        execution: { providerModel },
        publicInteraction: {
          paramSchema: {
            qualities: interaction.qualities,
            aspectRatios: interaction.ratios,
          },
          defaultParams: {
            ...(interaction.quality ? { quality: interaction.quality } : {}),
            ...(interaction.sizes ? { sizeMap: interaction.sizes } : {}),
          },
          referenceLimits: {},
        },
      },
    }) as unknown as CatalogModelDefinition
  const run = (
    previous: CatalogModelDefinition,
    edited: CatalogModelDefinition,
    base: CatalogModelDefinition | null,
    autoDefaultQuality = false
  ) =>
    followSelections(previous, edited, {
      base,
      autoDefaultQuality,
      lastModelId: 'fixed-id',
    })

  it('removes the sizes of a removed choice and restores them when it is selected again', () => {
    const base = model({
      qualities: ['1K', '2K'],
      ratios: ['1:1', '2:1'],
      quality: '1K',
      sizes: {
        '1:1': { '1K': 'a', '2K': 'b' },
        '2:1': { '1K': 'c', '2K': 'd' },
      },
    })
    const removed = run(
      base,
      model({
        qualities: ['1K'],
        ratios: ['1:1'],
        quality: '1K',
        sizes: {
          '1:1': { '1K': 'a', '2K': 'b' },
          '2:1': { '1K': 'c', '2K': 'd' },
        },
      }),
      base
    ).model
    expect(removed.release.publicInteraction.defaultParams.sizeMap).toEqual({
      '1:1': { '1K': 'a' },
    })
    const back = run(
      removed,
      model({
        qualities: ['1K', '2K'],
        ratios: ['2:1', '1:1'],
        quality: '1K',
        sizes: { '1:1': { '1K': 'a' } },
      }),
      base
    ).model
    expect(back).toEqual(base)
  })

  it('moves the default off a removed resolution and back when it returns', () => {
    const base = model({ qualities: ['1K', '2K'], ratios: [], quality: '2K' })
    const removed = run(
      base,
      model({ qualities: ['1K'], ratios: [], quality: '2K' }),
      base
    )
    expect(removed.model.release.publicInteraction.defaultParams.quality).toBe(
      '1K'
    )
    expect(removed.autoDefaultQuality).toBe(true)
    const back = run(
      removed.model,
      model({ qualities: ['1K', '2K'], ratios: [], quality: '1K' }),
      base,
      true
    )
    expect(back.model.release.publicInteraction.defaultParams.quality).toBe(
      '2K'
    )
  })

  it('keeps per-resolution upstream IDs in step; only the first row reuses the fixed ID', () => {
    const first = run(
      model(
        { qualities: [], ratios: [] },
        { defaultQuality: '', modelIdByQuality: {} }
      ),
      model(
        { qualities: ['1K'], ratios: [] },
        { defaultQuality: '', modelIdByQuality: {} }
      ),
      null
    ).model
    expect(first.release.execution.providerModel).toEqual({
      defaultQuality: '1K',
      modelIdByQuality: { '1K': 'fixed-id' },
    })
    const second = run(
      first,
      model(
        { qualities: ['1K', '2K'], ratios: [], quality: '1K' },
        first.release.execution.providerModel
      ),
      null
    ).model
    expect(second.release.execution.providerModel).toEqual({
      defaultQuality: '1K',
      modelIdByQuality: { '1K': 'fixed-id', '2K': '' },
    })
  })

  it('returns the same draft when nothing it follows changed', () => {
    const current = model({ qualities: ['1K'], ratios: ['1:1'], quality: '1K' })
    const edited = { ...current, displayName: 'other' }
    expect(run(current, edited, null).model).toBe(edited)
  })
})

describe('sentFieldsOf field types', () => {
  it('reads a nested field through references, on either submit operation', () => {
    const profile = {
      operations: { submit: 'submit', submitWithImages: 'edit' },
      advanced: {
        request: {
          body: {
            config: {
              strength: { $ref: 'request.rawParams.strength' },
              on: { $ref: 'request.rawParams.on' },
            },
          },
          bodyWithImages: {
            only: { size: { $ref: 'request.rawParams.width' } },
          },
        },
      },
    }
    const contract = {
      paths: {
        '/a': {
          post: {
            operationId: 'submit',
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Body' },
                },
              },
            },
          },
        },
        '/b': {
          post: {
            operationId: 'edit',
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    properties: {
                      only: {
                        properties: { size: { type: ['integer', 'null'] } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          Body: {
            properties: { config: { $ref: '#/components/schemas/Config' } },
          },
          Config: {
            properties: {
              strength: { type: 'number' },
              on: { type: 'boolean' },
            },
          },
        },
      },
    }
    expect(
      sentFieldsOf(profile, contract).modelFields.map((field) => [
        field.key,
        field.type,
      ])
    ).toEqual([
      ['strength', 'number'],
      ['on', 'boolean'],
      ['width', 'number'],
    ])
  })
})

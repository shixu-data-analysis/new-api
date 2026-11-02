import { describe, expect, it } from 'vitest'

import type { CurrentCatalogView } from '../catalog-edit-types'
import {
  channelJsonExample,
  channelJsonIssue,
  jsonSyntaxIssue,
  modelJsonIssue,
  pastedNotes,
  type ChannelJson,
} from '../catalog-json-fill'

const profile = {
  id: 'acme.image',
  version: '1.0.0',
  kind: 'image.generate',
  workflow: 'sync',
  api: 'acme-image@1.0.0',
  operations: { submit: 'submit' },
  advanced: { request: { body: { model: { $ref: 'model.upstreamId' } } } },
}
const contract = {
  openapi: '3.1.0',
  info: { title: 'x', version: '1.0.0' },
  paths: { '/images': { post: { operationId: 'submit' } } },
}
const model = {
  productKey: 'acme.image.one',
  displayName: 'One',
  capability: 'image.generate',
  release: {
    channelId: 'acme.image',
    execution: { providerModel: { modelId: 'one' } },
    publicInteraction: {
      paramSchema: {},
      defaultParams: {},
      referenceLimits: {},
    },
  },
}

function catalog(): CurrentCatalogView {
  return {
    bundle: {
      providers: [
        {
          id: 'acme',
          internalName: 'Acme',
          sourceKind: 'relay',
          baseUrl: 'https://acme.example.com',
          internalOnly: true,
          trustPolicy: 'public-only',
          credentialSchemes: ['bearerAuth'],
        },
      ],
      channels: [
        {
          id: 'acme.image',
          providerId: 'acme',
          adapterProfile: { id: 'acme.image', version: '1.0.0' },
          internalOnly: true,
        },
      ],
      models: [model],
      openapiContracts: [
        { path: 'openapi/acme-image.openapi.json', document: contract },
      ],
      adapterProfiles: [{ path: 'profiles/acme-image.profile.json', profile }],
    },
  } as unknown as CurrentCatalogView
}

const pasted = (patch: Record<string, unknown> = {}) => ({
  channel: {
    id: 'beta.image',
    providerId: 'beta',
    adapterProfile: { id: 'beta.image', version: '1.0.0' },
  },
  profile: { ...profile, id: 'beta.image' },
  openapi: contract,
  provider: {
    id: 'beta',
    internalName: 'Beta',
    baseUrl: 'https://beta.example.com',
    sourceKind: 'relay',
  },
  ...patch,
})
const keyOf = (json: unknown) =>
  channelJsonIssue(json, catalog(), ['image.generate', 'video.generate'])?.key

describe('a pasted Channel configuration', () => {
  it('fills in with a new API provider and its models', () => {
    expect(
      keyOf(
        pasted({
          models: [
            {
              ...model,
              release: { ...model.release, channelId: 'beta.image' },
            },
          ],
        })
      )
    ).toBeUndefined()
  })

  it('needs its API provider first, and the provider it belongs to', () => {
    expect(keyOf(pasted({ provider: undefined }))).toBe(
      'API provider {{id}} does not exist. A Channel configuration needs its API provider first: use an existing one, or paste provider with it to create it'
    )
    expect(keyOf(pasted({ provider: { id: 'acme' } }))).toBe(
      'provider.id must equal channel.providerId ({{id}}): paste the API provider the Channel configuration belongs to'
    )
  })

  it('names a missing operation and the model that does not fit', () => {
    expect(keyOf(pasted({ openapi: { paths: {} } }))).toBe(
      'openapi has no operationId {{ids}}'
    )
    const issue = channelJsonIssue(pasted({ models: [model] }), catalog(), [
      'image.generate',
    ])
    expect(issue).toMatchObject({
      key: 'Model {{n}} of models: {{issue}}',
      values: { n: 1 },
      inner: { key: 'release.channelId must be {{id}}' },
    })
  })

  it('lists what the page sets by its own rules', () => {
    const json = pasted({
      channel: { ...pasted().channel, internalOnly: false },
      provider: { ...pasted().provider, trustPolicy: 'any' },
    }) as unknown as ChannelJson
    expect(pastedNotes(json, catalog())[0].values).toEqual({
      fields: 'provider.trustPolicy, channel.internalOnly',
    })
  })

  it('makes an example under a new code that fills in without a clash', () => {
    const example = JSON.parse(channelJsonExample(catalog(), 'acme.image'))
    expect(example.channel.id).toBe('acme.image-copy')
    expect(example.models[0].productKey).toBeUndefined()
    expect(keyOf(example)).toBeUndefined()
  })
})

describe('a pasted model', () => {
  it('needs its Channel configuration, the right type and, when edited, its own key', () => {
    const other = {
      ...model,
      release: { ...model.release, channelId: 'gamma.image' },
    }
    expect(modelJsonIssue(other, catalog(), {})?.values).toEqual({
      id: 'gamma.image',
    })
    expect(
      modelJsonIssue({ ...model, capability: 'video.generate' }, catalog(), {})
        ?.key
    ).toBe(
      'capability is {{capability}}, but Channel configuration {{id}} is a {{kind}} interface'
    )
    expect(
      modelJsonIssue({ ...model, productKey: 'x' }, catalog(), {
        productKey: model.productKey,
      })?.key
    ).toBe('The product key cannot change when editing; it must be {{key}}')
    expect(
      modelJsonIssue(model, catalog(), { channelId: 'acme.image' })
    ).toBeNull()
  })

  it('is refused when a field holds the wrong kind of value, before the form reads it', () => {
    const broken = {
      ...model,
      release: { ...model.release, publicInteraction: {} },
    }
    expect(modelJsonIssue(broken, catalog(), {})).toMatchObject({
      key: 'Not a model of models.json: {{issue}}',
      values: {
        issue: expect.stringContaining(
          'publicInteraction.defaultParams must be an object'
        ),
      },
    })
  })
})

describe('JSON that does not parse', () => {
  it('names the line and character', () => {
    const text = '{\n  "a": 1,\n  "b" 2\n}'
    let error: SyntaxError | undefined
    try {
      JSON.parse(text)
    } catch (caught) {
      error = caught as SyntaxError
    }
    expect(jsonSyntaxIssue(text, error as SyntaxError).values).toMatchObject({
      line: expect.anything(),
    })
  })
})

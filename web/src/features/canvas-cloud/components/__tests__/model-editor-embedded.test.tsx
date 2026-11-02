import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { CurrentCatalogView } from '../../catalog-edit-types'
import { ModelEditor } from '../catalog-edit/ModelEditor'
import { NewModelsPage } from '../catalog-edit/NewModelsPage'

const planCatalogEdit = vi.hoisted(() => vi.fn(() => new Promise(() => {})))

vi.mock('@/components/layout/components/page-footer', async (original) => ({
  ...(await original<
    typeof import('@/components/layout/components/page-footer')
  >()),
  PageFooterPortal: (props: { children: React.ReactNode }) => props.children,
}))

vi.mock('../../catalog-edit-api', async (original) => ({
  ...(await original<typeof import('../../catalog-edit-api')>()),
  getCurrentCatalog: () => Promise.resolve({}),
  getCatalogEditorOptions: () =>
    Promise.resolve({
      usageProtocols: [],
      textUsageProtocols: [],
      mediaDeliveries: [],
      workflows: ['sync'],
      capabilities: ['image.generate'],
      sourceKinds: ['relay'],
      defaults: {
        pollIntervalMs: 1000,
        maxMultipartBytes: 1000,
        syncRequestTimeoutMs: 1000,
        assetRetentionSeconds: 1000,
      },
      supportedFields: {
        paramSchema: [],
        defaultParams: [],
        referenceLimits: [],
        mediaConstraints: [],
        profile: [],
      },
    }),
  getCatalogModelVersion: () => new Promise(() => {}),
  planCatalogEdit,
}))

const profile = {
  id: 'draft.image',
  version: '1.0.0-admin.1',
  kind: 'image.generate',
  workflow: 'sync',
  api: 'draft-image@1.0.0-admin.1',
  operations: { submit: 'submit' },
  advanced: { request: { body: { model: { $ref: 'model.upstreamId' } } } },
}
const contract = {
  openapi: '3.1.0',
  info: { title: 'x', version: '1.0.0-admin.1' },
  paths: { '/images': { post: { operationId: 'submit' } } },
}

// The new-Channel page builds its draft catalog, and the draft Provider in it, again on every render.
function draftCatalog(): CurrentCatalogView {
  return {
    bundle: {
      bundleId: 'b',
      bundleVersion: '1',
      providers: [
        {
          id: 'draft',
          internalName: 'Draft',
          sourceKind: 'relay',
          baseUrl: 'https://draft.example.com',
          internalOnly: true,
          trustPolicy: 'public-only',
          credentialSchemes: ['bearerAuth'],
        },
      ],
      channels: [
        {
          id: 'draft.image',
          providerId: 'draft',
          adapterProfile: { id: 'draft.image', version: '1.0.0-admin.1' },
          internalOnly: true,
        },
      ],
      models: [],
      openapiContracts: [
        { path: 'openapi/draft-image.openapi.json', document: contract },
      ],
      adapterProfiles: [{ path: 'profiles/draft-image.profile.json', profile }],
    },
    sources: { providers: {}, channels: {}, models: {} },
    versions: { providers: {}, channels: {}, models: {} },
    credentialGroups: [],
    modelCredentialGroups: {},
    copiedModels: {},
    retiredModelKeys: [],
  } as unknown as CurrentCatalogView
}

describe('Model editor inside the new-Channel page', () => {
  it('settles without input when its page gives it a new Provider object on every render', async () => {
    let renders = 0
    function Page() {
      const [, setStored] = useState<unknown>(null)
      renders += 1
      return (
        <ModelEditor
          mode={{ kind: 'new', channelId: 'draft.image' }}
          catalogOverride={draftCatalog()}
          embedded={
            {
              newGroup: { name: '', apiKey: '' },
              onNewGroupChange: () => {},
              extraDraft: { providers: [], channels: [] },
              onChange: (model: unknown) => setStored({ model }),
            } as never
          }
          onClose={() => {}}
          onEditPresentation={() => {}}
        />
      )
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Page />
      </QueryClientProvider>
    )
    await screen.findByText('What the user sees')
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(renders).toBeLessThan(8)
  })
})

describe('Model form checks', () => {
  const existing = {
    productKey: 'draft.image.taken',
    displayName: 'Taken',
    capability: 'image.generate',
    release: {
      channelId: 'draft.image',
      execution: { providerModel: { modelId: 'taken' } },
      publicInteraction: {
        defaultParams: {},
        paramSchema: {},
        referenceLimits: {},
      },
    },
  }
  const open = (others: unknown[] = []) => {
    const catalog = draftCatalog()
    catalog.bundle.models = [existing] as never
    catalog.retiredModelKeys = ['draft.image.gone']
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <ModelEditor
          mode={{ kind: 'new', channelId: 'draft.image' }}
          catalogOverride={catalog}
          embedded={
            {
              newGroup: { name: '', apiKey: '' },
              onNewGroupChange: () => {},
              extraDraft: { providers: [], channels: [] },
              onChange: () => {},
              others,
            } as never
          }
          onClose={() => {}}
          onEditPresentation={() => {}}
        />
      </QueryClientProvider>
    )
  }
  const validate = () =>
    fireEvent.click(
      screen.getByRole('button', { name: 'Validate and preview' })
    )
  const type = (placeholder: string, value: string) =>
    fireEvent.change(screen.getByPlaceholderText(placeholder), {
      target: { value },
    })

  it('says what is missing, and asks for an API Key when the provider has none', async () => {
    open()
    await screen.findByText('What the user sees')
    validate()
    expect(
      await screen.findByText('Enter the upstream model ID')
    ).toBeInTheDocument()
    expect(screen.getByText('Enter a display name')).toBeInTheDocument()
    expect(screen.getByText('Enter a product key')).toBeInTheDocument()
    expect(
      screen.getByText('Enter the API Key, or choose "Not bound for now"')
    ).toBeInTheDocument()
  })

  it('starts a provider without groups on a new group, and needs no key once left unbound', async () => {
    open()
    await screen.findByText('What the user sees')
    expect(screen.getByLabelText('API Key group')).toHaveValue('NEW')
    expect(screen.getByLabelText('API Key group name')).toHaveValue(
      'Draft main account'
    )
    fireEvent.change(screen.getByLabelText('API Key group'), {
      target: { value: 'NONE' },
    })
    expect(
      screen.queryByLabelText('API Key group name')
    ).not.toBeInTheDocument()
    validate()
    expect(
      await screen.findByText('Enter the upstream model ID')
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Enter the API Key, or choose "Not bound for now"')
    ).not.toBeInTheDocument()
  })

  it('fills the form from a pasted model, and takes one model at a time on its own', async () => {
    open()
    await screen.findByText('What the user sees')
    const pasted = { ...existing, productKey: '', displayName: 'Pasted' }
    const paste = (value: unknown) => {
      fireEvent.click(screen.getByRole('button', { name: 'Fill from JSON' }))
      fireEvent.change(screen.getByLabelText('JSON to fill in'), {
        target: { value: JSON.stringify(value) },
      })
    }
    paste([pasted, pasted])
    fireEvent.click(screen.getByRole('button', { name: 'Fill in 2 models' }))
    expect(
      screen.getByText('Only one model can be filled in here')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    paste(pasted)
    fireEvent.click(screen.getByRole('button', { name: 'Fill in' }))
    expect(await screen.findByDisplayValue('Pasted')).toBeInTheDocument()
  })

  it('marks the name of a pasted model that leaves it out', async () => {
    open()
    await screen.findByText('What the user sees')
    const { displayName: _name, ...nameless } = {
      ...existing,
      productKey: 'draft.image.nameless',
      release: {
        ...existing.release,
        execution: { providerModel: { modelId: 'nameless' } },
      },
    }
    fireEvent.click(screen.getByRole('button', { name: 'Fill from JSON' }))
    fireEvent.change(screen.getByLabelText('JSON to fill in'), {
      target: { value: JSON.stringify(nameless) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fill in' }))
    expect(await screen.findByDisplayValue('nameless')).toBeInTheDocument()
    validate()
    expect(await screen.findByText('Enter a display name')).toBeInTheDocument()
  })

  it('refuses an upstream ID in use, a badly formed key and a key of a deleted model', async () => {
    open()
    await screen.findByText('What the user sees')
    const keyField =
      'Generated after you choose a Channel configuration and fill in the upstream model ID'
    type('The model field of the upstream API', 'taken')
    type(keyField, 'Bad Key')
    validate()
    expect(
      await screen.findByText(
        'This Channel already has a model using this upstream model ID: Taken (draft.image.taken)'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Use lowercase letters, numbers, dots and hyphens, as API provider.type.name'
      )
    ).toBeInTheDocument()
    type(keyField, 'draft.image.gone')
    validate()
    expect(
      await screen.findByText('This product key belongs to a deleted model.')
    ).toBeInTheDocument()
  })

  it('refuses what another model of this page already uses', async () => {
    open([
      {
        credentialGroup: '',
        at: 1,
        definition: {
          ...existing,
          productKey: 'draft.image.mine',
          release: {
            ...existing.release,
            execution: { providerModel: { modelId: 'mine' } },
          },
        },
      },
    ])
    await screen.findByText('What the user sees')
    type('The model field of the upstream API', 'mine')
    type(
      'Generated after you choose a Channel configuration and fill in the upstream model ID',
      'draft.image.mine'
    )
    validate()
    expect(
      await screen.findByText(
        'Another model added this time has the same upstream model ID'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText('Another model added this time has the same product key')
    ).toBeInTheDocument()
  })

  it('checks and binds pasted models that were never opened before the page publishes', async () => {
    const catalog = draftCatalog()
    catalog.bundle.models = [existing] as never
    catalog.credentialGroups = [
      { providerId: 'draft', versionId: 'v1', name: 'Main' },
    ] as never
    catalog.modelCredentialGroups = { 'draft.image.taken': 'v1' }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NewModelsPage
          channelId='draft.image'
          catalogOverride={catalog}
          onClose={() => {}}
          onEditPresentation={() => {}}
        />
      </QueryClientProvider>
    )
    await screen.findByText('What the user sees')
    const pasted = (key: string, name: string) => ({
      ...existing,
      productKey: `draft.image.${key}`,
      displayName: name,
      release: {
        ...existing.release,
        execution: { providerModel: { modelId: key } },
      },
    })
    const fill = (models: unknown[]) => {
      fireEvent.click(screen.getByRole('button', { name: 'Fill from JSON' }))
      fireEvent.change(screen.getByLabelText('JSON to fill in'), {
        target: { value: JSON.stringify(models) },
      })
      fireEvent.click(
        screen.getByRole('button', {
          name:
            models.length > 1 ? `Fill in ${models.length} models` : 'Fill in',
        })
      )
    }
    fill([pasted('one', 'One'), pasted('two', '')])
    expect(await screen.findByDisplayValue('One')).toBeInTheDocument()
    validate()
    expect(await screen.findByText('Enter a display name')).toBeInTheDocument()
    expect(planCatalogEdit).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Display name'), {
      target: { value: 'Two' },
    })
    fill([pasted('three', 'Three')])
    expect(await screen.findByDisplayValue('Three')).toBeInTheDocument()
    validate()
    await vi.waitFor(() => expect(planCatalogEdit).toHaveBeenCalled())
    const draft = (
      planCatalogEdit.mock.calls[0] as unknown as [
        { models: Array<{ definition: { productKey: string } }> },
      ]
    )[0]
    expect(
      draft.models.map((model) => [
        model.definition.productKey,
        (model as { credentialGroup?: unknown }).credentialGroup,
      ])
    ).toEqual([
      ['draft.image.three', { versionId: 'v1' }],
      ['draft.image.one', { versionId: 'v1' }],
      ['draft.image.two', { versionId: 'v1' }],
    ])
  })
})

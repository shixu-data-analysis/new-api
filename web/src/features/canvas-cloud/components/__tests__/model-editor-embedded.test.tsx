import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { CurrentCatalogView } from '../../catalog-edit-types'
import { ModelEditor } from '../catalog-edit/ModelEditor'

vi.mock('@/components/layout/components/page-footer', async (original) => ({
  ...(await original<typeof import('@/components/layout/components/page-footer')>()),
  PageFooterPortal: (props: { children: React.ReactNode }) => props.children,
}))

vi.mock('../../catalog-edit-api', async (original) => ({
  ...(await original<typeof import('../../catalog-edit-api')>()),
  getCurrentCatalog: () => Promise.resolve({}),
  getCatalogEditorOptions: () => Promise.resolve({
    usageProtocols: [], textUsageProtocols: [], mediaDeliveries: [], workflows: ['sync'], capabilities: ['image.generate'], sourceKinds: ['relay'],
    defaults: { pollIntervalMs: 1000, maxMultipartBytes: 1000, syncRequestTimeoutMs: 1000, assetRetentionSeconds: 1000 },
    supportedFields: { paramSchema: [], defaultParams: [], referenceLimits: [], mediaConstraints: [], profile: [] },
  }),
  getCatalogModelVersion: () => new Promise(() => {}),
  planCatalogEdit: () => new Promise(() => {}),
}))

const profile = { id: 'draft.image', version: '1.0.0-admin.1', kind: 'image.generate', workflow: 'sync', api: 'draft-image@1.0.0-admin.1', operations: { submit: 'submit' }, advanced: { request: { body: { model: { $ref: 'model.upstreamId' } } } } }
const contract = { openapi: '3.1.0', info: { title: 'x', version: '1.0.0-admin.1' }, paths: { '/images': { post: { operationId: 'submit' } } } }

// The new-Channel page builds its draft catalog, and the draft Provider in it, again on every render.
function draftCatalog(): CurrentCatalogView {
  return {
    bundle: {
      bundleId: 'b', bundleVersion: '1',
      providers: [{ id: 'draft', internalName: 'Draft', sourceKind: 'relay', baseUrl: 'https://draft.example.com', internalOnly: true, trustPolicy: 'public-only', credentialSchemes: ['bearerAuth'] }],
      channels: [{ id: 'draft.image', providerId: 'draft', adapterProfile: { id: 'draft.image', version: '1.0.0-admin.1' }, internalOnly: true }],
      models: [],
      openapiContracts: [{ path: 'openapi/draft-image.openapi.json', document: contract }],
      adapterProfiles: [{ path: 'profiles/draft-image.profile.json', profile }],
    },
    sources: { providers: {}, channels: {}, models: {} },
    versions: { providers: {}, channels: {}, models: {} },
    credentialGroups: [], modelCredentialGroups: {}, copiedModels: {}, retiredModelKeys: [],
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
          embedded={{ apiKey: '', extraDraft: { providers: [], channels: [] }, onChange: (model: unknown) => setStored({ model }) } as never}
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
  const existing = { productKey: 'draft.image.taken', displayName: 'Taken', capability: 'image.generate', release: { channelId: 'draft.image', execution: { providerModel: { modelId: 'taken' } }, publicInteraction: { defaultParams: {}, paramSchema: {}, referenceLimits: {} } } }
  const open = (others: unknown[] = []) => {
    const catalog = draftCatalog()
    catalog.bundle.models = [existing] as never
    catalog.retiredModelKeys = ['draft.image.gone']
    return render(
      <QueryClientProvider client={new QueryClient()}>
        <ModelEditor
          mode={{ kind: 'new', channelId: 'draft.image' }}
          catalogOverride={catalog}
          embedded={{ apiKey: '', onApiKeyChange: () => {}, extraDraft: { providers: [], channels: [] }, onChange: () => {}, others } as never}
          onClose={() => {}}
          onEditPresentation={() => {}}
        />
      </QueryClientProvider>
    )
  }
  const validate = () => fireEvent.click(screen.getByRole('button', { name: 'Validate and preview' }))
  const type = (placeholder: string, value: string) => fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } })

  it('says what is missing, and asks for an API Key when the provider has none', async () => {
    open()
    await screen.findByText('What the user sees')
    validate()
    expect(await screen.findByText('Enter the upstream model ID')).toBeInTheDocument()
    expect(screen.getByText('Enter a display name')).toBeInTheDocument()
    expect(screen.getByText('Enter a product key')).toBeInTheDocument()
    expect(screen.getByText('Enter the API Key')).toBeInTheDocument()
  })

  it('refuses an upstream ID in use, a badly formed key and a key of a deleted model', async () => {
    open()
    await screen.findByText('What the user sees')
    const keyField = 'Generated after you choose a Channel configuration and fill in the upstream model ID'
    type('The model field of the upstream API', 'taken')
    type(keyField, 'Bad Key')
    validate()
    expect(await screen.findByText('This Channel already has a model using this upstream model ID: Taken (draft.image.taken)')).toBeInTheDocument()
    expect(screen.getByText('Use lowercase letters, numbers, dots and hyphens, as API provider.type.name')).toBeInTheDocument()
    type(keyField, 'draft.image.gone')
    validate()
    expect(await screen.findByText('This product key belongs to a deleted model.')).toBeInTheDocument()
  })

  it('refuses what another model of this page already uses', async () => {
    open([{ baseVersion: null, definition: { ...existing, productKey: 'draft.image.mine', release: { ...existing.release, execution: { providerModel: { modelId: 'mine' } } } } }])
    await screen.findByText('What the user sees')
    type('The model field of the upstream API', 'mine')
    type('Generated after you choose a Channel configuration and fill in the upstream model ID', 'draft.image.mine')
    validate()
    expect(await screen.findByText('Another model added this time has the same upstream model ID')).toBeInTheDocument()
    expect(screen.getByText('Another model added this time has the same product key')).toBeInTheDocument()
  })
})

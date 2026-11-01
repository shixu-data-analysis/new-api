import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { CatalogEditPlan } from '../../catalog-edit-api'
import { ChannelPublishDialog } from '../catalog-edit/ChannelPublishDialog'
import { ProvidersPanel } from '../catalog-edit/ProvidersPanel'

const MESSAGE_KEY = 'catalog.plan.promptReferencesRewritten'
const provider = { id: 'acme', internalName: 'Acme', baseUrl: 'https://acme.example.com', sourceKind: 'relay', credentialSchemes: ['bearerAuth'], internalOnly: true, trustPolicy: 'public-only' }
const rewrite = { code: 'CATALOG_PROMPT_REFERENCES_REWRITTEN', severity: 'WARNING', sourceFile: 'database', jsonPath: 'channels[acme.video].adapterProfile', valueSummary: 'acme.video', capability: 'catalog.import.publication', ownerModule: 'model-catalog', recommendation: 'x', internalTestingAllowed: false, messageKey: MESSAGE_KEY, params: { channelId: 'acme.video' } }
const plan = (diagnostics: unknown[]) => ({ action: 'PUBLISH', blocking: false, diagnostics, changes: [], models: [], decisions: [], requestChanges: [], editedModelKeys: [], planToken: 't' }) as unknown as CatalogEditPlan
const api = vi.hoisted(() => ({ plan: vi.fn() }))

vi.mock('../../catalog-edit-api', async (original) => ({
  ...(await original<typeof import('../../catalog-edit-api')>()),
  getCurrentCatalog: () => Promise.resolve({ bundle: { providers: [provider], channels: [], models: [], openapiContracts: [], adapterProfiles: [] }, sources: { providers: {}, channels: {}, models: {} }, versions: { providers: {}, channels: {}, models: {} } }),
  planCatalogEdit: api.plan,
}))

describe('Publication confirmations of a prompt reference rewrite', () => {
  beforeAll(async () => {
    await i18next.changeLanguage('en')
    i18next.addResource('en', 'translation', MESSAGE_KEY, '{{channelId}}: every mode rewrites references.')
  })

  const openChannelDialog = (diagnostics: unknown[]) =>
    render(<ChannelPublishDialog plan={plan(diagnostics)} baseProfile={null} contractChanged={false} busy={false} onClose={vi.fn()} onConfirm={vi.fn()} />)

  it('states it when a Channel is edited, and leaves publishing open', () => {
    openChannelDialog([rewrite])
    expect(screen.getByText(/^acme\.video: every mode rewrites references\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()
  })

  it('says nothing for a Channel edit without it', () => {
    openChannelDialog([])
    expect(screen.queryByText(/every mode rewrites/)).toBeNull()
  })

  it('states it when an API provider edit carries the Channel along', async () => {
    api.plan.mockResolvedValue(plan([rewrite]))
    render(<QueryClientProvider client={new QueryClient()}><ProvidersPanel /></QueryClientProvider>)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Internal name'), { target: { value: 'Acme renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Next: view the impact' }))
    expect(await screen.findByText(/^acme\.video: every mode rewrites references\./)).toBeInTheDocument()
  })
})

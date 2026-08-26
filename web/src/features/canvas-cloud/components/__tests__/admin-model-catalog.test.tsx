import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildCatalogBundle } from '../../catalogBundleReader'
import { AdminModelCatalog } from '../AdminModelCatalog'

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  publish: vi.fn(),
  published: vi.fn(),
  presentation: vi.fn(),
}))
vi.mock('../../api', () => ({
  planCanvasModelCatalogBundle: mocks.plan,
  publishCanvasModelCatalogBundle: mocks.publish,
  getCanvasAdminTestingModels: mocks.published,
  publishCanvasModelPresentation: mocks.presentation,
}))

function catalogFile(path: string, value: unknown): File {
  const file = new File(
    [JSON.stringify(value)],
    path.split('/').at(-1) ?? path,
    {
      type: 'application/json',
    }
  )
  Object.defineProperty(file, 'webkitRelativePath', { value: `bundle/${path}` })
  return file
}

const manifest = {
  schemaVersion: 2,
  bundleId: 'canvas.test',
  bundleVersion: '1',
  providers: 'providers.json',
  channels: 'channels.json',
  models: 'models.json',
  openapiContracts: ['openapi/test.openapi.json'],
  adapterProfiles: ['profiles/test.profile.json'],
}

describe('Canvas model catalog folder upload', () => {
  beforeEach(() => {
    mocks.plan.mockReset()
    mocks.publish.mockReset()
    mocks.published.mockReset()
    mocks.published.mockResolvedValue([])
    mocks.presentation.mockReset()
  })
  it('assembles only the files referenced by manifest.json', async () => {
    const bundle = await buildCatalogBundle([
      catalogFile('manifest.json', manifest),
      catalogFile('providers.json', {
        schemaVersion: 2,
        providers: [{ id: 'p' }],
      }),
      catalogFile('channels.json', {
        schemaVersion: 2,
        channels: [{ id: 'c' }],
      }),
      catalogFile('models.json', {
        schemaVersion: 2,
        models: [{ productKey: 'm' }],
      }),
      catalogFile('openapi/test.openapi.json', { openapi: '3.0.0' }),
      catalogFile('profiles/test.profile.json', { schemaVersion: 1 }),
    ])
    expect(bundle).toMatchObject({
      bundleId: 'canvas.test',
      bundleVersion: '1',
    })
    expect(bundle.openapiContracts[0]?.path).toBe('openapi/test.openapi.json')
    expect(bundle.adapterProfiles[0]?.path).toBe('profiles/test.profile.json')
  })

  it('reports a missing referenced file before calling Canvas Cloud', async () => {
    await expect(
      buildCatalogBundle([
        catalogFile('manifest.json', manifest),
        catalogFile('providers.json', { schemaVersion: 2, providers: [] }),
        catalogFile('channels.json', { schemaVersion: 2, channels: [] }),
        catalogFile('models.json', { schemaVersion: 2, models: [] }),
      ])
    ).rejects.toThrow('Missing required file: openapi/test.openapi.json')
  })

  it('shows server-planned changes and an explicit page indicator after folder selection', async () => {
    mocks.plan.mockResolvedValue({
      bundleId: 'canvas.test',
      bundleVersion: '1',
      manifestSha256: 'a'.repeat(64),
      action: 'PUBLISH',
      blocking: false,
      diagnostics: [],
      models: [
        {
          productKey: 'canvas.image.preview',
          displayName: 'Client preview model',
          capability: 'image.generate',
          action: 'CREATE',
          currentVersion: null,
          proposedVersion: 1,
          customerVisibleAfterPublish: false,
          publicInteraction: {
            defaultParams: { quality: '2K' },
            paramSchema: { qualities: ['1K', '2K'] },
            referenceLimits: { maxImageReferences: 4 },
          },
        },
      ],
      changes: Array.from({ length: 21 }, (_, index) => ({
        resourceType: 'CUSTOMER_MODEL',
        key: `model-${index + 1}`,
        action: 'CREATE',
        currentVersion: null,
        proposedVersion: 1,
        detail: {},
      })),
    })
    const files = [
      catalogFile('manifest.json', manifest),
      catalogFile('providers.json', { schemaVersion: 2, providers: [] }),
      catalogFile('channels.json', { schemaVersion: 2, channels: [] }),
      catalogFile('models.json', { schemaVersion: 2, models: [] }),
      catalogFile('openapi/test.openapi.json', { openapi: '3.0.0' }),
      catalogFile('profiles/test.profile.json', { schemaVersion: 1 }),
    ]
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files },
    })
    await waitFor(() => expect(mocks.plan).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Client preview model')).toBeInTheDocument()
    expect(screen.getByText('canvas.image.preview')).toBeInTheDocument()
    expect(
      screen.getByText('Internal testing until pricing is published')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Database plan (21)' }))
    expect(await screen.findByText('model-1')).toBeInTheDocument()
    expect(screen.queryByText('model-21')).not.toBeInTheDocument()
    expect(screen.getByText('21 records · 1 / 2')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Review and publish' })
    ).toBeEnabled()
  })

  it('shows unchanged models and prevents a redundant publication', async () => {
    mocks.plan.mockResolvedValue({
      bundleId: 'canvas.test',
      bundleVersion: '2',
      manifestSha256: 'b'.repeat(64),
      action: 'NO_CHANGES',
      blocking: false,
      diagnostics: [],
      models: [
        {
          productKey: 'canvas.image.preview',
          displayName: 'Existing client model',
          capability: 'image.generate',
          action: 'NO_OP',
          currentVersion: 1,
          proposedVersion: 1,
          customerVisibleAfterPublish: false,
          publicInteraction: {
            defaultParams: {},
            paramSchema: {},
            referenceLimits: {},
          },
        },
      ],
      changes: [
        {
          resourceType: 'CUSTOMER_MODEL',
          key: 'canvas.image.preview',
          action: 'NO_OP',
          currentVersion: 1,
          proposedVersion: 1,
          detail: {},
        },
      ],
    })
    const files = [
      catalogFile('manifest.json', { ...manifest, bundleVersion: '2' }),
      catalogFile('providers.json', { schemaVersion: 2, providers: [] }),
      catalogFile('channels.json', { schemaVersion: 2, channels: [] }),
      catalogFile('models.json', { schemaVersion: 2, models: [] }),
      catalogFile('openapi/test.openapi.json', { openapi: '3.0.0' }),
      catalogFile('profiles/test.profile.json', { schemaVersion: 1 }),
    ]
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files },
    })
    expect(await screen.findByText('Existing client model')).toBeInTheDocument()
    expect(screen.getByText('Unchanged — skipped')).toBeInTheDocument()
    expect(
      screen.getByText('Nothing needs to be published')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Review and publish' })
    ).toBeDisabled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { unzipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CatalogExportDialog } from '../catalog-edit/CatalogExportDialog'

// jsdom's TextEncoder returns bytes of another realm, which fflate takes for a folder; a browser has one realm.
vi.hoisted(() => {
  const encoder = new TextEncoder()
  vi.stubGlobal(
    'TextEncoder',
    class {
      encode(text: string) {
        return new Uint8Array(encoder.encode(text))
      }
    }
  )
})

const files = [
  { path: 'manifest.json', content: { schemaVersion: 2 } },
  { path: 'models.json', content: { schemaVersion: 2, models: [] } },
  { path: 'openapi/acme.openapi.json', content: { openapi: '3.1.0' } },
  { path: 'profiles/acme-image.profile.json', content: { id: 'acme.image' } },
  {
    path: 'profiles/1.0.0/acme-video.profile.json',
    content: { id: 'acme.video' },
  },
]
const api = vi.hoisted(() => ({ exported: vi.fn(), current: vi.fn() }))

vi.mock('../../catalog-edit-api', async (original) => ({
  ...(await original<typeof import('../../catalog-edit-api')>()),
  exportCurrentCatalog: api.exported,
  getCurrentCatalog: api.current,
}))

const saved: Array<{ name: string; blob: Blob }> = []

function readBlob(blob: Blob) {
  return new Promise<Uint8Array>((resolve) => {
    const reader = new FileReader()
    reader.addEventListener('load', () =>
      resolve(new Uint8Array(reader.result as ArrayBuffer))
    )
    reader.readAsArrayBuffer(blob)
  })
}

function open() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <CatalogExportDialog onClose={vi.fn()} />
    </QueryClientProvider>
  )
}

describe('Catalog export', () => {
  beforeEach(() => {
    saved.length = 0
    api.exported.mockResolvedValue({
      bundleId: 'canvas.catalog',
      bundleVersion: 'export.1',
      files,
    })
    api.current.mockResolvedValue({
      bundle: {
        models: [{ productKey: 'a' }, { productKey: 'b' }],
        channels: [{ id: 'c' }],
        providers: [{ id: 'p' }],
      },
      sources: {
        models: { a: 'ADMIN', b: 'BUNDLE' },
        channels: {},
        providers: {},
      },
    })
    let blob: Blob
    URL.createObjectURL = vi.fn((value: Blob) => {
      blob = value
      return 'blob:x'
    }) as never
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function (this: HTMLAnchorElement) {
        saved.push({ name: this.download, blob })
      }
    )
  })

  it('says what the Bundle holds and that it passed the checks', async () => {
    open()
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Validation passed'
    )
    expect(api.exported).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('lists files under their folders by name, and shows the first until another is chosen', async () => {
    open()
    expect(await screen.findByText('openapi/')).toBeInTheDocument()
    expect(screen.getByText('profiles/')).toBeInTheDocument()
    expect(screen.getByText('profiles/1.0.0/')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'profiles/acme-image.profile.json' })
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'manifest.json' })
    ).toHaveAttribute('aria-current', 'true')
    expect(screen.getByLabelText('manifest.json')).toHaveTextContent(
      '"schemaVersion": 2'
    )
    expect(
      screen.getByRole('button', { name: 'Copy the current file' })
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'acme-image.profile.json' })
    )
    expect(
      screen.getByLabelText('profiles/acme-image.profile.json')
    ).toHaveTextContent('"id": "acme.image"')
    expect(
      screen.getByRole('button', { name: 'acme-image.profile.json' })
    ).toHaveAttribute('aria-current', 'true')
  })

  it('downloads a zip laid out like the Catalog, in the format its files use', async () => {
    open()
    await screen.findByRole('status')
    fireEvent.click(screen.getByRole('button', { name: 'Download zip' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]?.name).toBe('canvas.catalog-export.1.zip')
    const entries = unzipSync(await readBlob(saved[0].blob))
    expect(Object.keys(entries).sort()).toEqual(
      files.map((file) => file.path).sort()
    )
    expect(
      Buffer.from(entries['profiles/acme-image.profile.json']).toString()
    ).toBe('{\n  "id": "acme.image"\n}\n')
  })

  it('also downloads one file under its own name', async () => {
    open()
    await screen.findByRole('status')
    const row = screen
      .getByRole('button', { name: 'acme.openapi.json' })
      .closest('li') as HTMLElement
    fireEvent.click(
      within(row).getByRole('button', {
        name: /^Download openapi.+acme\.openapi\.json$/,
      })
    )
    expect(saved.map((entry) => entry.name)).toEqual(['acme.openapi.json'])
    expect(Buffer.from(await readBlob(saved[0].blob)).toString()).toBe(
      '{\n  "openapi": "3.1.0"\n}\n'
    )
  })

  it('lists no changed files when everything comes from a Bundle', async () => {
    api.current.mockResolvedValue({
      bundle: { models: [{ productKey: 'b' }], channels: [], providers: [] },
      sources: { models: { b: 'BUNDLE' }, channels: {}, providers: {} },
    })
    open()
    await screen.findByRole('status')
    expect(screen.queryByText('Changed or added in the admin')).toBeNull()
  })

  it('names the files the admin changed, and opens one from the list', async () => {
    open()
    const heading = await screen.findByText('Changed or added in the admin')
    const row = within(heading.parentElement as HTMLElement).getByRole(
      'button',
      {
        name: /models\.json/,
      }
    )
    expect(row).toHaveTextContent('models.json · a')
    fireEvent.click(row)
    expect(screen.getByLabelText('models.json')).toHaveTextContent('"models"')
  })

  it('offers nothing to download when the export fails its checks', async () => {
    api.exported.mockRejectedValue(new Error('invalid'))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'it does not pass the Catalog checks'
    )
    expect(screen.getByRole('button', { name: 'Download zip' })).toBeDisabled()
  })
})

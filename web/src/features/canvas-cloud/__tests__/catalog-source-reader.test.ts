import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  CatalogSourceReadError,
  readCatalogSource,
} from '../catalogSourceReader'

function sourceFile(path: string, bytes: Uint8Array): File {
  const content = new Uint8Array(bytes.byteLength)
  content.set(bytes)
  const file = new File([content.buffer], path.split('/').at(-1) ?? 'source')
  Object.defineProperty(file, 'webkitRelativePath', {
    value: `catalog/${path}`,
  })
  return file
}

function decoded(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}

const manifest = {
  schemaVersion: 2,
  bundleId: 'canvas.test',
  bundleVersion: '1',
  providers: 'providers.json',
  channels: 'channels.json',
  models: 'models.json',
  openapiContracts: ['openapi/test.openapi.json'],
  adapterProfiles: ['profiles/video/test.profile.json'],
}

function jsonFile(path: string, value: unknown): File {
  return sourceFile(path, new TextEncoder().encode(JSON.stringify(value)))
}

function bundleFiles(): File[] {
  return [
    jsonFile('manifest.json', manifest),
    jsonFile('providers.json', { providers: [] }),
    jsonFile('channels.json', { channels: [] }),
    jsonFile('models.json', { models: [] }),
    jsonFile('openapi/test.openapi.json', { openapi: '3.1.0' }),
    jsonFile('profiles/video/test.profile.json', { id: 'test' }),
  ]
}

describe('catalog source reader', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends only manifest.json and the files it lists, skipping the rest of the folder', async () => {
    const unrelated = [
      jsonFile('package.json', { name: 'catalog' }),
      jsonFile('docs/notes.json', {}),
      jsonFile('tests/fixtures/bundle.json', {}),
      sourceFile('README.md', new Uint8Array([1])),
      sourceFile('.git/config', new Uint8Array([2])),
    ]
    const unrelatedReaders = unrelated.map((file) =>
      vi.spyOn(file, 'arrayBuffer')
    )

    const source = await readCatalogSource([...unrelated, ...bundleFiles()])

    expect(source.schemaVersion).toBe(1)
    expect(source.files.map((file) => file.path).sort()).toEqual([
      'channels.json',
      'manifest.json',
      'models.json',
      'openapi/test.openapi.json',
      'profiles/video/test.profile.json',
      'providers.json',
    ])
    unrelatedReaders.forEach((reader) => expect(reader).not.toHaveBeenCalled())
  })

  it('preserves the bytes of listed files exactly, including invalid JSON', async () => {
    const invalidJson = Uint8Array.from([0x7b, 0x22, 0xff, 0x00, 0x7d])
    const files = bundleFiles().map((file) =>
      file.webkitRelativePath === 'catalog/models.json'
        ? sourceFile('models.json', invalidJson)
        : file
    )

    const source = await readCatalogSource(files)
    const models = source.files.find((file) => file.path === 'models.json')

    expect([...decoded(models?.contentBase64 ?? '')]).toEqual([...invalidJson])
  })

  it('accepts backslash separators in manifest paths, as Cloud does', async () => {
    const files = bundleFiles().map((file) =>
      file.webkitRelativePath === 'catalog/manifest.json'
        ? jsonFile('manifest.json', {
            ...manifest,
            adapterProfiles: ['profiles\\video\\test.profile.json'],
          })
        : file
    )

    const source = await readCatalogSource(files)

    expect(source.files.map((file) => file.path)).toContain(
      'profiles/video/test.profile.json'
    )
  })

  it('reports a missing manifest.json without reading other files', async () => {
    const files = bundleFiles().filter(
      (file) => file.webkitRelativePath !== 'catalog/manifest.json'
    )
    const readers = files.map((file) => vi.spyOn(file, 'arrayBuffer'))

    await expect(readCatalogSource(files)).rejects.toMatchObject({
      code: 'MANIFEST_MISSING',
    })
    readers.forEach((reader) => expect(reader).not.toHaveBeenCalled())
  })

  it('lists every referenced file that is missing from the folder', async () => {
    const files = bundleFiles().filter(
      (file) =>
        ![
          'catalog/models.json',
          'catalog/profiles/video/test.profile.json',
        ].includes(file.webkitRelativePath)
    )

    await expect(readCatalogSource(files)).rejects.toMatchObject({
      code: 'REFERENCED_FILES_MISSING',
      missingPaths: ['models.json', 'profiles/video/test.profile.json'],
    })
  })

  it('sends only manifest.json when it cannot be read as a manifest, so Cloud reports the exact error', async () => {
    const files = [
      sourceFile('manifest.json', Uint8Array.from([0x7b, 0xff])),
      jsonFile('models.json', {}),
    ]

    const source = await readCatalogSource(files)

    expect(source.files.map((file) => file.path)).toEqual(['manifest.json'])
  })

  it('removes one selected root segment and falls back to the file name', async () => {
    const standalone = new File(
      [
        JSON.stringify({
          ...manifest,
          providers: 'providers.json',
          channels: 'providers.json',
          models: 'providers.json',
          openapiContracts: [],
          adapterProfiles: [],
        }),
      ],
      'manifest.json'
    )

    const source = await readCatalogSource([
      standalone,
      jsonFile('providers.json', {}),
    ])

    expect(source.files.map((file) => file.path)).toEqual([
      'manifest.json',
      'providers.json',
    ])
  })

  it('reports no selection, unreadable files and encoding failures', async () => {
    await expect(readCatalogSource([])).rejects.toMatchObject({
      code: 'NO_FILES_SELECTED',
    })

    const unreadable = bundleFiles()
    const models = unreadable.find(
      (file) => file.webkitRelativePath === 'catalog/models.json'
    )
    if (!models) throw new Error('models.json fixture missing')
    vi.spyOn(models, 'arrayBuffer').mockRejectedValue(new Error('denied'))
    await expect(readCatalogSource(unreadable)).rejects.toMatchObject({
      code: 'FILE_READ_FAILED',
      sourceFile: 'models.json',
    })

    vi.spyOn(globalThis, 'btoa').mockImplementation(() => {
      throw new Error('encoding unavailable')
    })
    await expect(readCatalogSource(bundleFiles())).rejects.toEqual(
      new CatalogSourceReadError('ENCODING_FAILED', 'manifest.json')
    )
  })
})

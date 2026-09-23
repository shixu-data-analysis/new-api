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

describe('catalog source reader', () => {
  afterEach(() => vi.restoreAllMocks())

  it('preserves media constraints, unknown fields, and invalid JSON bytes exactly', async () => {
    const models = new TextEncoder().encode(
      JSON.stringify({
        models: [
          {
            release: {
              publicInteraction: {
                mediaConstraints: { video: { maxFrameRate: 60 } },
                futureCapability: { mode: 'new' },
              },
            },
          },
        ],
      })
    )
    const invalidJson = Uint8Array.from([0x7b, 0x22, 0xff, 0x00, 0x7d])

    const source = await readCatalogSource([
      sourceFile('models.json', models),
      sourceFile('invalid.json', invalidJson),
    ])

    expect(source.schemaVersion).toBe(1)
    expect(source.files.map((file) => file.path)).toEqual([
      'models.json',
      'invalid.json',
    ])
    expect([...decoded(source.files[0]?.contentBase64 ?? '')]).toEqual([
      ...models,
    ])
    expect([...decoded(source.files[1]?.contentBase64 ?? '')]).toEqual([
      ...invalidJson,
    ])
  })

  it('passes path and capacity edge cases through without business validation', async () => {
    const files = Array.from({ length: 1_101 }, (_, index) =>
      sourceFile(
        index === 0 ? '../escape.json' : `file-${index}.json`,
        new Uint8Array()
      )
    )
    files.push(sourceFile('/absolute.json', new Uint8Array([1])))
    files.push(sourceFile('duplicate.json', new Uint8Array([2])))
    files.push(sourceFile('duplicate.json', new Uint8Array([3])))
    const oversizedOne = sourceFile('oversized-one.json', new Uint8Array([4]))
    const oversizedTwo = sourceFile('oversized-two.json', new Uint8Array([5]))
    Object.defineProperty(oversizedOne, 'size', {
      value: Number.MAX_SAFE_INTEGER,
    })
    Object.defineProperty(oversizedTwo, 'size', {
      value: Number.MAX_SAFE_INTEGER,
    })
    files.push(oversizedOne, oversizedTwo)

    const source = await readCatalogSource(files)

    expect(source.files).toHaveLength(1_106)
    expect(source.files[0]?.path).toBe('../escape.json')
    expect(source.files.at(-5)?.path).toBe('/absolute.json')
    expect(source.files.slice(-4).map((file) => file.path)).toEqual([
      'duplicate.json',
      'duplicate.json',
      'oversized-one.json',
      'oversized-two.json',
    ])
  })

  it('removes one selected root segment and falls back to the file name', async () => {
    const nested = sourceFile(
      'profiles/video/profile.json',
      new Uint8Array([1])
    )
    const standalone = new File([new Uint8Array([2])], 'standalone.json')

    const source = await readCatalogSource([nested, standalone])

    expect(source.files.map((file) => file.path)).toEqual([
      'profiles/video/profile.json',
      'standalone.json',
    ])
  })

  it('reads only JSON files outside .git and .github directories', async () => {
    const ignoredFiles = [
      sourceFile('.git/config.json', new Uint8Array([1])),
      sourceFile('nested/.git/objects/entry.json', new Uint8Array([2])),
      sourceFile('.github/catalog.json', new Uint8Array([3])),
      sourceFile('nested/.github/settings.JSON', new Uint8Array([4])),
      sourceFile('.DS_Store', new Uint8Array([5])),
      sourceFile('README.md', new Uint8Array([6])),
      sourceFile('catalog.yml', new Uint8Array([7])),
      sourceFile('LICENSE', new Uint8Array([8])),
    ]
    const ignoredReaders = ignoredFiles.map((file) =>
      vi.spyOn(file, 'arrayBuffer')
    )
    const hiddenDirectoryBytes = Uint8Array.from([0x00, 0xff, 0x7f])
    const packageBytes = new TextEncoder().encode('{invalid package json')

    const source = await readCatalogSource([
      ...ignoredFiles,
      sourceFile('.catalog/catalog.JSON', hiddenDirectoryBytes),
      sourceFile('package.json', packageBytes),
    ])

    ignoredReaders.forEach((reader) => expect(reader).not.toHaveBeenCalled())
    expect(source.files.map((file) => file.path)).toEqual([
      '.catalog/catalog.JSON',
      'package.json',
    ])
    expect([...decoded(source.files[0]?.contentBase64 ?? '')]).toEqual([
      ...hiddenDirectoryBytes,
    ])
    expect([...decoded(source.files[1]?.contentBase64 ?? '')]).toEqual([
      ...packageBytes,
    ])
  })

  it('reports no files selected when the selection has no eligible JSON', async () => {
    const ignoredFiles = [
      sourceFile('.git/index.json', new Uint8Array([1])),
      sourceFile('.github/catalog.json', new Uint8Array([2])),
      sourceFile('.DS_Store', new Uint8Array([3])),
      sourceFile('README.md', new Uint8Array([4])),
      sourceFile('catalog.yaml', new Uint8Array([5])),
      sourceFile('NOTICE', new Uint8Array([6])),
    ]
    const ignoredReaders = ignoredFiles.map((file) =>
      vi.spyOn(file, 'arrayBuffer')
    )

    await expect(readCatalogSource(ignoredFiles)).rejects.toMatchObject({
      code: 'NO_FILES_SELECTED',
    })
    ignoredReaders.forEach((reader) => expect(reader).not.toHaveBeenCalled())
  })

  it('reports only selection, file read, and byte encoding failures', async () => {
    await expect(readCatalogSource([])).rejects.toMatchObject({
      code: 'NO_FILES_SELECTED',
    })

    const unreadable = sourceFile('unreadable.json', new Uint8Array())
    vi.spyOn(unreadable, 'arrayBuffer').mockRejectedValue(new Error('denied'))
    await expect(readCatalogSource([unreadable])).rejects.toMatchObject({
      code: 'FILE_READ_FAILED',
      sourceFile: 'unreadable.json',
    })

    vi.spyOn(globalThis, 'btoa').mockImplementation(() => {
      throw new Error('encoding unavailable')
    })
    await expect(
      readCatalogSource([sourceFile('source.json', new Uint8Array([1]))])
    ).rejects.toEqual(
      new CatalogSourceReadError('ENCODING_FAILED', 'source.json')
    )
  })
})

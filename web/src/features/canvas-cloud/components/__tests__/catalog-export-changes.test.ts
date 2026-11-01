import { describe, expect, it } from 'vitest'

import { adminChangedFiles } from '../catalog-edit/catalog-export-changes'

const profileFile = (
  path: string,
  id: string,
  version: string,
  api: string
) => ({ path, content: { id, version, api } })
const contractFile = (path: string, version: string) => ({
  path,
  content: { info: { version } },
})
const files = [
  { path: 'manifest.json', content: {} },
  { path: 'providers.json', content: {} },
  { path: 'channels.json', content: {} },
  { path: 'models.json', content: {} },
  contractFile('openapi/shared.openapi.json', '1.0.0'),
  contractFile('openapi/own.openapi.json', '1.0.0-admin.2'),
  profileFile('profiles/a.profile.json', 'a', '1.0.0-admin.1', 'shared@1.0.0'),
  profileFile(
    'profiles/b.profile.json',
    'b',
    '1.0.0-admin.3',
    'own@1.0.0-admin.2'
  ),
  profileFile('profiles/c.profile.json', 'c', '1.0.0', 'shared@1.0.0'),
]
const channel = (id: string, version: string) => ({
  id,
  adapterProfile: { id, version },
})
const catalog = (sources: {
  providers?: object
  channels?: object
  models?: object
}) =>
  ({
    bundle: {
      providers: [{ id: 'p' }],
      channels: [
        channel('a', '1.0.0-admin.1'),
        channel('b', '1.0.0-admin.3'),
        channel('c', '1.0.0'),
      ],
      models: [{ productKey: 'm1' }, { productKey: 'm2' }],
    },
    sources: { providers: {}, channels: {}, models: {}, ...sources },
  }) as never

describe('files the admin changed', () => {
  it('finds none when everything comes from a Bundle', () => {
    expect(
      adminChangedFiles(
        files,
        catalog({
          providers: { p: 'BUNDLE' },
          channels: { a: 'BUNDLE' },
          models: { m1: 'BUNDLE' },
        })
      )
    ).toEqual([])
  })

  it('names the objects in each shared file', () => {
    expect(
      adminChangedFiles(
        files,
        catalog({
          providers: { p: 'ADMIN' },
          models: { m1: 'ADMIN', m2: 'BUNDLE' },
        })
      )
    ).toEqual([
      { path: 'providers.json', items: ['p'] },
      { path: 'models.json', items: ['m1'] },
    ])
  })

  it('lists an edited Channel with its Profile, but not a contract the edit left alone', () => {
    expect(
      adminChangedFiles(files, catalog({ channels: { a: 'ADMIN' } })).map(
        (entry) => entry.path
      )
    ).toEqual(['channels.json', 'profiles/a.profile.json'])
  })

  it('lists the contract the admin wrote', () => {
    expect(
      adminChangedFiles(files, catalog({ channels: { b: 'ADMIN' } }))
    ).toEqual([
      { path: 'channels.json', items: ['b'] },
      { path: 'openapi/own.openapi.json', items: ['b'] },
      { path: 'profiles/b.profile.json', items: ['b'] },
    ])
  })
})

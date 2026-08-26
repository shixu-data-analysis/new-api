/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { CanvasModelCatalogBundle } from './types'

type Manifest = {
  schemaVersion: 2
  bundleId: string
  bundleVersion: string
  providers: string
  channels: string
  models: string
  openapiContracts: string[]
  adapterProfiles: string[]
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: string[],
  path: string
) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length) {
    throw new Error(`Unknown field in ${path}: ${unknown[0]}`)
  }
}

function assertSourcePath(path: unknown): asserts path is string {
  if (
    typeof path !== 'string' ||
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('manifest.json contains an invalid relative path')
  }
}

function relativePath(file: File): string {
  const path = file.webkitRelativePath || file.name
  const slash = path.indexOf('/')
  return slash < 0 ? path : path.slice(slash + 1)
}

async function readObject(file: File | undefined, path: string) {
  if (!file) {
    throw new Error(`Missing required file: ${path}`)
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error(`File exceeds 2 MiB: ${path}`)
  }
  try {
    const value: unknown = JSON.parse(await file.text())
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error()
    }
    return value as Record<string, unknown>
  } catch {
    throw new Error(`Invalid JSON object: ${path}`)
  }
}

export async function buildCatalogBundle(
  files: File[]
): Promise<CanvasModelCatalogBundle> {
  if (!files.length) {
    throw new Error('Select a Bundle folder')
  }
  if (files.length > 1_100) {
    throw new Error('Bundle contains too many files')
  }
  const byPath = new Map(files.map((file) => [relativePath(file), file]))
  const manifest = (await readObject(
    byPath.get('manifest.json'),
    'manifest.json'
  )) as Manifest
  assertExactKeys(
    manifest as unknown as Record<string, unknown>,
    [
      'schemaVersion',
      'bundleId',
      'bundleVersion',
      'providers',
      'channels',
      'models',
      'openapiContracts',
      'adapterProfiles',
    ],
    'manifest.json'
  )
  if (
    manifest.schemaVersion !== 2 ||
    !manifest.bundleId ||
    !manifest.bundleVersion
  ) {
    throw new Error(
      'manifest.json must use schemaVersion 2 and declare Bundle identity'
    )
  }
  if (
    !Array.isArray(manifest.openapiContracts) ||
    !Array.isArray(manifest.adapterProfiles)
  ) {
    throw new Error(
      'manifest.json must list OpenAPI contracts and adapter profiles'
    )
  }
  const sourcePaths = [
    manifest.providers,
    manifest.channels,
    manifest.models,
    ...manifest.openapiContracts,
    ...manifest.adapterProfiles,
  ]
  sourcePaths.forEach(assertSourcePath)
  const providers = await readObject(
    byPath.get(manifest.providers),
    manifest.providers
  )
  const channels = await readObject(
    byPath.get(manifest.channels),
    manifest.channels
  )
  const models = await readObject(byPath.get(manifest.models), manifest.models)
  for (const [path, value, key] of [
    [manifest.providers, providers, 'providers'],
    [manifest.channels, channels, 'channels'],
    [manifest.models, models, 'models'],
  ] as const) {
    assertExactKeys(value, ['schemaVersion', key], path)
    if (value.schemaVersion !== 2) {
      throw new Error(`${path} must use schemaVersion 2`)
    }
  }
  const openapiContracts = await Promise.all(
    manifest.openapiContracts.map(async (path) => ({
      path,
      document: await readObject(byPath.get(path), path),
    }))
  )
  const adapterProfiles = await Promise.all(
    manifest.adapterProfiles.map(async (path) => ({
      path,
      profile: await readObject(byPath.get(path), path),
    }))
  )
  if (
    !Array.isArray(providers.providers) ||
    !Array.isArray(channels.channels) ||
    !Array.isArray(models.models)
  ) {
    throw new Error(
      'providers.json, channels.json, and models.json must contain arrays'
    )
  }
  return {
    schemaVersion: 2,
    bundleId: manifest.bundleId,
    bundleVersion: manifest.bundleVersion,
    providers: providers.providers as Array<Record<string, unknown>>,
    channels: channels.channels as Array<Record<string, unknown>>,
    models: models.models as Array<Record<string, unknown>>,
    openapiContracts,
    adapterProfiles,
  }
}

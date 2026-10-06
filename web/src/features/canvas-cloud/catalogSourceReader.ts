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
import type { ModelCatalogImportSource } from './generated/model-catalog-import'

export class CatalogSourceReadError extends Error {
  constructor(
    readonly code:
      | 'NO_FILES_SELECTED'
      | 'MANIFEST_MISSING'
      | 'REFERENCED_FILES_MISSING'
      | 'FILE_READ_FAILED'
      | 'ENCODING_FAILED',
    readonly sourceFile?: string,
    readonly missingPaths: string[] = []
  ) {
    super(code)
    this.name = 'CatalogSourceReadError'
  }
}

const manifestPath = 'manifest.json'

function sourcePath(file: File): string {
  const path = file.webkitRelativePath || file.name
  const rootSeparator = path.indexOf('/')
  return rootSeparator < 0 ? path : path.slice(rootSeparator + 1)
}

async function readBytes(file: File, path: string): Promise<ArrayBuffer> {
  try {
    return await file.arrayBuffer()
  } catch {
    throw new CatalogSourceReadError('FILE_READ_FAILED', path)
  }
}

/**
 * The files manifest.json lists, with the same separator rule Cloud applies. A manifest that is
 * not valid JSON or lists no paths yields none: Cloud then reports the exact manifest diagnostic.
 */
function manifestReferences(bytes: ArrayBuffer): string[] {
  let manifest: unknown
  try {
    manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return []
  }
  if (!manifest || typeof manifest !== 'object') return []
  const fields = manifest as Record<string, unknown>
  const listed = [
    fields.providers,
    fields.channels,
    fields.models,
    ...(Array.isArray(fields.openapiContracts) ? fields.openapiContracts : []),
    ...(Array.isArray(fields.adapterProfiles) ? fields.adapterProfiles : []),
  ]
  return [
    ...new Set(
      listed
        .filter((path): path is string => typeof path === 'string' && path !== '')
        .map((path) => path.replaceAll('\\', '/'))
    ),
  ]
}

function encodeBase64(bytes: ArrayBuffer, path: string): string {
  try {
    const values = new Uint8Array(bytes)
    const chunks: string[] = []
    const chunkSize = 0x8000
    for (let offset = 0; offset < values.length; offset += chunkSize) {
      chunks.push(
        String.fromCharCode(...values.subarray(offset, offset + chunkSize))
      )
    }
    return btoa(chunks.join(''))
  } catch {
    throw new CatalogSourceReadError('ENCODING_FAILED', path)
  }
}

/**
 * Reads manifest.json and only the files it lists. Cloud reads the same closure, so validation
 * and the source hash do not change; other files in the selected folder are never uploaded.
 */
export async function readCatalogSource(
  files: File[]
): Promise<ModelCatalogImportSource> {
  if (!files.length) {
    throw new CatalogSourceReadError('NO_FILES_SELECTED')
  }
  const selected = files.map((file) => ({ file, path: sourcePath(file) }))
  const manifest = selected.find(({ path }) => path === manifestPath)
  if (!manifest) {
    throw new CatalogSourceReadError('MANIFEST_MISSING', manifestPath, [
      manifestPath,
    ])
  }
  const manifestBytes = await readBytes(manifest.file, manifestPath)
  const references = manifestReferences(manifestBytes)
  const present = new Set(selected.map(({ path }) => path))
  const missingPaths = references.filter((path) => !present.has(path))
  if (missingPaths.length) {
    throw new CatalogSourceReadError(
      'REFERENCED_FILES_MISSING',
      manifestPath,
      missingPaths
    )
  }
  const closure = new Set(references)
  const sources = [
    { path: manifestPath, contentBase64: encodeBase64(manifestBytes, manifestPath) },
    ...(await Promise.all(
      selected
        .filter(({ path }) => path !== manifestPath && closure.has(path))
        .map(async ({ file, path }) => ({
          path,
          contentBase64: encodeBase64(await readBytes(file, path), path),
        }))
    )),
  ]
  return { schemaVersion: 1, files: sources }
}

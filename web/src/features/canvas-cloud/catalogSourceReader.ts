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
    readonly code: 'NO_FILES_SELECTED' | 'FILE_READ_FAILED' | 'ENCODING_FAILED',
    readonly sourceFile?: string
  ) {
    super(code)
    this.name = 'CatalogSourceReadError'
  }
}

function sourcePath(file: File): string {
  const path = file.webkitRelativePath || file.name
  const rootSeparator = path.indexOf('/')
  return rootSeparator < 0 ? path : path.slice(rootSeparator + 1)
}

function isCatalogSource(path: string): boolean {
  const segments = path.split('/')
  const directories = segments.slice(0, -1)
  return (
    !directories.some(
      (segment) => segment === '.git' || segment === '.github'
    ) &&
    (segments.at(-1)?.toLowerCase().endsWith('.json') ?? false)
  )
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

export async function readCatalogSource(
  files: File[]
): Promise<ModelCatalogImportSource> {
  if (!files.length) {
    throw new CatalogSourceReadError('NO_FILES_SELECTED')
  }

  const selectedFiles = files
    .map((file) => ({ file, path: sourcePath(file) }))
    .filter(({ path }) => isCatalogSource(path))
  if (!selectedFiles.length) {
    throw new CatalogSourceReadError('NO_FILES_SELECTED')
  }

  const sources = await Promise.all(
    selectedFiles.map(async ({ file, path }) => {
      let content: ArrayBuffer
      try {
        content = await file.arrayBuffer()
      } catch {
        throw new CatalogSourceReadError('FILE_READ_FAILED', path)
      }
      return { path, contentBase64: encodeBase64(content, path) }
    })
  )

  return { schemaVersion: 1, files: sources }
}

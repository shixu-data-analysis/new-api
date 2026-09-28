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
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const moduleRoot = join(process.cwd(), 'src/features/canvas-cloud')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : sourceFiles(path)
    }
    return path.endsWith('.tsx') ? [path] : []
  })
}

// Returns each object literal that starts with an `id:` or `accessorKey:` column property.
function columnDefinitions(source: string) {
  const columns: Array<{ id: string; body: string }> = []
  const start = /\{\n\s*(?:id|accessorKey):\s*'([^']+)'/g
  for (const match of source.matchAll(start)) {
    let depth = 0
    let end = match.index
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1
      else if (source[end] === '}' && --depth === 0) break
    }
    columns.push({ id: match[1], body: source.slice(match.index, end) })
  }
  return columns
}

describe('Canvas table column toggle labels', () => {
  it('gives every hideable accessor column with a component header a meta label', () => {
    const missing: string[] = []
    for (const file of sourceFiles(moduleRoot)) {
      for (const column of columnDefinitions(readFileSync(file, 'utf8'))) {
        const { body } = column
        const hasAccessor = /\n\s*(?:accessorKey|accessorFn):/.test(body)
        const componentHeader = /\n\s*header:\s*(?:\(|[a-zA-Z_]+\s*=>)/.test(
          body
        )
        if (!hasAccessor || !componentHeader) continue
        if (body.includes('enableHiding: false')) continue
        if (/\n\s*meta:\s*\{[\s\S]*?\blabel:/.test(body)) continue
        missing.push(`${relative(moduleRoot, file)}#${column.id}`)
      }
    }
    // The shared view-options menu falls back to the raw column id (for example "TaskId").
    expect(missing).toEqual([])
  })
})

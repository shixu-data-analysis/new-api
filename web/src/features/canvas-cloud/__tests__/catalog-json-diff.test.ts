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
import { describe, expect, it } from 'vitest'

import {
  diffCatalogJson,
  foldCatalogJsonDiff,
  normalizeCatalogJson,
} from '../catalog-json-diff'

function referenceLcsLength(left: string[], right: string[]): number {
  const table = Array.from({ length: left.length + 1 }, () =>
    Array.from({ length: right.length + 1 }, () => 0)
  )
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        left[i] === right[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table[0][0]
}

describe('catalog JSON diff', () => {
  it('treats the same fields in a different order as unchanged', () => {
    const diff = diffCatalogJson(
      { release: { channelId: 'a', execution: { b: 1, a: 2 } }, name: 'x' },
      { name: 'x', release: { execution: { a: 2, b: 1 }, channelId: 'a' } }
    )

    expect(diff.added + diff.removed).toBe(0)
    expect(diff.proposedText).toBe(
      normalizeCatalogJson({ name: 'x', release: { channelId: 'a', execution: { a: 2, b: 1 } } })
    )
  })

  it('reports reordered array items as a change', () => {
    const diff = diffCatalogJson({ qualities: ['1K', '2K'] }, { qualities: ['2K', '1K'] })

    expect(diff.added).toBeGreaterThan(0)
    expect(diff.removed).toBeGreaterThan(0)
  })

  it('shows a changed value as one removed line and one added line', () => {
    const diff = diffCatalogJson({ limit: 1, name: 'x' }, { limit: 2, name: 'x' })

    expect(diff.lines.filter((line) => line.kind !== 'same')).toEqual([
      { kind: 'removed', text: '  "limit": 1,' },
      { kind: 'added', text: '  "limit": 2,' },
    ])
  })

  it('shows only the proposed text when there is no current content', () => {
    const diff = diffCatalogJson(null, { name: 'x' })

    expect(diff.hasCurrent).toBe(false)
    expect(diff.lines.every((line) => line.kind === 'same')).toBe(true)
    expect(diff.lines.map((line) => line.text).join('\n')).toBe(diff.proposedText)
  })

  it('compares a large definition changed at both ends without a quadratic table', () => {
    const paths = Object.fromEntries(
      Array.from({ length: 6000 }, (_, index) => [
        `/path-${String(index).padStart(5, '0')}`,
        { get: { summary: `Operation ${index}`, responses: { 200: { description: 'OK' } } } },
      ])
    )
    const before = { info: { version: '1.0.0' }, paths, zzz: { tail: 1 } }
    const after = { info: { version: '1.0.1' }, paths, zzz: { tail: 2 } }
    const reorderedBefore = { zzz: before.zzz, paths, info: before.info }

    const diff = diffCatalogJson(reorderedBefore, after)

    expect(diff.lines.length).toBeGreaterThan(40000)
    expect(diff.lines.filter((line) => line.kind !== 'same')).toEqual([
      { kind: 'removed', text: '    "version": "1.0.0"' },
      { kind: 'added', text: '    "version": "1.0.1"' },
      { kind: 'removed', text: '    "tail": 1' },
      { kind: 'added', text: '    "tail": 2' },
    ])
  })

  it('keeps the reference length on inputs large enough to use the Myers path', () => {
    let seed = 11
    const random = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return (seed >>> 16) % limit
    }
    for (let round = 0; round < 2; round += 1) {
      const before = Array.from({ length: 2200 }, () => `v${random(6)}`)
      const after = before
        .filter(() => random(10) > 0)
        .flatMap((value) => (random(8) === 0 ? [value, `v${random(6)}`] : [value]))
      const left = normalizeCatalogJson(before).split('\n')
      const right = normalizeCatalogJson(after).split('\n')
      expect(left.length * right.length).toBeGreaterThan(4_194_304)

      const diff = diffCatalogJson(before, after)

      expect(diff.lines.filter((line) => line.kind === 'same')).toHaveLength(
        referenceLcsLength(left, right)
      )
      expect(diff.lines.filter((line) => line.kind !== 'added').map((line) => line.text)).toEqual(left)
      expect(diff.lines.filter((line) => line.kind !== 'removed').map((line) => line.text)).toEqual(right)
    }
  })

  it('handles a very long run of added lines', () => {
    const before = { items: ['start'] }
    const after = {
      items: ['start', ...Array.from({ length: 150_000 }, (_, i) => `n${i}`)],
    }

    const diff = diffCatalogJson(before, after)

    expect(diff.added).toBe(150_001)
    expect(diff.removed).toBe(1)
  })

  it('finds the longest common subsequence when lines move', () => {
    const diff = diffCatalogJson(
      ['a', 'b', 'c', 'd', 'e', 'z'],
      ['b', 'c', 'x', 'e', 'a', 'z']
    )

    expect(diff.lines.filter((line) => line.kind === 'same')).toHaveLength(6)
    expect(diff.removed).toBe(2)
    expect(diff.added).toBe(2)
  })

  it('matches the reference longest common subsequence and rebuilds both sides', () => {
    // 32-bit integer LCG with a fixed seed: Math.imul keeps every step exact.
    let seed = 7
    const random = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return (seed >>> 16) % limit
    }
    const sampled = new Set<string>()
    const sample = () =>
      Array.from({ length: random(40) }, () => ['a', 'b', 'c', 'd'][random(4)])
    for (let round = 0; round < 500; round += 1) {
      const before = sample()
      const after = sample()
      for (const value of [...before, ...after]) sampled.add(value)
      const left = normalizeCatalogJson(before).split('\n')
      const right = normalizeCatalogJson(after).split('\n')
      const diff = diffCatalogJson(before, after)

      expect(diff.lines.filter((line) => line.kind === 'same')).toHaveLength(
        referenceLcsLength(left, right)
      )
      expect(
        diff.lines.filter((line) => line.kind !== 'added').map((line) => line.text)
      ).toEqual(left)
      expect(
        diff.lines.filter((line) => line.kind !== 'removed').map((line) => line.text)
      ).toEqual(right)
    }
    expect([...sampled].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it.each([
    ['empty arrays', [], []],
    ['empty to filled', [], ['a', 'b', 'c']],
    ['filled to empty', ['a', 'b', 'c'], []],
    ['identical', ['a', 'b', 'a'], ['a', 'b', 'a']],
    ['completely different', ['a', 'b', 'c'], ['x', 'y', 'z', 'w']],
    ['repeated lines', ['a', 'a', 'b', 'a', 'a'], ['a', 'b', 'a', 'b', 'a']],
    ['reordered array', ['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a']],
    ['very different lengths', ['a'], [...Array.from({ length: 50 }, (_, i) => `v${i}`), 'a']],
    ['odd length difference', ['a', 'b', 'c', 'd', 'e'], ['b', 'd']],
    ['even length difference', ['a', 'b', 'c', 'd', 'e', 'f'], ['a', 'x', 'f', 'y']],
  ])('keeps the reference length and rebuilds both sides for %s', (_name, before, after) => {
    const left = normalizeCatalogJson(before).split('\n')
    const right = normalizeCatalogJson(after).split('\n')
    const diff = diffCatalogJson(before, after)

    expect(diff.lines.filter((line) => line.kind === 'same')).toHaveLength(
      referenceLcsLength(left, right)
    )
    expect(diff.removed).toBe(left.length - referenceLcsLength(left, right))
    expect(diff.added).toBe(right.length - referenceLcsLength(left, right))
    expect(diff.lines.filter((line) => line.kind !== 'added').map((line) => line.text)).toEqual(left)
    expect(diff.lines.filter((line) => line.kind !== 'removed').map((line) => line.text)).toEqual(right)
  })

  it('keeps every enclosing field line of a deep change when folding', () => {
    const before = {
      a: 1, b: 2, c: 3, d: 4, e: 5,
      release: { publicInteraction: { referenceLimits: { max: 1 } } },
    }
    const after = {
      ...before,
      release: { publicInteraction: { referenceLimits: { max: 2 } } },
    }
    const diff = diffCatalogJson(before, after)
    const items = foldCatalogJsonDiff(diff.lines)
    const shown = items.flatMap((item) =>
      item.type === 'line' ? [diff.lines[item.index].text] : []
    )

    expect(shown).toContain('  "release": {')
    expect(shown).toContain('    "publicInteraction": {')
    expect(shown).toContain('      "referenceLimits": {')
    expect(shown).not.toContain('  "a": 1,')
    expect(items[1]).toEqual({ type: 'fold', from: 1, to: 5 })
  })
})

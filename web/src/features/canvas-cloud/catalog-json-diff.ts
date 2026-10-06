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

export type CatalogJsonDiffLine = {
  kind: 'same' | 'removed' | 'added'
  text: string
}

export type CatalogJsonDiff = {
  /** null when there is no current content; only the proposed text is shown. */
  lines: CatalogJsonDiffLine[]
  added: number
  removed: number
  hasCurrent: boolean
  proposedText: string
}

export type CatalogJsonDiffItem =
  | { type: 'line'; index: number }
  | { type: 'fold'; from: number; to: number }

function compareFieldNames(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function sortedFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedFields)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareFieldNames)
        .map((key) => [
          key,
          sortedFields((value as Record<string, unknown>)[key]),
        ])
    )
  }
  return value
}

/**
 * Current content comes from PostgreSQL jsonb, which does not keep field order, so both sides
 * are compared and shown with fields sorted by name. Array order is meaningful and kept.
 */
export function normalizeCatalogJson(value: unknown): string {
  return JSON.stringify(sortedFields(value), null, 2)
}

/**
 * Furthest-reaching overlap of the forward and backward Myers searches ("middle snake") for
 * left[aLo, aHi) and right[bLo, bHi). Positions in the result are relative to aLo and bLo.
 */
function middleSnake(
  left: string[],
  aLo: number,
  aHi: number,
  right: string[],
  bLo: number,
  bHi: number,
  forward: Int32Array,
  backward: Int32Array
): { startX: number; startY: number; endX: number; endY: number } {
  const n = aHi - aLo
  const m = bHi - bLo
  const delta = n - m
  const odd = (delta & 1) !== 0
  const max = Math.ceil((n + m) / 2)
  const offset = max + 1
  // The buffers are shared by the whole recursion; only the start of each search needs a value,
  // every other read is of an entry written earlier in this call.
  forward[offset + 1] = 0
  backward[offset + 1] = 0
  for (let d = 0; d <= max; d += 1) {
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d ||
        (k !== d && forward[offset + k - 1] < forward[offset + k + 1])
          ? forward[offset + k + 1]
          : forward[offset + k - 1] + 1
      let y = x - k
      const startX = x
      const startY = y
      while (x < n && y < m && left[aLo + x] === right[bLo + y]) {
        x += 1
        y += 1
      }
      forward[offset + k] = x
      const c = delta - k
      if (odd && c >= -(d - 1) && c <= d - 1 && x + backward[offset + c] >= n) {
        return { startX, startY, endX: x, endY: y }
      }
    }
    for (let c = -d; c <= d; c += 2) {
      let x =
        c === -d ||
        (c !== d && backward[offset + c - 1] < backward[offset + c + 1])
          ? backward[offset + c + 1]
          : backward[offset + c - 1] + 1
      let y = x - c
      const startX = x
      const startY = y
      while (x < n && y < m && left[aHi - 1 - x] === right[bHi - 1 - y]) {
        x += 1
        y += 1
      }
      backward[offset + c] = x
      const k = delta - c
      if (!odd && k >= -d && k <= d && x + forward[offset + k] >= n) {
        return { startX: n - x, startY: m - y, endX: n - startX, endY: m - startY }
      }
    }
  }
  // Unreachable: the searches always meet by d = ceil((n + m) / 2).
  return { startX: 0, startY: 0, endX: 0, endY: 0 }
}

/**
 * Sub-problems up to this many cells use the plain dynamic-programming table. Myers takes about D²
 * steps, so a short side against a long one (D close to the long length) is far faster here; the
 * shorter side then has at most 2048 lines, so lengths fit in 16 bits (at most about 8 MB).
 */
const tableDiffCells = 4_194_304

function tableDiff(
  left: string[],
  aLo: number,
  aHi: number,
  right: string[],
  bLo: number,
  bHi: number,
  out: CatalogJsonDiffLine[]
): void {
  const n = aHi - aLo
  const m = bHi - bLo
  const width = m + 1
  const lengths = new Uint16Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        left[aLo + i] === right[bLo + j]
          ? lengths[(i + 1) * width + j + 1] + 1
          : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && left[aLo + i] === right[bLo + j]) {
      out.push({ kind: 'same', text: left[aLo + i] })
      i += 1
      j += 1
    } else if (
      j >= m ||
      (i < n && lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])
    ) {
      out.push({ kind: 'removed', text: left[aLo + i] })
      i += 1
    } else {
      out.push({ kind: 'added', text: right[bLo + j] })
      j += 1
    }
  }
}

/**
 * Exact longest common subsequence by linear-space Myers (divide at the middle snake):
 * O((n+m)·D) time and O(n+m) memory, where D is the number of changed lines.
 */
function myersDiff(
  left: string[],
  right: string[],
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
  out: CatalogJsonDiffLine[],
  forward: Int32Array,
  backward: Int32Array
): void {
  while (aLo < aHi && bLo < bHi && left[aLo] === right[bLo]) {
    out.push({ kind: 'same', text: left[aLo] })
    aLo += 1
    bLo += 1
  }
  let suffix = 0
  while (
    aHi - suffix > aLo &&
    bHi - suffix > bLo &&
    left[aHi - 1 - suffix] === right[bHi - 1 - suffix]
  ) {
    suffix += 1
  }
  aHi -= suffix
  bHi -= suffix
  if (aLo === aHi || bLo === bHi) {
    for (let x = aLo; x < aHi; x += 1) out.push({ kind: 'removed', text: left[x] })
    for (let y = bLo; y < bHi; y += 1) out.push({ kind: 'added', text: right[y] })
  } else if ((aHi - aLo) * (bHi - bLo) <= tableDiffCells) {
    tableDiff(left, aLo, aHi, right, bLo, bHi, out)
  } else {
    const snake = middleSnake(left, aLo, aHi, right, bLo, bHi, forward, backward)
    myersDiff(left, right, aLo, aLo + snake.startX, bLo, bLo + snake.startY, out, forward, backward)
    for (let x = snake.startX; x < snake.endX; x += 1) {
      out.push({ kind: 'same', text: left[aLo + x] })
    }
    myersDiff(left, right, aLo + snake.endX, aHi, bLo + snake.endY, bHi, out, forward, backward)
  }
  for (let index = 0; index < suffix; index += 1) {
    out.push({ kind: 'same', text: left[aHi + index] })
  }
}

/** Within each run of changed lines, removed lines come before added lines. */
function removedFirst(lines: CatalogJsonDiffLine[]): CatalogJsonDiffLine[] {
  const result: CatalogJsonDiffLine[] = []
  for (let index = 0; index < lines.length; ) {
    if (lines[index].kind === 'same') {
      result.push(lines[index])
      index += 1
      continue
    }
    const run: CatalogJsonDiffLine[] = []
    while (index < lines.length && lines[index].kind !== 'same') {
      run.push(lines[index])
      index += 1
    }
    // Append one by one: spreading a long run into push() exceeds the engine's argument limit.
    for (const line of run) if (line.kind === 'removed') result.push(line)
    for (const line of run) if (line.kind === 'added') result.push(line)
  }
  return result
}

export function diffCatalogJson(
  current: unknown,
  proposed: unknown
): CatalogJsonDiff {
  const proposedText = normalizeCatalogJson(proposed)
  const next = proposedText.split('\n')
  if (current === null || current === undefined) {
    return {
      lines: next.map((text) => ({ kind: 'same', text })),
      added: 0,
      removed: 0,
      hasCurrent: false,
      proposedText,
    }
  }
  const previous = normalizeCatalogJson(current).split('\n')
  let prefix = 0
  while (
    prefix < previous.length &&
    prefix < next.length &&
    previous[prefix] === next[prefix]
  ) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const left = previous.slice(prefix, previous.length - suffix)
  const right = next.slice(prefix, next.length - suffix)
  const raw: CatalogJsonDiffLine[] = []
  // Every sub-problem is smaller, so buffers sized for the whole problem serve all of them.
  const size = 2 * Math.ceil((left.length + right.length) / 2) + 3
  myersDiff(left, right, 0, left.length, 0, right.length, raw, new Int32Array(size), new Int32Array(size))
  const middle = removedFirst(raw)
  const lines: CatalogJsonDiffLine[] = [
    ...next.slice(0, prefix).map((text) => ({ kind: 'same' as const, text })),
    ...middle,
    ...next
      .slice(next.length - suffix)
      .map((text) => ({ kind: 'same' as const, text })),
  ]
  return {
    lines,
    added: lines.filter((line) => line.kind === 'added').length,
    removed: lines.filter((line) => line.kind === 'removed').length,
    hasCurrent: true,
    proposedText,
  }
}

function indentation(text: string): number {
  return text.length - text.trimStart().length
}

function opensContainer(text: string): boolean {
  return /[[{]$/.test(text.trimEnd())
}

/**
 * Lines to show in "changes only" mode: every changed line, `context` lines around it, and the
 * opening line of each enclosing field so a change keeps its path. Other runs fold.
 */
export function foldCatalogJsonDiff(
  lines: CatalogJsonDiffLine[],
  context = 2
): CatalogJsonDiffItem[] {
  // Each line's enclosing opening line, found once with a stack of open containers.
  const parents = new Int32Array(lines.length).fill(-1)
  const open: number[] = []
  lines.forEach((line, index) => {
    const depth = indentation(line.text)
    let top = open.at(-1)
    while (top !== undefined && indentation(lines[top].text) >= depth) {
      open.pop()
      top = open.at(-1)
    }
    parents[index] = top ?? -1
    if (opensContainer(line.text)) open.push(index)
  })
  const visible = Array.from({ length: lines.length }, () => false)
  const ancestorMarked = Array.from({ length: lines.length }, () => false)
  lines.forEach((line, index) => {
    if (line.kind === 'same') return
    for (
      let near = Math.max(0, index - context);
      near <= Math.min(lines.length - 1, index + context);
      near += 1
    ) {
      visible[near] = true
    }
    // Stop at the first parent already marked: its own parents are marked too.
    for (
      let parent = parents[index];
      parent >= 0 && !ancestorMarked[parent];
      parent = parents[parent]
    ) {
      ancestorMarked[parent] = true
      visible[parent] = true
    }
  })
  const items: CatalogJsonDiffItem[] = []
  let index = 0
  while (index < lines.length) {
    if (visible[index]) {
      items.push({ type: 'line', index })
      index += 1
      continue
    }
    const from = index
    while (index < lines.length && !visible[index]) index += 1
    items.push({ type: 'fold', from, to: index - 1 })
  }
  return items
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const webRoot = process.cwd()
const affectedGate = resolve(
  webRoot,
  'scripts/run-affected-gates-in-container.sh'
)
const formatter = resolve(webRoot, 'scripts/format-with-protected-headers.mjs')
const temporaryRoots: string[] = []

function temporaryRoot() {
  const path = mkdtempSync(resolve(tmpdir(), 'new-api-verification-'))
  temporaryRoots.push(path)
  return path
}

afterEach(() => {
  for (const path of temporaryRoots.splice(0)) {
    rmSync(path, { recursive: true, force: true })
  }
})

describe('affected Docker gate arguments', () => {
  it.each([
    ['--test', '--watch', '--file', 'package.json'],
    ['--test', 'missing.test.ts', '--file', 'package.json'],
    ['--test', 'package.json', '--file', '/tmp/outside.ts'],
    ['--test', 'package.json', '--file', 'src'],
  ])('rejects unsafe or non-file paths before running Bun', (...args) => {
    const result = spawnSync('bash', [affectedGate, ...args], {
      cwd: webRoot,
      encoding: 'utf8',
    })
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/must|does not exist/)
  })
})

describe('protected-header formatter', () => {
  it('checks an isolated copy and never changes the source file', () => {
    const testRoot = temporaryRoot()
    copyFileSync(
      resolve(webRoot, '.oxfmtrc.json'),
      resolve(testRoot, '.oxfmtrc.json')
    )
    writeFileSync(resolve(testRoot, '.gitignore'), '')
    const source = resolve(testRoot, 'sample.ts')
    const original = 'const value={answer:42}\n'
    writeFileSync(source, original)

    const result = spawnSync(
      process.execPath,
      [formatter, '--check', 'sample.ts'],
      {
        cwd: testRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${resolve(webRoot, 'node_modules/.bin')}:${process.env.PATH}`,
        },
      }
    )
    expect(result.status).toBe(1)
    expect(readFileSync(source, 'utf8')).toBe(original)
  })

  it('rejects option-shaped and escaping targets without modifying them', () => {
    const testRoot = temporaryRoot()
    copyFileSync(
      resolve(webRoot, '.oxfmtrc.json'),
      resolve(testRoot, '.oxfmtrc.json')
    )
    const optionTarget = resolve(testRoot, '--fix')
    writeFileSync(optionTarget, 'unchanged')
    const outside = resolve(temporaryRoot(), 'outside.ts')
    writeFileSync(outside, 'unchanged')
    symlinkSync(outside, resolve(testRoot, 'outside-link.ts'))

    for (const target of ['--fix', 'outside-link.ts']) {
      const result = spawnSync(
        process.execPath,
        [formatter, '--write', target],
        {
          cwd: testRoot,
          encoding: 'utf8',
        }
      )
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('Invalid format target')
    }
    expect(readFileSync(optionTarget, 'utf8')).toBe('unchanged')
    expect(readFileSync(outside, 'utf8')).toBe('unchanged')
  })
})

describe('verification dependency image', () => {
  it('uses a pinned Bun digest and keys the cache by its Dockerfile', () => {
    const dockerfile = readFileSync(
      resolve(webRoot, 'Dockerfile.verify'),
      'utf8'
    )
    const runner = readFileSync(
      resolve(webRoot, 'scripts/run-docker-gate.sh'),
      'utf8'
    )
    expect(dockerfile).toMatch(/^FROM oven\/bun:1@sha256:[0-9a-f]{64}$/m)
    expect(runner).toContain('"$web_root/Dockerfile.verify"')
    expect(runner).toContain('docker image inspect "$dependency_image"')
  })
})

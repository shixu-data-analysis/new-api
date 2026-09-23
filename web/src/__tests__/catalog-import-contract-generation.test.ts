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
import { spawnSync } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const script = resolve(
  process.cwd(),
  'scripts/generate-canvas-catalog-import-types.mjs'
)
const snapshot = resolve(
  process.cwd(),
  'contracts/canvas-model-catalog-import.openapi.json'
)
const formatter = resolve(
  process.cwd(),
  'scripts/format-with-protected-headers.mjs'
)
const temporaryDirectories: string[] = []

interface ContractFixture {
  paths: Record<
    string,
    { post: { responses: Record<string, { $ref?: string }> } }
  >
  components: {
    schemas: {
      ModelCatalogImportSource: {
        properties: { schemaVersion: { const: number } }
      }
    }
  }
}

async function mutatedInput(
  mutate: (contract: ContractFixture) => void
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'catalog-contract-'))
  temporaryDirectories.push(directory)
  const contract = JSON.parse(
    await readFile(snapshot, 'utf8')
  ) as ContractFixture
  mutate(contract)
  const input = join(directory, 'openapi.json')
  await writeFile(input, `${JSON.stringify(contract)}\n`)
  return input
}

function crossCheck(input: string) {
  return spawnSync(process.execPath, [script, '--check', '--input', input], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
}

describe('catalog import contract generation', () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true }))
    )
  })

  it('runs the formal freshness gate from the committed snapshot alone', () => {
    const result = spawnSync(process.execPath, [script, '--check'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })
    expect(result.status, result.stderr).toBe(0)
  })

  it('keeps generated outputs stable through format check and standalone check', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'catalog-generation-'))
    temporaryDirectories.push(directory)
    await mkdir(join(directory, 'scripts'), { recursive: true })
    await Promise.all([
      copyFile(script, join(directory, 'scripts', 'generate.mjs')),
      copyFile(formatter, join(directory, 'scripts', 'format.mjs')),
      copyFile(
        resolve(process.cwd(), '.oxfmtrc.json'),
        join(directory, '.oxfmtrc.json')
      ),
      copyFile(
        resolve(process.cwd(), '.gitignore'),
        join(directory, '.gitignore')
      ),
      copyFile(snapshot, join(directory, 'openapi.json')),
      symlink(
        resolve(process.cwd(), 'node_modules'),
        join(directory, 'node_modules')
      ),
    ])

    const generate = spawnSync(
      process.execPath,
      [join(directory, 'scripts', 'generate.mjs'), '--input', 'openapi.json'],
      { cwd: directory, encoding: 'utf8' }
    )
    expect(generate.status, generate.stderr).toBe(0)

    const generatedSnapshot = join(
      directory,
      'contracts/canvas-model-catalog-import.openapi.json'
    )
    const generatedTypes = join(
      directory,
      'src/features/canvas-cloud/generated/model-catalog-import.ts'
    )
    const beforeCheck = await Promise.all([
      readFile(generatedSnapshot, 'utf8'),
      readFile(generatedTypes, 'utf8'),
    ])
    const formatCheck = spawnSync(
      process.execPath,
      [
        join(directory, 'scripts', 'format.mjs'),
        '--check',
        'contracts/canvas-model-catalog-import.openapi.json',
        'src/features/canvas-cloud/generated/model-catalog-import.ts',
      ],
      {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${resolve(process.cwd(), 'node_modules/.bin')}:${process.env.PATH}`,
        },
      }
    )
    expect(formatCheck.status, formatCheck.stderr).toBe(0)

    const standaloneCheck = spawnSync(
      process.execPath,
      [join(directory, 'scripts', 'generate.mjs'), '--check'],
      { cwd: directory, encoding: 'utf8' }
    )
    expect(standaloneCheck.status, standaloneCheck.stderr).toBe(0)
    await expect(
      Promise.all([
        readFile(generatedSnapshot, 'utf8'),
        readFile(generatedTypes, 'utf8'),
      ])
    ).resolves.toEqual(beforeCheck)
  })

  it.each([
    [
      'operation path',
      (contract: ContractFixture) => {
        delete contract.paths['/v1/web/admin/model-catalog-imports/plan']
      },
    ],
    [
      'response reference',
      (contract: ContractFixture) => {
        contract.paths[
          '/v1/web/admin/model-catalog-imports/plan'
        ].post.responses['401'].$ref =
          '#/components/responses/BusinessRuleViolation'
      },
    ],
    [
      'recursive schema',
      (contract: ContractFixture) => {
        contract.components.schemas.ModelCatalogImportSource.properties.schemaVersion.const = 2
      },
    ],
  ])('rejects a changed %s', async (_name, mutate) => {
    const result = crossCheck(await mutatedInput(mutate))
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/stale|missing/u)
  })
})

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
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { format } from 'oxfmt'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const defaultAuthoritativeInput = resolve(
  scriptDirectory,
  '../../../.worktrees/canvas-cloud-integration/api/openapi-v1.json'
)
const snapshotPath = resolve(
  scriptDirectory,
  '../contracts/canvas-model-catalog-import.openapi.json'
)
const outputPath = resolve(
  scriptDirectory,
  '../src/features/canvas-cloud/generated/model-catalog-import.ts'
)
const formatterConfigPath = resolve(scriptDirectory, '../.oxfmtrc.json')
const operations = [
  ['/v1/web/admin/model-catalog-imports/plan', 'post'],
  ['/v1/web/admin/model-catalog-imports/{importId}/publications', 'post'],
  ['/internal/v1/model-catalog-imports/plan', 'post'],
  ['/internal/v1/model-catalog-imports/{importId}/publications', 'post'],
]
const requiredSchemas = [
  'ModelCatalogDiagnostic',
  'ModelCatalogImportPlan',
  'ModelCatalogImportPublicationRequest',
  'ModelCatalogImportSource',
  'ModelCatalogPlan',
  'ModelCatalogPublication',
]

function argumentsFrom(argv) {
  let input
  let check = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--check') check = true
    else if (argument === '--input') {
      const value = argv[index + 1]
      if (!value) throw new Error('--input requires an OpenAPI JSON path')
      input = resolve(process.cwd(), value)
      index += 1
    } else throw new Error(`Unknown argument: ${argument}`)
  }
  return { check, input }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)])
  )
}

function canonicalSnapshotText(contract) {
  return `${JSON.stringify(canonical(contract), null, 2)}\n`
}

async function formatText(path, source, formatterConfig) {
  const result = await format(path, source, formatterConfig)
  if (result.errors.length > 0) {
    const details = result.errors.map((error) => error.message).join('; ')
    throw new Error(
      `Cannot format generated catalog contract output: ${details}`
    )
  }
  return result.code
}

async function snapshotText(contract, formatterConfig) {
  return formatText(
    snapshotPath,
    canonicalSnapshotText(contract),
    formatterConfig
  )
}

function componentReference(reference) {
  const match = /^#\/components\/([^/]+)\/(.+)$/u.exec(reference)
  if (!match) {
    throw new Error(`Unsupported external OpenAPI reference: ${reference}`)
  }
  return {
    section: match[1].replaceAll('~1', '/').replaceAll('~0', '~'),
    name: match[2].replaceAll('~1', '/').replaceAll('~0', '~'),
  }
}

function collectReferences(value, found = new Set()) {
  if (!value || typeof value !== 'object') return found
  if (Array.isArray(value)) {
    value.forEach((entry) => collectReferences(entry, found))
    return found
  }
  if (typeof value.$ref === 'string') found.add(value.$ref)
  Object.values(value).forEach((entry) => collectReferences(entry, found))
  return found
}

function extractContract(document) {
  const contract = { snapshotVersion: 1, paths: {}, components: {} }
  for (const [path, method] of operations) {
    const operation = document?.paths?.[path]?.[method]
    if (!operation) {
      throw new Error(
        `OpenAPI operation is missing: ${method.toUpperCase()} ${path}`
      )
    }
    if (!operation.requestBody) {
      throw new Error(
        `OpenAPI operation has no requestBody: ${method.toUpperCase()} ${path}`
      )
    }
    if (!operation.responses || typeof operation.responses !== 'object') {
      throw new Error(
        `OpenAPI operation has no responses: ${method.toUpperCase()} ${path}`
      )
    }
    contract.paths[path] = {
      [method]: {
        parameters: operation.parameters ?? [],
        requestBody: operation.requestBody,
        responses: operation.responses,
      },
    }
  }

  const pending = [...collectReferences(contract.paths)]
  const visited = new Set()
  while (pending.length) {
    const reference = pending.pop()
    if (visited.has(reference)) continue
    visited.add(reference)
    const { section, name } = componentReference(reference)
    const component = document?.components?.[section]?.[name]
    if (!component) {
      throw new Error(`OpenAPI component is missing: ${reference}`)
    }
    contract.components[section] ??= {}
    contract.components[section][name] = component
    for (const nested of collectReferences(component)) {
      if (!visited.has(nested)) pending.push(nested)
    }
  }
  for (const name of requiredSchemas) {
    if (!contract.components.schemas?.[name]) {
      throw new Error(
        `Catalog import contract does not reach required schema: ${name}`
      )
    }
  }
  return canonical(contract)
}

function literal(value) {
  return value === null ? 'null' : JSON.stringify(value)
}

function schemaReferenceName(reference) {
  const { section, name } = componentReference(reference)
  if (section !== 'schemas') {
    throw new Error(`Type generation requires a schema reference: ${reference}`)
  }
  return name
}

function renderObject(schema, level) {
  const properties = schema.properties ?? {}
  const required = new Set(schema.required ?? [])
  const indentation = '  '.repeat(level)
  const childIndentation = '  '.repeat(level + 1)
  const fields = Object.keys(properties).map((key) => {
    const optional = required.has(key) ? '' : '?'
    return `${childIndentation}${JSON.stringify(key)}${optional}: ${renderType(properties[key], level + 1)}`
  })
  let rendered = fields.length
    ? `{\n${fields.join('\n')}\n${indentation}}`
    : 'Record<string, never>'
  if (schema.additionalProperties === true) {
    rendered = fields.length
      ? `${rendered} & Record<string, unknown>`
      : 'Record<string, unknown>'
  } else if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === 'object'
  ) {
    const values = renderType(schema.additionalProperties, level)
    rendered = fields.length
      ? `${rendered} & Record<string, ${values}>`
      : `Record<string, ${values}>`
  }
  return rendered
}

function renderType(schema, level = 0) {
  if (!schema || typeof schema !== 'object') return 'unknown'
  if ('$ref' in schema) return schemaReferenceName(schema.$ref)
  if ('const' in schema) return literal(schema.const)
  if (Array.isArray(schema.enum)) {
    return schema.enum.map(literal).join(' | ') || 'never'
  }
  if (Array.isArray(schema.allOf)) {
    return schema.allOf.map((entry) => renderType(entry, level)).join(' & ')
  }
  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.map((entry) => renderType(entry, level)).join(' | ')
  }
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.map((entry) => renderType(entry, level)).join(' | ')
  }
  if (Array.isArray(schema.type)) {
    return schema.type
      .map((type) => renderType({ ...schema, type }, level))
      .join(' | ')
  }
  if (schema.type === 'array') {
    return `Array<${renderType(schema.items, level)}>`
  }
  if (schema.type === 'null') return 'null'
  if (
    schema.type === 'object' ||
    schema.properties ||
    schema.additionalProperties
  ) {
    return renderObject(schema, level)
  }
  if (schema.type === 'integer' || schema.type === 'number') return 'number'
  if (schema.type === 'string') return 'string'
  if (schema.type === 'boolean') return 'boolean'
  return 'unknown'
}

function generatedTypes(contract) {
  const schemas = contract.components.schemas
  const names = Object.keys(schemas).sort()
  const fingerprint = createHash('sha256')
    .update(canonicalSnapshotText(contract))
    .digest('hex')
  const declarations = names.map(
    (name) => `export type ${name} = ${renderType(schemas[name])}`
  )
  return `/*\nCopyright (C) 2023-2026 QuantumNous\n\nThis program is free software: you can redistribute it and/or modify\nit under the terms of the GNU Affero General Public License as\npublished by the Free Software Foundation, either version 3 of the\nLicense, or (at your option) any later version.\n\nThis program is distributed in the hope that it will be useful,\nbut WITHOUT ANY WARRANTY; without even the implied warranty of\nMERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the\nGNU Affero General Public License for more details.\n\nYou should have received a copy of the GNU Affero General Public License\nalong with this program. If not, see <https://www.gnu.org/licenses/>.\n\nFor commercial licensing, please contact support@quantumnous.com\n*/\n// Generated by scripts/generate-canvas-catalog-import-types.mjs. Do not edit.\n// Catalog import operation and recursive schema SHA-256: ${fingerprint}\n\n${declarations.join('\n\n')}\n`
}

async function formattedGeneratedTypes(contract, formatterConfig) {
  const generated = generatedTypes(contract)
  const headerEnd = generated.indexOf('*/\n') + 3
  const header = generated.slice(0, headerEnd)
  const body = generated.slice(headerEnd).replace(/^\n+/u, '')
  return header + (await formatText(outputPath, body, formatterConfig))
}

function assertGeneratedOutput(generated) {
  if (!generated.startsWith('/*\nCopyright (C) 2023-2026 QuantumNous\n')) {
    throw new Error(
      'Generated output does not have the protected copyright header'
    )
  }
  if (generated.split('\n').some((line) => line.startsWith('+'))) {
    throw new Error('Generated output contains a patch marker prefix')
  }
}

async function readJson(path, purpose) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read ${purpose} at ${path}`, { cause: error })
  }
}

async function main() {
  const { check, input } = argumentsFrom(process.argv.slice(2))
  const formatterConfig = await readJson(
    formatterConfigPath,
    'repository oxfmt configuration'
  )
  if (check) {
    const committedSnapshotSource = await readFile(snapshotPath, 'utf8').catch(
      (error) => {
        throw new Error(
          `Committed catalog import contract snapshot is missing at ${snapshotPath}`,
          { cause: error }
        )
      }
    )
    const committedSnapshot = canonical(
      await readJson(snapshotPath, 'committed catalog import contract snapshot')
    )
    const expectedSnapshot = await snapshotText(
      committedSnapshot,
      formatterConfig
    )
    if (committedSnapshotSource !== expectedSnapshot) {
      throw new Error(
        'Committed catalog import contract snapshot is stale or not repository-formatted. Run yarn canvas:catalog-types.'
      )
    }
    if (input) {
      const authoritative = extractContract(
        await readJson(input, 'authoritative Cloud OpenAPI')
      )
      if (
        (await snapshotText(authoritative, formatterConfig)) !==
        committedSnapshotSource
      ) {
        throw new Error(
          'Catalog import contract snapshot is stale against the authoritative Cloud OpenAPI. Run yarn canvas:catalog-types.'
        )
      }
    }
    const generated = await formattedGeneratedTypes(
      committedSnapshot,
      formatterConfig
    )
    assertGeneratedOutput(generated)
    const committedTypes = await readFile(outputPath, 'utf8').catch((error) => {
      throw new Error(
        `Generated catalog import types are missing at ${outputPath}`,
        {
          cause: error,
        }
      )
    })
    if (committedTypes !== generated) {
      throw new Error(
        'Generated catalog import types are stale against the committed contract snapshot. Run yarn canvas:catalog-types.'
      )
    }
    process.stdout.write(
      input
        ? 'Catalog import snapshot and generated types match the authoritative Cloud OpenAPI.\n'
        : 'Catalog import generated types match the committed contract snapshot.\n'
    )
    return
  }

  const authoritativePath = input ?? defaultAuthoritativeInput
  const contract = extractContract(
    await readJson(authoritativePath, 'authoritative Cloud OpenAPI')
  )
  const snapshot = await snapshotText(contract, formatterConfig)
  const generated = await formattedGeneratedTypes(contract, formatterConfig)
  assertGeneratedOutput(generated)
  await mkdir(dirname(snapshotPath), { recursive: true })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(snapshotPath, snapshot)
  await writeFile(outputPath, generated)
  process.stdout.write(
    `Generated ${snapshotPath} and ${outputPath} from ${authoritativePath}.\n`
  )
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
  process.exitCode = 1
})

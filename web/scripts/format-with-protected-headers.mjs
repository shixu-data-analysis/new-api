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
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'

const mode = process.argv[2]

if (mode !== '--check' && mode !== '--write') {
  console.error(
    'Usage: node scripts/format-with-protected-headers.mjs --check|--write [path ...]'
  )
  process.exit(2)
}

const root = process.cwd()
const requestedPaths = process.argv.slice(3)
const excludedDirs = new Set([
  '.git',
  '.tanstack',
  'build',
  'coverage',
  'dist',
  'node_modules',
])
const headerExtensions = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
])
const protectedHeaderPattern =
  /^\/\*\nCopyright \(C\)[\s\S]*?QuantumNous[\s\S]*?\*\/\n+/

function extensionOf(path) {
  const index = path.lastIndexOf('.')
  return index === -1 ? '' : path.slice(index)
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) {
        walk(join(dir, entry.name), files)
      }
      continue
    }

    if (entry.isFile()) {
      files.push(join(dir, entry.name))
    }
  }

  return files
}

function selectedFiles() {
  if (requestedPaths.length === 0) {
    return walk(root)
  }

  const files = []
  for (const requestedPath of requestedPaths) {
    const absolutePath = resolve(root, requestedPath)
    const realPath = existsSync(absolutePath)
      ? realpathSync(absolutePath)
      : absolutePath
    if (
      requestedPath.startsWith('-') ||
      isAbsolute(requestedPath) ||
      (absolutePath !== root && !absolutePath.startsWith(`${root}/`)) ||
      (realPath !== root && !realPath.startsWith(`${root}/`)) ||
      !existsSync(absolutePath)
    ) {
      console.error(`Invalid format target: ${requestedPath}`)
      process.exit(2)
    }
    if (statSync(absolutePath).isDirectory()) {
      walk(absolutePath, files)
    } else {
      files.push(absolutePath)
    }
  }
  return [...new Set(files)]
}

function stripProtectedHeaders(files) {
  const headers = new Map()

  for (const file of files) {
    if (!headerExtensions.has(extensionOf(file))) {
      continue
    }

    const content = readFileSync(file, 'utf8')
    const match = content.match(protectedHeaderPattern)
    if (!match) {
      continue
    }

    headers.set(file, match[0])
    writeFileSync(file, content.slice(match[0].length))
  }

  return headers
}

function restoreProtectedHeaders(headers) {
  for (const [file, header] of headers) {
    const content = readFileSync(file, 'utf8').replace(/^\n+/, '')
    if (!content.startsWith(header)) {
      writeFileSync(file, header + content)
    }
  }
}

function copyCheckTree(files, checkRoot) {
  for (const file of files) {
    const destination = resolve(checkRoot, relative(root, file))
    mkdirSync(resolve(destination, '..'), { recursive: true })
    copyFileSync(file, destination)
  }
  for (const supportFile of ['.oxfmtrc.json', '.gitignore']) {
    const source = resolve(root, supportFile)
    if (existsSync(source)) {
      copyFileSync(source, resolve(checkRoot, supportFile))
    }
  }
}

function listChangedFiles(files, checkRoot) {
  const changed = []

  for (const file of files) {
    const formatted = readFileSync(resolve(checkRoot, relative(root, file)))
    if (!readFileSync(file).equals(formatted)) {
      changed.push(relative(root, file))
    }
  }

  return changed
}

const files = selectedFiles()
const formatTargets = requestedPaths.length > 0 ? requestedPaths : ['.']
let headers = new Map()
let exitCode = 0
let executionRoot = root
let executionFiles = files
let checkRoot

try {
  if (mode === '--check') {
    checkRoot = mkdtempSync(join(tmpdir(), 'new-api-format-check-'))
    copyCheckTree(files, checkRoot)
    executionRoot = checkRoot
    executionFiles = files.map((file) =>
      resolve(checkRoot, relative(root, file))
    )
  }
  headers = stripProtectedHeaders(executionFiles)
  const result = spawnSync(
    'oxfmt',
    [
      '-c',
      '.oxfmtrc.json',
      '--ignore-path',
      '.gitignore',
      '--write',
      ...formatTargets,
    ],
    {
      cwd: executionRoot,
      stdio: 'inherit',
    }
  )
  exitCode = result.status ?? 1
  restoreProtectedHeaders(headers)

  if (mode === '--check' && exitCode === 0) {
    const changed = listChangedFiles(files, checkRoot)
    if (changed.length > 0) {
      console.error('Format issues found in protected-header-safe check:')
      for (const file of changed) {
        console.error(file)
      }
      exitCode = 1
    }
  }
} finally {
  if (mode === '--write') restoreProtectedHeaders(headers)
  if (checkRoot) rmSync(checkRoot, { recursive: true, force: true })
}

process.exit(exitCode)

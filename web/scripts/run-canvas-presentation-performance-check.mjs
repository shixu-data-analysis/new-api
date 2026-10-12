/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// Compares the customer model center and the agent price cards (500 models each) and the production
// JS size between a baseline Git ref and the working tree: same machine, same fixture, local headless
// Chrome over the DevTools protocol. Limits (MODEL-PRESENTATION-001 design section 5.2): median load
// +10 ms per page, gzip JS +10 KB.
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

import { createRsbuild } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss'

const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const baselineRef = process.argv[2] || 'origin/main'
const chromeBin =
  process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!fs.existsSync(chromeBin)) {
  throw new Error(`Chrome executable not found: ${chromeBin}`)
}

const workDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'canvas-presentation-perf-')
)
const baselineRoot = path.join(workDir, 'baseline')
fs.mkdirSync(baselineRoot)
execFileSync(
  'sh',
  [
    '-c',
    `git archive ${JSON.stringify(baselineRef)} web | tar -x -C ${JSON.stringify(baselineRoot)} --strip-components=1`,
  ],
  { cwd: path.dirname(repository) }
)
fs.symlinkSync(
  path.join(repository, 'node_modules'),
  path.join(baselineRoot, 'node_modules')
)

function harnessSource(root) {
  const presentation = fs.existsSync(
    path.join(root, 'src/features/canvas-cloud/lib/model-icons.ts')
  )
  return `import '@/styles/index.css'
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { AgentModelPriceCards } from '@/features/canvas-cloud/components/AgentModelPriceCards'
import { CustomerModelCenter } from '@/features/canvas-cloud/components/CustomerModelCenter'
${presentation ? "import { ModelIconSprite } from '@/features/canvas-cloud/components/ModelIconSprite'" : ''}
const icons = ['openai', 'gemini', 'google', 'midjourney', 'seedance', 'wan', null]
const colors = ['green', 'blue', 'purple', 'orange', 'cyan', 'gray']
const capabilities = ['image.generate', 'video.generate', 'chat.generate']
const presentationFields = (index) => ({ iconKey: icons[index % icons.length], iconColor: colors[index % colors.length], badges: [{ name: '官渠', color: 'green' }, { name: '推荐', color: 'yellow' }] })
const models = Array.from({ length: 500 }, (_, index) => ({
  id: 'model-' + index, modelKey: 'bench.' + index, effectiveDisplayName: 'Bench model ' + index, catalogDefaultName: 'Bench ' + index,
  catalog: { capability: capabilities[index % 3], description: 'Bench description ' + index }, tags: [{ id: 't' + (index % 4), name: 'Tag ' + (index % 4) }],
  ...presentationFields(index),
  parameterCombinations: [0, 1, 2].map((combination) => ({ id: 'c' + index + '-' + combination, executionTargetId: 't' + index, parameters: { quality: ['1K', '2K', '4K'][combination] }, billingDimensions: {}, billingUnit: 'REQUEST', tokenRates: null, points: String(5 + combination) })),
}))
const prices = models.map((model) => ({
  customerModelId: model.id, modelKey: model.modelKey, effectiveDisplayName: model.effectiveDisplayName, catalogDefaultName: model.catalogDefaultName,
  description: 'Bench description', capability: model.catalog.capability, tags: model.tags, iconKey: model.iconKey, iconColor: model.iconColor, badges: model.badges,
  priceGroups: [{ priceGroupId: 'g1', priceGroupName: 'Standard', prices: [{ combinationKey: 'default', parameters: {}, billingUnit: 'REQUEST', customerPoints: '5', customerTokenRates: null, modelPriceCny: '0.25' }] }],
}))
function Rendered() {
  useEffect(() => { requestAnimationFrame(() => requestAnimationFrame(() => { window.renderedAt = performance.now() })) }, [])
  return null
}
const view = new URLSearchParams(location.search).get('view')
createRoot(document.getElementById('root')).render(<>
  ${presentation ? '<ModelIconSprite />' : ''}
  {view === 'center' ? <CustomerModelCenter models={models} /> : <AgentModelPriceCards models={prices} />}
  <Rendered />
</>)
`
}

async function buildHarness(name, root) {
  const harnessDir = path.join(
    root,
    'node_modules/.cache/canvas-presentation-perf',
    name
  )
  fs.rmSync(harnessDir, { recursive: true, force: true })
  fs.mkdirSync(harnessDir, { recursive: true })
  fs.writeFileSync(path.join(harnessDir, 'harness.tsx'), harnessSource(root))
  fs.writeFileSync(
    path.join(harnessDir, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>'
  )
  const outDir = path.join(workDir, `${name}-harness`)
  const rsbuild = await createRsbuild({
    cwd: root,
    rsbuildConfig: {
      plugins: [pluginReact(), pluginTailwindcss({ optimize: false })],
      source: { entry: { index: path.join(harnessDir, 'harness.tsx') } },
      resolve: { alias: { '@': path.join(root, 'src') } },
      html: { template: path.join(harnessDir, 'index.html') },
      output: { distPath: { root: outDir } },
      logLevel: 'error',
    },
  })
  await rsbuild.build()
  return outDir
}

function serve(directory) {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://x').pathname
    const file = path.join(
      directory,
      pathname === '/' ? '/index.html' : decodeURIComponent(pathname)
    )
    if (
      !file.startsWith(directory) ||
      !fs.existsSync(file) ||
      fs.statSync(file).isDirectory()
    ) {
      response.writeHead(404).end()
      return
    }
    let type = 'text/html'
    if (file.endsWith('.js')) type = 'text/javascript'
    if (file.endsWith('.css')) type = 'text/css'
    response.writeHead(200, { 'content-type': type }).end(fs.readFileSync(file))
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(server))
  )
}

async function measure(directories) {
  const servers = await Promise.all(directories.map(serve))
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'canvas-presentation-chrome-')
  )
  const chrome = spawn(
    chromeBin,
    [
      '--headless=new',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1440,900',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  )
  let socket
  try {
    const browserUrl = await new Promise((resolve, reject) => {
      let output = ''
      chrome.stderr.on('data', (chunk) => {
        output += chunk.toString()
        const match = output.match(/DevTools listening on (ws:\/\/\S+)/)
        if (match) resolve(match[1])
      })
      chrome.once('exit', () =>
        reject(new Error(`Chrome exited before DevTools was ready: ${output}`))
      )
    })
    const port = new URL(browserUrl).port
    const target = await fetch(
      `http://127.0.0.1:${port}/json/new?about:blank`,
      { method: 'PUT' }
    ).then((response) => response.json())
    socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    let nextId = 1
    const pending = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id || !pending.has(message.id)) return
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) reject(new Error(message.error.message))
      else resolve(message.result)
    })
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params }))
      })
    const evaluate = async (expression) =>
      (await send('Runtime.evaluate', { expression, returnByValue: true }))
        .result.value
    async function load(server, view, run) {
      await send('Page.navigate', {
        url: `http://127.0.0.1:${server.address().port}/?view=${view}&run=${run}`,
      })
      let renderedAt = null
      for (
        let attempt = 0;
        attempt < 200 && typeof renderedAt !== 'number';
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        renderedAt = await evaluate('window.renderedAt')
      }
      if (typeof renderedAt !== 'number') {
        throw new Error(`${view} did not render`)
      }
      const cards = await evaluate(
        'document.querySelectorAll(\'[data-slot="card"]\').length'
      )
      if (cards < 500) throw new Error(`${view} rendered ${cards} cards`)
      return renderedAt
    }
    await send('Page.enable')
    await send('Runtime.enable')
    const results = directories.map(() => ({}))
    for (const view of ['center', 'cards']) {
      const samples = directories.map(() => [])
      // Loads alternate between the builds so machine drift affects both alike; the first 3 rounds warm up.
      for (let round = 0; round < 13; round += 1) {
        for (const [index, server] of servers.entries()) {
          const renderedAt = await load(server, view, round)
          if (round >= 3) samples[index].push(renderedAt)
        }
      }
      for (const [index, values] of samples.entries()) {
        values.sort((left, right) => left - right)
        results[index][view] = (values[4] + values[5]) / 2
      }
    }
    return results
  } finally {
    socket?.close()
    chrome.kill('SIGTERM')
    await new Promise((resolve) =>
      chrome.exitCode !== null ? resolve() : chrome.once('exit', resolve)
    )
    for (const server of servers) server.close()
    fs.rmSync(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 100,
    })
  }
}

function productionJsGzip(root, name) {
  const outDir = path.join(workDir, `${name}-dist`)
  // The router plugin resolves its routes from the working directory, so each build runs inside its own root.
  const script = `import { createRsbuild, loadConfig } from '@rsbuild/core'
const { content } = await loadConfig({ cwd: process.cwd(), envMode: 'production' })
const rsbuild = await createRsbuild({ cwd: process.cwd(), rsbuildConfig: { ...content, output: { ...content.output, distPath: { ...content.output?.distPath, root: ${JSON.stringify(outDir)} } }, logLevel: 'error' } })
await rsbuild.build()`
  execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, NODE_ENV: 'production' },
  })
  const files = []
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.js')) files.push(full)
    }
  }
  walk(outDir)
  const sizes = new Map(
    files.map((file) => [
      path.relative(outDir, file).replace(/\.[0-9a-f]{8,}\.js$/u, '.js'),
      gzipSync(fs.readFileSync(file)).length,
    ])
  )
  return {
    total: [...sizes.values()].reduce((sum, size) => sum + size, 0),
    sizes,
  }
}

// PERF_DETAILS=1 lists the chunks whose compressed size changed most.
function printChunkChanges(baseline, candidate) {
  const names = new Set([...baseline.sizes.keys(), ...candidate.sizes.keys()])
  const changes = [...names]
    .map((name) => [
      name,
      (candidate.sizes.get(name) ?? 0) - (baseline.sizes.get(name) ?? 0),
    ])
    .filter(([, delta]) => delta !== 0)
  for (const [name, delta] of changes
    .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
    .slice(0, 15)) {
    console.log(`  ${name}: ${(delta / 1024).toFixed(2)} KB`)
  }
}

try {
  const [baseline, candidate] = await measure([
    await buildHarness('baseline', baselineRoot),
    await buildHarness('candidate', repository),
  ])
  const baselineBuild = productionJsGzip(baselineRoot, 'baseline')
  const candidateBuild = productionJsGzip(repository, 'candidate')
  const baselineBytes = baselineBuild.total
  const candidateBytes = candidateBuild.total
  if (process.env.PERF_DETAILS === '1') {
    printChunkChanges(baselineBuild, candidateBuild)
  }
  const rows = [
    [
      'customer model center median load ms (500 models)',
      baseline.center,
      candidate.center,
      10,
    ],
    [
      'agent price cards median load ms (500 models)',
      baseline.cards,
      candidate.cards,
      10,
    ],
    ['production JS gzip KB', baselineBytes / 1024, candidateBytes / 1024, 10],
  ]
  let failed = false
  for (const [label, before, after, limit] of rows) {
    const pass = after - before <= limit
    failed ||= !pass
    console.log(
      `${pass ? 'PASS' : 'FAIL'} ${label}: baseline ${before.toFixed(2)}, candidate ${after.toFixed(2)}, increase ${(after - before).toFixed(2)} (limit ${limit})`
    )
  }
  if (failed) process.exitCode = 1
} finally {
  fs.rmSync(
    path.join(repository, 'node_modules/.cache/canvas-presentation-perf'),
    { recursive: true, force: true }
  )
  fs.rmSync(workDir, { recursive: true, force: true })
}

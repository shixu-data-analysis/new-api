/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('Canvas static document brand', () => {
  it('uses the Canvas template for the no-JavaScript first response', () => {
    const config = readFileSync(
      resolve(process.cwd(), 'rsbuild.config.ts'),
      'utf8'
    )
    const template = readFileSync(
      resolve(process.cwd(), 'canvas-index.html'),
      'utf8'
    )

    expect(config).toContain("template: './canvas-index.html'")
    expect(config).toContain("favicon: './public/pixmiao-icon.webp'")
    expect(config).toContain("ignore: ['favicon.ico']")
    expect(template).toContain('<title>PixMiao Studio</title>')
    expect(template).toContain('name="title" content="PixMiao Studio"')
    expect(template).toContain('property="og:title" content="PixMiao Studio"')
    expect(template).toContain('name="twitter:title" content="PixMiao Studio"')
    expect(template).toContain('content="/pixmiao-icon.webp"')
    expect(template).not.toContain('href="/favicon.ico"')
    expect(template).not.toContain('rel="icon"')
    expect(template).not.toContain('<title>New API</title>')
  })
})

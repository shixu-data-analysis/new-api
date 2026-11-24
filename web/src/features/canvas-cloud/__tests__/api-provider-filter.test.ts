/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import { listedProviderId, providersOf } from '../api-provider-filter'

describe('providersOf', () => {
  it('lists each provider once, in the order its first row comes', () => {
    const rows = [
      { provider: { id: 'b', name: 'Z5API' } },
      { provider: { id: 'a', name: 'Even' } },
      { provider: { id: 'b', name: 'Z5API' } },
    ]
    expect(providersOf(rows, (row) => row.provider)).toEqual([
      { id: 'b', name: 'Z5API' },
      { id: 'a', name: 'Even' },
    ])
  })
})

describe('listedProviderId', () => {
  it('keeps a chosen provider that still has rows and drops one that has none', () => {
    const providers = [{ id: 'a', name: 'Even' }]
    expect(listedProviderId(providers, 'a')).toBe('a')
    expect(listedProviderId(providers, 'gone')).toBe('')
    expect(listedProviderId(providers, '')).toBe('')
  })
})

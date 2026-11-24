/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import type { DisabledModel, MissingModel } from '../model-availability-api'
import {
  availabilityRows,
  emptyAvailabilityFilters,
  matchesAvailabilityFilters,
} from '../model-availability-rows'

const base = (modelKey: string) => ({
  modelKey,
  displayName: `Name ${modelKey}`,
  upstreamIds: [`up-${modelKey}`],
  providerId: 'p1',
  providerName: 'Even',
  credentialGroupName: null,
  controlVersion: 1,
})
const missing = (key: string): MissingModel => ({
  ...base(key),
  firstMissingAt: '2026-11-24T00:00:00.000Z',
})
const disabled = (
  key: string,
  upstreamStatus: DisabledModel['upstreamStatus'],
  disabledReason: string | null = 'MODEL_DELISTED'
): DisabledModel => ({
  ...base(key),
  disabledReason,
  upstreamStatus,
  lastListedAt: null,
  firstMissingAt: null,
})

describe('availabilityRows', () => {
  it('puts missing models first, then disabled ones the provider lists again', () => {
    const rows = availabilityRows(
      [missing('a')],
      [disabled('b', 'MISSING'), disabled('c', 'AVAILABLE')]
    )
    expect(rows.map((row) => row.model.modelKey)).toEqual(['a', 'c', 'b'])
  })
})

describe('matchesAvailabilityFilters', () => {
  const rows = availabilityRows(
    [missing('a')],
    [disabled('b', 'MISSING', 'QUOTA'), disabled('c', null)]
  )
  const keys = (filters: Partial<typeof emptyAvailabilityFilters>) =>
    rows
      .filter((row) =>
        matchesAvailabilityFilters(row, {
          ...emptyAvailabilityFilters,
          ...filters,
        })
      )
      .map((row) => row.model.modelKey)

  it('reads a missing model as missing upstream and a model never answered as not probed', () => {
    expect(keys({ upstream: 'MISSING' })).toEqual(['a', 'b'])
    expect(keys({ upstream: 'NOT_PROBED' })).toEqual(['c'])
  })

  it('needs every chosen filter, and a reason only matches disabled models', () => {
    expect(keys({ state: 'disabled', reason: 'QUOTA' })).toEqual(['b'])
    expect(keys({ state: 'missing', reason: 'QUOTA' })).toEqual([])
  })

  it('matches the name and the upstream model ID ignoring case and surrounding spaces', () => {
    expect(keys({ model: ' NAME C ' })).toEqual(['c'])
    expect(keys({ upstreamId: 'UP-B' })).toEqual(['b'])
  })
})

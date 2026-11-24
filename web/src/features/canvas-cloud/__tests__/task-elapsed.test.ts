/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'

import { formatElapsed, taskElapsed } from '../task-elapsed'

const acceptedAt = '2026-11-24T10:00:00.000Z'
const at = (seconds: number) =>
  new Date(Date.parse(acceptedAt) + seconds * 1000).toISOString()

describe('taskElapsed', () => {
  it('shows the fastest and slowest result only when they read differently', () => {
    // Under an hour the duration shows seconds, so 41 s and 112 s differ.
    expect(
      taskElapsed(acceptedAt, at(112), [
        { completedAt: at(41) },
        { completedAt: at(112) },
      ])?.range
    ).toEqual({ fastestMs: 41_000, slowestMs: 112_000 })
    // From an hour on it shows minutes: 1 hr 0 min 10 s and 1 hr 0 min 50 s both read 1 hr 0 min.
    expect(
      taskElapsed(acceptedAt, at(3650), [
        { completedAt: at(3610) },
        { completedAt: at(3650) },
      ])?.range
    ).toBeNull()
    expect(
      taskElapsed(acceptedAt, at(3700), [
        { completedAt: at(3610) },
        { completedAt: at(3700) },
      ])?.range
    ).toEqual({ fastestMs: 3_610_000, slowestMs: 3_700_000 })
  })

  it('writes a duration with spaces that do not break', () => {
    const t = ((key: string, values: Record<string, number>) =>
      key.replaceAll(/{{(\w+)}}/g, (_, name: string) =>
        String(values[name])
      )) as unknown as TFunction
    expect(formatElapsed(112_000, t)).toBe('1\u00a0min\u00a052\u00a0s')
    expect(formatElapsed(3_650_000, t)).toBe('1\u00a0hr\u00a00\u00a0min')
  })

  it('is null while the task is unfinished', () => {
    expect(taskElapsed(acceptedAt, null, [{ completedAt: at(5) }])).toBeNull()
  })
})

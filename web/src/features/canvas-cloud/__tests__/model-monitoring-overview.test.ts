/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import {
  monitoringDeterminedCount,
  monitoringRateTone,
} from '../model-monitoring-overview'

describe('model monitoring success-rate color', () => {
  it.each([
    [{ succeeded: 0, failed: 0 }, 'none'],
    [{ succeeded: 1, failed: 0 }, 'good'],
    [{ succeeded: 9, failed: 1 }, 'good'],
    [{ succeeded: 7, failed: 3 }, 'watch'],
    [{ succeeded: 8995, failed: 1005 }, 'watch'],
    [{ succeeded: 6, failed: 4 }, 'bad'],
  ] as const)('uses raw counts for %j, yielding %s', (stats, expected) => {
    expect(monitoringRateTone(stats)).toBe(expected)
    expect(monitoringDeterminedCount(stats)).toBe(
      stats.succeeded + stats.failed
    )
  })
})

/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { describe, expect, it } from 'vitest'

import { executionTargetRouteIdSchema } from '../model-monitoring-route-params'

describe('model monitoring route parameters', () => {
  it('accepts deterministic PostgreSQL UUID target IDs regardless of RFC variant bits', () => {
    expect(
      executionTargetRouteIdSchema.safeParse(
        '74e9e61f-c5a5-76e0-6abc-43e2b807a91b'
      ).success
    ).toBe(true)
  })

  it('still rejects malformed target identifiers', () => {
    expect(
      executionTargetRouteIdSchema.safeParse('not-a-target-id').success
    ).toBe(false)
  })
})

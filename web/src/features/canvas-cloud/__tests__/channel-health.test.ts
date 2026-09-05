import { describe, expect, it } from 'vitest'

import {
  channelControlFormSchema,
  healthTrendPoints,
  validHealthRange,
} from '../channel-health'

describe('channel health policy', () => {
  it('leaves empty and unknown-only intervals as gaps instead of zero success', () => {
    const points = healthTrendPoints({
      from: '2026-09-05T00:00:00Z',
      to: '2026-09-05T03:00:00Z',
      bucketSeconds: 3600,
      failures: [],
      operations: [],
      tasks: [],
      buckets: [
        {
          at: '2026-09-05T00:00:00Z',
          succeeded: 1,
          failed: 1,
          unknown: 0,
          processing: 0,
          sampleCount: 2,
          successRate: 0.5,
          lastSuccessAt: null,
          lastFailureAt: null,
        },
        {
          at: '2026-09-05T02:00:00Z',
          succeeded: 0,
          failed: 0,
          unknown: 2,
          processing: 0,
          sampleCount: 0,
          successRate: null,
          lastSuccessAt: null,
          lastFailureAt: null,
        },
      ],
    })
    expect(points.map((point) => point.successRate)).toEqual([50, null, null])
    expect(points[2].unknown).toBe(2)
  })
  it('rejects reversed or oversized custom ranges and requires explanation for other', () => {
    const start = new Date('2026-09-01T00:00:00Z')
    expect(validHealthRange(start, new Date(+start + 30 * 86400000))).toBe(true)
    expect(validHealthRange(start, new Date(+start + 30 * 86400000 + 1))).toBe(
      false
    )
    expect(validHealthRange(start, start)).toBe(false)
    expect(
      channelControlFormSchema(false).safeParse({
        reasonCode: 'OTHER',
        note: ' ',
      }).success
    ).toBe(false)
    expect(
      channelControlFormSchema(true).safeParse({
        reasonCode: 'NETWORK',
        note: '',
      }).success
    ).toBe(false)
    expect(
      channelControlFormSchema(true).parse({
        reasonCode: 'NETWORK_RESTORED',
        note: '',
      })
    ).toEqual({ reasonCode: 'NETWORK_RESTORED', note: '' })
  })
})

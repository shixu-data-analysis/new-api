/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import {
  monitoringCellTone,
  monitoringRangeFromSearch,
  taskFailureReason,
} from '../model-monitoring-overview'
import type { CanvasAdminTaskLog } from '../types'

const thresholds = { watchRate: 0.1, badRate: 0.3 }
const stats = (failed: number, pending: number, determined: number) => ({
  failed,
  pending,
  determined,
  failureRate: determined ? (failed + pending) / determined : null,
})

describe('model monitoring interval color', () => {
  it.each([
    [stats(0, 0, 0), 'none'],
    [stats(0, 0, 10), 'ok'],
    [stats(1, 0, 11), 'ok'],
    [stats(1, 0, 10), 'watch'],
    [stats(2, 0, 10), 'watch'],
    [stats(3, 0, 10), 'bad'],
    [stats(1, 2, 10), 'pending'],
    [stats(2, 2, 10), 'bad'],
  ] as const)(
    'colors %j as %s with the server thresholds',
    (value, expected) => {
      expect(monitoringCellTone(value, thresholds)).toBe(expected)
    }
  )
})

it('reads the monitoring range from the address and ignores a custom window without both ends', () => {
  expect(monitoringRangeFromSearch({ window: 'hour' })).toEqual({
    window: 'hour',
  })
  expect(
    monitoringRangeFromSearch({
      window: 'custom',
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-02T00:00:00.000Z',
    })
  ).toEqual({
    window: 'custom',
    from: '2026-11-01T00:00:00.000Z',
    to: '2026-11-02T00:00:00.000Z',
  })
  expect(
    monitoringRangeFromSearch({
      window: 'custom',
      from: '2026-11-01T00:00:00.000Z',
    })
  ).toBeUndefined()
  expect(monitoringRangeFromSearch({})).toBeUndefined()
})

// GENERATION-FEEDBACK-001: the recent failed tasks list shows what the customer's node says.
it('tells a failed task by the reason the customer node shows', () => {
  const failed = (
    error: Record<string, unknown>,
    executionStatus = 'CONFIRMED_FAILED'
  ) =>
    ({
      outputSummaries: [
        {
          outputIndex: 0,
          executionStatus,
          billingStatus: 'RELEASED_FAILED',
          error,
        },
      ],
    }) as unknown as CanvasAdminTaskLog
  const reason =
    'reference videos total 14.954s, longer than the 14s output video'
  expect(
    taskFailureReason(
      failed({
        messages: { zhCN: '请求内容不符合该模型的要求。' },
        upstreamReason: reason,
      }),
      'zh-CN'
    )
  ).toBe(reason)
  expect(
    taskFailureReason(
      failed({ messages: { zhCN: '请求内容不符合该模型的要求。' } }),
      'zh-CN'
    )
  ).toBe('请求内容不符合该模型的要求。')
  expect(
    taskFailureReason(failed({ code: 'PROVIDER_TIMEOUT' }), 'zh-CN')
  ).toBeNull()
  expect(taskFailureReason(failed({}, 'UNKNOWN'), 'zh-CN')).toBeNull()
})

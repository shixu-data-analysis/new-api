/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import {
  latestSubmissionByOutput,
  taskOutputOutcomes,
} from '../task-output-outcomes'
import type {
  CanvasAdminOutputRetrievalAttempt,
  CanvasAdminTaskManualResult,
  CanvasAdminTaskRecordOutput,
} from '../types'

const output = (
  outputIndex: number,
  overrides: Partial<CanvasAdminTaskRecordOutput> = {}
): CanvasAdminTaskRecordOutput => ({
  id: `output-${outputIndex}`,
  outputIndex,
  quotedPoints: '9',
  settledPoints: '9',
  executionStatus: 'SUCCEEDED',
  billingStatus: 'SETTLED',
  error: null,
  usageSnapshot: null,
  completedAt: null,
  billingFinalizedAt: null,
  customerSafeErrorDetail: null,
  ...overrides,
})

const attempt = (
  outputIndex: number,
  attemptNumber: number,
  overrides: Partial<CanvasAdminOutputRetrievalAttempt> = {}
): CanvasAdminOutputRetrievalAttempt => ({
  outputIndex,
  attemptNumber,
  reasonCode: 'PROVIDER_OUTPUT_DOWNLOAD_FAILED',
  step: 'DOWNLOAD',
  outcome: 'RETRY_SCHEDULED',
  details: { httpStatus: 403 },
  occurredAt: `2026-11-05T15:3${attemptNumber}:00.000Z`,
  nextRetryAt: null,
  ...overrides,
})

describe('taskOutputOutcomes', () => {
  it('lists only results that did not simply succeed, with the facts each line shows', () => {
    const manual = {
      outputIndex: 3,
      status: 'APPLIED',
    } as CanvasAdminTaskManualResult
    const outcomes = taskOutputOutcomes(
      [
        output(0),
        output(1, {
          executionStatus: 'CONFIRMED_FAILED',
          billingStatus: 'RELEASED_FAILED',
          settledPoints: '0',
          error: { code: 'PROVIDER_OUTPUT_MISSING' },
        }),
        output(2),
        output(3),
        output(4, {
          executionStatus: 'UNKNOWN',
          billingStatus: 'FROZEN',
          settledPoints: null,
        }),
      ],
      [attempt(2, 2), attempt(2, 1, { details: { failure: 'TIMEOUT' } })],
      [manual]
    )
    expect(outcomes.map((outcome) => outcome.outputIndex)).toEqual([1, 2, 3, 4])
    expect(outcomes[0]).toMatchObject({
      errorCode: 'PROVIDER_OUTPUT_MISSING',
      points: '9',
      wholeRequest: false,
      retrieval: null,
    })
    // The attempts are ordered by number, so the last one is attempt 2 whatever order they came in.
    expect(outcomes[1]?.retrieval).toMatchObject({
      step: 'DOWNLOAD',
      failures: 2,
      lastDetails: { httpStatus: 403 },
    })
    expect(outcomes[2]).toMatchObject({ manualResult: true, points: '9' })
    expect(outcomes[3]).toMatchObject({
      executionStatus: 'UNKNOWN',
      points: '9',
    })
  })

  it('tells a fixed-count model result priced with the whole request from a task free in full', () => {
    const missing = {
      executionStatus: 'CONFIRMED_FAILED',
      billingStatus: 'RELEASED_FAILED',
      quotedPoints: '0',
      settledPoints: '0',
    }
    const fixedCount = taskOutputOutcomes(
      [
        output(0, { quotedPoints: '35', settledPoints: '35' }),
        output(1, missing),
      ],
      [],
      []
    )
    expect(fixedCount[0]).toMatchObject({ outputIndex: 1, wholeRequest: true })
    const free = taskOutputOutcomes(
      [
        output(0, { quotedPoints: '0', settledPoints: '0' }),
        output(1, missing),
      ],
      [],
      []
    )
    expect(free[0]).toMatchObject({
      outputIndex: 1,
      wholeRequest: false,
      points: '0',
    })
  })
})

describe('latestSubmissionByOutput', () => {
  it('gives each result to the latest submission that covered it, leaving media preparation out', () => {
    const latest = latestSubmissionByOutput([
      {
        localCallId: 'first',
        callType: 'SUBMIT',
        outputIndices: [0, 1],
        startedAt: '2026-11-05T15:00:00.000Z',
      },
      {
        localCallId: 'prepare',
        callType: 'PREPARE_ASSET',
        outputIndices: [0],
        startedAt: '2026-11-05T15:05:00.000Z',
      },
      {
        localCallId: 'retry',
        callType: 'SUBMIT',
        outputIndices: [1],
        startedAt: '2026-11-05T15:01:00.000Z',
      },
    ])
    expect(Object.fromEntries(latest)).toEqual({ 0: 'first', 1: 'retry' })
  })
})

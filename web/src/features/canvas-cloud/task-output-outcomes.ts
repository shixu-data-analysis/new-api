/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type {
  CanvasAdminOutputRetrievalAttempt,
  CanvasAdminTaskManualResult,
  CanvasAdminTaskRecordOutput,
} from './types'

/**
 * A result that did not simply succeed, as the task details list it under the call it was last submitted in: failed,
 * still open, entered manually, or retrieved only after failed attempts. A call's judgement covers every result it
 * returned, so a result the Provider left out, or one that failed while downloading or storing, shows only here.
 */
export interface TaskOutputOutcome {
  outputIndex: number
  executionStatus: string
  billingStatus: string
  /** The error category Cloud recorded on the result, such as PROVIDER_OUTPUT_MISSING; null without one. */
  errorCode: string | null
  /** Settled points of a settled result, else the points held or given back for it; null when not known. */
  points: string | null
  /**
   * Priced as part of one whole request: a fixed-count model (Cloud requestBatchPricing) quotes the request on its first
   * result and 0 on the others. Any other result quoted 0, such as one share of a small Token total, has points of its own.
   */
  wholeRequest: boolean
  manualResult: boolean
  retrieval: {
    step: CanvasAdminOutputRetrievalAttempt['step']
    failures: number
    lastAt: string
    lastDetails: CanvasAdminOutputRetrievalAttempt['details']
    lastReasonCode: string
  } | null
}

export function taskOutputOutcomes(
  outputs: ReadonlyArray<CanvasAdminTaskRecordOutput>,
  attempts: ReadonlyArray<CanvasAdminOutputRetrievalAttempt>,
  manualResults: ReadonlyArray<CanvasAdminTaskManualResult>,
  requestBatchPricing: boolean
): TaskOutputOutcome[] {
  return outputs.flatMap((output) => {
    const failedAttempts = attempts
      .filter((attempt) => attempt.outputIndex === output.outputIndex)
      .sort((left, right) => left.attemptNumber - right.attemptNumber)
    const last = failedAttempts.at(-1)
    // attempt_number counts every step of a result; the line names the last step, so it counts that step's failures.
    const stepFailures = failedAttempts.filter(
      (attempt) => attempt.step === last?.step
    ).length
    const manualResult = manualResults.some(
      (manual) =>
        manual.outputIndex === output.outputIndex && manual.status === 'APPLIED'
    )
    if (output.executionStatus === 'SUCCEEDED' && !last && !manualResult) {
      return []
    }
    const settled = output.billingStatus === 'SETTLED'
    return [
      {
        outputIndex: output.outputIndex,
        executionStatus: output.executionStatus,
        billingStatus: output.billingStatus,
        errorCode: output.error?.code ?? null,
        points: settled ? output.settledPoints : output.quotedPoints,
        wholeRequest: requestBatchPricing && output.quotedPoints === '0',
        manualResult,
        retrieval: last
          ? {
              step: last.step,
              failures: stepFailures,
              lastAt: last.occurredAt,
              lastDetails: last.details,
              lastReasonCode: last.reasonCode,
            }
          : null,
      },
    ]
  })
}

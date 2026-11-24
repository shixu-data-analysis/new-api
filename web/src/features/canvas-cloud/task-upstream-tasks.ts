/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { CanvasAdminTaskUpstreamTask } from './types'

/**
 * Whether a result confirmed failed was last submitted under this Provider task ID: the ID is then shown in red. Cloud gives
 * each ID the positions whose latest submission received it, so an ID a later submission replaced, with an ID or without
 * one, is not red.
 */
export function upstreamTaskFailed(
  upstreamTask: CanvasAdminTaskUpstreamTask,
  outputs: ReadonlyArray<{ outputIndex: number; executionStatus: string }>
): boolean {
  return outputs.some(
    (output) =>
      output.executionStatus === 'CONFIRMED_FAILED' &&
      upstreamTask.latestOutputIndices.includes(output.outputIndex)
  )
}

/** A long Provider task ID kept to its start and end in a list; the full ID is in its tooltip and what is copied. */
export function shortUpstreamTaskId(upstreamTaskId: string): string {
  if (upstreamTaskId.length <= 16) return upstreamTaskId
  return `${upstreamTaskId.slice(0, 8)}…${upstreamTaskId.slice(-4)}`
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { CanvasAdminTaskUpstreamTask } from './types'

/**
 * Whether a result confirmed failed was last submitted under this Provider task ID: the ID is then shown in red. Cloud lists
 * the IDs by their latest submission, so the last ID covering a result is the one it failed under; an ID a resubmission
 * replaced stays as it is, as the call it was submitted in does.
 */
export function upstreamTaskFailed(
  upstreamTask: CanvasAdminTaskUpstreamTask,
  upstreamTasks: ReadonlyArray<CanvasAdminTaskUpstreamTask>,
  outputs: ReadonlyArray<{ outputIndex: number; executionStatus: string }>
): boolean {
  return outputs.some(
    (output) =>
      output.executionStatus === 'CONFIRMED_FAILED' &&
      [...upstreamTasks]
        .reverse()
        .find((task) => task.outputIndices.includes(output.outputIndex)) ===
        upstreamTask
  )
}

/** A long Provider task ID kept to its start and end in a list; the full ID is in its tooltip and what is copied. */
export function shortUpstreamTaskId(upstreamTaskId: string): string {
  if (upstreamTaskId.length <= 16) return upstreamTaskId
  return `${upstreamTaskId.slice(0, 8)}…${upstreamTaskId.slice(-4)}`
}

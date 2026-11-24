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

/**
 * The Provider task IDs a task shows: those of its submissions, or for a task recorded before its calls were kept its own
 * ID alone, with no result positions (never red).
 */
export function shownUpstreamTasks(task: {
  upstreamTasks: CanvasAdminTaskUpstreamTask[]
  upstreamTaskId: string | null
}): CanvasAdminTaskUpstreamTask[] {
  if (task.upstreamTasks.length > 0 || task.upstreamTaskId === null) {
    return task.upstreamTasks
  }
  return [
    {
      upstreamTaskId: task.upstreamTaskId,
      outputIndices: [],
      latestOutputIndices: [],
    },
  ]
}

/** A long Provider task ID kept to its start and end in a list; the full ID is in its tooltip and what is copied. */
export function shortUpstreamTaskId(upstreamTaskId: string): string {
  if (upstreamTaskId.length <= 16) return upstreamTaskId
  return `${upstreamTaskId.slice(0, 8)}…${upstreamTaskId.slice(-4)}`
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { TFunction } from 'i18next'

/**
 * How long a task took: accepted to completed, and, when its results finished at durations that read differently, the
 * fastest and the slowest result. Null while the task is unfinished.
 */
interface TaskElapsed {
  totalMs: number
  range: { fastestMs: number; slowestMs: number } | null
}

export function taskElapsed(
  acceptedAt: string,
  completedAt: string | null,
  outputs: ReadonlyArray<{ completedAt: string | null }>
): TaskElapsed | null {
  if (!completedAt) return null
  const accepted = Date.parse(acceptedAt)
  const results = outputs.flatMap((output) =>
    output.completedAt ? [Date.parse(output.completedAt) - accepted] : []
  )
  const fastestMs = Math.min(...results)
  const slowestMs = Math.max(...results)
  const distinct =
    results.length > 1 &&
    JSON.stringify(elapsedParts(fastestMs)) !==
      JSON.stringify(elapsedParts(slowestMs))
  return {
    totalMs: Date.parse(completedAt) - accepted,
    range: distinct ? { fastestMs, slowestMs } : null,
  }
}

/** A duration as it is shown: whole seconds, minutes and seconds, or from an hour on hours and minutes. */
function elapsedParts(
  ms: number
):
  | { seconds: number }
  | { minutes: number; seconds: number }
  | { hours: number; minutes: number } {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return { seconds }
  if (seconds < 3600) {
    return { minutes: Math.floor(seconds / 60), seconds: seconds % 60 }
  }
  return {
    hours: Math.floor(seconds / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
  }
}

export function formatElapsed(ms: number, t: TFunction): string {
  const parts = elapsedParts(ms)
  if ('hours' in parts) return t('{{hours}} hr {{minutes}} min', parts)
  if ('minutes' in parts) return t('{{minutes}} min {{seconds}} s', parts)
  return t('{{seconds}} s', parts)
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'

import { getCanvasExecutionOverview } from './execution-api'

// The execution overview carries the attention hints; the execution tab refreshes the same query every 10 seconds.
export const executionOverviewQueryKey = ['canvas-cloud', 'execution'] as const

/** The number of attention hints in force, for the navigation and tab markers. */
export function useExecutionAttentionCount(enabled = true) {
  const overview = useQuery({
    queryKey: executionOverviewQueryKey,
    queryFn: ({ signal }) => getCanvasExecutionOverview(signal),
    enabled,
    refetchInterval: 5 * 60_000,
  })
  return overview.data?.attention.length ?? 0
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'

import { getCanvasExecutorDrain } from './execution-api'

// Under the execution key so the page's own refresh also refreshes the drain row.
export const executorDrainQueryKey = [
  'canvas-cloud',
  'execution',
  'drain',
] as const

/** Shared by the drain row and the tab marker; refreshes every 5 seconds only while draining. */
export function useExecutorDrain() {
  return useQuery({
    queryKey: executorDrainQueryKey,
    queryFn: ({ signal }) => getCanvasExecutorDrain(signal),
    refetchInterval: (query) => (query.state.data?.draining ? 5_000 : false),
  })
}

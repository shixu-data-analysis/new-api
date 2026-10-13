/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import type { ExecutionAttention } from './execution-types'

/** Hint sentences shared by the runtime page and the operation log, so one hint reads the same in both. */
export const attentionMessageKeys: Record<ExecutionAttention['type'], string> =
  {
    OUTPUT_TOO_LARGE:
      '{{count}} tasks in the last 24 hours failed because the result file was too large',
    RETRY_EXHAUSTED:
      '{{count}} tasks in the last 24 hours failed after repeated attempts to fetch the result',
    UNRECOGNIZED_PROVIDER_STATUS:
      '{{count}} tasks in the last 24 hours received a provider status the interface template does not list',
    WAITING_AREA_NEARLY_FULL:
      '{{count}} executor instances are nearly full of tasks waiting for results',
    DATABASE_UNSTABLE:
      '{{count}} executor instances failed to reach the database repeatedly in the last 10 minutes',
  }

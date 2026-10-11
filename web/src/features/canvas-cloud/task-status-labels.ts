/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
/** Labels shared by the task log and the operation log so one status reads the same everywhere. */
export const executionLabels: Record<string, string> = {
  ACCEPTED: 'Accepted',
  PROCESSING: 'Processing',
  SUCCEEDED: 'Succeeded',
  PARTIAL_SUCCESS: 'Partial success',
  CONFIRMED_FAILED: 'Confirmed failed',
  UNKNOWN: 'Result pending confirmation',
}

export const billingLabels: Record<string, string> = {
  FROZEN: 'Frozen',
  SETTLED: 'Settled',
  RELEASED_FAILED: 'Released after failure',
  RELEASED_TIMEOUT: 'Released after timeout',
}

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
/** Translation keys of the task error categories Cloud records (executor error rules and output retrieval reasons). */
export const taskErrorCategoryLabels: Record<string, string> = {
  EXECUTOR_RESOURCE_CONFIRMED_NOT_SENT: 'Executor request confirmed not sent',
  PROVIDER_PREFLIGHT: 'Generation request preparation failed',
  PROVIDER_AUTH_FAILED: 'Provider authentication failed',
  PROVIDER_BALANCE_INSUFFICIENT: 'Provider balance insufficient',
  PROVIDER_ACCESS_DENIED: 'Provider access denied',
  PROVIDER_ENDPOINT_NOT_FOUND: 'Provider endpoint not found',
  PROVIDER_MODEL_UNAVAILABLE: 'Provider model unavailable',
  PROVIDER_REQUEST_TIMEOUT: 'Provider request timed out',
  PROVIDER_RATE_LIMITED: 'Provider rate limited',
  PROVIDER_INTERNAL_ERROR: 'Provider internal error',
  PROVIDER_BAD_GATEWAY: 'Provider bad gateway',
  PROVIDER_UNAVAILABLE: 'Provider unavailable',
  PROVIDER_GATEWAY_TIMEOUT: 'Provider gateway timed out',
  PROVIDER_UNKNOWN_ERROR: 'Unknown provider error',
  PROVIDER_OUTPUT_TOO_LARGE: 'Result file too large',
  PROVIDER_OUTPUT_LOCATION_REJECTED: 'Result address rejected',
  PROVIDER_OUTPUT_DOWNLOAD_FAILED: 'Result download failed',
  PROVIDER_OUTPUT_UNSUPPORTED_MEDIA: 'Result is not usable media',
  PROVIDER_OUTPUT_INVALID: 'Result file invalid',
  PROVIDER_OUTPUT_MISSING: 'Provider returned fewer results than requested',
  PROVIDER_OUTPUT_REQUIRES_RECONCILIATION:
    'Result to be confirmed with the provider',
  OUTPUT_STORAGE_FAILED: 'Result storage failed',
}

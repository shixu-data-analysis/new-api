/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { ErrorCategory } from './execution-types'

/**
 * Translation keys of every error code Cloud records on a task, a result or a provider call: executor error-rule
 * categories, transport and stream failures, output retrieval reasons and administrator confirmations. The one table every
 * page names a code with.
 */
const labels = {
  INVALID_REQUEST: 'Invalid request',
  ADMIN_CONFIRMED_UPSTREAM_FAILED:
    'Administrator confirmed the upstream failure',
  MOCK_CONFIRMED_FAILURE: 'Mock failure',
  EXECUTOR_RESOURCE_DEADLINE_EXPIRED:
    'Executor resource wait reached the deadline',
  PROVIDER_CREDENTIALS: 'Provider credentials unavailable',
  PROVIDER_NETWORK: 'Provider network error',
  PROVIDER_PROVIDER: 'Provider error',
  PROVIDER_SCHEMA: 'Provider response did not match the interface contract',
  PROVIDER_STREAM_INCOMPLETE: 'Provider stream ended early',
  PROVIDER_STREAM_IDLE: 'Provider stream stopped sending',
  PROVIDER_SUBMISSION_OUTCOME_UNKNOWN:
    'Unknown whether the provider accepted the submission',
  PROVIDER_QUERY_UNKNOWN: 'Provider query result unknown',
  PROVIDER_UNKNOWN: 'Provider result unknown',
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
} satisfies Record<ErrorCategory, string> & Record<string, string>

/** Typed by the error-mapping categories, so a category added there without a label fails to compile. */
export const taskErrorCategoryLabels: typeof labels & Record<string, string> =
  labels

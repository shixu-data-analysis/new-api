/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { ErrorCategory, GatewayError } from './execution-types'

type Translate = (key: string, options?: Record<string, unknown>) => string

export type NewApiErrorGroup = {
  id: string
  category: ErrorCategory
  codes: string[]
  /** Status of the middleware errors without a code that belong to this group. */
  uncodedStatus?: number
  hasDescription?: boolean
}

// Mirrors Cloud `src/executor/new-api-errors.ts` in table order. Names and descriptions are
// translation keys chosen by group ID; Cloud returns no fixed-language text.
export const newApiErrorGroups: NewApiErrorGroup[] = [
  {
    id: 'model-config',
    category: 'PROVIDER_MODEL_UNAVAILABLE',
    hasDescription: true,
    codes: [
      'model_not_found',
      'model_price_error',
      'model_mapping_failed',
      'channel:model_mapped_error',
      'invalid_api_type',
      'invalid_api_platform',
      'channel:param_override_invalid',
      'channel:header_override_invalid',
      'channel:invalid_key',
      'channel:aws_client_error',
    ],
  },
  {
    id: 'request-mismatch',
    category: 'PROVIDER_MODEL_UNAVAILABLE',
    uncodedStatus: 400,
    hasDescription: true,
    codes: [
      'invalid_request',
      'invalid_json',
      'invalid_multipart_form',
      'missing_model',
      'invalid_seconds',
      'invalid_size',
      'get_task_request_failed',
      'build_request_failed',
      'bad_request_body',
      'read_request_body_failed',
      'convert_request_failed',
    ],
  },
  {
    id: 'quota',
    category: 'PROVIDER_BALANCE_INSUFFICIENT',
    codes: ['insufficient_user_quota', 'pre_consume_token_quota_failed'],
  },
  {
    id: 'token-invalid',
    category: 'PROVIDER_AUTH_FAILED',
    uncodedStatus: 401,
    hasDescription: true,
    codes: [],
  },
  {
    id: 'access-denied',
    category: 'PROVIDER_ACCESS_DENIED',
    uncodedStatus: 403,
    hasDescription: true,
    codes: ['access_denied'],
  },
  {
    id: 'no-channel',
    category: 'PROVIDER_UNAVAILABLE',
    codes: [
      'get_channel_failed',
      'channel:no_available_key',
      'channel_no_available_key',
    ],
  },
  {
    id: 'rate-limited',
    category: 'PROVIDER_RATE_LIMITED',
    uncodedStatus: 429,
    codes: [],
  },
  {
    id: 'prompt-blocked',
    category: 'INVALID_REQUEST',
    codes: ['sensitive_words_detected', 'prompt_blocked'],
  },
  {
    id: 'upstream-failed',
    category: 'PROVIDER_BAD_GATEWAY',
    hasDescription: true,
    codes: [
      'do_request_failed',
      'read_response_body_failed',
      'unmarshal_response_body_failed',
      'unmarshal_response_failed',
      'invalid_response',
      'bad_response',
      'bad_response_body',
      'empty_response',
      'aws_invoke_error',
    ],
  },
  {
    id: 'internal',
    category: 'PROVIDER_INTERNAL_ERROR',
    uncodedStatus: 500,
    codes: [
      'gen_relay_info_failed',
      'setup_locked_channel_failed',
      'query_data_error',
      'update_data_error',
      'count_token_failed',
      'json_marshal_failed',
    ],
  },
]

export const newApiForwardedCodes = [
  'fail_to_fetch_task',
  'ali_api_error',
  'task_failed',
  'bad_response_status_code',
]

export const newApiErrorGroupNameKey = (groupId: string) =>
  `New API error group ${groupId}`
export const newApiErrorGroupDescriptionKey = (groupId: string) =>
  `New API error group description ${groupId}`

export const newApiRecognitionKeys: Record<GatewayError['kind'], string> = {
  OWN: 'New API recognition own error',
  FORWARDED: 'New API recognition forwarded error',
}

/** The matched mapping of an own New API error that hit the code table. */
export function newApiCodeTableMatch(
  gatewayError: GatewayError,
  httpStatus: number | null | undefined,
  t: Translate
): string {
  return gatewayError.code
    ? t('New API error code {{code}} (system default)', {
        code: gatewayError.code,
      })
    : t('New API, no error code, HTTP {{status}} (system default)', {
        status: httpStatus ?? '—',
      })
}

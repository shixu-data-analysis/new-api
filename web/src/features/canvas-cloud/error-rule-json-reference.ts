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
import type { ErrorRule } from './execution-types'

type EditableErrorRuleField = Exclude<
  keyof ErrorRule,
  'id' | 'source' | 'version'
>
export const errorRuleJsonKeys = [
  'enabled',
  'ruleType',
  'httpStatus',
  'conditions',
  'executionDisposition',
  'category',
  'clientMessages',
  'hideUpstreamReason',
  'adminNote',
] as const satisfies readonly EditableErrorRuleField[]
// Fails to compile when ErrorRule gains an editable field that the JSON editor does not document.
const errorRuleJsonKeysComplete: Exclude<
  EditableErrorRuleField,
  (typeof errorRuleJsonKeys)[number]
> extends never
  ? true
  : never = true
void errorRuleJsonKeysComplete
export const lockedSystemRuleFields = new Set([
  'ruleType',
  'httpStatus',
  'conditions',
  'conditions[].path',
  'conditions[].operator',
  'conditions[].valueType',
  'conditions[].value',
])
export const errorRuleJsonFieldReference: Array<[string, string, string]> = [
  [
    'enabled',
    'Whether the mapping is enabled; disabled mappings do not match.',
    'true / false',
  ],
  [
    'ruleType',
    'How the mapping matches. Set by whether an HTTP status is entered and must agree with httpStatus.',
    'HTTP_STATUS: by status, optionally with conditions; JSON: any status, response content only',
  ],
  [
    'httpStatus',
    'The HTTP status returned by the provider.',
    'An integer from 100 to 599 for HTTP_STATUS; null for JSON',
  ],
  [
    'conditions',
    'Response content conditions; all must match.',
    'An array of up to 20 items; at least one for JSON; empty for system mappings',
  ],
  [
    'conditions[].path',
    'Dot-separated field path in the response JSON.',
    'For example error.code; no array indexes; up to 512 bytes',
  ],
  [
    'conditions[].operator',
    'How to compare.',
    'EQUALS: exactly equal; CONTAINS: contains, STRING only',
  ],
  [
    'conditions[].valueType',
    'The type to compare as. Different types never match, for example the number 404 does not equal the text "404".',
    'STRING / NUMBER / BOOLEAN / NULL',
  ],
  [
    'conditions[].value',
    'The value to compare; it must match valueType.',
    'Text up to 512 bytes; null for NULL',
  ],
  [
    'executionDisposition',
    'The task result judgement, shown as “Task result” in the form.',
    'Omitted: system judgement; CONFIRMED_FAILED: mark failed; UNKNOWN: keep pending confirmation; never success',
  ],
  [
    'category',
    'The Canvas error category, used for statistics and the default customer message.',
    'See the “Error category” list, for example PROVIDER_BAD_GATEWAY',
  ],
  [
    'clientMessages',
    'Customer messages by language; languages left out use the category default.',
    'Keys zhCN, zhTW, en, ja, fr, ru, vi; each up to 1024 bytes',
  ],
  [
    'hideUpstreamReason',
    'Whether customers are kept from seeing the upstream reason when this rule matches, shown as “Hide the upstream reason from customers” in the form.',
    'Omitted or false: show it when the provider shows the upstream reason to customers; true: never show it',
  ],
  [
    'adminNote',
    'The administrator rationale, visible only to administrators and audit records, never to customers.',
    'Optional, up to 2048 bytes; recommended when the task result changes',
  ],
]

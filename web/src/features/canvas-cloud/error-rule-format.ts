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
import type {
  ErrorConditionOperator,
  ErrorConditionValueType,
} from './execution-types'

export type ErrorRuleMatchFacts = {
  httpStatus: number | null
  conditions: Array<{
    path: string
    operator: ErrorConditionOperator
    valueType: ErrorConditionValueType
    value: string | number | boolean | null
  }>
}

type Translate = (key: string) => string

/** One localized sentence for what a rule matches, e.g. `HTTP 502 and error.code = "server_error"`. */
export function formatErrorRuleMatch(
  rule: ErrorRuleMatchFacts,
  t: Translate
): string {
  const parts = [
    ...(rule.httpStatus === null ? [] : [`HTTP ${rule.httpStatus}`]),
    ...rule.conditions.map((condition) => {
      const value =
        condition.valueType === 'STRING'
          ? JSON.stringify(String(condition.value))
          : String(condition.value)
      const operator =
        condition.operator === 'CONTAINS' ? t('Rule operator contains') : '='
      return `${condition.path} ${operator} ${value}`
    }),
  ]
  return parts.join(` ${t('Rule condition and')} `)
}

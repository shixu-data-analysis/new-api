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
import * as z from 'zod'

const POSITIVE_RMB = /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/u
const PERCENT = /^(100(\.0{1,2})?|[1-9]?\d(\.\d{1,2})?)$/u
const rmbMessage = 'Enter a positive number with at most 2 decimals'
const percentMessage = 'Enter a number from 0 to 100 with at most 2 decimals'
const positiveRmb = z
  .string()
  .trim()
  .regex(POSITIVE_RMB, rmbMessage)
  .refine((value) => Number(value) > 0, rmbMessage)
const percent = z.string().trim().regex(PERCENT, percentMessage)

/** Mirrors the Cloud rules: amounts in RMB and rates in percent, each with at most two decimals. */
export const agentSettlementPolicySchema = z
  .object({
    minWithdrawal: positiveRmb,
    maxWithdrawal: positiveRmb,
    taxRatePercent: percent,
    expirySharePercent: percent,
  })
  .refine(
    (value) =>
      !POSITIVE_RMB.test(value.minWithdrawal) ||
      !POSITIVE_RMB.test(value.maxWithdrawal) ||
      Number(value.maxWithdrawal) >= Number(value.minWithdrawal),
    {
      path: ['maxWithdrawal'],
      message:
        'The maximum must not be lower than the minimum withdrawal amount',
    }
  )

export type AgentSettlementPolicyValues = z.infer<
  typeof agentSettlementPolicySchema
>

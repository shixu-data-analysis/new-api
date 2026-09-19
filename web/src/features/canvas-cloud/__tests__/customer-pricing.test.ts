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
import { describe, expect, it } from 'vitest'

import {
  ceilCustomerTokenInput,
  customerPriceFormSchema,
  customerPriceRequest,
} from '../customer-pricing'

const base = {
  priceGroupId: 'group-1',
  billingUnit: 'MILLION_TOKENS' as const,
  points: '0',
  tokenRates: {
    input: '0',
    output: '2.25',
    cacheRead: '0',
    cacheWrite: '0.125',
  },
  targetMarginRate: '0.25',
  successProbability: '0.9',
  successfulTaskCostRmb: '0.5',
  failedUnrecoverableCostRmb: '0',
  otherVariableCostRmb: '0',
  riskBufferRmb: '0.02',
  effectiveAt: '',
  decisionSummary: '',
}

describe('customer pricing billing contract', () => {
  it('keeps four independent token rates and derives the representative input ceiling', () => {
    expect(customerPriceFormSchema.safeParse(base).success).toBe(true)
    expect(customerPriceRequest(base)).toEqual(
      expect.objectContaining({
        billingUnit: 'MILLION_TOKENS',
        points: '0',
        tokenRates: base.tokenRates,
      })
    )

    expect(
      customerPriceRequest({
        ...base,
        tokenRates: { ...base.tokenRates, input: '1.00000001' },
      }).points
    ).toBe('2')
  })

  it('ceil-converts exact decimals without passing through Number', () => {
    expect(ceilCustomerTokenInput('9007199254740993.00000001')).toBe(
      '9007199254740994'
    )
  })

  it('publishes SECOND prices as positive points per second without token rates', () => {
    const request = customerPriceRequest({
      ...base,
      billingUnit: 'SECOND',
      points: '4',
    })
    expect(request).toEqual(
      expect.objectContaining({ billingUnit: 'SECOND', points: '4' })
    )
    expect(request).not.toHaveProperty('tokenRates')
  })

  it('rejects zero scalar REQUEST and SECOND prices', () => {
    for (const billingUnit of ['REQUEST', 'SECOND'] as const) {
      const result = customerPriceFormSchema.safeParse({
        ...base,
        billingUnit,
        points: '0',
      })
      expect(result.success).toBe(false)
      expect(
        result.error?.issues.some((issue) => issue.path[0] === 'points')
      ).toBe(true)
    }
  })
})

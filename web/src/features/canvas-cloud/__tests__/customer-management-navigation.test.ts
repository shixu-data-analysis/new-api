/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { describe, expect, it } from 'vitest'

import { customerChangeSearch } from '../customer-management-navigation'

describe('customerChangeSearch', () => {
  it('drops the agent statistics tab when the administrator returns to the list', () => {
    expect(
      customerChangeSearch(
        { customerId: 'agent-customer', tab: 'agent-statistics' },
        undefined
      )
    ).toEqual({
      customerId: undefined,
      orderId: undefined,
      pointLotId: undefined,
      orderNumber: undefined,
      tab: undefined,
    })
  })

  it("drops the previous customer's order and lot links when another customer opens", () => {
    expect(
      customerChangeSearch(
        { customerId: 'first', orderId: 'order-1', pointLotId: 'lot-1' },
        'second'
      )
    ).toMatchObject({
      customerId: 'second',
      orderId: undefined,
      pointLotId: undefined,
    })
  })

  it('keeps a tab that is not a customer detail tab', () => {
    expect(customerChangeSearch({ tab: 'support' }, 'second').tab).toBe(
      'support'
    )
  })
})

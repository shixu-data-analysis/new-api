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

/** The 客户管理 tab an address shows: 客服会话 or 客户邮件; none is the customer list. */
export type CustomersTab = 'support' | 'mails'

export function customersTabOf(
  tab: string | undefined
): CustomersTab | undefined {
  return tab === 'support' || tab === 'mails' ? tab : undefined
}

/** The customer detail tab an address opens: `tab=agent-statistics` from the customer list's referring agent link. */
export function customerDetailTabOf(
  tab: string | undefined
): 'agent-statistics' | undefined {
  return tab === 'agent-statistics' ? tab : undefined
}

/** The address after the administrator opens another customer or returns to the list. Links into one customer's
 * records (an order, a lot, the agent statistics tab) belong to that customer and are dropped. */
export function customerChangeSearch<
  T extends {
    customerId?: string
    orderId?: string
    pointLotId?: string
    orderNumber?: string
    tab?: string
  },
>(previous: T, customerId: string | undefined): T {
  return {
    ...previous,
    customerId,
    orderId: undefined,
    pointLotId: undefined,
    orderNumber: undefined,
    tab: customerDetailTabOf(previous.tab) ? undefined : previous.tab,
  }
}

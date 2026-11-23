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
    tab: previous.tab === 'agent-statistics' ? undefined : previous.tab,
  }
}

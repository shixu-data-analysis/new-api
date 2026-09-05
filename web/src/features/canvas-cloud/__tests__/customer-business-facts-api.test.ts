/* Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later. */
import { expect, it, vi } from 'vitest'

import { getCanvasCustomerBusinessFacts } from '../api'

const get = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ api: { get } }))
it('uses the scoped GET contract with cancellable pages and exact decimal strings', async () => {
  const signal = new AbortController().signal
  const query = {
    page: 2,
    pageSize: 10,
    sortOrder: 'asc' as const,
    kind: 'cost' as const,
    status: 'CONFIRMED',
    name: 'invoice',
  }
  const data = {
    page: 2,
    pageSize: 10,
    total: 11,
    items: [],
    fact: {
      id: 'fact/a',
      kind: 'task',
      fields: { quotedPoints: '9007199254740993' },
    },
  }
  get.mockResolvedValue({ data })
  expect(
    await getCanvasCustomerBusinessFacts(
      'customer/a',
      query,
      { kind: 'task', id: 'fact/a' },
      signal
    )
  ).toBe(data)
  expect(get).toHaveBeenCalledWith(
    '/canvas-api/v1/web/admin/customers/customer%2Fa/business-facts/task/fact%2Fa',
    { params: query, signal }
  )
  await getCanvasCustomerBusinessFacts('customer/a', query, undefined, signal)
  expect(get).toHaveBeenLastCalledWith(
    '/canvas-api/v1/web/admin/customers/customer%2Fa/business-facts',
    { params: query, signal }
  )
})

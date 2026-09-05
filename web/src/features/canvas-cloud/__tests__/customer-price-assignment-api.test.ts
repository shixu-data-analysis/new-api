/* Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later. */
import { expect, it, vi } from 'vitest'

import {
  assignCanvasCustomerPriceGroup,
  getCanvasCustomerPriceAssignments,
} from '../api'

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: mocks }))
it('uses the existing confirmed assignment DTO and caller-owned idempotency key with scoped cancellable reads', async () => {
  const customerId = '85000000-0000-7000-8000-000000000001'
  const priceGroupId = '85000000-0000-7000-8000-000000000002'
  const path = `/canvas-api/v1/web/admin/customers/${customerId}/price-group-assignments`
  const query = {
    page: 2,
    pageSize: 10,
    group: 'Partner',
    sortOrder: 'asc' as const,
  }
  const signal = new AbortController().signal
  mocks.get.mockResolvedValue({ data: { items: [] } })
  mocks.post.mockResolvedValue({ data: { id: 'assignment' } })
  await getCanvasCustomerPriceAssignments(customerId, query, signal)
  expect(mocks.get).toHaveBeenCalledWith(path, { params: query, signal })
  await assignCanvasCustomerPriceGroup(
    customerId,
    { priceGroupId, reason: 'Reviewed customer plan' },
    'stable-request-key'
  )
  expect(mocks.post).toHaveBeenCalledWith(
    path,
    { priceGroupId, reason: 'Reviewed customer plan', confirmed: true },
    {
      headers: { 'Idempotency-Key': 'stable-request-key' },
      skipErrorHandler: true,
    }
  )
})

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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode, RefObject } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ExecutionCapacityOverview } from '../ExecutionCapacityOverview'

const mocks = vi.hoisted(() => ({
  finalFocus: undefined as RefObject<HTMLElement | null> | undefined,
  onOpenChange: undefined as ((open: boolean) => void) | undefined,
  getCapacity: vi.fn(),
  getWaits: vi.fn(),
  getDetail: vi.fn(),
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({
    children,
    onOpenChange,
  }: {
    children: ReactNode
    onOpenChange?: (open: boolean) => void
  }) => {
    mocks.onOpenChange = onOpenChange
    return children
  },
  SheetContent: ({
    children,
    finalFocus,
  }: {
    children: ReactNode
    finalFocus?: RefObject<HTMLElement | null>
  }) => {
    mocks.finalFocus = finalFocus
    return <div>{children}</div>
  },
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('../../execution-api', () => ({
  getCanvasExecutionCapacity: mocks.getCapacity,
  getCanvasExecutionWaits: mocks.getWaits,
  getCanvasExecutionWaitDetail: mocks.getDetail,
}))

describe('execution detail focus boundary', () => {
  it.each([
    ['AVAILABLE', 'Available capacity'],
    ['REQUEST_CONCURRENCY_FULL', 'Request concurrency full'],
    ['ASYNC_IN_FLIGHT_FULL', 'Asynchronous in-flight full'],
    ['QUERY_CAPACITY_RESERVED', 'Reserving capacity for result queries'],
    ['REQUEST_RATE_LIMITED', 'Request rate limited'],
    ['TOKEN_RATE_LIMITED', 'Token quota limited'],
    ['DATA_INVARIANT', 'Capacity data anomaly'],
    ['MULTIPLE_LIMITS', 'Multiple capacity limits reached'],
    ['EXECUTOR_UNAVAILABLE', 'Executor unavailable'],
    ['FUTURE_STATUS', 'Unknown capacity status'],
  ])('renders capacity status %s safely as %s', async (status, label) => {
    mocks.getCapacity.mockResolvedValue({
      items: [
        {
          credentialGroupId: `group-${status}`,
          providerName: 'Provider One',
          credentialGroupName: 'Primary',
          requestConcurrency: { used: 1, limit: 10 },
          asyncInFlight: { used: 2, limit: 20 },
          waitingTasks: 0,
          status,
        },
      ],
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <ExecutionCapacityOverview />
      </QueryClientProvider>
    )

    expect(await screen.findByText(label)).toBeVisible()
  })

  it('passes the active detail trigger as final focus without resetting group or page', async () => {
    const user = userEvent.setup()
    mocks.getCapacity.mockResolvedValue({
      items: [
        {
          credentialGroupId: 'group-1',
          providerName: 'Provider One',
          credentialGroupName: 'Primary',
          requestConcurrency: { used: 1, limit: 10 },
          asyncInFlight: { used: 2, limit: 20 },
          waitingTasks: 1,
          status: 'AVAILABLE',
        },
      ],
    })
    mocks.getWaits.mockResolvedValue({
      items: [
        {
          taskId: 'task-1',
          modelName: 'Canvas Image',
          credentialGroupId: 'group-1',
          stage: 'SUBMIT',
          blockingStatus: 'REQUEST_CONCURRENCY_FULL',
          observedValue: '10',
          limitValue: '10',
          requestState: 'NOT_SENT',
          startedAt: '2026-09-13T08:00:00Z',
          nextAttemptAt: '2026-09-13T08:01:00Z',
          updatedAt: '2026-09-13T08:00:30Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
    })
    mocks.getDetail.mockResolvedValue({
      taskId: 'task-1',
      modelName: 'Canvas Image',
      credentialGroupId: 'group-1',
      stage: 'SUBMIT',
      blockingStatus: 'REQUEST_CONCURRENCY_FULL',
      observedValue: '10',
      limitValue: '10',
      requestState: 'NOT_SENT',
      startedAt: '2026-09-13T08:00:00Z',
      nextAttemptAt: '2026-09-13T08:01:00Z',
      updatedAt: '2026-09-13T08:00:30Z',
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <ExecutionCapacityOverview />
      </QueryClientProvider>
    )

    await user.click(
      (await screen.findAllByRole('button', { name: 'View waiting tasks' }))[0]
    )
    const trigger = (
      await screen.findAllByRole('button', { name: 'Details' })
    )[0]
    await user.click(trigger)

    expect(mocks.finalFocus?.current).toBe(trigger)
    act(() => mocks.onOpenChange?.(false))
    expect(screen.getAllByText('Canvas Image')[0]).toBeVisible()
    expect(mocks.getWaits).toHaveBeenLastCalledWith(
      { credentialGroupId: 'group-1', page: 1, pageSize: 20 },
      expect.any(AbortSignal)
    )
  })
})

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
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import type { ReactNode, RefObject } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { ExecutionCapacityOverview } from '../ExecutionCapacityOverview'

const mocks = vi.hoisted(() => ({
  finalFocus: undefined as RefObject<HTMLElement | null> | undefined,
  onOpenChange: undefined as ((open: boolean) => void) | undefined,
  getCapacity: vi.fn(),
  getWaits: vi.fn(),
  getDetail: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    search,
    children,
    ...props
  }: {
    search: Record<string, string>
    children: ReactNode
    'aria-label'?: string
  }) => (
    <a
      href={`/canvas-cloud/task-logs?${new URLSearchParams(search).toString()}`}
      aria-label={props['aria-label']}
    >
      {children}
    </a>
  ),
}))

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({
    children,
    open,
    onOpenChange,
  }: {
    children: ReactNode
    open: boolean
    onOpenChange?: (open: boolean) => void
  }) => {
    mocks.onOpenChange = onOpenChange
    return open ? children : null
  },
  SheetContent: ({
    children,
    finalFocus,
  }: {
    children: ReactNode
    finalFocus?: RefObject<HTMLElement | null>
  }) => {
    mocks.finalFocus = finalFocus
    return <div role='dialog'>{children}</div>
  },
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
}))

vi.mock('../../execution-api', () => ({
  getCanvasExecutionCapacity: mocks.getCapacity,
  getCanvasExecutionWaits: mocks.getWaits,
  getCanvasExecutionWaitDetail: mocks.getDetail,
}))

const group = {
  credentialGroupId: 'group-1',
  providerName: 'Provider One',
  credentialGroupName: 'Primary',
  requestConcurrency: { used: 3, limit: 16 },
  asyncInFlight: { used: 30, limit: 30 },
  waitingTasks: 2,
  unqueryableUnconfirmedTasks: 1,
  status: 'ASYNC_IN_FLIGHT_FULL',
  reasons: ['ASYNC_IN_FLIGHT_FULL'],
}
const capacity = (
  items: unknown[],
  unconfirmed = { queryableTasks: 2, unqueryableTasks: 3 }
) => ({
  page: 1,
  pageSize: 20,
  total: items.length,
  providers: [{ id: 'provider-one', name: 'Provider One' }],
  unconfirmed,
  items,
})
const wait = (taskId: string, name: string) => ({
  taskId,
  displayNameSnapshot: name,
  effectiveDisplayName: name,
  catalogDefaultName: name,
  modelKey: `model.${taskId}`,
  upstreamModelId: null,
  waitingOutputs: 2,
  totalOutputs: 4,
  credentialGroupId: 'group-1',
  stage: 'SUBMIT',
  blockingStatus: 'ASYNC_IN_FLIGHT_FULL',
  observedValue: '30',
  limitValue: '30',
  requestState: 'NOT_SENT',
  startedAt: '2026-09-13T08:00:00Z',
  nextAttemptAt: '2026-09-13T08:01:00Z',
  updatedAt: '2026-09-13T08:00:30Z',
})

function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ExecutionCapacityOverview />
    </QueryClientProvider>
  )
}

describe('execution capacity overview', () => {
  beforeAll(() =>
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  )
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
  })

  it('uses the shared table filters and only lets numeric columns be hidden', async () => {
    const user = userEvent.setup()
    mocks.getCapacity.mockResolvedValue(
      capacity([
        { ...group, waitingTasks: 0, status: 'AVAILABLE', reasons: [] },
      ])
    )
    mount()
    await waitFor(() => expect(screen.getByText('Primary')).toBeVisible())
    expect(
      screen.getByText(/even when the group has free capacity, a task may wait/)
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'View' }))
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Simultaneous requests' })
    ).toBeVisible()
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'API provider' })
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('menuitemcheckbox', { name: 'Simultaneous requests' })
    )
    expect(
      screen.queryByRole('columnheader', { name: 'Simultaneous requests' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Column filters' }))
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'API provider' }),
      'provider-one'
    )
    await waitFor(() =>
      expect(mocks.getCapacity).toHaveBeenLastCalledWith(
        expect.objectContaining({
          providerId: 'provider-one',
          page: 1,
          sortBy: 'provider',
          sortOrder: 'asc',
        }),
        expect.any(AbortSignal)
      )
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Waiting tasks' }),
      'WITH_WAITING'
    )
    await user.type(
      screen.getByRole('textbox', { name: 'API Key group' }),
      'prim'
    )
    await waitFor(() =>
      expect(mocks.getCapacity).toHaveBeenLastCalledWith(
        expect.objectContaining({
          providerId: 'provider-one',
          waiting: 'WITH_WAITING',
          credentialGroup: 'prim',
          page: 1,
        }),
        expect.any(AbortSignal)
      )
    )
  })

  it.each([
    ['AVAILABLE', 'Available capacity'],
    ['REQUEST_CONCURRENCY_FULL', 'Simultaneous requests full'],
    ['ASYNC_IN_FLIGHT_FULL', 'In progress at provider full'],
    ['QUERY_CAPACITY_RESERVED', 'Reserving capacity for result queries'],
    ['REQUEST_RATE_LIMITED', 'Request rate limited'],
    ['TOKEN_RATE_LIMITED', 'Token quota limited'],
    ['DATA_INVARIANT', 'Capacity data anomaly'],
    ['MULTIPLE_LIMITS', 'Unknown capacity status'],
    ['EXECUTOR_UNAVAILABLE', 'Executor unavailable'],
    ['FUTURE_STATUS', 'Unknown capacity status'],
  ])('renders capacity status %s safely as %s', async (status, label) => {
    mocks.getCapacity.mockResolvedValue(
      capacity([
        {
          ...group,
          credentialGroupId: `group-${status}`,
          waitingTasks: 0,
          status,
          reasons: undefined,
        },
      ])
    )
    mount()
    expect(await screen.findByText(label)).toBeVisible()
  })

  it('links the unconfirmed-result counts to the task log with the filters that produced them', async () => {
    mocks.getCapacity.mockResolvedValue(
      capacity([group], { queryableTasks: 2, unqueryableTasks: 0 })
    )
    mount()
    const summary = await screen.findByTestId('unconfirmed-summary')
    expect(within(summary).getByRole('link', { name: '2' })).toHaveAttribute(
      'href',
      '/canvas-cloud/task-logs?derivedExecutionStatus=UNKNOWN&billingStatus=FROZEN&upstreamTask=present'
    )
    // A zero is shown without a link.
    expect(within(summary).getAllByRole('link')).toHaveLength(1)
    expect(summary).toHaveTextContent(
      'Results pending confirmation: 2 still being queried at the provider, 0 cannot be queried and are refunded at expiry'
    )
    expect(
      screen.getByRole('link', {
        name: 'Primary: 1 unconfirmed tasks that cannot be queried',
      })
    ).toHaveAttribute(
      'href',
      '/canvas-cloud/task-logs?derivedExecutionStatus=UNKNOWN&billingStatus=FROZEN&upstreamTask=absent&credentialGroupId=group-1'
    )
  })

  it('opens the waiting tasks of a group in a drawer, expands one row at a time and returns focus to its link', async () => {
    const user = userEvent.setup()
    mocks.getCapacity.mockResolvedValue(capacity([group]))
    mocks.getWaits.mockResolvedValue({
      items: [wait('task-1', 'Canvas Image'), wait('task-2', 'Canvas Video')],
      page: 1,
      pageSize: 20,
      total: 2,
    })
    mocks.getDetail.mockImplementation(async (taskId: string) => ({
      ...wait(taskId, taskId === 'task-1' ? 'Canvas Image' : 'Canvas Video'),
      positions: [
        { outputIndex: 0, state: 'SUCCEEDED' },
        { outputIndex: 1, state: 'RUNNING' },
        { outputIndex: 2, state: 'WAITING' },
        { outputIndex: 3, state: 'FAILED' },
      ],
    }))
    mount()

    const trigger = await screen.findByRole('button', {
      name: 'View waiting tasks',
    })
    await user.click(trigger)
    const drawer = await screen.findByRole('dialog')
    expect(
      within(drawer).getByRole('heading', { name: 'Waiting tasks · Primary' })
    ).toBeVisible()
    expect(drawer).toHaveTextContent(
      'Simultaneous requests 3/16 · In progress at the provider 30/30 · Waiting tasks 2'
    )
    expect(mocks.finalFocus?.current).toBe(trigger)
    expect(await within(drawer).findByText('task-1')).toBeVisible()
    expect(within(drawer).getAllByText('2 / 4')).toHaveLength(2)
    expect(
      within(drawer).getAllByText('In progress at provider full (30 / 30)')
    ).toHaveLength(2)

    const rowButton = (index: number) =>
      within(drawer).getAllByRole('button', { name: /^(Details|Collapse)$/ })[
        index
      ]!
    await user.click(rowButton(0))
    expect(rowButton(0)).toHaveAttribute('aria-expanded', 'true')
    expect(rowButton(0)).toHaveTextContent('Collapse')
    const results = await within(drawer).findByRole('list', {
      name: 'Each result',
    })
    expect(
      within(results)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Completed', 'Generating', 'Waiting', 'Failed'])
    expect(within(drawer).getByText('Not sent')).toBeVisible()
    await user.click(rowButton(1))
    // Only one row is expanded at a time.
    expect(rowButton(0)).toHaveAttribute('aria-expanded', 'false')
    expect(rowButton(1)).toHaveAttribute('aria-expanded', 'true')
    await user.click(rowButton(1))
    expect(
      within(drawer).queryByRole('list', { name: 'Each result' })
    ).not.toBeInTheDocument()

    act(() => mocks.onOpenChange?.(false))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.getWaits).toHaveBeenLastCalledWith(
      { credentialGroupId: 'group-1', page: 1, pageSize: 20 },
      expect.any(AbortSignal)
    )
  })
})

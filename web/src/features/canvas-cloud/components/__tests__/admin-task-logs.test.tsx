/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { AdminTaskLogs } from '../AdminTaskLogs'

const apiMocks = vi.hoisted(() => ({
  getCanvasAdminTaskLogs: vi.fn(),
  getCanvasAdminTaskRecord: vi.fn(),
  getCanvasTaskLogOptions: vi.fn(),
  getCanvasTaskPointLedger: vi.fn(),
  getCanvasTaskPointLedgerDetail: vi.fn(),
}))

vi.mock('../../api', () => apiMocks)

// The task-log filters carried in the address, kept in a small store so a navigation re-renders the page.
const routeState = vi.hoisted(() => {
  let search: Record<string, unknown> = {}
  const listeners = new Set<() => void>()
  return {
    get: () => search,
    set: (next: Record<string, unknown>) => {
      search = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
})
vi.mock('@tanstack/react-router', async () => {
  const React = await import('react')
  return {
    getRouteApi: () => ({
      useSearch: () =>
        React.useSyncExternalStore(routeState.subscribe, routeState.get),
      useNavigate:
        () =>
        (options: {
          search: (previous: Record<string, unknown>) => Record<string, unknown>
        }) => {
          routeState.set(
            Object.fromEntries(
              Object.entries(options.search(routeState.get())).filter(
                ([, value]) => value !== undefined
              )
            )
          )
          return Promise.resolve()
        },
    }),
  }
})

const groupId = '86000000-0000-7000-8000-000000000001'
const otherGroupId = '86000000-0000-7000-8000-000000000002'

const task = {
  id: '85000000-0000-7000-8000-000000000001',
  customerId: '85000000-0000-7000-8000-000000000002',
  customerName: 'uatcustomer',
  customerModelId: 'model-1',
  displayNameSnapshot: 'Canvas Image',
  derivedExecutionStatus: 'SUCCEEDED',
  executionSummary: {
    expectedResults: 2,
    recordedResults: 2,
    acceptedResults: 0,
    processingResults: 0,
    succeededResults: 2,
    failedResults: 0,
    unknownResults: 0,
    resultsIncomplete: false,
  },
  settlementProgress: 'COMPLETED',
  customerBillingStatus: 'SETTLED',
  settledPoints: '12',
  outstandingDebtPoints: '3',
  acceptedAt: '2026-09-03T00:00:00.000Z',
  completedAt: '2026-09-03T00:02:00.000Z',
}

const taskDetail = {
  ...task,
  quotedPoints: '20',
  deductedPoints: '12',
  releasedPoints: '8',
  outstandingDebtPoints: '0',
  executionStatus: 'SUCCEEDED',
  customerBillingStatus: 'SETTLED',
  billingUnit: 'POINT',
  billingFinalizedAt: '2026-09-03T00:01:00.000Z',
  parameters: { quality: 'high' },
  outputs: [],
  upstreamTaskId: 'upstream-task-1',
  taskError: null,
  completedAt: '2026-09-03T00:01:00.000Z',
}

function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <AdminTaskLogs />
    </QueryClientProvider>
  )
}

describe('Canvas administrator task records', () => {
  beforeAll(() =>
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  )

  beforeEach(async () => {
    vi.clearAllMocks()
    routeState.set({})
    await i18next.changeLanguage('en')
    apiMocks.getCanvasTaskLogOptions.mockResolvedValue({
      models: [
        {
          customerModelId: 'model-1',
          displayNameSnapshot: 'Historical Canvas Image',
        },
      ],
      credentialGroups: [
        { id: groupId, name: 'Default', providerName: 'HFSY API' },
        { id: otherGroupId, name: 'Default', providerName: 'DKL-image' },
      ],
    })
    apiMocks.getCanvasAdminTaskLogs.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [task],
    })
    apiMocks.getCanvasAdminTaskRecord.mockResolvedValue(taskDetail)
    apiMocks.getCanvasTaskPointLedger.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'ledger-1',
          occurredAt: '2026-09-03T00:01:00.000Z',
          eventType: 'SETTLE',
          eventPoints: '-12',
          pointLotId: 'lot-1',
          lotType: 'PAID',
          taskOutputId: null,
          outputIndex: null,
          debtId: null,
          reason: null,
        },
      ],
    })
    apiMocks.getCanvasTaskPointLedgerDetail.mockResolvedValue({
      id: 'ledger-1',
      occurredAt: '2026-09-03T00:01:00.000Z',
      eventType: 'SETTLE',
      eventPoints: '-12',
      pointLotId: 'lot-1',
      lotType: 'PAID',
      taskOutputId: null,
      outputIndex: null,
      debtId: null,
      reason: null,
      remainingBefore: '20',
      remainingAfter: '8',
      reservedBefore: '12',
      reservedAfter: '0',
    })
  })

  it('uses the global filtered table and only sends populated task filters', async () => {
    const user = userEvent.setup()
    mount()

    expect(await screen.findByText('uatcustomer')).toBeVisible()
    expect(screen.getByText('Settlement complete')).toBeVisible()
    expect(
      screen.queryByText('Settled · Settlement complete')
    ).not.toBeInTheDocument()
    expect(
      screen
        .getAllByText('Settled points')
        .find((element) => element.closest('th'))
        ?.closest('th')
    ).toHaveClass('text-right')
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'Task' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    expect(
      screen.getByRole('textbox', { name: 'Task number' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Customer' })
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Model' })).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Execution status' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Settlement progress' })
    ).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Customer' }), {
      target: { value: 'uatcustomer' },
    })
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminTaskLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({
          customer: 'uatcustomer',
          page: 1,
          pageSize: 20,
          sortBy: 'acceptedAt',
          sortOrder: 'desc',
        }),
        expect.any(AbortSignal)
      )
    )
    await user.click(screen.getByRole('combobox', { name: 'Model' }))
    await user.click(
      await screen.findByRole('option', { name: 'Historical Canvas Image' })
    )
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminTaskLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ modelId: 'model-1' }),
        expect.any(AbortSignal)
      )
    )
    expect(
      screen.queryByRole('button', { name: 'View model identity' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('Outstanding debt: 3')).toBeVisible()
  })

  it('shows sortable accepted and completed times, with a dash while a task is unfinished', async () => {
    apiMocks.getCanvasAdminTaskLogs.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 2,
      items: [
        task,
        {
          ...task,
          id: '85000000-0000-7000-8000-000000000009',
          completedAt: null,
        },
      ],
    })
    mount()

    await screen.findByRole('button', { name: task.id })
    expect(screen.getByRole('button', { name: /Accepted at/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /Completed at/ })).toBeVisible()
    expect(
      screen.getAllByText(new Date(task.acceptedAt).toLocaleString())
    ).toHaveLength(2)
    expect(
      screen.getByText(new Date(task.completedAt).toLocaleString())
    ).toBeVisible()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('opens the task record sheet from its task identifier', async () => {
    mount()

    fireEvent.click(await screen.findByRole('button', { name: task.id }))

    expect(
      await screen.findByText('Task details', { exact: true })
    ).toBeVisible()
    expect(
      screen.queryByText(`Task details · ${task.id}`)
    ).not.toBeInTheDocument()
    expect(await screen.findByText('Execution result')).toBeVisible()
    expect(screen.getByText('Task ID')).toBeVisible()
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminTaskRecord).toHaveBeenCalledWith(
        task.id,
        expect.any(AbortSignal)
      )
    )
  })

  it('keeps the task-number copy control only in the task ID body field', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: task.id }))
    const sheet = await screen.findByRole('dialog')
    expect(
      within(sheet).queryByRole('button', { name: `Copy ${task.id}` })
    ).not.toBeInTheDocument()
    expect(
      await within(sheet).findByRole('button', { name: 'Copy' })
    ).toBeVisible()
  })

  it('applies filters carried in the address and shows them as removable tags', async () => {
    const user = userEvent.setup()
    let releaseOptions!: () => void
    apiMocks.getCanvasTaskLogOptions.mockReturnValue(
      new Promise((resolve) => {
        releaseOptions = () =>
          resolve({
            models: [],
            credentialGroups: [
              { id: groupId, name: 'Default', providerName: 'HFSY API' },
              { id: otherGroupId, name: 'Default', providerName: 'DKL-image' },
            ],
          })
      })
    )
    routeState.set({
      derivedExecutionStatus: 'UNKNOWN',
      upstreamTask: 'absent',
      credentialGroupId: groupId,
    })
    mount()

    await waitFor(() =>
      expect(apiMocks.getCanvasAdminTaskLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({
          derivedExecutionStatus: 'UNKNOWN',
          upstreamTask: 'absent',
          credentialGroupId: groupId,
        }),
        expect.any(AbortSignal)
      )
    )
    const tags = screen.getByRole('list', { name: 'Active filters' })
    // The group is named only once its options are there, never by its ID.
    expect(within(tags).getByText('API Key group: Loading')).toBeVisible()
    expect(tags).not.toHaveTextContent(groupId)
    releaseOptions()
    expect(
      await within(tags).findByText('API Key group: HFSY API · Default')
    ).toBeVisible()
    expect(
      within(tags).getByText('Execution status: Result pending confirmation')
    ).toBeVisible()
    expect(
      within(tags).getByText('Provider task ID: Absent (cannot be queried)')
    ).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /Column filters/ }))
    // A carried value inside "More conditions" opens it.
    expect(
      screen.getByRole('combobox', { name: 'API Key group' })
    ).toHaveTextContent('HFSY API · Default')
    expect(
      screen.getByRole('combobox', { name: 'Provider task ID' })
    ).toHaveTextContent('Absent (cannot be queried)')
    expect(
      screen.getByRole('combobox', { name: 'Failure reason' })
    ).toBeInTheDocument()

    await user.click(
      within(tags).getByRole('button', {
        name: 'Remove filter API Key group: HFSY API · Default',
      })
    )
    expect(routeState.get()).toEqual({
      derivedExecutionStatus: 'UNKNOWN',
      upstreamTask: 'absent',
    })
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminTaskLogs).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ credentialGroupId: groupId }),
        expect.any(AbortSignal)
      )
    )
  })

  it('sends a failure reason and acceptance start from the address, and a typed provider task ID only for a specific ID', async () => {
    const user = userEvent.setup()
    routeState.set({
      failureReason: 'RETRY_EXHAUSTED',
      from: '2026-10-04T12:00:00.000Z',
    })
    mount()

    await waitFor(() =>
      expect(apiMocks.getCanvasAdminTaskLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({
          failureReason: 'RETRY_EXHAUSTED',
          from: '2026-10-04T12:00:00.000Z',
        }),
        expect.any(AbortSignal)
      )
    )
    fireEvent.click(screen.getByRole('button', { name: /Column filters/ }))
    await user.click(screen.getByRole('combobox', { name: 'Provider task ID' }))
    await user.click(await screen.findByRole('option', { name: 'Specific ID' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Specific ID' }), {
      target: { value: 'up-1' },
    })
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminTaskLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ upstreamTaskId: 'up-1' }),
        expect.any(AbortSignal)
      )
    )
    expect(routeState.get()).not.toHaveProperty('upstreamTask')
  })
})

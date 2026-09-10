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

const task = {
  id: '85000000-0000-7000-8000-000000000001',
  customerId: '85000000-0000-7000-8000-000000000002',
  customerName: 'uatcustomer',
  customerModelId: 'model-1',
  modelName: 'Canvas Image',
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
    await i18next.changeLanguage('en')
    apiMocks.getCanvasTaskLogOptions.mockResolvedValue({
      models: [{ id: 'model-1', name: 'Canvas Image' }],
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
      await screen.findByRole('option', { name: 'Canvas Image' })
    )
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminTaskLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ modelId: 'model-1' }),
        expect.any(AbortSignal)
      )
    )
    expect(screen.getByText('Outstanding debt: 3')).toBeVisible()
  })

  it('opens the task record sheet from its task identifier', async () => {
    mount()

    fireEvent.click(await screen.findByRole('button', { name: task.id }))

    expect(
      await screen.findByText('Task details', { exact: false })
    ).toBeVisible()
    expect(await screen.findByText('Outstanding debt')).toBeVisible()
    expect(screen.getByText('0')).toBeVisible()
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminTaskRecord).toHaveBeenCalledWith(
        task.id,
        expect.any(AbortSignal)
      )
    )
  })

  it('removes the task-number copy control while showing a point-ledger detail', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: task.id }))
    const sheet = await screen.findByRole('dialog')
    expect(
      within(sheet).getByRole('button', { name: `Copy ${task.id}` })
    ).toBeVisible()

    fireEvent.click(
      await within(sheet).findByRole('button', { name: 'Point records' })
    )
    fireEvent.click(
      await within(sheet).findByRole('button', { name: 'View ledger' })
    )
    expect(await within(sheet).findByText('Point ledger details')).toBeVisible()
    expect(
      within(sheet).queryByRole('button', { name: `Copy ${task.id}` })
    ).not.toBeInTheDocument()
  })
})

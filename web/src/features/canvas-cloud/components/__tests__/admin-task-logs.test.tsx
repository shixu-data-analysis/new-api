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
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { AdminTaskLogs } from '../AdminTaskLogs'

const apiMocks = vi.hoisted(() => ({ getCanvasAdminTaskLogs: vi.fn() }))
const taskCallMocks = vi.hoisted(() => ({ getCanvasTaskCalls: vi.fn() }))

vi.mock('../../api', () => apiMocks)
vi.mock('../../task-call-api', () => taskCallMocks)

describe('Canvas administrator task logs', () => {
  beforeAll(() =>
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  )

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasAdminTaskLogs.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: '85000000-0000-7000-8000-000000000001',
          customerId: '85000000-0000-7000-8000-000000000002',
          customerName: 'uatcustomer',
          modelName: 'Canvas Image',
          quotedPoints: '20',
          settledPoints: '12',
          outstandingDebtPoints: '0',
          outputSummaries: [
            {
              outputIndex: 0,
              executionStatus: 'SUCCEEDED',
              billingStatus: 'SETTLED',
              quotedPoints: '12',
              settledPoints: '12',
            },
            {
              outputIndex: 1,
              executionStatus: 'CONFIRMED_FAILED',
              billingStatus: 'RELEASED_FAILED',
              quotedPoints: '8',
              settledPoints: '0',
            },
          ],
          executionStatus: 'SUCCEEDED',
          customerBillingStatus: 'SETTLED',
          providerReconcileStatus: 'RECONCILED',
          executionOrigin: 'MOCK',
          upstreamTaskId: 'upstream-task-1',
          acceptedAt: '2026-09-03T00:00:00.000Z',
          completedAt: '2026-09-03T00:01:00.000Z',
        },
      ],
    })
    taskCallMocks.getCanvasTaskCalls.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
  })

  it('uses the shared searchable paginated table for task logs', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <AdminTaskLogs kind='task' />
      </QueryClientProvider>
    )

    expect(await screen.findByText('uatcustomer')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    expect(screen.getByLabelText('Customer')).toBeInTheDocument()
    expect(screen.getByLabelText('Model')).toBeInTheDocument()
    expect(screen.getByLabelText('Execution status')).toBeInTheDocument()
    expect(screen.getByLabelText('Billing status')).toBeInTheDocument()
    expect(screen.getByLabelText('Reconciliation')).toBeInTheDocument()
    expect(screen.getByLabelText('Rows per page')).toHaveTextContent('20')
    expect(screen.getByText('Page 1 of 1')).toBeVisible()

    fireEvent.change(screen.getByLabelText('Customer'), {
      target: { value: 'uatcustomer' },
    })
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'Canvas Image' },
    })
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminTaskLogs).toHaveBeenLastCalledWith(
        'task',
        expect.objectContaining({
          customer: 'uatcustomer',
          model: 'Canvas Image',
          page: 1,
        }),
        expect.any(AbortSignal)
      )
    )
  })

  it('opens task details with settled usage, output states, debt, and its call history', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <AdminTaskLogs kind='task' />
      </QueryClientProvider>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeVisible()
    expect(within(dialog).getByText(/Outstanding points: 0/)).toHaveTextContent(
      'Points used: 12'
    )
    expect(screen.getByText('#1')).toBeVisible()
    expect(screen.getByText('#2')).toBeVisible()
    expect(within(dialog).getByText('Succeeded')).toBeVisible()
    expect(within(dialog).getByText('Confirmed failed')).toBeVisible()
    await waitFor(() =>
      expect(taskCallMocks.getCanvasTaskCalls).toHaveBeenCalledWith(
        '85000000-0000-7000-8000-000000000001',
        { page: 1, pageSize: 20 },
        expect.any(AbortSignal)
      )
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })

  it('shows task debt for text usage above its reservation', async () => {
    apiMocks.getCanvasAdminTaskLogs.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: '85000000-0000-7000-8000-000000000003',
          customerId: '85000000-0000-7000-8000-000000000002',
          customerName: 'uatcustomer',
          modelName: 'Canvas Text',
          quotedPoints: '8',
          settledPoints: '14',
          outstandingDebtPoints: '6',
          executionStatus: 'SUCCEEDED',
          customerBillingStatus: 'SETTLED',
          providerReconcileStatus: 'RECONCILED',
          executionOrigin: 'MOCK',
          upstreamTaskId: null,
          outputSummaries: [
            {
              outputIndex: 0,
              executionStatus: 'SUCCEEDED',
              billingStatus: 'SETTLED',
              quotedPoints: '8',
              settledPoints: '14',
            },
          ],
          acceptedAt: '2026-09-03T00:00:00.000Z',
          completedAt: '2026-09-03T00:01:00.000Z',
        },
      ],
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <AdminTaskLogs kind='task' />
      </QueryClientProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(screen.getByText(/Outstanding points: 6/)).toHaveTextContent(
      'Points used: 14'
    )
  })

  it('shows quoted and settled points as separate usage columns', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <AdminTaskLogs kind='usage' />
      </QueryClientProvider>
    )

    expect(await screen.findByText('uatcustomer')).toBeVisible()
    expect(screen.getByRole('cell', { name: '20' })).toBeVisible()
    expect(screen.getByText('12')).toBeVisible()
    expect(screen.getByText('Quoted points')).toBeVisible()
    expect(screen.getByText('Points used')).toBeVisible()
    await waitFor(() =>
      expect(apiMocks.getCanvasAdminTaskLogs).toHaveBeenLastCalledWith(
        'usage',
        expect.not.objectContaining({
          executionOrigin: expect.anything(),
          executionStatus: expect.anything(),
          reconciliationStatus: expect.anything(),
        }),
        expect.any(AbortSignal)
      )
    )
    expect(screen.queryByLabelText('Execution status')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Reconciliation')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Source')).not.toBeInTheDocument()
  })
})

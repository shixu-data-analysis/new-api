/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { AdminTaskLogs } from '../AdminTaskLogs'

const apiMocks = vi.hoisted(() => ({ getCanvasAdminTaskLogs: vi.fn() }))

vi.mock('../../api', () => apiMocks)

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
})

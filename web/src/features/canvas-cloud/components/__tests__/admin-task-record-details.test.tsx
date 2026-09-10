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
import { useRef } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { AdminTaskRecordDetails } from '../AdminTaskRecordDetails'

const apiMocks = vi.hoisted(() => ({
  getCanvasAdminTaskRecord: vi.fn(),
  getCanvasTaskPointLedger: vi.fn(),
  getCanvasTaskPointLedgerDetail: vi.fn(),
}))
const callMocks = vi.hoisted(() => ({ getCanvasTaskCalls: vi.fn() }))

vi.mock('../../api', () => apiMocks)
vi.mock('../../task-call-api', () => callMocks)

const task = {
  id: 'task-1',
  customerId: 'customer-1',
  customerName: 'UAT customer',
  customerModelId: 'model-1',
  modelName: 'Canvas Image',
  quotedPoints: '20',
  settledPoints: '12',
  deductedPoints: '12',
  releasedPoints: '8',
  outstandingDebtPoints: '0',
  derivedExecutionStatus: 'PARTIAL_SUCCESS',
  executionSummary: {
    expectedResults: 2,
    recordedResults: 2,
    acceptedResults: 0,
    processingResults: 0,
    succeededResults: 1,
    failedResults: 1,
    unknownResults: 0,
    resultsIncomplete: false,
  },
  settlementProgress: 'COMPLETED',
  executionStatus: 'SUCCEEDED',
  customerBillingStatus: 'SETTLED',
  billingUnit: 'MILLION_TOKENS',
  billingFinalizedAt: '2026-09-03T00:01:00.000Z',
  parameters: { quality: 'high' },
  outputs: [
    {
      id: 'output-1',
      outputIndex: 0,
      quotedPoints: '12',
      settledPoints: '12',
      executionStatus: 'SUCCEEDED',
      billingStatus: 'SETTLED',
      error: null,
      usageSnapshot: null,
      completedAt: '2026-09-03T00:01:00.000Z',
      billingFinalizedAt: '2026-09-03T00:01:00.000Z',
    },
    {
      id: 'output-2',
      outputIndex: 1,
      quotedPoints: '8',
      settledPoints: '0',
      executionStatus: 'CONFIRMED_FAILED',
      billingStatus: 'RELEASED_FAILED',
      error: { messages: { en: 'Output failed safely' } },
      usageSnapshot: null,
      completedAt: '2026-09-03T00:01:00.000Z',
      billingFinalizedAt: null,
    },
  ],
  upstreamTaskId: 'upstream-task-1',
  taskError: { code: 'UPSTREAM_ERROR', messages: { en: 'Task failed safely' } },
  acceptedAt: '2026-09-03T00:00:00.000Z',
  completedAt: '2026-09-03T00:01:00.000Z',
}

function mount(onLedgerDetailsChange?: (ledgerId?: string) => void) {
  function Details() {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null)
    return (
      <div ref={scrollContainerRef}>
        <AdminTaskRecordDetails
          taskId='task-1'
          scrollContainerRef={scrollContainerRef}
          onLedgerDetailsChange={onLedgerDetailsChange}
        />
      </div>
    )
  }
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Details />
    </QueryClientProvider>
  )
}

describe('AdminTaskRecordDetails', () => {
  beforeAll(async () => {
    await i18next.init({ lng: 'en', resources: { en } })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.getCanvasAdminTaskRecord.mockResolvedValue(task)
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
          taskOutputId: 'output-1',
          outputIndex: 0,
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
      taskOutputId: 'output-1',
      outputIndex: 0,
      debtId: null,
      reason: null,
      remainingBefore: '20',
      remainingAfter: '8',
      reservedBefore: '12',
      reservedAfter: '0',
    })
    callMocks.getCanvasTaskCalls.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
  })

  it('loads execution calls and point-ledger drill-in only after their disclosure is opened', async () => {
    mount()

    expect(await screen.findByText('Partial success')).toBeVisible()
    expect(screen.getByText('Task failed safely')).toBeVisible()
    expect(callMocks.getCanvasTaskCalls).not.toHaveBeenCalled()
    expect(apiMocks.getCanvasTaskPointLedger).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Execution details' }))
    expect(await screen.findByText('Task failed safely')).toBeVisible()
    expect(screen.getByText('Output failed safely')).toBeVisible()
    expect(screen.getByText('Released after failure')).toBeVisible()
    expect(
      screen.getByText('Released after failure').closest('tr')
    ).toHaveTextContent('0')
    expect(screen.queryByText('Error details')).not.toBeInTheDocument()
    expect(
      screen.getByText('Output failed safely').closest('td')
    ).toHaveTextContent('Confirmed failed')
    expect(
      screen.getByText('Task execution status').parentElement
    ).toHaveTextContent('Succeeded')
    expect(
      screen
        .getAllByText('Settled points')
        .find((element) => element.closest('th'))
        ?.closest('th')
    ).toHaveClass('text-right')
    await waitFor(() =>
      expect(callMocks.getCanvasTaskCalls).toHaveBeenCalledWith(
        'task-1',
        { page: 1, pageSize: 20, callType: 'SUBMIT' },
        expect.any(AbortSignal)
      )
    )

    fireEvent.click(screen.getByRole('button', { name: 'Point records' }))
    expect(
      await screen.findByRole('button', { name: 'View ledger' })
    ).toBeVisible()
    expect(
      screen
        .getAllByText('Released points')
        .find((element) => element.tagName === 'DT')
    ).toBeVisible()
    expect(screen.getByText('Per million tokens')).toBeVisible()
    expect(
      screen.getByText('Point quantity').closest('th')?.querySelector('button')
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View ledger' }))
    expect(await screen.findByText('Lot remaining points')).toBeVisible()
    await waitFor(() =>
      expect(apiMocks.getCanvasTaskPointLedgerDetail).toHaveBeenCalledWith(
        'task-1',
        'ledger-1',
        expect.any(AbortSignal)
      )
    )
  })

  it('shows allowed task specifications with localized labels and drops unknown keys', async () => {
    apiMocks.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      parameters: {
        quality: 'high',
        size: '1024x1024',
        resolution: { apiKey: 'known-key secret must not leak' },
        aspectRatio: '16:9',
        batchSize: 2,
        durationSeconds: 8,
        maxTokens: 128,
        seed: 0,
        generateAudio: false,
        unexpectedInternalKey: 'must not expose its key',
      },
    })
    mount()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Execution details' })
    )

    for (const label of [
      'Quality',
      'Size',
      'Output aspect ratio',
      'Quantity',
      'Duration',
      'Max Tokens',
      'Seed',
      'Generate audio',
    ]) {
      expect(
        screen.getAllByText(label).some((element) => element.tagName === 'DT')
      ).toBe(true)
    }
    expect(screen.queryByText('quality')).not.toBeInTheDocument()
    expect(screen.queryByText('unexpectedInternalKey')).not.toBeInTheDocument()
    expect(
      screen.queryByText('must not expose its key')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/known-key secret must not leak/)
    ).not.toBeInTheDocument()
    expect(screen.getByText('No')).toBeVisible()
  })

  it('shows localized task errors but does not expose a code-only internal error', async () => {
    apiMocks.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      taskError: { code: 'MOCK_CONFIRMED_FAILURE', messages: null },
    })
    const codeOnly = mount()

    expect(await screen.findByText('Partial success')).toBeVisible()
    expect(screen.queryByText('MOCK_CONFIRMED_FAILURE')).not.toBeInTheDocument()
    codeOnly.unmount()

    apiMocks.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      taskError: {
        code: 'INTERNAL_PROVIDER_FAILURE',
        messages: { en: 'Task failed safely' },
      },
    })
    mount()

    expect(await screen.findByText('Task failed safely')).toBeVisible()
    expect(
      screen.queryByText('INTERNAL_PROVIDER_FAILURE')
    ).not.toBeInTheDocument()
  })

  it('replaces the full task view with ledger details and restores the point-records view on return', async () => {
    const onLedgerDetailsChange = vi.fn()
    const view = mount(onLedgerDetailsChange)
    const scrollContainer = view.container.firstElementChild as HTMLDivElement

    await screen.findByText('Partial success')
    fireEvent.click(screen.getByRole('button', { name: 'Point records' }))
    const viewLedger = await screen.findByRole('button', {
      name: 'View ledger',
    })
    scrollContainer.scrollTop = 48
    viewLedger.focus()
    fireEvent.click(viewLedger)

    expect(await screen.findByText('Lot remaining points')).toBeVisible()
    expect(screen.queryByText('UAT customer')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Point records' })
    ).not.toBeInTheDocument()
    expect(onLedgerDetailsChange).toHaveBeenLastCalledWith('ledger-1')

    fireEvent.click(
      screen.getByRole('button', { name: 'Back to task details' })
    )
    const restoredViewLedger = await screen.findByRole('button', {
      name: 'View ledger',
    })
    expect(restoredViewLedger).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Point records' })
    ).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(restoredViewLedger).toHaveFocus())
    expect(scrollContainer.scrollTop).toBe(48)
    expect(onLedgerDetailsChange).toHaveBeenLastCalledWith()
  })

  it('keeps a return action when the point-ledger detail request fails', async () => {
    const onLedgerDetailsChange = vi.fn()
    apiMocks.getCanvasTaskPointLedgerDetail.mockRejectedValueOnce(
      new Error('detail unavailable')
    )
    mount(onLedgerDetailsChange)

    await screen.findByText('Partial success')
    fireEvent.click(screen.getByRole('button', { name: 'Point records' }))
    fireEvent.click(await screen.findByRole('button', { name: 'View ledger' }))

    expect(
      await screen.findByText('Unable to load point ledger details')
    ).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to task details' })
    )

    expect(await screen.findByText('UAT customer')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Point records' })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(onLedgerDetailsChange).toHaveBeenLastCalledWith()
  })

  it('does not render an empty point-records table when its query fails', async () => {
    apiMocks.getCanvasTaskPointLedger.mockRejectedValueOnce(
      new Error('ledger unavailable')
    )
    mount()

    await screen.findByText('Partial success')
    fireEvent.click(screen.getByRole('button', { name: 'Point records' }))

    expect(
      await screen.findByText('Unable to load point records')
    ).toBeVisible()
    expect(screen.queryByText('No point records')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  it('localizes the billing unit and preserves the null placeholder', async () => {
    const localized = mount()
    await screen.findByText('Partial success')
    fireEvent.click(screen.getByRole('button', { name: 'Point records' }))
    expect(await screen.findByText('Per million tokens')).toBeVisible()
    localized.unmount()

    apiMocks.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      billingUnit: null,
    })
    mount()
    await screen.findByText('Partial success')
    fireEvent.click(screen.getByRole('button', { name: 'Point records' }))
    expect(screen.getByText('Billing unit').parentElement).toHaveTextContent(
      'Billing unit—'
    )
  })

  it('uses completion semantics for unfinished and missing completion timestamps', async () => {
    apiMocks.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      executionStatus: 'PROCESSING',
      completedAt: null,
      outputs: [],
    })
    const unfinished = mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Execution details' })
    )
    expect(await screen.findByText('Not completed')).toBeVisible()
    unfinished.unmount()

    apiMocks.getCanvasAdminTaskRecord.mockResolvedValueOnce({
      ...task,
      executionStatus: 'SUCCEEDED',
      completedAt: null,
      outputs: [],
    })
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Execution details' })
    )
    expect(await screen.findByText('Not recorded')).toBeVisible()
  })
})

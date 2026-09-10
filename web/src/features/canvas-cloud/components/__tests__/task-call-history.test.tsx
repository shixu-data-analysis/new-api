/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { TaskCallHistory } from '../TaskCallHistory'

const mocks = vi.hoisted(() => ({ getCanvasTaskCalls: vi.fn() }))
vi.mock('../../task-call-api', () => mocks)

const call = {
  localCallId: 'call-1',
  taskId: 'task-1',
  outputIndices: [0, 2],
  callType: 'SUBMIT',
  submissionId: null,
  attemptCount: 2,
  state: 'RESPONDED',
  executionOrigin: 'MOCK',
  workerId: 'worker-1',
  providerId: 'provider-1',
  channelId: 'channel-1',
  modelId: 'model-1',
  upstreamRequestId: 'req-1',
  upstreamTaskId: 'up-1',
  upstreamIdentifierSources: null,
  httpStatus: 200,
  errorCode: null,
  sanitizedError: null,
  errorRuleId: null,
  errorRuleVersion: null,
  errorCategory: null,
  policyVersions: { global: 1, channel: 1, limits: 1 },
  startedAt: '2026-09-06T00:00:00Z',
  sentAt: null,
  completedAt: '2026-09-06T00:00:01Z',
  deadlineAt: null,
  asyncInFlight: false,
  usage: null,
}

beforeAll(async () => {
  await i18next.init({ lng: 'en', resources: { en } })
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCanvasTaskCalls.mockResolvedValue({
    page: 1,
    pageSize: 20,
    total: 21,
    items: [call],
  })
})

function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TaskCallHistory taskId='task-1' />
    </QueryClientProvider>
  )
}

describe('TaskCallHistory', () => {
  it('loads the safe trace page and requests the next page through the shared table', async () => {
    mount()
    await waitFor(() =>
      expect(mocks.getCanvasTaskCalls).toHaveBeenCalledWith(
        'task-1',
        { page: 1, pageSize: 20, callType: 'SUBMIT' },
        expect.any(AbortSignal)
      )
    )
    expect(await screen.findByText('Page 1 of 2')).toBeVisible()
    const headerRow = screen.getByText('Call time').closest('tr')
    expect(headerRow).not.toBeNull()
    expect(
      [...(headerRow?.querySelectorAll('th') ?? [])].map(
        (header) => header.textContent
      )
    ).toEqual(['Call time', 'Call', 'Related results', 'Response', 'Duration'])
    expect(screen.queryByText('Attempts')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('combobox', { name: 'Call type' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    await waitFor(() =>
      expect(mocks.getCanvasTaskCalls).toHaveBeenLastCalledWith(
        'task-1',
        { page: 2, pageSize: 20, callType: 'SUBMIT' },
        expect.any(AbortSignal)
      )
    )
  })

  it('shows a retry action when the trace endpoint fails', async () => {
    mocks.getCanvasTaskCalls
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ page: 1, pageSize: 20, total: 0, items: [] })
    mount()
    expect(
      await screen.findByText('Unable to load task call history.')
    ).toBeVisible()
    expect(screen.queryByText('No task call history')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(mocks.getCanvasTaskCalls).toHaveBeenCalledTimes(2)
    )
  })

  it('debounces numeric filters and omits an invalid value from the call query', async () => {
    mount()
    await screen.findByText('Page 1 of 2')
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Output index' }), {
      target: { value: '3' },
    })
    await waitFor(() =>
      expect(mocks.getCanvasTaskCalls).toHaveBeenLastCalledWith(
        'task-1',
        { page: 1, pageSize: 20, callType: 'SUBMIT', outputIndex: 3 },
        expect.any(AbortSignal)
      )
    )
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Output index' }), {
      target: { value: '-1' },
    })
    await waitFor(() =>
      expect(mocks.getCanvasTaskCalls).toHaveBeenLastCalledWith(
        'task-1',
        { page: 1, pageSize: 20, callType: 'SUBMIT' },
        expect.any(AbortSignal)
      )
    )
  })

  it('renders failed submission evidence without hiding output positions or sanitized details', async () => {
    mocks.getCanvasTaskCalls.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          ...call,
          callType: 'SUBMIT',
          executionOrigin: 'REAL',
          outputIndices: [1],
          upstreamRequestId: null,
          upstreamTaskId: 'upstream-retry-1',
          httpStatus: 429,
          errorCode: 'RATE_LIMIT',
          errorRuleId: 'provider.rate-limit',
          errorRuleVersion: 3,
          errorCategory: 'PROVIDER_RATE_LIMITED',
          sanitizedError: 'Retry after 30 seconds',
        },
      ],
    })
    mount()

    expect(await screen.findByText('Provider submission')).toBeVisible()
    expect(screen.getByText('Responded')).toBeVisible()
    expect(screen.queryByText('Attempts')).not.toBeInTheDocument()
    expect(screen.getByText('Result 2')).toBeVisible()
    expect(screen.getByText('429')).toBeVisible()
    expect(
      screen.getByRole('cell', {
        name: /Provider rate limited.*Retry after 30 seconds/,
      })
    ).toBeVisible()
    expect(screen.queryByText(/RATE_LIMIT/)).not.toBeInTheDocument()
    expect(screen.getByText('call-1')).toBeVisible()
    expect(screen.getByText('upstream-retry-1')).toBeVisible()
  })
})

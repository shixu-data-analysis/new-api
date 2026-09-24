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

import { CallDetails, TaskCallHistory } from '../TaskCallHistory'
import type { CanvasTaskCall } from '../../task-call-api'

const mocks = vi.hoisted(() => ({ getCanvasTaskCalls: vi.fn() }))
vi.mock('../../task-call-api', () => mocks)

const call: CanvasTaskCall = {
  localCallId: 'call-1',
  outputIndices: [0, 2],
  callType: 'SUBMIT',
  attemptCount: 2,
  chainState: 'RESPONDED',
  providerName: 'Mock provider',
  channelCode: 'mock-channel',
  channelVersion: 1,
  upstreamModelId: 'mock-model',
  credentialGroupName: 'Mock credentials',
  credentialGroupVersion: 1,
  workerId: 'worker-1',
  upstreamRequestId: 'req-1',
  upstreamTaskId: 'up-1',
  initialHttpStatus: 200,
  finalHttpStatus: 200,
  durationMs: 1000,
  errorCode: null,
  sanitizedError: null,
  errorRuleId: null,
  errorRuleVersion: null,
  providerResponseDiagnostic: null,
  sanitizedRequest: null,
  startedAt: '2026-09-06T00:00:00Z',
  sentAt: '2026-09-06T00:00:00Z',
  finalRespondedAt: '2026-09-06T00:00:01Z',
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

function mountDetails(details: typeof call) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CallDetails
        call={details}
        inputAssets={[]}
        openingInput={null}
        onOpenInput={() => undefined}
      />
    </QueryClientProvider>
  )
}

describe('TaskCallHistory', () => {
  it('loads the safe trace page and requests the next page through the shared table', async () => {
    mount()
    await waitFor(() =>
      expect(mocks.getCanvasTaskCalls).toHaveBeenCalledWith(
        'task-1',
        { page: 1, pageSize: 20 },
        expect.any(AbortSignal)
      )
    )
    expect(await screen.findByText('Page 1 of 2')).toBeVisible()
    const headerRow = screen.getByText('Call started at').closest('tr')
    expect(headerRow).not.toBeNull()
    expect(
      [...(headerRow?.querySelectorAll('th') ?? [])].map(
        (header) => header.textContent
      )
    ).toEqual([
      'Call started at',
      'Type',
      'Related object',
      'Provider / channel',
      'Call status',
      'Response',
      'Duration',
      'Actions',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    await waitFor(() =>
      expect(mocks.getCanvasTaskCalls).toHaveBeenLastCalledWith(
        'task-1',
        { page: 2, pageSize: 20 },
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
      await screen.findByText('Unable to load provider calls')
    ).toBeVisible()
    expect(screen.getByText('No provider calls')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(mocks.getCanvasTaskCalls).toHaveBeenCalledTimes(2)
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
          outputIndices: [1],
          upstreamRequestId: null,
          upstreamTaskId: 'upstream-retry-1',
          initialHttpStatus: 429,
          finalHttpStatus: 429,
          errorCode: 'RATE_LIMIT',
          errorRuleId: 'provider.rate-limit',
          errorRuleVersion: 3,
          sanitizedError: 'Retry after 30 seconds',
        },
      ],
    })
    mountDetails({
      ...call,
      outputIndices: [1],
      upstreamRequestId: null,
      upstreamTaskId: 'upstream-retry-1',
      initialHttpStatus: 429,
      finalHttpStatus: 429,
      errorCode: 'RATE_LIMIT',
      errorRuleId: 'provider.rate-limit',
      errorRuleVersion: 3,
      sanitizedError: 'Retry after 30 seconds',
    })
    expect(screen.getByText('Retry after 30 seconds')).toBeVisible()
    expect(screen.getByText('RATE_LIMIT')).toBeVisible()
    expect(screen.getByText('upstream-retry-1')).toBeVisible()
  })

  it('shows persisted schema diagnostics after a later non-2xx response without exposing a response body', async () => {
    mountDetails({
      ...call,
      finalHttpStatus: 500,
      providerResponseDiagnostic: {
        contentType: 'application/json; charset=utf-8',
        schema: {
          field: '/data/taskId',
          rule: 'required',
          detail: 'Provider response violated a frozen OpenAPI Schema rule',
        },
        summary: {
          kind: 'object',
          byteLength: 48,
          declaredByteLength: 512,
          fields: ['data'],
        },
      },
    })
    expect(screen.getByText('Provider response schema diagnostic')).toBeVisible()
    expect(screen.getByText('application/json; charset=utf-8')).toBeVisible()
    expect(screen.getByText('/data/taskId')).toBeVisible()
    expect(screen.getByText('required')).toBeVisible()
    expect(
      screen.getByText(/Object.*48 bytes.*Declared bytes.*512.*Fields: data/)
    ).toBeVisible()
    expect(screen.getByText('Provider response violated a frozen OpenAPI Schema rule')).toBeVisible()
    expect(screen.queryByText('raw-provider-body')).not.toBeInTheDocument()
    expect(screen.queryByText('secret-value')).not.toBeInTheDocument()
  })
})

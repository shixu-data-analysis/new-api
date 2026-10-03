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

import type { CanvasTaskCall } from '../../task-call-api'
import { CallDetails, TaskCallHistory } from '../TaskCallHistory'

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
  canvasErrorCode: null,
  upstreamErrorCode: null,
  errorCategory: null,
  sanitizedError: null,
  sanitizedResponse: null,
  responseBodyRecorded: true,
  responseFromQuery: false,
  matchedRule: null,
  executionJudgement: null,
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
      'API provider / channel',
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
          upstreamErrorCode: 'RATE_LIMIT',
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
      upstreamErrorCode: 'RATE_LIMIT',
      errorCategory: 'PROVIDER_RATE_LIMITED',
      executionJudgement: {
        status: 'CONFIRMED_FAILED',
        source: 'RULE',
      },
      errorRuleId: 'provider.rate-limit',
      errorRuleVersion: 3,
      sanitizedError: 'Retry after 30 seconds',
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(screen.getByText('RATE_LIMIT')).toBeVisible()
    expect(screen.getByText('API provider rate limited')).toBeVisible()
    expect(screen.getByText('Confirmed failed (set by mapping)')).toBeVisible()
    expect(screen.queryByText('PROVIDER_RATE_LIMITED')).not.toBeInTheDocument()
    expect(screen.getByText('upstream-retry-1')).toBeVisible()
  })

  it('localizes the matched mapping and shows the provider status that decided the result', () => {
    mountDetails({
      ...call,
      errorRuleId: 'provider.502.server',
      errorRuleVersion: 2,
      matchedRule: {
        ruleType: 'HTTP_STATUS',
        httpStatus: 502,
        conditions: [
          {
            path: 'error.code',
            operator: 'EQUALS',
            valueType: 'STRING',
            value: 'server_error',
          },
        ],
        adminNote: '',
      },
      executionJudgement: {
        status: 'SUCCEEDED',
        source: 'PROVIDER_STATE',
        providerStatus: 'succeeded',
      },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(
      screen.getByText('HTTP 502 and error.code = "server_error"')
    ).toBeVisible()
    expect(
      screen.getByText('Succeeded (provider status succeeded)')
    ).toBeVisible()
    expect(screen.queryByText(/EQUALS/)).not.toBeInTheDocument()
  })

  it('shows the request line and only non-empty request parts', () => {
    mountDetails({
      ...call,
      sanitizedRequest: {
        method: 'GET',
        path: '/v1/video/task-1',
        query: {},
        contentType: null,
        body: null,
      },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Sent upstream request' }))
    expect(screen.getByText('GET /v1/video/task-1')).toBeVisible()
    expect(
      screen.getByText('No query parameters or request body.')
    ).toBeVisible()
  })

  it('shows the request body directly under the request line with one copy action', () => {
    mountDetails({
      ...call,
      sanitizedRequest: {
        method: 'POST',
        path: '/v1/images/generations',
        query: {},
        contentType: 'application/json',
        body: { n: 1, prompt: 'a girl' },
      },
    })
    const panel = screen.getByRole('tabpanel', { hidden: false })
    fireEvent.click(screen.getByRole('tab', { name: 'Sent upstream request' }))
    const requestPanel = screen.getByRole('tabpanel')
    expect(requestPanel).not.toBe(panel)
    expect(screen.getByText('POST /v1/images/generations')).toBeVisible()
    expect(requestPanel.querySelector('pre')?.textContent).toContain(
      '"prompt": "a girl"'
    )
    expect(
      [...requestPanel.querySelectorAll('button')].filter(
        (button) => button.textContent === 'Copy'
      )
    ).toHaveLength(1)
  })

  it.each([
    [false, 'This call predates the change; the response body was not saved.'],
    [
      true,
      'The body was empty, binary, or over the read limit and was not saved.',
    ],
  ])(
    'explains a missing failure body (recorded=%s)',
    (responseBodyRecorded, text) => {
      mountDetails({
        ...call,
        finalHttpStatus: 502,
        sanitizedResponse: null,
        responseBodyRecorded,
        providerResponseDiagnostic: {
          contentType: 'application/octet-stream',
          summary: { kind: 'scalar', byteLength: 20 },
        },
      })
      expect(screen.getByText(text, { exact: false })).toBeVisible()
      expect(
        screen.getByText('(application/octet-stream · 20 bytes)')
      ).toBeVisible()
    }
  )

  it('collapses long response strings with a localized length and copies the full value', () => {
    const writeText = vi.fn()
    Object.assign(navigator, { clipboard: { writeText } })
    const long = 'x'.repeat(250)
    mountDetails({ ...call, sanitizedResponse: { message: long } })
    fireEvent.click(
      screen.getByRole('tab', { name: 'Received upstream response' })
    )
    expect(screen.getByText(/… \(250 characters in total\)/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify({ message: long }, null, 2)
    )
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
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(
      screen.getByText('Canvas error code').closest('div')
    ).toHaveTextContent('missing required field /data/taskId')
    expect(
      screen.queryByText(
        'Provider response violated a frozen OpenAPI Schema rule'
      )
    ).not.toBeInTheDocument()
    expect(screen.queryByText('raw-provider-body')).not.toBeInTheDocument()
    expect(screen.queryByText('secret-value')).not.toBeInTheDocument()
  })
})

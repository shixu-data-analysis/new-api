/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
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

import { ExecutionSettings } from '../ExecutionSettings'

const mocks = vi.hoisted(() => ({
  getCanvasProviderPricingMatrix: vi.fn(),
  getCanvasExecutionOverview: vi.fn(),
  getCanvasChannelExecution: vi.fn(),
  publishCanvasExecutionPolicy: vi.fn(),
  previewCanvasExecutionError: vi.fn(),
}))
vi.mock('../../api', () => ({
  getCanvasProviderPricingMatrix: mocks.getCanvasProviderPricingMatrix,
}))
vi.mock('../../execution-api', () => ({
  getCanvasExecutionOverview: mocks.getCanvasExecutionOverview,
  getCanvasChannelExecution: mocks.getCanvasChannelExecution,
  publishCanvasExecutionPolicy: mocks.publishCanvasExecutionPolicy,
  previewCanvasExecutionError: mocks.previewCanvasExecutionError,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const channelId = '85000000-0000-7000-8000-000000000001'
const providerId = '85000000-0000-7000-8000-000000000002'
const systemRule = {
  id: 'system.http.429',
  version: 1,
  enabled: true,
  httpStatus: 429,
  upstreamCode: null,
  messageContains: null,
  category: 'PROVIDER_RATE_LIMITED' as const,
  priority: 10,
  clientMessages: Object.fromEntries(
    ['zhCN', 'en', 'fr', 'ru', 'ja', 'vi', 'zhTW'].map((locale) => [
      locale,
      'Please retry later.',
    ])
  ),
  adminNote: 'Default rate limit',
  source: 'SYSTEM' as const,
}

function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <ExecutionSettings />
    </QueryClientProvider>
  )
}

beforeAll(async () => {
  await i18next.init({ lng: 'en', resources: { en } })
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCanvasProviderPricingMatrix.mockResolvedValue([
    {
      providerId,
      providerCode: 'example',
      providerName: 'Example',
      channelId,
      channelCode: 'primary',
      customerModelId: '85000000-0000-7000-8000-000000000004',
      modelKey: 'canvas-image',
      modelName: 'Canvas Image',
      combinationId: 'combo-1',
      combinationKey: 'default',
      parameters: {},
      billingDimensions: {},
      resolvedProviderModelId: 'upstream-image',
      rateId: null,
      rateVersion: null,
      rateStatus: null,
      billingUnit: null,
      nativeAmount: null,
      tokenRates: null,
      currency: null,
      normalizedAmountMinor: null,
      normalizedTokenRates: null,
      failureChargePolicy: null,
      rateEffectiveAt: null,
      prices: [],
    },
  ])
  mocks.getCanvasExecutionOverview.mockResolvedValue({
    global: {
      kind: 'GLOBAL_LIMITS',
      scopeKey: 'GLOBAL',
      version: 2,
      configured: {},
      effective: {
        instanceConcurrency: 16,
        queryReservedConcurrency: 4,
        userOutputLimit: 12,
      },
      inherited: [],
    },
    credentialGroups: [
      {
        id: '85000000-0000-7000-8000-000000000003',
        name: 'Primary',
        providerId,
      },
    ],
    instances: [
      {
        queueName: 'tasks',
        mode: 'MOCK',
        workerId: 'worker-1',
        status: 'RUNNING',
        credentialsConfigured: true,
        startedAt: null,
        heartbeatAt: '2026-09-06T00:00:00Z',
        leaseExpiresAt: '2999-09-06T00:01:00Z',
        stoppedAt: null,
        updatedAt: null,
      },
      {
        queueName: 'tasks',
        mode: 'MOCK',
        workerId: 'worker-expired',
        status: 'RUNNING',
        credentialsConfigured: true,
        startedAt: null,
        heartbeatAt: '2026-09-05T00:00:00Z',
        leaseExpiresAt: '2026-09-05T00:01:00Z',
        stoppedAt: null,
        updatedAt: null,
      },
      {
        queueName: 'tasks',
        mode: 'MOCK',
        workerId: 'worker-stopped',
        status: 'STOPPED',
        credentialsConfigured: true,
        startedAt: null,
        heartbeatAt: '2026-09-05T00:00:00Z',
        leaseExpiresAt: null,
        stoppedAt: '2026-09-05T00:01:00Z',
        updatedAt: null,
      },
    ],
    systemRecovery: {
      heartbeatMs: 10000,
      leaseMs: 60000,
      scanMs: 10000,
      defaultInstances: 4,
    },
  })
  mocks.getCanvasChannelExecution.mockResolvedValue({
    global: {
      kind: 'GLOBAL_LIMITS',
      scopeKey: 'GLOBAL',
      version: 2,
      configured: {},
      effective: {
        instanceConcurrency: 16,
        queryReservedConcurrency: 4,
        userOutputLimit: 12,
      },
      inherited: [],
    },
    channelId,
    providerId,
    channel: {
      kind: 'CHANNEL_POLICY',
      scopeKey: channelId,
      version: null,
      configured: {},
      effective: {
        requestTimeoutMs: 0,
        streamIdleTimeoutMs: 300000,
        pollIntervalMs: 15000,
        deadlineMs: 86400000,
        requestConcurrency: 16,
        asyncInFlightLimit: 30,
      },
      inherited: [],
    },
    errors: {
      kind: 'ERROR_MAPPING',
      scopeKey: providerId,
      version: null,
      configured: {},
      effective: { rules: [systemRule] },
      inherited: [],
    },
    limits: {
      kind: 'LIMIT_RULES',
      scopeKey: channelId,
      version: null,
      configured: {},
      effective: { rules: [] },
      inherited: [],
    },
  })
  mocks.publishCanvasExecutionPolicy.mockResolvedValue({})
  mocks.previewCanvasExecutionError.mockResolvedValue({
    facts: { httpStatus: 429, upstreamCode: 'RATE_LIMIT' },
    upstreamRequestId: null,
    upstreamRequestIdSource: null,
    upstreamTaskId: null,
    upstreamTaskIdSource: null,
    match: {
      ruleId: systemRule.id,
      ruleVersion: 1,
      category: systemRule.category,
      clientMessage: 'Please retry later.',
    },
  })
})

describe('execution settings', () => {
  it('shows effective global policy, recovery facts, and executor ownership', async () => {
    mount()
    expect(await screen.findByText('worker-1')).toBeVisible()
    expect(screen.getByRole('tablist')).toHaveClass(
      'w-full',
      'flex-nowrap',
      'overflow-x-auto'
    )
    screen
      .getAllByRole('tab')
      .forEach((tab) => expect(tab).toHaveClass('h-8', 'flex-none', 'px-3'))
    expect(screen.getAllByText('Global execution limits')).toHaveLength(2)
    expect(screen.getByText('System recovery')).toBeVisible()
    expect(screen.getByText('Running workers')).toBeVisible()
    expect(screen.getByText('Mock mode')).toBeVisible()
    expect(screen.getByText('Running')).toBeVisible()
    expect(screen.queryByText('MOCK')).not.toBeInTheDocument()
    expect(screen.queryByText('RUNNING')).not.toBeInTheDocument()
    expect(screen.queryByText('worker-expired')).not.toBeInTheDocument()
    expect(screen.queryByText('worker-stopped')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Instance concurrency')).toHaveValue(16)
  })

  it('requires confirmation before publishing global limits', async () => {
    mount()
    fireEvent.change(await screen.findByLabelText('Instance concurrency'), {
      target: { value: '20' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Review publication' }))
    expect(mocks.publishCanvasExecutionPolicy).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('20')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))
    await waitFor(() =>
      expect(mocks.publishCanvasExecutionPolicy.mock.calls[0]?.[0]).toEqual({
        kind: 'GLOBAL_LIMITS',
        scopeKey: 'GLOBAL',
        config: {
          instanceConcurrency: 20,
          queryReservedConcurrency: 4,
          userOutputLimit: 12,
        },
      })
    )
  })

  it('previews the edited error rule list without publishing it', async () => {
    mount()
    fireEvent.click(
      screen.getByRole('tab', { name: 'Channel execution policy' })
    )
    fireEvent.click(await screen.findByRole('tab', { name: 'Error mappings' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Run preview' }))
    await waitFor(() =>
      expect(mocks.previewCanvasExecutionError).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId,
          httpStatus: 429,
          locale: 'en',
          rules: [
            expect.objectContaining({ id: systemRule.id, source: 'OVERRIDE' }),
          ],
        })
      )
    )
    expect(await screen.findByText('Please retry later.')).toBeVisible()
    expect(mocks.publishCanvasExecutionPolicy).not.toHaveBeenCalled()
  })

  it('publishes an administrator-added limit rule only after confirmation', async () => {
    mount()
    fireEvent.click(
      screen.getByRole('tab', { name: 'Channel execution policy' })
    )
    fireEvent.click(await screen.findByRole('tab', { name: 'Limit rules' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add rule' }))

    fireEvent.change(screen.getByLabelText('Rule ID'), {
      target: { value: 'custom.limit.batch-ui' },
    })
    fireEvent.change(screen.getByLabelText('Limit'), {
      target: { value: '25' },
    })
    fireEvent.click(
      within(screen.getByRole('form', { name: 'Limit rules' })).getByRole(
        'button',
        { name: 'Review publication' }
      )
    )

    expect(mocks.publishCanvasExecutionPolicy).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Rules')
    expect(dialog).toHaveTextContent('1')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))

    await waitFor(() =>
      expect(mocks.publishCanvasExecutionPolicy.mock.calls[0]?.[0]).toEqual({
        kind: 'LIMIT_RULES',
        scopeKey: channelId,
        config: {
          rules: [
            {
              id: 'custom.limit.batch-ui',
              enabled: true,
              scope: 'CHANNEL',
              metric: 'CONCURRENCY',
              limit: '25',
            },
          ],
        },
      })
    )
  })
})

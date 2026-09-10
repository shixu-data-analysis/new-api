/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import type { CanvasModelMonitoring } from '../../types'
import { ModelMonitoring, outputFacts } from '../ModelMonitoring'

const mocks = vi.hoisted(() => ({
  controlCanvasModelMonitoring: vi.fn(),
  getCanvasAdminTaskLogs: vi.fn(),
  getCanvasModelMonitoring: vi.fn(),
  getCanvasModelMonitoringControls: vi.fn(),
  getCanvasModelMonitoringTargets: vi.fn(),
}))

vi.mock('../../api', () => mocks)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../CanvasServerTable', () => ({
  CanvasServerTable: (props: { additionalFilters?: ReactNode }) => (
    <section>{props.additionalFilters}</section>
  ),
}))

const modelId = '85000000-0000-7000-8000-000000000001'
const executionTargetId = '85000000-0000-7000-8000-000000000002'
const monitoring: CanvasModelMonitoring = {
  customerModel: {
    id: modelId,
    modelKey: 'canvas-image',
    name: 'Canvas Image',
    version: 1,
    capability: 'IMAGE',
    status: 'ACTIVE',
  },
  executionTarget: {
    id: executionTargetId,
    channelId: '85000000-0000-7000-8000-000000000004',
    upstreamModelId: 'canvas-image-1k',
    presentationEnabled: true,
    presentationVersion: 3,
    parameterCombinations: [
      {
        id: '85000000-0000-7000-8000-000000000003',
        key: 'quality=1K',
        label: '1K',
        normalizedParameters: { quality: '1K' },
      },
    ],
  },
  manualEnabled: true,
  controlVersion: 4,
  providerEnabled: true,
  channelEnabled: true,
  effectiveEnabled: true,
  blockingReasons: [],
  roundStartedAt: '2026-09-10T00:00:00.000Z',
  window: 'day',
  origin: 'REAL',
  from: '2026-09-10T00:00:00.000Z',
  to: '2026-09-11T00:00:00.000Z',
  bucketSeconds: 3600,
  summary: {
    succeeded: 2,
    failed: 1,
    unknown: 0,
    processing: 0,
    resultCount: 3,
    sampleCount: 3,
    successRate: 2 / 3,
  },
  trend: [],
  failures: [],
}

function mount(onSelectTarget = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <ModelMonitoring
        modelId={modelId}
        executionTargetId={executionTargetId}
        onBack={vi.fn()}
        onSelectTarget={onSelectTarget}
      />
    </QueryClientProvider>
  )
  return { client, ...view }
}

beforeAll(async () => {
  await i18next.init({ lng: 'en', resources: { en } })
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getCanvasModelMonitoring.mockResolvedValue(monitoring)
  mocks.getCanvasAdminTaskLogs.mockResolvedValue({ items: [], total: 0 })
  mocks.getCanvasModelMonitoringTargets.mockResolvedValue({
    customerModel: monitoring.customerModel,
    targets: [],
  })
  mocks.getCanvasModelMonitoringControls.mockResolvedValue({ items: [], total: 0 })
  mocks.controlCanvasModelMonitoring.mockResolvedValue({})
})

it('keeps Real and Mock monitoring queries separate, then submits one validated disable action', async () => {
  const { client } = mount()
  const invalidateQueries = vi.spyOn(client, 'invalidateQueries')
  await screen.findByText(/Canvas Image/)
  expect(
    screen.getByText('Channel ID: 85000000-0000-7000-8000-000000000004')
  ).toBeVisible()
  await waitFor(() =>
    expect(mocks.getCanvasModelMonitoring).toHaveBeenCalledWith(
      modelId,
      executionTargetId,
      expect.objectContaining({ window: 'day', origin: 'REAL' }),
      expect.anything()
    )
  )

  fireEvent.change(screen.getByLabelText('Execution source'), {
    target: { value: 'MOCK' },
  })
  await waitFor(() =>
    expect(mocks.getCanvasModelMonitoring).toHaveBeenCalledWith(
      modelId,
      executionTargetId,
      expect.objectContaining({ window: 'day', origin: 'MOCK' }),
      expect.anything()
    )
  )
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Disable model' })).toBeVisible()
  )

  fireEvent.click(screen.getByRole('button', { name: 'Disable model' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'OTHER' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Disable model' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Provide an explanation'
  )
  expect(mocks.controlCanvasModelMonitoring).not.toHaveBeenCalled()

  fireEvent.change(within(dialog).getByLabelText(/Additional explanation/), {
    target: { value: 'manual review' },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Disable model' }))
  await waitFor(() =>
    expect(mocks.controlCanvasModelMonitoring).toHaveBeenCalledWith(
      modelId,
      executionTargetId,
      {
        enabled: false,
        expectedVersion: 4,
        reasonCode: 'OTHER',
        note: 'manual review',
        confirmed: true,
      }
    )
  )
  await waitFor(() =>
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['canvas-cloud', 'model-monitoring-targets', modelId],
    })
  )
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ['canvas-cloud', 'admin-testing-models'],
  })
  client.clear()
})

it('puts the safe localized output reason on its own line before the error code context', () => {
  expect(
    outputFacts(
      [
        {
          id: 'output-1',
          outputIndex: 0,
          quotedPoints: '10',
          settledPoints: null,
          executionStatus: 'CONFIRMED_FAILED',
          billingStatus: 'RELEASED_FAILED',
          error: {
            code: 'SAFE_FAILURE',
            messages: { zh: '安全失败原因', en: 'Safe failure reason' },
          },
          completedAt: null,
          billingFinalizedAt: null,
        },
      ],
      (key) => key,
      'zh-CN'
    )
  ).toBe('Result 1: Confirmed failed · SAFE_FAILURE\n安全失败原因')
})

it('lists every model target with its identity, pricing coverage, visibility, and current marker', async () => {
  const onSelectTarget = vi.fn()
  const alternateTargetId = '85000000-0000-7000-8000-000000000005'
  mocks.getCanvasModelMonitoringTargets.mockResolvedValue({
    customerModel: monitoring.customerModel,
    targets: [
      {
        ...monitoring.executionTarget,
        manualEnabled: true,
        controlVersion: 4,
        runtimeEnabled: true,
        providerEnabled: true,
        channelEnabled: true,
        effectiveEnabled: true,
        pricingComplete: true,
        customerVisible: true,
        pricingCoverage: [
          {
            priceGroupId: '85000000-0000-7000-8000-000000000006',
            priceGroupCode: 'STANDARD',
            complete: true,
            pricedCombinationIds: [
              '85000000-0000-7000-8000-000000000003',
            ],
            missingCombinationIds: [],
          },
        ],
      },
      {
        ...monitoring.executionTarget,
        id: alternateTargetId,
        channelId: '85000000-0000-7000-8000-000000000007',
        upstreamModelId: 'canvas-image-2k',
        parameterCombinations: [
          {
            id: '85000000-0000-7000-8000-000000000008',
            key: 'quality=2K',
            label: '2K',
            normalizedParameters: { quality: '2K' },
          },
        ],
        manualEnabled: true,
        controlVersion: 1,
        runtimeEnabled: true,
        providerEnabled: true,
        channelEnabled: true,
        effectiveEnabled: true,
        presentationEnabled: false,
        pricingComplete: false,
        customerVisible: false,
        pricingCoverage: [],
      },
    ],
  })

  const { client } = mount(onSelectTarget)
  expect(await screen.findByText(/canvas-image-2k/)).toBeVisible()
  expect(screen.getByText('Pricing coverage: STANDARD: Complete')).toBeVisible()
  expect(screen.getByText('Display switch: Disabled')).toBeVisible()
  expect(screen.getByText('Customer display: Visible to customers')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Current target' })).toHaveAttribute(
    'aria-current',
    'page'
  )
  fireEvent.click(screen.getByRole('button', { name: 'View monitoring' }))
  expect(onSelectTarget).toHaveBeenCalledWith(alternateTargetId)
  client.clear()
})

it('rejects a monitoring response whose model identity differs from the route', async () => {
  mocks.getCanvasModelMonitoring.mockResolvedValue({
    ...monitoring,
    customerModel: { ...monitoring.customerModel, id: '85000000-0000-7000-8000-000000000099' },
  })

  const { client } = mount()
  expect(await screen.findByText('Invalid model monitoring target')).toBeVisible()
  expect(mocks.getCanvasAdminTaskLogs).not.toHaveBeenCalled()
  expect(mocks.getCanvasModelMonitoringControls).not.toHaveBeenCalled()
  client.clear()
})

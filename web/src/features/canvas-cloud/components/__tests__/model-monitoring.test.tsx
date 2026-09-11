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
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import type { CanvasModelMonitoring } from '../../types'
import {
  buildMonitoringTrend,
  getTrendTooltipAnchor,
  getTrendBarIndex,
  hasPositiveTrendBarValue,
  monitoringTrendTooltipText,
  outputFacts,
} from '../model-monitoring-utils'
import { ModelMonitoring } from '../ModelMonitoring'

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
    providerName: 'Canvas Provider',
    version: 1,
    capability: 'IMAGE',
    status: 'ACTIVE',
  },
  executionTarget: {
    id: executionTargetId,
    upstreamModelId: 'canvas-image-1k',
    presentationEnabled: true,
    presentationVersion: 3,
    customerVisible: false,
    pricingCoverage: [
      {
        priceGroupId: '85000000-0000-7000-8000-000000000006',
        priceGroupCode: 'STANDARD',
        priceGroupName: 'Standard',
        requiredCount: 3,
        pricedCount: 1,
        complete: false,
        customerVisible: false,
        invisibleReasons: ['MISSING_PRICING'],
        pricedCombinationIds: ['85000000-0000-7000-8000-000000000003'],
        missingCombinationIds: [
          '85000000-0000-7000-8000-000000000008',
          '85000000-0000-7000-8000-000000000009',
        ],
      },
    ],
    parameterCombinations: [
      {
        id: '85000000-0000-7000-8000-000000000003',
        key: 'quality=1K',
        label: '1K',
        normalizedParameters: { quality: '1K' },
      },
      {
        id: '85000000-0000-7000-8000-000000000008',
        key: 'quality=2K',
        label: '2K',
        normalizedParameters: { quality: '2K' },
      },
      {
        id: '85000000-0000-7000-8000-000000000009',
        key: 'quality=4K',
        label: '4K',
        normalizedParameters: { quality: '4K' },
      },
    ],
  },
  manualEnabled: true,
  controlVersion: 4,
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
  mocks.getCanvasModelMonitoringControls.mockResolvedValue({
    items: [],
    total: 0,
  })
  mocks.controlCanvasModelMonitoring.mockResolvedValue({})
})

it('keeps Real and Mock monitoring queries separate, then submits one validated disable action', async () => {
  const { client } = mount()
  const invalidateQueries = vi.spyOn(client, 'invalidateQueries')
  await screen.findByText(/Canvas Image/)
  expect(screen.getByText('Model provider: Canvas Provider')).toBeVisible()
  expect(screen.queryByText(/85000000-0000-7000-8000-000000000004/)).toBeNull()
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
  fireEvent.change(within(dialog).getByLabelText(/Reason/), {
    target: { value: 'OTHER' },
  })
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

it('shows only the safe localized output reason without an internal error code', () => {
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
  ).toBe('Result 1: Confirmed failed\n安全失败原因')
})

it('preserves empty time buckets and uses localized metric labels in trend details', () => {
  const trend = buildMonitoringTrend(
    {
      ...monitoring,
      from: '2026-09-10T00:00:00.000Z',
      to: '2026-09-10T06:00:00.000Z',
      bucketSeconds: 7200,
      trend: [
        {
          from: '2026-09-10T04:00:00.000Z',
          to: '2026-09-10T06:00:00.000Z',
          succeeded: 8,
          failed: 3,
          unknown: 3,
          processing: 0,
          resultCount: 14,
          sampleCount: 14,
          successRate: 8 / 11,
        },
      ],
    },
    'en',
    (key) => key
  )

  expect(trend).toHaveLength(3)
  expect(trend.map((bucket) => bucket.succeeded)).toEqual([0, 0, 8])
  expect(trend[0].successRateLabel).toBe('No data')
  expect(monitoringTrendTooltipText(trend[2], (key) => key, 'en')).toContain(
    'Success rate 72.7% · Successful results 8 · Confirmed failures 3 · Unknown outcomes 3 · Processing 0'
  )
})

it('uses Recharts original data indices and recognizes positive stacked values', () => {
  expect(getTrendBarIndex({ originalDataIndex: 7 })).toBe(7)
  expect(hasPositiveTrendBarValue(3)).toBe(true)
  expect(hasPositiveTrendBarValue(0)).toBe(false)
  expect(hasPositiveTrendBarValue([2, 5])).toBe(true)
  expect(hasPositiveTrendBarValue([5, 5])).toBe(false)
})

it('shows the temporary trend tooltip for keyboard and touch input, then closes it on Escape or outside touch', async () => {
  mocks.getCanvasModelMonitoring.mockResolvedValue({
    ...monitoring,
    from: '2026-09-10T00:00:00.000Z',
    to: '2026-09-10T02:00:00.000Z',
    bucketSeconds: 3600,
    trend: [
      {
        from: '2026-09-10T00:00:00.000Z',
        to: '2026-09-10T01:00:00.000Z',
        succeeded: 2,
        failed: 1,
        unknown: 0,
        processing: 0,
        resultCount: 3,
        sampleCount: 3,
        successRate: 2 / 3,
      },
      {
        from: '2026-09-10T01:00:00.000Z',
        to: '2026-09-10T02:00:00.000Z',
        succeeded: 5,
        failed: 0,
        unknown: 1,
        processing: 0,
        resultCount: 6,
        sampleCount: 6,
        successRate: 1,
      },
    ],
  })

  const { client } = mount()
  const interaction = await screen.findByRole('application', {
    name: 'Runtime trend',
  })
  expect(
    screen.getAllByRole('application', { name: 'Runtime trend' })
  ).toHaveLength(1)
  expect(interaction.querySelectorAll('[tabindex="0"]')).toHaveLength(0)
  Object.defineProperty(interaction, 'getBoundingClientRect', {
    value: () => ({ left: 10, top: 20 }),
  })

  const appendSegment = (
    index: number,
    rect: { height: number; left: number; top: number; width: number },
    populated = true
  ) => {
    const segment = document.createElement('span')
    segment.setAttribute('data-trend-index', String(index))
    segment.setAttribute('data-trend-populated', String(populated))
    Object.defineProperty(segment, 'getBoundingClientRect', {
      value: () => rect,
    })
    interaction.append(segment)
    return segment
  }
  const firstBucketTarget = appendSegment(0, {
    height: 12,
    left: 30,
    top: 120,
    width: 24,
  })
  appendSegment(0, { height: 12, left: 30, top: 100, width: 24 })
  const secondBucketTarget = appendSegment(1, {
    height: 12,
    left: 80,
    top: 110,
    width: 24,
  })
  appendSegment(1, { height: 12, left: 80, top: 70, width: 24 })
  appendSegment(1, { height: 1, left: 80, top: 10, width: 24 }, false)

  expect(
    getTrendTooltipAnchor(
      { left: 10, top: 20 },
      { height: 12, left: 80, top: 110, width: 24 },
      [
        { height: 12, left: 80, top: 110, width: 24 },
        { height: 12, left: 80, top: 70, width: 24 },
      ]
    )
  ).toEqual({ left: 82, top: 50 })

  interaction.focus()
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Successful results 2'
  )
  fireEvent.keyDown(interaction, { key: 'ArrowRight' })
  expect(screen.getByRole('status')).toHaveStyle({
    left: '82px',
    top: '50px',
  })
  expect(screen.getByRole('status')).toHaveTextContent('Successful results 5')
  fireEvent.keyDown(interaction, { key: 'Escape' })
  expect(screen.queryByRole('status')).toBeNull()

  fireEvent.mouseMove(firstBucketTarget)
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Successful results 2'
  )
  fireEvent.mouseLeave(interaction)
  expect(screen.queryByRole('status')).toBeNull()

  fireEvent.pointerDown(secondBucketTarget, { pointerType: 'touch' })
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Successful results 5'
  )
  fireEvent.pointerDown(document.body, { pointerType: 'touch' })
  expect(screen.queryByRole('status')).toBeNull()

  fireEvent.pointerDown(secondBucketTarget, { pointerType: 'touch' })
  expect(await screen.findByRole('status')).toBeVisible()
  mocks.getCanvasModelMonitoring.mockResolvedValue({
    ...monitoring,
    from: '2026-09-10T00:00:00.000Z',
    to: '2026-09-10T02:00:00.000Z',
    bucketSeconds: 3600,
    trend: [
      {
        from: '2026-09-10T00:00:00.000Z',
        to: '2026-09-10T01:00:00.000Z',
        succeeded: 6,
        failed: 0,
        unknown: 0,
        processing: 0,
        resultCount: 6,
        sampleCount: 6,
        successRate: 1,
      },
    ],
  })
  await client.invalidateQueries({
    queryKey: ['canvas-cloud', 'model-monitoring', modelId, executionTargetId],
  })
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  client.clear()
})

it('switches monitoring target with one compact selector and shows price-group visibility', async () => {
  const onSelectTarget = vi.fn()
  const alternateTargetId = '85000000-0000-7000-8000-000000000005'
  mocks.getCanvasModelMonitoringTargets.mockResolvedValue({
    customerModel: monitoring.customerModel,
    targets: [
      {
        ...monitoring.executionTarget,
        manualEnabled: true,
        controlVersion: 4,
        blockingReasons: [],
        effectiveEnabled: true,
        pricingComplete: true,
        customerVisible: true,
        pricingCoverage: [
          {
            priceGroupId: '85000000-0000-7000-8000-000000000006',
            priceGroupCode: 'STANDARD',
            priceGroupName: 'Standard',
            requiredCount: 1,
            pricedCount: 1,
            complete: true,
            customerVisible: true,
            invisibleReasons: [],
            pricedCombinationIds: ['85000000-0000-7000-8000-000000000003'],
            missingCombinationIds: [],
          },
        ],
      },
      {
        ...monitoring.executionTarget,
        id: alternateTargetId,
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
        blockingReasons: [],
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
  expect(screen.getByText('No price plans visible (0/1)')).toBeVisible()
  expect(
    screen.getByText('Price plan: Standard · 1/3 Not shown to customers')
  ).toBeVisible()
  expect(screen.getByText('Missing specifications: 2K · 4K')).toBeVisible()
  expect(screen.getByLabelText('Switch monitoring target')).toBeVisible()
  expect(screen.queryByText(/85000000-0000-7000-8000-000000000007/)).toBeNull()
  fireEvent.change(screen.getByLabelText('Switch monitoring target'), {
    target: { value: alternateTargetId },
  })
  expect(onSelectTarget).toHaveBeenCalledWith(alternateTargetId)
  client.clear()
})

it('keeps current target visibility from the monitoring report when selector loading fails', async () => {
  mocks.getCanvasModelMonitoringTargets.mockRejectedValue(
    new Error('targets unavailable')
  )

  const { client } = mount()
  expect(await screen.findByText('No price plans visible (0/1)')).toBeVisible()
  expect(
    await screen.findByText('Unable to load execution targets')
  ).toBeVisible()
  client.clear()
})

it('rejects a monitoring response whose model identity differs from the route', async () => {
  mocks.getCanvasModelMonitoring.mockResolvedValue({
    ...monitoring,
    customerModel: {
      ...monitoring.customerModel,
      id: '85000000-0000-7000-8000-000000000099',
    },
  })

  const { client } = mount()
  expect(
    await screen.findByText('Invalid model monitoring target')
  ).toBeVisible()
  expect(mocks.getCanvasAdminTaskLogs).not.toHaveBeenCalled()
  expect(mocks.getCanvasModelMonitoringControls).not.toHaveBeenCalled()
  client.clear()
})

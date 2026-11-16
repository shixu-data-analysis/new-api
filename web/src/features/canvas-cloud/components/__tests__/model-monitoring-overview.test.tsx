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
import zh from '@/i18n/locales/zh.json'

import { monitoringTickLabelIndexes } from '../../model-monitoring-overview'
import type { CanvasModelMonitoringOverview } from '../../types'
import { ModelMonitoringOverview } from '../ModelMonitoringOverview'

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getFailures: vi.fn(),
  getTaskLogs: vi.fn(),
  control: vi.fn(),
}))
vi.mock('../../api', () => ({
  getCanvasModelMonitoringOverview: mocks.getOverview,
  getCanvasModelMonitoringFailures: mocks.getFailures,
  getCanvasAdminTaskLogs: mocks.getTaskLogs,
  controlCanvasLogicalModel: mocks.control,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    search: Record<string, string>
    children: React.ReactNode
    className?: string
  }) => (
    <a
      href={`/canvas-cloud/task-logs?${new URLSearchParams(props.search).toString()}`}
      className={props.className}
    >
      {props.children}
    </a>
  ),
}))
vi.mock('../TaskRecordDetailsSheet', () => ({
  TaskRecordDetailsSheet: (props: { taskId?: string }) =>
    props.taskId ? (
      <div role='dialog' aria-label='Task details'>
        {props.taskId}
      </div>
    ) : null,
}))
vi.mock('../CanvasDateRangeFilter', () => ({
  CanvasDateRangeFilter: (props: {
    from?: Date
    to?: Date
    onFromChange: (value?: Date) => void
    onToChange: (value?: Date) => void
  }) => (
    <div>
      <input
        aria-label='Start time'
        value={props.from?.toISOString() ?? ''}
        onChange={(event) =>
          props.onFromChange(
            event.target.value ? new Date(event.target.value) : undefined
          )
        }
      />
      <input
        aria-label='End time'
        value={props.to?.toISOString() ?? ''}
        onChange={(event) =>
          props.onToChange(
            event.target.value ? new Date(event.target.value) : undefined
          )
        }
      />
    </div>
  ),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))

const bucket = (
  from: string,
  succeeded: number,
  failed: number,
  pending = 0,
  processing = 0
) => ({
  from,
  to: new Date(Date.parse(from) + 60 * 60 * 1000).toISOString(),
  succeeded,
  failed,
  pending,
  processing,
  determined: succeeded + failed + pending,
  failures: failed + pending,
  failureRate:
    succeeded + failed + pending
      ? (failed + pending) / (succeeded + failed + pending)
      : null,
})

const overview: CanvasModelMonitoringOverview = {
  window: 'day',
  from: '2026-09-18T00:00:00.000Z',
  to: '2026-09-18T02:00:00.000Z',
  bucketSeconds: 3600,
  page: 1,
  pageSize: 10,
  total: 2,
  thresholds: { watchRate: 0.1, badRate: 0.3, minDetermined: 20 },
  totals: {
    models: 2,
    bad: 1,
    watch: 0,
    determined: 31,
    failed: 4,
    pending: 8,
    pendingFrozen: 5,
    pendingUnqueryable: 3,
  },
  preTagTotal: 2,
  capabilities: [{ value: 'image.generate', count: 2 }],
  providers: [{ id: 'provider-a', name: 'Provider A', count: 2 }],
  tags: [{ id: 'tag-a', name: 'Photo', count: 1 }],
  untaggedCount: 1,
  rows: [
    {
      modelKey: 'image.alpha',
      effectiveDisplayName: 'Alpha model',
      catalogDefaultName: 'Catalog Alpha model',
      upstreamModelIds: ['alpha-upstream'],
      capability: 'image.generate',
      provider: { id: 'provider-a', name: 'Provider A' },
      tags: [{ id: 'tag-a', name: 'Photo' }],
      manualEnabled: true,
      controlVersion: 3,
      health: { status: 'bad', trigger: 'lastBucket' },
      summary: bucket('2026-09-18T00:00:00.000Z', 18, 4, 8),
      trend: [
        bucket('2026-09-18T00:00:00.000Z', 18, 1, 0),
        bucket('2026-09-18T01:00:00.000Z', 0, 3, 8),
      ],
    },
    {
      modelKey: 'image.beta',
      effectiveDisplayName: 'Beta model',
      catalogDefaultName: 'Beta model',
      upstreamModelIds: [],
      capability: 'image.generate',
      provider: { id: 'provider-a', name: 'Provider A' },
      tags: [],
      manualEnabled: false,
      controlVersion: 7,
      health: { status: 'off', trigger: null },
      summary: bucket('2026-09-18T00:00:00.000Z', 1, 0),
      trend: [
        bucket('2026-09-18T00:00:00.000Z', 1, 0),
        bucket('2026-09-18T01:00:00.000Z', 0, 0),
      ],
    },
  ],
}
const failures = {
  modelKey: 'image.alpha',
  from: overview.from,
  to: overview.to,
  causes: [
    { errorCode: 'PROVIDER_RATE_LIMITED', count: 3 },
    { errorCode: 'ADMIN_CONFIRMED_UPSTREAM_FAILED', count: 1 },
  ],
  pending: {
    queryable: 1,
    unqueryable: 4,
    releasedTimeout: 2,
    releasedByAdmin: 0,
    lateSuccess: 1,
  },
  versions: [
    {
      version: 4,
      effectiveAt: '2026-09-18T01:00:00.000Z',
      source: 'BUNDLE',
      upstreamModelIds: ['alpha-fast'],
      upstreamChanged: true,
    },
  ],
}
const failedTask = {
  id: '85000000-0000-7000-8000-000000000001',
  customerId: 'customer-a',
  customerName: 'uatcustomer',
  customerModelId: 'version-a',
  displayNameSnapshot: 'Alpha model',
  outputSummaries: [
    {
      id: 'output-a',
      outputIndex: 0,
      quotedPoints: '10',
      settledPoints: null,
      executionStatus: 'UNKNOWN',
      billingStatus: 'RELEASED_TIMEOUT',
      error: null,
      completedAt: null,
      billingFinalizedAt: null,
    },
  ],
  derivedExecutionStatus: 'UNKNOWN',
  executionSummary: {
    expectedResults: 1,
    recordedResults: 1,
    acceptedResults: 0,
    processingResults: 0,
    succeededResults: 0,
    failedResults: 0,
    unknownResults: 1,
    resultsIncomplete: false,
  },
  settlementProgress: 'COMPLETED',
  customerBillingStatus: 'RELEASED_TIMEOUT',
  settledPoints: null,
  outstandingDebtPoints: null,
  acceptedAt: '2026-09-18T01:20:00.000Z',
  completedAt: null,
}

it('keeps the first and last time labels while limiting dense ticks', () => {
  expect([...monitoringTickLabelIndexes(24)]).toEqual([0, 5, 9, 14, 18, 23])
  expect([...monitoringTickLabelIndexes(6)]).toEqual([0, 1, 2, 3, 4, 5])
  expect([...monitoringTickLabelIndexes(0)]).toEqual([])
})

function mount(focusModelKey?: string, onClearFocus = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = (key?: string) => (
    <QueryClientProvider client={client}>
      <ModelMonitoringOverview
        focusModelKey={key}
        onClearFocus={onClearFocus}
      />
    </QueryClientProvider>
  )
  const rendered = render(view(focusModelKey))
  return {
    ...rendered,
    setFocus: (key?: string) => rendered.rerender(view(key)),
  }
}

describe('model monitoring', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
    i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    mocks.getOverview.mockResolvedValue(overview)
    mocks.getFailures.mockResolvedValue(failures)
    mocks.getTaskLogs.mockResolvedValue({
      items: [failedTask],
      total: 1,
      page: 1,
      pageSize: 10,
    })
    mocks.control.mockResolvedValue({
      id: 'control-a',
      version: 4,
      status: 'PUBLISHED',
      effectiveAt: '2026-09-19T00:00:00.000Z',
    })
  })

  it('formats numbers in the app language code zhCN, which Intl does not accept directly', async () => {
    await i18next.changeLanguage('zhCN')
    mount()
    expect(
      await screen.findByRole('heading', { name: 'Alpha model' })
    ).toBeVisible()
  })

  it('shows totals, the server order with health and selects the first model', async () => {
    mount()
    const table = await screen.findByRole('table', { name: 'Models' })
    expect(mocks.getOverview).toHaveBeenCalledWith(
      expect.objectContaining({ window: 'week', page: 1, sortBy: 'failures' }),
      expect.anything()
    )
    expect(mocks.getOverview.mock.calls[0]?.[0]).not.toHaveProperty('origin')
    const totals = screen.getByLabelText('Overview')
    expect(totals).toHaveTextContent('1 / 0')
    expect(totals).toHaveTextContent('12 / 31 determined results')
    expect(totals).toHaveTextContent(
      'Frozen 5 (cannot be queried 3) · released 3'
    )
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Alpha model')
    expect(rows[0]).toHaveAttribute('aria-selected', 'true')
    expect(
      within(rows[0] as HTMLElement).getByRole('button', {
        name: /^Abnormal\. Last interval failure rate 100% \(11 \/ 11\), at or above 30%/,
      })
    ).toBeVisible()
    expect(within(rows[1] as HTMLElement).getByText('Disabled')).toBeVisible()
    expect(
      await screen.findByRole('heading', { name: 'Alpha model' })
    ).toBeVisible()
  })

  it("shows one model's failure causes, recent failed tasks and the exact task-log link", async () => {
    mount()
    const causes = await screen.findByRole('region', { name: 'Failure reason' })
    expect(mocks.getFailures).toHaveBeenCalledWith(
      'image.alpha',
      { from: overview.from, to: overview.to },
      expect.anything()
    )
    const items = await within(causes).findAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Pending · cannot be queried4',
      'API provider rate limited3',
      'Released after timeout2',
      'Pending · still querying1',
      'Succeeded after release (not delivered)1',
      'Administrator confirmed the provider failure1',
    ])
    const recent = screen.getByRole('region', { name: 'Recent failed tasks' })
    fireEvent.click(
      await within(recent).findByRole('button', {
        name: `Open task ${failedTask.id}`,
      })
    )
    expect(
      screen.getByRole('dialog', { name: 'Task details' })
    ).toHaveTextContent(failedTask.id)
    expect(within(recent).getByText('Released after timeout')).toBeVisible()
    expect(mocks.getTaskLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        modelKey: 'image.alpha',
        outcome: 'FAILED_OR_PENDING',
        executionOrigin: 'REAL',
        from: overview.from,
        to: overview.to,
        pageSize: 10,
        sortBy: 'acceptedAt',
        sortOrder: 'desc',
      }),
      expect.anything()
    )
    const link = within(recent).getByRole('link', {
      name: 'View in task records',
    })
    expect(
      new URL(link.getAttribute('href') ?? '', 'http://x').searchParams.get(
        'outcome'
      )
    ).toBe('FAILED_OR_PENDING')
    expect(screen.getByRole('button', { name: 'Version 4' })).toBeVisible()
  })

  it('narrows the detail to one interval and back', async () => {
    mount()
    const table = await screen.findByRole('table', { name: 'Models' })
    const interval = within(table).getAllByRole('button', {
      name: /^Alpha model\. .*Succeeded 0 · failed 11/,
    })[0] as HTMLElement
    fireEvent.click(interval)
    expect(interval).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() =>
      expect(mocks.getFailures).toHaveBeenCalledWith(
        'image.alpha',
        { from: '2026-09-18T01:00:00.000Z', to: '2026-09-18T02:00:00.000Z' },
        expect.anything()
      )
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Show the whole range' })
    )
    expect(interval).toHaveAttribute('aria-pressed', 'false')
  })

  it('sends filters and sorting, and shows each filter as a removable tag', async () => {
    mount()
    await screen.findByRole('table', { name: 'Models' })
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Photo 1' }))
    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({ tagId: 'tag-a', page: 1 }),
        expect.anything()
      )
    )
    const tags = screen.getByRole('list', { name: 'Active filters' })
    fireEvent.click(
      within(tags).getByRole('button', {
        name: /Remove filter Model categories/,
      })
    )
    await waitFor(() =>
      expect(mocks.getOverview.mock.calls.at(-1)?.[0]).not.toHaveProperty(
        'tagId'
      )
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Sort by Failure rate' })
    )
    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'failureRate', sortOrder: 'desc' }),
        expect.anything()
      )
    )
  })

  it('applies only a valid custom range, hides the panel on a second click and returns to a preset', async () => {
    mount()
    await screen.findByRole('table', { name: 'Models' })
    const customButton = screen.getByRole('button', { name: 'Custom range' })
    fireEvent.click(customButton)
    expect(screen.getByRole('group', { name: 'Custom range' })).toBeVisible()
    fireEvent.click(customButton)
    expect(
      screen.queryByRole('group', { name: 'Custom range' })
    ).not.toBeInTheDocument()
    fireEvent.click(customButton)
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Start time'), {
      target: { value: '2026-09-01T00:00:00.000Z' },
    })
    fireEvent.change(screen.getByLabelText('End time'), {
      target: { value: '2026-10-02T00:00:00.000Z' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Select a positive time range of at most 30 days'
    )
    fireEvent.change(screen.getByLabelText('End time'), {
      target: { value: '2026-09-15T12:30:00.000Z' },
    })
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({
          window: 'custom',
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-15T12:30:00.000Z',
          page: 1,
        }),
        expect.anything()
      )
    )
    expect(
      screen.queryByRole('group', { name: 'Custom range' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Last hour' }))
    await waitFor(() => {
      const query = mocks.getOverview.mock.calls.at(-1)?.[0]
      expect(query).toEqual(
        expect.objectContaining({ window: 'hour', page: 1 })
      )
      expect(query).not.toHaveProperty('from')
    })
  })

  it('disables the selected model from its detail with the expected version', async () => {
    mount()
    const heading = await screen.findByRole('heading', { name: 'Alpha model' })
    const card = heading.closest('[data-slot="card"]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: 'Disable model' }))
    const dialog = await screen.findByRole('dialog', { name: 'Disable model' })
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: 'MAINTENANCE' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Disable model' })
    )
    await waitFor(() =>
      expect(mocks.control).toHaveBeenCalledWith('image.alpha', {
        enabled: false,
        expectedVersion: 3,
        reasonCode: 'MAINTENANCE',
        note: '',
        confirmed: true,
      })
    )
  })

  it('keeps the control dialog open and explains a version conflict', async () => {
    mocks.control.mockRejectedValueOnce({ response: { status: 409 } })
    mount()
    const heading = await screen.findByRole('heading', { name: 'Alpha model' })
    fireEvent.click(
      within(heading.closest('[data-slot="card"]') as HTMLElement).getByRole(
        'button',
        { name: 'Disable model' }
      )
    )
    const dialog = await screen.findByRole('dialog', { name: 'Disable model' })
    fireEvent.change(within(dialog).getByLabelText(/Reason/), {
      target: { value: 'MAINTENANCE' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Disable model' })
    )
    expect(
      await within(dialog).findByText(
        'The model state changed. Refresh and review before retrying.'
      )
    ).toBeVisible()
  })

  it('stays on the next page while it loads instead of falling back to the previous page', async () => {
    let releaseSecondPage: (value: typeof overview) => void = () => undefined
    mocks.getOverview.mockImplementation((query: { page: number }) =>
      query.page === 2
        ? new Promise((resolve) => {
            releaseSecondPage = resolve
          })
        : Promise.resolve({ ...overview, total: 22 })
    )
    mount()
    await screen.findByRole('table', { name: 'Models' })
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything()
      )
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.getByText('Page 2 of 3')).toBeVisible()
    expect(mocks.getOverview.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({ page: 2 })
    )
    releaseSecondPage({ ...overview, page: 2, total: 22 })
    await waitFor(() => expect(screen.getByText('Page 2 of 3')).toBeVisible())
  })

  it('filters a model opened from the usage ranking by its exact key, wherever it ranks', async () => {
    const [alpha, beta] = overview.rows as [
      (typeof overview.rows)[number],
      (typeof overview.rows)[number],
    ]
    // Without the exact filter the target ranks on page 2 behind ten longer keys.
    mocks.getOverview.mockImplementation(async (query: { modelKey?: string }) =>
      query.modelKey === 'image.alpha'
        ? { ...overview, rows: [alpha], total: 1 }
        : {
            ...overview,
            rows: [{ ...beta, modelKey: 'image.alpha.fast' }],
            total: 11,
          }
    )
    const onClearFocus = vi.fn()
    const { setFocus } = mount('image.alpha', onClearFocus)
    expect(
      await screen.findByRole('heading', { name: 'Alpha model' })
    ).toBeVisible()
    expect(mocks.getOverview).toHaveBeenCalledTimes(1)
    expect(mocks.getOverview.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ modelKey: 'image.alpha' })
    )
    expect(mocks.getOverview.mock.calls[0]?.[0]).not.toHaveProperty('search')

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove filter Model: Alpha model' })
    )
    // The tag asks the page to drop modelKey from the address; the page then renders without it.
    expect(onClearFocus).toHaveBeenCalledTimes(1)
    setFocus(undefined)
    expect(
      await screen.findByRole('heading', { name: 'Beta model' })
    ).toBeVisible()
    expect(mocks.getOverview.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      'modelKey'
    )
  })

  it('resets the selected interval on pagination and follows the server-clamped page', async () => {
    let clamped = false
    mocks.getOverview.mockImplementation(async (query: { page: number }) => {
      if (query.page === 2) clamped = true
      return {
        ...overview,
        page: 1,
        total: clamped ? 1 : 22,
        rows: clamped ? overview.rows.slice(0, 1) : overview.rows,
      }
    })
    mount()
    const table = await screen.findByRole('table', { name: 'Models' })
    const interval = within(table).getAllByRole('button', {
      name: /^Alpha model\. .*Succeeded 0 · failed 11/,
    })[0] as HTMLElement
    fireEvent.click(interval)
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    await waitFor(() =>
      expect(mocks.getOverview).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything()
      )
    )
    await waitFor(() => expect(screen.getByText('Page 1 of 1')).toBeVisible())
    expect(
      within(screen.getByRole('table', { name: 'Models' })).getAllByRole(
        'button',
        { name: /^Alpha model\. .*Succeeded 0 · failed 11/ }
      )[0]
    ).toHaveAttribute('aria-pressed', 'false')
  })
})

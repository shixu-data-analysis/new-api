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
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

import { executionWaitDurationParts } from '../ExecutionCapacityOverview'
import { ExecutionSettings } from '../ExecutionSettings'

const mocks = vi.hoisted(() => ({
  getCanvasExecutionOverview: vi.fn(),
  getCanvasExecutionCapacity: vi.fn(),
  getCanvasExecutionWaits: vi.fn(),
  getCanvasExecutionWaitDetail: vi.fn(),
  getCanvasCredentialGroupExecution: vi.fn(),
  publishCanvasExecutionPolicy: vi.fn(),
  previewCanvasExecutionError: vi.fn(),
}))
vi.mock('../../execution-api', () => ({
  getCanvasExecutionOverview: mocks.getCanvasExecutionOverview,
  getCanvasExecutionCapacity: mocks.getCanvasExecutionCapacity,
  getCanvasExecutionWaits: mocks.getCanvasExecutionWaits,
  getCanvasExecutionWaitDetail: mocks.getCanvasExecutionWaitDetail,
  getCanvasCredentialGroupExecution: mocks.getCanvasCredentialGroupExecution,
  publishCanvasExecutionPolicy: mocks.publishCanvasExecutionPolicy,
  previewCanvasExecutionError: mocks.previewCanvasExecutionError,
}))
vi.mock('@/features/system-settings/components/form-navigation-guard', () => ({
  FormNavigationGuard: (props: { when: boolean }) => (
    <div data-testid='navigation-guard' data-active={String(props.when)} />
  ),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const channelId = '85000000-0000-7000-8000-000000000001'
const providerId = '85000000-0000-7000-8000-000000000002'
const credentialGroupId = '85000000-0000-7000-8000-000000000003'
const capacityMeta = {
  page: 1,
  pageSize: 20,
  total: 1,
  providers: [{ id: 'provider-a', name: 'Provider A' }],
}
const systemRule = {
  id: 'system.http.429',
  version: 1,
  enabled: true,
  ruleType: 'HTTP_STATUS' as const,
  httpStatus: 429,
  conditions: [],
  category: 'PROVIDER_RATE_LIMITED' as const,
  clientMessages: Object.fromEntries(
    ['zhCN', 'en', 'fr', 'ru', 'ja', 'vi', 'zhTW'].map((locale) => [
      locale,
      'Please retry later.',
    ])
  ),
  adminNote: 'Default rate limit',
  source: 'SYSTEM' as const,
}

function mount(
  props: {
    view?: 'overview' | 'credentialGroup'
    credentialGroupId?: string
  } = {}
) {
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
      <ExecutionSettings {...props} />
    </QueryClientProvider>
  )
}

beforeAll(async () => {
  await i18next.init({ lng: 'en', resources: { en, zhCN: zh } })
})
beforeEach(async () => {
  await i18next.changeLanguage('en')
  vi.clearAllMocks()
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
        queueName: 'canvas-tasks',
        mode: 'REAL',
        workerId: 'worker-2',
        status: 'RUNNING',
        credentialsConfigured: false,
        startedAt: null,
        heartbeatAt: '2026-09-06T00:00:00Z',
        leaseExpiresAt: '2999-09-06T00:01:00Z',
        stoppedAt: null,
        updatedAt: null,
      },
      {
        queueName: 'canvas-tasks-priority',
        mode: 'REAL',
        workerId: 'worker-unknown-status',
        status: 'LEASE_ACTIVE_INTERNAL',
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
  mocks.getCanvasExecutionCapacity.mockResolvedValue({
    ...capacityMeta,
    total: 0,
    items: [],
  })
  mocks.getCanvasExecutionWaits.mockResolvedValue({
    page: 1,
    pageSize: 20,
    total: 0,
    items: [],
  })
  mocks.getCanvasExecutionWaitDetail.mockResolvedValue({})
  mocks.getCanvasCredentialGroupExecution.mockResolvedValue({
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
    credentialGroupId,
    providerId,
    group: {
      kind: 'CREDENTIAL_GROUP_POLICY',
      scopeKey: credentialGroupId,
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
      effective: {
        rules: [systemRule],
        showSafeErrorDetailsToCustomer: true,
      },
      inherited: [],
    },
    limits: {
      kind: 'CREDENTIAL_GROUP_LIMITS',
      scopeKey: credentialGroupId,
      version: null,
      configured: {},
      effective: { rules: [] },
      inherited: [],
    },
    models: [
      {
        id: '85000000-0000-7000-8000-000000000004',
        modelKey: 'canvas.image',
        publicName: 'Canvas Image',
        providerChannelId: channelId,
      },
      {
        id: '85000000-0000-7000-8000-000000000005',
        modelKey: 'canvas.video',
        publicName: 'Canvas Video',
        providerChannelId: channelId,
      },
      {
        id: '85000000-0000-7000-8000-000000000006',
        modelKey: 'canvas.audio',
        publicName: 'Canvas Audio',
        providerChannelId: channelId,
      },
    ],
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
      messageSource: 'SYSTEM_DEFAULT',
      clientHttpStatus: 429,
    },
  })
})
afterEach(() => vi.useRealTimers())

describe('execution settings', () => {
  it('keeps the capacity card usable when the independent execution overview fails', async () => {
    mocks.getCanvasExecutionOverview.mockRejectedValueOnce(
      new Error('overview unavailable')
    )
    mocks.getCanvasExecutionCapacity.mockResolvedValue({
      ...capacityMeta,
      items: [
        {
          credentialGroupId,
          providerName: 'Provider A',
          credentialGroupName: 'Primary',
          requestConcurrency: { used: 0, limit: 16 },
          asyncInFlight: { used: 0, limit: 30 },
          waitingTasks: 0,
          status: 'AVAILABLE',
          reasons: [],
        },
      ],
    })
    mount()
    expect(await screen.findByText('API Key group live capacity')).toBeVisible()
    await waitFor(() => expect(screen.getByText('Provider A')).toBeVisible())
    expect(screen.getByText('Available capacity')).toBeVisible()
    expect(
      screen.getByText(/even when the group has free capacity, a task may wait/)
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Collapse explanation' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Task submission and execution limits')
    ).not.toBeInTheDocument()
  })

  it('distinguishes denied capacity access and retries', async () => {
    const user = userEvent.setup()
    mocks.getCanvasExecutionCapacity
      .mockRejectedValueOnce({ response: { status: 403 } })
      .mockResolvedValue({ ...capacityMeta, total: 0, items: [] })
    mount()
    expect(
      await screen.findByText(
        'You do not have permission to view execution capacity.'
      )
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByText('No execution capacity records')
    ).toBeVisible()
  })

  it('reports an expired session while loading waiting tasks', async () => {
    const user = userEvent.setup()
    mocks.getCanvasExecutionCapacity.mockResolvedValue({
      ...capacityMeta,
      items: [
        {
          credentialGroupId,
          providerName: 'Provider A',
          credentialGroupName: 'Primary',
          requestConcurrency: { used: 1, limit: 16 },
          asyncInFlight: { used: 1, limit: 30 },
          waitingTasks: 1,
          status: 'AVAILABLE',
        },
      ],
    })
    mocks.getCanvasExecutionWaits.mockRejectedValue({
      response: { status: 401 },
    })
    mount()
    await waitFor(() => expect(screen.getByText('Primary')).toBeVisible())
    await user.click(screen.getByRole('button', { name: 'View waiting tasks' }))
    await waitFor(() =>
      expect(mocks.getCanvasExecutionWaits).toHaveBeenCalled()
    )
    expect(
      await screen.findByText('Your session has expired. Sign in again.')
    ).toBeVisible()
  })

  it('shows separate instance and group reasons without inferring instance usage from group counters', async () => {
    mocks.getCanvasExecutionCapacity.mockResolvedValue({
      ...capacityMeta,
      items: [
        {
          credentialGroupId,
          providerName: 'Provider A',
          credentialGroupName:
            'A very long credential group name that must remain readable on narrow screens',
          requestConcurrency: { used: 0, limit: 16 },
          asyncInFlight: { used: 30, limit: 30 },
          waitingTasks: 0,
          status: 'MULTIPLE_LIMITS',
          reasons: ['INSTANCE_CONCURRENCY_FULL', 'ASYNC_IN_FLIGHT_FULL'],
        },
      ],
    })
    mount()
    await waitFor(() =>
      expect(
        screen.getByText('Executor instance concurrency full')
      ).toBeVisible()
    )
    expect(
      screen.getByText('Upstream unfinished asynchronous tasks full')
    ).toBeVisible()
    expect(
      screen.queryByText('Multiple capacity limits reached')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('API Key group request concurrency full')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'View waiting tasks' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/even when the group has free capacity, a task may wait/)
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Expand explanation' })
    ).not.toBeInTheDocument()
    expect(screen.getByText(/very long credential group name/)).toBeVisible()
  })

  it('uses the API reasons for each waiting task rather than copying all group reasons', async () => {
    const user = userEvent.setup()
    const wait = {
      taskId: 'wait-1',
      modelName: 'Canvas Image',
      credentialGroupId,
      stage: 'SUBMIT',
      blockingStatus: 'GROUP_REQUEST_CONCURRENCY_FULL',
      observedValue: '16',
      limitValue: '16',
      requestState: 'NOT_SENT',
      startedAt: '2026-09-13T08:00:00Z',
      nextAttemptAt: '2026-09-14T08:05:00Z',
      updatedAt: '2026-09-13T08:01:00Z',
    }
    mocks.getCanvasExecutionCapacity.mockResolvedValue({
      ...capacityMeta,
      items: [
        {
          credentialGroupId,
          providerName: 'Provider A',
          credentialGroupName: 'Primary',
          requestConcurrency: { used: 16, limit: 16 },
          asyncInFlight: { used: 30, limit: 30 },
          waitingTasks: 1,
          status: 'MULTIPLE_LIMITS',
          reasons: ['GROUP_REQUEST_CONCURRENCY_FULL', 'ASYNC_IN_FLIGHT_FULL'],
        },
      ],
    })
    mocks.getCanvasExecutionWaits.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [wait],
    })
    mocks.getCanvasExecutionWaitDetail.mockResolvedValue(wait)
    mount()
    await waitFor(() => expect(screen.getByText('Primary')).toBeVisible())
    await user.click(screen.getByRole('button', { name: 'View waiting tasks' }))
    await waitFor(() =>
      expect(mocks.getCanvasExecutionWaits).toHaveBeenCalled()
    )
    const waitingCard = screen
      .getAllByText('Waiting tasks')[0]
      .closest('[data-slot="card"]')
    expect(waitingCard).not.toBeNull()
    expect(
      within(waitingCard as HTMLElement).getByText(
        /API Key group request concurrency full/
      )
    ).toBeVisible()
    await user.click(await screen.findByRole('button', { name: 'Details' }))
    const drawer = await screen.findByRole('dialog')
    expect(drawer).toHaveTextContent('API Key group request concurrency full')
    expect(drawer).not.toHaveTextContent(
      'Upstream unfinished asynchronous tasks full'
    )
  })

  it('shows safe capacity and wait facts, then restores detail focus', async () => {
    const user = userEvent.setup()
    expect(
      executionWaitDurationParts(
        '2026-09-13T08:00:00Z',
        new Date('2026-09-13T08:12:00Z')
      )
    ).toEqual({ hours: 0, minutes: 12 })
    document.documentElement.dir = 'rtl'
    const wait = {
      taskId: '85000000-0000-7000-8000-000000000010',
      modelName: 'Canvas Image',
      credentialGroupId,
      stage: 'SUBMIT',
      blockingStatus: 'ASYNC_IN_FLIGHT_FULL',
      observedValue: '30',
      limitValue: '30',
      requestState: 'NOT_SENT',
      startedAt: '2026-09-13T08:00:00Z',
      nextAttemptAt: '2026-09-14T08:05:00Z',
      updatedAt: '2026-09-13T08:01:00Z',
    }
    const queryWait = {
      ...wait,
      taskId: '85000000-0000-7000-8000-000000000011',
      modelName: 'Canvas Video',
      stage: 'QUERY',
      requestState: 'ACCEPTED_BY_PROVIDER',
    }
    const uncertainWait = {
      ...wait,
      taskId: '85000000-0000-7000-8000-000000000012',
      modelName: 'Canvas Audio',
      requestState: 'MAY_HAVE_BEEN_SENT',
    }
    mocks.getCanvasExecutionCapacity.mockResolvedValue({
      ...capacityMeta,
      items: [
        {
          credentialGroupId,
          providerName: 'HFSY API',
          credentialGroupName: 'Primary',
          requestConcurrency: { used: 0, limit: 16 },
          asyncInFlight: { used: 30, limit: 30 },
          waitingTasks: 3,
          status: 'ASYNC_IN_FLIGHT_FULL',
        },
      ],
    })
    mocks.getCanvasExecutionWaits.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 3,
      items: [wait, queryWait, uncertainWait],
    })
    mocks.getCanvasExecutionWaitDetail.mockImplementation(async (taskId) => {
      if (taskId === queryWait.taskId) return queryWait
      if (taskId === uncertainWait.taskId) return uncertainWait
      return wait
    })
    mount()
    expect(await screen.findAllByText('HFSY API')).not.toHaveLength(0)
    expect(screen.queryByText('hfsyapi')).not.toBeInTheDocument()
    expect(
      screen
        .getByRole('region', { name: 'API Key group live capacity' })
        .querySelector('[data-slot="table-container"]')
    ).toHaveClass('overflow-x-auto')
    await user.click(
      screen.getAllByRole('button', { name: 'View waiting tasks' })[0]
    )
    expect((await screen.findAllByText('Submit'))[0]).toBeVisible()
    expect(screen.getAllByText('Query')[0]).toBeVisible()
    expect(screen.queryByText('Not sent')).not.toBeInTheDocument()
    const details = screen.getAllByRole('button', { name: 'Details' })[0]
    details.focus()
    await user.keyboard('{Enter}')
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Waiting task details')).toBeVisible()
    expect(drawer).toHaveTextContent('30 / 30')
    expect(drawer).toHaveTextContent('Not sent')
    expect(drawer).toHaveTextContent('2026')
    expect(drawer).not.toHaveTextContent(
      /attempt count|policy version|worker id|credential id|reason code/i
    )
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    expect(screen.getAllByText('Canvas Image')[0]).toBeVisible()
    const queryDetails = screen.getAllByRole('button', { name: 'Details' })[1]
    await user.click(queryDetails)
    expect(await screen.findByText('Accepted by provider')).toBeVisible()
    await user.keyboard('{Escape}')
    const uncertainDetails = screen.getAllByRole('button', {
      name: 'Details',
    })[2]
    await user.click(uncertainDetails)
    expect(await screen.findByText('May have been sent')).toBeVisible()
    document.documentElement.removeAttribute('dir')
    vi.useRealTimers()
  })

  it('shows effective global policy, recovery facts, and executor ownership', async () => {
    mount()
    const capacity = await screen.findByText('API Key group live capacity')
    const workers = await screen.findByText('Running workers')
    const recovery = screen.getByText('System recovery')
    const limits = screen.getByText('Task submission and execution limits')
    for (const title of [limits, capacity, workers, recovery]) {
      expect(title.closest('[data-slot="card"]')).toHaveAttribute(
        'data-size',
        'default'
      )
    }
    expect(
      limits.compareDocumentPosition(capacity) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      capacity.compareDocumentPosition(workers) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      workers.compareDocumentPosition(recovery) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    const overviewLayout = limits.closest('.space-y-6')?.parentElement
    expect(overviewLayout).not.toBeNull()
    expect(overviewLayout).toContainElement(capacity)
    const workerSection = workers.closest('section')
    expect(workerSection).not.toBeNull()
    const workerTable = within(workerSection as HTMLElement)
    expect(workerTable.getAllByRole('columnheader')).toHaveLength(5)
    expect(
      workerTable.getByRole('columnheader', { name: 'Queue' })
    ).toBeVisible()
    expect(
      workerTable.getByRole('columnheader', { name: 'Latest heartbeat' })
    ).toBeVisible()
    expect(screen.getByText('3 workers')).toBeVisible()
    expect(i18next.t('1 worker')).toBe('1 worker')
    expect(screen.getByText('Mock mode')).toBeVisible()
    expect(screen.getAllByText('Real mode')).toHaveLength(2)
    expect(screen.getAllByText('Running')).toHaveLength(2)
    expect(screen.getByText('Unknown status')).toBeVisible()
    expect(screen.queryByText('MOCK')).not.toBeInTheDocument()
    expect(screen.queryByText('RUNNING')).not.toBeInTheDocument()
    expect(screen.queryByText('LEASE_ACTIVE_INTERNAL')).not.toBeInTheDocument()
    expect(screen.queryByText('worker-expired')).not.toBeInTheDocument()
    expect(screen.queryByText('worker-stopped')).not.toBeInTheDocument()
    expect(screen.queryByText('worker-1')).not.toBeInTheDocument()
    expect(screen.queryByText('worker-2')).not.toBeInTheDocument()
    expect(screen.queryByText('worker-unknown-status')).not.toBeInTheDocument()
    const recoverySection = recovery.closest('section')
    expect(recoverySection).not.toBeNull()
    const recoveryFacts = within(recoverySection as HTMLElement)
    expect(
      recoveryFacts.getByText('Heartbeat interval (milliseconds)')
    ).toBeVisible()
    expect(
      recoveryFacts.getByText('Lease duration (milliseconds)')
    ).toBeVisible()
    expect(
      recoveryFacts.getByText('Scan interval (milliseconds)')
    ).toBeVisible()
    expect(recoveryFacts.getByText('Default instances')).toBeVisible()
    expect(recoveryFacts.getAllByText('10000')).toHaveLength(2)
    expect(recoveryFacts.getByText('60000')).toBeVisible()
    expect(recoveryFacts.getByText('4')).toBeVisible()
    const globalForm = screen.getByRole('form', {
      name: 'Global execution limits',
    })
    const globalCard = globalForm.closest('[data-slot="card"]')
    expect(globalCard).not.toBeNull()
    expect(
      within(globalCard as HTMLElement)
        .getByText('Version 2')
        .closest('[data-slot="badge"]')
    ).toHaveAttribute('data-variant', 'secondary')
    const globalFields = globalForm.querySelector('.sm\\:grid-cols-2')
    expect(globalFields).toHaveClass(
      'sm:grid-cols-2',
      'lg:grid-cols-[repeat(3,minmax(10rem,14rem))]'
    )
    const capacityRegion = screen.getByRole('region', {
      name: 'API Key group live capacity',
    })
    expect(
      capacityRegion.querySelector('[data-slot="table-container"]')
    ).toHaveClass('overflow-x-auto')
    const workerScroll = screen
      .getAllByRole('region', { name: 'Running workers' })
      .find((region) => region.tabIndex === 0)
    expect(
      workerScroll?.querySelector('[data-slot="table-container"]')
    ).toHaveClass('overflow-x-auto')
    expect(screen.getByLabelText('Instance concurrency')).toHaveValue(16)
    expect(screen.queryByText(/^v2$/)).not.toBeInTheDocument()
  })

  it('uses the running-worker table empty state without exposing worker IDs', async () => {
    const overview = await mocks.getCanvasExecutionOverview()
    mocks.getCanvasExecutionOverview.mockResolvedValueOnce({
      ...overview,
      instances: [],
    })

    mount()

    const workerTitle = await screen.findByText('Running workers')
    const workerSection = workerTitle.closest('section')
    expect(workerSection).not.toBeNull()
    expect(
      within(workerSection as HTMLElement).getByText(
        'No running executor instances'
      )
    ).toBeVisible()
    expect(screen.getByText('0 workers')).toBeVisible()
  })

  it('renders the running-worker count from the active Chinese resources', async () => {
    const overview = await mocks.getCanvasExecutionOverview()
    mocks.getCanvasExecutionOverview.mockResolvedValueOnce({
      ...overview,
      instances: [
        ...overview.instances,
        {
          ...overview.instances[0],
          workerId: 'worker-4',
          queueName: 'canvas-tasks-low-priority',
        },
      ],
    })
    await i18next.changeLanguage('zhCN')

    mount()

    expect(await screen.findByText('4 个')).toBeVisible()
    expect(screen.queryByText('Running worker count')).not.toBeInTheDocument()
  })

  it('shows a localized scope instead of GLOBAL when restoring global defaults', async () => {
    await i18next.changeLanguage('zhCN')
    mount()

    fireEvent.click(await screen.findByRole('button', { name: '恢复默认' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('任务提交与执行限额')
    expect(dialog).not.toHaveTextContent('GLOBAL')
    expect(mocks.publishCanvasExecutionPolicy).not.toHaveBeenCalled()
  })

  it('requires confirmation before publishing global limits', async () => {
    mount()
    expect(screen.getByTestId('navigation-guard')).toHaveAttribute(
      'data-active',
      'false'
    )
    fireEvent.change(await screen.findByLabelText('Instance concurrency'), {
      target: { value: '20' },
    })
    expect(screen.getByTestId('navigation-guard')).toHaveAttribute(
      'data-active',
      'true'
    )
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
    mount({ view: 'credentialGroup', credentialGroupId })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Test error mappings' })
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Run preview' }))
    await waitFor(() =>
      expect(mocks.previewCanvasExecutionError).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId,
          httpStatus: 429,
          locale: 'en',
          rules: [
            expect.objectContaining({
              id: systemRule.id,
              source: 'SYSTEM',
              ruleType: 'HTTP_STATUS',
            }),
          ],
        })
      )
    )
    expect(await screen.findByText('Please retry later.')).toBeVisible()
    expect(mocks.publishCanvasExecutionPolicy).not.toHaveBeenCalled()
  })

  it('shows the execution-policy field explanations beside their inputs', async () => {
    mount({ view: 'credentialGroup', credentialGroupId })
    await screen.findByText('API Key group execution policy')
    expect(
      screen.getByText(
        'Set timeouts and base capacity for this group. Additional limits below apply by target. Error mappings are shared by the provider.'
      )
    ).toBeVisible()

    const explanations = [
      [
        'requestTimeoutMs',
        'The maximum wait for one non-streaming upstream request or result download.',
      ],
      [
        'streamIdleTimeoutMs',
        'The maximum time a streaming response may go without new data.',
      ],
      [
        'pollIntervalMs',
        'How often an asynchronous task checks the upstream result; this does not control client refresh.',
      ],
      [
        'deadlineMs',
        'The asynchronous result deadline measured from task acceptance, not a per-request timeout.',
      ],
      [
        'requestConcurrency',
        'Concurrent upstream requests across all instances for this API Key group; full capacity queues admitted tasks.',
      ],
      [
        'Upstream unfinished asynchronous task limit',
        'Unfinished upstream asynchronous tasks for this group; full capacity queues new asynchronous submissions. Result queries do not use this allowance.',
      ],
    ]
    for (const [label, description] of explanations) {
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(
        description
      )
    }
    expect(mocks.publishCanvasExecutionPolicy).not.toHaveBeenCalled()
  })

  it('shows the execution-policy explanations in Chinese', async () => {
    await i18next.changeLanguage('zhCN')
    mount({ view: 'credentialGroup', credentialGroupId })
    await screen.findByText('API Key 组执行策略')
    expect(
      screen.getByText(
        '设置本组超时与基础容量；下方附加限额按对象叠加生效。错误映射由服务商共用。'
      )
    ).toBeVisible()
    expect(
      screen.getByLabelText('请求超时（毫秒）')
    ).toHaveAccessibleDescription(
      '单次非流式上游请求及结果下载的最长等待时间。'
    )
    expect(
      screen.getByLabelText('流空闲超时（毫秒）')
    ).toHaveAccessibleDescription('流式响应连续没有新数据时的最长等待时间。')
    expect(
      screen.getByLabelText('轮询间隔（毫秒）')
    ).toHaveAccessibleDescription(
      '异步任务向上游查询结果的间隔，不控制客户端刷新。'
    )
    expect(
      screen.getByLabelText('截止时间（毫秒）')
    ).toHaveAccessibleDescription(
      '从任务受理起计算的异步结果期限，不是单次请求超时。'
    )
  })

  it('marks a preview stale after its language or inputs change', async () => {
    mount({ view: 'credentialGroup', credentialGroupId })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Test error mappings' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Run preview' }))
    expect(await screen.findByText('Please retry later.')).toBeVisible()

    fireEvent.change(screen.getByLabelText('Client response language'), {
      target: { value: 'zhCN' },
    })
    expect(
      screen.getByText('Test result is out of date. Run preview again.')
    ).toBeVisible()
    const output = screen.getByText('Client output').parentElement
    expect(output).not.toBeNull()
    expect(within(output as HTMLElement).getByText('English')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Run preview' }))
    await waitFor(() =>
      expect(mocks.previewCanvasExecutionError).toHaveBeenLastCalledWith(
        expect.objectContaining({ locale: 'zhCN' })
      )
    )
    expect(
      screen.queryByText('Test result is out of date. Run preview again.')
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        within(
          screen.getByText('Client output').parentElement as HTMLElement
        ).getByText('简体中文')
      ).toBeVisible()
    )
  })

  it('allows Provider-level error simulation when no model is bound', async () => {
    const data = await mocks.getCanvasCredentialGroupExecution()
    mocks.getCanvasCredentialGroupExecution.mockClear()
    mocks.getCanvasCredentialGroupExecution.mockResolvedValueOnce({
      ...data,
      models: [],
    })
    mount({ view: 'credentialGroup', credentialGroupId })

    fireEvent.click(
      await screen.findByRole('button', { name: 'Test error mappings' })
    )
    const run = screen.getByRole('button', { name: 'Run preview' })
    expect(run).toBeEnabled()
    fireEvent.click(run)
    await waitFor(() =>
      expect(mocks.previewCanvasExecutionError).toHaveBeenCalledWith(
        expect.objectContaining({ providerId })
      )
    )
  })

  it('defaults the Provider safe detail setting to enabled and publishes a reviewed disable', async () => {
    mount({ view: 'credentialGroup', credentialGroupId })

    const toggle = await screen.findByRole('checkbox', {
      name: 'Show safe error details to customers',
    })
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(screen.getByTestId('navigation-guard')).toHaveAttribute(
      'data-active',
      'true'
    )

    const errorForm = screen.getByRole('form', { name: 'Error mappings' })
    fireEvent.click(
      within(errorForm).getByRole('button', { name: 'Review publication' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(
      'Show safe error details to customers: Disabled'
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))

    await waitFor(() =>
      expect(mocks.publishCanvasExecutionPolicy.mock.calls[0]?.[0]).toEqual({
        kind: 'ERROR_MAPPING',
        scopeKey: providerId,
        config: { rules: [], showSafeErrorDetailsToCustomer: false },
      })
    )
  })

  it('shows a previously disabled Provider safe detail setting as unchecked', async () => {
    const data = await mocks.getCanvasCredentialGroupExecution()
    mocks.getCanvasCredentialGroupExecution.mockClear()
    mocks.getCanvasCredentialGroupExecution.mockResolvedValueOnce({
      ...data,
      errors: {
        ...data.errors,
        configured: { showSafeErrorDetailsToCustomer: false },
        effective: {
          ...data.errors.effective,
          showSafeErrorDetailsToCustomer: false,
        },
      },
    })

    mount({ view: 'credentialGroup', credentialGroupId })

    expect(
      await screen.findByRole('checkbox', {
        name: 'Show safe error details to customers',
      })
    ).not.toBeChecked()
    expect(screen.getByTestId('navigation-guard')).toHaveAttribute(
      'data-active',
      'false'
    )
  })

  it('keeps internal rule IDs in expandable details and reviews readable mapping changes', async () => {
    mount({ view: 'credentialGroup', credentialGroupId })

    expect(screen.queryByText(systemRule.id)).not.toBeInTheDocument()
    expect(await screen.findByText('System built-in')).toBeVisible()
    fireEvent.click(screen.getByText('Rule details'))
    expect(screen.getByText(systemRule.id)).toBeVisible()
    expect(screen.queryByLabelText('Mapping type')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add custom mapping' }))
    expect(screen.getByText('New custom mapping')).toBeVisible()
    fireEvent.change(screen.getByLabelText('JSON field path'), {
      target: { value: 'error.code' },
    })
    fireEvent.change(screen.getByLabelText('Match value'), {
      target: { value: 'RATE_LIMIT' },
    })
    const customMessageToggles = screen.getAllByText(
      'Use custom client messages'
    )
    const customMessageToggle = customMessageToggles.at(-1)
    expect(customMessageToggle).toBeDefined()
    fireEvent.click(customMessageToggle as HTMLElement)
    fireEvent.change(screen.getByLabelText('Client message · English'), {
      target: { value: 'Please wait and retry.' },
    })

    const errorForm = screen.getByRole('form', { name: 'Error mappings' })
    fireEvent.click(
      within(errorForm).getByRole('button', { name: 'Review publication' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Added: Unknown provider error')
    expect(dialog).toHaveTextContent('error.code EQUALS RATE_LIMIT')
    expect(dialog).toHaveTextContent('en: Please wait and retry.')
    expect(dialog).toHaveTextContent('Previous custom JSON order')
    expect(dialog).toHaveTextContent('New custom JSON order')
    expect(dialog).not.toHaveTextContent('custom.error.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))

    await waitFor(() => {
      const input = mocks.publishCanvasExecutionPolicy.mock.calls[0]?.[0]
      expect(input).toMatchObject({
        kind: 'ERROR_MAPPING',
        scopeKey: providerId,
        config: {
          rules: [
            {
              id: expect.stringMatching(/^custom\.error\./),
              source: 'CUSTOM',
              ruleType: 'JSON',
              httpStatus: null,
              conditions: [
                {
                  path: 'error.code',
                  operator: 'EQUALS',
                  valueType: 'STRING',
                  value: 'RATE_LIMIT',
                },
              ],
              clientMessages: { en: 'Please wait and retry.' },
            },
          ],
        },
      })
    })
  })

  it('reviews the readable custom JSON order before and after reordering', async () => {
    const data = await mocks.getCanvasCredentialGroupExecution()
    mocks.getCanvasCredentialGroupExecution.mockClear()
    const firstRule = {
      ...systemRule,
      id: 'custom.first',
      ruleType: 'JSON' as const,
      httpStatus: null,
      conditions: [
        {
          path: 'error.code',
          operator: 'EQUALS' as const,
          valueType: 'STRING' as const,
          value: 'AUTH',
        },
      ],
      category: 'PROVIDER_AUTH_FAILED' as const,
      clientMessages: { en: 'Old authentication message.' },
      source: 'CUSTOM' as const,
    }
    const secondRule = {
      ...firstRule,
      id: 'custom.second',
      conditions: [{ ...firstRule.conditions[0], value: 'RATE_LIMIT' }],
      category: 'PROVIDER_RATE_LIMITED' as const,
    }
    mocks.getCanvasCredentialGroupExecution.mockResolvedValueOnce({
      ...data,
      errors: {
        ...data.errors,
        effective: {
          rules: [systemRule, firstRule, secondRule],
          showSafeErrorDetailsToCustomer: true,
        },
      },
    })
    mount({ view: 'credentialGroup', credentialGroupId })

    const authValue = (await screen.findAllByLabelText('Match value')).find(
      (input) => (input as HTMLInputElement).value === 'AUTH'
    )
    const authMessage = screen
      .getAllByLabelText('Client message · English')
      .find(
        (input) =>
          (input as HTMLTextAreaElement).value === 'Old authentication message.'
      )
    expect(authValue).toBeDefined()
    expect(authMessage).toBeDefined()
    if (!authValue || !authMessage) {
      throw new Error('Authentication mapping fields are missing')
    }
    fireEvent.change(authValue, { target: { value: 'DENIED' } })
    fireEvent.change(authMessage, {
      target: { value: 'New authentication message.' },
    })
    const moveDown = await screen.findAllByRole('button', {
      name: 'Move mapping down',
    })
    fireEvent.click(moveDown[0])
    const errorForm = screen.getByRole('form', { name: 'Error mappings' })
    fireEvent.click(
      within(errorForm).getByRole('button', { name: 'Review publication' })
    )
    const dialog = await screen.findByRole('alertdialog')
    const previous = within(dialog).getByText(
      'Previous custom JSON order:'
    ).parentElement
    const next = within(dialog).getByText(
      'New custom JSON order:'
    ).parentElement
    expect(dialog).toHaveTextContent(
      /Updated: From: Provider authentication failed.*AUTH.*Old authentication message.*To: Provider authentication failed.*DENIED.*New authentication message/
    )
    expect(previous).toHaveTextContent(
      /Provider authentication failed.*Provider rate limited/
    )
    expect(next).toHaveTextContent(
      /Provider rate limited.*Provider authentication failed/
    )
    expect(dialog).not.toHaveTextContent(/custom\.(first|second)/)
  })

  it('publishes an administrator-added limit rule only after confirmation', async () => {
    mount({ view: 'credentialGroup', credentialGroupId })
    fireEvent.click(await screen.findByRole('button', { name: 'Add rule' }))
    const limitForm = screen.getByRole('form', { name: 'Limit rules' })
    expect(
      within(limitForm).getByRole('heading', { name: 'Add rule' })
    ).toBeVisible()
    expect(
      within(limitForm).getByRole('button', { name: 'Add rule' })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(limitForm).getByText(
        'Set group concurrency and unfinished asynchronous task limits above.'
      )
    ).toBeVisible()
    const editor = within(limitForm)
      .getByRole('heading', { name: 'Add rule' })
      .closest('#limit-rule-editor')
    expect(editor).not.toBeNull()
    expect(
      within(editor as HTMLElement).getByRole('button', {
        name: 'Review publication',
      })
    ).toBeVisible()
    expect(
      within(editor as HTMLElement).queryByRole('checkbox', {
        name: 'Enabled',
      })
    ).not.toBeInTheDocument()

    expect(
      within(limitForm).queryByLabelText('Rule ID')
    ).not.toBeInTheDocument()
    fireEvent.change(within(limitForm).getByLabelText('Upper limit'), {
      target: { value: '25' },
    })
    fireEvent.click(
      within(limitForm).getByRole('button', { name: 'Review publication' })
    )

    expect(mocks.publishCanvasExecutionPolicy).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Rules')
    expect(dialog).toHaveTextContent('1')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))

    await waitFor(() =>
      expect(mocks.publishCanvasExecutionPolicy.mock.calls[0]?.[0]).toEqual({
        kind: 'CREDENTIAL_GROUP_LIMITS',
        scopeKey: credentialGroupId,
        config: {
          rules: [
            {
              id: expect.stringMatching(/^custom\.limit\./),
              enabled: true,
              scope: 'CREDENTIAL_GROUP',
              metric: 'RPM',
              limit: '25',
            },
          ],
        },
      })
    )
  })

  it('keeps the additional-limit table and its single empty state visible in Chinese', async () => {
    await i18next.changeLanguage('zhCN')
    mount({ view: 'credentialGroup', credentialGroupId })
    const rules = await screen.findByRole('region', {
      name: '附加限额规则',
    })
    expect(
      screen.getByText(
        '仅适用于当前 API Key 组及其已绑定模型；组并发与未完成异步任务上限在上方设置。'
      )
    ).toBeVisible()
    const table = within(rules).getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent)
    ).toEqual(['适用对象', '指标', '上限', '状态', '操作'])
    expect(
      within(table).getByRole('cell', {
        name: '未设置附加规则；仍受上方组容量和平台限额约束。',
      })
    ).toHaveAttribute('colspan', '5')
    expect(
      screen.getAllByText('未设置附加规则；仍受上方组容量和平台限额约束。')
    ).toHaveLength(1)
  })

  it('offers only RPM and TPM for the whole group and four named metrics for models', async () => {
    await i18next.changeLanguage('zhCN')
    mount({ view: 'credentialGroup', credentialGroupId })
    fireEvent.click(await screen.findByRole('button', { name: '添加规则' }))
    const target = screen.getByLabelText('适用对象')
    const metric = screen.getByLabelText('指标') as HTMLSelectElement
    expect(metric.value).toBe('RPM')
    expect(
      within(metric)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual(['RPM · 每分钟请求数', 'TPM · 每分钟 Token 数'])
    fireEvent.change(target, { target: { value: 'MODEL' } })
    expect(
      within(metric)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      'RPM · 每分钟请求数',
      'TPM · 每分钟 Token 数',
      '并发 · 同时进行的请求数',
      '未完成异步任务数',
    ])
    fireEvent.change(metric, { target: { value: 'CONCURRENCY' } })
    fireEvent.change(target, { target: { value: 'CREDENTIAL_GROUP' } })
    expect(metric.value).toBe('RPM')
    expect(within(metric).getAllByRole('option')).toHaveLength(2)
  })

  it('requires an explicit metric choice when editing a legacy whole-group concurrency rule', async () => {
    const data = await mocks.getCanvasCredentialGroupExecution()
    mocks.getCanvasCredentialGroupExecution.mockResolvedValueOnce({
      ...data,
      limits: {
        ...data.limits,
        effective: {
          rules: [
            {
              id: 'custom.limit.legacy',
              enabled: true,
              scope: 'CREDENTIAL_GROUP',
              credentialGroupId,
              metric: 'CONCURRENCY',
              limit: '4',
            },
          ],
        },
      },
    })
    mount({ view: 'credentialGroup', credentialGroupId })
    const rules = await screen.findByRole('region', {
      name: 'Additional limit rules',
    })
    fireEvent.click(within(rules).getByRole('button', { name: 'Edit' }))
    const form = screen.getByRole('form', { name: 'Limit rules' })
    const metric = within(form).getByLabelText('Metric') as HTMLSelectElement
    expect(metric.value).toBe('')
    expect(
      within(metric)
        .getAllByRole('option')
        .map((option) => option.textContent)
    ).toEqual([
      'Choose RPM or TPM',
      'RPM · Requests per minute',
      'TPM · Tokens per minute',
    ])
    fireEvent.click(
      within(form).getByRole('button', { name: 'Review publication' })
    )
    expect(
      await screen.findByText('Select RPM or TPM for the entire API Key group')
    ).toBeVisible()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(mocks.publishCanvasExecutionPolicy).not.toHaveBeenCalled()

    fireEvent.change(metric, { target: { value: 'TPM' } })
    fireEvent.click(
      within(form).getByRole('button', { name: 'Review publication' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('TPM · Tokens per minute')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))
    await waitFor(() =>
      expect(mocks.publishCanvasExecutionPolicy.mock.calls[0]?.[0]).toEqual({
        kind: 'CREDENTIAL_GROUP_LIMITS',
        scopeKey: credentialGroupId,
        config: {
          rules: [
            expect.objectContaining({
              id: 'custom.limit.legacy',
              metric: 'TPM',
            }),
          ],
        },
      })
    )
  })

  it('keeps a rule draft after review cancellation and a failed publish', async () => {
    const user = userEvent.setup()
    mocks.publishCanvasExecutionPolicy.mockRejectedValueOnce(
      new Error('conflict')
    )
    mount({ view: 'credentialGroup', credentialGroupId })
    await user.click(await screen.findByRole('button', { name: 'Add rule' }))
    const limitForm = screen.getByRole('form', { name: 'Limit rules' })
    fireEvent.change(within(limitForm).getByLabelText('Upper limit'), {
      target: { value: '7' },
    })
    await user.click(
      within(limitForm).getByRole('button', { name: 'Review publication' })
    )
    const review = await screen.findByRole('alertdialog')
    expect(review).toHaveTextContent('Add rule')
    await user.click(
      within(review).getByRole('button', { name: 'Return to editing' })
    )
    expect(within(limitForm).getByLabelText('Upper limit')).toHaveValue('7')
    expect(mocks.publishCanvasExecutionPolicy).not.toHaveBeenCalled()
    await user.click(
      within(limitForm).getByRole('button', { name: 'Review publication' })
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Publish',
      })
    )
    await waitFor(() =>
      expect(mocks.publishCanvasExecutionPolicy).toHaveBeenCalledTimes(1)
    )
    expect(within(limitForm).getByLabelText('Upper limit')).toHaveValue('7')
    expect(screen.getByTestId('navigation-guard')).toHaveAttribute(
      'data-active',
      'true'
    )
    expect(
      screen.getByText(
        'No additional rules are configured; the group capacity above and platform limits still apply.'
      )
    ).toBeVisible()
  })

  it('reviews one existing rule edit or deletion without changing the published list before confirmation', async () => {
    const user = userEvent.setup()
    const data = await mocks.getCanvasCredentialGroupExecution()
    mocks.getCanvasCredentialGroupExecution.mockResolvedValueOnce({
      ...data,
      limits: {
        ...data.limits,
        effective: {
          rules: [
            {
              id: 'custom.limit.active',
              enabled: true,
              scope: 'CREDENTIAL_GROUP',
              credentialGroupId,
              metric: 'RPM',
              limit: '60',
            },
          ],
        },
      },
    })
    mount({ view: 'credentialGroup', credentialGroupId })
    const rules = await screen.findByRole('region', {
      name: 'Additional limit rules',
    })
    expect(within(rules).getByText('60')).toBeVisible()
    expect(
      within(rules).getByText('Enabled').closest('[data-slot="badge"]')
    ).toHaveAttribute('data-variant', 'secondary')
    await user.click(within(rules).getByRole('button', { name: 'Edit' }))
    const form = screen.getByRole('form', { name: 'Limit rules' })
    fireEvent.change(within(form).getByLabelText('Upper limit'), {
      target: { value: '40' },
    })
    await user.click(
      within(form).getByRole('button', { name: 'Review publication' })
    )
    let dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Edit rule')
    expect(dialog).toHaveTextContent('40')
    expect(within(rules).getByText('60')).toBeVisible()
    await user.click(
      within(dialog).getByRole('button', { name: 'Return to editing' })
    )
    await user.click(within(form).getByRole('button', { name: 'Cancel' }))
    await user.click(within(rules).getByRole('button', { name: 'Delete' }))
    dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Delete rule')
    expect(within(rules).getByText('60')).toBeVisible()
    expect(mocks.publishCanvasExecutionPolicy).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Publish' }))
    await waitFor(() =>
      expect(mocks.publishCanvasExecutionPolicy.mock.calls[0]?.[0]).toEqual({
        kind: 'CREDENTIAL_GROUP_LIMITS',
        scopeKey: credentialGroupId,
        config: { rules: [] },
      })
    )
  })

  it.each([
    { initialEnabled: true, nextEnabled: false },
    { initialEnabled: false, nextEnabled: true },
  ])(
    'keeps enablement editable on an existing rule ($initialEnabled → $nextEnabled)',
    async ({ initialEnabled, nextEnabled }) => {
      const user = userEvent.setup()
      const data = await mocks.getCanvasCredentialGroupExecution()
      mocks.getCanvasCredentialGroupExecution.mockResolvedValueOnce({
        ...data,
        limits: {
          ...data.limits,
          effective: {
            rules: [
              {
                id: 'custom.limit.toggle',
                enabled: initialEnabled,
                scope: 'CREDENTIAL_GROUP',
                credentialGroupId,
                metric: 'RPM',
                limit: '60',
              },
            ],
          },
        },
      })
      mount({ view: 'credentialGroup', credentialGroupId })
      const rules = await screen.findByRole('region', {
        name: 'Additional limit rules',
      })
      await user.click(within(rules).getByRole('button', { name: 'Edit' }))
      const form = screen.getByRole('form', { name: 'Limit rules' })
      const enabled = within(form).getByRole('checkbox', { name: 'Enabled' })
      expect(enabled).toHaveAttribute('aria-checked', String(initialEnabled))
      await user.click(enabled)
      expect(enabled).toHaveAttribute('aria-checked', String(nextEnabled))
      await user.click(
        within(form).getByRole('button', { name: 'Review publication' })
      )
      const dialog = await screen.findByRole('alertdialog')
      expect(dialog).toHaveTextContent(nextEnabled ? 'Enabled' : 'Disabled')
      await user.click(within(dialog).getByRole('button', { name: 'Publish' }))
      await waitFor(() =>
        expect(mocks.publishCanvasExecutionPolicy.mock.calls[0]?.[0]).toEqual({
          kind: 'CREDENTIAL_GROUP_LIMITS',
          scopeKey: credentialGroupId,
          config: {
            rules: [
              expect.objectContaining({
                id: 'custom.limit.toggle',
                enabled: nextEnabled,
              }),
            ],
          },
        })
      )
    }
  )

  it('limits a single bound model without exposing legacy targets', async () => {
    mount({ view: 'credentialGroup', credentialGroupId })
    fireEvent.click(await screen.findByRole('button', { name: 'Add rule' }))
    const limitForm = screen.getByRole('form', { name: 'Limit rules' })
    const target = within(limitForm).getByLabelText('Applicable target')

    expect(within(target).getAllByRole('option')).toHaveLength(3)
    fireEvent.change(target, { target: { value: 'MODEL' } })
    expect(within(limitForm).getByLabelText('Model')).toBeVisible()
    expect(screen.queryByText('Credential scope')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Credential and model scope')
    ).not.toBeInTheDocument()
  })

  it('guides administrators to manage bindings when a single-model target has no models', async () => {
    const data = await mocks.getCanvasCredentialGroupExecution()
    mocks.getCanvasCredentialGroupExecution.mockClear()
    mocks.getCanvasCredentialGroupExecution.mockResolvedValueOnce({
      ...data,
      models: [],
    })
    mount({ view: 'credentialGroup', credentialGroupId })
    fireEvent.click(await screen.findByRole('button', { name: 'Add rule' }))
    fireEvent.change(screen.getByLabelText('Applicable target'), {
      target: { value: 'MODEL' },
    })

    expect(
      screen.getByText(
        'No bound models are available. Manage bindings before adding a model limit.'
      )
    ).toBeVisible()
    expect(screen.queryByLabelText('Model')).not.toBeInTheDocument()
  })

  it('clears a submitted model error when changing back to the API Key group target', async () => {
    mount({ view: 'credentialGroup', credentialGroupId })
    fireEvent.click(await screen.findByRole('button', { name: 'Add rule' }))
    const limitForm = screen.getByRole('form', { name: 'Limit rules' })
    const target = within(limitForm).getByLabelText('Applicable target')

    fireEvent.change(target, { target: { value: 'MODEL_GROUP' } })
    const models = screen.getByLabelText('Models')
    expect(models).toBeVisible()
    fireEvent.blur(models)
    expect(await screen.findByText('Select at least one model')).toBeVisible()
    fireEvent.click(
      within(limitForm).getByRole('button', { name: 'Review publication' })
    )
    expect(mocks.publishCanvasExecutionPolicy).not.toHaveBeenCalled()

    fireEvent.change(target, { target: { value: 'CREDENTIAL_GROUP' } })
    expect(
      screen.queryByText('Select at least one model')
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Set group concurrency and unfinished asynchronous task limits above.'
      )
    ).toBeVisible()
    fireEvent.change(target, { target: { value: 'MODEL_GROUP' } })
    expect(
      screen.queryByText('Select at least one model')
    ).not.toBeInTheDocument()
  })

  it('selects bound models for a shared limit', async () => {
    const user = userEvent.setup()
    mount({ view: 'credentialGroup', credentialGroupId })
    fireEvent.click(await screen.findByRole('button', { name: 'Add rule' }))
    const limitForm = screen.getByRole('form', { name: 'Limit rules' })
    fireEvent.change(within(limitForm).getByLabelText('Applicable target'), {
      target: { value: 'MODEL_GROUP' },
    })
    fireEvent.change(within(limitForm).getByLabelText('Metric'), {
      target: { value: 'CONCURRENCY' },
    })

    const search = screen.getByLabelText('Search bound models')
    await user.click(search)
    await user.keyboard('{ArrowDown}')
    await user.click(await screen.findByText('Canvas Image'))
    expect(screen.getByText('Selected models (1)')).toBeVisible()
    await user.click(search)
    await user.clear(search)
    await user.type(search, 'Video')
    await user.click(await screen.findByText('Canvas Video'))
    expect(screen.getByText('Selected models (2)')).toBeVisible()
    expect(screen.getByText('Selected models share this limit.')).toBeVisible()
    await user.click(search)
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    )
    await user.click(
      within(limitForm).getByRole('button', { name: 'Review publication' })
    )
    const review = await screen.findByRole('alertdialog')
    expect(review).toHaveTextContent('Canvas Image, Canvas Video')
    expect(review).toHaveTextContent('Selected models share this limit.')
    expect(review).toHaveTextContent('Concurrency · Simultaneous requests')
    await user.click(within(review).getByRole('button', { name: 'Publish' }))
    await waitFor(() => {
      const rule =
        mocks.publishCanvasExecutionPolicy.mock.calls[0]?.[0]?.config
          ?.rules?.[0]
      expect(rule).toMatchObject({
        scope: 'MODEL_GROUP',
        modelKeys: ['canvas.image', 'canvas.video'],
      })
      expect(rule).not.toHaveProperty('modelIds')
    })
  })

  it('localizes the shared-model required error after the field first loses focus', async () => {
    await i18next.changeLanguage('zhCN')
    mount({ view: 'credentialGroup', credentialGroupId })
    fireEvent.click(await screen.findByRole('button', { name: '添加规则' }))
    fireEvent.change(screen.getByLabelText('适用对象'), {
      target: { value: 'MODEL_GROUP' },
    })
    fireEvent.blur(screen.getByLabelText('搜索已绑定模型'))

    expect(await screen.findByText('请至少选择一个模型')).toBeVisible()
  })
})

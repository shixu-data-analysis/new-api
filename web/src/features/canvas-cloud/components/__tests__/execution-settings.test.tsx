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
  mocks.getCanvasExecutionCapacity.mockResolvedValue({ items: [] })
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
      effective: { rules: [systemRule] },
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
        publicName: 'Canvas Image',
        providerChannelId: channelId,
      },
      {
        id: '85000000-0000-7000-8000-000000000005',
        publicName: 'Canvas Video',
        providerChannelId: channelId,
      },
      {
        id: '85000000-0000-7000-8000-000000000006',
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
  it('distinguishes denied capacity access and retries', async () => {
    const user = userEvent.setup()
    mocks.getCanvasExecutionCapacity
      .mockRejectedValueOnce({ response: { status: 403 } })
      .mockResolvedValue({ items: [] })
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
    await user.click(
      (await screen.findAllByRole('button', { name: 'View waiting tasks' }))[0]
    )
    expect(
      await screen.findByText('Your session has expired. Sign in again.')
    ).toBeVisible()
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
        .getAllByRole('region', { name: 'Execution capacity' })
        .some((element) => element.getAttribute('tabindex') === '0')
    ).toBe(true)
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
    const capacity = await screen.findByText('Execution capacity')
    const workers = await screen.findByText('Running workers')
    const recovery = screen.getByText('System recovery')
    const limits = screen.getByText('Global execution limits')
    for (const title of [capacity, workers, recovery]) {
      expect(title.closest('[data-slot="card"]')).toHaveAttribute(
        'data-size',
        'default'
      )
    }
    expect(
      capacity.compareDocumentPosition(workers) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      workers.compareDocumentPosition(recovery) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      recovery.compareDocumentPosition(limits) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    const overviewLayout = capacity.closest('.space-y-6')
    expect(overviewLayout).not.toBeNull()
    expect(overviewLayout).toContainElement(limits)
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
        .closest('[data-slot="card-action"]')
    ).not.toBeNull()
    const globalFields = globalForm.querySelector('.sm\\:grid-cols-2')
    expect(globalFields).toHaveClass(
      'sm:grid-cols-2',
      'lg:grid-cols-[repeat(3,minmax(10rem,14rem))]'
    )
    for (const label of ['Execution capacity', 'Running workers']) {
      const regions = screen.getAllByRole('region', { name: label })
      const scrollRegion = regions.find((region) => region.tabIndex === 0)
      expect(scrollRegion).toBeDefined()
      expect(
        scrollRegion?.querySelector('[data-slot="table-container"]')
      ).toHaveClass('overflow-x-auto')
    }
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
        effective: { rules: [systemRule, firstRule, secondRule] },
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
      within(limitForm).queryByLabelText('Rule ID')
    ).not.toBeInTheDocument()
    fireEvent.change(within(limitForm).getByLabelText('Limit'), {
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
              metric: 'CONCURRENCY',
              limit: '25',
            },
          ],
        },
      })
    )
  })

  it('limits a single bound model without exposing legacy targets', async () => {
    mount({ view: 'credentialGroup', credentialGroupId })
    fireEvent.click(await screen.findByRole('button', { name: 'Add rule' }))
    const limitForm = screen.getByRole('form', { name: 'Limit rules' })
    const target = within(limitForm).getByLabelText('Limit target')

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
    fireEvent.change(screen.getByLabelText('Limit target'), {
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
    const target = within(limitForm).getByLabelText('Limit target')

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
        'All bound models in this API Key group share this limit.'
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
    fireEvent.change(within(limitForm).getByLabelText('Limit target'), {
      target: { value: 'MODEL_GROUP' },
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
    expect(review).toHaveTextContent('Concurrent requests')
  })

  it('localizes the shared-model required error after the field first loses focus', async () => {
    await i18next.changeLanguage('zhCN')
    mount({ view: 'credentialGroup', credentialGroupId })
    fireEvent.click(await screen.findByRole('button', { name: '添加规则' }))
    fireEvent.change(screen.getByLabelText('限制对象'), {
      target: { value: 'MODEL_GROUP' },
    })
    fireEvent.blur(screen.getByLabelText('搜索已绑定模型'))

    expect(await screen.findByText('请至少选择一个模型')).toBeVisible()
  })
})

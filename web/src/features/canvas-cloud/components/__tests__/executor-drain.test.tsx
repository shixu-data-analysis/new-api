/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
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
import fr from '@/i18n/locales/fr.json'
import zh from '@/i18n/locales/zh.json'

import type { ExecutorDrainState } from '../../execution-types'
import { ExecutorDrain } from '../ExecutorDrain'
import { RuntimeManagement } from '../RuntimeManagement'

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  get: vi.fn(),
  start: vi.fn(),
  cancel: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('../../execution-api', () => ({
  getCanvasExecutionOverview: mocks.overview,
  getCanvasExecutorDrain: mocks.get,
  startCanvasExecutorDrain: mocks.start,
  cancelCanvasExecutorDrain: mocks.cancel,
}))
vi.mock('sonner', () => ({
  toast: { success: mocks.success, error: mocks.error },
}))
vi.mock('../ExecutionSettings', () => ({
  ExecutionSettings: () => <div>execution settings</div>,
}))
vi.mock('../RuntimeConfiguration', () => ({
  RuntimeConfiguration: () => <div>runtime configuration</div>,
}))

const normal: ExecutorDrainState = {
  queueName: 'canvas-tasks',
  draining: false,
  drainId: null,
  startedAt: null,
  expiresAt: null,
  startedByPrincipalId: null,
  inFlight: { harmedByRestart: 4, continuingAfterRestart: 157 },
  serverTime: '2026-10-03T14:00:00.000Z',
}
const draining: ExecutorDrainState = {
  ...normal,
  draining: true,
  drainId: '70000000-0000-7000-8000-000000000001',
  startedAt: '2026-10-03T14:02:00.000Z',
  expiresAt: '2026-10-03T15:02:00.000Z',
  inFlight: { harmedByRestart: 0, continuingAfterRestart: 148 },
}

function mount(node = <ExecutorDrain />) {
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
      {node}
    </QueryClientProvider>
  )
}

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en, zhCN: zh, fr },
    interpolation: { escapeValue: false },
  })
})
beforeEach(async () => {
  await i18next.changeLanguage('en')
  vi.clearAllMocks()
  mocks.get.mockResolvedValue(normal)
  mocks.overview.mockResolvedValue({ attention: [] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('executor drain row', () => {
  it('shows the normal state with both numbers before any drain starts', async () => {
    mount()
    expect(await screen.findByText('Accepting tasks')).toBeVisible()
    expect(
      screen.getByText(
        'Use before a restart or maintenance. Only stops claiming new tasks.'
      )
    ).toBeVisible()
    expect(
      screen.getByText('Restart would harm').nextElementSibling
    ).toHaveTextContent('4')
    expect(
      screen.getByText('Continues after restart').nextElementSibling
    ).toHaveTextContent('157')
    expect(
      screen.getByText('Being submitted, no provider task ID yet')
    ).toBeVisible()
    expect(
      screen.getByText(
        'Submitted to the API provider, waiting for the result or retrieving it'
      )
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Start pausing intake' })
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Extend by 60 minutes' })
    ).not.toBeInTheDocument()
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('asks for confirmation that lists scope, expiry, resume rule and the number at risk, and starts only after confirming', async () => {
    const user = userEvent.setup()
    mocks.start.mockResolvedValue(draining)
    mount()
    await user.click(
      await screen.findByRole('button', { name: 'Start pausing intake' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText('All executor instances of this environment')
    ).toBeVisible()
    expect(within(dialog).getByText('After 60 minutes')).toBeVisible()
    expect(
      within(dialog).getByText(
        'Intake is resumed, an executor instance restarts, or the pause expires'
      )
    ).toBeVisible()
    expect(
      within(dialog).getByText('Restart would harm now:').nextElementSibling
    ).toHaveTextContent('4')
    expect(mocks.start).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(mocks.start).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: 'Start pausing intake' })
    )
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Start pausing intake',
      })
    )
    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())
    expect(await screen.findByText('Intake paused')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Extend by 60 minutes' })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Resume intake' })).toBeVisible()
    expect(mocks.success).toHaveBeenCalledWith('Intake paused')
  })

  it('shows start and automatic resume times while draining and lets the administrator extend or cancel', async () => {
    const user = userEvent.setup()
    mocks.get.mockResolvedValue(draining)
    mocks.start.mockResolvedValue({
      ...draining,
      expiresAt: '2026-10-03T16:00:00.000Z',
    })
    mocks.cancel.mockResolvedValue(normal)
    mount()
    expect(await screen.findByText('Intake paused')).toBeVisible()
    expect(
      screen.getByText(
        new RegExp(
          `Started ${new Date(draining.startedAt as string).toLocaleString().replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
        )
      )
    ).toBeVisible()
    expect(
      screen.getByText('Restart would harm').nextElementSibling
    ).toHaveTextContent('0')
    expect(
      screen.queryByRole('button', { name: 'Start pausing intake' })
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Extend by 60 minutes' })
    )
    await waitFor(() => expect(mocks.start).toHaveBeenCalledOnce())
    expect(mocks.success).toHaveBeenCalledWith(
      'Intake pause extended by 60 minutes'
    )

    await user.click(screen.getByRole('button', { name: 'Resume intake' }))
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledOnce())
    expect(await screen.findByText('Accepting tasks')).toBeVisible()
    expect(mocks.success).toHaveBeenCalledWith('Intake resumed')
  })

  it('says a new drain started when the one being extended had already expired', async () => {
    const user = userEvent.setup()
    mocks.get.mockResolvedValue(draining)
    mocks.start.mockResolvedValue({
      ...draining,
      drainId: '70000000-0000-7000-8000-000000000002',
      startedAt: '2026-10-03T15:03:00.000Z',
      expiresAt: '2026-10-03T16:03:00.000Z',
    })
    mount()
    await user.click(
      await screen.findByRole('button', { name: 'Extend by 60 minutes' })
    )
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith('Intake paused')
    )
    expect(mocks.success).not.toHaveBeenCalledWith(
      'Intake pause extended by 60 minutes'
    )
  })

  it('refreshes every 5 seconds only while draining', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mocks.get.mockResolvedValue(normal)
    const first = mount()
    await screen.findByText('Accepting tasks')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(mocks.get).toHaveBeenCalledTimes(1)
    first.unmount()

    mocks.get.mockClear().mockResolvedValue(draining)
    mount()
    await screen.findByText('Intake paused')
    expect(mocks.get).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(mocks.get).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(mocks.get).toHaveBeenCalledTimes(4)
  })

  it('keeps the failed load recoverable instead of showing zeros', async () => {
    const user = userEvent.setup()
    mocks.get.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(normal)
    mount()
    expect(
      await screen.findByText('Intake pause state could not be loaded')
    ).toBeVisible()
    expect(screen.queryByText('Restart would harm')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Accepting tasks')).toBeVisible()
  })

  it('reports a failed update and keeps the previous state', async () => {
    const user = userEvent.setup()
    mocks.get.mockResolvedValue(draining)
    mocks.cancel.mockRejectedValue(new Error('denied'))
    mount()
    await user.click(
      await screen.findByRole('button', { name: 'Resume intake' })
    )
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith('Intake pause update failed')
    )
    expect(screen.getByText('Intake paused')).toBeVisible()
  })

  it.each([
    [
      'zhCN',
      {
        title: '暂停接单',
        badge: '正常接单',
        harmed: '重启会受损',
        continuing: '重启后自动继续',
        start: '开始暂停接单',
      },
    ],
    [
      'fr',
      {
        title: 'Suspendre la prise de tâches',
        badge: 'Prend les tâches',
        harmed: 'Un redémarrage nuirait à',
        continuing: 'Se poursuit après le redémarrage',
        start: 'Commencer la suspension de la prise de tâches',
      },
    ],
  ])('is fully translated in %s', async (language, words) => {
    await i18next.changeLanguage(language)
    mount()
    expect(await screen.findByText(words.badge)).toBeVisible()
    expect(screen.getByText(words.title)).toBeVisible()
    expect(screen.getByText(words.harmed)).toBeVisible()
    expect(screen.getByText(words.continuing)).toBeVisible()
    expect(screen.getByRole('button', { name: words.start })).toBeVisible()
  })
})

describe('tab marker', () => {
  it('marks the execution tab while draining, on every tab', async () => {
    mocks.get.mockResolvedValue(draining)
    mount(<RuntimeManagement initialView='provider' />)
    const tab = await screen.findByRole('tab', {
      name: /Task execution status and limits/,
    })
    await waitFor(() =>
      expect(within(tab).getByText('Intake paused')).toBeVisible()
    )
    expect(
      screen.getByRole('tab', { name: 'API provider configuration' })
    ).not.toHaveTextContent('Intake paused')
  })

  it('shows no marker when nothing is draining', async () => {
    mocks.get.mockResolvedValue(normal)
    mount(<RuntimeManagement initialView='execution' />)
    const tab = await screen.findByRole('tab', {
      name: /Task execution status and limits/,
    })
    await waitFor(() => expect(mocks.get).toHaveBeenCalled())
    expect(within(tab).queryByText('Intake paused')).not.toBeInTheDocument()
  })

  it('shows the number of attention hints in force, with a screen-reader label', async () => {
    mocks.overview.mockResolvedValue({
      attention: [
        { type: 'OUTPUT_TOO_LARGE', count: 3, latestAt: null },
        { type: 'DATABASE_UNSTABLE', count: 1, latestAt: null },
      ],
    })
    mount(<RuntimeManagement initialView='provider' />)
    const tab = await screen.findByRole('tab', {
      name: /Task execution status and limits/,
    })
    await waitFor(() =>
      expect(
        within(tab).getByText('2 items need attention')
      ).toBeInTheDocument()
    )
    expect(within(tab).getByText('2')).toHaveAttribute('aria-hidden', 'true')
  })
})

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isModelManagementTab } from '../model-management-tabs'
import { ModelAvailabilityBulkDisableDialog } from '../ModelAvailabilityBulkDisableDialog'
import { ModelAvailabilityModelTable } from '../ModelAvailabilityModelTable'
import { ModelAvailabilityPanel } from '../ModelAvailabilityPanel'
import { ModelAvailabilityRuleDialog } from '../ModelAvailabilityRuleDialog'
import { ModelAvailabilitySettingsDialog } from '../ModelAvailabilitySettingsDialog'

const api = vi.hoisted(() => ({
  getModelAvailability: vi.fn(),
  startModelAvailabilityProbe: vi.fn(),
  saveModelAvailabilitySettings: vi.fn(),
  testModelAvailabilityList: vi.fn(),
  testModelAvailabilityRequest: vi.fn(),
  judgeModelAvailabilityRule: vi.fn(),
}))
const controlCanvasLogicalModel = vi.hoisted(() => vi.fn())

vi.mock('../../model-availability-api', async (original) => ({
  ...(await original<object>()),
  ...api,
}))
const getCanvasAdminNotificationSettings = vi.hoisted(() => vi.fn())
vi.mock('../../api', async (original) => ({
  ...(await original<object>()),
  controlCanvasLogicalModel,
  getCanvasAdminNotificationSettings,
}))
const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}))

const identity = (modelKey: string) => ({
  modelKey,
  displayName: `Name ${modelKey}`,
  upstreamIds: [`up-${modelKey}`],
  providerId: 'p1',
  providerName: 'Even',
  credentialGroupName: 'Main',
  controlVersion: 3,
})

const missing = (modelKey: string) => ({
  ...identity(modelKey),
  firstMissingAt: '2026-10-31T00:00:00.000Z',
})

const disabled = (
  modelKey: string,
  upstreamStatus: 'AVAILABLE' | 'SUSPECTED' | 'MISSING' | null
) => ({
  ...identity(modelKey),
  disabledReason: 'MODEL_DELISTED',
  upstreamStatus,
  lastListedAt:
    upstreamStatus === 'AVAILABLE' ? '2026-11-23T04:23:38.000Z' : null,
  firstMissingAt:
    upstreamStatus === 'MISSING' ? '2026-11-18T06:00:00.000Z' : null,
})

const provider = {
  providerId: 'p1',
  providerName: 'Even',
  source: 'V1_MODELS' as const,
  rule: null,
  untested: false,
  pause: null,
  models: [
    { modelKey: 'a', displayName: 'A', upstreamIds: ['up-a'], bound: true },
    { modelKey: 'z', displayName: 'Z', upstreamIds: ['up-z'], bound: false },
  ],
}

const overview = (change: object = {}) => ({
  settings: {
    autoProbeEnabled: false,
    intervalHours: 3,
    threshold: 2,
    listingKeywords: [],
    listingRetentionDays: 14,
    version: 4,
  },
  providers: [provider],
  targets: [],
  missingModels: [],
  disabledModels: [],
  counts: {
    missing: 0,
    disabled: 0,
    failed: 0,
    paused: 0,
    listed: 0,
    badge: 0,
  },
  coverage: {
    probedTargets: 0,
    totalTargets: 1,
    offProviders: [],
    unboundProviders: [],
    unboundModels: [],
  },
  lastSuccessAt: null,
  listing: {
    models: [],
    pendingBaselineProviders: [],
    requestRuleProviders: [],
  },
  run: null,
  ...change,
})

function renderWithQuery(element: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>
  )
}

beforeEach(() => vi.resetAllMocks())
afterEach(cleanup)

describe('the tab', () => {
  it('is one the page accepts, or a click on it does nothing', () => {
    expect(isModelManagementTab('availability')).toBe(true)
  })
})

describe('ModelAvailabilityPanel', () => {
  it('says automatic probing is off, and an empty list is not a conclusion that all is well', async () => {
    api.getModelAvailability.mockResolvedValue(overview())
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByText('No confirmed model absences')
    ).toBeInTheDocument()
    expect(screen.getByText(/Automatic probing is off/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Probe now' })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Disable all/ })).toBeDisabled()
  })

  it('blocks a second probe while any round runs, and names a system round', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({
        run: {
          trigger: 'SCHEDULED',
          doneTargets: 2,
          totalTargets: 5,
          startedAt: 'x',
        },
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByRole('button', { name: /System probing/ })
    ).toBeDisabled()
  })

  it('blocks a probe while a request test runs, and says so', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({
        run: {
          trigger: 'TEST',
          doneTargets: 0,
          totalTargets: 0,
          startedAt: 'x',
        },
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByRole('button', { name: 'Request test running' })
    ).toBeDisabled()
  })

  it('states that a failed probe does not mean a model is gone', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({
        counts: { missing: 0, disabled: 0, failed: 1, paused: 0, badge: 1 },
        targets: [
          {
            key: 'p1:g',
            providerId: 'p1',
            providerName: 'Even',
            credentialGroupId: 'g',
            credentialGroupName: 'Main',
            failureCount: 2,
            failureReason: 'AUTH',
            failureDetail: null,
            alerting: true,
            awaitingConfirmation: false,
            lastProbedAt: 'x',
            lastSuccessAt: null,
          },
        ],
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByText(/This does not mean a model is gone/)
    ).toBeInTheDocument()
    expect(screen.getByText(/The API Key is invalid/)).toBeInTheDocument()
  })

  const failedTarget = (failureReason: string) => ({
    key: 'p1:g',
    providerId: 'p1',
    providerName: 'Even',
    credentialGroupId: 'g',
    credentialGroupName: 'Main',
    failureCount: 2,
    failureReason,
    failureDetail: null,
    alerting: true,
    awaitingConfirmation: false,
    lastProbedAt: 'x',
    lastSuccessAt: null,
  })

  it('writes a failed probe as one sentence and sends an invalid Key to the API provider configuration', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({ targets: [failedTarget('AUTH')] })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByText(
        'Even (API Key group: Main): The API Key is invalid or has no access Last success: None'
      )
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View settings' })).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open API provider configuration' })
    )
    expect(navigate).toHaveBeenCalledWith({
      to: '/canvas-cloud/$section',
      params: { section: 'runtime' },
      search: { view: 'provider' },
    })
  })

  it('offers nothing to change for a network failure', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({ targets: [failedTarget('NETWORK')] })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByText(/The network failed or timed out/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View settings' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Open API provider configuration' })
    ).toBeNull()
  })

  it('opens the settings for a list that cannot be read', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({ targets: [failedTarget('UNSUPPORTED')] })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByRole('button', { name: 'View settings' })
    ).toBeInTheDocument()
  })

  it('lists missing models first, then disabled ones listed again, in one table with Disable all beside the filters', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({
        missingModels: [missing('a')],
        disabledModels: [disabled('b', 'MISSING'), disabled('c', 'AVAILABLE')],
        counts: { missing: 1, disabled: 2, failed: 0, paused: 0, badge: 1 },
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByRole('heading', {
        name: 'Missing and disabled models (3)',
      })
    ).toBeInTheDocument()
    const [table] = screen.getAllByRole('table')
    const rows = within(table as HTMLElement).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Name a')
    expect(rows[1]).toHaveTextContent('Model enabled')
    expect(rows[2]).toHaveTextContent('Name c')
    expect(rows[2]).toHaveTextContent('Listed by the provider')
    expect(rows[2]).toHaveTextContent('Removed by the provider')
    expect(rows[3]).toHaveTextContent('Name b')
    expect(rows[3]).toHaveTextContent('Missing from the provider')
    expect(
      within(rows[1] as HTMLElement).getByRole('button', {
        name: 'Disable model: Name a',
      })
    ).toHaveAttribute('data-row-action', 'danger')
    for (const restore of within(table as HTMLElement).getAllByRole('button', {
      name: /^Restore model: Name /,
    })) {
      expect(restore).toHaveAttribute('data-row-action', 'primary')
    }
    expect(
      screen.getByRole('button', { name: 'Disable all (1)' })
    ).toBeEnabled()
    expect(screen.queryByText('No confirmed model absences')).toBeNull()
  })

  it('narrows the table to one API provider and to a model name, and clears only the panel filters', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({
        missingModels: [missing('a')],
        disabledModels: [
          {
            ...disabled('b', 'AVAILABLE'),
            providerId: 'p2',
            providerName: 'Z5API',
          },
          disabled('c', 'MISSING'),
        ],
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    const providers = await screen.findByRole('group', { name: 'API provider' })
    fireEvent.click(within(providers).getByRole('button', { name: 'Z5API' }))
    expect(
      within(providers).getByRole('button', { name: 'Z5API' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Name b')).toBeInTheDocument()
    expect(screen.queryByText('Name a')).toBeNull()
    fireEvent.click(
      within(providers).getByRole('button', { name: 'All API providers' })
    )
    fireEvent.click(screen.getByRole('button', { name: /^Column filters/ }))
    fireEvent.change(await screen.findByLabelText('Model'), {
      target: { value: 'name c' },
    })
    expect(screen.queryByText('Name a')).toBeNull()
    expect(screen.getByText('Name c')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByText('Name a')).toBeInTheDocument()
  })

  it('stops filtering by a chosen API provider once its last row leaves, so the other rows show again', () => {
    const z5 = {
      ...disabled('b', 'AVAILABLE'),
      providerId: 'p2',
      providerName: 'Z5API',
    }
    const view = render(
      <ModelAvailabilityModelTable
        missing={[]}
        disabled={[z5, disabled('c', 'MISSING')]}
        bulkAction={null}
        onControl={vi.fn()}
      />
    )
    const providers = () => screen.getByRole('group', { name: 'API provider' })
    fireEvent.click(within(providers()).getByRole('button', { name: 'Z5API' }))
    expect(screen.queryByText('Name c')).toBeNull()
    // Name b was restored and left the table: Z5API has no row and no button any more.
    view.rerender(
      <ModelAvailabilityModelTable
        missing={[]}
        disabled={[disabled('c', 'MISSING')]}
        bulkAction={null}
        onControl={vi.fn()}
      />
    )
    expect(screen.getByText('Name c')).toBeInTheDocument()
    expect(
      within(providers()).getByRole('button', { name: 'All API providers' })
    ).toHaveAttribute('aria-pressed', 'true')
    // Clear filters clears the panel only, so the kept choice applies again once Z5API has a row.
    fireEvent.click(screen.getByRole('button', { name: /^Column filters/ }))
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'name' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    view.rerender(
      <ModelAvailabilityModelTable
        missing={[]}
        disabled={[z5, disabled('c', 'MISSING')]}
        bulkAction={null}
        onControl={vi.fn()}
      />
    )
    expect(screen.queryByText('Name c')).toBeNull()
    expect(
      within(providers()).getByRole('button', { name: 'Z5API' })
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the row button and its focus when the page refreshes with the same rows', () => {
    const onControl = vi.fn()
    const table = () => (
      <ModelAvailabilityModelTable
        missing={[missing('a')]}
        disabled={[disabled('b', 'AVAILABLE')]}
        bulkAction={null}
        onControl={onControl}
      />
    )
    const view = render(table())
    const button = screen.getByRole('button', { name: 'Disable model: Name a' })
    button.focus()
    view.rerender(table())
    expect(screen.getByRole('button', { name: 'Disable model: Name a' })).toBe(
      button
    )
    expect(document.activeElement).toBe(button)
  })

  it('keeps the chosen API provider when Clear filters clears the panel', () => {
    render(
      <ModelAvailabilityModelTable
        missing={[missing('a')]}
        disabled={[
          {
            ...disabled('b', 'AVAILABLE'),
            providerId: 'p2',
            providerName: 'Z5API',
          },
        ]}
        bulkAction={null}
        onControl={vi.fn()}
      />
    )
    const providers = screen.getByRole('group', { name: 'API provider' })
    fireEvent.click(within(providers).getByRole('button', { name: 'Z5API' }))
    fireEvent.click(screen.getByRole('button', { name: /^Column filters/ }))
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'nothing' },
    })
    expect(screen.getByText('No matching models')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(
      within(providers).getByRole('button', { name: 'Z5API' })
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Name b')).toBeInTheDocument()
    expect(screen.queryByText('Name a')).toBeNull()
  })

  it('narrows the table to one model state and names the chosen state on the select', async () => {
    const user = userEvent.setup()
    render(
      <ModelAvailabilityModelTable
        missing={[missing('a')]}
        disabled={[disabled('b', 'AVAILABLE')]}
        bulkAction={null}
        onControl={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^Column filters/ }))
    const state = screen.getByRole('combobox', { name: 'Model state' })
    await user.click(state)
    await user.click(
      await screen.findByRole('option', { name: 'Model disabled' })
    )
    expect(screen.queryByText('Name a')).toBeNull()
    expect(screen.getByText('Name b')).toBeInTheDocument()
    expect(state).toHaveTextContent('Model disabled')
    await user.click(state)
    await user.click(
      await screen.findByRole('option', { name: 'All model states' })
    )
    expect(screen.getByText('Name a')).toBeInTheDocument()
    expect(state).toHaveTextContent('All model states')
  })

  it('narrows the table by upstream status and by disable reason, and names each choice on its select', async () => {
    const user = userEvent.setup()
    render(
      <ModelAvailabilityModelTable
        missing={[]}
        disabled={[
          { ...disabled('b', 'AVAILABLE'), disabledReason: 'QUOTA' },
          disabled('c', null),
        ]}
        bulkAction={null}
        onControl={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /^Column filters/ }))
    const upstream = screen.getByRole('combobox', { name: 'Upstream status' })
    await user.click(upstream)
    await user.click(
      await screen.findByRole('option', { name: 'Not probed yet' })
    )
    expect(screen.queryByText('Name b')).toBeNull()
    expect(screen.getByText('Name c')).toBeInTheDocument()
    expect(upstream).toHaveTextContent('Not probed yet')
    await user.click(upstream)
    await user.click(
      await screen.findByRole('option', { name: 'All upstream statuses' })
    )
    const reason = screen.getByRole('combobox', { name: 'Disable reason' })
    await user.click(reason)
    await user.click(
      await screen.findByRole('option', {
        name: 'Insufficient balance or quota',
      })
    )
    expect(screen.getByText('Name b')).toBeInTheDocument()
    expect(screen.queryByText('Name c')).toBeNull()
    expect(reason).toHaveTextContent('Insufficient balance or quota')
  })

  it('moves back to the last page when the rows of the current page leave', () => {
    const rows = Array.from({ length: 21 }, (_, index) =>
      disabled(`m${String(index).padStart(2, '0')}`, 'AVAILABLE')
    )
    const view = render(
      <ModelAvailabilityModelTable
        missing={[]}
        disabled={rows}
        bulkAction={null}
        onControl={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /next page/i }))
    expect(screen.getByText('Name m20')).toBeInTheDocument()
    view.rerender(
      <ModelAvailabilityModelTable
        missing={[]}
        disabled={rows.slice(0, 20)}
        bulkAction={null}
        onControl={vi.fn()}
      />
    )
    expect(screen.getByText('Name m00')).toBeInTheDocument()
  })

  it('goes back to the first page when a filter changes', () => {
    render(
      <ModelAvailabilityModelTable
        missing={[]}
        disabled={Array.from({ length: 45 }, (_, index) =>
          disabled(`m${String(index).padStart(2, '0')}`, 'AVAILABLE')
        )}
        bulkAction={null}
        onControl={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /next page/i }))
    expect(screen.getByText('Name m20')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Column filters/ }))
    fireEvent.change(screen.getByLabelText('Model'), {
      target: { value: 'name m' },
    })
    expect(screen.getByText('Name m00')).toBeInTheDocument()
    expect(screen.queryByText('Name m20')).toBeNull()
  })

  it('counts Disable all over every missing model, whatever the filters show', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({
        missingModels: [missing('a')],
        disabledModels: [
          {
            ...disabled('b', 'AVAILABLE'),
            providerId: 'p2',
            providerName: 'Z5API',
          },
        ],
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    const providers = await screen.findByRole('group', { name: 'API provider' })
    fireEvent.click(within(providers).getByRole('button', { name: 'Z5API' }))
    expect(screen.queryByText('Name a')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Disable all (1)' })
    ).toBeEnabled()
  })

  it('shows 20 rows a page and moves to the next page', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({
        disabledModels: Array.from({ length: 25 }, (_, index) =>
          disabled(`m${String(index).padStart(2, '0')}`, 'AVAILABLE')
        ),
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(await screen.findByText('Name m00')).toBeInTheDocument()
    expect(screen.queryByText('Name m20')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /next page/i }))
    expect(await screen.findByText('Name m20')).toBeInTheDocument()
    expect(screen.queryByText('Name m00')).toBeNull()
  })

  it('restores a disabled model the provider lists again, at its control version', async () => {
    controlCanvasLogicalModel.mockResolvedValue({})
    api.getModelAvailability.mockResolvedValue(
      overview({
        disabledModels: [{ ...disabled('c', 'AVAILABLE'), controlVersion: 5 }],
        counts: { missing: 0, disabled: 1, failed: 0, paused: 0, badge: 0 },
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Restore model: Name c' })
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('combobox'), {
      target: { value: 'UPSTREAM_RESTORED' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Restore model' })
    )
    await waitFor(() =>
      expect(controlCanvasLogicalModel).toHaveBeenCalledWith(
        'c',
        expect.objectContaining({ enabled: true, expectedVersion: 5 })
      )
    )
  })

  it('says a disabled model has no answer yet instead of a status', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({ disabledModels: [disabled('d', null)] })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(await screen.findByText('Not probed yet')).toBeInTheDocument()
  })
})

describe('ModelAvailabilityPanel coverage and rounds', () => {
  it('says why a provider is not probed, by name', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({
        coverage: {
          probedTargets: 6,
          totalTargets: 6,
          offProviders: ['AI666'],
          unboundProviders: ['Even', 'GWay'],
          unboundModels: ['Z5-a', 'Z5-b'],
        },
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByText(
        /no API Key group and cannot be probed: Even and GWay/
      )
    ).toBeInTheDocument()
    expect(screen.getByText(/set not to probe: AI666/)).toBeInTheDocument()
    expect(
      screen.getByText(/are not probed: Z5-a and Z5-b/)
    ).toBeInTheDocument()
  })

  it('offers to take over a round whose process died', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({
        run: {
          trigger: 'MANUAL',
          doneTargets: 1,
          totalTargets: 5,
          startedAt: 'x',
          stale: true,
        },
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByRole('button', { name: 'Probe now' })
    ).toBeEnabled()
  })

  it('reads the failure notice from the probe, not from the current threshold', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({
        settings: {
          autoProbeEnabled: false,
          intervalHours: 3,
          threshold: 10,
          version: 4,
        },
        targets: [
          {
            key: 'p1:g',
            providerId: 'p1',
            providerName: 'Even',
            credentialGroupId: 'g',
            credentialGroupName: 'Main',
            failureCount: 2,
            failureReason: 'AUTH',
            failureDetail: null,
            alerting: true,
            awaitingConfirmation: false,
            lastProbedAt: 'x',
            lastSuccessAt: null,
          },
        ],
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByText(/This does not mean a model is gone/)
    ).toBeInTheDocument()
  })
})

describe('an environment without probing', () => {
  it('says so instead of reporting a failure', async () => {
    api.getModelAvailability.mockRejectedValue({
      response: { status: 503, data: {} },
    })
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByText('Probing is not available in this environment.')
    ).toBeInTheDocument()
  })
})

describe('the cost notice before a round', () => {
  it('counts only the requests the rule can send', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    api.getModelAvailability.mockResolvedValue(
      overview({
        providers: [
          {
            ...provider,
            source: 'CUSTOM',
            rule: {
              type: 'REQUEST',
              method: 'GET',
              path: '/m/{{model}}',
              auth: 'API_KEY',
              template: null,
              timeoutSeconds: 15,
              rows: [],
            },
          },
        ],
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Probe now' }))
    expect(confirm.mock.calls[0]?.[0]).toContain('1')
    expect(api.startModelAvailabilityProbe).not.toHaveBeenCalled()
    confirm.mockRestore()
  })
})

describe('ModelAvailabilityBulkDisableDialog', () => {
  const open = (models: ReturnType<typeof missing>[]) =>
    renderWithQuery(
      <ModelAvailabilityBulkDisableDialog models={models} onClose={vi.fn()} />
    )
  const chooseReason = () =>
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: 'UPSTREAM' },
    })

  it('needs a reason, sends only the selected models, and retries only the failures', async () => {
    controlCanvasLogicalModel.mockImplementation(async (key: string) => {
      if (key === 'b') throw new Error('network')
      return {}
    })
    api.getModelAvailability.mockResolvedValue(
      overview({ missingModels: [missing('b')] })
    )
    open([missing('a'), missing('b'), missing('c')])
    fireEvent.click(screen.getByRole('checkbox', { name: 'Name c' }))
    fireEvent.click(screen.getByRole('button', { name: /Disable 2 models/ }))
    expect(await screen.findByText('Select a reason')).toBeInTheDocument()
    expect(controlCanvasLogicalModel).not.toHaveBeenCalled()
    chooseReason()
    fireEvent.click(screen.getByRole('button', { name: /Disable 2 models/ }))
    expect(await screen.findByText('1 succeeded, 1 failed')).toBeInTheDocument()
    expect(controlCanvasLogicalModel.mock.calls.map((call) => call[0])).toEqual(
      ['a', 'b']
    )
    fireEvent.click(screen.getByRole('button', { name: /Retry failed/ }))
    await waitFor(() =>
      expect(controlCanvasLogicalModel).toHaveBeenCalledTimes(3)
    )
    expect(controlCanvasLogicalModel.mock.calls[2]?.[0]).toBe('b')
  })

  it('offers removed by the provider as a reason', () => {
    open([missing('a')])
    expect(
      screen.getByRole('option', { name: 'Removed by the provider' })
    ).toHaveValue('MODEL_DELISTED')
  })

  it('locks the reason from the first submit, so a retry cannot carry another', async () => {
    let finish: (value: object) => void = () => undefined
    controlCanvasLogicalModel.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    open([missing('a')])
    chooseReason()
    fireEvent.click(screen.getByRole('button', { name: /Disable 1 models/ }))
    await waitFor(() => expect(screen.getByLabelText(/Reason/)).toBeDisabled())
    expect(screen.getByLabelText(/Additional explanation/)).toBeDisabled()
    finish({})
    expect(await screen.findByText('1 succeeded, 0 failed')).toBeInTheDocument()
  })

  it('says someone else changed a model, and retries with its latest version and the same reason', async () => {
    controlCanvasLogicalModel.mockRejectedValueOnce({
      response: { status: 409, data: {} },
    })
    controlCanvasLogicalModel.mockResolvedValueOnce({})
    api.getModelAvailability.mockResolvedValue(
      overview({ missingModels: [{ ...missing('a'), controlVersion: 7 }] })
    )
    open([missing('a')])
    chooseReason()
    fireEvent.click(screen.getByRole('button', { name: /Disable 1 models/ }))
    expect(
      await screen.findByText(/Someone else changed this model/)
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reload and retry/ }))
    await waitFor(() =>
      expect(controlCanvasLogicalModel).toHaveBeenCalledTimes(2)
    )
    expect(controlCanvasLogicalModel.mock.calls[0]?.[1]).toMatchObject({
      expectedVersion: 3,
      reasonCode: 'UPSTREAM',
    })
    expect(controlCanvasLogicalModel.mock.calls[1]?.[1]).toMatchObject({
      expectedVersion: 7,
      reasonCode: 'UPSTREAM',
    })
  })

  it('skips a model that no longer needs disabling instead of failing on it', async () => {
    controlCanvasLogicalModel.mockRejectedValueOnce({
      response: { status: 409, data: {} },
    })
    api.getModelAvailability.mockResolvedValue(overview({ missingModels: [] }))
    open([missing('a')])
    chooseReason()
    fireEvent.click(screen.getByRole('button', { name: /Disable 1 models/ }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Reload and retry/ })
    )
    expect(
      await screen.findByText(/no longer need disabling/)
    ).toBeInTheDocument()
    expect(controlCanvasLogicalModel).toHaveBeenCalledTimes(1)
  })

  it('stays on the failures when the latest state cannot be loaded', async () => {
    controlCanvasLogicalModel.mockRejectedValueOnce({
      response: { status: 409, data: {} },
    })
    api.getModelAvailability.mockRejectedValue(new Error('down'))
    open([missing('a')])
    chooseReason()
    fireEvent.click(screen.getByRole('button', { name: /Disable 1 models/ }))
    fireEvent.click(
      await screen.findByRole('button', { name: /Reload and retry/ })
    )
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Reload and retry/ })
    ).toBeEnabled()
  })
})

describe('ModelAvailabilitySettingsDialog', () => {
  const openDialog = (settings: object = {}) =>
    renderWithQuery(
      <ModelAvailabilitySettingsDialog
        overview={
          overview({
            settings: {
              autoProbeEnabled: false,
              intervalHours: 3,
              threshold: 2,
              listingKeywords: [],
              listingRetentionDays: 14,
              version: 4,
              ...settings,
            },
          }) as never
        }
        initialRuleProviderId={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    )

  it('shows where the alerts go, from the notification settings, and saves no addresses', async () => {
    getCanvasAdminNotificationSettings.mockResolvedValue({
      version: 2,
      addresses: [
        { id: 'a-1', name: 'Ops', type: 'EMAIL', hint: 'o***@example.com' },
      ],
      events: {
        'availability.missing': {
          category: 'MODEL',
          enabled: true,
          addressIds: ['a-1'],
        },
      },
      addressTypes: ['EMAIL'],
      lastDeliveries: {},
    })
    api.saveModelAvailabilitySettings.mockResolvedValue({ version: 5 })
    openDialog()
    expect(await screen.findByText('Ops (Email)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Alert email addresses')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.saveModelAvailabilitySettings).toHaveBeenCalled()
    )
    expect(
      api.saveModelAvailabilitySettings.mock.calls[0]?.[0]
    ).not.toHaveProperty('alertEmails')
  })

  it('saves the keywords lower-cased without repeats, with the retention days', async () => {
    api.saveModelAvailabilitySettings.mockResolvedValue({ version: 5 })
    openDialog({ listingKeywords: ['veo'] })
    const keywords = screen.getByLabelText('Keywords')
    fireEvent.change(keywords, { target: { value: ' Kling ' } })
    fireEvent.keyDown(keywords, { key: 'Enter' })
    fireEvent.change(keywords, { target: { value: 'VEO' } })
    fireEvent.keyDown(keywords, { key: 'Enter' })
    fireEvent.change(
      screen.getByLabelText('Keep in the list for how many days'),
      { target: { value: '30' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.saveModelAvailabilitySettings).toHaveBeenCalled()
    )
    expect(api.saveModelAvailabilitySettings.mock.calls[0]?.[0]).toMatchObject({
      listingKeywords: ['veo', 'kling'],
      listingRetentionDays: 30,
    })
  })

  it('blocks saving a retention outside 1 to 90 days and marks the field', () => {
    openDialog()
    const retention = screen.getByLabelText(
      'Keep in the list for how many days'
    )
    fireEvent.change(retention, { target: { value: '91' } })
    expect(retention).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('asks before discarding, and saves what was edited with the version it read', async () => {
    api.saveModelAvailabilitySettings.mockResolvedValue({ version: 5 })
    const onClose = vi.fn()
    renderWithQuery(
      <ModelAvailabilitySettingsDialog
        overview={overview() as never}
        initialRuleProviderId={null}
        onClose={onClose}
        onSaved={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard the unsaved changes?')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.saveModelAvailabilitySettings).toHaveBeenCalled()
    )
    expect(api.saveModelAvailabilitySettings.mock.calls[0]?.[0]).toMatchObject({
      expectedVersion: 4,
      autoProbeEnabled: true,
      intervalHours: 3,
      threshold: 2,
    })
  })

  it('keeps the version it was opened from when the page refreshes behind it', async () => {
    api.saveModelAvailabilitySettings.mockResolvedValue({ version: 10 })
    const client = new QueryClient()
    const dialog = (version: number) => (
      <QueryClientProvider client={client}>
        <ModelAvailabilitySettingsDialog
          overview={
            overview({
              settings: {
                autoProbeEnabled: false,
                intervalHours: 3,
                threshold: 2,
                listingKeywords: [],
                listingRetentionDays: 14,
                version,
              },
            }) as never
          }
          initialRuleProviderId={null}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </QueryClientProvider>
    )
    const view = render(dialog(4))
    view.rerender(dialog(9))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.saveModelAvailabilitySettings).toHaveBeenCalled()
    )
    expect(api.saveModelAvailabilitySettings.mock.calls[0]?.[0]).toMatchObject({
      expectedVersion: 4,
    })
  })

  it('says only what the switch does, and adds no note while it is off', () => {
    renderWithQuery(
      <ModelAvailabilitySettingsDialog
        overview={overview() as never}
        initialRuleProviderId={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByText(/does not probe on a schedule/)).toBeInTheDocument()
    expect(screen.queryByText(/test environments/)).toBeNull()
    expect(screen.queryByText(/appears at most/)).toBeNull()
    fireEvent.click(screen.getByRole('switch'))
    expect(
      screen.getByText(/appears at most about 6 hours/)
    ).toBeInTheDocument()
  })

  it('marks a provider that has no API Key group', () => {
    renderWithQuery(
      <ModelAvailabilitySettingsDialog
        overview={
          overview({
            coverage: {
              probedTargets: 0,
              totalTargets: 0,
              offProviders: [],
              unboundProviders: ['Even'],
            },
          }) as never
        }
        initialRuleProviderId={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByText('No API Key group bound')).toBeInTheDocument()
  })

  it('does not save a custom source that has no rule', () => {
    renderWithQuery(
      <ModelAvailabilitySettingsDialog
        overview={
          overview({
            providers: [{ ...provider, source: 'CUSTOM', rule: null }],
          }) as never
        }
        initialRuleProviderId={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('rejects an interval and a count out of range', () => {
    renderWithQuery(
      <ModelAvailabilitySettingsDialog
        overview={overview() as never}
        initialRuleProviderId={null}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('Probe every how many hours'), {
      target: { value: '25' },
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('ModelAvailabilityRuleDialog', () => {
  it('says the second request was not sent after the first may have been charged', async () => {
    api.testModelAvailabilityRequest.mockResolvedValue({
      availableModel: 'up-a',
      missingModel: 'no-such',
      sentAt: 'x',
      responses: [
        { timedOut: true, status: null, body: '' },
        { timedOut: false, status: null, body: '', notSent: true },
      ],
    })
    renderWithQuery(
      <ModelAvailabilityRuleDialog
        provider={provider}
        rule={null}
        intervalHours={3}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('Method'), {
      target: { value: 'REQUEST' },
    })
    fireEvent.change(screen.getByLabelText('Path'), {
      target: { value: '/v1/videos' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand/ }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Send requests and see the answers' })
    )
    expect(
      await screen.findByText(/Not sent: the first request/)
    ).toBeInTheDocument()
  })

  it('shows at once that a test paused the provider', async () => {
    api.testModelAvailabilityRequest.mockResolvedValue({
      availableModel: 'up-a',
      missingModel: 'no-such',
      sentAt: 'x',
      responses: [
        { timedOut: true, status: null, body: '' },
        { timedOut: false, status: null, body: '', notSent: true },
      ],
    })
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    render(
      <QueryClientProvider client={client}>
        <ModelAvailabilityRuleDialog
          provider={provider}
          rule={null}
          intervalHours={3}
          onCancel={vi.fn()}
          onApply={vi.fn()}
        />
      </QueryClientProvider>
    )
    fireEvent.change(screen.getByLabelText('Method'), {
      target: { value: 'REQUEST' },
    })
    fireEvent.change(screen.getByLabelText('Path'), {
      target: { value: '/v1/videos' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand/ }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Send requests and see the answers' })
    )
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['canvas-cloud', 'model-availability'],
      })
    )
  })

  it('stops a list path that carries a credential before it is sent', () => {
    renderWithQuery(
      <ModelAvailabilityRuleDialog
        provider={provider}
        rule={null}
        intervalHours={3}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('Path'), {
      target: { value: '/v1/models?key=abc' },
    })
    expect(
      screen.getByText('The path must not contain credentials.')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Test rule' }))
    expect(api.testModelAvailabilityList).not.toHaveBeenCalled()
  })

  it('offers and counts only the models the API Key choice can reach', () => {
    renderWithQuery(
      <ModelAvailabilityRuleDialog
        provider={provider}
        rule={null}
        intervalHours={3}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('Method'), {
      target: { value: 'REQUEST' },
    })
    expect(screen.getByText(/about 8 requests a day/)).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'up-z' })).toBeNull()
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'NONE' },
    })
    expect(screen.getByText(/about 16 requests a day/)).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'up-z' })).toBeInTheDocument()
  })

  it('explains where the model ID is without reading as a description of what was typed', () => {
    renderWithQuery(
      <ModelAvailabilityRuleDialog
        provider={provider}
        rule={null}
        intervalHours={3}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />
    )
    expect(
      screen.getByText(/holds the model ID in the provider answer/)
    ).toBeInTheDocument()
    expect(screen.queryByText(/takes the id of every item/)).toBeNull()
  })

  it('says a request still on its way cannot be judged yet', async () => {
    api.judgeModelAvailabilityRule.mockResolvedValue({
      sent: false,
      inProgress: true,
    })
    const rule = {
      type: 'REQUEST' as const,
      method: 'POST' as const,
      path: '/v1/x',
      auth: 'API_KEY' as const,
      template: '{"model":"{{model}}"}',
      timeoutSeconds: 15,
      rows: [
        {
          status: 400,
          path: 'error.message',
          op: 'CONTAINS' as const,
          value: 'gone',
          verdict: 'MISSING' as const,
        },
        {
          status: 400,
          path: 'error.message',
          op: 'CONTAINS' as const,
          value: 'bad',
          verdict: 'AVAILABLE' as const,
        },
      ],
    }
    renderWithQuery(
      <ModelAvailabilityRuleDialog
        provider={provider}
        rule={rule}
        intervalHours={3}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Judge with the stored answers' })
    )
    expect(await screen.findByText(/has not answered yet/)).toBeInTheDocument()
  })

  it('shows a failed list test in words, not as an internal code', async () => {
    api.testModelAvailabilityList.mockResolvedValue({
      ok: false,
      results: [
        {
          credentialGroupName: null,
          ok: false,
          reason: 'AUTH',
          count: 0,
          samples: [],
          snippet: '',
        },
      ],
    })
    renderWithQuery(
      <ModelAvailabilityRuleDialog
        provider={provider}
        rule={null}
        intervalHours={3}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Test rule' }))
    expect(
      await screen.findByText('The API Key is invalid or has no access')
    ).toBeInTheDocument()
    expect(screen.queryByText(/AUTH/)).toBeNull()
  })

  it('shows the exact requests and the daily count before anything is sent', () => {
    renderWithQuery(
      <ModelAvailabilityRuleDialog
        provider={provider}
        rule={null}
        intervalHours={3}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('Method'), {
      target: { value: 'REQUEST' },
    })
    fireEvent.change(screen.getByLabelText('Path'), {
      target: { value: '/v1/videos' },
    })
    expect(screen.getByText(/about 8 requests a day/)).toBeInTheDocument()
    expect(
      screen.getByText(
        /POST \/v1\/videos[\s\S]*Bearer \*\*\*[\s\S]*"model":"up-a"/
      )
    ).toBeInTheDocument()
  })

  it('names the field that is wrong, even when the rule is used without a test', () => {
    const onApply = vi.fn()
    renderWithQuery(
      <ModelAvailabilityRuleDialog
        provider={provider}
        rule={null}
        intervalHours={3}
        onCancel={vi.fn()}
        onApply={onApply}
      />
    )
    fireEvent.change(screen.getByLabelText('Method'), {
      target: { value: 'REQUEST' },
    })
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Use it without a test/ })
    )
    fireEvent.change(screen.getByLabelText(/wrong request content/), {
      target: { value: '{"model":"fixed"}' },
    })
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Use it without a test/ })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply to settings' }))
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByText(/The path must start with/)).toBeInTheDocument()
    expect(screen.getByText(/request content must contain/)).toBeInTheDocument()
    expect(
      screen.getByText('Fill in the field and the value of every rule.')
    ).toBeInTheDocument()
  })

  it('does not apply a list rule until its test passes', async () => {
    api.testModelAvailabilityList.mockResolvedValue({
      ok: true,
      results: [
        {
          credentialGroupName: null,
          ok: true,
          reason: null,
          count: 19,
          samples: ['b-one'],
          snippet: '',
        },
      ],
    })
    const onApply = vi.fn()
    renderWithQuery(
      <ModelAvailabilityRuleDialog
        provider={provider}
        rule={null}
        intervalHours={3}
        onCancel={vi.fn()}
        onApply={onApply}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply to settings' }))
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Test rule' }))
    expect(await screen.findByText('Read 19 models')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply to settings' }))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LIST' }),
      false
    )
  })

  it('needs the cost acknowledged before sending, and writes nothing into the rows for the admin', async () => {
    renderWithQuery(
      <ModelAvailabilityRuleDialog
        provider={provider}
        rule={null}
        intervalHours={3}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('Method'), {
      target: { value: 'REQUEST' },
    })
    expect(
      screen.getByRole('button', { name: 'Send requests and see the answers' })
    ).toBeDisabled()
    for (const input of screen.getAllByLabelText('Value')) {
      expect(input).toHaveValue('')
    }
  })

  it('uses a rule without a test only after confirmation, and never for a paused provider', () => {
    const rule = {
      type: 'REQUEST' as const,
      method: 'POST' as const,
      path: '/v1/x',
      auth: 'API_KEY' as const,
      template: '{"model":"{{model}}"}',
      timeoutSeconds: 15,
      rows: [
        {
          status: 400,
          path: 'error.message',
          op: 'CONTAINS' as const,
          value: 'gone',
          verdict: 'MISSING' as const,
        },
        {
          status: 400,
          path: 'error.message',
          op: 'CONTAINS' as const,
          value: 'bad',
          verdict: 'AVAILABLE' as const,
        },
      ],
    }
    const onApply = vi.fn()
    const view = renderWithQuery(
      <ModelAvailabilityRuleDialog
        provider={provider}
        rule={rule}
        intervalHours={3}
        onCancel={vi.fn()}
        onApply={onApply}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply to settings' }))
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('checkbox', { name: /Use it without a test/ })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Apply to settings' }))
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'REQUEST' }),
      true
    )
    view.unmount()
    renderWithQuery(
      <ModelAvailabilityRuleDialog
        provider={{
          ...provider,
          pause: {
            pausedAt: 'x',
            reason: 'TIMEOUT',
            credentialGroupId: null,
            modelKey: 'a',
          },
        }}
        rule={rule}
        intervalHours={3}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />
    )
    expect(
      screen.queryByRole('checkbox', { name: /Use it without a test/ })
    ).toBeNull()
  })
})

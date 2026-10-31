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
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isModelManagementTab } from '../model-management-tabs'
import { ModelAvailabilityBulkDisableDialog } from '../ModelAvailabilityBulkDisableDialog'
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
vi.mock('../../api', async (original) => ({
  ...(await original<object>()),
  controlCanvasLogicalModel,
}))

const missing = (modelKey: string, enabled = true) => ({
  modelKey,
  displayName: `Name ${modelKey}`,
  upstreamIds: [`up-${modelKey}`],
  providerId: 'p1',
  providerName: 'Even',
  credentialGroupName: 'Main',
  firstMissingAt: '2026-10-31T00:00:00.000Z',
  enabled,
  controlVersion: 3,
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
    version: 4,
  },
  providers: [provider],
  targets: [],
  models: [],
  counts: { missing: 0, failed: 0, paused: 0, badge: 0 },
  coverage: {
    probedTargets: 0,
    totalTargets: 1,
    offProviders: [],
    unboundProviders: [],
  },
  lastSuccessAt: null,
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
        counts: { missing: 0, failed: 1, paused: 0, badge: 1 },
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

  it('keeps disabled models folded under handled', async () => {
    api.getModelAvailability.mockResolvedValue(
      overview({
        models: [missing('a'), missing('b', false)],
        counts: { missing: 1, failed: 0, paused: 0, badge: 1 },
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(await screen.findByText('Name a')).toBeInTheDocument()
    expect(screen.queryByText('Name b')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Show handled/ }))
    expect(screen.getByText('Name b')).toBeInTheDocument()
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
        },
      })
    )
    renderWithQuery(<ModelAvailabilityPanel />)
    expect(
      await screen.findByText(
        /no API Key group and cannot be probed: Even, GWay/
      )
    ).toBeInTheDocument()
    expect(screen.getByText(/set not to probe: AI666/)).toBeInTheDocument()
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
    render(
      <ModelAvailabilityBulkDisableDialog
        models={models}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
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
      overview({ models: [missing('b')] })
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
      overview({ models: [{ ...missing('a'), controlVersion: 7 }] })
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
    api.getModelAvailability.mockResolvedValue(
      overview({ models: [missing('a', false)] })
    )
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

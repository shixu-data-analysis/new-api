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

import type { ChannelHealthItem } from '../../types'
import { ChannelControlDialog } from '../ChannelControlDialog'
import { ChannelHealth } from '../ChannelHealth'

const mocks = vi.hoisted(() => ({
  getCanvasChannelHealth: vi.fn(),
  controlCanvasChannel: vi.fn(),
}))
vi.mock('../../api', () => mocks)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const channel: ChannelHealthItem = {
  id: '85000000-0000-7000-8000-000000000001',
  code: 'image-channel',
  providerName: 'Example Provider',
  version: 1,
  enabled: true,
  providerEnabled: true,
  controlVersion: 0,
  roundStartedAt: '2026-09-05T00:00:00Z',
  succeeded: 1,
  failed: 1,
  unknown: 2,
  processing: 0,
  sampleCount: 2,
  successRate: 0.5,
  lastSuccessAt: null,
  lastFailureAt: null,
  affectedModels: [{ id: 'model-a', name: 'Canvas Image' }],
}
function mount(ui: React.ReactNode) {
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
      {ui}
    </QueryClientProvider>
  )
}
beforeAll(async () => {
  await i18next.init({ lng: 'en', resources: { en } })
})
beforeEach(async () => {
  await i18next.changeLanguage('en')
  vi.clearAllMocks()
  mocks.controlCanvasChannel.mockResolvedValue({})
  mocks.getCanvasChannelHealth.mockImplementation(async (query) => ({
    ...query,
    page: 1,
    pageSize: 20,
    total: 1,
    summary: channel,
    items: [channel],
    detail: null,
  }))
})
describe('channel health administration', () => {
  it.each(['zhCN', 'zhTW'])(
    'renders success rates with the %s interface language',
    async (language) => {
      await i18next.changeLanguage(language)
      mount(<ChannelHealth />)
      expect((await screen.findAllByText('50%')).length).toBeGreaterThan(0)
    }
  )
  it('switches report windows and execution source without combining Mock and Real calls', async () => {
    mount(<ChannelHealth />)
    await screen.findByText('Task success rate')
    await waitFor(() =>
      expect(mocks.getCanvasChannelHealth).toHaveBeenCalledWith(
        expect.objectContaining({ window: 'day', origin: 'REAL' })
      )
    )
    fireEvent.change(screen.getByLabelText('Time range'), {
      target: { value: 'month' },
    })
    await waitFor(() =>
      expect(mocks.getCanvasChannelHealth).toHaveBeenCalledWith(
        expect.objectContaining({ window: 'month', origin: 'REAL' })
      )
    )
    fireEvent.change(screen.getByLabelText('Execution source'), {
      target: { value: 'MOCK' },
    })
    await waitFor(() =>
      expect(mocks.getCanvasChannelHealth).toHaveBeenCalledWith(
        expect.objectContaining({ window: 'month', origin: 'MOCK' })
      )
    )
    mocks.getCanvasChannelHealth.mockClear()
    fireEvent.change(screen.getByLabelText('Time range'), {
      target: { value: 'custom' },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Select a positive time range of at most 30 days'
    )
    expect(mocks.getCanvasChannelHealth).not.toHaveBeenCalled()
  })
  it('requires other explanation and a second confirmation before disabling', async () => {
    const changed = vi.fn()
    mount(
      <ChannelControlDialog
        channel={channel}
        onClose={vi.fn()}
        onChanged={changed}
      />
    )
    const reason = screen.getByLabelText(/Reason/)
    expect(reason).toHaveAttribute('aria-invalid', 'false')
    fireEvent.change(reason, { target: { value: 'OTHER' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Provide an explanation'
    )
    expect(mocks.controlCanvasChannel).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/Additional explanation/), {
      target: { value: 'Manual investigation' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('Manual investigation')
    expect(mocks.controlCanvasChannel).not.toHaveBeenCalled()
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Disable channel' })
    )
    await waitFor(() => expect(changed).toHaveBeenCalledWith(false))
    expect(mocks.controlCanvasChannel).toHaveBeenCalledWith(
      channel.id,
      {
        enabled: false,
        expectedVersion: 0,
        reasonCode: 'OTHER',
        note: 'Manual investigation',
      },
      expect.stringMatching(/^channel-control:/)
    )
  })
  it('offers restoration reasons and keeps the operation unsuccessful when the API rejects stale state', async () => {
    const changed = vi.fn()
    mocks.controlCanvasChannel.mockRejectedValue(new Error('stale control'))
    mount(
      <ChannelControlDialog
        channel={{ ...channel, enabled: false, controlVersion: 1 }}
        onClose={vi.fn()}
        onChanged={changed}
      />
    )
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: 'NETWORK_RESTORED' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Review change' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('without deleting history')
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Restore channel' })
    )
    await waitFor(() => expect(mocks.controlCanvasChannel).toHaveBeenCalled())
    expect(changed).not.toHaveBeenCalled()
  })
})

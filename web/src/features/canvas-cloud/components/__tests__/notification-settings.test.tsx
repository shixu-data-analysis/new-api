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
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import type { CanvasNotificationSettings } from '../../types'
import { NotificationSettings } from '../NotificationSettings'

const api = vi.hoisted(() => ({
  notificationQueryKeys: {
    settings: ['canvas-cloud', 'admin', 'notifications', 'settings'],
  },
  getCanvasAdminNotificationSettings: vi.fn(),
  setCanvasAdminNotificationSettings: vi.fn(),
  testCanvasAdminNotificationAddress: vi.fn(),
}))
vi.mock('../../api', () => api)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const settings: CanvasNotificationSettings = {
  version: 3,
  addresses: [
    {
      id: 'hook',
      name: '运营群',
      type: 'WECOM',
      hint: 'qyapi.weixin.qq.com/…a1f3',
    },
  ],
  events: {
    'support.pending': {
      category: 'SUPPORT',
      enabled: true,
      addressIds: ['hook'],
    },
    'availability.paused': { category: 'MODEL', enabled: true, addressIds: [] },
  },
  addressTypes: ['WECOM', 'FEISHU', 'EMAIL'],
  lastDeliveries: {
    hook: { at: '2026-11-17T12:31:00.000Z', ok: false, reason: 'BOT_ERROR' },
  },
}

function wrap(children: ReactNode, client = testClient()) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function testClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/** What another administrator saved meanwhile: the group renamed, an email added and chosen for new messages. */
const changedElsewhere: CanvasNotificationSettings = {
  ...settings,
  version: 4,
  addresses: [
    {
      id: 'hook',
      name: '客服群',
      type: 'WECOM',
      hint: 'qyapi.weixin.qq.com/…a1f3',
    },
    { id: 'mail', name: '值班邮箱', type: 'EMAIL', hint: 'o***@example.com' },
  ],
  events: {
    ...settings.events,
    'support.pending': {
      category: 'SUPPORT',
      enabled: true,
      addressIds: ['hook', 'mail'],
    },
  },
}

describe('NOTIFICATIONS-001 运行管理 › 通知', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
    i18next.addResourceBundle('zhCN', 'translation', zh.translation, true, true)
    i18next.addResourceBundle(
      'zhTW',
      'translation',
      zhTW.translation,
      true,
      true
    )
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    api.getCanvasAdminNotificationSettings.mockResolvedValue(settings)
    api.setCanvasAdminNotificationSettings.mockResolvedValue(settings)
  })

  it('lists the addresses and the events, naming each event and its last delivery', async () => {
    render(wrap(<NotificationSettings />))
    const addresses = await screen.findByRole('region', {
      name: 'Notification addresses',
    })
    expect(within(addresses).getByText('运营群')).toBeInTheDocument()
    expect(within(addresses).getByText('WeCom')).toBeInTheDocument()
    expect(within(addresses).getByText(/Failed/)).toBeInTheDocument()
    expect(
      within(addresses).getByText(/The bot refused the message/)
    ).toBeInTheDocument()
    const events = screen.getByRole('region', { name: 'Notification events' })
    expect(within(events).getByText('New support message')).toBeInTheDocument()
    expect(within(events).getByText('Probing paused')).toBeInTheDocument()
    expect(
      within(events).getByText('No address is chosen, so nothing is sent')
    ).toBeInTheDocument()
    // Where an event goes is chosen in its addresses' dialogs; the table only shows it.
    expect(within(events).getByText('运营群 (WeCom)')).toBeInTheDocument()
    expect(
      within(events).queryByRole('button', { name: 'Change' })
    ).not.toBeInTheDocument()
  })

  it('shows the last delivery times in Chinese, whose language codes are not Intl tags', async () => {
    api.getCanvasAdminNotificationSettings.mockResolvedValue({
      ...settings,
      addresses: [
        ...settings.addresses,
        {
          id: 'mail',
          name: '运维邮箱',
          type: 'EMAIL',
          hint: 'o***@example.com',
        },
      ],
      lastDeliveries: {
        ...settings.lastDeliveries,
        mail: { at: '2026-11-17T12:40:00.000Z', ok: true, reason: null },
      },
    })
    for (const [language, failed] of [
      ['zhCN', /· 失败/],
      ['zhTW', /· 失敗/],
    ] as const) {
      await i18next.changeLanguage(language)
      const { unmount } = render(wrap(<NotificationSettings />))
      expect(await screen.findByText(failed)).toBeInTheDocument()
      expect(screen.getByText(/· 成功/)).toBeInTheDocument()
      unmount()
    }
  })

  it('keeps a saved Webhook left empty across bot kinds, but asks for an email when it turns into one', async () => {
    render(wrap(<NotificationSettings />))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Type of address 1'), {
      target: { value: 'EMAIL' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText('Enter the address')
    ).toBeInTheDocument()
    expect(api.setCanvasAdminNotificationSettings).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText('Type of address 1'), {
      target: { value: 'FEISHU' },
    })
    expect(within(dialog).getByLabelText('Address 1')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('…a1f3')
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.setCanvasAdminNotificationSettings).toHaveBeenCalled()
    )
    expect(
      api.setCanvasAdminNotificationSettings.mock.calls[0]?.[0].addresses[0]
    ).toEqual({ id: 'hook', name: '运营群', type: 'FEISHU' })
  })

  it('adds two addresses under one name for the chosen event in one save', async () => {
    render(wrap(<NotificationSettings />))
    fireEvent.click(await screen.findByRole('button', { name: 'New address' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument()
    expect(within(dialog).getByText('Enter the address')).toBeInTheDocument()
    expect(api.setCanvasAdminNotificationSettings).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: '财务群' },
    })
    fireEvent.change(within(dialog).getByLabelText('Address 1'), {
      target: { value: 'http://hooks.example.com/x' },
    })
    expect(
      within(dialog).getByText('Enter an address that starts with https://')
    ).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('Address 1'), {
      target: { value: 'https://open.feishu.cn/hook/1' },
    })
    fireEvent.change(within(dialog).getByLabelText('Type of address 1'), {
      target: { value: 'FEISHU' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add a row' }))
    fireEvent.change(within(dialog).getByLabelText('Type of address 2'), {
      target: { value: 'EMAIL' },
    })
    fireEvent.change(within(dialog).getByLabelText('Address 2'), {
      target: { value: 'pay@example.com' },
    })
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: /Probing paused/ })
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.setCanvasAdminNotificationSettings).toHaveBeenCalled()
    )
    const input = api.setCanvasAdminNotificationSettings.mock.calls[0]?.[0]
    expect(input.expectedVersion).toBe(3)
    expect(input.addresses.slice(1)).toEqual([
      expect.objectContaining({
        name: '财务群',
        type: 'FEISHU',
        url: 'https://open.feishu.cn/hook/1',
      }),
      expect.objectContaining({
        name: '财务群',
        type: 'EMAIL',
        email: 'pay@example.com',
      }),
    ])
    expect(input.events['availability.paused'].addressIds).toEqual(
      input.addresses.slice(1).map((address: { id: string }) => address.id)
    )
    expect(input.events['support.pending'].addressIds).toEqual(['hook'])
  })

  it('tells why a switch or a deletion was not saved, as neither has a dialog to show it', async () => {
    api.setCanvasAdminNotificationSettings.mockRejectedValue({
      response: { status: 500, data: { code: 'INTERNAL_ERROR' } },
    })
    render(wrap(<NotificationSettings />))
    fireEvent.click(
      await screen.findByRole('switch', { name: 'Send Probing paused' })
    )
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Unable to save the notification settings. Please try again.'
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const confirm = await screen.findByRole('alertdialog')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2))
  })

  it('saves an address edited across a refetch against the version it opened on', async () => {
    api.testCanvasAdminNotificationAddress.mockResolvedValue({
      ok: true,
      reason: null,
    })
    render(wrap(<NotificationSettings />))
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    // The test send reloads the page's settings, now the ones saved elsewhere.
    api.getCanvasAdminNotificationSettings.mockResolvedValue(changedElsewhere)
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Send test message' })
    )
    await waitFor(() =>
      expect(api.getCanvasAdminNotificationSettings).toHaveBeenCalledTimes(2)
    )
    expect(within(dialog).getByLabelText('Name')).toHaveValue('运营群')
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: '运营一群' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.setCanvasAdminNotificationSettings).toHaveBeenCalled()
    )
    const input = api.setCanvasAdminNotificationSettings.mock.calls[0]?.[0]
    expect(input.expectedVersion).toBe(3)
    expect(input.addresses).toEqual([
      { id: 'hook', name: '运营一群', type: 'WECOM' },
    ])
  })

  it('reloads after a change made elsewhere meanwhile, and names why a test failed', async () => {
    api.setCanvasAdminNotificationSettings.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { code: 'NOTIFICATION_SETTINGS_CONFLICT' },
      },
    })
    api.testCanvasAdminNotificationAddress.mockResolvedValue({
      ok: false,
      reason: 'TIMEOUT',
    })
    render(wrap(<NotificationSettings />))
    fireEvent.click(
      await screen.findByRole('switch', { name: 'Send Probing paused' })
    )
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('changed meanwhile')
      )
    )
    await waitFor(() =>
      expect(api.getCanvasAdminNotificationSettings).toHaveBeenCalledTimes(2)
    )
    expect(
      api.setCanvasAdminNotificationSettings.mock.calls[0]?.[0].events[
        'availability.paused'
      ].enabled
    ).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Send test' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The Webhook did not answer in time'
      )
    )
    expect(api.testCanvasAdminNotificationAddress).toHaveBeenCalledWith(
      'hook',
      expect.any(String)
    )
  })
})

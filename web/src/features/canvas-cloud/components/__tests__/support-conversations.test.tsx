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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { attachmentDigests } from '../../lib/support-attachments'
import {
  lastMessagePreview,
  startsTimeGroup,
  supportTimeLabel,
} from '../../lib/support-labels'
import type {
  CanvasAdminSupportConversation,
  CanvasAdminSupportMessage,
  CanvasSupportSettings,
} from '../../types'
import { SupportConversations } from '../SupportConversations'
import { SupportFailureAlerts } from '../SupportFailureAlerts'
import { MessageContent } from '../SupportMessageContent'
import { SupportSettingsDialog } from '../SupportSettingsDialog'
import { SupportThread } from '../SupportThread'

const apiMocks = vi.hoisted(() => ({
  supportQueryKeys: {
    all: ['canvas-cloud', 'admin', 'support'],
    conversations: ['canvas-cloud', 'admin', 'support', 'conversations'],
    pendingCount: ['canvas-cloud', 'admin', 'support', 'pending-count'],
    settings: ['canvas-cloud', 'admin', 'support', 'settings'],
    failureAlerts: ['canvas-cloud', 'admin', 'support', 'failure-alerts'],
  },
  getCanvasAdminSupportConversations: vi.fn(),
  getCanvasAdminSupportSettings: vi.fn(),
  getCanvasAdminSupportMessages: vi.fn(),
  replyCanvasAdminSupportConversation: vi.fn(),
  markCanvasAdminSupportHandled: vi.fn(),
  issueCanvasAdminSupportAttachment: vi.fn(),
  uploadCanvasSupportAttachment: vi.fn(),
  resolveCanvasSupportAttachmentUrl: vi.fn(),
  setCanvasAdminSupportSettings: vi.fn(),
  notificationQueryKeys: {
    settings: ['canvas-cloud', 'admin', 'notifications', 'settings'],
  },
  getCanvasAdminNotificationSettings: vi.fn(),
  getCanvasAdminSupportFailureAlerts: vi.fn(),
  notifyCanvasAdminSupportFailureAlerts: vi.fn(),
  dismissCanvasAdminSupportFailureAlerts: vi.fn(),
}))
vi.mock('../../api', () => apiMocks)
const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}))

const message = (
  overrides: Partial<CanvasAdminSupportMessage>
): CanvasAdminSupportMessage => ({
  seq: 1,
  sender: 'CUSTOMER',
  adminName: null,
  kind: 'TEXT',
  text: '视频一直生成失败',
  attachment: null,
  createdAt: '2026-11-16T05:31:00.000Z',
  ...overrides,
})
const xiaolin: CanvasAdminSupportConversation = {
  id: '92000000-0000-7000-8000-000000000001',
  customer: {
    id: '92000000-0000-7000-8000-000000000011',
    userId: '10245',
    name: '小林',
  },
  pending: true,
  pendingSince: '2026-11-16T05:31:00.000Z',
  lastMessage: message({ seq: 3, text: '还有一条卡住了' }),
}
const mia: CanvasAdminSupportConversation = {
  id: '92000000-0000-7000-8000-000000000002',
  customer: {
    id: '92000000-0000-7000-8000-000000000012',
    userId: '10871',
    name: 'Mia',
  },
  pending: false,
  pendingSince: null,
  lastMessage: message({
    seq: 2,
    sender: 'ADMIN',
    adminName: '运营',
    text: '已经恢复了',
  }),
}

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('SUPPORT-CHAT-001 客服会话', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasAdminSupportConversations.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 2,
      items: [xiaolin, mia],
    })
    apiMocks.getCanvasAdminSupportMessages.mockResolvedValue({
      messages: [
        message({ seq: 1 }),
        message({ seq: 2, sender: 'ADMIN', adminName: '运营', text: '收到' }),
      ],
      hasEarlier: false,
    })
    apiMocks.replyCanvasAdminSupportConversation.mockResolvedValue({
      messages: [
        message({ seq: 3, sender: 'ADMIN', adminName: '运营', text: '已恢复' }),
      ],
    })
    apiMocks.markCanvasAdminSupportHandled.mockResolvedValue(undefined)
    apiMocks.getCanvasAdminSupportFailureAlerts.mockResolvedValue({
      threshold: 3,
      windowHours: 24,
      models: [],
    })
  })

  it('names who spoke last in the list preview', () => {
    const t = i18next.t.bind(i18next) as never
    expect(lastMessagePreview(mia.lastMessage, t)).toBe('运营: 已经恢复了')
    expect(
      lastMessagePreview(message({ sender: 'SYSTEM', text: '模型已恢复' }), t)
    ).toBe('System notice: 模型已恢复')
    expect(lastMessagePreview(message({ kind: 'IMAGE', text: null }), t)).toBe(
      '[Image]'
    )
    expect(
      lastMessagePreview(
        message({ sender: 'ADMIN', adminName: null, kind: 'LOG', text: null }),
        t
      )
    ).toBe('Administrator: [Diagnostic log]')
    expect(lastMessagePreview(null, t)).toBe('')
  })

  it('views a log in a new tab and saves it through its download address', () => {
    const view = 'https://r2.example/support/c/log?X-Amz-Signature=view'
    const save = `${view}&response-content-disposition=attachment`
    render(
      wrap(
        <MessageContent
          mine={false}
          message={message({
            kind: 'LOG',
            text: null,
            attachment: {
              id: '93000000-0000-7000-8000-000000000009',
              kind: 'LOG',
              mimeType: 'text/plain',
              sizeBytes: 4096,
              url: view,
              downloadUrl: save,
              urlExpiresAt: '2026-11-16T05:41:00.000Z',
            },
          })}
        />
      )
    )
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute(
      'href',
      view
    )
    expect(screen.getByRole('link', { name: 'View' })).toHaveAttribute(
      'target',
      '_blank'
    )
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      save
    )
  })

  it('declares both digests of an upload, so the storage may check either', async () => {
    const digests = await attachmentDigests(new Blob(['abc']))
    expect(digests).toEqual({
      sha256:
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      md5: '900150983cd24fb0d6963f7d28e17f72',
    })
  })

  it('puts a time line before the first message and after a five-minute gap', () => {
    const t = i18next.t.bind(i18next) as never
    const at = (createdAt: string) => message({ createdAt })
    expect(startsTimeGroup(undefined, at('2026-11-16T14:57:00.000Z'))).toBe(
      true
    )
    expect(
      startsTimeGroup(
        at('2026-11-16T14:57:00.000Z'),
        at('2026-11-16T15:01:59.000Z')
      )
    ).toBe(false)
    expect(
      startsTimeGroup(
        at('2026-11-16T14:57:00.000Z'),
        at('2026-11-16T15:02:00.000Z')
      )
    ).toBe(true)
    const now = new Date('2026-11-16T15:00:00')
    expect(supportTimeLabel('2026-11-16T14:57:00', 'en-US', t, now)).toMatch(
      /^Today 0?2:57/
    )
    expect(supportTimeLabel('2026-11-15T14:57:00', 'en-US', t, now)).toMatch(
      /^Yesterday /
    )
    expect(supportTimeLabel('2026-11-14T21:40:00', 'en-US', t, now)).toMatch(
      /^11\/14 /
    )
  })

  it('lists conversations, filters the waiting ones and selects by id', async () => {
    const onConversationChange = vi.fn()
    render(
      wrap(
        <SupportConversations
          conversationId={mia.id}
          onConversationChange={onConversationChange}
          onOpenCustomer={vi.fn()}
        />
      )
    )
    expect(
      await screen.findByRole('button', { name: /小林/ })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mia/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('heading', { name: 'Mia' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /小林/ }))
    expect(onConversationChange).toHaveBeenCalledWith(xiaolin.id)
    fireEvent.click(screen.getByRole('button', { name: 'Awaiting reply' }))
    await waitFor(() =>
      expect(
        apiMocks.getCanvasAdminSupportConversations
      ).toHaveBeenLastCalledWith(
        { filter: 'pending', page: 1, pageSize: 20 },
        expect.anything()
      )
    )
  })

  it('opens a linked conversation that is not on the current page', async () => {
    const yuki: CanvasAdminSupportConversation = {
      ...mia,
      id: '92000000-0000-7000-8000-000000000003',
      customer: {
        ...mia.customer,
        id: '92000000-0000-7000-8000-000000000013',
        name: 'Yuki',
      },
    }
    apiMocks.getCanvasAdminSupportConversations.mockImplementation(
      async (query: { id?: string }) =>
        query.id
          ? { page: 1, pageSize: 10, total: 1, items: [yuki] }
          : { page: 1, pageSize: 20, total: 30, items: [xiaolin, mia] }
    )
    render(
      wrap(
        <SupportConversations
          conversationId={yuki.id}
          onOpenCustomer={vi.fn()}
        />
      )
    )
    expect(
      await screen.findByRole('heading', { name: 'Yuki' })
    ).toBeInTheDocument()
    expect(apiMocks.getCanvasAdminSupportConversations).toHaveBeenCalledWith(
      { filter: 'all', id: yuki.id, page: 1, pageSize: 10 },
      expect.anything()
    )
  })

  it('waits for a slow first load instead of starting another one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let fail!: (reason: Error) => void
    apiMocks.getCanvasAdminSupportMessages.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject
        })
    )
    try {
      render(
        wrap(
          <SupportThread
            conversation={xiaolin}
            quickReplies={{ conversation: [], failureNotice: [] }}
            onOpenCustomer={vi.fn()}
          />
        )
      )
      await vi.advanceTimersByTimeAsync(10_000)
      expect(apiMocks.getCanvasAdminSupportMessages).toHaveBeenCalledTimes(1)
      fail(new Error('timeout'))
      expect(
        await screen.findByText(
          'Unable to load the messages. Please try again.'
        )
      ).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(await screen.findByText('收到')).toBeInTheDocument()
      expect(
        screen.queryByText('Unable to load the messages. Please try again.')
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('loads the newest page again on the next poll after the first load failed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    apiMocks.getCanvasAdminSupportMessages.mockRejectedValueOnce(
      new Error('offline')
    )
    try {
      render(
        wrap(
          <SupportThread
            conversation={xiaolin}
            quickReplies={{ conversation: [], failureNotice: [] }}
            onOpenCustomer={vi.fn()}
          />
        )
      )
      expect(
        await screen.findByText(
          'Unable to load the messages. Please try again.'
        )
      ).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(10_000)
      expect(apiMocks.getCanvasAdminSupportMessages).toHaveBeenLastCalledWith(
        xiaolin.id,
        { limit: 50 },
        undefined
      )
      expect(await screen.findByText('收到')).toBeInTheDocument()
      expect(
        screen.queryByText('Unable to load the messages. Please try again.')
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('still polls a customer message that arrived before the reply', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    apiMocks.replyCanvasAdminSupportConversation.mockResolvedValueOnce({
      messages: [
        message({ seq: 4, sender: 'ADMIN', adminName: '运营', text: '已恢复' }),
      ],
    })
    try {
      render(
        wrap(
          <SupportThread
            conversation={xiaolin}
            quickReplies={{ conversation: [], failureNotice: [] }}
            onOpenCustomer={vi.fn()}
          />
        )
      )
      expect(await screen.findByText('收到')).toBeInTheDocument()
      const input = screen.getByRole('textbox', {
        name: 'Reply to 小林 (ID 10245)',
      })
      fireEvent.change(input, { target: { value: '已恢复' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(await screen.findByText('已恢复')).toBeInTheDocument()
      apiMocks.getCanvasAdminSupportMessages.mockResolvedValueOnce({
        messages: [message({ seq: 3, text: '还有一条卡住了' })],
        hasEarlier: false,
      })
      await vi.advanceTimersByTimeAsync(10_000)
      expect(apiMocks.getCanvasAdminSupportMessages).toHaveBeenLastCalledWith(
        xiaolin.id,
        { after: 2, limit: 100 }
      )
      expect(await screen.findByText('还有一条卡住了')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends with Enter, keeps Shift + Enter and composition for the text, and marks handled', async () => {
    const onOpenCustomer = vi.fn()
    render(
      wrap(
        <SupportThread
          conversation={xiaolin}
          quickReplies={{
            conversation: ['您好，我们已收到您的问题。'],
            failureNotice: ['原因已经查明并修复。'],
          }}
          onOpenCustomer={onOpenCustomer}
        />
      )
    )
    expect(await screen.findByText('收到')).toBeInTheDocument()
    const input = screen.getByRole('textbox', {
      name: 'Reply to 小林 (ID 10245)',
    })
    fireEvent.change(input, { target: { value: ' 已恢复 ' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(apiMocks.replyCanvasAdminSupportConversation).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(apiMocks.replyCanvasAdminSupportConversation).toHaveBeenCalledWith(
        {
          conversationId: xiaolin.id,
          input: { text: '已恢复', popup: true },
          idempotencyKey: expect.any(String),
        }
      )
    )
    await waitFor(() => expect(input).toHaveValue(''))
    expect(await screen.findByText('已恢复')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Customer details' }))
    expect(onOpenCustomer).toHaveBeenCalledWith(xiaolin.customer.id)
    fireEvent.click(screen.getByRole('button', { name: 'Mark as handled' }))
    await waitFor(() =>
      expect(apiMocks.markCanvasAdminSupportHandled).toHaveBeenCalledWith({
        conversationId: xiaolin.id,
        idempotencyKey: expect.any(String),
      })
    )

    fireEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    // Both groups are offered, each under its name.
    expect(await screen.findByText('Failure notices')).toBeInTheDocument()
    fireEvent.click(
      await screen.findByRole('menuitem', { name: '原因已经查明并修复。' })
    )
    expect(input).toHaveValue('原因已经查明并修复。')
  })

  it('sends a reply without the client pop-up when it is unchecked', async () => {
    render(
      wrap(
        <SupportThread
          conversation={xiaolin}
          quickReplies={{ conversation: [], failureNotice: [] }}
          onOpenCustomer={vi.fn()}
        />
      )
    )
    const input = await screen.findByRole('textbox', {
      name: 'Reply to 小林 (ID 10245)',
    })
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Pop up on the client' })
    )
    fireEvent.change(input, { target: { value: '顺便说一下' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(apiMocks.replyCanvasAdminSupportConversation).toHaveBeenCalledWith(
        expect.objectContaining({ input: { text: '顺便说一下', popup: false } })
      )
    )
  })

  it('holds pasted images above the input until they are sent or removed', async () => {
    render(
      wrap(
        <SupportThread
          conversation={mia}
          quickReplies={{ conversation: [], failureNotice: [] }}
          onOpenCustomer={vi.fn()}
        />
      )
    )
    const input = await screen.findByRole('textbox', {
      name: 'Reply to Mia (ID 10871)',
    })
    expect(
      screen.queryByRole('button', { name: 'Mark as handled' })
    ).not.toBeInTheDocument()
    const image = new File(['png'], 'shot.png', { type: 'image/png' })
    fireEvent.paste(input, { clipboardData: { files: [image] } })
    const list = await screen.findByRole('list', { name: 'Images to send' })
    expect(list.querySelectorAll('li')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }))
    expect(
      screen.queryByRole('list', { name: 'Images to send' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(apiMocks.issueCanvasAdminSupportAttachment).not.toHaveBeenCalled()
  })
})

describe('SUPPORT-CHAT-001 客服设置', () => {
  const saved: CanvasSupportSettings = {
    retentionDays: 7,
    failureAlerts: { threshold: 3, windowHours: 24 },
    quickReplies: { conversation: ['收到'], failureNotice: [] },
    version: 2,
    effectiveAt: '2026-11-16T03:00:00.000Z',
  }
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.setCanvasAdminSupportSettings.mockResolvedValue(saved)
    apiMocks.getCanvasAdminNotificationSettings.mockResolvedValue({
      version: 3,
      addresses: [
        {
          id: 'a-1',
          name: '运营群',
          type: 'WECOM',
          hint: 'qyapi.weixin.qq.com/…3f2a',
        },
        {
          id: 'a-2',
          name: '运营群',
          type: 'FEISHU',
          hint: 'open.feishu.cn/…77d0',
        },
      ],
      events: {
        'support.pending': {
          category: 'SUPPORT',
          enabled: true,
          addressIds: ['a-1', 'a-2'],
        },
      },
      addressTypes: ['WECOM', 'FEISHU', 'EMAIL'],
      lastDeliveries: {},
    })
  })

  it('warns before shortening the retention, shows where the alerts go and saves without them', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(wrap(<SupportSettingsDialog settings={saved} onClose={onClose} />))
    expect(await screen.findByText('运营群 (WeCom)')).toBeInTheDocument()
    expect(screen.getByText('运营群 (Feishu)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Webhook address')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Message retention' }))
    await user.click(
      screen.getByRole('combobox', { name: 'Keep messages for' })
    )
    await user.click(await screen.findByRole('option', { name: '3 days' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'older than 3 days are deleted at the next cleanup'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(apiMocks.setCanvasAdminSupportSettings).toHaveBeenCalledWith({
        retentionDays: 3,
        failureAlerts: { threshold: 3, windowHours: 24 },
        quickReplies: { conversation: ['收到'], failureNotice: [] },
      })
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('opens the notification settings only without unsaved changes', async () => {
    render(wrap(<SupportSettingsDialog settings={saved} onClose={vi.fn()} />))
    await screen.findByText('运营群 (WeCom)')
    fireEvent.change(screen.getByRole('textbox', { name: 'Failures' }), {
      target: { value: '5' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Change in Notifications' })
    )
    expect(navigate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Failures' }), {
      target: { value: '3' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Change in Notifications' })
    )
    expect(navigate).toHaveBeenCalledWith({
      to: '/canvas-cloud/$section',
      params: { section: 'runtime' },
      search: { view: 'notifications' },
    })
  })

  it('checks the failure alert range and saves the quick replies with the settings', async () => {
    render(wrap(<SupportSettingsDialog settings={saved} onClose={vi.fn()} />))
    fireEvent.change(screen.getByRole('textbox', { name: 'Failures' }), {
      target: { value: '1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('failures and')
    expect(apiMocks.setCanvasAdminSupportSettings).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('textbox', { name: 'Failures' }), {
      target: { value: '5' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Hours' }), {
      target: { value: '6' },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Quick replies' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove this quick reply' })
    )
    const [, failureAdder] = screen.getAllByRole('textbox', {
      name: 'Add a quick reply',
    })
    const [, failureAdd] = screen.getAllByRole('button', { name: 'Add' })
    fireEvent.change(failureAdder as HTMLElement, {
      target: { value: ' 已修复，可以再试 ' },
    })
    fireEvent.click(failureAdd as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(apiMocks.setCanvasAdminSupportSettings).toHaveBeenCalledWith({
        retentionDays: 7,
        failureAlerts: { threshold: 5, windowHours: 6 },
        quickReplies: { conversation: [], failureNotice: ['已修复，可以再试'] },
      })
    )
  })
})

describe('SUPPORT-CHAT-001 失败提醒', () => {
  const alerts = {
    threshold: 3,
    windowHours: 24,
    models: [
      {
        modelKey: 'seedance-2.0',
        modelName: 'Seedance 2.0',
        customers: [
          {
            alertId: '93000000-0000-7000-8000-000000000001',
            customer: { id: 'c-1', userId: '10245', name: '小林' },
            failureCount: 4,
            firstFailedAt: '2026-11-16T01:41:00.000Z',
            lastFailedAt: '2026-11-16T02:18:00.000Z',
            lastNotifiedAt: null,
          },
          {
            alertId: '93000000-0000-7000-8000-000000000002',
            customer: { id: 'c-2', userId: '10871', name: 'Mia' },
            failureCount: 3,
            firstFailedAt: '2026-11-16T01:55:00.000Z',
            lastFailedAt: '2026-11-16T02:12:00.000Z',
            lastNotifiedAt: null,
          },
        ],
      },
    ],
  }
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.notifyCanvasAdminSupportFailureAlerts.mockResolvedValue({
      notified: 1,
    })
    apiMocks.dismissCanvasAdminSupportFailureAlerts.mockResolvedValue({
      dismissed: 2,
    })
  })

  it('notifies only the chosen customers with a quick reply, and shows what they see', async () => {
    render(
      wrap(
        <SupportFailureAlerts
          alerts={alerts}
          quickReplies={['原因已经查明并修复。']}
          onOpenCustomer={vi.fn()}
        />
      )
    )
    // The model in the list names who failed.
    expect(screen.getByText('小林, Mia')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Choose Mia' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Notify customers of the result' })
    )
    const send = await screen.findByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Quick replies' }))
    fireEvent.click(
      await screen.findByRole('menuitem', { name: '原因已经查明并修复。' })
    )
    expect(
      screen.getByText('关于「Seedance 2.0」：原因已经查明并修复。')
    ).toBeInTheDocument()
    fireEvent.click(send)
    await waitFor(() =>
      expect(
        apiMocks.notifyCanvasAdminSupportFailureAlerts
      ).toHaveBeenCalledWith({
        modelKey: 'seedance-2.0',
        alertIds: ['93000000-0000-7000-8000-000000000001'],
        text: '原因已经查明并修复。',
        resolved: true,
        popup: true,
        idempotencyKey: expect.any(String),
      })
    )
  })

  it('tells customers it is still being worked on, quietly, and keeps the alert', async () => {
    render(
      wrap(
        <SupportFailureAlerts
          alerts={alerts}
          quickReplies={[]}
          onOpenCustomer={vi.fn()}
        />
      )
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Notify customers of the result' })
    )
    fireEvent.click(
      await screen.findByRole('radio', { name: /Still being worked on/ })
    )
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Pop up on the client' })
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Notice' }), {
      target: { value: '上游仍在修复' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(
        apiMocks.notifyCanvasAdminSupportFailureAlerts
      ).toHaveBeenCalledWith(
        expect.objectContaining({ resolved: false, popup: false })
      )
    )
  })

  it('dismisses the chosen alerts without a notice', async () => {
    render(
      wrap(
        <SupportFailureAlerts
          alerts={alerts}
          quickReplies={[]}
          onOpenCustomer={vi.fn()}
        />
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() =>
      expect(
        apiMocks.dismissCanvasAdminSupportFailureAlerts
      ).toHaveBeenCalledWith({
        modelKey: 'seedance-2.0',
        alertIds: [
          '93000000-0000-7000-8000-000000000001',
          '93000000-0000-7000-8000-000000000002',
        ],
        idempotencyKey: expect.any(String),
      })
    )
    expect(
      apiMocks.notifyCanvasAdminSupportFailureAlerts
    ).not.toHaveBeenCalled()
  })
})

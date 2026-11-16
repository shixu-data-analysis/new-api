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
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { lastMessagePreview } from '../../lib/support-labels'
import type {
  CanvasAdminSupportConversation,
  CanvasAdminSupportMessage,
  CanvasSupportSettings,
} from '../../types'
import { SupportConversations } from '../SupportConversations'
import { SupportSettingsDialog } from '../SupportSettingsDialog'
import { SupportThread } from '../SupportThread'

const apiMocks = vi.hoisted(() => ({
  supportQueryKeys: {
    all: ['canvas-cloud', 'admin', 'support'],
    conversations: ['canvas-cloud', 'admin', 'support', 'conversations'],
    pendingCount: ['canvas-cloud', 'admin', 'support', 'pending-count'],
    settings: ['canvas-cloud', 'admin', 'support', 'settings'],
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
  testCanvasAdminSupportWebhook: vi.fn(),
}))
vi.mock('../../api', () => apiMocks)

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
      hasLater: false,
    })
    apiMocks.replyCanvasAdminSupportConversation.mockResolvedValue({
      messages: [
        message({ seq: 3, sender: 'ADMIN', adminName: '运营', text: '已恢复' }),
      ],
    })
    apiMocks.markCanvasAdminSupportHandled.mockResolvedValue(undefined)
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

  it('sends with Enter, keeps Shift + Enter and composition for the text, and marks handled', async () => {
    const onOpenCustomer = vi.fn()
    render(
      wrap(
        <SupportThread conversation={xiaolin} onOpenCustomer={onOpenCustomer} />
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
          input: { text: '已恢复' },
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
  })

  it('holds pasted images above the input until they are sent or removed', async () => {
    render(wrap(<SupportThread conversation={mia} onOpenCustomer={vi.fn()} />))
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
    webhook: { format: 'WECOM', displayHint: 'qyapi.weixin.qq.com/…3f2a' },
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
    apiMocks.testCanvasAdminSupportWebhook.mockResolvedValue({
      ok: true,
      reason: null,
    })
  })

  it('warns before shortening the retention and keeps the saved address when the field is empty', async () => {
    const onClose = vi.fn()
    render(wrap(<SupportSettingsDialog settings={saved} onClose={onClose} />))
    // The test i18n escapes interpolated values, so only the unescaped parts are matched.
    expect(
      screen.getByLabelText('Webhook address').getAttribute('placeholder')
    ).toMatch(
      /^Saved: qyapi\.weixin\.qq\.com.+3f2a\. Leave empty to keep it\.$/
    )
    fireEvent.click(screen.getByRole('radio', { name: '3 days' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'older than 3 days are deleted at the next cleanup'
    )
    expect(
      screen.getByRole('button', { name: 'Send test message' })
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: 'Feishu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(apiMocks.setCanvasAdminSupportSettings).toHaveBeenCalledWith({
        retentionDays: 3,
        webhook: { format: 'FEISHU' },
      })
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('asks for an HTTPS address before the first save and sends the test of a saved Webhook', async () => {
    const empty: CanvasSupportSettings = {
      retentionDays: 3,
      webhook: null,
      version: null,
      effectiveAt: null,
    }
    const { unmount } = render(
      wrap(<SupportSettingsDialog settings={empty} onClose={vi.fn()} />)
    )
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Send Webhook alerts' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter the Webhook address'
    )
    fireEvent.change(screen.getByLabelText('Webhook address'), {
      target: { value: 'http://hooks.example.com/x' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter an address that starts with https://'
    )
    fireEvent.change(screen.getByLabelText('Webhook address'), {
      target: { value: ' https://hooks.example.com/x ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(apiMocks.setCanvasAdminSupportSettings).toHaveBeenCalledWith({
        retentionDays: 3,
        webhook: { format: 'WECOM', url: 'https://hooks.example.com/x' },
      })
    )
    unmount()

    render(wrap(<SupportSettingsDialog settings={saved} onClose={vi.fn()} />))
    fireEvent.click(screen.getByRole('button', { name: 'Send test message' }))
    await waitFor(() =>
      expect(apiMocks.testCanvasAdminSupportWebhook).toHaveBeenCalledWith(
        expect.any(String)
      )
    )
  })
})

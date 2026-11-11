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
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { AdminConventionVersions } from '../AdminConventionVersions'
import { AdminCustomerMails } from '../AdminCustomerMails'
import { CustomerMailDialog } from '../CustomerMailDialog'
import { CustomerSuspensionDialog } from '../CustomerSuspensionDialog'

const apiMocks = vi.hoisted(() => ({
  customerNoticeQueryKeys: {
    conventions: ['canvas-cloud', 'admin', 'convention-versions'],
    convention: (id: string) => [
      'canvas-cloud',
      'admin',
      'convention-versions',
      id,
    ],
    mails: ['canvas-cloud', 'admin', 'customer-emails'],
    audience: ['canvas-cloud', 'admin', 'customer-emails', 'audience'],
    reminder: ['canvas-cloud', 'admin', 'points-expiry-reminder'],
  },
  getConventionVersions: vi.fn(),
  getConventionVersion: vi.fn(),
  publishConventionVersion: vi.fn(),
  suspendCustomer: vi.fn(),
  restoreCustomer: vi.fn(),
  getActiveCustomerCount: vi.fn(),
  sendCustomerMail: vi.fn(),
  sendTestCustomerMail: vi.fn(),
  getCustomerMails: vi.fn(),
  getCustomerMailFailures: vi.fn(),
  getPointsExpiryReminder: vi.fn(),
  setPointsExpiryReminder: vi.fn(),
  getPointsExpiryReminderPreview: vi.fn(),
}))
vi.mock('../../customer-notices-api', () => apiMocks)

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  )
}

describe('COMMUNITY-CONVENTION-001 admin', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getConventionVersions.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 2,
      items: [
        {
          id: 'v-2',
          version: 2,
          publishedAt: '2026-11-11T02:00:00.000Z',
          current: true,
        },
        {
          id: 'v-1',
          version: 1,
          publishedAt: '2026-10-02T01:30:00.000Z',
          current: false,
        },
      ],
    })
    apiMocks.getConventionVersion.mockResolvedValue({
      id: 'v-2',
      version: 2,
      body: '第二版正文',
      publishedAt: '2026-11-11T02:00:00.000Z',
    })
    apiMocks.publishConventionVersion.mockResolvedValue({
      id: 'v-3',
      version: 3,
      body: '第三版',
      publishedAt: '2026-11-11T03:00:00.000Z',
    })
    apiMocks.getActiveCustomerCount.mockResolvedValue({ activeCustomers: 12 })
    apiMocks.sendCustomerMail.mockResolvedValue({
      batchId: 'b-1',
      queued: 2,
      skipped: 1,
    })
    apiMocks.sendTestCustomerMail.mockResolvedValue({
      addressMasked: 'a***@example.com',
    })
    apiMocks.suspendCustomer.mockResolvedValue({ status: 'SUSPENDED' })
    apiMocks.restoreCustomer.mockResolvedValue({ status: 'ACTIVE' })
    apiMocks.getCustomerMails.mockImplementation(
      async (query: { kind: string }) => ({
        page: 1,
        pageSize: 20,
        total: 1,
        items: [
          query.kind === 'MANUAL'
            ? {
                id: 'b-1',
                kind: 'MANUAL',
                audience: 'ALL_ACTIVE',
                subject: '维护通知',
                createdAt: '2026-11-11T07:02:00.000Z',
                sender: 'xu.shi',
                recipients: 3,
                sent: 2,
                failed: 1,
                queued: 0,
              }
            : {
                id: 'b-2',
                kind: 'POINTS_EXPIRY',
                audience: null,
                subject: null,
                createdAt: '2026-11-11T02:00:00.000Z',
                sender: null,
                recipients: 0,
                sent: 0,
                failed: 0,
                queued: 0,
              },
        ],
      })
    )
    apiMocks.getCustomerMailFailures.mockResolvedValue({
      items: [
        {
          customerId: 'c-3',
          username: 'zhou_vfx',
          emailMasked: 'z***@example.com',
          reason: 'NO_ADDRESS',
        },
      ],
    })
    apiMocks.getPointsExpiryReminder.mockResolvedValue({
      enabled: true,
      daysBefore: 7,
      version: null,
    })
    apiMocks.setPointsExpiryReminder.mockResolvedValue({
      enabled: true,
      daysBefore: 15,
      version: 1,
    })
  })

  it('lists convention versions and publishes a new one starting from the current text', async () => {
    const slot = document.createElement('div')
    document.body.append(slot)
    renderWithClient(<AdminConventionVersions titleActionSlot={slot} />)
    expect(await screen.findByText('Current')).toBeInTheDocument()
    fireEvent.click(
      within(slot).getByRole('button', { name: 'Publish new version' })
    )
    const text = await screen.findByLabelText('Convention text')
    await waitFor(() => expect(text).toHaveValue('第二版正文'))
    fireEvent.change(text, { target: { value: '  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(
      await screen.findByText('Enter the convention text.')
    ).toBeInTheDocument()
    expect(apiMocks.publishConventionVersion).not.toHaveBeenCalled()
    fireEvent.change(text, { target: { value: ' 第三版 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() =>
      expect(apiMocks.publishConventionVersion).toHaveBeenCalledWith(
        expect.objectContaining({ body: '第三版' })
      )
    )
    slot.remove()
  })

  it('starts a new version from the current text even when the list shows a later page', async () => {
    apiMocks.getConventionVersions.mockImplementation(
      async (query: { pageSize: number }) =>
        query.pageSize === 10
          ? {
              page: 1,
              pageSize: 10,
              total: 21,
              items: [
                {
                  id: 'v-21',
                  version: 21,
                  publishedAt: '2026-11-11T02:00:00.000Z',
                  current: true,
                },
              ],
            }
          : {
              page: 2,
              pageSize: 20,
              total: 21,
              items: [
                {
                  id: 'v-1',
                  version: 1,
                  publishedAt: '2026-10-02T01:30:00.000Z',
                  current: false,
                },
              ],
            }
    )
    apiMocks.getConventionVersion.mockResolvedValue({
      id: 'v-21',
      version: 21,
      body: '第二十一版正文',
      publishedAt: '2026-11-11T02:00:00.000Z',
    })
    const slot = document.createElement('div')
    document.body.append(slot)
    renderWithClient(<AdminConventionVersions titleActionSlot={slot} />)
    expect(await screen.findByText('Version 1')).toBeInTheDocument()
    fireEvent.click(
      within(slot).getByRole('button', { name: 'Publish new version' })
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Convention text')).toHaveValue(
        '第二十一版正文'
      )
    )
    expect(apiMocks.getConventionVersions).toHaveBeenCalledWith(
      { page: 1, pageSize: 10 },
      expect.anything()
    )
    slot.remove()
  })

  it('mails selected customers, skipping inactive ones, only after confirmation', async () => {
    const onClose = vi.fn()
    renderWithClient(
      <CustomerMailDialog
        audience={{
          kind: 'selected',
          customers: [
            { customerId: 'c-1', username: 'alice', status: 'ACTIVE' },
            { customerId: 'c-2', username: 'bob', status: 'ACTIVE' },
            { customerId: 'c-3', username: 'carol', status: 'SUSPENDED' },
          ],
        }}
        onClose={onClose}
      />
    )
    expect(screen.getByText('Recipients (3)')).toBeInTheDocument()
    expect(
      screen.getByText('1 customers are not active and will be skipped.')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Enter a subject.')).toBeInTheDocument()
    expect(screen.getByText('Enter the mail text.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: '违规通知' },
    })
    fireEvent.change(screen.getByLabelText('Mail text'), {
      target: { value: '第一段\n\n第二段' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Send a test mail to me' })
    )
    await waitFor(() =>
      expect(apiMocks.sendTestCustomerMail).toHaveBeenCalledWith({
        kind: 'MANUAL',
        subject: '违规通知',
        body: '第一段\n\n第二段',
      })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(
      within(confirm).getByText('Send to 2 customers?')
    ).toBeInTheDocument()
    expect(apiMocks.sendCustomerMail).not.toHaveBeenCalled()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(apiMocks.sendCustomerMail).toHaveBeenCalledWith(
        expect.objectContaining({
          audience: expect.objectContaining({ kind: 'selected' }),
          subject: '违规通知',
          body: '第一段\n\n第二段',
        })
      )
    )
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('mails every active customer with the count Cloud reports', async () => {
    renderWithClient(
      <CustomerMailDialog audience={{ kind: 'allActive' }} onClose={vi.fn()} />
    )
    expect(
      await screen.findByText('Recipients: every active customer (12)')
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Subject'), {
      target: { value: '维护' },
    })
    fireEvent.change(screen.getByLabelText('Mail text'), {
      target: { value: '正文' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(
      within(confirm).getByText('Send to 12 customers?')
    ).toBeInTheDocument()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Send' }))
    await waitFor(() =>
      expect(apiMocks.sendCustomerMail).toHaveBeenCalledWith(
        expect.objectContaining({ audience: { kind: 'allActive' } })
      )
    )
  })

  it('requires a reason to suspend but not to restore', async () => {
    renderWithClient(
      <CustomerSuspensionDialog
        customer={{ customerId: 'c-1', username: 'alice' }}
        action='suspend'
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Suspend account' }))
    expect(await screen.findByText('Enter a reason.')).toBeInTheDocument()
    expect(apiMocks.suspendCustomer).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: ' 违规 ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Suspend account' }))
    await waitFor(() =>
      expect(apiMocks.suspendCustomer).toHaveBeenCalledWith('c-1', '违规')
    )
  })

  it('restores without a reason', async () => {
    renderWithClient(
      <CustomerSuspensionDialog
        customer={{ customerId: 'c-1', username: 'alice' }}
        action='restore'
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Restore account' }))
    await waitFor(() =>
      expect(apiMocks.restoreCustomer).toHaveBeenCalledWith('c-1', '')
    )
  })

  it('shows send results, the failures of one send and the reminder settings', async () => {
    renderWithClient(<AdminCustomerMails />)
    expect(await screen.findByText('3 people · 1 failed')).toBeInTheDocument()
    expect(screen.getByText('Every active customer')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(await screen.findByText('zhou_vfx')).toBeInTheDocument()
    expect(screen.getByText('No email address')).toBeInTheDocument()
  })
})

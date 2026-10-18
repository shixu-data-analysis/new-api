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
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { AdminAnnouncements } from '../AdminAnnouncements'

const apiMocks = vi.hoisted(() => ({
  announcementQueryKeys: {
    all: ['canvas-cloud', 'admin', 'announcements'],
    tags: ['canvas-cloud', 'admin', 'announcement-tags'],
    retention: ['canvas-cloud', 'admin', 'announcement-retention'],
  },
  getCanvasAdminAnnouncements: vi.fn(),
  getCanvasAnnouncementTags: vi.fn(),
  getCanvasAnnouncementRetention: vi.fn(),
  createCanvasAdminAnnouncement: vi.fn(),
  updateCanvasAdminAnnouncement: vi.fn(),
  deleteCanvasAdminAnnouncements: vi.fn(),
  replaceCanvasAnnouncementTags: vi.fn(),
  setCanvasAnnouncementRetention: vi.fn(),
}))
vi.mock('../../api', () => apiMocks)

const important = {
  id: 'tag-1',
  name: '重要',
  color: 'red',
  defaultAutoPopup: true,
}
const quiet = {
  id: 'tag-2',
  name: '维护',
  color: 'orange',
  defaultAutoPopup: false,
}
const published = {
  id: 'a-1',
  title: '价格调整',
  body: '第一行\n第二行',
  tag: { id: 'tag-1', name: '重要', color: 'red' },
  autoPopup: true,
  publishedAt: '2026-10-18T06:24:00.000Z',
  status: 'PUBLISHED' as const,
}
const scheduled = {
  ...published,
  id: 'a-2',
  title: '系统维护',
  body: '',
  tag: null,
  autoPopup: false,
  publishedAt: '2026-10-26T12:00:00.000Z',
  status: 'SCHEDULED' as const,
}

function renderPage() {
  const slot = document.createElement('div')
  document.body.append(slot)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <AdminAnnouncements titleActionSlot={slot} />
    </QueryClientProvider>
  )
  return { slot }
}

describe('Canvas system announcements admin', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasAdminAnnouncements.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 2,
      items: [scheduled, published],
    })
    apiMocks.getCanvasAnnouncementTags.mockResolvedValue({
      items: [important, quiet],
    })
    apiMocks.getCanvasAnnouncementRetention.mockResolvedValue({
      visibleDays: 14,
      deleteAfterOfflineDays: null,
      version: null,
      effectiveAt: null,
    })
    apiMocks.deleteCanvasAdminAnnouncements.mockResolvedValue({ deleted: 2 })
    apiMocks.createCanvasAdminAnnouncement.mockResolvedValue({
      ...published,
      id: 'a-3',
    })
    apiMocks.updateCanvasAdminAnnouncement.mockResolvedValue(published)
    apiMocks.setCanvasAnnouncementRetention.mockResolvedValue({
      visibleDays: 30,
      deleteAfterOfflineDays: 90,
      version: 1,
      effectiveAt: '2026-10-18T08:00:00.000Z',
    })
    apiMocks.replaceCanvasAnnouncementTags.mockResolvedValue({
      items: [important],
    })
  })

  it('names the current visible time and confirms the deletion of the selected rows', async () => {
    renderPage()
    expect(
      await screen.findByRole('button', {
        name: 'Visible time and cleanup: last 14 days · No automatic deletion',
      })
    ).toBeInTheDocument()
    expect(await screen.findByText('价格调整')).toBeInTheDocument()
    expect(screen.getByText('第一行 第二行')).toBeInTheDocument()
    expect(screen.getByText('Scheduled to publish')).toBeInTheDocument()
    expect(screen.getByText('Pop up once')).toBeInTheDocument()
    expect(screen.getByText('Dot only')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Delete selected/ })
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Select all on this page' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete selected (2)' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText('Delete the 2 selected announcements?')
    ).toBeInTheDocument()
    expect(apiMocks.deleteCanvasAdminAnnouncements).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(apiMocks.deleteCanvasAdminAnnouncements).toHaveBeenCalledWith([
        'a-2',
        'a-1',
      ])
    )
  })

  it('shows a retry when the visible time settings fail to load', async () => {
    apiMocks.getCanvasAnnouncementRetention
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        visibleDays: 7,
        deleteAfterOfflineDays: 30,
        version: 1,
        effectiveAt: null,
      })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(
      await screen.findByRole('button', {
        name: 'Visible time and cleanup: last 7 days · Delete 30 days after going offline',
      })
    ).toBeEnabled()
  })

  it('confirms a single deletion with its title', async () => {
    renderPage()
    const row = (await screen.findByText('价格调整')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText('Delete this announcement?')
    ).toBeInTheDocument()
    expect(dialog).toHaveTextContent('“价格调整” will be deleted.')
  })

  it('publishes now with the default of the picked tag, and needs a time to schedule', async () => {
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Publish announcement' })
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))
    expect(
      await within(dialog).findByText('Enter a title.')
    ).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: '  新功能上线  ' },
    })
    fireEvent.click(
      within(dialog).getByRole('radio', { name: 'Publish at a set time' })
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))
    expect(
      await within(dialog).findByText('Choose a time.')
    ).toBeInTheDocument()
    expect(apiMocks.createCanvasAdminAnnouncement).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('radio', { name: 'Publish now' }))
    const popup = within(dialog).getByRole('switch', { name: 'Pop up once' })
    fireEvent.click(await within(dialog).findByRole('radio', { name: '重要' }))
    expect(popup).toBeChecked()
    fireEvent.click(within(dialog).getByRole('radio', { name: '维护' }))
    expect(popup).not.toBeChecked()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }))
    await waitFor(() =>
      expect(apiMocks.createCanvasAdminAnnouncement).toHaveBeenCalledWith({
        input: {
          title: '新功能上线',
          body: '',
          tagId: 'tag-2',
          autoPopup: false,
          publishAt: null,
        },
        idempotencyKey: expect.stringMatching(/^web-announcement-/),
      })
    )
  })

  it('retries a publish with the same key and uses a new key once the content changes', async () => {
    apiMocks.createCanvasAdminAnnouncement
      .mockRejectedValueOnce(new Error('response lost'))
      .mockRejectedValueOnce(new Error('response lost'))
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Publish announcement' })
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: '维护通知' },
    })
    const publish = within(dialog).getByRole('button', { name: 'Publish' })
    fireEvent.click(publish)
    await waitFor(() => expect(publish).toBeEnabled())
    fireEvent.click(publish)
    await waitFor(() =>
      expect(apiMocks.createCanvasAdminAnnouncement).toHaveBeenCalledTimes(2)
    )
    await waitFor(() => expect(publish).toBeEnabled())
    fireEvent.change(within(dialog).getByLabelText('Title'), {
      target: { value: '维护通知（更新）' },
    })
    fireEvent.click(publish)
    await waitFor(() =>
      expect(apiMocks.createCanvasAdminAnnouncement).toHaveBeenCalledTimes(3)
    )
    const keys = apiMocks.createCanvasAdminAnnouncement.mock.calls.map(
      (call) => call[0].idempotencyKey
    )
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
  })

  it('keeps the time of a published announcement when it is edited', async () => {
    renderPage()
    const row = (await screen.findByText('价格调整')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).queryByRole('radio', { name: 'Publish now' })
    ).not.toBeInTheDocument()
    expect(within(dialog).getByText(/^Published at /)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(apiMocks.updateCanvasAdminAnnouncement).toHaveBeenCalledWith(
        'a-1',
        {
          title: '价格调整',
          body: '第一行\n第二行',
          tagId: 'tag-1',
          autoPopup: true,
        }
      )
    )
  })

  it('saves the visible time within 1 to 365 days and the automatic deletion', async () => {
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: /^Visible time and cleanup: / })
    )
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Visible days' }),
      { target: { value: '400' } }
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText('Enter a whole number from 1 to 365')
    ).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('radio', { name: '30 days' }))
    fireEvent.click(
      within(dialog).getByRole('radio', {
        name: 'Delete 90 days after going offline',
      })
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(apiMocks.setCanvasAnnouncementRetention).toHaveBeenCalledWith({
        visibleDays: 30,
        deleteAfterOfflineDays: 90,
      })
    )
  })

  it('lets tags be edited only after the full list has loaded', async () => {
    let finish: (value: { items: (typeof important)[] }) => void = () => {}
    apiMocks.getCanvasAnnouncementTags.mockImplementation(
      () => new Promise((resolve) => (finish = resolve))
    )
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Publish announcement' })
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Manage tags' }))
    const dialog = (await screen.findAllByRole('dialog')).at(-1)!
    expect(
      within(dialog).getByRole('button', { name: 'Add tag' })
    ).toBeDisabled()
    finish({ items: [important, quiet] })
    expect(
      await within(dialog).findAllByRole('textbox', { name: 'Tag name' })
    ).toHaveLength(2)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add tag' }))
    fireEvent.change(
      within(dialog).getAllByRole('textbox', { name: 'Tag name' })[2]!,
      { target: { value: '活动' } }
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(apiMocks.replaceCanvasAnnouncementTags).toHaveBeenCalledWith([
        important,
        quiet,
        { name: '活动', color: 'gray', defaultAutoPopup: false },
      ])
    )
  })

  it('saves the whole tag list only with unique names', async () => {
    renderPage()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Publish announcement' })
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Manage tags' }))
    const dialog = (await screen.findAllByRole('dialog')).at(-1)!
    const names = await within(dialog).findAllByRole('textbox', {
      name: 'Tag name',
    })
    fireEvent.change(names[1]!, { target: { value: '重要' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(
      await within(dialog).findByText('Another tag already has this name.')
    ).toBeInTheDocument()
    expect(apiMocks.replaceCanvasAnnouncementTags).not.toHaveBeenCalled()

    fireEvent.click(
      within(dialog).getAllByRole('button', { name: 'Delete' })[1]!
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(apiMocks.replaceCanvasAnnouncementTags).toHaveBeenCalledWith([
        { id: 'tag-1', name: '重要', color: 'red', defaultAutoPopup: true },
      ])
    )
  })
})

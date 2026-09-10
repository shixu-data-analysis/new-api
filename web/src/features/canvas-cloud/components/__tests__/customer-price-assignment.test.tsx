/* Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later. */
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
import zh from '@/i18n/locales/zh.json'

import { customerPriceAssignmentSchema } from '../../form-validation'
import { CustomerPriceAssignment } from '../CustomerPriceAssignment'

const mocks = vi.hoisted(() => ({
  getCanvasCustomerPriceAssignments: vi.fn(),
  getCanvasPriceGroups: vi.fn(),
  assignCanvasCustomerPriceGroup: vi.fn(),
}))
vi.mock('../../api', () => mocks)
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const oldId = '85000000-0000-7000-8000-000000000001'
const newId = '85000000-0000-7000-8000-000000000002'
const oldGroup = {
  id: oldId,
  internalName: 'Standard',
  version: 1,
  status: 'PUBLISHED',
}
const newGroup = {
  id: newId,
  internalName: 'Partner',
  version: 2,
  status: 'PUBLISHED',
}
const initial = {
  customerId: 'customer-a',
  customerName: 'Alice',
  currentGroup: oldGroup,
  page: 1,
  pageSize: 20,
  total: 1,
  items: [
    {
      id: 'assignment-1',
      priceGroupId: oldId,
      internalName: 'Standard',
      version: 1,
      reason: 'Initial invitation',
      actorName: 'Admin',
      effectiveAt: '2026-09-01T00:00:00Z',
      endedAt: null,
    },
  ],
}

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CustomerPriceAssignment customerId='customer-a' customerName='Alice' />
    </QueryClientProvider>
  )
}

async function openAdjustment() {
  await screen.findByText('Standard · v1')
  fireEvent.click(screen.getByRole('button', { name: 'Adjust' }))
  return screen.findByRole('dialog')
}

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en, zhCN: zh },
    fallbackLng: 'en',
  })
})

beforeEach(async () => {
  vi.clearAllMocks()
  await i18next.changeLanguage('en')
  mocks.getCanvasCustomerPriceAssignments.mockResolvedValue(initial)
  mocks.getCanvasPriceGroups.mockResolvedValue([
    oldGroup,
    newGroup,
    { id: 'draft', internalName: 'Draft plan', status: 'DRAFT' },
  ])
  mocks.assignCanvasCustomerPriceGroup.mockResolvedValue({})
})

describe('customer price assignment', () => {
  it('reviews normalized input in the same drawer and refreshes after confirmation', async () => {
    mount()
    let drawer = await openAdjustment()
    const select = within(drawer).getByRole('combobox', {
      name: /New price plan/,
    })
    expect(within(select).queryByText('Draft plan')).not.toBeInTheDocument()
    expect(within(select).queryByText('Standard · v1')).not.toBeInTheDocument()
    fireEvent.change(select, { target: { value: newId } })
    fireEvent.change(
      within(drawer).getByRole('textbox', { name: /Adjustment reason/ }),
      { target: { value: '  Move to partner plan  ' } }
    )
    fireEvent.click(within(drawer).getByRole('button', { name: 'Next' }))

    drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Confirm adjustment · Alice')).toBeVisible()
    expect(within(drawer).getByText('Standard · v1')).toBeVisible()
    expect(within(drawer).getByText('Partner · v2')).toBeVisible()
    expect(within(drawer).getByText('Move to partner plan')).toBeVisible()
    expect(mocks.assignCanvasCustomerPriceGroup).not.toHaveBeenCalled()

    mocks.getCanvasCustomerPriceAssignments.mockResolvedValue({
      ...initial,
      currentGroup: newGroup,
    })
    fireEvent.click(
      within(drawer).getByRole('button', { name: 'Confirm adjustment' })
    )
    await waitFor(() =>
      expect(mocks.assignCanvasCustomerPriceGroup).toHaveBeenCalledWith(
        'customer-a',
        { priceGroupId: newId, reason: 'Move to partner plan' },
        expect.stringMatching(/^customer-price:/)
      )
    )
    expect(await screen.findByText('Partner · v2')).toBeVisible()
  })

  it('keeps invalid input in edit mode and supports localized history', async () => {
    await i18next.changeLanguage('zhCN')
    mocks.getCanvasCustomerPriceAssignments.mockResolvedValue({
      ...initial,
      total: 2,
      items: [
        { ...initial.items[0], reason: 'INVITE_REGISTRATION' },
        { ...initial.items[0], id: 'manual', reason: '客户要求保留此原文说明' },
      ],
    })
    mount()
    await screen.findByText('Standard · v1')
    fireEvent.click(screen.getByRole('button', { name: '调整' }))
    const drawer = await screen.findByRole('dialog')
    fireEvent.change(
      within(drawer).getByRole('combobox', { name: /新价格方案/ }),
      { target: { value: newId } }
    )
    fireEvent.change(
      within(drawer).getByRole('textbox', { name: /调整原因/ }),
      { target: { value: 'short' } }
    )
    fireEvent.click(within(drawer).getByRole('button', { name: '下一步' }))
    expect(
      await within(drawer).findByText('请输入 8–255 个字符的原因')
    ).toBeVisible()
    expect(
      within(drawer).queryByText('确认调整 · Alice')
    ).not.toBeInTheDocument()

    fireEvent.click(within(drawer).getByRole('button', { name: '取消' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: '放弃',
      })
    )
    fireEvent.click(await screen.findByRole('button', { name: '查看历史' }))
    const history = await screen.findByRole('dialog')
    expect(within(history).getByText('邀请注册')).toBeVisible()
    expect(within(history).getByText('客户要求保留此原文说明')).toBeVisible()
    expect(
      within(history).queryByText('INVITE_REGISTRATION')
    ).not.toBeInTheDocument()
  })

  it('guards a dirty drawer before discarding its draft', async () => {
    mount()
    const drawer = await openAdjustment()
    fireEvent.change(
      within(drawer).getByRole('textbox', { name: /Adjustment reason/ }),
      { target: { value: 'Unsubmitted reason' } }
    )
    fireEvent.click(within(drawer).getByRole('button', { name: 'Cancel' }))
    let alert = await screen.findByRole('alertdialog')
    expect(
      within(alert).getByText('Your unsaved entries will be lost.')
    ).toBeVisible()
    fireEvent.click(within(alert).getByRole('button', { name: 'Keep editing' }))
    expect(
      screen.getByRole('textbox', { name: /Adjustment reason/ })
    ).toHaveValue('Unsubmitted reason')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    alert = await screen.findByRole('alertdialog')
    fireEvent.click(within(alert).getByRole('button', { name: 'Discard' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })

  it('disables adjustment on read failure and when no other published plan exists', async () => {
    mocks.getCanvasCustomerPriceAssignments.mockRejectedValueOnce(
      new Error('offline')
    )
    const view = mount()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Adjust' })).toBeDisabled()
    )
    view.unmount()

    mocks.getCanvasPriceGroups.mockResolvedValue([oldGroup])
    mount()
    const drawer = await openAdjustment()
    expect(
      within(drawer).getByText('No other published price plans')
    ).toBeVisible()
    expect(within(drawer).getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('enforces trimmed reason length and UUID boundaries', () => {
    for (const reason of ['', '       ', '1234567', 'x'.repeat(256)]) {
      expect(
        customerPriceAssignmentSchema.safeParse({ priceGroupId: newId, reason })
          .success
      ).toBe(false)
    }
    expect(
      customerPriceAssignmentSchema.parse({
        priceGroupId: newId,
        reason: '  12345678  ',
      }).reason
    ).toBe('12345678')
    expect(
      customerPriceAssignmentSchema.safeParse({
        priceGroupId: 'invalid',
        reason: '12345678',
      }).success
    ).toBe(false)
  })
})

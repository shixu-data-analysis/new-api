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
import { AdminCustomerOperations } from '../AdminCustomerOperations'
import { CustomerPriceAssignment } from '../CustomerPriceAssignment'

const mocks = vi.hoisted(() => ({
  getCanvasAdminRechargeOrders: vi.fn(),
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
      <CustomerPriceAssignment customerId='customer-a' />
    </QueryClientProvider>
  )
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
  mocks.getCanvasAdminRechargeOrders.mockResolvedValue({
    page: 1,
    pageSize: 20,
    total: 0,
    items: [],
  })
  mocks.getCanvasCustomerPriceAssignments.mockResolvedValue(initial)
  mocks.getCanvasPriceGroups.mockResolvedValue([
    oldGroup,
    newGroup,
    { id: 'draft', internalName: 'Draft plan', status: 'DRAFT' },
  ])
  mocks.assignCanvasCustomerPriceGroup.mockResolvedValue({})
})
describe('customer price assignment', () => {
  it('reviews normalized input and refreshes the current plan and history after confirmation', async () => {
    mount()
    const select = await screen.findByRole('combobox', {
      name: /New price plan/,
    })
    await waitFor(() => expect(select).not.toBeDisabled())
    expect(within(select).queryByText('Draft plan')).not.toBeInTheDocument()
    expect(within(select).queryByText('Standard · v1')).not.toBeInTheDocument()
    fireEvent.change(select, { target: { value: newId } })
    fireEvent.change(screen.getByRole('textbox', { name: /Reason/ }), {
      target: { value: '  Move to partner plan  ' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review price plan change' })
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Alice')).toBeInTheDocument()
    expect(within(dialog).getByText('Move to partner plan')).toBeInTheDocument()
    expect(mocks.assignCanvasCustomerPriceGroup).not.toHaveBeenCalled()
    mocks.getCanvasCustomerPriceAssignments.mockResolvedValue({
      ...initial,
      currentGroup: newGroup,
      items: [
        {
          ...initial.items[0],
          id: 'assignment-2',
          internalName: 'Partner',
          version: 2,
          reason: 'Move to partner plan',
        },
      ],
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(mocks.assignCanvasCustomerPriceGroup).toHaveBeenCalledWith(
        'customer-a',
        { priceGroupId: newId, reason: 'Move to partner plan' },
        expect.stringMatching(/^customer-price:/)
      )
    )
    expect(
      await screen.findByText('Current price plan: Partner · v2')
    ).toBeInTheDocument()
    expect(await screen.findByText('Move to partner plan')).toBeInTheDocument()
  })
  it('keeps invalid input out of confirmation and supports non-default language with populated history', async () => {
    await i18next.changeLanguage('zhCN')
    mount()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: '复核方案调整' })
      ).not.toBeDisabled()
    )
    expect(
      screen.queryByText('请输入 8–255 个字符的原因')
    ).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: /新价格方案/ }), {
      target: { value: newId },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /原因/ }), {
      target: { value: 'short' },
    })
    fireEvent.click(screen.getByRole('button', { name: '复核方案调整' }))
    expect(
      await screen.findByText('请输入 8–255 个字符的原因')
    ).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(mocks.assignCanvasCustomerPriceGroup).not.toHaveBeenCalled()
  })
  it('disables changes on read failure and permits an explicit refresh', async () => {
    mocks.getCanvasCustomerPriceAssignments.mockRejectedValueOnce(
      new Error('offline')
    )
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load price plans or assignment history'
    )
    expect(
      screen.getByRole('button', { name: 'Review price plan change' })
    ).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Review price plan change' })
      ).not.toBeDisabled()
    )
  })
  it('blocks repeated confirmation while pending and reuses the request key after a failed response', async () => {
    let rejectRequest: (error: Error) => void = () => {}
    mocks.assignCanvasCustomerPriceGroup.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject
        })
    )
    mount()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Review price plan change' })
      ).not.toBeDisabled()
    )
    fireEvent.change(screen.getByRole('combobox', { name: /New price plan/ }), {
      target: { value: newId },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /Reason/ }), {
      target: { value: 'Reviewed partner plan' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review price plan change' })
    )
    let dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(mocks.assignCanvasCustomerPriceGroup).toHaveBeenCalledTimes(1)
    )
    expect(
      within(dialog).getByRole('button', { name: 'Confirm' })
    ).toBeDisabled()
    const firstKey = mocks.assignCanvasCustomerPriceGroup.mock.calls[0]?.[2]
    rejectRequest(new Error('lost response'))
    await waitFor(() =>
      expect(
        within(dialog).getByRole('button', { name: 'Cancel' })
      ).not.toBeDisabled()
    )
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Review price plan change' })
      ).not.toBeDisabled()
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Review price plan change' })
    )
    dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(mocks.assignCanvasCustomerPriceGroup).toHaveBeenCalledTimes(2)
    )
    expect(mocks.assignCanvasCustomerPriceGroup.mock.calls[1]?.[2]).toBe(
      firstKey
    )
  })
  it('opens the plan from customer details and clears the draft when switching customers', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const view = render(
      <QueryClientProvider client={client}>
        <AdminCustomerOperations customerId='customer-a' />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Price plan' }))
    const reason = await screen.findByRole('textbox', { name: /Reason/ })
    await waitFor(() => expect(reason).not.toBeDisabled())
    fireEvent.change(reason, {
      target: { value: 'Unsubmitted customer A reason' },
    })
    view.rerender(
      <QueryClientProvider client={client}>
        <AdminCustomerOperations customerId='customer-b' />
      </QueryClientProvider>
    )
    await waitFor(() =>
      expect(mocks.getCanvasCustomerPriceAssignments).toHaveBeenCalledWith(
        'customer-b',
        expect.any(Object),
        expect.any(AbortSignal)
      )
    )
    expect(screen.getByRole('textbox', { name: /Reason/ })).toHaveValue('')
    expect(mocks.assignCanvasCustomerPriceGroup).not.toHaveBeenCalled()
  })
  it('disables review when no different published plan exists', async () => {
    mocks.getCanvasPriceGroups.mockResolvedValue([oldGroup])
    mount()
    expect(
      await screen.findByText('No other published price plans')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Review price plan change' })
    ).toBeDisabled()
  })
  it('localizes invitation history while preserving administrator reasons', async () => {
    await i18next.changeLanguage('zhCN')
    mocks.getCanvasCustomerPriceAssignments.mockResolvedValue({
      ...initial,
      total: 2,
      items: [
        { ...initial.items[0], reason: 'INVITE_REGISTRATION' },
        {
          ...initial.items[0],
          id: 'manual-reason',
          reason: '客户要求保留此原文说明',
        },
      ],
    })
    mount()
    expect(await screen.findByText('邀请注册')).toBeInTheDocument()
    expect(screen.queryByText('INVITE_REGISTRATION')).not.toBeInTheDocument()
    expect(screen.getByText('客户要求保留此原文说明')).toBeInTheDocument()
  })
  it('fills the plan column and keeps labels aligned above desktop controls', async () => {
    mount()
    const select = await screen.findByRole('combobox', {
      name: /New price plan/,
    })
    expect(select.closest('[data-slot="native-select-wrapper"]')).toHaveClass(
      'w-full',
      'min-w-0'
    )
    expect(
      screen.getByText('New price plan', { exact: false, selector: 'label' })
    ).toHaveClass('min-h-5')
    expect(
      screen.getByText('Reason', { exact: false, selector: 'label' })
    ).toHaveClass('min-h-5')
    expect(
      screen.getByRole('button', { name: 'Review price plan change' })
    ).toHaveClass('w-full', 'lg:mt-7', 'lg:w-auto')
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

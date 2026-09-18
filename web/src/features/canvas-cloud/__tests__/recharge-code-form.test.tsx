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
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { isCanvasDateRangeValid } from '../date-range'
import { CanvasRechargeCodes } from '../RechargeCodes'

const apiMocks = vi.hoisted(() => ({
  getCanvasAdminRechargeCodes: vi.fn(),
  issueCanvasAdminRechargeCodes: vi.fn(),
  downloadCanvasUnusedRechargeCodes: vi.fn(),
  getCanvasAdminRechargeCodeBatchItems: vi.fn(),
  searchCanvasAdminRechargeCodeBatch: vi.fn(),
}))
const campaignMocks = vi.hoisted(() => ({
  getCanvasBindableBonusActivities: vi.fn(),
}))

vi.mock('@/components/layout', () => {
  const SectionPageLayout = (props: { children: ReactNode }) => (
    <div>{props.children}</div>
  )
  SectionPageLayout.Title = (props: { children: ReactNode }) => (
    <h1>{props.children}</h1>
  )
  SectionPageLayout.Actions = (props: { children: ReactNode }) => (
    <div>{props.children}</div>
  )
  SectionPageLayout.Content = (props: { children: ReactNode }) => (
    <main>{props.children}</main>
  )
  return { SectionPageLayout }
})

vi.mock('../api', () => apiMocks)
vi.mock('../activity-api', () => campaignMocks)
vi.mock('@/features/system-settings/components/form-navigation-guard', () => ({
  FormNavigationGuard: () => null,
}))
vi.mock('@/components/datetime-picker', () => ({
  DateTimePicker: (props: {
    placeholder?: string
    onChange?: (value?: Date) => void
  }) => (
    <button
      type='button'
      aria-label={props.placeholder}
      onClick={() =>
        props.onChange?.(
          new Date(
            props.placeholder === 'Start time'
              ? '2026-08-01T13:45:00.000Z'
              : '2026-08-01T14:30:00.000Z'
          )
        )
      }
    >
      {props.placeholder}
    </button>
  ),
}))

function renderRechargeCodes() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    ...render(
      <QueryClientProvider client={queryClient}>
        <CanvasRechargeCodes embedded />
      </QueryClientProvider>
    ),
    queryClient,
  }
}

describe('Canvas recharge-code creation form', () => {
  it('accepts equal creation timestamps and rejects a reversed range', () => {
    const timestamp = new Date('2026-08-01T13:45:00.000Z')
    expect(isCanvasDateRangeValid(timestamp, timestamp)).toBe(true)
    expect(
      isCanvasDateRangeValid(new Date('2026-08-01T13:45:00.001Z'), timestamp)
    ).toBe(false)
  })
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      'Create recharge codes': 'Create recharge codes',
      Note: 'Note',
      'Batch / note': 'Batch / note',
      'Amount (CNY)': 'Amount (CNY)',
      Quantity: 'Quantity',
      'Create codes': 'Create codes',
      'Show all recharge codes': 'Show all recharge codes',
      'Hide all recharge codes': 'Hide all recharge codes',
      'Visible recharge codes': 'Visible recharge codes',
      'Hidden recharge codes': 'Hidden recharge codes',
      'Download TXT': 'Download TXT',
      Done: 'Done',
      'Finish without copying or downloading?':
        'Finish without copying or downloading?',
      'You have not copied or downloaded these codes. After closing, you cannot view all plaintext codes from this batch again. Do you still want to finish?':
        'You have not copied or downloaded these codes. After closing, you cannot view all plaintext codes from this batch again. Do you still want to finish?',
      'Finish anyway': 'Finish anyway',
      'Keep viewing': 'Keep viewing',
      'Search recharge codes': 'Search recharge codes',
      'Search by name or full code': 'Search by name or full code',
      'All statuses': 'All statuses',
      'Page size': 'Page size',
      'Creation time': 'Creation time',
      'Start time': 'Start time',
      'End time': 'End time',
      'Sort by': 'Sort by',
      'Sort order': 'Sort order',
      Descending: 'Descending',
      Ascending: 'Ascending',
      Previous: 'Previous',
      Next: 'Next',
      'The currently published point issuance rate is used; the amount must produce whole points.':
        'The currently published point issuance rate is used; the amount must produce whole points.',
      'Recharge bonus campaign': 'Recharge bonus campaign',
      'No campaign': 'No campaign',
      'Bonus points': 'Bonus points',
      'Recharge amount must match the selected campaign':
        'Recharge amount must match the selected campaign',
      'Unable to load recharge bonus campaigns':
        'Unable to load recharge bonus campaigns',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('dir')
  })

  beforeEach(() => {
    apiMocks.getCanvasAdminRechargeCodes.mockResolvedValue({
      items: [],
      matchedCode: null,
      total: 0,
      page: 1,
      pageSize: 20,
    })
    apiMocks.issueCanvasAdminRechargeCodes.mockResolvedValue({
      created: true,
      codes: [],
    })
    apiMocks.getCanvasAdminRechargeCodeBatchItems.mockResolvedValue({
      items: [],
      matchedCount: 0,
      totalCount: 0,
    })
    apiMocks.searchCanvasAdminRechargeCodeBatch.mockResolvedValue({
      items: [],
      matchedCode: null,
      total: 0,
      page: 1,
      pageSize: 20,
    })
    campaignMocks.getCanvasBindableBonusActivities.mockResolvedValue([])
  })

  it('keeps all controls labeled and submits through one responsive form', async () => {
    renderRechargeCodes()

    const form = screen.getByRole('form', {
      name: 'Create recharge codes',
    })
    const fieldGroup = screen.getByRole('group', {
      name: 'Create recharge codes',
    })
    const note = screen.getByLabelText('Note')
    const amount = screen.getByLabelText('Amount (CNY)')
    const quantity = screen.getByLabelText('Quantity')
    const submit = screen.getByRole('button', { name: 'Create codes' })

    expect(form).toContainElement(note)
    expect(form).toContainElement(amount)
    expect(form).toContainElement(quantity)
    expect(fieldGroup).toContainElement(note)
    expect(fieldGroup).toContainElement(amount)
    expect(fieldGroup).toContainElement(quantity)
    expect(fieldGroup).toContainElement(submit)
    expect(amount).toHaveAccessibleDescription(
      'The currently published point issuance rate is used; the amount must produce whole points.'
    )
    expect(submit).toBeEnabled()

    fireEvent.change(note, { target: { value: 'UAT-CNY-10' } })
    expect(submit).toBeEnabled()
    fireEvent.submit(form)

    await waitFor(() => {
      expect(apiMocks.issueCanvasAdminRechargeCodes.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          remark: 'UAT-CNY-10',
          amountMinor: '1000',
          count: 1,
          idempotencyKey: expect.stringMatching(/^web-issue-code-/u),
        })
      )
    })
  })

  it('reveals fresh codes on demand and downloads each code on its own line', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:recharge-codes')
    const revokeObjectURL = vi.fn()
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: createObjectURL },
      revokeObjectURL: { configurable: true, value: revokeObjectURL },
    })
    apiMocks.issueCanvasAdminRechargeCodes.mockResolvedValue({
      created: true,
      codes: [
        { id: 'code-1', code: 'CANVAS-ONE' },
        { id: 'code-2', code: 'CANVAS-TWO' },
      ],
      items: [],
    })
    renderRechargeCodes()

    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Support batch' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create codes' }))

    const show = await screen.findByRole('button', {
      name: 'Show all recharge codes',
    })
    expect(screen.queryByText('CANVAS-ONE')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Hidden recharge codes')).toBeInTheDocument()

    fireEvent.click(show)
    expect(screen.getByText(/CANVAS-ONE/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Hide all recharge codes' })
    ).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Download TXT' }))

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(await blob.text()).toBe('CANVAS-ONE\nCANVAS-TWO\n')
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:recharge-codes')

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText(/CANVAS-ONE/u)).not.toBeInTheDocument()
  })

  it('asks for confirmation before finishing when no code was copied or downloaded', async () => {
    apiMocks.issueCanvasAdminRechargeCodes.mockResolvedValue({
      created: true,
      codes: [{ id: 'code-1', code: 'CANVAS-ONE' }],
      items: [],
    })
    renderRechargeCodes()

    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'Support batch' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create codes' }))
    await screen.findByRole('button', { name: 'Done' })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(
      screen.getByRole('alertdialog', {
        name: 'Finish without copying or downloading?',
      })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Keep viewing' }))
    expect(screen.getByRole('button', { name: 'Done' })).toBeVisible()
  })

  it('does not retain issued plaintext codes in the mutation cache', async () => {
    apiMocks.issueCanvasAdminRechargeCodes.mockResolvedValue({
      created: true,
      codes: [{ id: 'code-1', code: 'CANVAS-SECRET' }],
      items: [],
    })
    const { queryClient } = renderRechargeCodes()
    fireEvent.click(screen.getByRole('button', { name: 'Create codes' }))
    await screen.findByRole('button', { name: 'Done' })
    await waitFor(() =>
      expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
    )
  })

  it('isolates interleaved secret responses between two component instances', async () => {
    const resolvers: Array<
      (value: {
        created: true
        codes: Array<{ id: string; code: string }>
      }) => void
    > = []
    apiMocks.issueCanvasAdminRechargeCodes.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve))
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <div data-testid='first-instance'>
          <CanvasRechargeCodes embedded />
        </div>
        <div data-testid='second-instance'>
          <CanvasRechargeCodes embedded />
        </div>
      </QueryClientProvider>
    )
    const first = within(screen.getByTestId('first-instance'))
    const second = within(screen.getByTestId('second-instance'))
    fireEvent.click(first.getByRole('button', { name: 'Create codes' }))
    fireEvent.click(second.getByRole('button', { name: 'Create codes' }))
    await waitFor(() => expect(resolvers).toHaveLength(2))
    resolvers[1]({
      created: true,
      codes: [{ id: 'second', code: 'CANVAS-SECOND' }],
    })
    await second.findByRole('button', { name: 'Done' })
    expect(
      first.queryByRole('button', { name: 'Done' })
    ).not.toBeInTheDocument()
    resolvers[0]({
      created: true,
      codes: [{ id: 'first', code: 'CANVAS-FIRST' }],
    })
    await first.findByRole('button', { name: 'Done' })
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
  })

  it('uses the selected active bonus activity version without constraining the recharge amount', async () => {
    campaignMocks.getCanvasBindableBonusActivities.mockResolvedValue([
      {
        id: 'recharge-v2',
        version: 2,
        name: 'September recharge',
        points: '50',
        ttlDays: 30,
      },
    ])
    renderRechargeCodes()

    const campaignSelect = await screen.findByLabelText(
      'Recharge bonus campaign'
    )
    await screen.findByRole('option', { name: /September recharge/u })
    fireEvent.change(campaignSelect, {
      target: { value: 'recharge-v2' },
    })
    expect(
      screen.getByText(
        'Bonus per code: 50 points · Valid for 30 days after redemption'
      )
    ).toBeVisible()
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'September batch' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create codes' }))
    await waitFor(() =>
      expect(apiMocks.issueCanvasAdminRechargeCodes.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          remark: 'September batch',
          amountMinor: '1000',
          count: 1,
          promotionVersionId: 'recharge-v2',
        })
      )
    )
  })

  it.each([
    'PROMOTION_UNAVAILABLE',
    'PROMOTION_CHANGED',
    'PROMOTION_GATE_CLOSED',
  ])(
    'keeps the selected recharge promotion and shows its %s field error',
    async (code) => {
      campaignMocks.getCanvasBindableBonusActivities.mockResolvedValue([
        {
          id: 'recharge-v2',
          name: 'September recharge',
          version: 2,
          points: '250',
          ttlDays: 45,
        },
      ])
      apiMocks.issueCanvasAdminRechargeCodes.mockRejectedValue({
        response: {
          data:
            code === 'PROMOTION_GATE_CLOSED'
              ? { code }
              : { code, details: { field: 'promotionVersionId' } },
        },
      })
      renderRechargeCodes()
      await screen.findByRole('option', { name: /September recharge/u })
      fireEvent.change(
        await screen.findByLabelText('Recharge bonus campaign'),
        {
          target: { value: 'recharge-v2' },
        }
      )
      fireEvent.change(screen.getByLabelText('Note'), {
        target: { value: 'September batch' },
      })
      fireEvent.submit(
        screen.getByRole('form', { name: 'Create recharge codes' })
      )
      expect(
        await screen.findAllByText(
          'The selected bonus campaign is no longer available.'
        )
      ).toHaveLength(2)
      expect(screen.getByLabelText('Recharge bonus campaign')).toHaveValue(
        'recharge-v2'
      )
      expect(apiMocks.issueCanvasAdminRechargeCodes.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ idempotencyKey: expect.any(String) })
      )
    }
  )

  it('shows campaign option query errors', async () => {
    campaignMocks.getCanvasBindableBonusActivities.mockRejectedValue(
      new Error('offline')
    )
    renderRechargeCodes()
    expect(
      await screen.findByText('Unable to load recharge bonus campaigns')
    ).toBeInTheDocument()
  })

  it('requests server-side search, filters, sorting, and pagination', async () => {
    const user = userEvent.setup()
    apiMocks.getCanvasAdminRechargeCodes.mockImplementation(
      async (query: { page: number; pageSize: number }) => ({
        items: [
          {
            id: 'inventory-1',
            remark: 'Support batch',
            currency: 'CNY',
            amountMinor: '1000',
            points: '500',
            bonusPoints: '100',
            bonusTtlDays: 30,
            createdAt: '2026-08-25T00:00:00.000Z',
            expiresAt: '2026-11-23T00:00:00.000Z',
            totalCount: 10,
            availableCount: 8,
            redeemedCount: 2,
            expiredCount: 0,
            voidCount: 0,
          },
        ],
        total: 45,
        page: query.page,
        pageSize: query.pageSize,
      })
    )
    apiMocks.searchCanvasAdminRechargeCodeBatch.mockImplementation(
      async (query: { page: number; pageSize: number }) => ({
        items: [
          {
            id: 'inventory-1',
            remark: 'Support batch',
            currency: 'CNY',
            amountMinor: '1000',
            points: '500',
            bonusPoints: '100',
            bonusTtlDays: 30,
            createdAt: '2026-08-25T00:00:00.000Z',
            expiresAt: '2026-11-23T00:00:00.000Z',
            totalCount: 10,
            availableCount: 8,
            redeemedCount: 2,
            expiredCount: 0,
            voidCount: 0,
          },
        ],
        matchedCode: {
          maskedCode: 'CANVAS-Y••••FA2E',
          status: 'EXPIRED',
          redeemedAt: null,
        },
        total: 45,
        page: query.page,
        pageSize: query.pageSize,
      })
    )
    const { queryClient } = renderRechargeCodes()

    await screen.findAllByRole('button', {
      name: /Expand recharge-code batch.*Support batch/u,
    })
    expect(
      screen.getByText('500 Paid points + 100 Bonus points')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expiry time' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Asc' }))
    await user.click(screen.getByRole('button', { name: 'Column filters' }))
    expect(
      screen.queryByPlaceholderText('Batch / note')
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start time' }))
    await user.click(screen.getByRole('button', { name: 'End time' }))
    await user.click(screen.getByLabelText('Status'))
    await user.click(await screen.findByRole('option', { name: 'Expired' }))
    fireEvent.change(screen.getByLabelText('Recharge code'), {
      target: { value: 'CANVAS-Y1234567890123456789FA2E' },
    })

    await waitFor(() => {
      expect(
        apiMocks.searchCanvasAdminRechargeCodeBatch
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 20,
          code: 'CANVAS-Y1234567890123456789FA2E',
          status: 'EXPIRED',
          createdFrom: '2026-08-01T13:45:00.000Z',
          createdTo: '2026-08-01T14:30:00.000Z',
          sortBy: 'expiresAt',
          sortOrder: 'asc',
        }),
        expect.any(AbortSignal)
      )
    })
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((item) => item.queryKey)
      )
    ).not.toContain('CANVAS-Y1234567890123456789FA2E')
    expect(window.location.href).not.toContain(
      'CANVAS-Y1234567890123456789FA2E'
    )
    expect(
      screen.getAllByRole('button', {
        name: /Collapse recharge-code batch.*Support batch/u,
      })[0]
    ).toHaveFocus()
    expect(screen.getAllByText('CANVAS-Y••••FA2E')).not.toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    await waitFor(() => {
      expect(
        apiMocks.searchCanvasAdminRechargeCodeBatch
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal)
      )
    })

    await user.click(screen.getByRole('button', { name: /^Column filters/u }))
    await user.click(
      screen.getByRole('button', { name: 'Clear exact recharge code' })
    )
    await waitFor(() => {
      expect(apiMocks.getCanvasAdminRechargeCodes).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'EXPIRED',
          createdFrom: '2026-08-01T13:45:00.000Z',
          createdTo: '2026-08-01T14:30:00.000Z',
        }),
        expect.any(AbortSignal)
      )
    })
    expect(screen.getByLabelText('Recharge code')).toHaveValue('')

    await user.click(screen.getByLabelText('Status'))
    await user.click(
      await screen.findByRole('option', { name: 'All statuses' })
    )
    await waitFor(() => {
      const query = apiMocks.getCanvasAdminRechargeCodes.mock.calls.at(-1)?.[0]
      expect(query).not.toHaveProperty('status')
      expect(query).toEqual(
        expect.objectContaining({
          createdFrom: '2026-08-01T13:45:00.000Z',
          createdTo: '2026-08-01T14:30:00.000Z',
        })
      )
    })
  })

  it('keeps an incomplete code search local and never refetches the inventory without that code', async () => {
    renderRechargeCodes()
    await screen.findByRole('button', { name: 'Column filters' })
    const requestsBefore =
      apiMocks.getCanvasAdminRechargeCodes.mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    fireEvent.change(screen.getByLabelText('Recharge code'), {
      target: { value: 'CANVAS-TOO-SHORT' },
    })

    expect(
      await screen.findByText('Enter a complete recharge code')
    ).toHaveAttribute('role', 'alert')
    expect(apiMocks.getCanvasAdminRechargeCodes).toHaveBeenCalledTimes(
      requestsBefore
    )
  })

  it('shows only the batch total when no code or status filter is active', async () => {
    const user = userEvent.setup()
    apiMocks.getCanvasAdminRechargeCodes.mockResolvedValue({
      items: [
        {
          id: 'batch-1',
          remark: null,
          currency: 'CNY',
          amountMinor: '1000',
          points: '500',
          bonusPoints: '0',
          bonusTtlDays: null,
          createdAt: '2026-08-25T00:00:00.000Z',
          expiresAt: '2026-11-23T00:00:00.000Z',
          totalCount: 1,
          availableCount: 1,
          redeemedCount: 0,
          expiredCount: 0,
          voidCount: 0,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    apiMocks.getCanvasAdminRechargeCodeBatchItems.mockResolvedValue({
      items: [
        {
          maskedCode: 'CANVAS-A••••WXYZ',
          status: 'ACTIVE',
          redeemedAt: null,
        },
      ],
      matchedCount: 1,
      totalCount: 1,
    })
    renderRechargeCodes()

    await user.click(
      await screen.findByRole('button', { name: /Expand recharge-code batch/u })
    )

    expect(
      await screen.findByText('Recharge codes in this batch (total 1)')
    ).toBeVisible()
    expect(
      screen.queryByText(/Recharge codes in this batch \(matched/u)
    ).not.toBeInTheDocument()
  })

  it('lazily expands one RTL batch from the keyboard without coupling the download action', async () => {
    const user = userEvent.setup()
    document.documentElement.dir = 'rtl'
    apiMocks.getCanvasAdminRechargeCodes.mockResolvedValue({
      items: [
        {
          id: 'batch-1',
          remark: 'Support batch',
          currency: 'CNY',
          amountMinor: '1000',
          points: '500',
          bonusPoints: '0',
          bonusTtlDays: null,
          createdAt: '2026-08-25T00:00:00.000Z',
          expiresAt: '2026-11-23T00:00:00.000Z',
          totalCount: 2,
          availableCount: 1,
          redeemedCount: 1,
          expiredCount: 0,
          voidCount: 0,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    apiMocks.getCanvasAdminRechargeCodeBatchItems.mockResolvedValue({
      items: [
        {
          maskedCode: 'CANVAS-A••••WXYZ',
          status: 'REDEEMED',
          redeemedAt: '2026-08-26T00:00:00.000Z',
        },
      ],
      matchedCount: 1,
      totalCount: 2,
    })
    apiMocks.downloadCanvasUnusedRechargeCodes.mockResolvedValue({
      content: 'CANVAS-SECRET\n',
      downloadCount: 1,
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined
    )
    Object.defineProperties(URL, {
      createObjectURL: { configurable: true, value: vi.fn(() => 'blob:codes') },
      revokeObjectURL: { configurable: true, value: vi.fn() },
    })
    renderRechargeCodes()

    await user.click(
      await screen.findByRole('button', { name: 'Column filters' })
    )
    await user.click(screen.getByLabelText('Status'))
    await user.click(await screen.findByRole('option', { name: 'Redeemed' }))
    expect(
      screen.getByText(/Available 1.*Redeemed 1.*Expired 0.*Voided 0/u)
    ).toBeVisible()

    const download = await screen.findByRole('button', {
      name: 'Download unused codes',
    })
    await user.click(download)
    expect(apiMocks.getCanvasAdminRechargeCodeBatchItems).not.toHaveBeenCalled()

    const batchTrigger = screen.getAllByRole('button', {
      name: /Expand recharge-code batch.*Support batch/u,
    })[0]
    batchTrigger.focus()
    await user.keyboard('{Enter}')

    expect(
      screen.getAllByRole('button', {
        name: /Collapse recharge-code batch.*Support batch/u,
      })[0]
    ).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen
        .getAllByRole('button', {
          name: /Collapse recharge-code batch.*Support batch/u,
        })[0]
        .closest('tr')
    ).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findAllByText('CANVAS-A••••WXYZ')).not.toHaveLength(0)
    expect(
      screen.getAllByText('Recharge codes in this batch (matched 1 / total 2)')
    ).not.toHaveLength(0)
    expect(screen.getAllByText('Used time')).not.toHaveLength(0)
    expect(apiMocks.getCanvasAdminRechargeCodeBatchItems).toHaveBeenCalledWith(
      'batch-1',
      'REDEEMED',
      expect.any(AbortSignal)
    )

    const expandedTrigger = screen.getAllByRole('button', {
      name: /Collapse recharge-code batch.*Support batch/u,
    })[0]
    expandedTrigger.focus()
    await user.keyboard('{Enter}')
    expect(
      screen.getAllByRole('button', {
        name: /Expand recharge-code batch.*Support batch/u,
      })[0]
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('distinguishes forbidden batch details and recovers through retry', async () => {
    const user = userEvent.setup()
    apiMocks.getCanvasAdminRechargeCodes.mockResolvedValue({
      items: [
        {
          id: 'batch-1',
          remark: null,
          currency: 'CNY',
          amountMinor: '1000',
          points: '500',
          bonusPoints: '0',
          bonusTtlDays: null,
          createdAt: '2026-08-25T00:00:00.000Z',
          expiresAt: '2026-11-23T00:00:00.000Z',
          totalCount: 1,
          availableCount: 1,
          redeemedCount: 0,
          expiredCount: 0,
          voidCount: 0,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    apiMocks.getCanvasAdminRechargeCodeBatchItems
      .mockRejectedValueOnce({ response: { status: 403 } })
      .mockResolvedValue({ items: [], matchedCount: 0, totalCount: 1 })
    renderRechargeCodes()

    await user.click(
      (
        await screen.findAllByRole('button', {
          name: /Expand recharge-code batch/u,
        })
      )[0]
    )
    expect(
      await screen.findAllByText(
        'You do not have permission to view these recharge codes'
      )
    ).not.toHaveLength(0)
    await user.click(screen.getAllByRole('button', { name: 'Retry' })[0])
    expect(
      await screen.findAllByText('No recharge codes in this batch')
    ).not.toHaveLength(0)
  })
})

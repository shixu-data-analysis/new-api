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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { CanvasRechargeCodes } from '../RechargeCodes'

const apiMocks = vi.hoisted(() => ({
  getCanvasAdminRechargeCodes: vi.fn(),
  issueCanvasAdminRechargeCodes: vi.fn(),
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
  return render(
    <QueryClientProvider client={queryClient}>
      <CanvasRechargeCodes embedded />
    </QueryClientProvider>
  )
}

describe('Canvas recharge-code creation form', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      'Create recharge codes': 'Create recharge codes',
      Name: 'Name',
      'Amount (CNY)': 'Amount (CNY)',
      Quantity: 'Quantity',
      'Create codes': 'Create codes',
      'Show all recharge codes': 'Show all recharge codes',
      'Hide all recharge codes': 'Hide all recharge codes',
      'Visible recharge codes': 'Visible recharge codes',
      'Hidden recharge codes': 'Hidden recharge codes',
      'Download TXT': 'Download TXT',
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
  })

  beforeEach(() => {
    apiMocks.getCanvasAdminRechargeCodes.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })
    apiMocks.issueCanvasAdminRechargeCodes.mockResolvedValue({
      created: true,
      codes: [],
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
    const name = screen.getByLabelText('Name')
    const amount = screen.getByLabelText('Amount (CNY)')
    const quantity = screen.getByLabelText('Quantity')
    const submit = screen.getByRole('button', { name: 'Create codes' })

    expect(form).toContainElement(name)
    expect(form).toContainElement(amount)
    expect(form).toContainElement(quantity)
    expect(fieldGroup).toContainElement(name)
    expect(fieldGroup).toContainElement(amount)
    expect(fieldGroup).toContainElement(quantity)
    expect(fieldGroup).toContainElement(submit)
    expect(amount).toHaveAccessibleDescription(
      'The currently published point issuance rate is used; the amount must produce whole points.'
    )
    expect(submit).toBeEnabled()

    fireEvent.change(name, { target: { value: 'UAT-CNY-10' } })
    expect(submit).toBeEnabled()
    fireEvent.submit(form)

    await waitFor(() => {
      expect(apiMocks.issueCanvasAdminRechargeCodes.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          name: 'UAT-CNY-10',
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

    fireEvent.change(screen.getByLabelText('Name'), {
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
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'September batch' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create codes' }))
    await waitFor(() =>
      expect(apiMocks.issueCanvasAdminRechargeCodes.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          name: 'September batch',
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
      fireEvent.change(screen.getByLabelText('Name'), {
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
            name: 'Support batch',
            status: 'ACTIVE',
            maskedCode: 'CANVAS-Y••••••••FA2E',
            currency: 'CNY',
            amountMinor: '1000',
            points: '500',
            bonusPoints: '100',
            createdAt: '2026-08-25T00:00:00.000Z',
            expiresAt: '2026-11-23T00:00:00.000Z',
            redeemedAt: null,
          },
        ],
        total: 45,
        page: query.page,
        pageSize: query.pageSize,
      })
    )
    renderRechargeCodes()

    await screen.findByText('Support batch')
    expect(
      screen.getByText('500 Paid points + 100 Bonus points')
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Column filters' }))
    const [, inventoryNameFilter] = screen.getAllByPlaceholderText(
      'Enter recharge code name'
    )
    fireEvent.change(inventoryNameFilter, {
      target: { value: 'Support batch' },
    })
    fireEvent.change(screen.getByLabelText('Recharge code'), {
      target: { value: 'CANVAS-Y1234567890123456789FA2E' },
    })
    await user.click(screen.getByLabelText('Status'))
    await user.click(await screen.findByRole('option', { name: 'Expired' }))
    await user.click(screen.getByRole('button', { name: 'Start time' }))
    await user.click(screen.getByRole('button', { name: 'Expiry time' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Asc' }))

    await waitFor(() => {
      expect(apiMocks.getCanvasAdminRechargeCodes).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 20,
          name: 'Support batch',
          code: 'CANVAS-Y1234567890123456789FA2E',
          status: 'EXPIRED',
          createdFrom: '2026-08-01T13:45:00.000Z',
          sortBy: 'expiresAt',
          sortOrder: 'asc',
        }),
        expect.any(AbortSignal)
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    await waitFor(() => {
      expect(apiMocks.getCanvasAdminRechargeCodes).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal)
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
})

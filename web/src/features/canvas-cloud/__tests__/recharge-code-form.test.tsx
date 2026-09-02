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

function renderRechargeCodes() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <CanvasRechargeCodes />
    </QueryClientProvider>
  )
}

describe('Canvas recharge-code creation form', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      'Create Canvas recharge codes': 'Create Canvas recharge codes',
      Name: 'Name',
      'Amount (CNY)': 'Amount (CNY)',
      Quantity: 'Quantity',
      'Create codes': 'Create codes',
      'Show codes': 'Show codes',
      'Hide codes': 'Hide codes',
      'Visible recharge codes': 'Visible recharge codes',
      'Hidden recharge codes': 'Hidden recharge codes',
      'Download TXT': 'Download TXT',
      'Search recharge codes': 'Search recharge codes',
      'Search by name or full code': 'Search by name or full code',
      'All statuses': 'All statuses',
      'Page size': 'Page size',
      'Created from': 'Created from',
      'Created to': 'Created to',
      'Sort by': 'Sort by',
      'Sort order': 'Sort order',
      Descending: 'Descending',
      Ascending: 'Ascending',
      Previous: 'Previous',
      Next: 'Next',
      'The currently published point issuance rate is used; the amount must produce whole points.':
        'The currently published point issuance rate is used; the amount must produce whole points.',
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
  })

  it('keeps all controls labeled and submits through one responsive form', async () => {
    renderRechargeCodes()

    const form = screen.getByRole('form', {
      name: 'Create Canvas recharge codes',
    })
    const fieldGroup = screen.getByRole('group', {
      name: 'Create Canvas recharge codes',
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
    expect(submit).toBeDisabled()

    fireEvent.change(name, { target: { value: 'UAT-CNY-10' } })
    expect(submit).toBeEnabled()
    fireEvent.submit(form)

    await waitFor(() => {
      expect(apiMocks.issueCanvasAdminRechargeCodes.mock.calls[0]?.[0]).toEqual(
        {
          name: 'UAT-CNY-10',
          amountMinor: '1000',
          count: 1,
        }
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

    const show = await screen.findByRole('button', { name: 'Show codes' })
    expect(screen.queryByText('CANVAS-ONE')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Hidden recharge codes')).toBeInTheDocument()

    fireEvent.click(show)
    expect(screen.getByText(/CANVAS-ONE/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide codes' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    fireEvent.click(screen.getByRole('button', { name: 'Download TXT' }))

    const blob = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(await blob.text()).toBe('CANVAS-ONE\nCANVAS-TWO\n')
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:recharge-codes')
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
    fireEvent.change(screen.getByLabelText('Search recharge codes'), {
      target: { value: 'CANVAS-Y1234567890123456789FA2E' },
    })
    await user.click(screen.getByLabelText('Status'))
    await user.click(await screen.findByRole('option', { name: 'Expired' }))
    fireEvent.change(screen.getByLabelText('Created from'), {
      target: { value: '2026-08-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Expires' }))
    fireEvent.click(await screen.findByText('Asc'))

    await waitFor(() => {
      expect(apiMocks.getCanvasAdminRechargeCodes).toHaveBeenLastCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 20,
          search: 'CANVAS-Y1234567890123456789FA2E',
          status: 'EXPIRED',
          createdFrom: expect.stringMatching(/T.*Z$/),
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
})

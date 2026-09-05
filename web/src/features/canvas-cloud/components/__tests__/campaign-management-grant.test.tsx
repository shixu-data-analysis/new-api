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
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { CampaignManagement } from '../CampaignManagement'

const mocks = vi.hoisted(() => ({
  getCanvasCampaigns: vi.fn(),
  getCanvasCampaignTracking: vi.fn(),
  getCanvasAdminCustomers: vi.fn(),
  grantCanvasCampaign: vi.fn(),
  saveCanvasCampaignDraft: vi.fn(),
  publishCanvasCampaign: vi.fn(),
  stopCanvasCampaign: vi.fn(),
}))
const toastMocks = vi.hoisted(() => ({ error: vi.fn() }))

vi.mock('../../campaign-api', () => mocks)
vi.mock('../../api', () => ({
  getCanvasAdminCustomers: mocks.getCanvasAdminCustomers,
}))
vi.mock('sonner', () => ({ toast: toastMocks }))
vi.mock('../CampaignForm', () => ({ CampaignForm: () => null }))
vi.mock('../CanvasServerTable', () => ({
  CanvasServerTable: (props: {
    columns: Array<{ id?: string; cell?: (context: unknown) => ReactNode }>
    data: Array<{ orderNumber?: string | null }>
    state: {
      setPagination: (value: { pageIndex: number; pageSize: number }) => void
    }
  }) =>
    props.columns[0]?.id === 'acceptedAt' ? (
      <div>
        <span>{props.data[0]?.orderNumber}</span>
        <button
          type='button'
          onClick={() =>
            props.state.setPagination({ pageIndex: 1, pageSize: 20 })
          }
        >
          Next admission page
        </button>
      </div>
    ) : (
      <div>{props.columns[0]?.cell?.({ row: { original: campaign } })}</div>
    ),
}))
vi.mock('../PricingActionConfirmation', () => ({
  PricingActionConfirmation: (props: {
    open: boolean
    title: string
    confirmLabel: string
    onConfirm: () => void
  }) =>
    props.open ? (
      <div role='dialog' aria-label={props.title}>
        <button type='button' onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    ) : null,
}))
vi.mock('@/components/ui/select', () => ({
  Select: (props: {
    value: string
    onValueChange: (value: string) => void
    children: ReactNode
  }) => (
    <select
      value={props.value}
      onChange={(event) => props.onValueChange(event.target.value)}
    >
      {props.children}
    </select>
  ),
  SelectContent: (props: { children: ReactNode }) => props.children,
  SelectItem: (props: { value: string; children: ReactNode }) => (
    <option value={props.value}>{props.children}</option>
  ),
  SelectTrigger: (props: { children: ReactNode }) => props.children,
  SelectValue: () => null,
}))

const campaign = {
  id: 'campaign-v1',
  promotionId: 'campaign',
  version: 1,
  name: 'Manual UAT',
  kind: 'MANUAL_BONUS',
  status: 'ACTIVE',
  startsAt: '2026-09-05T00:00:00.000Z',
  endsAt: '2026-09-06T00:00:00.000Z',
  createdAt: '',
  actorName: '',
  draft: { bonusPoints: '100' },
  preview: null,
  previewHash: null,
  usage: { participants: '0', points: '0', reference: '0' },
}

describe('manual campaign grant confirmation', () => {
  it('selects an active customer and mutates only after explicit confirmation', async () => {
    mocks.getCanvasCampaigns.mockResolvedValue({ items: [campaign], total: 1 })
    mocks.getCanvasCampaignTracking.mockResolvedValue({
      totals: { issuedPoints: '0', availablePoints: '0', reservedPoints: '0' },
      events: [],
      admissions: [],
      total: 0,
      page: 1,
      pageSize: 20,
      taskTotals: {
        settledPoints: '0',
        releasedPoints: '0',
        referenceAmountRmb: '0',
      },
    })
    mocks.getCanvasAdminCustomers.mockResolvedValue({
      items: [
        {
          customerId: 'customer-1',
          username: 'Active customer',
          status: 'ACTIVE',
        },
      ],
      total: 1,
    })
    mocks.grantCanvasCampaign.mockResolvedValue({})
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <CampaignManagement />
      </QueryClientProvider>
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Manual UAT' }))
    await screen.findByText(/Campaign details/u)
    await screen.findByRole('option', { name: 'Active customer' })
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'customer-1' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review campaign grant' })
    )
    expect(mocks.grantCanvasCampaign).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Grant campaign bonus' })
    )
    await waitFor(() =>
      expect(mocks.grantCanvasCampaign).toHaveBeenCalledTimes(1)
    )
    expect(mocks.grantCanvasCampaign).toHaveBeenCalledWith(
      'campaign-v1',
      'customer-1'
    )
  })

  it('requires publish confirmation and reports a failed publication', async () => {
    Object.assign(campaign, {
      id: 'draft-v2',
      name: 'September bonus',
      status: 'DRAFT',
      version: 2,
      previewHash: 'reviewed-preview',
      preview: { plannedParticipants: '10' },
      draft: { bonusPoints: '100', pointBudget: '1000' },
    })
    mocks.getCanvasCampaigns.mockResolvedValue({ items: [campaign], total: 1 })
    mocks.getCanvasCampaignTracking.mockResolvedValue({
      totals: { issuedPoints: '0', availablePoints: '0', reservedPoints: '0' },
      events: [],
      admissions: [],
      total: 0,
      page: 1,
      pageSize: 20,
      taskTotals: {
        settledPoints: '0',
        releasedPoints: '0',
        referenceAmountRmb: '0',
      },
    })
    mocks.publishCanvasCampaign.mockRejectedValue(new Error('offline'))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <CampaignManagement />
      </QueryClientProvider>
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'September bonus' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Publish campaign' })
    )
    expect(mocks.publishCanvasCampaign).not.toHaveBeenCalled()
    expect(
      screen.getByRole('dialog', { name: 'Publish point campaign' })
    ).toBeInTheDocument()
    expect(screen.getByText('September bonus')).toBeInTheDocument()
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Publish campaign',
      })
    )
    await waitFor(() =>
      expect(mocks.publishCanvasCampaign).toHaveBeenCalledWith(
        'draft-v2',
        'reviewed-preview'
      )
    )
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        'Unable to publish point campaign'
      )
    )
  })

  it('loads paginated admissions and renders actual task totals', async () => {
    Object.assign(campaign, {
      id: 'task-special',
      name: 'Task promotion',
      kind: 'TASK_PRICE_SPECIAL',
      status: 'ACTIVE',
      previewHash: null,
    })
    mocks.getCanvasCampaigns.mockResolvedValue({ items: [campaign], total: 1 })
    mocks.getCanvasCampaignTracking.mockResolvedValue({
      totals: { issuedPoints: '0', availablePoints: '0', reservedPoints: '0' },
      taskTotals: {
        settledPoints: '42',
        releasedPoints: '9',
        referenceAmountRmb: '1234',
      },
      events: [],
      admissions: [
        {
          id: 'admission-1',
          acceptedAt: '2026-09-05T00:00:00.000Z',
          orderNumber: 'ORDER-42',
          bonusPoints: '0',
          referenceMinor: '0',
          rechargeOrderId: null,
          orderStatus: null,
          pointLotId: null,
          inviteClaimId: null,
          inviteStatus: null,
          taskId: 'task-42',
          billingStatus: 'SETTLED',
          discountPoints: '42',
        },
      ],
      total: 21,
      page: 1,
      pageSize: 20,
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <CampaignManagement />
      </QueryClientProvider>
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Task promotion' })
    )
    await screen.findByText('ORDER-42')
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(mocks.getCanvasCampaignTracking).toHaveBeenCalledWith(
      'task-special',
      { page: 1, pageSize: 20 },
      expect.any(AbortSignal)
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next admission page' }))
    await waitFor(() =>
      expect(mocks.getCanvasCampaignTracking).toHaveBeenLastCalledWith(
        'task-special',
        { page: 2, pageSize: 20 },
        expect.any(AbortSignal)
      )
    )
  })

  it('shows tracking query failures', async () => {
    Object.assign(campaign, { id: 'tracking-failure', name: 'Broken tracking' })
    mocks.getCanvasCampaigns.mockResolvedValue({ items: [campaign], total: 1 })
    mocks.getCanvasCampaignTracking.mockRejectedValue(new Error('offline'))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <CampaignManagement />
      </QueryClientProvider>
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Broken tracking' })
    )
    expect(
      await screen.findByText('Unable to load campaign tracking')
    ).toBeInTheDocument()
  })
})

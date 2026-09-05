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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CampaignForm } from '../CampaignForm'

const mocks = vi.hoisted(() => ({
  getCanvasAdminCustomers: vi.fn(),
  previewCanvasCampaign: vi.fn(),
}))
vi.mock('../../api', () => ({
  getCanvasAdminCustomers: mocks.getCanvasAdminCustomers,
}))
vi.mock('../../campaign-api', () => ({
  previewCanvasCampaign: mocks.previewCanvasCampaign,
}))

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CampaignForm campaign={null} saving={false} onSave={vi.fn()} />
    </QueryClientProvider>
  )
}

describe('point campaign form', () => {
  it('blocks an invalid draft, invalidates a reviewed preview after edits, and prevents save until reviewed again', async () => {
    mocks.getCanvasAdminCustomers.mockResolvedValue({ items: [], total: 0 })
    mocks.previewCanvasCampaign.mockResolvedValue({
      plannedParticipants: '1',
      plannedBonusPoints: '100',
      projection: { addedPoints: '100', afterAverageRmbPerPoint: null },
    })
    renderForm()

    const name = screen.getByLabelText('Campaign name')
    fireEvent.change(name, { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Bonus points'), {
      target: { value: 'not-a-number' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview campaign' }))
    await waitFor(() =>
      expect(mocks.previewCanvasCampaign).not.toHaveBeenCalled()
    )

    fireEvent.change(name, { target: { value: 'UAT campaign' } })
    fireEvent.change(screen.getByLabelText('Bonus points'), {
      target: { value: '100' },
    })
    fireEvent.change(screen.getByLabelText('Approval reason'), {
      target: { value: 'UAT review' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview campaign' }))
    await screen.findByText('Planned bonus points')
    expect(mocks.previewCanvasCampaign.mock.calls[0][0]).not.toHaveProperty(
      'rechargeAmountMinor'
    )
    expect(
      screen.getByRole('button', { name: 'Save campaign draft' })
    ).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Bonus points'), {
      target: { value: '200' },
    })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save campaign draft' })
      ).toBeDisabled()
    )
    mocks.previewCanvasCampaign.mockRejectedValueOnce(
      new Error('validation failed')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Preview campaign' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to preview campaign. Check the inputs and try again.'
    )
  })
})

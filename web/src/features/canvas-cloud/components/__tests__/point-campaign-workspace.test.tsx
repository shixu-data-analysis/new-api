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
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PointCampaignWorkspace } from '../PointCampaignWorkspace'

vi.mock('../PointConversionDashboard', () => ({
  PointConversionDashboard: () => <section>Conversion overview</section>,
}))
vi.mock('../CampaignManagement', () => ({
  CampaignManagement: () => <section>Campaign workspace</section>,
}))
vi.mock('../AdminPricing', () => ({
  AdminPricing: () => <section>Limited-time pricing</section>,
}))

describe('points and campaigns workspace', () => {
  it('separates the three jobs into a compact, scrollable tab navigation', () => {
    render(
      <PointCampaignWorkspace
        prices={[]}
        pricePromotions={[]}
        onChanged={vi.fn()}
      />
    )

    expect(screen.getByText('Conversion overview')).toBeVisible()
    expect(screen.queryByText('Campaign workspace')).not.toBeInTheDocument()
    expect(screen.getByRole('tablist')).toHaveClass(
      'w-full',
      'flex-nowrap',
      'overflow-x-auto'
    )
    screen
      .getAllByRole('tab')
      .forEach((tab) => expect(tab).toHaveClass('h-8', 'flex-none', 'px-3'))

    fireEvent.click(screen.getByRole('tab', { name: 'Point campaigns' }))
    expect(screen.getByText('Campaign workspace')).toBeVisible()
    expect(screen.queryByText('Conversion overview')).not.toBeInTheDocument()
  })
})

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
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CanvasSession } from '@/features/canvas-cloud/types'

import type { UserProfile } from '../../types'
import { ProfileHeader } from '../profile-header'

const profile: UserProfile = {
  id: 5,
  username: 'uatadmin',
  display_name: 'UAT Platform Admin',
  role: 10,
  group: 'default',
  quota: 0,
  used_quota: 0,
  request_count: 0,
  status: 1,
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 0,
}

const canvasSession: CanvasSession = {
  principalId: 'platform-admin-principal',
  principalType: 'PLATFORM_ADMIN',
  displayName: 'UAT Platform Admin',
  emailMasked: null,
  inviterEnabled: false,
}

describe('ProfileHeader', () => {
  it('shows the canvas role without exposing the internal user ID', () => {
    render(
      <ProfileHeader
        profile={profile}
        loading={false}
        canvasSession={canvasSession}
        canvasMode
      />
    )

    expect(screen.getByText('Canvas Platform Administrator')).toBeVisible()
    expect(screen.queryByText(/User ID/)).not.toBeInTheDocument()
    expect(screen.queryByText('5')).not.toBeInTheDocument()
    expect(screen.queryByText('Current Balance')).not.toBeInTheDocument()
    expect(screen.queryByText('default')).not.toBeInTheDocument()
  })

  it('keeps a root without a canvas session in the compact canvas profile', () => {
    render(
      <ProfileHeader
        profile={{
          ...profile,
          username: 'uatroot',
          display_name: 'Root User',
          role: 100,
        }}
        loading={false}
        canvasSession={null}
        canvasMode
      />
    )

    expect(screen.getByText('Super Admin')).toBeVisible()
    expect(screen.queryByText('Current Balance')).not.toBeInTheDocument()
    expect(screen.queryByText('default')).not.toBeInTheDocument()
  })
})

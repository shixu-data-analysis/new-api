/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { describe, expect, it } from 'vitest'

import {
  resolveCanvasManualUatBundle,
  resolveCanvasManualUatRole,
} from '../manual-uat'

function encodedBundle(role: 1 | 10, id: number, name: string): string {
  return btoa(
    JSON.stringify({
      access_token: `${name}-access-token`,
      token_type: 'Bearer',
      access_expires_at: 10_000,
      user: { id, username: name, role, status: 1 },
      session: {
        sid: `${name}-session`,
        current: true,
        login_method: 'password',
        ip: '127.0.0.1',
        user_agent: 'manual-uat',
        created_at: 1_000,
        last_active_at: 1_000,
        expires_at: 10_000,
      },
    })
  )
}

const baseConfig = {
  enabled: true,
  development: true,
  hostname: '127.0.0.1',
  role: 'customer',
  customerBundle: encodedBundle(1, 2, 'uatcustomer'),
  adminBundle: encodedBundle(10, 3, 'uatadmin'),
}

describe('Canvas manual UAT authentication', () => {
  it('creates isolated customer and platform-administrator sessions', () => {
    const customer = resolveCanvasManualUatBundle(baseConfig)
    const admin = resolveCanvasManualUatBundle({
      ...baseConfig,
      role: 'admin',
    })

    expect(customer).toMatchObject({
      access_token: 'uatcustomer-access-token',
      user: { id: 2, role: 1 },
      session: { sid: 'uatcustomer-session' },
    })
    expect(admin).toMatchObject({
      access_token: 'uatadmin-access-token',
      user: { id: 3, role: 10 },
      session: { sid: 'uatadmin-session' },
    })
  })

  it('fails closed outside an explicit loopback development build', () => {
    expect(
      resolveCanvasManualUatBundle({ ...baseConfig, enabled: false })
    ).toBeNull()
    expect(
      resolveCanvasManualUatBundle({ ...baseConfig, development: false })
    ).toBeNull()
    expect(
      resolveCanvasManualUatBundle({
        ...baseConfig,
        hostname: 'uat.example.com',
      })
    ).toBeNull()
  })

  it('rejects a selected role when its real login bundle is absent', () => {
    expect(() =>
      resolveCanvasManualUatBundle({
        ...baseConfig,
        role: 'admin',
        adminBundle: '',
      })
    ).toThrow('Canvas manual UAT admin auth bundle is missing')
  })

  it('rejects a bundle whose server-issued role does not match the URL role', () => {
    expect(() =>
      resolveCanvasManualUatBundle({
        ...baseConfig,
        role: 'admin',
        adminBundle: encodedBundle(1, 2, 'uatcustomer'),
      })
    ).toThrow('Canvas manual UAT admin auth bundle is invalid')
  })

  it('keeps the selected role across Canvas route changes and reloads', () => {
    expect(resolveCanvasManualUatRole('admin', null)).toBe('admin')
    expect(resolveCanvasManualUatRole(null, 'admin')).toBe('admin')
    expect(resolveCanvasManualUatRole(null, null)).toBe('customer')
    expect(resolveCanvasManualUatRole('unexpected', 'unexpected')).toBe(
      'customer'
    )
  })
})

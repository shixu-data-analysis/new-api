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
import { describe, expect, it } from 'vitest'

import {
  loginCanvasManualUat,
  resolveCanvasManualUatEntryHref,
  resolveCanvasManualUatLogin,
  resolveCanvasManualUatRole,
} from '../manual-uat'

function encodedLogin(role: 1 | 10, username: string): string {
  return btoa(JSON.stringify({ username, password: 'test-password', role }))
}

const baseConfig = {
  enabled: true,
  development: true,
  hostname: '127.0.0.1',
  requestedRole: 'customer',
  customerLogin: encodedLogin(1, 'uatcustomer'),
  adminLogin: encodedLogin(10, 'uatadmin'),
  agentLogin: encodedLogin(1, 'uatagent'),
}

describe('Canvas manual UAT authentication', () => {
  it('binds customer and platform-administrator login to separate origins', () => {
    const customer = resolveCanvasManualUatLogin(baseConfig)
    const admin = resolveCanvasManualUatLogin({
      ...baseConfig,
      hostname: 'localhost',
      requestedRole: 'admin',
    })

    expect(customer).toMatchObject({
      role: 'customer',
      credentials: { username: 'uatcustomer', role: 1 },
    })
    expect(admin).toMatchObject({
      role: 'admin',
      credentials: { username: 'uatadmin', role: 10 },
    })
  })

  it('selects the inviter on the sequential customer-side origin', () => {
    const agent = resolveCanvasManualUatLogin({
      ...baseConfig,
      hostname: '127.0.0.1',
      requestedRole: 'agent',
    })
    expect(agent).toMatchObject({
      role: 'agent',
      credentials: { username: 'uatagent', role: 1 },
    })
  })

  it('fails closed outside an explicit loopback development build', () => {
    expect(
      resolveCanvasManualUatLogin({ ...baseConfig, enabled: false })
    ).toBeNull()
    expect(
      resolveCanvasManualUatLogin({ ...baseConfig, development: false })
    ).toBeNull()
    expect(
      resolveCanvasManualUatLogin({
        ...baseConfig,
        hostname: 'uat.example.com',
      })
    ).toBeNull()
  })

  it('rejects a role on the wrong loopback origin', () => {
    expect(() =>
      resolveCanvasManualUatLogin({
        ...baseConfig,
        requestedRole: 'admin',
      })
    ).toThrow('admin must use its dedicated loopback origin')
  })

  it('rejects login config whose declared role does not match the origin', () => {
    expect(() =>
      resolveCanvasManualUatLogin({
        ...baseConfig,
        customerLogin: encodedLogin(10, 'uatadmin'),
      })
    ).toThrow('Canvas manual UAT customer login config is invalid')
  })

  it('derives the role from the cookie-isolated hostname', () => {
    expect(resolveCanvasManualUatRole('127.0.0.1', null)).toBe('customer')
    expect(resolveCanvasManualUatRole('localhost', null)).toBe('admin')
    expect(() => resolveCanvasManualUatRole('::1', null)).toThrow(
      'requires an isolated loopback origin'
    )
  })

  it('maps each isolated root origin to its Canvas product home', () => {
    expect(resolveCanvasManualUatEntryHref('127.0.0.1', null)).toBe(
      '/canvas-cloud/overview?canvas-uat-role=customer'
    )
    expect(resolveCanvasManualUatEntryHref('localhost', null)).toBe(
      '/canvas-cloud/dashboard?canvas-uat-role=admin'
    )
    expect(resolveCanvasManualUatEntryHref('127.0.0.1', 'agent')).toBe(
      '/canvas-cloud/agent-center?canvas-uat-role=agent'
    )
    expect(() => resolveCanvasManualUatEntryHref('127.0.0.1', 'admin')).toThrow(
      'admin must use its dedicated loopback origin'
    )
  })

  it('accepts only a server-issued bundle matching the origin role', async () => {
    const bundle = {
      access_token: 'customer-access-token',
      token_type: 'Bearer',
      access_expires_at: 10_000,
      user: { id: 2, username: 'uatcustomer', role: 1, status: 1 },
      session: {
        sid: 'customer-session',
        current: true,
        login_method: 'password',
        ip: '127.0.0.1',
        user_agent: 'manual-uat',
        created_at: 1_000,
        last_active_at: 1_000,
        expires_at: 10_000,
      },
    }

    await expect(
      loginCanvasManualUat(
        { username: 'uatcustomer', password: 'test-password', role: 1 },
        'customer',
        async () => bundle
      )
    ).resolves.toMatchObject({ user: { role: 1 } })
    await expect(
      loginCanvasManualUat(
        { username: 'uatadmin', password: 'test-password', role: 10 },
        'admin',
        async () => bundle
      )
    ).rejects.toThrow('admin login returned an invalid bundle')
  })

  it('rejects a same-role bundle for a different configured customer', async () => {
    const bundle = {
      access_token: 'existing-customer-access-token',
      token_type: 'Bearer',
      access_expires_at: 10_000,
      user: { id: 2, username: 'uatcustomer', role: 1, status: 1 },
      session: {
        sid: 'existing-customer-session',
        current: true,
        login_method: 'password',
        ip: '127.0.0.1',
        user_agent: 'manual-uat',
        created_at: 1_000,
        last_active_at: 1_000,
        expires_at: 10_000,
      },
    }

    await expect(
      loginCanvasManualUat(
        { username: 'uatinvitee', password: 'test-password', role: 1 },
        'customer',
        async () => bundle
      )
    ).rejects.toThrow('customer login returned an invalid bundle')
  })
})

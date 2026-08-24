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
import { isAuthBundle, refreshAuthentication } from '@/lib/auth-session'
import { useAuthStore, type AuthBundle } from '@/stores/auth-store'

export type CanvasManualUatRole = 'customer' | 'admin'

interface CanvasManualUatConfig {
  enabled: boolean
  development: boolean
  hostname: string
  requestedRole: string | null
  customerLogin: string
  adminLogin: string
}

interface CanvasManualUatLogin {
  username: string
  password: string
  role: 1 | 10
}

type CanvasManualUatLoginRequest = (
  credentials: CanvasManualUatLogin
) => Promise<unknown>

const roleByHostname: Record<string, CanvasManualUatRole> = {
  '127.0.0.1': 'customer',
  localhost: 'admin',
}
const roleStorageKey = 'canvas-manual-uat-role'

function isCanvasManualUatRole(
  value: string | null
): value is CanvasManualUatRole {
  return value === 'customer' || value === 'admin'
}

export function isCanvasManualUatActive(): boolean {
  return (
    typeof window !== 'undefined' &&
    import.meta.env.VITE_CANVAS_MANUAL_UAT === '1' &&
    import.meta.env.DEV &&
    roleByHostname[window.location.hostname] !== undefined
  )
}

export function resolveCanvasManualUatRole(
  hostname: string,
  requestedRole: string | null
): CanvasManualUatRole {
  const role = roleByHostname[hostname]
  if (!role) {
    throw new Error('Canvas manual UAT requires an isolated loopback origin')
  }
  if (isCanvasManualUatRole(requestedRole) && requestedRole !== role) {
    throw new Error(
      `Canvas manual UAT ${requestedRole} must use its dedicated loopback origin`
    )
  }
  return role
}

function decodeBase64Url(value: string): unknown {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const bytes = Uint8Array.from(atob(normalized + padding), (character) =>
    character.charCodeAt(0)
  )
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function resolveCanvasManualUatLogin(
  config: CanvasManualUatConfig
): { credentials: CanvasManualUatLogin; role: CanvasManualUatRole } | null {
  if (
    !config.enabled ||
    !config.development ||
    roleByHostname[config.hostname] === undefined
  ) {
    return null
  }

  const role = resolveCanvasManualUatRole(config.hostname, config.requestedRole)
  const encodedLogin =
    role === 'admin' ? config.adminLogin : config.customerLogin
  if (!encodedLogin) {
    throw new Error(`Canvas manual UAT ${role} login config is missing`)
  }

  const expectedRole = role === 'admin' ? 10 : 1
  const candidate = decodeBase64Url(
    encodedLogin
  ) as Partial<CanvasManualUatLogin>
  if (
    typeof candidate.username !== 'string' ||
    candidate.username.length === 0 ||
    typeof candidate.password !== 'string' ||
    candidate.password.length === 0 ||
    candidate.role !== expectedRole
  ) {
    throw new Error(`Canvas manual UAT ${role} login config is invalid`)
  }
  return {
    credentials: candidate as CanvasManualUatLogin,
    role,
  }
}

async function requestCanvasManualUatLogin(
  credentials: CanvasManualUatLogin
): Promise<unknown> {
  const response = await fetch('/api/user/login?turnstile=', {
    method: 'POST',
    credentials: 'include',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
    }),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (
    !response.ok ||
    !payload ||
    typeof payload !== 'object' ||
    !('success' in payload) ||
    payload.success !== true ||
    !('data' in payload)
  ) {
    throw new Error(`Canvas manual UAT login failed (${response.status})`)
  }
  return payload.data
}

export async function loginCanvasManualUat(
  credentials: CanvasManualUatLogin,
  role: CanvasManualUatRole,
  request: CanvasManualUatLoginRequest = requestCanvasManualUatLogin
): Promise<AuthBundle> {
  const bundle = await request(credentials)
  const expectedRole = role === 'admin' ? 10 : 1
  if (!isAuthBundle(bundle) || bundle.user.role !== expectedRole) {
    throw new Error(
      `Canvas manual UAT ${role} login returned an invalid bundle`
    )
  }
  return bundle
}

function hasUsableRoleBundle(role: CanvasManualUatRole): boolean {
  const auth = useAuthStore.getState().auth
  const expectedRole = role === 'admin' ? 10 : 1
  return (
    auth.user?.role === expectedRole &&
    Boolean(auth.accessToken) &&
    Boolean(auth.session?.sid) &&
    (auth.accessExpiresAt ?? 0) > Math.floor(Date.now() / 1000) + 30
  )
}

export async function initializeCanvasManualUat(): Promise<void> {
  if (!isCanvasManualUatActive()) return
  const params = new URLSearchParams(window.location.search)
  const login = resolveCanvasManualUatLogin({
    enabled: import.meta.env.VITE_CANVAS_MANUAL_UAT === '1',
    development: import.meta.env.DEV,
    hostname: window.location.hostname,
    requestedRole: params.get('canvas-uat-role'),
    customerLogin:
      import.meta.env.VITE_CANVAS_MANUAL_UAT_CUSTOMER_LOGIN?.trim() || '',
    adminLogin:
      import.meta.env.VITE_CANVAS_MANUAL_UAT_ADMIN_LOGIN?.trim() || '',
  })
  if (!login) return

  window.sessionStorage.setItem(roleStorageKey, login.role)
  window.localStorage.setItem('setup_status_checked', 'true')
  if (hasUsableRoleBundle(login.role)) return

  const refreshed = await refreshAuthentication()
  if (
    refreshed.kind === 'authenticated' &&
    refreshed.bundle.user.role === login.credentials.role
  ) {
    return
  }

  const bundle = await loginCanvasManualUat(login.credentials, login.role)
  useAuthStore.getState().auth.setBundle(bundle)
}

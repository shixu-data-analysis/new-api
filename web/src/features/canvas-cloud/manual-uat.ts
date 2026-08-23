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
import { useAuthStore, type AuthBundle } from '@/stores/auth-store'

export type CanvasManualUatRole = 'customer' | 'admin'

interface CanvasManualUatConfig {
  enabled: boolean
  development: boolean
  hostname: string
  role: string | null
  customerBundle: string
  adminBundle: string
}

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '::1'])
const roleStorageKey = 'canvas-manual-uat-role'

function isCanvasManualUatRole(value: string | null): value is CanvasManualUatRole {
  return value === 'customer' || value === 'admin'
}

export function isCanvasManualUatActive(): boolean {
  return (
    typeof window !== 'undefined' &&
    import.meta.env.VITE_CANVAS_MANUAL_UAT === '1' &&
    import.meta.env.DEV &&
    loopbackHosts.has(window.location.hostname)
  )
}

export function resolveCanvasManualUatRole(
  requestedRole: string | null,
  storedRole: string | null
): CanvasManualUatRole {
  if (isCanvasManualUatRole(requestedRole)) return requestedRole
  if (isCanvasManualUatRole(storedRole)) return storedRole
  return 'customer'
}

export function resolveCanvasManualUatBundle(
  config: CanvasManualUatConfig
): AuthBundle | null {
  if (
    !config.enabled ||
    !config.development ||
    !loopbackHosts.has(config.hostname)
  ) {
    return null
  }

  const role: CanvasManualUatRole =
    config.role === 'admin' ? 'admin' : 'customer'
  const encodedBundle =
    role === 'admin' ? config.adminBundle : config.customerBundle
  if (!encodedBundle) {
    throw new Error(`Canvas manual UAT ${role} auth bundle is missing`)
  }

  const normalized = encodedBundle.replaceAll('-', '+').replaceAll('_', '/')
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
  const bytes = Uint8Array.from(atob(normalized + padding), (character) =>
    character.charCodeAt(0)
  )
  const bundle: unknown = JSON.parse(new TextDecoder().decode(bytes))
  if (!bundle || typeof bundle !== 'object') {
    throw new Error(`Canvas manual UAT ${role} auth bundle is invalid`)
  }
  const candidate = bundle as Partial<AuthBundle>
  const expectedRole = role === 'admin' ? 10 : 1
  if (
    !candidate.access_token ||
    candidate.token_type !== 'Bearer' ||
    !candidate.access_expires_at ||
    candidate.user?.role !== expectedRole ||
    !candidate.session?.sid
  ) {
    throw new Error(`Canvas manual UAT ${role} auth bundle is invalid`)
  }
  return candidate as AuthBundle
}

export function initializeCanvasManualUat(): void {
  if (!isCanvasManualUatActive()) return
  const params = new URLSearchParams(window.location.search)
  const requestedRole = params.get('canvas-uat-role')
  const role = resolveCanvasManualUatRole(
    requestedRole,
    window.sessionStorage.getItem(roleStorageKey)
  )
  const bundle = resolveCanvasManualUatBundle({
    enabled: import.meta.env.VITE_CANVAS_MANUAL_UAT === '1',
    development: import.meta.env.DEV,
    hostname: window.location.hostname,
    role,
    customerBundle:
      import.meta.env.VITE_CANVAS_MANUAL_UAT_CUSTOMER_BUNDLE?.trim() || '',
    adminBundle:
      import.meta.env.VITE_CANVAS_MANUAL_UAT_ADMIN_BUNDLE?.trim() || '',
  })
  if (!bundle) return

  window.sessionStorage.setItem(roleStorageKey, role)
  window.localStorage.setItem('setup_status_checked', 'true')
  useAuthStore.getState().auth.setBundle(bundle)
}

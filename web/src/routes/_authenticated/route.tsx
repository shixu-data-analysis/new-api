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
import { createFileRoute, redirect } from '@tanstack/react-router'

import { AuthenticatedLayout } from '@/components/layout'
import {
  canCanvasPrincipalAccessPath,
  getCanvasHomeSection,
  isCanvasDefaultLandingPath,
} from '@/features/canvas-cloud/access'
import {
  getCanvasSessionFailureRoute,
  getCanvasSession,
  isCanvasInviteRegistrationRequired,
} from '@/features/canvas-cloud/api'
import { isCanvasRootUserManagementPath } from '@/features/users/lib/canvas-root-user-management'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const { auth } = useAuthStore.getState()

    if (!auth.user || !auth.accessToken) {
      throw redirect({
        to: '/sign-in',
        search: { redirect: location.href },
      })
    }

    if (location.pathname === '/403' || location.pathname === '/503') return

    const isAccountPath =
      location.pathname === '/profile' ||
      location.pathname.startsWith('/profile/')
    if (isAccountPath) return

    const isCanvasPath = location.pathname.startsWith('/canvas-cloud/')
    if (auth.user.role === ROLE.USER && !isCanvasPath) {
      throw redirect({
        to: '/canvas-cloud/$section',
        params: { section: 'points' },
        replace: true,
      })
    }

    const isRootUserManagementPath = isCanvasRootUserManagementPath(
      location.pathname,
      auth.user.role
    )
    if (isRootUserManagementPath) return

    const isDefaultLandingPath = isCanvasDefaultLandingPath(location.pathname)
    if (!isCanvasPath && !isDefaultLandingPath) return

    let canvasSession
    try {
      canvasSession = await getCanvasSession()
    } catch (error) {
      if (isCanvasInviteRegistrationRequired(error)) {
        if (!isCanvasPath) return
        if (!canCanvasPrincipalAccessPath(location.pathname)) {
          throw redirect({ to: '/403' })
        }
        canvasSession = null
      } else {
        const failureRoute = getCanvasSessionFailureRoute(error)
        if (!isCanvasPath) return
        throw redirect({ to: failureRoute })
      }
    }
    if (canvasSession) {
      if (isDefaultLandingPath) {
        throw redirect({
          to: '/canvas-cloud/$section',
          params: {
            section: getCanvasHomeSection(canvasSession.principalType),
          },
          search: location.search,
          replace: true,
        })
      }
      if (!canCanvasPrincipalAccessPath(location.pathname)) {
        throw redirect({ to: '/403' })
      }
      return
    }

    if (auth.user.role === ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: AuthenticatedLayout,
})

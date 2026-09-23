/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'

import {
  isCanvasRootProfilePath,
  isCanvasRootUserManagementPath,
} from '@/features/users/lib/canvas-root-user-management'
import { useAuthStore } from '@/stores/auth-store'

import { getCanvasSession } from './api'

export const canvasSessionQueryKey = ['canvas-cloud', 'session'] as const

export function useCanvasSession(enabled = true) {
  return useQuery({
    queryKey: canvasSessionQueryKey,
    queryFn: getCanvasSession,
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCanvasShellSession() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const role = useAuthStore((state) => state.auth.user?.role)
  const isCanvasRootUserManagement = isCanvasRootUserManagementPath(
    pathname,
    role
  )
  const isCanvasRootProfile = isCanvasRootProfilePath(pathname, role)
  const canvasSession = useCanvasSession()
  const isCanvasStandaloneShell =
    (isCanvasRootUserManagement || isCanvasRootProfile) &&
    !canvasSession.isSuccess

  return {
    canvasSession,
    isCanvasRootUserManagement,
    isCanvasStandaloneShell,
    isCanvasShell:
      isCanvasStandaloneShell ||
      canvasSession.isSuccess ||
      pathname.startsWith('/canvas-cloud/'),
  }
}

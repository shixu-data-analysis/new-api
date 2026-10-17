/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createFileRoute } from '@tanstack/react-router'

import { isCanvasAdministrator } from '@/features/canvas-cloud/access'
import { getCanvasSession } from '@/features/canvas-cloud/api'
import { CanvasRouteError } from '@/features/canvas-cloud/components/CanvasRouteStates'
import { ModelManagementLayout } from '@/features/canvas-cloud/components/ModelManagementLayout'
import {
  denyCanvasRoute,
  rejectCanvasRoute,
} from '@/features/canvas-cloud/session-failure'
import type { CanvasSession } from '@/features/canvas-cloud/types'

export const Route = createFileRoute(
  '/_authenticated/canvas-cloud/model-management'
)({
  beforeLoad: async () => {
    let session: CanvasSession
    try {
      session = await getCanvasSession()
    } catch (error) {
      rejectCanvasRoute(error)
    }
    if (!isCanvasAdministrator(session.principalType)) denyCanvasRoute()
  },
  errorComponent: CanvasRouteError,
  component: ModelManagementLayout,
})

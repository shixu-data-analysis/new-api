/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createFileRoute, redirect } from '@tanstack/react-router'

import { isCanvasAdministrator } from '@/features/canvas-cloud/access'
import { getCanvasSession } from '@/features/canvas-cloud/api'
import { ModelManagementLayout } from '@/features/canvas-cloud/components/ModelManagementLayout'

export const Route = createFileRoute(
  '/_authenticated/canvas-cloud/model-management'
)({
  beforeLoad: async () => {
    try {
      const session = await getCanvasSession()
      if (isCanvasAdministrator(session.principalType)) return
    } catch {
      // The route has the same deny-on-unavailable behavior as Canvas sections.
    }
    throw redirect({ to: '/403' })
  },
  component: ModelManagementLayout,
})
